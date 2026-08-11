"""Flattens the monthly mirror-trade workbook for scripts/build-monthly.ts.

The workbook (data/mirror_trade_monthly_2017_latest.xlsx) carries one sheet per
year with both mirror sides at HS2 and HS6. Both levels ship: HS2 as the
always-loaded chapter series, HS6 as a separate detail file the client fetches
on demand (it is ~1.9M cells — far past what the main bundle can carry). HS4 is
never emitted: like the yearly books it is the exact truncation of HS6, derived
at load time.

The HS2 and HS6 sheets are separate UN Comtrade aggregations that disagree
cell-by-cell, so each level is emitted from its own rows and never synthesized
from the other (see scripts/build-from-excel.ts for the yearly precedent).

Emits one record per (partner ISO x code x year x month) with both sides
merged: pe = partner-reported exports to Uzbekistan (FOB), ui = Uzbekistan-
reported imports (CIF). A side that did not report stays absent, never zero.

Run via `npm run data:monthly`.
"""
import json
import os

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "mirror_trade_monthly_2017_latest.xlsx")
OUT_HS2 = os.path.join(ROOT, "data", "raw", "monthly-cells.json")
OUT_HS6 = os.path.join(ROOT, "data", "raw", "monthly-cells-hs6.json")

COLS = ["year", "month", "hs_level", "reporting_side",
        "partner_country_iso", "partner_country_name", "hs_code", "trade_value_usd"]

# aggregate pseudo-partners that would double-count real bilateral flows
DROP_ISO = {"W00", "_X", "WLD", "NULL", "nan", ""}

try:
    import python_calamine  # noqa: F401  (pandas engine="calamine")
    ENGINE = "calamine"
except ImportError:
    ENGINE = "openpyxl"

xl = pd.ExcelFile(SRC, engine=ENGINE)
frames = []
for sheet in xl.sheet_names:
    frames.append(xl.parse(sheet, usecols=lambda c: c in COLS))
    print("read", sheet, flush=True)
df = pd.concat(frames, ignore_index=True)

df["side"] = df["reporting_side"].astype(str).str.startswith("partner").map({True: "pe", False: "ui"})
df["iso"] = df["partner_country_iso"].astype(str).str.strip()
df["name"] = df["partner_country_name"].astype(str).str.strip()
df["val"] = pd.to_numeric(df["trade_value_usd"], errors="coerce").fillna(0.0)
df = df[~df["iso"].isin(DROP_ISO)]


def pivot_level(level: str, width: int) -> pd.DataFrame:
    part = df[df.hs_level == level].copy()
    part["code"] = [str(int(c)).zfill(width) for c in part["hs_code"]]
    grouped = (part.groupby(["iso", "code", "year", "month", "side"], observed=True)
                   .agg(val=("val", "sum")).reset_index())
    piv = grouped.pivot_table(index=["iso", "code", "year", "month"], columns="side",
                              values="val", observed=True, fill_value=0.0).reset_index()
    for col in ("pe", "ui"):
        if col not in piv.columns:
            piv[col] = 0.0
    return piv


def records(piv: pd.DataFrame, as_dict: bool) -> list:
    recs = []
    for iso, code, year, month, pe, ui in zip(piv["iso"], piv["code"], piv["year"],
                                              piv["month"], piv["pe"], piv["ui"]):
        pe_r, ui_r = round(float(pe)), round(float(ui))
        if pe_r == 0 and ui_r == 0:
            continue
        if as_dict:
            recs.append({"p": iso, "k": code, "y": int(year), "m": int(month), "pe": pe_r, "ui": ui_r})
        else:
            recs.append([iso, code, int(year), int(month), pe_r, ui_r])
    return recs


names = (df.sort_values("val", ascending=False).drop_duplicates("iso")
           .set_index("iso")["name"].to_dict())

months_by_year = {}
for y in sorted(int(x) for x in df["year"].unique()):
    months_by_year[int(y)] = sorted(int(m) for m in df[df.year == y]["month"].unique())

os.makedirs(os.path.dirname(OUT_HS2), exist_ok=True)

piv2 = pivot_level("HS2", 2)
recs2 = records(piv2, as_dict=True)
with open(OUT_HS2, "w", encoding="utf-8") as fh:
    json.dump({"cells": recs2, "partnerNames": names, "monthsByYear": months_by_year}, fh, ensure_ascii=False)
print("wrote", OUT_HS2, round(os.path.getsize(OUT_HS2) / 1e6, 1), "MB;",
      len(recs2), "records;", piv2["iso"].nunique(), "partners")

piv6 = pivot_level("HS6", 6)
recs6 = records(piv6, as_dict=False)
with open(OUT_HS6, "w", encoding="utf-8") as fh:
    # positional rows [iso, code, year, month, pe, ui] keep the big file lean
    json.dump({"cells": recs6}, fh, ensure_ascii=False)
print("wrote", OUT_HS6, round(os.path.getsize(OUT_HS6) / 1e6, 1), "MB;",
      len(recs6), "records;", piv6["iso"].nunique(), "partners")
