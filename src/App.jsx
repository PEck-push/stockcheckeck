import { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity, TrendingUp, TrendingDown, RefreshCw, Star,
  ChevronDown, ChevronUp, Zap, BarChart2, ExternalLink,
  Search, Brain, AlertTriangle, Clock, Shield, Loader, X
} from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import universeData from "./data/universe.json";
import { SIGNAL_CONFIG, SECTORS, watchlistStorage, fmt, plus500Link } from "./utils/scoring.js";

const BATCH_SIZE = 30;

function buildTickerMap() {
  const map = {};
  Object.entries(universeData.segments).forEach(([segKey, seg]) => {
    seg.tickers.forEach(t => {
      map[t.t] = { segment: segKey, name: t.n, sub: t.sub || t.sub_sector || "", cap: t.cap };
    });
  });
  return map;
}
const TICKER_MAP = buildTickerMap();

function genSparkline(change) {
  const pts = []; let v = 100;
  const trend = (change || 0) / 100;
  for (let i = 0; i < 20; i++) {
    v = v * (1 + (Math.random() - 0.48) * 0.025 + trend * 0.004);
    pts.push({ v: parseFloat(v.toFixed(2)) });
  }
  return pts;
}

async function fetchQuotes(tickers) {
  const res = await fetch(`/api/quotes?tickers=${tickers.join(",")}`);
  if (!res.ok) throw new Error(`API Error ${res.status}`);
  return res.json();
}

async function fetchAnalysis(stock) {
  const meta = TICKER_MAP[stock.ticker] || {};
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...stock, sector: SECTORS[meta.segment]?.label, sub: meta.sub }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.hint || err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── KOMPONENTEN ─────────────────────────────────────────────────────────────

function Sparkline({ data, color }) {
  return (
    <ResponsiveContainer width={80} height={28}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ScoreRing({ value, size = 32 }) {
  const v = Math.round(value || 0);
  const color = v >= 75 ? "#00ff88" : v >= 55 ? "#10b981" : v >= 35 ? "#94a3b8" : "#f43f5e";
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.28, fontWeight: 700, color, background: `${color}15`, fontFamily: "monospace", flexShrink: 0 }}>
      {v}
    </div>
  );
}

function RSIBar({ value }) {
  if (!value) return <span style={{ color: "#334155", fontSize: 11, fontFamily: "monospace" }}>—</span>;
  const color = value >= 70 ? "#f59e0b" : value >= 55 ? "#00ff88" : value <= 30 ? "#f43f5e" : "#64748b";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 44, height: 4, background: "#1e293b", borderRadius: 2 }}>
        <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 10, color, fontFamily: "monospace", minWidth: 20 }}>{value}</span>
    </div>
  );
}

