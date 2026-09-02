"""
Per-country HS6 coverage funnel, from the original workbook down to the cells a
mirror comparison can actually be made on.

ONE RULE: both books must report the same partner x HS6 x year. Nothing else is
applied - no residual-chapter exclusion, no positive-gap requirement, and the
$100,000 floor is reported as a variant rather than imposed.

Verification is at cell level: every partner x HS6 x year rebuilt from the
workbook is reconciled against the shipped src/data/cells.json, values included.
"""
import json
import os

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")

FLOOR = 100_000          # reported alongside, never imposed
RESIDUAL = {"98", "99"}  # counted and labelled, no longer removed
YEARS = list(range(2017, 2025))

cells = pd.read_pickle(os.path.join(HERE, "hs6_cells.pkl"))
stats = json.load(open(os.path.join(HERE, "hs6_stats.json"), encoding="utf-8"))
meta = json.load(open(os.path.join(ROOT, "src", "data", "meta.json"), encoding="utf-8"))
pmeta = {p["iso3"]: p for p in meta["partners"]}

# A sheet row with nothing on either side is not an observation.
empty = int(((cells["pe"] <= 0) & (cells["ui"] <= 0)).sum())
cells = cells[(cells["pe"] > 0) | (cells["ui"] > 0)].copy()
print(f"dropped {empty:,} empty cell-years (both sides zero)")

cells["chapter"] = cells["code"].str[:2]
cells["both"] = (cells["pe"] > 0) & (cells["ui"] > 0)
cells["both100k"] = (cells["pe"] > FLOOR) & (cells["ui"] > FLOOR)
cells["gap"] = cells["pe"] - cells["ui"]          # cif = 0, as the dashboard opens

b = cells[cells["both"]]

# ---- one row per partner x HS6 combination -------------------------------
agg = (cells.groupby(["iso", "code"], observed=True)
       .agg(chapter=("chapter", "first"), years=("year", "size"),
            yrs_pe=("pe", lambda s: int((s > 0).sum())),
            yrs_ui=("ui", lambda s: int((s > 0).sum())),
            yrs_both=("both", "sum"), yrs_both100k=("both100k", "sum"),
            pe=("pe", "sum"), ui=("ui", "sum"))
       .reset_index())

# totals restricted to the years both books reported - the population every
# discrepancy figure is computed on
bt = b.groupby(["iso", "code"], observed=True).agg(
    pe_both=("pe", "sum"), ui_both=("ui", "sum"),
    gap_pos=("gap", lambda s: float(s.clip(lower=0).sum())),
    gap_neg=("gap", lambda s: float((-s).clip(lower=0).sum()))).reset_index()
b100 = cells[cells["both100k"]].groupby(["iso", "code"], observed=True).agg(
    pe_b100=("pe", "sum"), ui_b100=("ui", "sum")).reset_index()
agg = (agg.merge(bt, on=["iso", "code"], how="left")
          .merge(b100, on=["iso", "code"], how="left")
          .fillna({"pe_both": 0.0, "ui_both": 0.0, "gap_pos": 0.0, "gap_neg": 0.0,
                   "pe_b100": 0.0, "ui_b100": 0.0}))

# ---- four mutually exclusive outcomes ------------------------------------
# Only the last one is kept. There is no further test: a combination both books
# reported is comparable, whatever its size, chapter, or the sign of its gap.
def outcome(r):
    if r.yrs_ui == 0:
        return "1 partner_only"    # Uzbekistan never recorded this import
    if r.yrs_pe == 0:
        return "2 uz_only"         # the partner never recorded this export
    if r.yrs_both == 0:
        return "3 no_shared_year"  # both books hold it, never in the same year
    return "4 both"                # KEPT

agg["outcome"] = [outcome(r) for r in agg.itertuples()]
agg["kept"] = agg["yrs_both"] > 0
agg["kept100k"] = agg["yrs_both100k"] > 0
agg["residual"] = agg["chapter"].isin(RESIDUAL)
agg["has_pos_gap"] = agg["gap_pos"] > FLOOR

OUTCOMES = ["1 partner_only", "2 uz_only", "3 no_shared_year", "4 both"]

