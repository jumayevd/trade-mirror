"""
Step 3 - estimate freight margins, cell by cell.

    python analysis/step3_freight.py

A flat 10% CIF/FOB deflator is the wrong instrument for Uzbekistan: it is doubly
landlocked, so real freight runs higher and varies with the weight-to-value ratio
and the route. A flat factor over-corrects light goods and under-corrects heavy
ones, biasing everything downstream.

The identification problem is that the CIF/FOB gap contains BOTH freight and
misinvoicing. Fitting freight on all data absorbs misinvoicing into the fitted
surface and then subtracts it, destroying the signal. So the surface is fitted
only where the incentive to misinvoice is weakest - HS6 lines at zero duty
throughout, freight_clean_sample from Step 1 - and extrapolated to everything.

    ln(M_cif / X_fob) ~ ln_dist + ln_w2v + landlocked_partner + contig
                        + C(section) + C(year)

Standard errors cluster by partner. Two models are reported: the specification
above, with its four mandatory checks, and the variant those checks point to.
Writes out/freight.csv carrying both predicted margins.
"""

from __future__ import annotations

import sys

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf

from common import MIN_TRADE_USD, OUT, YEARS, load_panel

RNG = np.random.default_rng(20260821)
HOLDOUT = 0.25

SPEC = ("ln_ratio ~ ln_dist + ln_w2v + landlocked_partner + contig "
        "+ C(section) + C(year)")
#: Distance carries no identifying variation here (see the checks); this is the
#: part of the specification that survives them.
SPEC_ALT = "ln_ratio ~ ln_w2v + landlocked_partner + contig + C(section) + C(year)"


def rule(t: str) -> None:
    print(f"\n{'=' * 78}\n{t}\n{'=' * 78}")


def fit(df: pd.DataFrame, spec: str = SPEC, weights: pd.Series | None = None):
    """OLS (or WLS) with partner-clustered standard errors."""
    kw = {"cov_type": "cluster", "cov_kwds": {"groups": df["ctr"]}}
    if weights is None:
        return smf.ols(spec, data=df).fit(**kw)
    return smf.wls(spec, data=df, weights=weights).fit(**kw)


