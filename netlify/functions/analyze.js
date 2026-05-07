/**
 * Netlify Function: /api/analyze
 * KI-gestützte Momentum-Analyse via Anthropic Claude Haiku 4.5
 *
 * POST /api/analyze
 * Body: { ticker, name, price, change, score, signal, volumeRatio,
 *         fiftyDayAvg, week52High, week52Low, rsi, sector }
 *
 * Kosten: ~$0.002 pro Analyse (Haiku 4.5)
 * Bei 10 Analysen/Tag = ~$0.02/Tag = ~$0.60/Monat
 */

const Anthropic = require("@anthropic-ai/sdk");

// ─── In-Memory Cache (vermeidet doppelte API-Calls für gleiche Aktie) ────────
const analysisCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 Stunde

function getCached(key) {
  const entry = analysisCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { analysisCache.delete(key); return null; }
  return entry.data;
}
function setCache(key, data) {
  analysisCache.set(key, { data, ts: Date.now() });
}

// ─── Prompt Builder ──────────────────────────────────────────────────────────
function buildPrompt(stock) {
  const {
    ticker, name, price, change, score, signal,
    volumeRatio, fiftyDayAvg, week52High, week52Low,
    rsi, sector, sub
  } = stock;

  const week52Pos = week52High && week52Low
    ? Math.round((price - week52Low) / (week52High - week52Low) * 100)
    : null;

  const vsEma50 = fiftyDayAvg
    ? ((price / fiftyDayAvg - 1) * 100).toFixed(1)
    : null;

  return `Du bist ein erfahrener Momentum-Trader der auf kurzfristige CFD-Trades auf Plus500 spezialisiert ist.
Analysiere folgende Aktie für einen österreichischen Retail-Investor mit €500–€2.000 Kapitaleinsatz und max. 1:5 CFD-Hebel.

AKTIE: ${ticker} (${name})
Sektor: ${sector || 'N/A'} | Sub-Sektor: ${sub || 'N/A'}
Aktueller Kurs: $${price}
Tagesveränderung: ${change >= 0 ? '+' : ''}${change?.toFixed(2)}%
Momentum-Score: ${score}/100 → Signal: ${signal}
Volumen-Ratio: ${volumeRatio}x (vs. 3M-Durchschnitt)
RSI (14): ${rsi || 'nicht verfügbar'}
EMA50-Abstand: ${vsEma50 !== null ? vsEma50 + '%' : 'N/A'}
52W-Position: ${week52Pos !== null ? week52Pos + '%' : 'N/A'} (0%=52W-Tief, 100%=52W-Hoch)
52W-Hoch: $${week52High} | 52W-Tief: $${week52Low}

Erstelle eine präzise, kompakte Analyse in diesem EXAKTEN JSON-Format (kein Markdown, nur JSON):
{
  "momentum_grund": "2-3 Sätze: Was treibt das aktuelle Momentum? Konkrete Faktoren nennen.",
  "staerken": ["max. 3 konkrete Stärken als kurze Stichpunkte"],
  "risiken": ["max. 2 konkrete Risiken als kurze Stichpunkte"],
  "plus500_einstieg": "Konkreter Satz: Einstiegs-Überlegung für Plus500 CFD (z.B. Pullback abwarten oder Market-Order, Niveau nennen)",
  "stop_loss_idee": "Kurzer Hinweis wo ein logischer Stop-Loss liegt (technisches Niveau oder %-Wert)",
  "zeitfenster": "Einschätzung: 1-3 Tage / 1 Woche / 2 Wochen",
  "hebel_empfehlung": "1:2 / 1:3 / 1:5 mit kurzer Begründung (1-2 Worte)",
  "fazit": "1 prägnanter Satz: Kernaussage für den Trade"
}`;
}

// ─── Hauptfunktion ───────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        error: "ANTHROPIC_API_KEY nicht gesetzt",
        hint: "In Netlify: Site settings → Environment variables → ANTHROPIC_API_KEY hinzufügen"
      })
    };
  }

  let stock;
  try {
    stock = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  if (!stock?.ticker) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "ticker required" }) };
  }

  // Cache-Check
  const cacheKey = `analyze_${stock.ticker}_${Math.floor(Date.now() / CACHE_TTL)}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return { statusCode: 200, headers, body: JSON.stringify({ ...cached, cached: true }) };
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001", // Günstigstes Modell: ~$0.002/Analyse
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: buildPrompt(stock),
        },
      ],
    });

    const rawText = message.content[0]?.text || "";

    // JSON aus Antwort extrahieren
    let analysis;
    try {
      // Bereinigen: manchmal umschließt das Modell JSON mit Backticks
      const cleaned = rawText.replace(/```json\n?|\n?```/g, "").trim();
      analysis = JSON.parse(cleaned);
    } catch {
      // Fallback: strukturierter Fehler
      analysis = {
        momentum_grund: rawText.substring(0, 200),
        staerken: ["Analyse konnte nicht vollständig geparst werden"],
        risiken: ["Bitte erneut versuchen"],
        plus500_einstieg: "Manuelle Analyse empfohlen",
        stop_loss_idee: "Manuell setzen",
        zeitfenster: "Unbekannt",
        hebel_empfehlung: "1:2 (konservativ)",
        fazit: "Rohdaten verfügbar, Struktur fehlgeschlagen",
      };
    }

    const result = {
      ticker: stock.ticker,
      analysis,
      model: "claude-haiku-4-5",
      tokens_used: message.usage?.input_tokens + message.usage?.output_tokens,
      cost_usd: ((message.usage?.input_tokens || 0) / 1e6 * 1.0 +
                 (message.usage?.output_tokens || 0) / 1e6 * 5.0).toFixed(5),
      timestamp: new Date().toISOString(),
    };

    setCache(cacheKey, result);

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    console.error("Anthropic API error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: err.message,
        hint: err.status === 401
          ? "API Key ungültig – in Netlify Environment Variables prüfen"
          : "Anthropic API Fehler"
      }),
    };
  }
};