// ─── KI ANALYSE PANEL ─────────────────────────────────────────────────────────
function AIPanel({ stock, onClose }) {
  const [state, setState] = useState("loading");
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetchAnalysis(stock)
      .then(r => { setData(r); setState("done"); })
      .catch(e => { setErrorMsg(e.message); setState("error"); });
  }, [stock.ticker]);

  const hColor = (h) => h?.includes("1:5") ? "#f43f5e" : h?.includes("1:3") ? "#f59e0b" : "#10b981";

  return (
    <div style={{ margin: "0 16px 10px 16px", background: "rgba(0,212,255,0.04)", border: "1px solid rgba(0,212,255,0.15)", borderRadius: 8, overflow: "hidden", animation: "fadeIn 0.3s ease" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px", background: "rgba(0,212,255,0.07)", borderBottom: "1px solid rgba(0,212,255,0.1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Brain size={13} color="#00d4ff" />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#00d4ff", fontFamily: "monospace", letterSpacing: 0.8 }}>KI-ANALYSE — {stock.ticker}</span>
          {data && <span style={{ fontSize: 9, color: "#334155", fontFamily: "monospace" }}>Claude Haiku · ${data.cost_usd} · {data.cached ? "gecacht" : "neu"}</span>}
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", display: "flex", padding: 2 }}>
          <X size={13} />
        </button>
      </div>

      {state === "loading" && (
        <div style={{ padding: "20px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <Loader size={13} color="#00d4ff" className="spin" />
          <span style={{ fontSize: 11, color: "#475569", fontFamily: "monospace" }}>Claude analysiert {stock.ticker}...</span>
        </div>
      )}

      {state === "error" && (
        <div style={{ padding: "14px 16px", display: "flex", gap: 10 }}>
          <AlertTriangle size={13} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 11, color: "#fcd34d", marginBottom: 4 }}>{errorMsg}</div>
            <div style={{ fontSize: 10, color: "#475569" }}>→ Netlify: Site settings → Environment variables → <span style={{ color: "#00d4ff" }}>ANTHROPIC_API_KEY</span> hinzufügen</div>
          </div>
        </div>
      )}

      {state === "done" && data?.analysis && (() => {
        const a = data.analysis;
        return (
          <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Links */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 9, color: "#00d4ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 5, fontFamily: "monospace" }}>📈 Momentum-Treiber</div>
                <p style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.65, margin: 0 }}>{a.momentum_grund}</p>
              </div>
              <div style={{ background: "rgba(0,255,136,0.06)", border: "1px solid rgba(0,255,136,0.15)", borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontSize: 9, color: "#00ff88", letterSpacing: 1, marginBottom: 5, fontFamily: "monospace" }}>✅ FAZIT</div>
                <p style={{ fontSize: 12, color: "#e2e8f0", margin: 0, fontWeight: 600, lineHeight: 1.5 }}>{a.fazit}</p>
              </div>
            </div>
            {/* Rechts */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ fontSize: 9, color: "#10b981", textTransform: "uppercase", letterSpacing: 1, marginBottom: 5, fontFamily: "monospace" }}>▲ Stärken</div>
                {(a.staerken || []).map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, marginBottom: 3 }}>
                    <span style={{ color: "#10b981", fontSize: 10, flexShrink: 0 }}>→</span>
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>{s}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 9, color: "#f59e0b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 5, fontFamily: "monospace" }}>⚠ Risiken</div>
                {(a.risiken || []).map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, marginBottom: 3 }}>
                    <span style={{ color: "#f59e0b", fontSize: 10, flexShrink: 0 }}>!</span>
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>{r}</span>
                  </div>
                ))}
              </div>
              {/* Trade-Parameter */}
              <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, padding: "10px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 9, color: "#475569", marginBottom: 3, fontFamily: "monospace" }}>EINSTIEG</div>
                  <div style={{ fontSize: 10, color: "#e2e8f0", lineHeight: 1.45 }}>{a.plus500_einstieg}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "#475569", marginBottom: 3, fontFamily: "monospace" }}>STOP-LOSS</div>
                  <div style={{ fontSize: 10, color: "#fca5a5", lineHeight: 1.45 }}>{a.stop_loss_idee}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "#475569", marginBottom: 3, fontFamily: "monospace" }}>ZEITFENSTER</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Clock size={10} color="#94a3b8" />
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>{a.zeitfenster}</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "#475569", marginBottom: 3, fontFamily: "monospace" }}>CFD HEBEL</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Shield size={10} color={hColor(a.hebel_empfehlung)} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: hColor(a.hebel_empfehlung), fontFamily: "monospace" }}>{a.hebel_empfehlung?.split(" ")[0]}</span>
                    <span style={{ fontSize: 9, color: "#475569" }}>{a.hebel_empfehlung?.split(" ").slice(1).join(" ")}</span>
                  </div>
                </div>
              </div>
              <a href={plus500Link(stock.ticker)} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px", borderRadius: 6, background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.22)", color: "#00d4ff", fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(0,212,255,0.16)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(0,212,255,0.08)"}
              >
                <ExternalLink size={11} /> {stock.ticker} auf Plus500 öffnen
              </a>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── STOCK ROW ────────────────────────────────────────────────────────────────
