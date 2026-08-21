# Unexplained Discrepancy Analysis — Steps 1–2 diagnostics

Gara, Giammatteo & Tosti (2018), *Magic mirror in my hand*, Banca d'Italia QEF No. 445.

Reproduce with:

```bash
python analysis/step1_tariffs.py
python analysis/step2_diagnostics.py
```

Sources: `../tariffs.xlsx` (ТН ВЭД 2022, HS10, 12,813 lines) and
`../UN Comtrade monthly/UN Comtrade monthly/mirror_trade_monthly_2017_latest.csv`
(934 MB, 23 columns, monthly, both sides of the mirror, with net weight).

**Two findings change the design. Both are in 2a/2b and neither blocks the model.**

---

## Step 1 — tariff schedule

Parse rate **100.00%** — 12,813 of 12,813 lines. No failures, so nothing was
dropped and the freight sample in Step 3 is not silently biased.

| Rate form | Lines | Share |
|---|---:|---:|
| Plain ad valorem — `10` | 10,879 | 84.9% |
| Compound minimum — `20, но не менее 0,3 долл. США за кг` | 1,520 | 11.9% |
| Multi-tier — `1. 5 %` / `2. 15 %` | 254 | 2.0% |
| Additive — `70 + 3 долл. США за куб. см` | 160 | 1.2% |
| Pure specific — `5 долл. США за кг` | 0 | — |

Notes on the parse:

- **Pure specific rates do not occur** in this schedule. Every line has an ad
  valorem component; specific amounts appear only as a floor or an addition.
- Multi-tier cells take **tier 1 as the base rate** and record the maximum ad
  valorem across tiers in `mfn_adv_max`. Tiers are not always plain: several read
  `1. 15 + 1,25 долл. США за куб. см` / `2. 30 + 3 долл. США за куб. см`, so the
  tier parser is the full grammar, recursively.
- Three forms of the same thing had to be normalised: the separator is `за` or
  `/`, the decimal mark is a comma, and units appear abbreviated and spelled out
  (`л` / `литр`), sometimes with a trailing period.
- **Independent cross-check:** the sheet carries its own specific-unit column
  (`Код ед.изм. специфической ставки`). Comparing the unit my parser extracted
  from the rate text against that column across all 1,699 lines carrying a
  specific component gives **0 disagreements**.

