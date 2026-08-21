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
#: A cell side must clear this to be worth comparing; small denominators give absurd ratios.
MIN_SIDE_USD = 50_000
REPORTER = "UZB"

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


def load_panel(min_side: float = MIN_SIDE_USD) -> pd.DataFrame:
    """
    The matched annual panel over the model window, with gravity attributes, the
    tariff schedule and the HS6 global unit value attached.
    """
    p = pd.read_csv(OUT / "annual_cells.csv",
                    dtype={"hs6": "string", "hs4": "string", "hs2": "string", "ctr": "string"})
    p = p[p["year"].isin(YEARS) & p["matched"]].copy()
    p = p[(p["uz_imports_cif"] >= min_side) & (p["ptn_exports_fob"] >= min_side)].copy()

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
