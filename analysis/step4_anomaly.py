"""
Step 4 - the anomaly model. PROVISIONAL: see STEP3_REPORT.md.

    python analysis/step4_anomaly.py [--cluster hs6|hs4]

Two of Step 3's inputs are not settled, so every number here is conditional on
choices that are still open:

  1. The cell-level freight surface is not identified in this data (three of the
     four mandatory checks fail). What the zero-duty sample does support is an
     aggregate wedge by product section and weight class, and that is what
     deflates the CIF side here. It is a defensible instrument, better grounded
     than a flat 10%, but it is not the fitted surface the brief specifies.
  2. The extract carries one mirror direction only - Uzbekistan's imports against
     partners' exports. The export-under-reporting arm needs a second download,
     so the EXPORT dummy is degenerate and is omitted rather than faked.

What remains is the import over-reporting arm: cells where Uzbekistan records
more, once freight is removed, than the partner says it shipped. Money leaving
against over-invoiced imports.

    ln|gap| ~ tariff + trade_dev + trade_bar + C(partner) + C(hs2) + C(year)
              + (1 | partner x HS6)

trade_bar alongside trade_dev is a Mundlak device: including the cluster mean
relaxes the random-effects orthogonality assumption. It looks redundant next to
trade_dev. It is not.

Corruption indices, tax-haven flags, secrecy scores and AML risk indices are
deliberately absent from the right-hand side. Conditioning on them would turn the
score into a restatement of those indices wearing a trade-data costume.
"""

from __future__ import annotations

import argparse

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf

from common import OUT

MIN_GAP_USD = 50_000
CRITICAL_TOP = 0.025
Z90 = 1.645


def rule(t: str) -> None:
    print(f"\n{'=' * 78}\n{t}\n{'=' * 78}")


def freight_factors(f: pd.DataFrame) -> tuple[pd.DataFrame, float]:
    """
    Model C from Step 3: the aggregate CIF/FOB wedge on the zero-duty sample, by
    HS section and weight class. Aggregates rather than cell-level predictions,
    because the cell-level surface is noise; floored at zero, because freight is
    a physical cost. Thin combinations fall back to the section, then to the
    overall wedge.
    """
    clean = f[f["freight_clean_sample"] & f["w2v"].notna()].copy()
    overall = clean["uz_imports_cif"].sum() / clean["ptn_exports_fob"].sum() - 1

    def wedge(g: pd.DataFrame) -> float:
        return g["uz_imports_cif"].sum() / g["ptn_exports_fob"].sum() - 1

    sec = {s: wedge(g) for s, g in clean.groupby("section", observed=True) if len(g) >= 100}
    cell = {k: wedge(g) for k, g in clean.groupby(["section", "wclass"], observed=True) if len(g) >= 100}
    rows = []
    for (s, w), v in cell.items():
        rows.append({"section": s, "wclass": w, "factor": max(v, 0.0), "basis": "section x weight"})
    tab = pd.DataFrame(rows)
    return tab, max(overall, 0.0), sec  # type: ignore[return-value]


