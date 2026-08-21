"""
Step 2 - diagnostics on the monthly UN Comtrade mirror extract. Go/no-go before
any model is fitted.

    python analysis/step2_diagnostics.py

Streams the ~934 MB monthly CSV once, writing analysis/out/annual_cells.csv (the
annual panel every later step reads) plus a printed report covering:

    2a  monthly -> annual, and how many complete years exist
    2b  mirror coverage: is Uzbekistan present as REPORTER, not only as partner
    2c  net weight coverage, by year and by partner
    2d  cluster thinness at partner x HS4 and partner x HS2
    2e  HS-version agreement between the trade data and the TN VED 2022 schedule

Modelling is annual, never monthly: a shipment leaving China in January is
recorded by Uzbekistan in February or March, so at monthly frequency the timing
mismatch would masquerade as discrepancy — and would be largest for the most
distant partners, manufacturing exactly the pattern the model is meant to detect.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
SRC = ROOT.parent.parent / "UN Comtrade monthly" / "UN Comtrade monthly" / "mirror_trade_monthly_2017_latest.csv"
TARIFF_HS6 = OUT / "tariffs_hs6.csv"

COLS = ["year", "month", "hs_level", "reporting_side", "reporter_iso", "partner_iso",
        "flow", "hs_code", "trade_value_usd", "net_weight_kg"]
CHUNK = 2_000_000
#: A cell side must clear this to be worth comparing; small denominators produce absurd ratios.
MIN_SIDE_USD = 50_000

UZ_SIDE = "uzbekistan_imports"


def rule(title: str) -> None:
    print(f"\n{'=' * 78}\n{title}\n{'=' * 78}")


def pad(s: pd.Series, width: int) -> pd.Series:
    """CSV strips leading zeros from HS codes; chapter 05 must not become '5'."""
    return s.astype("string").str.strip().str.zfill(width)


def stream() -> tuple[pd.DataFrame, ...]:
    """One pass: annual HS6 cells per side, plus the row-level coverage counters."""
    cells: list[pd.DataFrame] = []
    side_year: list[pd.DataFrame] = []
    weight_year: list[pd.DataFrame] = []
    weight_partner: list[pd.DataFrame] = []
    calendar: list[pd.DataFrame] = []
    rows = 0

    reader = pd.read_csv(SRC, usecols=COLS, chunksize=CHUNK, low_memory=False,
                         dtype={"hs_code": "string", "reporting_side": "category",
                                "hs_level": "category", "flow": "category"})
    for i, ch in enumerate(reader, 1):
        rows += len(ch)
        # the counterparty, whichever side of the mirror filed the record
        ch["ctr"] = np.where(ch["reporting_side"].astype(str) == UZ_SIDE,
                             ch["partner_iso"].astype(str), ch["reporter_iso"].astype(str))
        ch["has_w"] = ch["net_weight_kg"].notna() & (ch["net_weight_kg"] > 0)

        side_year.append(ch.groupby(["reporting_side", "year", "hs_level"], observed=True)
                         .agg(rows=("trade_value_usd", "size"),
                              value=("trade_value_usd", "sum"),
                              partners=("ctr", "nunique")).reset_index())
        # Which calendar months each side actually filed - the only sound test of a
        # year's completeness. Counting months per CELL measures how sparse the
        # cells are, not whether the year is present.
        calendar.append(ch.groupby(["reporting_side", "year", "month"], observed=True)
                        .agg(rows=("trade_value_usd", "size")).reset_index())
        weight_year.append(ch.groupby(["reporting_side", "year"], observed=True)
                           .agg(rows=("has_w", "size"), with_w=("has_w", "sum")).reset_index())
        weight_partner.append(ch.groupby(["ctr"], observed=True)
                              .agg(rows=("has_w", "size"), with_w=("has_w", "sum"),
                                   value=("trade_value_usd", "sum")).reset_index())

        h6 = ch[ch["hs_level"].astype(str) == "HS6"].copy()
        h6["hs6"] = pad(h6["hs_code"], 6)
        cells.append(h6.groupby(["reporting_side", "ctr", "hs6", "year"], observed=True)
                     .agg(value=("trade_value_usd", "sum"),
                          weight=("net_weight_kg", "sum"),
                          months=("month", "nunique")).reset_index())
        print(f"  chunk {i}: {rows:,} rows read", flush=True)

    def merge(parts: list[pd.DataFrame], keys: list[str], sums: dict[str, str]) -> pd.DataFrame:
        df = pd.concat(parts, ignore_index=True)
        return df.groupby(keys, observed=True).agg(**{k: (k, v) for k, v in sums.items()}).reset_index()

    return (
        merge(cells, ["reporting_side", "ctr", "hs6", "year"],
              {"value": "sum", "weight": "sum", "months": "max"}),
        merge(side_year, ["reporting_side", "year", "hs_level"],
              {"rows": "sum", "value": "sum", "partners": "max"}),
        merge(weight_year, ["reporting_side", "year"], {"rows": "sum", "with_w": "sum"}),
        merge(weight_partner, ["ctr"], {"rows": "sum", "with_w": "sum", "value": "sum"}),
        merge(calendar, ["reporting_side", "year", "month"], {"rows": "sum"}),
    )


def thinness(obs: pd.DataFrame, level: str) -> dict:
    """Cluster sizes at one HS level, counted in modelling observations."""
    key = obs["ctr"] + "|" + obs[level]
    sizes = key.value_counts()
    return {
        "clusters": len(sizes),
        "singleton_share": float((sizes == 1).mean()),
        "le3_share": float((sizes <= 3).mean()),
        "median": float(sizes.median()),
        "p90": float(sizes.quantile(0.9)),
        "obs": len(obs),
    }


def main() -> int:
    if not SRC.exists():
        print(f"missing {SRC}", file=sys.stderr)
        return 1
    if not TARIFF_HS6.exists():
        print("run analysis/step1_tariffs.py first", file=sys.stderr)
        return 1
    OUT.mkdir(parents=True, exist_ok=True)

    print(f"reading {SRC.name} ({SRC.stat().st_size / 1e6:.0f} MB)")
    cells, side_year, w_year, w_partner, calendar = stream()

    # ---------------- 2b: mirror coverage, the go/no-go ----------------
    rule("2b. Mirror coverage - is Uzbekistan present as REPORTER?")
    piv = side_year[side_year["hs_level"].astype(str) == "HS6"].pivot_table(
        index="year", columns="reporting_side", values=["rows", "partners", "value"], observed=True)
    with pd.option_context("display.width", 200, "display.max_columns", 50):
        print(piv.to_string(float_format=lambda v: f"{v:,.0f}"))
    sides = set(side_year["reporting_side"].astype(str))
    print(f"\nreporting sides present: {sorted(sides)}")
    if UZ_SIDE not in sides:
        print("STOP: no Uzbekistan-as-reporter rows; national customs data is needed instead")
        return 1

    # ---------------- 2a: annual panel ----------------
    rule("2a. Monthly -> annual")
    uz = cells[cells["reporting_side"].astype(str) == UZ_SIDE].rename(
        columns={"value": "uz_imports_cif", "weight": "uz_weight", "months": "uz_months"})
    pt = cells[cells["reporting_side"].astype(str) != UZ_SIDE].rename(
        columns={"value": "ptn_exports_fob", "weight": "ptn_weight", "months": "ptn_months"})
    panel = uz.drop(columns=["reporting_side"]).merge(
        pt.drop(columns=["reporting_side"]), on=["ctr", "hs6", "year"], how="outer")
    panel["hs4"] = panel["hs6"].str[:4]
    panel["hs2"] = panel["hs6"].str[:2]
    for c in ["uz_imports_cif", "ptn_exports_fob", "uz_weight", "ptn_weight"]:
        panel[c] = panel[c].fillna(0.0)
    panel["matched"] = (panel["uz_imports_cif"] > 0) & (panel["ptn_exports_fob"] > 0)

    per_side = (calendar.groupby(["reporting_side", "year"], observed=True)["month"]
                .nunique().unstack(0).fillna(0).astype(int))
    ptn_cols = [c for c in per_side.columns if c != UZ_SIDE]
    print("calendar months filed, by side:")
    print(f"  {'year':>6}  {'UZ book':>7}  {'partners':>8}   status")
    complete = []
    for y in sorted(per_side.index):
        uzm = int(per_side[UZ_SIDE].get(y, 0)) if UZ_SIDE in per_side.columns else 0
        ptm = int(per_side.loc[y, ptn_cols].max()) if ptn_cols else 0
        if uzm == 0:
            status = "no Uzbek book - unusable for the mirror"
        elif uzm == 12 and ptm == 12:
            status = "complete on both sides"
            complete.append(int(y))
        else:
            status = f"partial - comparable through month {min(uzm, ptm)}"
        print(f"  {int(y):>6}  {uzm:>7}  {ptm:>8}   {status}")
    print()
    print(f"complete mirror years: {len(complete)} ({', '.join(map(str, complete))})")
    if len(complete) < 4:
        print("WARNING: fewer than 4 complete years; the model may not be viable")

    matched = panel[panel["matched"]]
    print(f"\nannual cells (partner x HS6 x year): {len(panel):,}")
    print(f"  matched on both sides:              {len(matched):,} ({100 * len(matched) / len(panel):.1f}%)")
    big = matched[(matched["uz_imports_cif"] >= MIN_SIDE_USD) & (matched["ptn_exports_fob"] >= MIN_SIDE_USD)]
    print(f"  matched and both sides >= ${MIN_SIDE_USD:,}: {len(big):,}")
    print(f"  distinct partners: {matched['ctr'].nunique()}   distinct HS6: {matched['hs6'].nunique()}")
    print("\nmatched cells and partners by year:")
    for y, g in matched.groupby("year", observed=True):
        gb = big[big["year"] == y]
        print(f"  {int(y)}: {len(g):>6,} cells, {g['ctr'].nunique():>3} partners"
              f"   | >= ${MIN_SIDE_USD // 1000}k both sides: {len(gb):>6,}")

    # ---------------- 2c: net weight ----------------
    rule("2c. Net weight coverage")
    w_year["share"] = w_year["with_w"] / w_year["rows"]
    overall = w_year["with_w"].sum() / w_year["rows"].sum()
    print(f"overall rows with positive net weight: {100 * overall:.1f}%")
    if overall < 0.5:
        print("FLAG: below 50% - the Step 3 freight model would run on a biased subsample")
    print("\nby year and side:")
    for side, g in w_year.groupby("reporting_side", observed=True):
        print(f"  {side}")
        for _, r in g.sort_values("year").iterrows():
            print(f"    {int(r['year'])}: {100 * r['share']:5.1f}%  ({int(r['with_w']):,}/{int(r['rows']):,})")
    w_partner["share"] = w_partner["with_w"] / w_partner["rows"]
    top = w_partner.sort_values("value", ascending=False).head(15)
    print("\nby partner (15 largest by value):")
    for _, r in top.iterrows():
        print(f"    {r['ctr']}: {100 * r['share']:5.1f}%  ({int(r['rows']):,} rows)")
    worst = w_partner[w_partner["rows"] >= 500].sort_values("share").head(8)
    print("\n  weakest coverage among partners with >= 500 rows:")
    for _, r in worst.iterrows():
        print(f"    {r['ctr']}: {100 * r['share']:5.1f}%  ({int(r['rows']):,} rows)")

    # ---------------- 2d: cluster thinness ----------------
    rule("2d. Cluster thinness - decides the model structure")
    for label, obs in [("all matched cells", matched), (f"both sides >= ${MIN_SIDE_USD // 1000}k", big)]:
        print(f"\n{label} ({len(obs):,} observations)")
        for level in ["hs4", "hs2"]:
            t = thinness(obs, level)
            print(f"  partner x {level.upper()}: {t['clusters']:>6,} clusters | "
                  f"singletons {100 * t['singleton_share']:5.1f}% | <=3 obs {100 * t['le3_share']:5.1f}% | "
                  f"median {t['median']:.0f} | p90 {t['p90']:.0f}")
    t4 = thinness(big, "hs4")
    print(f"\ndecision rule: partner x HS4 singletons = {100 * t4['singleton_share']:.1f}% "
          f"({'>' if t4['singleton_share'] > 0.6 else '<='} 60%) -> "
          f"use partner x {'HS2' if t4['singleton_share'] > 0.6 else 'HS4'}")

    # ---------------- 2e: HS version ----------------
    rule("2e. HS version check against TN VED 2022")
    tar = pd.read_csv(TARIFF_HS6, dtype={"hs6": "string", "hs4": "string", "hs2": "string"})
    tar["hs6"] = pad(tar["hs6"], 6)
    known = set(tar["hs6"])
    matched = matched.copy()
    matched["in_schedule"] = matched["hs6"].isin(known)
    by_rows = matched["in_schedule"].mean()
    by_value = (matched.loc[matched["in_schedule"], "ptn_exports_fob"].sum()
                / matched["ptn_exports_fob"].sum())
    print(f"HS6 codes in the schedule: {len(known):,}")
    print(f"matched cells whose HS6 is in the schedule: {100 * by_rows:.1f}% of cells, "
          f"{100 * by_value:.1f}% of value")
    if by_rows < 0.85:
        print("FLAG: below 85% - an HS2017/HS2022 correlation table is needed")
    miss = (matched.loc[~matched["in_schedule"]]
            .groupby("hs6", observed=True)["ptn_exports_fob"].sum().sort_values(ascending=False))
    print(f"\nunmatched HS6 codes: {len(miss):,}; 10 largest by value:")
    for code, v in miss.head(10).items():
        print(f"    {code}  ${v / 1e6:,.1f}M")

    panel.to_csv(OUT / "annual_cells.csv", index=False)
    print(f"\nwrote {OUT / 'annual_cells.csv'} ({len(panel):,} rows)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
