"""Flattens the curated mirror-trade workbook into the compact JSON that
scripts/build-from-excel.ts consumes.

The workbook holds 32 data sheets (8 years x {partner exports, UZB imports} x
{HS2, HS6}). This emits one record per (partner ISO x HS level x code x year) with
both mirror sides merged: pe = partner-reported exports to Uzbekistan (FOB),
ui = Uzbekistan-reported imports (CIF), uw/pw = net weight on each side. A side
that did not report is left absent rather than zero-filled.

Run via `npm run data:excel`.
"""
import json
import os

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "uzbekistan_mirror_trade_hs2017_fixed_2017_2024.xlsx")
OUT = os.path.join(ROOT, "data", "raw", "excel-cells.json")

COLS = [
    "period", "mirror_side", "uzbekistan_trade_partner_iso",
    "uzbekistan_trade_partner_desc", "hs_level", "cmd_code", "cmd_desc",
    "net_wgt", "primary_value",
]

# aggregate pseudo-partners that would double-count real bilateral flows
DROP_ISO = {"W00", "_X", "WLD", "NULL", "nan", ""}

xl = pd.ExcelFile(SRC)
frames = []
for sheet in [s for s in xl.sheet_names if s[0].isdigit()]:
    frames.append(xl.parse(sheet, usecols=lambda c: c in COLS))
    print("read", sheet, flush=True)
df = pd.concat(frames, ignore_index=True)

df["side"] = df["mirror_side"].str.startswith("partner").map({True: "pe", False: "ui"})
df["iso"] = df["uzbekistan_trade_partner_iso"].astype(str).str.strip()
df["name"] = df["uzbekistan_trade_partner_desc"].astype(str).str.strip()
df["lvl"] = df["hs_level"].astype(int)
df["code"] = [str(int(c)).zfill(lv) for c, lv in zip(df["cmd_code"], df["lvl"])]
df["year"] = df["period"].astype(int)
df["val"] = pd.to_numeric(df["primary_value"], errors="coerce").fillna(0.0)
df["wgt"] = pd.to_numeric(df["net_wgt"], errors="coerce").fillna(0.0)
df = df[~df["iso"].isin(DROP_ISO)]

grouped = (df.groupby(["iso", "lvl", "code", "year", "side"], observed=True)
             .agg(val=("val", "sum"), wgt=("wgt", "sum"))
             .reset_index())

piv = grouped.pivot_table(index=["iso", "lvl", "code", "year"], columns="side",
                          values=["val", "wgt"], observed=True,
                          fill_value=0.0).reset_index()
piv.columns = ["".join(c).strip() for c in piv.columns.to_flat_index()]
for col in ["valpe", "valui", "wgtpe", "wgtui"]:
    if col not in piv.columns:
        piv[col] = 0.0

names = (df.sort_values("val", ascending=False).drop_duplicates("iso")
           .set_index("iso")["name"].to_dict())
hs6desc = (df[df.lvl == 6].sort_values("val", ascending=False).drop_duplicates("code")
             .set_index("code")["cmd_desc"].astype(str).to_dict())
hs2desc = (df[df.lvl == 2].sort_values("val", ascending=False).drop_duplicates("code")
             .set_index("code")["cmd_desc"].astype(str).to_dict())

recs = []
for iso, lvl, code, year, vpe, vui, wpe, wui in zip(
        piv["iso"], piv["lvl"], piv["code"], piv["year"],
        piv["valpe"], piv["valui"], piv["wgtpe"], piv["wgtui"]):
    rec = {"p": iso, "l": int(lvl), "k": code, "y": int(year),
           "pe": round(float(vpe)), "ui": round(float(vui))}
    if wpe > 0 and wui > 0:
        rec["pw"] = round(float(wpe))
        rec["uw"] = round(float(wui))
    recs.append(rec)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as fh:
    json.dump({"cells": recs, "partnerNames": names,
               "hs6desc": hs6desc, "hs2desc": hs2desc}, fh, ensure_ascii=False)

print("wrote", OUT, round(os.path.getsize(OUT) / 1e6, 1), "MB;",
      len(recs), "records;", piv["iso"].nunique(), "partners")
