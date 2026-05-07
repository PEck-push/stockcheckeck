# TrendScreen – Momentum Screener für Plus500

Kurzfristiger Momentum-Screener für CFD-Trading auf Plus500.
247 Aktien across USA, China ADRs & Crypto-Stocks.

## Tech Stack
- **Frontend:** React + Vite
- **Backend:** Netlify Functions (serverless)
- **Daten:** Yahoo Finance via `yahoo-finance2`
- **Hosting:** Netlify (kostenlos)

## Lokale Entwicklung

```bash
# 1. Abhängigkeiten installieren
npm install

# 2. Netlify Functions Abhängigkeiten
cd netlify/functions && npm install && cd ../..

# 3. Netlify CLI installieren (einmalig)
npm install -g netlify-cli

# 4. Lokal starten (inkl. Functions)
netlify dev
```

Dashboard läuft dann auf: http://localhost:8888

## Deployment (GitHub → Netlify)

### Schritt 1: GitHub Repository erstellen
1. github.com → "New repository"
2. Name: `stock-screener` (private empfohlen)
3. Diesen Ordner hochladen:
   ```bash
   git init
   git add .
   git commit -m "Initial: TrendScreen v1"
   git remote add origin https://github.com/DEIN-USER/stock-screener.git
   git push -u origin main
   ```

### Schritt 2: Netlify verbinden
1. netlify.com → "Add new site" → "Import from Git"
2. GitHub autorisieren → Repository auswählen
3. Build-Einstellungen werden aus `netlify.toml` automatisch erkannt:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. "Deploy site" klicken

### Schritt 3: Functions Dependencies
In Netlify UI → Site settings → Build & deploy → Environment:
Die `netlify/functions/package.json` wird automatisch erkannt.

## Universe erweitern
Bearbeite `src/data/universe.json` und füge Ticker hinzu.
Format: `{"t":"TICKER","n":"Company Name","sub":"Sektor","cap":"MID"}`

## Scoring-Logik
| Kriterium | Punkte | Quelle |
|---|---|---|
| Preis > EMA50 | 0–25 | Yahoo Quote |
| Wöchentl. Change | 0–20 | Yahoo Quote |
| Volumen-Ratio | 0–20 | Yahoo Quote |
| 52W-Position | 0–20 | Yahoo Quote |
| RSI 55–72 | 0–15 | Berechnet aus History |

**Signal:** 75+ = STRONG BUY · 55+ = BUY · 35+ = NEUTRAL · <35 = SELL