# ---- per-country table ---------------------------------------------------
rows = []
for iso, g in agg.groupby("iso", observed=True):
    pm = pmeta.get(iso)
    counts = g["outcome"].value_counts()
    k = g[g["kept"]]
    rows.append({
        "iso": iso,
        "name": (pm or {}).get("name", stats["names"].get(iso, iso)),
        "region": (pm or {}).get("region", ""),
        "tier": (pm or {}).get("tier", ""),
        "coverage": (pm or {}).get("coverage", np.nan),
        "in_dashboard": pm is not None,
        "combos_source": len(g),
        "combos_uz": int((g["yrs_ui"] > 0).sum()),
        "combos_ptn": int((g["yrs_pe"] > 0).sum()),
        "combos_kept": int(g["kept"].sum()),
        "combos_kept100k": int(g["kept100k"].sum()),
        **{f"drop_{o.split(' ', 1)[1]}": int(counts.get(o, 0)) for o in OUTCOMES},
        # what the two removed rules WOULD have cost, now shown instead of applied
        "memo_residual": int(k["residual"].sum()),
        "memo_no_pos_gap": int((~k["has_pos_gap"]).sum()),
        "cellyears_source": int(g["years"].sum()),
        "cellyears_kept": int(g["yrs_both"].sum()),
        "cellyears_kept100k": int(g["yrs_both100k"].sum()),
        "val_uz_source": float(g["ui"].sum()),
        "val_ptn_source": float(g["pe"].sum()),
        "val_uz_kept": float(g["ui_both"].sum()),
        "val_ptn_kept": float(g["pe_both"].sum()),
        "val_uz_kept100k": float(g["ui_b100"].sum()),
        "val_ptn_kept100k": float(g["pe_b100"].sum()),
        "gap_pos": float(g["gap_pos"].sum()),
        "gap_neg": float(g["gap_neg"].sum()),
        "val_uz_only": float(g.loc[g["outcome"] == "2 uz_only", "ui"].sum()),
        "val_ptn_only": float(g.loc[g["outcome"] == "1 partner_only", "pe"].sum()),
    })
by_country = pd.DataFrame(rows)
by_country["pct_kept"] = by_country["combos_kept"] / by_country["combos_source"]
by_country["pct_kept100k"] = by_country["combos_kept100k"] / by_country["combos_source"]
by_country = by_country.sort_values("val_ptn_source", ascending=False).reset_index(drop=True)

# ---- the same count at HS4 and HS2, for scale -----------------------------
# HS4 is a truncation of HS6, exactly as src/lib/dataset.ts derives it. HS2 is a
# separate UN Comtrade aggregation, so it comes from the shipped dataset's own
# HS2 rows - rolling HS6 up would mix two bases that do not agree cell by cell.
def kept_counts(d: pd.DataFrame) -> pd.Series:
    d = d[(d["pe"] > 0) & (d["ui"] > 0)]
    return d.groupby("iso")["code"].nunique()

hs4 = cells.copy()
hs4["code"] = hs4["code"].str[:4]
hs4 = hs4.groupby(["iso", "code", "year"], observed=True)[["pe", "ui"]].sum().reset_index()

raw = json.load(open(os.path.join(ROOT, "src", "data", "cells.json"), encoding="utf-8"))
P, K, Y0 = raw["p"], raw["k"], raw["y0"]
ship = pd.DataFrame([(P[r[0]], K[r[1]], r[2] + Y0, r[3], r[4]) for r in raw["r"]],
                    columns=["iso", "code", "year", "pe", "ui"])
by_country["kept_hs4"] = by_country["iso"].map(kept_counts(hs4)).fillna(0).astype(int)
by_country["kept_hs2"] = by_country["iso"].map(
    kept_counts(ship[ship["code"].str.len() == 2])).fillna(0).astype(int)

# ---- cell-level reconciliation against the shipped dataset ---------------
# Stronger than comparing derived counts: every partner x HS6 x year and both of
# its values must agree with what the dashboard actually loads.
s6 = ship[ship["code"].str.len() == 6].set_index(["iso", "code", "year"]).sort_index()
mine = cells.set_index(["iso", "code", "year"])[["pe", "ui"]].round(0).astype("int64").sort_index()
only_mine = mine.index.difference(s6.index)
only_ship = s6.index.difference(mine.index)
common = mine.index.intersection(s6.index)
dpe = (mine.loc[common, "pe"] - s6.loc[common, "pe"]).abs()
dui = (mine.loc[common, "ui"] - s6.loc[common, "ui"]).abs()
recon = {
    "workbookCells": int(len(mine)), "shippedCells": int(len(s6)),
    "common": int(len(common)), "onlyWorkbook": int(len(only_mine)),
    "onlyShipped": int(len(only_ship)),
    "maxDiffPe": int(dpe.max()) if len(common) else 0,
    "maxDiffUi": int(dui.max()) if len(common) else 0,
    "cellsDiffering": int(((dpe > 1) | (dui > 1)).sum()),
}
print("cell-level reconciliation vs src/data/cells.json:")
for k_, v_ in recon.items():
    print(f"  {k_:16} {v_:,}")

agg.to_pickle(os.path.join(HERE, "combos.pkl"))
by_country.to_pickle(os.path.join(HERE, "by_country.pkl"))
json.dump({"emptyCellYears": empty, "recon": recon},
          open(os.path.join(HERE, "funnel_stats.json"), "w"))

print(f"\ncombos {len(agg):,}  partners {len(by_country)}")
print(f"kept (both books)        {int(agg['kept'].sum()):,}")
print(f"  of which both > $100k  {int(agg['kept100k'].sum()):,}")
print(by_country[["iso", "name", "combos_source", "combos_kept",
                  "combos_kept100k"]].head(10).to_string(index=False))
print("\nfewest kept combinations:")
print(by_country[by_country["in_dashboard"]]
      .nsmallest(12, "combos_kept")[["iso", "name", "combos_source", "combos_kept",
                                     "drop_uz_only", "val_uz_source"]].to_string(index=False))
