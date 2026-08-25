# Unexplained Discrepancy Analysis — Steps 3–4

Follows [STEP2_REPORT.md](STEP2_REPORT.md). Reproduce with:

```bash
python analysis/fetch_cepii.py
python analysis/step3_freight.py
python analysis/step4_anomaly.py --cluster hs4 --freight flat
```

Settings confirmed: window **2019–2024**, gravity from **CEPII GeoDist**
(Mayer & Zignago 2011), `statsmodels` 0.14.6 installed.

**Headline: Step 3's freight surface does not identify freight. Step 4 works
anyway, and is insensitive to the freight choice — which is the useful result.**

---

## A correction, first

My first run of Steps 3–4 was wrong and I have re-run everything. `geo_cepii.xls`
is one row per **main city**, not per country: 13 countries carry two rows —
Germany, Turkey, Kazakhstan, Brazil, Australia, Canada among them. Merging it on
`iso3` silently doubled every cell for exactly those partners, and they then
dominated the rankings. Germany and Turkey topped my first score table on the
strength of being counted twice.

| | Before | After |
|---|---:|---:|
| Matched cells, 2019–2024, both sides ≥ $50k | 56,585 | **44,259** |
| Clean sample | 25,342 | **19,950** |
| rho, partner × HS4 | 0.2292 | **0.1604** |

The merge now deduplicates and asserts that the row count is unchanged, so this
cannot recur silently. Everything below is post-correction.

---

## Step 3 — freight margins

Clean sample: **19,950 cells (45.2%)**, 70 partners, 1,489 HS6 — the HS6 lines at
zero duty throughout, where the incentive to misinvoice is weakest.

### The dependent variable

| | |
|---|---:|
| ln(M_cif / X_fob) mean | +0.0553 |
| median | +0.0314 |
| **standard deviation** | **0.9859** |
| median cell ratio | 1.032 |
| **value-weighted ratio, clean sample** | **1.150** |
| cells where Uzbekistan records less than the partner ships | 45.3% |

Two facts have to be held together. In aggregate the zero-duty sample shows a
**15.0% wedge** — exactly what freight to a doubly landlocked country should look
like. But the median *cell* wedge is 3%, and the dispersion is thirty times the
median. Cell-level mirror noise — timing, classification, partner attribution —
dwarfs freight.

### The four mandatory checks

**Check 1 — signs. Passes as specified, but distance is not identified.**

| Estimator | ln_dist | ln_w2v |
|---|---:|---:|
| OLS, partner-clustered | +0.0496 (p 0.50) | +0.0145 (p 0.19) |
| WLS on export value | −0.2807 (p 0.078) | +0.1470 (p 0.16) |

Both signs are positive under the specified estimator, so the check passes. But
neither is significant, and value weighting flips distance negative. The sign
depends on the weighting choice, which means it is not identified rather than
wrong.

**Check 2 — placebo. Fails as written; the failure is mechanical.**

| Specification | coef on tariff | p |
|---|---:|---:|
| as specified | −0.002342 | 0.0000 |
| within HS section | +0.000003 | 0.96 |
| within HS2 chapter | +0.000025 | 0.62 |

Mean tariffs run from 1.1% to 18.4% **across** sections, and the fitted margin
carries section fixed effects, so the unconditional placebo picks up the section
term. Within a section or a chapter the fitted margin knows nothing whatever
about the duty rate. The check was trying to establish that misinvoicing had not
leaked into the freight surface, and the within-section version — which is the
meaningful one — says clearly that it has not.

**Check 3 — positivity. Fails.** 25.1% of predicted margins are below zero.

**Check 4 — held-out fit.** R² = **0.0051** out of sample, 0.0084 in sample. The
surface has no predictive power at cell level.

### Is the weak fit small-cell noise?

Partly. Raising the value floor recovers the expected magnitude but never the
significance of distance:

| Floor, both sides | n | R² | ln_dist | ln_w2v | median margin | aggregate M/X |
|---|---:|---:|---:|---:|---:|---:|
| $50k | 19,950 | 0.008 | +0.051 (p 0.52) | +0.018 (p 0.10) | 4.5% | 1.150 |
| $250k | 10,452 | 0.013 | +0.059 (p 0.38) | +0.031 (p 0.00) | 6.9% | 1.157 |
| $1M | 4,853 | 0.022 | +0.065 (p 0.38) | +0.020 (p 0.07) | 10.5% | 1.173 |
| $5M | 1,377 | 0.054 | −0.034 (p 0.77) | +0.024 (p 0.11) | 17.2% | 1.165 |

