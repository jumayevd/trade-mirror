"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Caterpillar from "@/components/charts/Caterpillar";
import { EmptyState, Segmented, SectionTitle, Stat } from "@/components/ui";
import { fmtNum, fmtPct, fmtUSD, fmtUSDFull } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import {
  ANOMALY_BASE_RATE, ANOMALY_MIN_GAP, ANOMALY_SOURCE, ANOMALY_WINDOW,
  asMultiple, chapterRollup, clustersOf, hi90, metaOf, partnerRollup,
  type Cluster, type ClusterLevel, type Tier,
} from "@/lib/anomaly";
import type { LocaleKey } from "@/lib/locales";

/**
 * Unexplained Discrepancy Analysis (Gara, Giammatteo & Tosti 2018).
 *
 * The model is fitted offline by analysis/step5_export.py; this reads finished
 * numbers. The page is public, so it is written for a reader who has never met a
 * mixed model: the score is shown as "how many times bigger than expected"
 * rather than in log points, the equation is spelled out with every variable's
 * source, and the two statistical ideas a reader has to hold — the likely range
 * and shrinkage — get a panel of their own rather than a tooltip.
 *
 * Labelling is deliberate throughout: this is an "unexplained discrepancy
 * score", never a risk of money laundering or fraud. Every ranked view carries
 * the disclaimer, and no view implies that a low score means clean or a high
 * score means criminal.
 */

const TIER_STYLE: Record<Tier, string> = {
  1: "bg-[color-mix(in_srgb,var(--color-investigate)_14%,transparent)] text-[var(--color-investigate)]",
  2: "bg-[color-mix(in_srgb,var(--color-gold)_20%,transparent)] text-[var(--color-gold-ink)]",
  0: "bg-[var(--color-panel-2)] text-faint",
  3: "bg-[var(--color-panel-2)] text-faint",
};

const TH = "px-3 py-2 text-left text-[13px] font-medium text-faint whitespace-nowrap";
const THN = `${TH} text-right`;
const TD = "px-3 py-2 align-middle text-[14px]";
const TDN = `${TD} tabular text-right whitespace-nowrap`;

/**
 * The score, in the unit the page uses everywhere: a multiple of what is
 * expected. Two decimals, not one: the flagging line and the lower end of a
 * borderline group's range can sit four hundredths apart, and at one decimal
 * both print the same number, which makes the worked example read as a
 * contradiction.
 */
const times = (logPoints: number): string => `${asMultiple(logPoints).toFixed(2)}×`;