def predict_on(model, train: pd.DataFrame, target: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    """
    Predict outside the fitted support. The clean sample cannot cover a section
    that is dutiable throughout, so those cells are predicted at the reference
    section rather than dropped, and the count is reported rather than buried.
    """
    seen = set(train["section"].unique())
    ref = train["section"].mode().iloc[0]
    frame = target.copy()
    outside = ~frame["section"].isin(seen)
    frame.loc[outside, "section"] = ref
    frame["year"] = frame["year"].where(frame["year"].isin(set(train["year"].unique())),
                                        train["year"].mode().iloc[0])
    return model.predict(frame), outside


def coef_table(m, terms: list[str]) -> None:
    print(f"{'term':>20} {'coef':>10} {'se':>9} {'t':>8} {'p':>8}")
    for k in terms:
        if k in m.params.index:
            print(f"{k:>20} {m.params[k]:>10.4f} {m.bse[k]:>9.4f} "
                  f"{m.tvalues[k]:>8.2f} {m.pvalues[k]:>8.3f}")


def main() -> int:
    panel = load_panel()
    print(f"model window {YEARS[0]}-{YEARS[-1]}: {len(panel):,} matched cells "
          f"with trade size >= ${MIN_TRADE_USD:,}")

    usable = panel[np.isfinite(panel["ln_ratio"]) & np.isfinite(panel["ln_w2v"])
                   & np.isfinite(panel["ln_dist"])].copy()
    print(f"usable (finite ln ratio, weight and distance): {len(usable):,}")
    if len(usable) < 1000:
        print("too few cells to fit a freight surface", file=sys.stderr)
        return 1

    clean = usable[usable["freight_clean_sample"]].copy()
    print(f"clean sample (HS6 zero-duty throughout): {len(clean):,} cells "
          f"({100 * len(clean) / len(usable):.1f}%), {clean['ctr'].nunique()} partners, "
          f"{clean['hs6'].nunique()} HS6")

    mask = RNG.random(len(clean)) >= HOLDOUT
    train, test = clean[mask].copy(), clean[~mask].copy()
    print(f"train {len(train):,} / held out {len(test):,}")

    # ---------------- what the dependent variable looks like ----------------
    rule("The dependent variable")
    lr = clean["ln_ratio"]
    agg = clean["uz_imports_cif"].sum() / clean["ptn_exports_fob"].sum()
    print(f"  ln(M_cif / X_fob): mean {lr.mean():+.4f}  median {lr.median():+.4f}  sd {lr.std():.4f}")
    print(f"  median cell ratio {np.exp(lr.median()):.3f} ({100 * (np.exp(lr.median()) - 1):+.1f}%)")
    print(f"  value-weighted ratio, clean sample: {agg:.4f} ({100 * (agg - 1):+.1f}%)")
    print(f"  percentiles p1 {lr.quantile(.01):+.2f} | p25 {lr.quantile(.25):+.2f} | "
          f"p75 {lr.quantile(.75):+.2f} | p99 {lr.quantile(.99):+.2f}")
    print(f"  cells where Uzbekistan records LESS than the partner ships: {100 * (lr < 0).mean():.1f}%")
    print()
    print("  Two facts to hold together: in aggregate the zero-duty sample does show a")
    print(f"  {100 * (agg - 1):.0f}% wedge, which is what freight to a doubly landlocked country")
    print("  should look like - but the cell-level median is near zero and the dispersion")
    print("  is forty times the median. Cell-level mirror noise (timing, classification,")
    print("  partner attribution) dwarfs freight.")

    # ---------------- the specified model ----------------
    rule("Model A - the specification as written")
    m = fit(train)
    coef_table(m, ["Intercept", "ln_dist", "ln_w2v", "landlocked_partner", "contig"])
    print(f"\nR2 {m.rsquared:.4f}   adj {m.rsquared_adj:.4f}   n {int(m.nobs):,}   "
          f"partner clusters {train['ctr'].nunique()}   (section and year effects retained)")

    pred, outside = predict_on(m, train, usable)
    usable["margin_a"] = np.exp(pred) - 1.0
    usable["section_extrapolated"] = outside.values
    miss = sorted(set(usable["section"].unique()) - set(train["section"].unique()))
    print(f"\nsections absent from the clean sample: {miss or 'none'} - "
          f"{int(outside.sum()):,} cells ({100 * outside.mean():.1f}%), "
          f"${usable.loc[outside.values, 'ptn_exports_fob'].sum() / 1e9:.2f}B, "
          f"predicted at the reference section")

    # ---------------- check 1 ----------------
    rule("Check 1 - sign check on ln_dist and ln_w2v")
    signs_ok = True
    for k in ["ln_dist", "ln_w2v"]:
        b, p = m.params[k], m.pvalues[k]
        signs_ok &= b > 0
        print(f"  {k:>18}: {b:+.4f} (p {p:.3f})  {'positive' if b > 0 else 'NEGATIVE'}")
    print(f"  {'PASSES as specified' if signs_ok else 'FAILS'}, but see the stability check below:")
    wls = fit(clean, weights=clean["ptn_exports_fob"])
    print(f"  value-weighted (WLS on export value): ln_dist {wls.params['ln_dist']:+.4f} "
          f"(p {wls.pvalues['ln_dist']:.3f}), ln_w2v {wls.params['ln_w2v']:+.4f} "
          f"(p {wls.pvalues['ln_w2v']:.3f})")
    if wls.params["ln_dist"] < 0 and wls.pvalues["ln_dist"] < 0.05:
        print("  -> under value weighting ln_dist is significantly NEGATIVE. The sign of the")
        print("     key regressor depends on the weighting choice, so it is not identified.")

    # ---------------- check 2 ----------------
    rule("Check 2 - placebo: does the fitted margin know the duty rate?")
    pl = usable.copy()
    pl["margin"] = pl["margin_a"]
    for label, spec in [("as specified", "margin ~ tariff"),
                        ("within HS section", "margin ~ tariff + C(section)"),
                        ("within HS2 chapter", "margin ~ tariff + C(hs2)")]:
        r = smf.ols(spec, data=pl).fit(cov_type="cluster", cov_kwds={"groups": pl["hs6"]})
        b, se, t, pv = r.params["tariff"], r.bse["tariff"], r.tvalues["tariff"], r.pvalues["tariff"]
        print(f"  {label:20} coef {b:+.6f} se {se:.6f} t {t:>6.2f} p {pv:.4f}  "
              f"{'insignificant' if pv > 0.05 else 'SIGNIFICANT'}")
    print("  (clustered by HS6: the tariff is a product-level regressor, and partner")
    print("   clusters would inflate t by an order of magnitude)")
    sec = pl.groupby("section", observed=True).agg(tariff=("tariff", "mean"), n=("tariff", "size"))
    sec = sec[sec["n"] >= 200]
    print(f"\n  Mechanism: mean tariff ranges from {sec['tariff'].min():.1f}% to "
          f"{sec['tariff'].max():.1f}% ACROSS sections, and the fitted margin carries section")
    print("  effects, so the unconditional placebo is picking up the section term rather than")
    print("  misinvoicing. Within a section or chapter the margin knows nothing about duty.")

    # ---------------- check 3 ----------------
    rule("Check 3 - positivity")
    neg = float((usable["margin_a"] < 0).mean())
    print(f"  predicted margins below zero: {100 * neg:.2f}%")
    print(f"  {'within the 5% tolerance' if neg <= 0.05 else 'FAILS - freight cannot be negative'}")

    # ---------------- check 4 ----------------
    rule("Check 4 - held-out fit")
    pred_test, _ = predict_on(m, train, test)
    ss_res = float(((test["ln_ratio"] - pred_test) ** 2).sum())
    ss_tot = float(((test["ln_ratio"] - test["ln_ratio"].mean()) ** 2).sum())
    print(f"  held-out R2 on {len(test):,} clean cells: {1 - ss_res / ss_tot:.4f}")
    print(f"  in-sample R2: {m.rsquared:.4f}")

    # ---------------- is the weak fit a small-cell artefact? ----------------
    rule("Sensitivity - does a higher value floor rescue the surface?")
    print(f"  {'floor':>9} {'n':>7} {'R2':>7}  {'ln_dist':>17} {'ln_w2v':>17}  "
          f"{'median':>7} {'agg M/X':>8}")
    for floor in [50e3, 250e3, 1e6, 5e6]:
        d = clean[(clean["uz_imports_cif"] >= floor) & (clean["ptn_exports_fob"] >= floor)].copy()
        if len(d) < 400:
            continue
        mf = fit(d)
        mg = np.exp(mf.predict(d)) - 1
        a = d["uz_imports_cif"].sum() / d["ptn_exports_fob"].sum()
        print(f"  ${floor / 1e3:>7.0f}k {len(d):>7,} {mf.rsquared:>7.4f}  "
              f"{mf.params['ln_dist']:>+8.4f} (p{mf.pvalues['ln_dist']:.2f}) "
              f"{mf.params['ln_w2v']:>+8.4f} (p{mf.pvalues['ln_w2v']:.2f})  "
              f"{100 * mg.median():>6.1f}% {a:>8.3f}")
    print("  The median margin climbs towards the aggregate wedge as the floor rises, so the")
    print("  weak fit is largely small-cell noise - but ln_dist never becomes significant.")

    rule("Does distance raise the observed wedge at all?")
    cl = clean.copy()
    cl["band"] = pd.cut(cl["distance_km"], [0, 1500, 3000, 5000, 20000],
                        labels=["<1.5k", "1.5-3k", "3-5k", ">5k"])
    for b, g in cl.groupby("band", observed=True):
        print(f"  {str(b):>7} km: value-weighted M/X {g['uz_imports_cif'].sum() / g['ptn_exports_fob'].sum():.3f}"
              f"   median cell ratio {g['cif_fob_ratio'].median():.3f}   n {len(g):,}")
    print(f"  corr(ln_ratio, ln_dist) across matched cells: {usable['ln_ratio'].corr(usable['ln_dist']):+.4f}")
    print("  No monotone gradient: the NEAREST band shows the largest wedge, because the")
    print("  land-corridor neighbours are also where recorded imports track exports best.")

    # ---------------- the variant the checks point to ----------------
    rule("Model B - the specification without distance, positivity imposed")
    mb = fit(train, SPEC_ALT)
    coef_table(mb, ["Intercept", "ln_w2v", "landlocked_partner", "contig"])
    print(f"\nR2 {mb.rsquared:.4f}   n {int(mb.nobs):,}")
    pred_b, _ = predict_on(mb, train, usable)
    raw_b = np.exp(pred_b) - 1.0
    # Freight is a physical cost and cannot be negative; the log form still admits a
    # negative margin wherever the fit falls below zero, so the floor is explicit.
    usable["margin_b"] = raw_b.clip(lower=0.0)
    floored = float((raw_b < 0).mean())
    print(f"  margins floored at zero: {100 * floored:.1f}% of cells")
    print(f"  median {100 * usable['margin_b'].median():.1f}%, "
          f"IQR {100 * usable['margin_b'].quantile(.25):.1f}% - "
          f"{100 * usable['margin_b'].quantile(.75):.1f}%, "
          f"value-weighted mean {100 * np.average(usable['margin_b'], weights=usable['ptn_exports_fob']):.1f}%")
    plb = usable.copy(); plb["margin"] = plb["margin_b"]
    rb = smf.ols("margin ~ tariff + C(hs2)", data=plb).fit(
        cov_type="cluster", cov_kwds={"groups": plb["hs6"]})
    print(f"  placebo within HS2: coef {rb.params['tariff']:+.6f} p {rb.pvalues['tariff']:.4f}")

    rule("Predicted margin by partner (Model B)")
    g = (usable.groupby("ctr", observed=True)
         .agg(cells=("margin_b", "size"), median=("margin_b", "median"),
              value=("ptn_exports_fob", "sum"), dist=("distance_km", "first"),
              landlocked=("landlocked_partner", "first")).reset_index())
    g = g[g["cells"] >= 50].sort_values("value", ascending=False)
    print(f"  {'partner':>8} {'cells':>7} {'median':>8} {'dist km':>9}  landlocked")
    for _, r in g.head(15).iterrows():
        print(f"  {r['ctr']:>8} {int(r['cells']):>7,} {100 * r['median']:>7.1f}% "
              f"{r['dist']:>9,.0f}  {'yes' if r['landlocked'] else 'no'}")

    cols = ["ctr", "hs6", "hs4", "hs2", "year", "section", "uz_imports_cif", "ptn_exports_fob",
            "uz_weight", "ptn_weight", "uv_hs6", "w2v", "ln_w2v", "distance_km", "ln_dist",
            "contig", "landlocked_partner", "tariff", "tariff_missing", "mfn_adv_max",
            # partner covariates for Step 4; they stand in for partner fixed effects
            "gdp_pc", "ln_gdp_pc", "cis_eaeu", "transit",
            "freight_clean_sample", "section_extrapolated", "cif_fob_ratio", "ln_ratio",
            "margin_a", "margin_b"]
    usable[cols].to_csv(OUT / "freight.csv", index=False)
    print(f"\nwrote {OUT / 'freight.csv'} ({len(usable):,} rows)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