The aggregate wedge is remarkably stable at 15–17% regardless of floor. The
*median cell* margin climbs toward it as small cells drop out. So the level is
solid and the cell-level allocation is noise.

### Distance does not raise the wedge

| Distance | value-weighted M/X | n |
|---|---:|---:|
| < 1,500 km | **1.252** | 1,139 |
| 1,500–3,000 km | 1.208 | 3,004 |
| 3,000–5,000 km | 1.107 | 13,210 |
| > 5,000 km | 1.146 | 2,597 |

corr(ln_ratio, ln_dist) = **+0.0063**. No gradient, and the *nearest* band shows
the largest wedge — the land-corridor neighbours are where recorded imports track
reported exports most closely. Whatever the CIF/FOB ratio is measuring here, it
is not distance-driven transport cost.

### What the data does support

Not a cell-level surface. Two candidates, both implemented:

- **`--freight flat`** — the fitted overall zero-duty wedge, **15.0%**. One
  number, estimated from these data rather than assumed. This is my
  recommendation: it is the only freight quantity the data identifies.
- **`--freight modelc`** — aggregate wedges by section × weight class, floored at
  zero. Superficially richer, but section wedges include −15.0% (textiles),
  −23.5% (vehicles) and −27.0% (furniture), which cannot be freight, and the
  weight-class gradient is not monotone (light 1.072, mid-light 1.308, mid-heavy
  1.062, heavy 1.161). Flooring the negatives at zero is arbitrary.

Both are better grounded than the flat 10% the brief objected to. Neither is the
fitted surface it specified, and I am not going to present a variable with an
R² of 0.005 as a cell-level freight estimate.

---

## Step 4 — the anomaly model

### One arm only

The extract carries a single mirror direction:

| reporting_side | flow | rows | value |
|---|---|---:|---:|
| partner_exports_to_uzbekistan | Export | 1,324,193 | $352.5B |
| uzbekistan_imports | Import | 1,405,239 | $438.0B |

There is no "UZ exports vs partner imports" pair, so **export under-reporting
cannot be estimated** and the `EXPORT` dummy is degenerate. It is omitted rather
than faked. What remains is import over-reporting: cells where Uzbekistan records
more, freight removed, than the partner says it shipped — money leaving against
over-invoiced imports. Recovering the other arm needs a second Comtrade download
with Uzbekistan as reporter of exports and partners as reporters of imports.

Note this screens the **opposite** direction to the live dashboard, which ranks
cells where partner exports exceed Uzbek imports. The two tools are looking at
different offences, and both are in the data.

### Results, and the cluster-level question

You asked for HS6 if possible. It is possible under the brief's own rule — 41%
singletons at HS4, 54% at HS6, both under the 60% threshold — but the variance
decomposition argues against it:

| Cluster | Freight | Clusters | Singletons | rho | Confirmed | Provisional |
|---|---|---:|---:|---:|---:|---:|
| **partner × HS4** | **flat** | **3,611** | **41.4%** | **0.160** | **6** | **85** |
| partner × HS4 | modelc | 3,724 | 40.7% | 0.174 | 5 | 89 |
| partner × HS6 | flat | 6,148 | 53.5% | 0.324 | 8 | 143 |
| partner × HS6 | modelc | 6,395 | 53.5% | 0.350 | 14 | 139 |

**Two things to read here.**

The model is almost completely insensitive to the freight choice — rho moves
0.160 → 0.174 at HS4 and 0.324 → 0.350 at HS6. A common multiplicative factor
mostly shifts the gap level, and the model works off differences after
conditioning on trade size. **The open freight decision does not materially
change the findings**, which de-risks it considerably.

HS6's rho is twice HS4's, and that is not extra signal. At HS6 the median cluster
holds **one** observation, and a singleton's random intercept simply *is* its
residual — so variance migrates from σ²_e into σ²_u by construction. HS4's
**rho = 0.160** sits almost exactly on Gara et al.'s 0.18 on Italian data, with a
median of 2 observations and a maximum of 54. That is the defensible one.