function TierTag({ tier }: { tier: Tier }) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-sm px-1.5 py-px text-[12.5px] font-medium ${TIER_STYLE[tier]}`}
      title={t(`anom.tier.${tier}.desc` as LocaleKey)}
    >
      {t(`anom.tier.${tier}` as LocaleKey)}
    </span>
  );
}

/** The disclaimer every ranked view carries. Non-negotiable, so it is one component. */
function Disclaimer() {
  const { t } = useI18n();
  return <p className="mt-2 text-[13px] leading-relaxed text-faint">{t("anom.disclaimer")}</p>;
}

/**
 * The likely range drawn in the row, so overlapping ranges are visible without
 * reading numbers. Scaled across the whole visible span rather than each row's
 * own, or every group would look equally precise.
 */
function RangeBar({ lo, hi, min, max, threshold }: { lo: number; hi: number; min: number; max: number; threshold: number }) {
  const span = max - min || 1;
  const pct = (v: number) => `${(100 * (v - min)) / span}%`;
  return (
    <div className="relative h-3.5 w-24 rounded-sm bg-[var(--color-panel-2)]">
      <span className="absolute top-0 h-3.5 w-px bg-[var(--color-investigate)] opacity-70"
        style={{ left: pct(threshold) }} />
      <span className="absolute top-[6px] h-[3px] rounded-sm bg-[var(--color-primary)]"
        style={{ left: pct(lo), width: `${(100 * (hi - lo)) / span}%` }} />
    </div>
  );
}

const fill = (s: string, vals: Record<string, string | number>) =>
  Object.entries(vals).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

const CAT_LIMIT = 400;
const PAGE = 25;

export default function AnomalyView() {
  const { t } = useI18n();
  const [cluster, setCluster] = useState<ClusterLevel>("hs4");
  const [page, setPage] = useState(0);

  const meta = useMemo(() => metaOf(cluster), [cluster]);
  const clusters = useMemo(() => clustersOf(cluster), [cluster]);
  const partners = useMemo(() => partnerRollup(cluster), [cluster]);
  const chapters = useMemo(() => chapterRollup(cluster), [cluster]);

  // groups with one year are not ranked: a single year cannot show a pattern
  const ranked = useMemo(() => clusters.filter((c) => c.tier !== 3), [clusters]);
  const shown = ranked.slice(page * PAGE, page * PAGE + PAGE);
  const cat = useMemo(() => ranked.slice(0, CAT_LIMIT), [ranked]);
  const bounds = useMemo(() => ({
    min: Math.min(...ranked.map((c) => c.lo90), meta.threshold),
    max: Math.max(...ranked.map(hi90), meta.threshold),
  }), [ranked, meta.threshold]);

  /* A real row from the table, so the worked example is never a toy. Prefer a
     Confirmed group; fall back to the top-scoring one if none clears. */
  const example = useMemo<Cluster | undefined>(
    () => ranked.find((c) => c.tier === 1) ?? ranked[0], [ranked],
  );
  const wedge = fmtPct(meta.freightWedge, 1);
  const pages = Math.ceil(ranked.length / PAGE);
  const switchLevel = (v: ClusterLevel) => { setCluster(v); setPage(0); };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("anom.title")}</h1>
          <span className="tabular text-[13.5px] text-faint">
            {t("anom.window")} {ANOMALY_WINDOW[0]}–{ANOMALY_WINDOW[1]}
          </span>
        </div>
        <p className="max-w-3xl rounded-md border-l-2 border-l-[var(--color-primary)] bg-[var(--color-panel)] px-4 py-3 text-[14.5px] leading-relaxed text-muted">
          {t("anom.lede")}
        </p>
      </section>

      {/* ---- how to read the page, before any number is shown ---- */}
      <section className="space-y-3">
        <SectionTitle title={t("anom.method.title")} />
        <div className="grid max-w-5xl gap-3 lg:grid-cols-3">
          {(["anom.method.p1", "anom.method.p2", "anom.method.p3"] as LocaleKey[]).map((k) => (
            <div key={k} className="card p-4 text-[14px] leading-relaxed text-muted">{t(k)}</div>
          ))}
        </div>
        <div className="max-w-3xl space-y-2 rounded-md border-l-2 border-l-[var(--color-gold)] bg-[var(--color-panel)] px-4 py-3">
          {(["anom.method.p4", "anom.method.p5", "anom.method.p6"] as LocaleKey[]).map((k) => (
            <p key={k} className="text-[14px] leading-relaxed text-muted">{t(k)}</p>
          ))}
        </div>
      </section>

      {/* ---- the equation and where each number comes from ---- */}
      <section className="space-y-3">
        <SectionTitle title={t("anom.eq.title")} desc={t("anom.eq.desc")} />
        <div className="card max-w-4xl space-y-2 p-4">
          <p className="text-[15px] font-medium leading-relaxed">{t("anom.eq.formula")}</p>
          <p className="overflow-x-auto whitespace-nowrap rounded-md bg-[var(--color-panel-2)] px-3 py-2 font-mono text-[13px] leading-relaxed">
            {t("anom.eq.formulaFull")}
          </p>
          <p className="text-[13.5px] leading-relaxed text-muted">{t("anom.eq.note")}</p>
        </div>
        <div className="card max-w-5xl overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="border-b border-[var(--color-border)]">
              <tr>
                <th className={TH}>{t("anom.eq.th.symbol")}</th>
                <th className={TH}>{t("anom.eq.th.meaning")}</th>
                <th className={TH}>{t("anom.eq.th.source")}</th>
              </tr>
            </thead>
            <tbody className="zebra">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <tr key={i} className="border-b border-[var(--color-border-soft)] last:border-0">
                  <td className={`${TD} whitespace-nowrap font-mono text-[13px] font-medium text-foreground`}>
                    {t(`anom.eq.v${i}.sym` as LocaleKey)}
                  </td>
                  <td className={`${TD} text-muted`}>{t(`anom.eq.v${i}.mean` as LocaleKey)}</td>
                  <td className={`${TD} text-[13px] text-faint`}>
                    {fill(t(`anom.eq.v${i}.src` as LocaleKey), { wedge })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- how the score is worked out, on a real row ---- */}
      <section className="space-y-3">
        <SectionTitle title={t("anom.score.title")} desc={t("anom.score.desc")} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="card p-4">
              <h3 className="mb-1 text-[14px] font-semibold">{t(`anom.score.s${i}.t` as LocaleKey)}</h3>
              <p className="text-[13.5px] leading-relaxed text-muted">
                {fill(t(`anom.score.s${i}.b` as LocaleKey), { wedge })}
              </p>
            </div>
          ))}
        </div>
        {example && (
          <p className="max-w-4xl rounded-md border-l-2 border-l-[var(--color-primary)] bg-[var(--color-panel)] px-4 py-3 text-[14px] leading-relaxed text-muted">
            {fill(t(example.tier === 1 ? "anom.score.example" : "anom.score.exampleProv"), {
              partner: example.partner,
              code: example.code,
              label: example.label,
              years: example.nObs,
              gap: fmtUSD(example.gapUsd),
              mult: times(example.uHat),
              lo: times(example.lo90),
              hi: times(hi90(example)),
              thr: times(meta.threshold),
            })}
          </p>
        )}
      </section>

      {/* ---- the two ideas a reader has to hold ---- */}
      <section className="space-y-3">
        <SectionTitle title={t("anom.terms.title")} />
        <div className="grid gap-3 lg:grid-cols-3">
          {(["interval", "shrink", "rho"] as const).map((k) => (
            <div key={k} className="card p-4">
              <h3 className="mb-1 text-[14px] font-semibold">{t(`anom.terms.${k}.t` as LocaleKey)}</h3>
              <p className="text-[13.5px] leading-relaxed text-muted">{t(`anom.terms.${k}.b` as LocaleKey)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- level of detail ---- */}
      <section>
        <label className="inline-block space-y-1.5">
          <span className="block text-[13px] font-medium text-faint">{t("anom.cfg.cluster")}</span>
          <Segmented
            value={cluster}
            ariaLabel={t("anom.cfg.cluster")}
            onChange={switchLevel}
            options={[
              { key: "hs4" as ClusterLevel, label: `${t("anom.cfg.hs4")} · ${t("anom.cfg.recommended")}`, tip: t("anom.cfg.clusterTip") },
              { key: "hs6" as ClusterLevel, label: t("anom.cfg.hs6"), tip: t("anom.cfg.clusterTip") },
            ]}
          />
        </label>
      </section>

      {/* ---- summary ---- */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label={t("anom.stat.cells")} value={fmtNum(meta.observations)}
          sub={fill(t("anom.stat.cellsSub"), { obs: fmtNum(meta.observations), clusters: fmtNum(meta.clusters) })} />
        <Stat label={t("anom.stat.tier1")} value={fmtNum(meta.tier1)} sub={t("anom.stat.tier1Sub")} />
        <Stat label={t("anom.stat.tier2")} value={fmtNum(meta.tier2)} sub={t("anom.stat.tier2Sub")} />
        <Stat label={t("anom.stat.value")} value={fmtUSD(meta.unexplainedUsd)} sub={t("anom.stat.valueSub")} />
        <Stat label={t("anom.stat.rho")} value={fmtPct(meta.rho, 0)}
          sub={fill(t("anom.stat.rhoSub"), { pct: fmtPct(1 - meta.rho, 0) })} />
      </section>

      {/* ---- every group at a glance ---- */}
      <section className="space-y-2">
        <SectionTitle title={t("anom.cat.title")} desc={t("anom.cat.desc")} />
        {cat.length === 0 ? <EmptyState text={t("anom.empty")} /> : (
          <>
            <Caterpillar clusters={cat} threshold={meta.threshold} />
            <p className="text-[13px] text-faint">
              {fill(t("anom.cat.showing"), { n: fmtNum(cat.length), total: fmtNum(ranked.length) })}
            </p>
          </>
        )}
        <Disclaimer />
      </section>

      {/* ---- the ranked table ---- */}
      <section className="space-y-2">
        <SectionTitle title={t("anom.table.title")} desc={t("anom.table.desc")} />
        {ranked.length === 0 ? <EmptyState text={t("anom.empty")} /> : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[940px] border-collapse">
              <thead className="border-b border-[var(--color-border)]">
                <tr>
                  <th className={TH}>{t("anom.th.partner")}</th>
                  <th className={TH}>{t("anom.th.code")}</th>
                  <th className={TH}>{t("anom.th.product")}</th>
                  <th className={THN} title={t("anom.tip.n")}>{t("anom.th.n")}</th>
                  <th className={THN} title={t("anom.tip.uhat")}>{t("anom.th.uhat")}</th>
                  <th className={TH} title={t("anom.tip.interval")}>{t("anom.th.interval")}</th>
                  <th className={THN} title={t("anom.tip.shrinkage")}>{t("anom.th.shrinkage")}</th>
                  <th className={THN} title={t("anom.tip.gap")}>{t("anom.th.gap")}</th>
                  <th className={THN} title={t("anom.tip.unexplained")}>{t("anom.th.unexplained")}</th>
                  <th className={TH}>{t("anom.th.tier")}</th>
                </tr>
              </thead>
              <tbody className="zebra">
                {shown.map((c) => (
                  <tr key={`${c.iso}|${c.code}`} className="border-b border-[var(--color-border-soft)] last:border-0">
                    <td className={TD}>
                      <Link href={`/partners/${c.iso.toLowerCase()}`} className="font-medium hover:underline">
                        {c.partner}
                      </Link>
                    </td>
                    <td className={`${TD} tabular font-medium text-foreground`}>{c.code}</td>
                    <td className={`${TD} text-muted`} title={c.fullLabel}>
                      {c.label.length > 38 ? `${c.label.slice(0, 38)}…` : c.label}
                    </td>
                    <td className={TDN}>{c.nObs}</td>
                    <td className={`${TDN} font-semibold`}>{times(c.uHat)}</td>
                    <td className={TD}>
                      <span className="flex items-center gap-2"
                        title={`${times(c.lo90)} – ${times(hi90(c))}`}>
                        <RangeBar lo={c.lo90} hi={hi90(c)} min={bounds.min} max={bounds.max}
                          threshold={meta.threshold} />
                        <span className="tabular whitespace-nowrap text-[12.5px] text-faint">
                          {times(c.lo90)}–{times(hi90(c))}
                        </span>
                      </span>
                    </td>
                    <td className={TDN}>{c.shrinkage.toFixed(2)}</td>
                    <td className={TDN} title={fmtUSDFull(c.gapUsd)}>{fmtUSD(c.gapUsd)}</td>
                    <td className={TDN} title={fmtUSDFull(c.unexplainedUsd)}>{fmtUSD(c.unexplainedUsd)}</td>
                    <td className={TD}><TierTag tier={c.tier} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center gap-3 text-[13.5px]">
            <button type="button" disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-md border border-[var(--color-border)] px-2 py-1 disabled:opacity-40">
              ← {t("risk.prev")}
            </button>
            <span className="tabular text-faint">
              {page * PAGE + 1}–{Math.min((page + 1) * PAGE, ranked.length)} / {fmtNum(ranked.length)}
            </span>
            <button type="button" disabled={page >= pages - 1}
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
              className="rounded-md border border-[var(--color-border)] px-2 py-1 disabled:opacity-40">
              {t("risk.next")} →
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {([1, 2, 0, 3] as Tier[]).map((tier) => (
            <span key={tier} className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border-soft)] px-2.5 py-1.5">
              <TierTag tier={tier} />
              <span className="max-w-[24rem] text-[12.5px] leading-snug text-faint">
                {t(`anom.tier.${tier}.desc` as LocaleKey)}
              </span>
            </span>
          ))}
        </div>
        <Disclaimer />
      </section>

      {/* ---- by country ---- */}
      <section className="space-y-2">
        <SectionTitle title={t("anom.partners.title")} desc={t("anom.partners.desc")} />
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="border-b border-[var(--color-border)]">
              <tr>
                <th className={TH}>{t("anom.th.partner")}</th>
                <th className={THN}>{t("anom.th.clusters")}</th>
                <th className={THN}>{t("anom.th.flagged")}</th>
                <th className={THN}>{t("anom.th.confirmed")}</th>
                <th className={THN}>{t("anom.th.share")}</th>
                <th className={THN} title={t("anom.tip.p")}>{t("anom.th.p")}</th>
                <th className={THN} title={t("anom.tip.gap")}>{t("anom.th.gap")}</th>
                <th className={THN} title={t("anom.tip.unexplained")}>{t("anom.th.unexplained")}</th>
              </tr>
            </thead>
            <tbody className="zebra">
              {partners.filter((r) => r.clusters >= 10).slice(0, 20).map((r) => (
                <tr key={r.iso} className="border-b border-[var(--color-border-soft)] last:border-0">
                  <td className={TD}>
                    <Link href={`/partners/${r.iso.toLowerCase()}`} className="font-medium hover:underline">
                      {r.partner}
                    </Link>
                  </td>
                  <td className={TDN}>{fmtNum(r.clusters)}</td>
                  <td className={TDN}>{r.flagged}</td>
                  <td className={TDN}>{r.confirmed}</td>
                  <td className={`${TDN} ${r.share > ANOMALY_BASE_RATE ? "font-semibold" : ""}`}>
                    {fmtPct(r.share, 1)}
                  </td>
                  <td className={TDN}>{r.pValue < 0.001 ? "<0.001" : r.pValue.toFixed(3)}</td>
                  <td className={TDN} title={fmtUSDFull(r.gapUsd)}>{fmtUSD(r.gapUsd)}</td>
                  <td className={TDN} title={fmtUSDFull(r.unexplainedUsd)}>{fmtUSD(r.unexplainedUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Disclaimer />
      </section>

      {/* ---- by product type ---- */}
      <section className="space-y-2">
        <SectionTitle title={t("anom.sectors.title")} desc={t("anom.sectors.desc")} />
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="border-b border-[var(--color-border)]">
              <tr>
                <th className={TH}>{t("anom.th.code")}</th>
                <th className={TH}>{t("anom.th.product")}</th>
                <th className={THN}>{t("anom.th.clusters")}</th>
                <th className={THN}>{t("anom.th.flagged")}</th>
                <th className={THN}>{t("anom.th.confirmed")}</th>
                <th className={THN}>{t("anom.th.share")}</th>
                <th className={THN}>{t("anom.th.gap")}</th>
                <th className={THN}>{t("anom.th.unexplained")}</th>
              </tr>
            </thead>
            <tbody className="zebra">
              {chapters.filter((r) => r.clusters >= 5).slice(0, 20).map((r) => (
                <tr key={r.hs2} className="border-b border-[var(--color-border-soft)] last:border-0">
                  <td className={`${TD} tabular font-medium text-foreground`}>{r.hs2}</td>
                  <td className={`${TD} text-muted`}>{r.label}</td>
                  <td className={TDN}>{fmtNum(r.clusters)}</td>
                  <td className={TDN}>{r.flagged}</td>
                  <td className={TDN}>{r.confirmed}</td>
                  <td className={TDN}>{fmtPct(r.share, 1)}</td>
                  <td className={TDN} title={fmtUSDFull(r.gapUsd)}>{fmtUSD(r.gapUsd)}</td>
                  <td className={TDN} title={fmtUSDFull(r.unexplainedUsd)}>{fmtUSD(r.unexplainedUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Disclaimer />
      </section>

      {/* ---- under the bonnet ---- */}
      <section className="space-y-3">
        <SectionTitle title={t("anom.diag.title")} desc={t("anom.diag.desc")} />
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="card p-4">
            <h3 className="mb-2 text-[14px] font-semibold">{t("anom.diag.coefTitle")}</h3>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={TH}>{t("anom.diag.term")}</th>
                  <th className={THN}>{t("anom.diag.coef")}</th>
                  <th className={THN}>{t("anom.diag.se")}</th>
                  <th className={THN}>{t("anom.diag.pval")}</th>
                </tr>
              </thead>
              <tbody className="zebra">
                {meta.coefficients.map((c) => (
                  <tr key={c.term} className="border-b border-[var(--color-border-soft)] last:border-0">
                    <td className={TD}>{t(`anom.diag.term.${c.term}` as LocaleKey)}</td>
                    <td className={TDN}>{c.coef.toFixed(3)}</td>
                    <td className={TDN}>{c.se.toFixed(3)}</td>
                    <td className={TDN}>{c.p < 0.001 ? "<0.001" : c.p.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[13px] leading-relaxed text-faint">{t("anom.diag.feNote")}</p>
          </div>

          <div className="card p-4">
            <h3 className="mb-2 text-[14px] font-semibold">{t("anom.diag.varTitle")}</h3>
            <dl className="space-y-1 text-[13.5px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t("anom.diag.varU")}</dt>
                <dd className="tabular">{meta.varU.toFixed(3)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t("anom.diag.varE")}</dt>
                <dd className="tabular">{meta.varE.toFixed(3)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-[var(--color-border-soft)] pt-1 font-semibold">
                <dt>{t("anom.diag.rho")}</dt>
                <dd className="tabular">{fmtPct(meta.rho, 0)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-[13px] leading-relaxed text-faint">{t("anom.diag.rhoNote")}</p>
          </div>

          <div className="card p-4">
            <h3 className="mb-2 text-[14px] font-semibold">{t("anom.diag.sizeTitle")}</h3>
            <dl className="mb-3 grid grid-cols-2 gap-1 text-[13.5px]">
              <dt className="text-muted">{t("anom.diag.singleton")}</dt>
              <dd className="tabular text-right">{fmtPct(meta.singletonShare, 0)}</dd>
              <dt className="text-muted">{t("anom.diag.le3")}</dt>
              <dd className="tabular text-right">{fmtPct(meta.le3Share, 0)}</dd>
              <dt className="text-muted">{t("anom.diag.median")}</dt>
              <dd className="tabular text-right">{meta.medianSize.toFixed(0)}</dd>
              <dt className="text-muted">{t("anom.diag.max")}</dt>
              <dd className="tabular text-right">{meta.maxSize}</dd>
            </dl>
            <div className="space-y-1">
              {Object.entries(meta.sizeHist).slice(0, 8).map(([n, count]) => {
                const total = Math.max(...Object.values(meta.sizeHist));
                return (
                  <div key={n} className="flex items-center gap-2 text-[12.5px]">
                    <span className="tabular w-14 text-right text-faint">{n} {t("anom.diag.sizeObs")}</span>
                    <span className="h-2.5 rounded-sm bg-[var(--color-primary)]"
                      style={{ width: `${Math.max(2, (100 * count) / total)}%` }} />
                    <span className="tabular text-faint">{fmtNum(count)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card p-4">
            <h3 className="mb-2 text-[14px] font-semibold">{t("anom.diag.freightTitle")}</h3>
            <dl className="mb-2 flex justify-between gap-3 text-[13.5px]">
              <dt className="text-muted">{t("anom.diag.freightWedge")}</dt>
              <dd className="tabular font-semibold">{wedge}</dd>
            </dl>
            <p className="text-[13px] leading-relaxed text-faint">{t("anom.diag.freightNote")}</p>
            <dl className="mt-3 space-y-1 border-t border-[var(--color-border-soft)] pt-2 text-[12.5px] text-faint">
              <div className="flex gap-2"><dt>Method:</dt><dd>{ANOMALY_SOURCE.method}</dd></div>
              <div className="flex gap-2"><dt>Gravity:</dt><dd>{ANOMALY_SOURCE.gravity}</dd></div>
              <div className="flex gap-2"><dt>Tariff:</dt><dd>{ANOMALY_SOURCE.tariff}</dd></div>
              <div className="flex gap-2"><dt>Floor:</dt><dd>{fmtUSD(ANOMALY_MIN_GAP)}</dd></div>
            </dl>
          </div>
        </div>
      </section>
    </div>
  );
}
