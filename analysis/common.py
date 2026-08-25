"""
Shared panel construction for the unexplained-discrepancy model.

The model window is 2019-2024, the six years in which both books exist and both
are complete (Step 2a). Uzbekistan filed nothing as reporter before 2019, so the
mirror simply does not exist for 2017-2018.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
DATA = ROOT / "data"

YEARS = list(range(2019, 2025))
#: A cell must carry at least this much trade, measured as the mean of the two
#: sides, to enter the panel. It replaces the older rule of flooring each side
#: separately at $50,000, which used size as a proxy for credibility and was the
#: wrong instrument twice over: it discarded small cells the two books agreed on
#: - the median Uzbek cell has a smaller side of only $12,097, so the old floor
#: sat above the median - while keeping cells where one book was nearly empty.
#: Extreme ratios are handled downstream by winsorising the dependent variable
#: rather than by dropping cells, because dropping on the ratio would be
#: selection on the outcome. Flooring on trade size conditions on a regressor,
#: which is not.
MIN_TRADE_USD = 10_000
REPORTER = "UZB"

#: EAEU members, and the other parties to the 2011 CIS free trade agreement.
#: Coded 2 / 1 / 0 as a single ordered term: deeper integration means fewer
#: barriers and less reason to misstate, so the expected sign is negative.
EAEU = {"RUS", "BLR", "KAZ", "KGZ", "ARM"}
CIS_FTA_ONLY = {"MDA", "TJK", "UKR"}

#: HS chapter -> section, the coarse product grouping the freight surface uses.
_SECTIONS: list[tuple[int, int, str]] = [
    (1, 5, "I"), (6, 14, "II"), (15, 15, "III"), (16, 24, "IV"), (25, 27, "V"),
    (28, 38, "VI"), (39, 40, "VII"), (41, 43, "VIII"), (44, 46, "IX"), (47, 49, "X"),
    (50, 63, "XI"), (64, 67, "XII"), (68, 70, "XIII"), (71, 71, "XIV"), (72, 83, "XV"),
    (84, 85, "XVI"), (86, 89, "XVII"), (90, 92, "XVIII"), (93, 93, "XIX"),
    (94, 96, "XX"), (97, 97, "XXI"), (98, 99, "XXII"),
]


def hs_section(hs2: pd.Series) -> pd.Series:
    ch = pd.to_numeric(hs2, errors="coerce")
    out = pd.Series("XXII", index=hs2.index, dtype="object")
    for lo, hi, name in _SECTIONS:
        out[(ch >= lo) & (ch <= hi)] = name
    return out


def transit_share(p: pd.DataFrame) -> pd.Series:
    """
    The share of a partner's claimed shipments that Uzbekistan does not credit to
    it. Uzbekistan books imports by country of ORIGIN, so goods a hub buys and
    resells are recorded against the manufacturer instead: the hub's own export
    filing has no counterpart in the Uzbek book, and the shortfall shows up here.
    Genuine suppliers sit near zero, re-export markets near one.

    Constructed from the same mirror as the dependent variable, so it is a
    descriptive covariate, not an exogenous instrument - it is measured over the
    WHOLE matched panel rather than the screened subset, which keeps it from
    being a function of the cells it helps explain, but does not make it exogenous.
    """
    g = p.groupby("ctr", observed=True)[["uz_imports_cif", "ptn_exports_fob"]].sum()
    ratio = g["uz_imports_cif"] / g["ptn_exports_fob"].where(g["ptn_exports_fob"] > 0)
    return (1 - ratio).clip(lower=0, upper=1).fillna(0)


def load_panel(min_trade: float = MIN_TRADE_USD) -> pd.DataFrame:
    """
    The matched annual panel over the model window, with gravity attributes, the
    tariff schedule and the HS6 global unit value attached.

    The size filter is on the mean of the two reported values, computed before
    the freight adjustment - the adjustment moves it by under 8% and using the
    raw values keeps the filter independent of a wedge estimated downstream.
    """
    p = pd.read_csv(OUT / "annual_cells.csv",
                    dtype={"hs6": "string", "hs4": "string", "hs2": "string", "ctr": "string"})
    p = p[p["year"].isin(YEARS) & p["matched"]].copy()
    p = p[((p["uz_imports_cif"] + p["ptn_exports_fob"]) / 2 >= min_trade)].copy()

    # ---- HS6 global unit value, from the EXPORTER's books ----
    # The cell's own unit value cannot be a regressor: a misreported value would
    # then sit on both sides of the equation. The HS6 median across all partners
    # is a property of the product, which is what the freight surface needs.
    uv = p[(p["ptn_weight"] > 0)].copy()
    uv["uv"] = uv["ptn_exports_fob"] / uv["ptn_weight"]
    med = uv.groupby("hs6", observed=True)["uv"].median().rename("uv_hs6")
    p = p.merge(med, left_on="hs6", right_index=True, how="left")
    # kg per USD: heavy-for-its-value goods cost more to move
    p["w2v"] = 1.0 / p["uv_hs6"]

    # ---- tariffs ----
    tar = pd.read_csv(OUT / "tariffs_hs6.csv", dtype={"hs6": "string"})
    tar["hs6"] = tar["hs6"].str.zfill(6)
    p = p.merge(tar[["hs6", "mfn_adv_mean", "mfn_adv_max", "any_specific", "any_tiered",
                     "freight_clean_sample"]], on="hs6", how="left")
    p["tariff_missing"] = p["mfn_adv_mean"].isna()
    # HS2022 resplit 1.3% of codes; those cells keep an indicator rather than being
    # dropped, so 1.7% of value is not silently discarded (Step 2e).
    p["tariff"] = p["mfn_adv_mean"].fillna(0.0)
    p["freight_clean_sample"] = p["freight_clean_sample"].fillna(False).astype(bool)

    # ---- CEPII GeoDist ----
    dist = pd.read_excel(DATA / "dist_cepii.xls")
    dist = dist[(dist["iso_o"] == REPORTER)][["iso_d", "dist", "distcap", "distw", "contig"]]
    # geo_cepii is one row per main CITY, not per country: 13 countries have two
    # (Germany, Turkey, Kazakhstan, Brazil among them). Merging it as-is silently
    # doubles every cell for those partners, which is exactly the set that then
    # dominates the rankings. Country attributes only, deduplicated.
    geo = pd.read_excel(DATA / "geo_cepii.xls")[["iso3", "landlocked"]]
    assert geo.groupby("iso3")["landlocked"].nunique().max() == 1, "landlocked varies within a country"
    geo = geo.drop_duplicates(subset=["iso3"])
    before = len(p)
    p = p.merge(dist, left_on="ctr", right_on="iso_d", how="left").drop(columns=["iso_d"])
    p = p.merge(geo, left_on="ctr", right_on="iso3", how="left").drop(columns=["iso3"])
    assert len(p) == before, f"gravity merge changed the row count: {before} -> {len(p)}"
    # population-weighted distance where CEPII has it, capital-to-capital otherwise.
    # The Excel merge yields object dtype, which numpy cannot take a log of.
    num = lambda s: pd.to_numeric(s, errors="coerce")
    p["distance_km"] = num(p["distw"]).fillna(num(p["distcap"])).fillna(num(p["dist"]))
    p["landlocked_partner"] = num(p["landlocked"]).fillna(0).astype(int)
    p["contig"] = num(p["contig"]).fillna(0).astype(int)

    # ---- partner covariates: these replace the partner fixed effects ----
    gdp = pd.read_csv(DATA / "wdi_gdppc.csv", dtype={"iso3": "string"})
    p = p.merge(gdp, left_on=["ctr", "year"], right_on=["iso3", "year"], how="left").drop(columns=["iso3"])
    # a handful of partners have no WDI series in a given year; carry the
    # partner's own median rather than dropping the cell
    p["gdp_pc"] = p["gdp_pc"].fillna(p.groupby("ctr", observed=True)["gdp_pc"].transform("median"))
    p["ln_gdp_pc"] = np.log(num(p["gdp_pc"]).astype(float))

    p["cis_eaeu"] = p["ctr"].map(lambda c: 2 if c in EAEU else 1 if c in CIS_FTA_ONLY else 0).astype(int)
    p["transit"] = p["ctr"].map(transit_share(p)).astype(float).fillna(0.0)

    p["section"] = hs_section(p["hs2"])
    p["ln_dist"] = np.log(p["distance_km"].astype(float))
    p["ln_w2v"] = np.log(num(p["w2v"]).astype(float))
    p["cif_fob_ratio"] = p["uz_imports_cif"] / p["ptn_exports_fob"]
    p["ln_ratio"] = np.log(p["cif_fob_ratio"])
    return p


def cluster_summary(df: pd.DataFrame, level: str) -> dict:
    sizes = (df["ctr"] + "|" + df[level]).value_counts()
    return {
        "clusters": int(len(sizes)),
        "singleton_share": float((sizes == 1).mean()),
        "le3_share": float((sizes <= 3).mean()),
        "median": float(sizes.median()),
        "p90": float(sizes.quantile(0.9)),
    }