**Recommendation: partner × HS4 as the headline, partner × HS6 available as a
drill-down clearly marked as exploratory.**

### The fitted model (HS4, flat freight)

11,878 cells with a freight-adjusted positive gap ≥ $50,000, totalling **$23.35B**
across 3,611 clusters.

| Term | Coef | SE | z | p |
|---|---:|---:|---:|---:|
| Intercept | 2.8056 | 0.320 | 8.77 | 0.000 |
| tariff | −0.0010 | 0.0018 | −0.54 | 0.588 |
| trade_dev | 0.8513 | 0.014 | 59.9 | 0.000 |
| trade_bar | 0.7958 | 0.008 | 99.7 | 0.000 |

Partner, chapter and year fixed effects retained. σ²_u 0.276, σ²_e 0.513.

Three things worth noting. **The tariff is insignificant**, which is what we want:
tariff evasion is being absorbed as a control rather than scored. **trade_dev and
trade_bar are nearly equal** (0.85 and 0.80) — the Mundlak device says there is
little correlated-effects bias, so the random-effects orthogonality assumption
was close to holding anyway. And **rho = 0.160 is the honest headline: 84% of the
variation in these gaps is not in this indicator.**

No corruption index, tax-haven flag, secrecy score or AML index appears on the
right-hand side.

### Two-tier flagging

Threshold = 97.5th percentile of u_hat = 0.4146.

| Tier | Clusters | Gap |
|---|---:|---:|
| Confirmed — interval clears the threshold | **6** | $1.81B |
| Provisional — point estimate clears it, interval does not | 85 | $5.01B |
| Not flagged | 2,024 | $15.24B |
| Suppressed (singleton) | 1,496 | $1.28B |

Order-of-magnitude unexplained value across flagged clusters: **$0.94B**. A
triage magnitude, never an estimate of crime.

Six confirmed against 85 provisional is the interval rule doing exactly what it
was chosen for. Flagging on point estimates alone would name 91 partner-product
pairs; only 6 survive a 90% interval.

### Top clusters (HS4, flat)

| Partner | HS4 | n | u_hat | lo90 | Shrinkage | Gap $M | Tier |
|---|---|---:|---:|---:|---:|---:|---|
| DEU | 3921 | 6 | 0.835 | 0.436 | 0.53 | 27.1 | confirmed |
| TUR | 9406 | 7 | 0.802 | 0.420 | 0.57 | 115.5 | confirmed |
| CHN | 5515 | 8 | 0.762 | 0.395 | 0.61 | 71.3 | provisional |
| RUS | 4819 | 6 | 0.746 | 0.348 | 0.53 | 22.3 | provisional |
| CHN | 3207 | 12 | 0.742 | 0.420 | 0.70 | 38.8 | confirmed |
| CHN | 9013 | 6 | 0.704 | 0.306 | 0.53 | 135.5 | provisional |
| CHN | 8455 | 14 | 0.671 | 0.367 | 0.73 | 195.6 | provisional |
| CHN | 5407 | 33 | 0.647 | 0.431 | 0.86 | 84.3 | confirmed |

Under the HS6/modelc configuration the largest single confirmed item is
**KOR × 8708 (motor vehicle parts), 60 observations, u_hat 0.714, shrinkage 0.93,
$1.05B of gap** — barely shrunk because it has the observations to support it, and
plausible on its face given Uzbekistan's vehicle assembly imports of Korean kits.
It stays flagged across configurations.

### Partner rollup (HS4, flat)

| Partner | Clusters | Flagged | Confirmed | Share | Gap $B | Unexplained $B |
|---|---:|---:|---:|---:|---:|---:|
| KOR | 198 | 12 | 1 | 6.1% | 2.63 | 0.35 |
| CHN | 550 | 26 | 2 | 4.7% | 7.74 | 0.24 |
| DEU | 219 | 10 | 1 | 4.6% | 0.82 | 0.04 |
| PAK | 22 | 1 | 0 | 4.5% | 0.10 | 0.01 |
| LVA | 48 | 2 | 0 | 4.2% | 0.26 | 0.02 |
| RUS | 258 | 7 | 0 | 2.7% | 0.89 | 0.01 |
| TUR | 344 | 9 | 1 | 2.6% | 1.30 | 0.01 |

