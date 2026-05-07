/**
 * Netlify Function: /api/quotes
 * MOCK-MODUS – Yahoo Finance API derzeit nicht verfügbar (Cookie-Auth-Problem).
 * Gibt realistische Zufallsdaten zurück, damit das UI vollständig getestet werden kann.
 */

// ─── RSI Berechnung (14 Perioden) ───────────────────────────────────────────
function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - (100 / (1 + rs)));
}

// ─── Momentum Score (0–100) ──────────────────────────────────────────────────
function calculateMomentumScore(change, volumeRatio, week52Pos, rsi) {
  let score = 0;

  // vs. EMA50 (simuliert über change)
  if (change > 5) score += 25;
  else if (change > 0) score += 18;
  else if (change > -3) score += 10;

  // Wöchentliche Änderung
  if (change > 7) score += 20;
  else if (change > 4) score += 16;
  else if (change > 2) score += 12;
  else if (change > 0) score += 6;

  // Volumen-Ratio
  if (volumeRatio >= 3.0) score += 20;
  else if (volumeRatio >= 2.0) score += 16;
  else if (volumeRatio >= 1.5) score += 12;
  else if (volumeRatio >= 1.0) score += 6;

  // 52W Position
  if (week52Pos >= 85) score += 20;
  else if (week52Pos >= 70) score += 15;
  else if (week52Pos >= 50) score += 8;
  else if (week52Pos >= 30) score += 3;

  // RSI
  if (rsi >= 55 && rsi <= 72) score += 15;
  else if (rsi > 72 && rsi <= 80) score += 8;
  else if (rsi >= 45 && rsi < 55) score += 4;

  return Math.min(100, score);
}

function scoreToSignal(score) {
  if (score >= 75) return 'STRONG_BUY';
  if (score >= 55) return 'BUY';
  if (score >= 35) return 'NEUTRAL';
  return 'SELL';
}

// Deterministischer Pseudozufall aus Ticker-String (damit Werte stabil bleiben)
function seededRandom(seed, min, max) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  const norm = ((h >>> 0) % 10000) / 10000;
  return min + norm * (max - min);
}

function generateMockQuote(ticker) {
  const price = parseFloat(seededRandom(ticker, 10, 800).toFixed(2));
  const change = parseFloat((seededRandom(ticker + 'c', -8, 12)).toFixed(2));
  const volumeRatio = parseFloat((seededRandom(ticker + 'v', 0.5, 4.0)).toFixed(2));
  const week52Pos = parseFloat((seededRandom(ticker + 'w', 10, 100)).toFixed(0));
  const rsi = Math.round(seededRandom(ticker + 'r', 25, 85));
  const score = calculateMomentumScore(change, volumeRatio, week52Pos, rsi);

  const week52Low = parseFloat((price * (1 - seededRandom(ticker + 'l', 0.15, 0.45))).toFixed(2));
  const week52High = parseFloat((price * (1 + seededRandom(ticker + 'h', 0.05, 0.40))).toFixed(2));
  const fiftyDayAvg = parseFloat((price * (1 + seededRandom(ticker + 'e', -0.10, 0.10))).toFixed(2));
  const marketCap = Math.round(seededRandom(ticker + 'm', 1e9, 3e12));

  return {
    ticker,
    name: ticker,
    price,
    change,
    volume: Math.round(seededRandom(ticker + 'vol', 500000, 50000000)),
    volumeRatio,
    fiftyDayAvg,
    twoHundredDayAvg: parseFloat((price * (1 + seededRandom(ticker + 'e2', -0.15, 0.15))).toFixed(2)),
    week52High,
    week52Low,
    marketCap,
    score,
    signal: scoreToSignal(score),
    rsi,
    _mock: true,
  };
}

// ─── Hauptfunktion ───────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=900',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const params = event.queryStringParameters || {};
  const tickersRaw = params.tickers || '';

  if (!tickersRaw) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'tickers parameter required' }) };
  }

  const tickers = tickersRaw.split(',').map(t => t.trim().toUpperCase()).slice(0, 50);
  const results = tickers.map(generateMockQuote);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      data: results,
      timestamp: new Date().toISOString(),
      count: results.length,
      _mockMode: true,
    }),
  };
};
