# Trade Mirror

**Uzbekistan Mirror Trade Evidence & Risk Screening Dashboard (v2)** — a statistical reconciliation and
risk-screening platform comparing Uzbekistan's import records with partner-reported exports. The central
metric is the **residual unexplained discrepancy**; every result carries separate **anomaly-strength** and
**evidence-quality** scores and an evidence-ladder position. Discrepancies are screening signals — never
proof of wrongdoing.

Every import is reported twice: once by Uzbekistan, once by the partner that shipped it. When partners
report exporting more to Uzbekistan than Uzbekistan records importing — beyond the normal CIF/FOB freight
wedge (~10%) — a mirror trade gap appears. This project pulls both sides from **UN Comtrade** at HS2
(sectors) and HS6 (products), computes CIF/FOB-adjusted gaps and reliability-weighted screening scores,
and presents them in an interactive dashboard with per-country investigation briefs and per-product
profiles.

> **Scope:** import side only, **2017–2024** (Uzbekistan began reporting to Comtrade in 2017; 2025 is
> annual-incomplete). Default view is the latest full year (2024). Only measured quantities are used —
> no assumed tax or tariff rates.

## How it works

```
UN Comtrade API ──▶ scripts/fetch-comtrade.ts ──▶ data/raw/trade-rows.json
                                                          │
                                  scripts/build-analytics.ts
                                                          │
                                                          ▼
                                   src/data/*.json  ──▶  Next.js site (src/app)
```

- **`scripts/config.ts`** — methodology config: Uzbekistan (860), curated partners, high-risk HS chapters +
  4-digit drill codes, the CIF/FOB band (6/10/15%), HS sections (categories), transit hubs, and the
  2017–2024 analysis window. No assumed tax/tariff rates — the site reports measured trade values only.
- **`scripts/build-analytics.ts`** emits a granular dataset (`cells.json` per partner×commodity×year +
  `meta.json`); **`src/lib/dataset.ts`** aggregates it live so every filter (time, country, category,
  commodity, freight wedge) is exact.
- **`scripts/comtrade.ts`** — Comtrade API client. Uses the authenticated endpoint when `COMTRADE_API_KEY`
  is set, otherwise the public **preview endpoint** (capped at 500 rows/call). Caches every response on disk.
- **`scripts/fetch-comtrade.ts`** — pulls both sides (Uzbekistan-as-reporter and each partner-as-reporter) at
  HS 2-digit + 4-digit annually plus monthly for recent years. Reconciles partner codes against Comtrade's
  live reference (auto-corrects e.g. USA 842→841).
- **`scripts/build-analytics.ts`** — computes the mirror gaps, reliability tiers, revenue-at-risk,
  decomposition, concentration and unit-value spotlight, and writes the datasets the site reads.
- **`scripts/profile-data.ts`** — one-off profiler of raw-data coverage (weight availability, reporting years).

## Setup

```bash
npm install
```

### 1. Get a free UN Comtrade key

https://comtradedeveloper.un.org → sign up → *My Account → My API portal → Profile → Primary key*.
Free tier: 100k records/call, 500 calls/day.

```bash
cp .env.example .env
# then put your key in .env:  COMTRADE_API_KEY=xxxxxxxx
```

### 2. Pull data and build analytics

```bash
npm run data:all      # fetch from Comtrade, then compute analytics
# or individually:
npm run data:fetch
npm run data:build
```

### 3. Run the site

```bash
npm run dev           # http://localhost:3000
npm run build && npm run start
```

## The site

| View | What it shows |
|------|---------------|
| **Overview** | The four gap concepts (Gross / High-confidence / Core / Transit-sensitive) as clickable KPI cards, reform-annotated trend, top risk signals, "How to read this dashboard" |
| **Risk Map** | World choropleth; piecewise colour buckets; no-data & low-quality reporters greyed with explanation |
| **Leaderboard** | Every partner × commodity channel (HS2 or HS6), classified as Audit priority / Verify data / Transit-sensitive, with concentration Pareto |
| **Products** | HS6 product profiles: gap, top partners, yearly trend, unit-value check, interpretation & suggested priority |
| **Sectors** | Gap by HS2 chapter & category, sector × partner heatmap, price/kg under-valuation checks |
| **Trends** | Which goods and countries are getting riskier (or improving) over the full window |
| **Partners** | Investigation briefs: executive summary, key indicators, reporting quality, top sectors & products, trend, interpretation note |
| **Methodology** | The math, the four gap concepts, the risk-score formula table, interpretation guide, limitations |

All analytical pages share a **filter bar** (view mode, years — default 2024, country, category, freight wedge) that recomputes everything client-side.

## Methodology in one line

```
Import gap = partner_exports_to_UZB × (1 + CIF) − UZB_recorded_imports
Headline   = Σ max(0, gap) over partner × HS2 channels, reporting years only, 2017–2024
```

Positive = under-recorded on Uzbekistan's side. A gap is a *signal of where to look*, not proof —
re-exports, transit hubs, lapsed reporters and timing differences all create legitimate gaps (see the
Methodology page).

Data: UN Comtrade. Built with Next.js + ECharts. Deployable to Vercel.