Share and value rank differently, as expected: Korea leads on flagged share and
on unexplained value, China leads on raw gap while sitting mid-table on share.
Against a 2.5% base rate, Korea's 6.1% and China's 4.7% are the two that stand
out.

---

## A separate finding about the live dashboard

Kazakhstan filed only **2 of 12 months** of 2024 on the export side of the
monthly extract ($443M against a full-year $2.83B in the annual layer). The
annual layer the dashboard uses on the yearly basis is complete, so the yearly
screen is unaffected. But the monthly layer pairs Kazakhstan's two months against
Uzbekistan's twelve, and `comparableMonthsOfYear` tests month coverage per
*side*, not per *partner*, so it does not catch this. Kazakhstan also files
nothing monthly for 2025–2026.

Effect on the dashboard: in monthly mode Kazakhstan's channels are mostly pushed
into reverse discrepancy and drop out of the positive screen — a silent coverage
hole rather than a wrong headline. Worth fixing by enforcing month coverage per
partner-year; I have not touched it.

---

## Open decisions

1. **Freight instrument** — `flat` (15.0%, recommended) or `modelc`. The model is
   insensitive to the choice, so this is now low-stakes.
2. **Cluster level** — HS4 (recommended, rho 0.160) as headline, HS6 as a marked
   drill-down. Or HS6 as headline if you accept rho 0.32 knowing where it comes
   from.
3. **Export under-reporting arm** — needs a second Comtrade download. Worth
   doing: it is the other half of the brief, and the direction the dashboard
   already screens.

With 1 and 2 settled either way I can build Step 5, the dashboard section. Nothing
there depends on the choice beyond which JSON it reads.

---

## Respecification (supersedes the Step 4 results above)

The specification was revised to the one now shown on the dashboard: partner
fixed effects are dropped and replaced by partner-level covariates, which is what
makes them identified at all.

```
ln|gap|_ic = β₀ + β₁gdp_c + β₂tariff_i + β₃dist_c + β₄CIS/EAEU_c + β₅transit_c
           + β₆EXPORT_ic
           + β₇(trade_ic − trade̅_jc) + β₈EXPORT_ic × (trade_ic − trade̅_jc)
           + β₉trade̅_jc + β₁₀EXPORT_ic × trade̅_jc
           + HS2 dummies + year dummies + u_jc + ε_ic
```

New inputs: `gdp_c` from World Bank WDI NY.GDP.PCAP.KD, constant 2015 US$,
fetched by `analysis/fetch_wdi.py`; `dist_c` the population-weighted CEPII
distance, now used as a regressor rather than only in the freight step;
`CIS/EAEU_c` coded 2 for EAEU members (RUS, BLR, KAZ, KGZ, ARM), 1 for the other
parties to the 2011 CIS FTA (MDA, TJK, UKR), 0 otherwise; and `transit_c`,
constructed as the share of a partner's claimed shipments Uzbekistan does not
credit to it, 1 − ΣM/ΣX over the matched panel.

**β₆, β₈ and β₁₀ are not estimable.** The extract carries one mirror direction, so
`EXPORT` is constant and its two interactions collapse onto their main effects.
All three are dropped together rather than the dummy alone.

### Fitted (partner × HS4)

| Term | Coef | SE | p | Prior | Holds |
|---|---:|---:|---:|:--:|:--:|
| gdp (log) | +0.048 | 0.016 | 0.003 | − | **no** |
| tariff | −0.001 | 0.002 | 0.461 | + | no, insignificant |
| dist (log) | −0.055 | 0.037 | 0.136 | + | **no** |
| CIS/EAEU | −0.078 | 0.023 | <0.001 | − | yes |
| transit | −0.402 | 0.162 | 0.013 | + | **no** |
| trade − trade̅ | +0.809 | 0.009 | <0.001 | + | yes |
| trade̅ | +0.830 | 0.010 | <0.001 | + | yes |

σ²_u 0.158, σ²_e 0.662, **ρ = 0.192** — closer to Gara et al.'s 0.18 than the
previous specification's 0.160. At HS6, ρ = 0.347.

| | Clusters | ρ | Confirmed | Provisional |
|---|---:|---:|---:|---:|
| partner × HS4 | 3,611 | 0.192 | 3 | 88 |
| partner × HS6 | 6,148 | 0.347 | 9 | 142 |

### Three priors do not survive