function StockRow({ stock, meta, isWatched, onToggleWatch, showAI, onToggleAI }) {
  const isUp = (stock.change || 0) >= 0;
  const sparkline = useRef(genSparkline(stock.change)).current;
  const sig = SIGNAL_CONFIG[stock.signal] || SIGNAL_CONFIG.NEUTRAL;

  return (
    <>
      <div style={{
        display: "grid", gridTemplateColumns: "120px 1fr 90px 90px 70px 70px 60px 90px 96px 36px",
        alignItems: "center", padding: "9px 16px", gap: 8,
        borderBottom: showAI ? "none" : "1px solid rgba(255,255,255,0.04)",
        background: showAI ? "rgba(0,212,255,0.025)" : "transparent", transition: "background 0.12s",
      }}
        onMouseEnter={e => { if (!showAI) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
        onMouseLeave={e => { if (!showAI) e.currentTarget.style.background = "transparent"; }}
      >
        <div>
          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13, color: "#f1f5f9", letterSpacing: 0.8 }}>{stock.ticker}</div>
          <div style={{ fontSize: 10, color: "#475569", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 112 }}>{stock.name || meta?.name || "—"}</div>
        </div>
        <Sparkline data={sparkline} color={isUp ? "#10b981" : "#f43f5e"} />
        <div style={{ textAlign: "right", fontFamily: "monospace", fontSize: 13, color: "#e2e8f0" }}>{fmt.price(stock.price)}</div>
        <div style={{ textAlign: "right", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
          {isUp ? <TrendingUp size={11} color="#10b981" /> : <TrendingDown size={11} color="#f43f5e" />}
          <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: isUp ? "#10b981" : "#f43f5e" }}>{fmt.change(stock.change)}</span>
        </div>
        <RSIBar value={stock.rsi} />
        <div style={{ display: "flex", justifyContent: "center" }}><ScoreRing value={stock.score} size={32} /></div>
        <div style={{ textAlign: "right", fontFamily: "monospace", fontSize: 11 }}>
          <span style={{ color: (stock.volumeRatio || 0) >= 2 ? "#f59e0b" : (stock.volumeRatio || 0) >= 1.5 ? "#10b981" : "#475569" }}>{fmt.ratio(stock.volumeRatio)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 4, color: sig.color, background: sig.bg, border: `1px solid ${sig.color}30`, fontFamily: "monospace", whiteSpace: "nowrap" }}>
            {sig.icon} {sig.label}
          </span>
        </div>
        {/* KI + P500 Buttons */}
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", alignItems: "center" }}>
          {stock.signal === "STRONG_BUY" && (
            <button onClick={() => onToggleAI(stock.ticker)}
              style={{ display: "flex", alignItems: "center", gap: 3, padding: "3px 7px", borderRadius: 4, cursor: "pointer", border: showAI ? "1px solid #00d4ff" : "1px solid rgba(0,212,255,0.22)", background: showAI ? "rgba(0,212,255,0.14)" : "rgba(0,212,255,0.05)", color: showAI ? "#00d4ff" : "#475569", fontSize: 9, fontFamily: "monospace", fontWeight: 700, transition: "all 0.12s" }}
              onMouseEnter={e => { if (!showAI) { e.currentTarget.style.borderColor = "#00d4ff"; e.currentTarget.style.color = "#00d4ff"; }}}
              onMouseLeave={e => { if (!showAI) { e.currentTarget.style.borderColor = "rgba(0,212,255,0.22)"; e.currentTarget.style.color = "#475569"; }}}
            >
              <Brain size={9} />KI
            </button>
          )}
          <a href={plus500Link(stock.ticker)} target="_blank" rel="noopener noreferrer"
            title="Plus500 öffnen"
            style={{ display: "flex", alignItems: "center", color: "#334155", transition: "color 0.12s" }}
            onMouseEnter={e => e.currentTarget.style.color = "#00d4ff"}
            onMouseLeave={e => e.currentTarget.style.color = "#334155"}
          >
            <ExternalLink size={13} />
          </a>
          <div onClick={() => onToggleWatch(stock.ticker)} style={{ cursor: "pointer", display: "flex", alignItems: "center" }}>
            <Star size={14} color={isWatched ? "#f59e0b" : "#334155"} fill={isWatched ? "#f59e0b" : "none"} />
          </div>
        </div>
      </div>
      {showAI && <AIPanel stock={stock} onClose={() => onToggleAI(stock.ticker)} />}
    </>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: "9px 16px", display: "grid", gridTemplateColumns: "120px 1fr 90px 90px 70px 70px 60px 90px 96px 36px", gap: 8, alignItems: "center" }}>
      {[110, 80, 55, 55, 50, 32, 35, 70, 55, 20].map((w, i) => (
        <div key={i} style={{ height: 11, width: w, background: "rgba(255,255,255,0.05)", borderRadius: 3, animation: "pulse 1.5s ease-in-out infinite", animationDelay: `${i * 0.06}s` }} />
      ))}
    </div>
  );
}