Outputs: `out/tariffs_hs10.csv` (columns `hs10, hs6, hs4, hs2, mfn_adv,
mfn_spec_usd, mfn_spec_unit, rate_type, mfn_adv_max`, plus `tiers`,
`non_mfn_adv`, `non_mfn_adv_max` and the sheet's declared unit for audit) and
`out/tariffs_hs6.csv`.

**HS6 aggregate: 5,612 lines.** `freight_clean_sample = TRUE` on **2,517
(44.9%)** — every HS10 line inside the HS6 at zero duty, with no specific or
compound component and no tiering. Only 2 HS6 are zero-duty throughout yet
excluded by a specific or tiered component, so the flag is essentially "zero
duty" and the sample is large: 45% of the nomenclature is a comfortable base for
fitting freight and extrapolating.

Mean MFN ad valorem across HS6 lines: 6.50%.

---

## Step 2a — monthly → annual

Aggregated to **partner × HS6 × year**. Monthly data is kept only for the trend
panel, never for the model: a shipment leaving China in January is booked by
Uzbekistan in February or March, and at monthly frequency that timing mismatch
would masquerade as discrepancy — largest for the most distant partners, which is
exactly the false pattern the model must not manufacture.

Calendar months each side actually filed:

| Year | Uzbek book | Partner book | Status |
|---:|---:|---:|---|
| 2017 | 0 | 12 | no Uzbek book — unusable for the mirror |
| 2018 | 0 | 12 | no Uzbek book — unusable for the mirror |
| 2019 | 12 | 12 | complete |
| 2020 | 12 | 12 | complete |
| 2021 | 12 | 12 | complete |
| 2022 | 12 | 12 | complete |
| 2023 | 12 | 12 | complete |
| 2024 | 12 | 12 | complete |
| 2025 | 10 | 12 | partial — comparable through October |
| 2026 | 4 | 6 | partial — comparable through April |

**6 complete mirror years: 2019–2024.** Above the 4-year viability floor, but
worth being explicit that this is *not* the dashboard's window — the dashboard
screens 2017–2024, and the model can only speak to 2019 onward.

I measured completeness as *months filed per side per year*. An earlier version
counted months per cell and reported 2024 as a 10-month year, which was wrong:
it measured how sparse individual cells are, not whether the year is present.

The annual panel (`out/annual_cells.csv`, 439,925 rows):

| | Cells |
|---|---:|
| partner × HS6 × year, either side | 439,925 |
| matched on both sides | 157,349 (35.8%) |
| matched and both sides ≥ $50,000 | 51,047 |

90 distinct partners, 4,768 distinct HS6. By year:

| Year | Matched | Partners | Both sides ≥ $50k |
|---:|---:|---:|---:|
| 2019 | 22,554 | 68 | 7,510 |
| 2020 | 20,977 | 70 | 7,115 |
| 2021 | 22,371 | 69 | 7,773 |
| 2022 | 20,076 | 73 | 6,708 |
| 2023 | 22,841 | 67 | 7,715 |
| 2024 | 22,838 | 72 | 7,438 |
| 2025 | 18,194 | 61 | 5,179 |
| 2026 | 7,498 | 55 | 1,609 |

---

## Step 2b — mirror coverage (the go/no-go)

**GO, from 2019.** Both reporting sides are present:
`partner_exports_to_uzbekistan` and `uzbekistan_imports`. HS6 rows and value by
year:

| Year | UZ rows | UZ value | UZ partners | Partner rows | Partner value | Partner countries |
|---:|---:|---:|---:|---:|---:|---:|
| 2017 | — | — | — | 99,356 | $12.1B | 78 |
| 2018 | — | — | — | 115,436 | $17.0B | 74 |
| 2019 | 149,848 | $21.9B | 134 | 130,158 | $19.5B | 78 |
| 2020 | 143,106 | $20.0B | 124 | 120,727 | $18.4B | 82 |
| 2021 | 160,546 | $23.9B | 143 | 133,837 | $21.3B | 81 |
| 2022 | 163,512 | $28.3B | 148 | 125,053 | $20.7B | 87 |
| 2023 | 178,184 | $36.8B | 158 | 142,700 | $28.6B | 78 |
| 2024 | 186,017 | $35.3B | 144 | 139,225 | $23.2B | 75 |
| 2025 | 179,825 | $38.1B | 147 | 120,279 | $12.7B | 71 |
| 2026 | 65,264 | $14.7B | 132 | 32,772 | $2.7B | 57 |

Two structural facts to carry forward:

1. **2017 and 2018 have no Uzbek book at all.** National customs data is not
   needed — the mirror works from 2019 — but the model's window is 2019–2024.
2. **Uzbekistan reports roughly twice as many partners as file against it**
   (144 versus 75 in 2024). Matched cells exist only on the overlap, ~90
   partners across the whole panel. The 60-odd partners Uzbekistan books but who
   file nothing monthly are invisible to this model by construction, and that
   absence is not evidence of anything.

---

## Step 2c — net weight coverage

**83.1% of rows have a positive net weight.** Above the 50% floor, so the freight
model is not running on a biased rump.

| Year | Partner side | Uzbek side |
|---:|---:|---:|
| 2019 | 87.2% | 81.3% |
| 2020 | 86.9% | 71.3% |
| 2021 | 87.7% | 82.3% |
| 2022 | 86.6% | 82.4% |
| 2023 | 87.1% | 82.1% |
| 2024 | 87.0% | 80.1% |
| 2025 | 85.2% | 81.5% |

The binding number is the **partner side, 85–88%**, because the specification
uses the exporter's weight and FOB value — the CIF side is the contaminated one
and its weaker coverage (71% in 2020) does not enter the freight regressor.

By partner, coverage is worst where volumes are thin: TKM 65.4%, USA 72.4%, and a
tail at 50–55% (NZL, ARG, ISL, ZAF, CHL, KEN, SAU, ISR). Among the largest
partners it is 82–92% (CHN 90.3%, RUS 91.1%, TUR 91.5%, KAZ 82.7%). Using the
HS6 global median unit value rather than each cell's own — as the specification
requires — makes the weak-coverage partners much less consequential.

---

## Step 2d — cluster thinness (decides the model structure)

Counted in modelling observations, i.e. matched partner × HS6 × year cells.

All matched cells (157,349 observations):

| Cluster | Clusters | Singletons | ≤3 obs | Median | p90 |
|---|---:|---:|---:|---:|---:|
| partner × HS4 | 19,276 | 23.8% | 45.8% | 4 | 20 |
| partner × HS2 | 3,456 | 14.1% | 28.9% | 10 | 105 |

On the set the model will actually see — both sides ≥ $50,000, 51,047
observations:

| Cluster | Clusters | Singletons | ≤3 obs | Median | p90 |
|---|---:|---:|---:|---:|---:|
| partner × HS4 | 7,786 | **26.1%** | 49.6% | 4 | 15 |
| partner × HS2 | 1,944 | 17.9% | 34.3% | 6 | 53 |

**Recommendation: partner × HS4.** Singletons are 26.1%, well inside the 60%
decision rule, and HS4 keeps 7,786 clusters against HS2's 1,944 — four times the
resolution at a singleton rate that shrinkage handles honestly.

One caveat to set expectations: **49.6% of HS4 clusters have three or fewer
observations.** Their posterior intervals will be wide, so Tier 2
("insufficient observations to distinguish from normal variation") will be a
large share of anything flagged, and singletons get rolled up to partner × HS2
rather than ranked. That is the two-tier rule doing its job, not a failure — but
the dashboard copy should not promise more precision than half the clusters can
support.

---

## Step 2e — HS version check

The schedule is ТН ВЭД 2022; the trade data spans 2017–2026 and will contain
HS2017 codes.

**98.7% of matched cells and 98.3% of value carry an HS6 that exists in the
schedule.** Far above the 85% threshold, so no correlation table is needed.

110 HS6 codes do not match. The largest by value:

| HS6 | Value | Reading |
|---|---:|---|
| 999999 | $371.8M | Comtrade's "commodity not specified" residual, not a version problem |
| 300220 | $349.3M | vaccines — HS2017 code, resplit in HS2022 |
| 870120 | $258.0M | road tractors — resplit in HS2022 |
| 851712 | $158.6M | mobile phones — HS2017; HS2022 uses 851713/851714 |
| 940190 | $113.1M | seat parts — resplit |
| 340220 | $94.9M | surfactant preparations — resplit |
| 851770 | $90.9M | telephony parts — resplit |
| 940510 | $81.4M | chandeliers — resplit |
| 382200 | $76.7M | diagnostic reagents — resplit |
| 940540 | $67.5M | other lamps — resplit |

So there *is* genuine HS2017/HS2022 drift, but it is 1.3% of cells and 1.7% of
value, concentrated in codes HS2022 resplit. Those cells simply carry no tariff
rate, which matters only for the `tariff` control in Step 4 — I would leave them
in with a missing-tariff indicator rather than drop 1.7% of the value, and will
flag which choice you prefer.

---

## What I need before Step 3

1. **Cluster level** — confirm partner × HS4 (recommended above).
2. **Model window** — 2019–2024, the six complete mirror years. Optionally add
   2025 through October as a partial year; I would exclude it, since a
   ten-month year mixes with twelve-month years inside a single random effect.
3. **Gravity data.** Distance, contiguity and landlocked status are not in this
   repo and CEPII is not vendored. Either I fetch CEPII Gravity, or I construct
   great-circle distances from capital coordinates and label them clearly as an
   approximation. Tell me which; the CEPII route needs a download.
4. **Python packages.** `statsmodels` and `scipy` are not installed in this
   environment (pandas 3.0.5 and numpy 2.5.2 are). `mixedlm` in Step 4 and the
   placebo test in Step 3 both need them.
5. **Unmatched HS6** — keep with a missing-tariff flag (my recommendation) or
   drop.

Nothing in these diagnostics forces the design to change beyond the window. The
one substantive constraint is that the model speaks to 2019–2024 while the rest
of the dashboard screens 2017–2024, and the section will have to say so plainly.