**`transit` is negative, and structurally so.** The variable measures the share of
a partner's claimed shipments Uzbekistan does not credit to it; the estimated arm
keeps only cells where Uzbekistan records *more*. A re-export hub is by
construction the opposite case, so it loads negatively. The positive prior is
right for the export arm, which this extract cannot estimate. This is a
construction artefact of having one direction, not a finding that hubs are clean.

**`gdp` is positive.** Richer partners carry larger residual gaps here, against
the reporting-quality prior.

**`dist` is negative and insignificant**, consistent with every other place
distance has been tried on this panel — the same result that stopped the freight
surface being used.

All three are reported as fitted. A wrong sign is a finding about the data, not a
reason to drop the term.

### Effect on the ranking

Materially different from the previous specification. India × 3004 (medicaments,
n = 36, shrinkage 0.93) is now the best-supported Confirmed cluster, with an
interval of 0.588–1.010 that clears the threshold comfortably. Germany × 3921,
previously the top Confirmed cluster, drops to Provisional.

---

## Direction correction (supersedes everything above on the estimated arm)

The model was estimated on the wrong arm. It kept cells where **Uzbekistan
records more** than the partner reports shipping (M > X, import over-invoicing).
It now keeps the opposite: the **positive discrepancy**, where the partner reports
shipping more than Uzbekistan records receiving (X > M).

```
gap_ic = X_ic − M_ic / (1 + f)      positive discrepancy only, gap ≥ $50,000
```

The labels on the two directions were correct as written — an importer declaring
more than the exporter shipped is over-paying abroad, one declaring less is
shrinking the duty base. What was wrong was the choice between them.

### Three reasons the positive discrepancy is the right arm

**It is the arm the rest of the dashboard screens.** The Discrepancy & Risk
section ranks cells where partner exports exceed Uzbek imports. Running the
anomaly model on the opposite sign meant two sections of one dashboard pointed at
opposite offences on the same data.

**It is the arm the specification's own priors describe.** The tariff prior is
positive, which is a statement about duty evasion — the Fisman–Wei "missing
imports" mechanism, which exists only in this direction. The transit prior is
positive, which is a statement about origin attribution — hubs whose export
filings have no Uzbek counterpart, again only in this direction.

**It is the larger arm.** 19,989 observations against 11,878, $37.70B against
$23.35B, and singleton clusters fall from 41% to 33%.

### What the estimates do

| Term | Wrong arm (M > X) | Correct arm (X > M) | Prior | Holds |
|---|---:|---:|:--:|:--:|
| gdp (log) | +0.048 (p 0.003) | +0.022 (p 0.106) | − | no, now insignificant |
| **tariff** | −0.001 (p 0.461) | **+0.0067 (p < 0.001)** | + | **yes** |
| dist (log) | −0.055 (p 0.136) | −0.043 (p 0.155) | + | no |
| **CIS/EAEU** | −0.078 (p < 0.001) | **−0.244 (p < 0.001)** | − | **yes, 3× stronger** |
| **transit** | **−0.402 (p 0.013)** | **+0.772 (p < 0.001)** | + | **yes, sign flips** |
| trade − trade̅ | +0.809 | +0.818 | + | yes |
| trade̅ | +0.830 | +0.795 | + | yes |

**Five of seven priors now hold, against three before.** The tariff turning
positive and highly significant is the decisive evidence: it reproduces the
founding empirical result of this literature, and it can only appear on this arm.
transit flipping from −0.402 to +0.772 is the second: the negative sign was a
selection artefact of screening the direction in which a re-export hub is by
construction the opposite case.

ρ rises from 0.192 to 0.228 at partner × HS4, and to 0.417 at HS6.

| | Observations | Clusters | ρ | Confirmed | Provisional |
|---|---:|---:|---:|---:|---:|
| partner × HS4 | 19,989 | 4,591 | 0.228 | 5 | 110 |
| partner × HS6 | 19,989 | 8,647 | 0.417 | 21 | 186 |

Top clusters are now Kazakhstan × 0201 (bovine meat, n = 7, û 1.104) and
China × 5407 (woven synthetic filament fabrics, n = 24, û 1.076, $767M of gap) —
textile and food lines rather than the plastics and machinery the wrong arm
surfaced.

The partner funnel moves with the direction: 65 partners carry at least one
positive discrepancy above the floor, against 69 in the other direction.