function SectorCluster({ segKey, stocks, loading, watchlist, onToggleWatch, filter, openAI, onToggleAI }) {
  const [collapsed, setCollapsed] = useState(false);
  const seg = SECTORS[segKey];
  if (!seg) return null;

  const filtered = stocks
    .filter(s => {
      if (filter === "STRONG_BUY") return s.signal === "STRONG_BUY";
      if (filter === "BUY_PLUS") return ["STRONG_BUY", "BUY"].includes(s.signal);
      if (filter === "WATCHLIST") return watchlist.includes(s.ticker);
      return true;
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  if (!loading && filtered.length === 0) return null;

  const strongCount = filtered.filter(s => s.signal === "STRONG_BUY").length;
  const avgScore = filtered.length ? Math.round(filtered.reduce((a, s) => a + (s.score || 0), 0) / filtered.length) : 0;

  return (
    <div style={{ marginBottom: 14, border: "1px solid rgba(255,255,255,0.06)", borderLeft: `3px solid ${seg.color}`, borderRadius: 8, overflow: "hidden", background: "rgba(10,18,36,0.85)" }}>
      <div onClick={() => setCollapsed(!collapsed)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 16px", background: seg.bg, cursor: "pointer", borderBottom: collapsed ? "none" : "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 700, color: seg.color, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "monospace" }}>{seg.label}</span>
          <span style={{ fontSize: 10, color: "#475569", fontFamily: "monospace" }}>{loading ? "..." : `${filtered.length} Werte`}</span>
          {strongCount > 0 && <span style={{ fontSize: 10, color: "#00ff88", background: "rgba(0,255,136,0.1)", padding: "2px 6px", borderRadius: 3, fontFamily: "monospace" }}>⚡ {strongCount}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {!loading && <span style={{ fontSize: 10, color: "#334155", fontFamily: "monospace" }}>Ø Score: <span style={{ color: "#64748b" }}>{avgScore}</span></span>}
          {collapsed ? <ChevronDown size={13} color="#475569" /> : <ChevronUp size={13} color="#475569" />}
        </div>
      </div>
      {!collapsed && (loading
        ? [0, 1, 2].map(i => <LoadingSkeleton key={i} />)
        : filtered.map(stock => (
          <StockRow key={stock.ticker} stock={stock} meta={TICKER_MAP[stock.ticker]}
            isWatched={watchlist.includes(stock.ticker)} onToggleWatch={onToggleWatch}
            showAI={openAI.has(stock.ticker)} onToggleAI={onToggleAI} />
        ))
      )}
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [stockData, setStockData] = useState({});
  const [loadingSegments, setLoadingSegments] = useState(new Set(Object.keys(SECTORS)));
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [watchlist, setWatchlist] = useState(watchlistStorage.get());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [openAI, setOpenAI] = useState(new Set());
  const abortRef = useRef(null);

  const loadData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setError(null);
    setLoadingSegments(new Set(Object.keys(SECTORS)));
    for (const [segKey, seg] of Object.entries(universeData.segments)) {
      const tickers = seg.tickers.map(t => t.t);
      for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        try {
          const result = await fetchQuotes(tickers.slice(i, i + BATCH_SIZE));
          setStockData(prev => { const n = { ...prev }; result.data.forEach(d => { n[d.ticker] = d; }); return n; });
        } catch (e) { if (e.name !== "AbortError") setError("Marktdaten nicht erreichbar"); }
      }
      setLoadingSegments(prev => { const n = new Set(prev); n.delete(segKey); return n; });
    }
    setLastUpdated(new Date());
    setIsRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleWatch = t => setWatchlist(watchlistStorage.toggle(t));
  const toggleAI = t => setOpenAI(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; });

  const all = Object.values(stockData);
  const strongBuys = all.filter(s => s.signal === "STRONG_BUY");
  const buys = all.filter(s => ["STRONG_BUY", "BUY"].includes(s.signal));
  const topMover = all.reduce((b, s) => (!b || (s.change || 0) > (b.change || 0)) ? s : b, null);
  const segStocks = k => (universeData.segments[k]?.tickers.map(t => t.t) || []).map(t => stockData[t]).filter(Boolean);

  const searchActive = search.length >= 2;
  const searchResults = searchActive ? all.filter(s => s.ticker?.includes(search.toUpperCase()) || (s.name || "").toLowerCase().includes(search.toLowerCase())).slice(0, 15) : [];

  return (
    <div style={{ minHeight: "100vh", background: "#050c1a", color: "#cbd5e1", fontFamily: "'IBM Plex Mono', 'Courier New', monospace", backgroundImage: "radial-gradient(ellipse at 10% 0%, rgba(0,212,255,0.05) 0%, transparent 50%), radial-gradient(ellipse at 90% 100%, rgba(0,255,136,0.03) 0%, transparent 50%)" }}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .fade-in{animation:fadeIn 0.35s ease forwards}
        .spin{animation:spin 1s linear infinite}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0a1628}::-webkit-scrollbar-thumb{background:#1e3a5f;border-radius:2px}
        a{text-decoration:none}
        input:focus{outline:none;border-color:rgba(0,212,255,0.4)!important}
      `}</style>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 16px" }}>

        {/* HEADER */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
              <Activity size={17} color="#00d4ff" />
              <span style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", fontFamily: "sans-serif", letterSpacing: -0.5 }}>TREND<span style={{ color: "#00d4ff" }}>SCREEN</span></span>
              <span style={{ fontSize: 9, color: "#334155", border: "1px solid #1e3a5f", padding: "1px 5px", borderRadius: 3 }}>PLUS500 · LIVE · KI</span>
            </div>
            <div style={{ fontSize: 10, color: "#334155" }}>
              {lastUpdated ? `${lastUpdated.toLocaleTimeString("de-AT")} · ${all.length}/${Object.keys(TICKER_MAP).length} Titel · ⚡ ${strongBuys.length} Strong Buys` : "Lade Marktdaten..."}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <Search size={11} color="#475569" style={{ position: "absolute", left: 9, pointerEvents: "none" }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ticker suchen..."
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "6px 10px 6px 27px", color: "#cbd5e1", fontSize: 11, fontFamily: "monospace", width: 150, transition: "border-color 0.15s" }} />
            </div>
            <button onClick={() => { setIsRefreshing(true); loadData(); }} style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)", borderRadius: 6, padding: "7px 13px", color: "#00d4ff", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
              <RefreshCw size={11} className={isRefreshing ? "spin" : ""} /> Refresh
            </button>
          </div>
        </div>

        {/* ERROR */}
        {error && (
          <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 8, padding: "11px 16px", marginBottom: 18, display: "flex", gap: 10, alignItems: "center" }}>
            <AlertTriangle size={13} color="#f59e0b" />
            <span style={{ fontSize: 11, color: "#fcd34d" }}>{error}</span>
          </div>
        )}

        {/* KPI CARDS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }} className="fade-in">
          {[
            { label: "Strong Buys", value: strongBuys.length || "—", sub: "⚡ KI-Analyse verfügbar", color: "#00ff88", icon: <Zap size={14} /> },
            { label: "Buy Signale", value: buys.length || "—", sub: "▲ Momentum aktiv", color: "#10b981", icon: <TrendingUp size={14} /> },
            { label: "KI offen", value: openAI.size, sub: "🧠 Analysen aktiv", color: "#00d4ff", icon: <Brain size={14} /> },
            { label: "Top Mover", value: topMover?.ticker || "—", sub: topMover ? `${topMover.change >= 0 ? "+" : ""}${topMover.change?.toFixed(1)}% heute` : "Lädt...", color: "#f59e0b", icon: <BarChart2 size={14} /> },
          ].map(c => (
            <div key={c.label} style={{ background: "rgba(10,18,36,0.9)", border: "1px solid rgba(255,255,255,0.06)", borderTop: `2px solid ${c.color}`, borderRadius: 8, padding: "13px 15px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 7 }}>
                <span style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: 1 }}>{c.label}</span>
                <span style={{ color: c.color }}>{c.icon}</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: c.color, lineHeight: 1, fontFamily: "monospace" }}>{c.value}</div>
              <div style={{ fontSize: 10, color: "#334155", marginTop: 3 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* FILTER + HEADER */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            {[{ id: "ALL", label: "Alle" }, { id: "STRONG_BUY", label: "⚡ Strong Buy" }, { id: "BUY_PLUS", label: "▲ Buy+" }, { id: "WATCHLIST", label: "★ Watchlist" }].map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{ padding: "5px 11px", fontSize: 10, borderRadius: 4, cursor: "pointer", fontFamily: "monospace", border: filter === f.id ? "1px solid #00d4ff" : "1px solid rgba(255,255,255,0.07)", background: filter === f.id ? "rgba(0,212,255,0.12)" : "rgba(255,255,255,0.03)", color: filter === f.id ? "#00d4ff" : "#475569" }}>
                {f.label}
              </button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: "#334155" }}>
              <Brain size={9} color="#00d4ff" /><span>KI nur bei ⚡ Strong Buy</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 90px 90px 70px 70px 60px 90px 96px 36px", padding: "5px 16px", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            {["Ticker", "Chart", "Preis", "Δ Tag", "RSI", "Score", "Vol.", "Signal", "KI/P500", "★"].map((h, i) => (
              <div key={i} style={{ fontSize: 9, color: "#334155", textTransform: "uppercase", letterSpacing: 0.8, textAlign: i >= 2 ? "right" : "left", display: "flex", justifyContent: i >= 2 ? "flex-end" : "flex-start" }}>{h}</div>
            ))}
          </div>
        </div>

        {/* SUCHE */}
        {searchActive && (
          <div style={{ marginBottom: 16, border: "1px solid rgba(0,212,255,0.2)", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 10, color: "#00d4ff", fontFamily: "monospace" }}>
              SUCHE "{search.toUpperCase()}" — {searchResults.length} Treffer
            </div>
            {searchResults.map(s => <StockRow key={s.ticker} stock={s} meta={TICKER_MAP[s.ticker]} isWatched={watchlist.includes(s.ticker)} onToggleWatch={toggleWatch} showAI={openAI.has(s.ticker)} onToggleAI={toggleAI} />)}
          </div>
        )}

        {/* CLUSTER */}
        {!searchActive && (
          <div className="fade-in">
            {Object.keys(SECTORS).map(k => (
              <SectorCluster key={k} segKey={k} stocks={segStocks(k)} loading={loadingSegments.has(k)}
                watchlist={watchlist} onToggleWatch={toggleWatch} filter={filter} openAI={openAI} onToggleAI={toggleAI} />
            ))}
          </div>
        )}

        {/* FOOTER */}
        <div style={{ marginTop: 18, padding: "12px 0", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 9, color: "#1e3a5f" }}>⚠ Keine Anlageberatung · 15-Min-Delay · CFD max. 1:5 (ESMA) · KI via Claude Haiku 4.5</span>
          <div style={{ display: "flex", gap: 12 }}>
            {Object.entries(SIGNAL_CONFIG).map(([k, c]) => <span key={k} style={{ fontSize: 9, color: c.color, fontFamily: "monospace" }}>{c.icon} {c.label}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}