def build(cluster_level: str, freight: str = "flat") -> tuple[pd.DataFrame, dict]:
    f = pd.read_csv(OUT / "freight.csv",
                    dtype={"hs6": "string", "hs4": "string", "hs2": "string",
                           "ctr": "string", "section": "string"})
    # weight class is defined on the whole panel so the clean sample and the
    # extrapolation set share cut points
    f = f[f["w2v"].notna()].copy()
    f["wclass"] = pd.qcut(f["w2v"], 4, labels=["light", "mid-light", "mid-heavy", "heavy"])

    tab, overall, sec = freight_factors(f)
    if freight == "flat":
        # The only freight quantity this data identifies is the overall zero-duty
        # wedge. Its section and weight dimensions contain negative wedges, which
        # cannot be freight, so disaggregating buys arbitrariness, not detail.
        f["factor"] = overall
    else:
        f = f.merge(tab, on=["section", "wclass"], how="left")
        f["factor"] = f["factor"].fillna(f["section"].map(lambda s: max(sec.get(s, overall), 0.0)))
        f["factor"] = f["factor"].fillna(overall)

    f["uz_fob"] = f["uz_imports_cif"] / (1 + f["factor"])
    f["gap"] = f["uz_fob"] - f["ptn_exports_fob"]

    keep = f[(f["gap"] > 0) & (f["gap"] >= MIN_GAP_USD)].copy()
    keep["ln_gap"] = np.log(keep["gap"])
    keep["trade_ic"] = np.log((keep["uz_fob"] + keep["ptn_exports_fob"]) / 2)
    keep["cluster"] = keep["ctr"] + "|" + keep[cluster_level]
    grp = keep.groupby("cluster", observed=True)["trade_ic"]
    keep["trade_bar"] = grp.transform("mean")
    keep["trade_dev"] = keep["trade_ic"] - keep["trade_bar"]
    keep["n_obs"] = grp.transform("size")

    info = {
        "panel": len(f), "kept": len(keep), "overall_factor": overall,
        "median_factor": float(f["factor"].median()),
        "gap_usd": float(keep["gap"].sum()),
        "clusters": int(keep["cluster"].nunique()),
    }
    return keep, info


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cluster", default="hs4", choices=["hs6", "hs4", "hs2"])
    ap.add_argument("--freight", default="flat", choices=["flat", "modelc"],
                    help="flat: the fitted overall zero-duty wedge. modelc: section x weight class.")
    args = ap.parse_args()

    df, info = build(args.cluster, args.freight)
    rule(f"Panel - import over-reporting arm, cluster = partner x {args.cluster.upper()}, "
         f"freight = {args.freight}")
    print(f"  cells with a freight-adjusted positive gap >= ${MIN_GAP_USD:,}: {info['kept']:,} "
          f"of {info['panel']:,}")
    print(f"  total gap: ${info['gap_usd'] / 1e9:.2f}B   clusters: {info['clusters']:,}")
    print(f"  freight factor: median {100 * info['median_factor']:.1f}%, "
          f"overall zero-duty wedge {100 * info['overall_factor']:.1f}%")
    sizes = df.groupby("cluster", observed=True).size()
    print(f"  cluster sizes: singletons {100 * (sizes == 1).mean():.1f}%, "
          f"<=3 obs {100 * (sizes <= 3).mean():.1f}%, median {sizes.median():.0f}, max {sizes.max()}")

    rule("Mixed model")
    spec = "ln_gap ~ tariff + trade_dev + trade_bar + C(ctr) + C(hs2) + C(year)"
    print(f"  {spec}\n  + (1 | cluster)   EXPORT omitted: only one mirror direction exists")
    md = smf.mixedlm(spec, data=df, groups=df["cluster"])
    # The default optimiser sequence converges here; forcing lbfgs hits a singular
    # information matrix, because singleton clusters are perfectly fitted once the
    # Mundlak cluster mean is in the model and leave nothing for the profile step.
    res = md.fit()
    print(f"  converged: {res.converged}")

    keep = ["Intercept", "tariff", "trade_dev", "trade_bar"]
    print(f"\n  {'term':>12} {'coef':>10} {'se':>9} {'z':>8} {'p':>8}")
    for k in keep:
        if k in res.params.index:
            print(f"  {k:>12} {res.params[k]:>10.4f} {res.bse[k]:>9.4f} "
                  f"{res.tvalues[k]:>8.2f} {res.pvalues[k]:>8.4f}")
    print("  partner, chapter and year fixed effects retained but not printed")

    var_u = float(res.cov_re.iloc[0, 0])
    var_e = float(res.scale)
    rho = var_u / (var_u + var_e)
    print(f"\n  sigma2_u {var_u:.4f}   sigma2_e {var_e:.4f}")
    print(f"  rho = {rho:.4f}  -  {100 * rho:.1f}% of the residual variance sits in the")
    print(f"  cluster effects, so {100 * (1 - rho):.1f}% of the variation is NOT in this indicator.")
    print(f"  (Gara et al. report 0.18 on Italian data.)")

    # ---- empirical Bayes estimates and the two-tier rule ----
    rule("Anomaly scores")
    re_map = {g: float(v.iloc[0]) for g, v in res.random_effects.items()}
    sc = (df.groupby("cluster", observed=True)
          .agg(ctr=("ctr", "first"), code=(args.cluster, "first"), hs2=("hs2", "first"),
               n_obs=("ln_gap", "size"), gap_usd=("gap", "sum")).reset_index())
    sc["u_hat"] = sc["cluster"].map(re_map)
    sc = sc[sc["u_hat"].notna()].copy()
    sc["shrinkage"] = sc["n_obs"] * var_u / (sc["n_obs"] * var_u + var_e)
    sc["post_sd"] = np.sqrt(var_u * (1 - sc["shrinkage"]))
    sc["lo90"] = sc["u_hat"] - Z90 * sc["post_sd"]

    thr = float(sc["u_hat"].quantile(1 - CRITICAL_TOP))
    sc["tier"] = np.where(sc["lo90"] >= thr, "confirmed",
                          np.where(sc["u_hat"] >= thr, "provisional", "not flagged"))
    sc.loc[sc["n_obs"] == 1, "tier"] = "suppressed (singleton)"

    print(f"  threshold = 97.5th percentile of u_hat = {thr:.4f}")
    for t, g in sc.groupby("tier"):
        print(f"    {t:24} {len(g):>6,} clusters   ${g['gap_usd'].sum() / 1e9:>6.2f}B of gap")

    # fixed part only, for the monetary scale
    df["fixed_part"] = res.predict(df)
    fp = df.groupby("cluster", observed=True)["fixed_part"].mean()
    sc["fixed_part"] = sc["cluster"].map(fp)
    sc["unexplained_usd"] = np.exp(sc["fixed_part"]) * (np.exp(sc["u_hat"]) - 1) * sc["n_obs"]

    flagged = sc[sc["tier"].isin(["confirmed", "provisional"])]
    print(f"\n  order-of-magnitude unexplained value across flagged clusters: "
          f"${flagged['unexplained_usd'].sum() / 1e9:.2f}B")
    print("  (a triage magnitude, never an estimate of crime)")

    rule("Top clusters by score")
    top = sc.sort_values("u_hat", ascending=False).head(20)
    print(f"  {'partner':>7} {'code':>7} {'n':>3} {'u_hat':>7} {'lo90':>7} {'shrink':>7} "
          f"{'gap $M':>8}  tier")
    for _, r in top.iterrows():
        print(f"  {r['ctr']:>7} {str(r['code']):>7} {int(r['n_obs']):>3} {r['u_hat']:>7.3f} "
              f"{r['lo90']:>7.3f} {r['shrinkage']:>7.3f} {r['gap_usd'] / 1e6:>8.1f}  {r['tier']}")

    rule("Partner rollup")
    pr = (sc.groupby("ctr")
          .agg(clusters=("cluster", "size"),
               flagged=("tier", lambda s: int(s.isin(["confirmed", "provisional"]).sum())),
               confirmed=("tier", lambda s: int((s == "confirmed").sum())),
               gap=("gap_usd", "sum"), unexplained=("unexplained_usd", "sum")).reset_index())
    pr["share"] = pr["flagged"] / pr["clusters"]
    pr = pr[pr["clusters"] >= 20].sort_values("share", ascending=False)
    print(f"  {'partner':>7} {'clusters':>8} {'flagged':>7} {'conf':>5} {'share':>7} "
          f"{'gap $B':>8} {'unexpl $B':>10}")
    for _, r in pr.head(15).iterrows():
        print(f"  {r['ctr']:>7} {int(r['clusters']):>8,} {int(r['flagged']):>7} "
              f"{int(r['confirmed']):>5} {100 * r['share']:>6.1f}% "
              f"{r['gap'] / 1e9:>8.2f} {r['unexplained'] / 1e9:>10.2f}")
    print("\n  Share and value rank very differently, which is the informative part:")
    byval = pr.sort_values("unexplained", ascending=False).head(5)["ctr"].tolist()
    print(f"    by flagged share: {pr.head(5)['ctr'].tolist()}")
    print(f"    by unexplained value: {byval}")

    stem = f"anomaly_{args.cluster}_{args.freight}"
    sc.to_csv(OUT / f"{stem}.csv", index=False)
    print(f"\nwrote {OUT / f'{stem}.csv'} ({len(sc):,} clusters)")
    print(f"\nrho {rho:.4f} | clusters {len(sc):,} | confirmed "
          f"{int((sc['tier'] == 'confirmed').sum())} | provisional "
          f"{int((sc['tier'] == 'provisional').sum())}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
