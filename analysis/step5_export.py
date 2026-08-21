"""
Step 5 - precompute every configuration the dashboard offers.

    python analysis/step5_export.py

Fits all four combinations of cluster level (partner x HS4, partner x HS6) and
freight instrument (the fitted flat wedge, the section x weight-class variant) and
writes src/data/anomaly.json. Nothing here runs in the browser: the dashboard
reads finished numbers, exactly as it does for the risk index.

The file ships columnar - parallel arrays against a partner and code dictionary -
because a row-per-cluster object would triple the payload for 20,000 clusters.
"""

from __future__ import annotations

import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
from scipy import stats

warnings.filterwarnings("ignore")

from common import OUT, YEARS  # noqa: E402
from step4_anomaly import CRITICAL_TOP, MIN_GAP_USD, Z90, build  # noqa: E402

ROOT = Path(__file__).resolve().parent
DEST = ROOT.parent / "src" / "data" / "anomaly.json"
SRC_MONTHLY = ROOT.parent.parent / "UN Comtrade monthly" / "UN Comtrade monthly" / "mirror_trade_monthly_2017_latest.csv"

CLUSTERS = ["hs4", "hs6"]
FREIGHTS = ["flat", "modelc"]
SPEC = "ln_gap ~ tariff + trade_dev + trade_bar + C(ctr) + C(hs2) + C(year)"
TERMS = ["tariff", "trade_dev", "trade_bar"]


def fit_one(cluster: str, freight: str) -> dict:
    df, info = build(cluster, freight)
    res = smf.mixedlm(SPEC, data=df, groups=df["cluster"]).fit()
    var_u = float(res.cov_re.iloc[0, 0])
    var_e = float(res.scale)
    rho = var_u / (var_u + var_e)

    re_map = {g: float(v.iloc[0]) for g, v in res.random_effects.items()}
    sc = (df.groupby("cluster", observed=True)
          .agg(ctr=("ctr", "first"), code=(cluster, "first"), hs2=("hs2", "first"),
               n_obs=("ln_gap", "size"), gap_usd=("gap", "sum"),
               uz=("uz_fob", "sum"), ptn=("ptn_exports_fob", "sum"),
               first_year=("year", "min"), last_year=("year", "max")).reset_index())
    sc["u_hat"] = sc["cluster"].map(re_map)
    sc = sc[sc["u_hat"].notna()].copy()
    sc["shrinkage"] = sc["n_obs"] * var_u / (sc["n_obs"] * var_u + var_e)
    sc["post_sd"] = np.sqrt(var_u * (1 - sc["shrinkage"]))
    sc["lo90"] = sc["u_hat"] - Z90 * sc["post_sd"]

    thr = float(sc["u_hat"].quantile(1 - CRITICAL_TOP))
    tier = np.where(sc["lo90"] >= thr, 1, np.where(sc["u_hat"] >= thr, 2, 0))
    sc["tier"] = np.where(sc["n_obs"] == 1, 3, tier)  # 3 = suppressed singleton

    df["fixed_part"] = res.predict(df)
    fp = df.groupby("cluster", observed=True)["fixed_part"].mean()
    sc["fixed_part"] = sc["cluster"].map(fp)
    sc["unexplained_usd"] = np.exp(sc["fixed_part"]) * (np.exp(sc["u_hat"]) - 1) * sc["n_obs"]

    sizes = sc["n_obs"]
    coefs = [{"term": t, "coef": round(float(res.params[t]), 5),
              "se": round(float(res.bse[t]), 5), "z": round(float(res.tvalues[t]), 3),
              "p": round(float(res.pvalues[t]), 5)} for t in TERMS if t in res.params.index]

    return {
        "sc": sc.sort_values("u_hat", ascending=False).reset_index(drop=True),
        "meta": {
            "cluster": cluster, "freight": freight,
            "observations": int(info["kept"]), "panelCells": int(info["panel"]),
            "clusters": int(len(sc)),
            "gapUsd": float(sc["gap_usd"].sum()),
            "threshold": thr, "rho": rho, "varU": var_u, "varE": var_e,
            "freightFactorMedian": float(info["median_factor"]),
            "freightWedge": float(info["overall_factor"]),
            "tier1": int((sc["tier"] == 1).sum()), "tier2": int((sc["tier"] == 2).sum()),
            "suppressed": int((sc["tier"] == 3).sum()),
            "unexplainedUsd": float(sc.loc[sc["tier"].isin([1, 2]), "unexplained_usd"].sum()),
            "singletonShare": float((sizes == 1).mean()),
            "le3Share": float((sizes <= 3).mean()),
            "medianSize": float(sizes.median()), "maxSize": int(sizes.max()),
            "sizeHist": {str(k): int(v) for k, v in sizes.value_counts().sort_index().items()},
            "coefficients": coefs,
            "converged": bool(res.converged),
        },
    }


