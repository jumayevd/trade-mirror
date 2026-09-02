"""
Read the ORIGINAL workbook's 16 HS6 sheets and write a tidy intermediate.

Nothing is filtered here except what is genuinely unusable, and every drop is
counted so the report can show the funnel from the raw sheet down.

Run order (the first step takes several minutes - it reads a 72 MB workbook):

    python analysis/hs6_coverage_parse.py     # workbook  -> out/hs6_cells.pkl
    python analysis/hs6_coverage_funnel.py    # funnel + reconciliation vs cells.json
    python analysis/hs6_coverage_report.py    # -> out/hs6_coverage_by_country.xlsx
    python analysis/hs6_coverage_check.py     # audits every formula in the report

The report's formulas carry no cached values: no recalculation engine is
available on this machine, so the workbook is written with fullCalcOnLoad and
hs6_coverage_check.py verifies each formula's references by hand instead.
"""
import json
import os

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "uzbekistan_mirror_trade_hs2017_fixed_2017_2024.xlsx")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")

COLS = ["period", "mirror_side", "uzbekistan_trade_partner_iso",
        "uzbekistan_trade_partner_desc", "hs_level", "cmd_code", "cmd_desc",
        "net_wgt", "primary_value"]

# the same aggregate pseudo-partners scripts/extract-excel.py removes: these are
# "World" / "special categories" rollups that would double-count real bilateral flows
DROP_ISO = {"W00", "_X", "WLD", "NULL", "nan", ""}

xl = pd.ExcelFile(SRC)
sheets = [s for s in xl.sheet_names if s.endswith("HS6")]
print(f"{len(sheets)} HS6 sheets", flush=True)

frames, sheet_rows = [], []
for s in sheets:
    d = xl.parse(s, usecols=lambda c: c in COLS)
    d["sheet"] = s
    sheet_rows.append({"sheet": s, "rows": len(d)})
    frames.append(d)
    print(f"  read {s}: {len(d):,} rows", flush=True)

df = pd.concat(frames, ignore_index=True)
raw_rows = len(df)

df["side"] = df["mirror_side"].str.startswith("partner").map({True: "pe", False: "ui"})
df["iso"] = df["uzbekistan_trade_partner_iso"].astype(str).str.strip()
df["name"] = df["uzbekistan_trade_partner_desc"].astype(str).str.strip()
df["code"] = [str(int(c)).zfill(6) for c in df["cmd_code"]]
df["year"] = df["period"].astype(int)
df["val"] = pd.to_numeric(df["primary_value"], errors="coerce").fillna(0.0)

agg_mask = df["iso"].isin(DROP_ISO)
agg_rows = int(agg_mask.sum())
agg_value = float(df.loc[agg_mask, "val"].sum())
df = df[~agg_mask]

yr_mask = df["year"].between(2017, 2024)
out_of_window = int((~yr_mask).sum())
df = df[yr_mask]

names = (df.sort_values("val", ascending=False).drop_duplicates("iso")
           .set_index("iso")["name"].to_dict())

# one row per partner x code x year, both sides side by side - the same shape
# scripts/extract-excel.py produces
g = (df.groupby(["iso", "code", "year", "side"], observed=True)["val"].sum()
       .unstack("side", fill_value=0.0).reset_index())
for c in ("pe", "ui"):
    if c not in g.columns:
        g[c] = 0.0
g = g[["iso", "code", "year", "pe", "ui"]]

g.to_pickle(os.path.join(OUT, "hs6_cells.pkl"))
with open(os.path.join(OUT, "hs6_stats.json"), "w", encoding="utf-8") as fh:
    json.dump({
        "sheets": sheet_rows,
        "rawRows": raw_rows,
        "aggregatePartnerRows": agg_rows,
        "aggregatePartnerValue": agg_value,
        "outOfWindowRows": out_of_window,
        "tidyRows": int(len(df)),
        "cellYears": int(len(g)),
        "partners": int(g["iso"].nunique()),
        "codes": int(g["code"].nunique()),
        "names": names,
    }, fh, ensure_ascii=False)

print(f"\nraw sheet rows        {raw_rows:,}")
print(f"aggregate-ISO rows    {agg_rows:,}  (${agg_value/1e9:.1f}B)")
print(f"out-of-window rows    {out_of_window:,}")
print(f"tidy rows             {len(df):,}")
print(f"partner x code x year {len(g):,}")
print(f"partners {g['iso'].nunique()}  codes {g['code'].nunique()}")
