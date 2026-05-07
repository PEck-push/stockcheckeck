/**
 * Client-seitige Scoring-Hilfsfunktionen
 * Die eigentliche Berechnung läuft in der Netlify Function.
 * Diese Datei enthält UI-Logik rund um Scores und Signale.
 */

export const SIGNAL_CONFIG = {
  STRONG_BUY: { label: 'STRONG BUY', color: '#00ff88', bg: 'rgba(0,255,136,0.12)', icon: '⚡', priority: 4 },
  BUY:        { label: 'BUY',        color: '#10b981', bg: 'rgba(16,185,129,0.1)',  icon: '▲', priority: 3 },
  NEUTRAL:    { label: 'NEUTRAL',    color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', icon: '─', priority: 2 },
  SELL:       { label: 'SELL',       color: '#f43f5e', bg: 'rgba(244,63,94,0.1)',   icon: '▼', priority: 1 },
};

export const SECTORS = {
  SP500_TECH:       { label: 'Technologie',       color: '#00d4ff', bg: 'rgba(0,212,255,0.08)' },
  SP500_FINANCE:    { label: 'Finanzen',           color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
  SP500_HEALTH:     { label: 'Healthcare',         color: '#a78bfa', bg: 'rgba(167,139,250,0.08)' },
  SP500_ENERGY:     { label: 'Energie & Cleantech',color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  SP500_CONSUMER:   { label: 'Konsum & Retail',    color: '#f97316', bg: 'rgba(249,115,22,0.08)' },
  SP500_INDUSTRIAL: { label: 'Industrie & Rüstung',color: '#64748b', bg: 'rgba(100,116,139,0.08)' },
  NASDAQ_GROWTH:    { label: 'NASDAQ High-Growth', color: '#e879f9', bg: 'rgba(232,121,249,0.08)' },
  RUSSELL_SMALLCAP: { label: 'Russell 2000 SmallCap', color: '#fb923c', bg: 'rgba(251,146,60,0.08)' },
  CHINA_ADR:        { label: 'China ADRs',         color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
  CRYPTO_STOCKS:    { label: 'Crypto-Stocks',      color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  LEVERAGED_ETFS:   { label: 'Gehebelte ETFs',     color: '#22d3ee', bg: 'rgba(34,211,238,0.08)' },
};

// Watchlist: localStorage-Persistierung
export const watchlistStorage = {
  get: () => {
    try { return JSON.parse(localStorage.getItem('watchlist') || '[]'); }
    catch { return []; }
  },
  set: (tickers) => {
    localStorage.setItem('watchlist', JSON.stringify(tickers));
  },
  toggle: (ticker) => {
    const list = watchlistStorage.get();
    const next = list.includes(ticker) ? list.filter(t => t !== ticker) : [...list, ticker];
    watchlistStorage.set(next);
    return next;
  },
};

// Formatierung
export const fmt = {
  price:   (v) => v != null ? `$${v.toFixed(2)}` : '—',
  change:  (v) => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '—',
  volume:  (v) => {
    if (v == null) return '—';
    if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    return `${(v / 1e3).toFixed(0)}K`;
  },
  ratio:   (v) => v != null ? `${v.toFixed(1)}x` : '—',
  score:   (v) => v != null ? Math.round(v) : 0,
};

// Plus500-Direktlink (Suche öffnet die Plattform)
export const plus500Link = (ticker) =>
  `https://www.plus500.com/en/Instruments/${encodeURIComponent(ticker)}`;