def rollups(sc: pd.DataFrame, base: float = CRITICAL_TOP) -> tuple[list, list]:
    """
    Partner and chapter rollups. The binomial test asks whether a partner's share
    of flagged clusters exceeds the base rate the threshold defines by construction
    - it is a consistency check on the ranking, not evidence about the partner.
    """
    scored = sc[sc["tier"] != 3]
    out_p = []
    for iso, g in scored.groupby("ctr"):
        flagged = int(g["tier"].isin([1, 2]).sum())
        n = len(g)
        p = float(stats.binomtest(flagged, n, base, alternative="greater").pvalue) if n else 1.0
        out_p.append({
            "iso": iso, "clusters": n, "flagged": flagged,
            "confirmed": int((g["tier"] == 1).sum()),
            "share": flagged / n if n else 0.0, "pValue": p,
            "gapUsd": float(g["gap_usd"].sum()),
            "unexplainedUsd": float(g["unexplained_usd"].sum()),
        })
    out_p.sort(key=lambda r: -r["unexplainedUsd"])

    out_c = []
    for ch, g in scored.groupby("hs2"):
        flagged = int(g["tier"].isin([1, 2]).sum())
        n = len(g)
        out_c.append({
            "hs2": ch, "clusters": n, "flagged": flagged,
            "confirmed": int((g["tier"] == 1).sum()),
            "share": flagged / n if n else 0.0,
            "gapUsd": float(g["gap_usd"].sum()),
            "unexplainedUsd": float(g["unexplained_usd"].sum()),
        })
    out_c.sort(key=lambda r: -r["unexplainedUsd"])
    return out_p, out_c


def monthly_series(wedge: float) -> dict:
    """
    The one place monthly data is used: a trend line, never a model input. Shipping
    lag means a January departure lands in Uzbekistan's February or March book, so
    monthly gaps are noisy by construction and are shown as a shape, not a level.
    """
    keep = ["year", "month", "reporting_side", "reporter_iso", "partner_iso",
            "hs_level", "hs_code", "trade_value_usd"]
    parts = []
    for ch in pd.read_csv(SRC_MONTHLY, usecols=keep, chunksize=3_000_000, low_memory=False,
                          dtype={"reporting_side": "category", "hs_level": "category",
                                 "hs_code": "string"}):
        ch = ch[(ch["hs_level"].astype(str) == "HS6") & ch["year"].isin(YEARS)]
        uz = ch["reporting_side"].astype(str) == "uzbekistan_imports"
        ch = ch.assign(
            ctr=np.where(uz, ch["partner_iso"].astype(str), ch["reporter_iso"].astype(str)),
            hs2=ch["hs_code"].str.zfill(6).str[:2],
            side=np.where(uz, "uz", "ptn"),
        )
        parts.append(ch.groupby(["ctr", "hs2", "year", "month", "side"], observed=True)
                     .agg(v=("trade_value_usd", "sum")).reset_index())
    d = pd.concat(parts).groupby(["ctr", "hs2", "year", "month", "side"], observed=True).sum().reset_index()
    w = d.pivot_table(index=["ctr", "hs2", "year", "month"], columns="side", values="v",
                      fill_value=0.0).reset_index()
    for c in ("uz", "ptn"):
        if c not in w:
            w[c] = 0.0
    w["gap"] = w["uz"] / (1 + wedge) - w["ptn"]
    w["period"] = w["year"] * 100 + w["month"]

    def series(frame: pd.DataFrame, key: str) -> dict:
        g = frame.groupby([key, "period"], observed=True)["gap"].sum().reset_index()
        g = g[g["gap"] > 0]
        out: dict[str, dict] = {}
        for k, gg in g.groupby(key, observed=True):
            gg = gg.sort_values("period")
            out[str(k)] = {"p": [int(x) for x in gg["period"]],
                           "v": [round(float(x) / 1e6, 3) for x in gg["gap"]]}
        return out

    top_p = (w.groupby("ctr", observed=True)["gap"].sum().sort_values(ascending=False)
             .head(20).index.tolist())
    top_c = (w.groupby("hs2", observed=True)["gap"].sum().sort_values(ascending=False)
             .head(20).index.tolist())
    return {
        "partners": series(w[w["ctr"].isin(top_p)], "ctr"),
        "chapters": series(w[w["hs2"].isin(top_c)], "hs2"),
    }


