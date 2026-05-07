/**
 * Netlify Function: /api/quotes
 * Datenquelle: Twelve Data (https://twelvedata.com) – Free Tier
 * API-Key: TWELVE_DATA_API_KEY in Netlify → Site settings → Environment variables
 *
 * Free Tier: 800 Requests/Tag, 8/Minute
 * Batch-Queries: bis zu 50 Ticker pro Call → ~9 Calls für alle 247 Ticker
 */

const BASE = 'https://api.twelvedata.com';

// ─── Cache (In-Memory, 15 Min) ────────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000;

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}
function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

// ─── Momentum Score ───────────────────────────────────────────────────────────
function calculateMomentumScore(q) {
  let score = 0;

  const price    = parseFloat(q.close)            || 0;
  const change   = parseFloat(q.percent_change)   || 0;
  const volume   = parseInt(q.volume)             || 0;
  const avgVol   = parseInt(q.average_volume)     || 0;
  const high52   = parseFloat(q.fifty_two_week?.high) || 0;
  const low52    = parseFloat(q.fifty_two_week?.low)  || 0;

  // 1. Preistrend (via Change% als EMA-Proxy, 0–25)
  if (change > 5)       score += 25;
  else if (change > 0)  score += 18;
  else if (change > -3) score += 10;

  // 2. Tagesveränderung (0–20)
  if (change > 7)      score += 20;
  else if (change > 4) score += 16;
  else if (change > 2) score += 12;
  else if (change > 0) score += 6;

  // 3. Volumen-Ratio (0–20)
  if (volume > 0 && avgVol > 0) {
    const ratio = volume / avgVol;
    if (ratio >= 3.0)      score += 20;
    else if (ratio >= 2.0) score += 16;
    else if (ratio >= 1.5) score += 12;
    else if (ratio >= 1.0) score += 6;
  } else {
    score += 6; // Neutral-Default wenn kein Ø-Volumen
  }

  // 4. Position im 52-Wochen-Bereich (0–20)
  if (price > 0 && high52 > low52) {
    const pos = (price - low52) / (high52 - low52) * 100;
    if (pos >= 85)      score += 20;
    else if (pos >= 70) score += 15;
    else if (pos >= 50) score += 8;
    else if (pos >= 30) score += 3;
  } else {
    score += 8; // Neutral-Default
  }

  // RSI nicht verfügbar in Basic Quote → kein Beitrag
  return Math.min(100, score);
}

function scoreToSignal(score) {
  if (score >= 75) return 'STRONG_BUY';
  if (score >= 55) return 'BUY';
  if (score >= 35) return 'NEUTRAL';
  return 'SELL';
}

// ─── Hauptfunktion ────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=900',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const API_KEY = process.env.TWELVE_DATA_API_KEY;
  if (!API_KEY) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        error: 'TWELVE_DATA_API_KEY nicht gesetzt',
        hint: 'Gratis API-Key unter twelvedata.com → Netlify: Site settings → Environment variables → TWELVE_DATA_API_KEY',
      }),
    };
  }

  const params = event.queryStringParameters || {};
  const tickersRaw = params.tickers || '';
  if (!tickersRaw) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'tickers parameter required' }) };
  }

  const tickers = tickersRaw.split(',').map(t => t.trim().toUpperCase()).slice(0, 50);

  // Cache-Check (Key = sortierte Ticker-Liste)
  const cacheKey = `td_${tickers.slice().sort().join(',')}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return { statusCode: 200, headers, body: JSON.stringify({ data: cached, timestamp: new Date().toISOString(), count: cached.length }) };
  }

  try {
    const url = `${BASE}/quote?symbol=${tickers.join(',')}&apikey=${API_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (res.status === 429) {
      return { statusCode: 429, headers, body: JSON.stringify({ error: 'Twelve Data Rate Limit erreicht (8 req/min)' }) };
    }
    if (!res.ok) {
      throw new Error(`Twelve Data HTTP ${res.status}`);
    }

    const raw = await res.json();

    // Bei einem einzelnen Ticker gibt Twelve Data direkt das Objekt zurück,
    // bei mehreren ein Objekt mit Ticker-Keys
    const quotesMap = tickers.length === 1 ? { [tickers[0]]: raw } : raw;

    const results = tickers.map(ticker => {
      const q = quotesMap[ticker];

      if (!q || q.status === 'error' || !q.close) {
        return { ticker, name: ticker, error: true, score: 0, signal: 'NEUTRAL', price: null, change: 0, volumeRatio: 1 };
      }

      const price     = parseFloat(q.close)                     || 0;
      const change    = parseFloat(q.percent_change || 0);
      const volume    = parseInt(q.volume || 0);
      const avgVol    = parseInt(q.average_volume || 0);
      const week52H   = parseFloat(q.fifty_two_week?.high || 0);
      const week52L   = parseFloat(q.fifty_two_week?.low  || 0);
      const volRatio  = avgVol > 0 ? parseFloat((volume / avgVol).toFixed(2)) : 1.0;
      const score     = calculateMomentumScore(q);

      return {
        ticker,
        name:         q.name || ticker,
        price,
        change:       parseFloat(change.toFixed(2)),
        volume,
        volumeRatio:  volRatio,
        fiftyDayAvg:  null,
        week52High:   week52H || null,
        week52Low:    week52L || null,
        marketCap:    null,
        score,
        signal:       scoreToSignal(score),
        rsi:          null,
      };
    });

    setCache(cacheKey, results);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data: results, timestamp: new Date().toISOString(), count: results.length }),
    };

  } catch (err) {
    console.error('Twelve Data error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
