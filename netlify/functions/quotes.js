/**
 * Netlify Function: /api/quotes
 * Proxy zu Yahoo Finance – vermeidet CORS im Browser
 * 
 * GET /api/quotes?tickers=AAPL,MSFT,NVDA&batch=true
 * GET /api/quotes?tickers=AAPL&detail=true  (inkl. RSI / historische Daten)
 */

const yahooFinance = require('yahoo-finance2').default;

// ─── Cache (In-Memory, gilt pro Function-Instanz ~15 Min) ───────────────────
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 Minuten

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}
function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

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

// ─── EMA Berechnung ─────────────────────────────────────────────────────────
function calculateEMA(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

// ─── Momentum Score (0–100) ──────────────────────────────────────────────────
function calculateMomentumScore(quote, technical = null) {
  let score = 0;

  // 1. Preis vs. gleitende Durchschnitte (0–25 Punkte)
  const price = quote.regularMarketPrice;
  if (price && quote.fiftyDayAverage) {
    const vs50 = (price / quote.fiftyDayAverage - 1) * 100;
    if (vs50 > 5) score += 25;
    else if (vs50 > 0) score += 18;
    else if (vs50 > -3) score += 10;
    // < -3%: 0 Punkte
  }

  // 2. Wöchentliche Kursveränderung (0–20 Punkte)
  const change1w = quote.regularMarketChangePercent || 0;
  if (change1w > 7) score += 20;
  else if (change1w > 4) score += 16;
  else if (change1w > 2) score += 12;
  else if (change1w > 0) score += 6;
  // Negativ: 0 Punkte

  // 3. Volumen-Ratio vs. 3M-Durchschnitt (0–20 Punkte)
  const vol = quote.regularMarketVolume;
  const avgVol = quote.averageDailyVolume3Month;
  if (vol && avgVol && avgVol > 0) {
    const ratio = vol / avgVol;
    if (ratio >= 3.0) score += 20;
    else if (ratio >= 2.0) score += 16;
    else if (ratio >= 1.5) score += 12;
    else if (ratio >= 1.0) score += 6;
  }

  // 4. Position im 52-Wochen-Bereich (0–20 Punkte)
  const low52 = quote.fiftyTwoWeekLow;
  const high52 = quote.fiftyTwoWeekHigh;
  if (price && low52 && high52 && high52 > low52) {
    const position = (price - low52) / (high52 - low52) * 100;
    if (position >= 85) score += 20;
    else if (position >= 70) score += 15;
    else if (position >= 50) score += 8;
    else if (position >= 30) score += 3;
  }

  // 5. RSI aus historischen Daten (0–15 Punkte, optional)
  if (technical?.rsi) {
    const rsi = technical.rsi;
    if (rsi >= 55 && rsi <= 72) score += 15;  // Bullisches Momentum-Fenster
    else if (rsi > 72 && rsi <= 80) score += 8; // Überkauft aber noch laufend
    else if (rsi >= 45 && rsi < 55) score += 4;
    // Unter 45 oder über 80: 0 Punkte
  }

  return Math.min(100, score);
}

// ─── Signal aus Score ────────────────────────────────────────────────────────
function scoreToSignal(score) {
  if (score >= 75) return 'STRONG_BUY';
  if (score >= 55) return 'BUY';
  if (score >= 35) return 'NEUTRAL';
  return 'SELL';
}

// ─── Hauptfunktion ───────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=900', // 15 Min CDN Cache
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const params = event.queryStringParameters || {};
  const tickersRaw = params.tickers || '';
  const detail = params.detail === 'true';

  if (!tickersRaw) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'tickers parameter required' }) };
  }

  const tickers = tickersRaw.split(',').map(t => t.trim().toUpperCase()).slice(0, 50); // Max 50 pro Call

  try {
    const results = [];

    if (detail && tickers.length === 1) {
      // ── Detailmodus: RSI + EMA aus Kursverlauf ─────────────────────────
      const ticker = tickers[0];
      const cacheKey = `detail_${ticker}`;
      let data = getCached(cacheKey);

      if (!data) {
        const [quote, chart] = await Promise.all([
          yahooFinance.quote(ticker),
          yahooFinance.chart(ticker, {
            period1: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 Tage
            interval: '1d',
          }),
        ]);

        const closes = chart.quotes
          .filter(q => q.close !== null)
          .map(q => q.close);

        const sparkline = chart.quotes.slice(-20).map(q => ({ v: q.close, t: q.date }));

        const technical = {
          rsi: calculateRSI(closes),
          ema20: calculateEMA(closes, 20),
          ema50: calculateEMA(closes, 50),
          ema200: calculateEMA(closes, 200),
        };

        const score = calculateMomentumScore(quote, technical);

        data = {
          ticker,
          price: quote.regularMarketPrice,
          change: quote.regularMarketChangePercent,
          volume: quote.regularMarketVolume,
          volumeRatio: quote.averageDailyVolume3Month
            ? (quote.regularMarketVolume / quote.averageDailyVolume3Month).toFixed(2)
            : null,
          marketCap: quote.marketCap,
          fiftyDayAvg: quote.fiftyDayAverage,
          twoHundredDayAvg: quote.twoHundredDayAverage,
          week52High: quote.fiftyTwoWeekHigh,
          week52Low: quote.fiftyTwoWeekLow,
          technical,
          sparkline,
          score,
          signal: scoreToSignal(score),
          name: quote.shortName || quote.longName || ticker,
        };
        setCache(cacheKey, data);
      }
      results.push(data);

    } else {
      // ── Batch-Modus: Schnelle Quotes für viele Ticker ──────────────────
      const BATCH_SIZE = 20;
      for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        const batch = tickers.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(
          batch.map(async (ticker) => {
            const cacheKey = `quote_${ticker}`;
            let data = getCached(cacheKey);
            if (data) return data;

            const quote = await yahooFinance.quote(ticker, {
              fields: [
                'regularMarketPrice', 'regularMarketChangePercent', 'regularMarketVolume',
                'averageDailyVolume3Month', 'averageDailyVolume10Day',
                'fiftyDayAverage', 'twoHundredDayAverage',
                'fiftyTwoWeekHigh', 'fiftyTwoWeekLow',
                'marketCap', 'shortName', 'regularMarketDayHigh', 'regularMarketDayLow',
                'trailingPE', 'forwardPE',
              ]
            });

            const score = calculateMomentumScore(quote);
            data = {
              ticker,
              name: quote.shortName || ticker,
              price: quote.regularMarketPrice,
              change: parseFloat((quote.regularMarketChangePercent || 0).toFixed(2)),
              volume: quote.regularMarketVolume,
              volumeRatio: quote.averageDailyVolume3Month
                ? parseFloat((quote.regularMarketVolume / quote.averageDailyVolume3Month).toFixed(2))
                : 1.0,
              fiftyDayAvg: quote.fiftyDayAverage,
              twoHundredDayAvg: quote.twoHundredDayAverage,
              week52High: quote.fiftyTwoWeekHigh,
              week52Low: quote.fiftyTwoWeekLow,
              marketCap: quote.marketCap,
              score,
              signal: scoreToSignal(score),
              rsi: null, // Wird per Detail-Call nachgeladen
            };
            setCache(cacheKey, data);
            return data;
          })
        );

        batchResults.forEach((r, idx) => {
          if (r.status === 'fulfilled') {
            results.push(r.value);
          } else {
            results.push({ ticker: batch[idx], error: true, score: 0, signal: 'NEUTRAL' });
          }
        });
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        data: results,
        timestamp: new Date().toISOString(),
        count: results.length,
      }),
    };

  } catch (err) {
    console.error('quotes function error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