def main() -> int:
    configs: dict[str, dict] = {}
    partners: list[str] = []
    codes: list[str] = []

    for cl in CLUSTERS:
        for fr in FREIGHTS:
            print(f"fitting cluster={cl} freight={fr} ...", flush=True)
            r = fit_one(cl, fr)
            sc = r["sc"]
            for iso in sc["ctr"]:
                if iso not in partners:
                    partners.append(iso)
            for c in sc["code"]:
                if c not in codes:
                    codes.append(c)
            pr, cr = rollups(sc)
            key = f"{cl}_{fr}"
            configs[key] = {"meta": r["meta"], "partnerRollup": pr, "chapterRollup": cr, "sc": sc}
            m = r["meta"]
            print(f"  rho {m['rho']:.4f}  clusters {m['clusters']:,}  "
                  f"tier1 {m['tier1']}  tier2 {m['tier2']}")

    pidx = {v: i for i, v in enumerate(partners)}
    cidx = {v: i for i, v in enumerate(codes)}
    packed = {}
    for key, cfg in configs.items():
        sc = cfg.pop("sc")
        packed[key] = {
            **cfg,
            "cells": {
                "p": [pidx[x] for x in sc["ctr"]],
                "k": [cidx[x] for x in sc["code"]],
                "n": [int(x) for x in sc["n_obs"]],
                "u": [round(float(x), 4) for x in sc["u_hat"]],
                "lo": [round(float(x), 4) for x in sc["lo90"]],
                "sd": [round(float(x), 4) for x in sc["post_sd"]],
                "sh": [round(float(x), 4) for x in sc["shrinkage"]],
                "g": [round(float(x) / 1e6, 3) for x in sc["gap_usd"]],
                "x": [round(float(x) / 1e6, 3) for x in sc["unexplained_usd"]],
                "t": [int(x) for x in sc["tier"]],
                "y0": [int(x) for x in sc["first_year"]],
                "y1": [int(x) for x in sc["last_year"]],
            },
        }

    wedge = configs["hs4_flat"]["meta"]["freightWedge"]
    print("building the monthly trend series ...", flush=True)
    trend = monthly_series(wedge)

    doc = {
        "version": "1.0",
        "window": [YEARS[0], YEARS[-1]],
        "minGapUsd": MIN_GAP_USD,
        "criticalTop": CRITICAL_TOP,
        "z90": Z90,
        "partners": partners,
        "codes": codes,
        "defaultConfig": "hs4_flat",
        "configs": packed,
        "trend": trend,
        "source": {
            "gravity": "CEPII GeoDist (Mayer & Zignago 2011)",
            "method": "Gara, Giammatteo & Tosti (2018), Banca d'Italia QEF 445",
            "tariff": "TN VED 2022, HS10",
        },
    }
    DEST.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    print(f"\nwrote {DEST} ({DEST.stat().st_size / 1e6:.2f} MB)")
    for k, v in packed.items():
        print(f"  {k:12} clusters {v['meta']['clusters']:>6,}  rho {v['meta']['rho']:.3f}  "
              f"tier1 {v['meta']['tier1']:>3}  tier2 {v['meta']['tier2']:>3}")
    print(f"  trend series: {len(trend['partners'])} partners, {len(trend['chapters'])} chapters")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
