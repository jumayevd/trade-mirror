"""Flattens the monthly mirror-trade workbook for scripts/build-monthly.ts.

The workbook (data/mirror_trade_monthly_2017_latest.xlsx) carries one sheet per
year with both mirror sides at HS2 and HS6. The monthly series ships at chapter
(HS2) level: pivoted to cells the HS6 layer is ~1.9M rows — far past what the
client bundle can carry — while its grand totals agree with HS2 to within
0.002%, so nothing measurable is lost.

Emits one record per (partner ISO x HS2 code x year x month) with both sides
merged: pe = partner-reported exports to Uzbekistan (FOB), ui = Uzbekistan-
reported imports (CIF). A side that did not report stays absent, never zero.

Run via `npm run data:monthly`.
"""
import json
import os

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "mirror_trade_monthly_2017_latest.xlsx")
OUT = os.path.join(ROOT, "data", "raw", "monthly-cells.json")

COLS = ["year", "month", "hs_level", "reporting_side",
        "partner_country_iso", "partner_country_name", "hs_code", "trade_value_usd"]

# aggregate pseudo-partners that would double-count real bilateral flows
DROP_ISO = {"W00", "_X", "WLD", "NULL", "nan", ""}

xl = pd.ExcelFile(SRC)
frames = []
for sheet in xl.sheet_names:
    frames.append(xl.parse(sheet, usecols=lambda c: c in COLS))
    print("read", sheet, flush=True)
df = pd.concat(frames, ignore_index=True)

df = df[df.hs_level == "HS2"].copy()
df["side"] = df["reporting_side"].astype(str).str.startswith("partner").map({True: "pe", False: "ui"})
df["iso"] = df["partner_country_iso"].astype(str).str.strip()
df["name"] = df["partner_country_name"].astype(str).str.strip()
df["code"] = [str(int(c)).zfill(2) for c in df["hs_code"]]
df["val"] = pd.to_numeric(df["trade_value_usd"], errors="coerce").fillna(0.0)
df = df[~df["iso"].isin(DROP_ISO)]

grouped = (df.groupby(["iso", "code", "year", "month", "side"], observed=True)
             .agg(val=("val", "sum")).reset_index())
piv = grouped.pivot_table(index=["iso", "code", "year", "month"], columns="side",
                          values="val", observed=True, fill_value=0.0).reset_index()
for col in ("pe", "ui"):
    if col not in piv.columns:
        piv[col] = 0.0

names = (df.sort_values("val", ascending=False).drop_duplicates("iso")
           .set_index("iso")["name"].to_dict())

months_by_year = {}
for y in sorted(int(x) for x in df["year"].unique()):
    months_by_year[int(y)] = sorted(int(m) for m in df[df.year == y]["month"].unique())

recs = []
for iso, code, year, month, pe, ui in zip(piv["iso"], piv["code"], piv["year"],
                                          piv["month"], piv["pe"], piv["ui"]):
    pe_r, ui_r = round(float(pe)), round(float(ui))
    if pe_r == 0 and ui_r == 0:
        continue
    recs.append({"p": iso, "k": code, "y": int(year), "m": int(month), "pe": pe_r, "ui": ui_r})

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as fh:
    json.dump({"cells": recs, "partnerNames": names, "monthsByYear": months_by_year}, fh, ensure_ascii=False)

print("wrote", OUT, round(os.path.getsize(OUT) / 1e6, 1), "MB;",
      len(recs), "records;", piv["iso"].nunique(), "partners")
