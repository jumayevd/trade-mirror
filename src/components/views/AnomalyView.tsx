"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Caterpillar from "@/components/charts/Caterpillar";
import TrendLine from "@/components/charts/TrendLine";
import { EmptyState, Segmented, SectionTitle, Stat } from "@/components/ui";
import { fmtNum, fmtPct, fmtUSD, fmtUSDFull } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import {
  ANOMALY_BASE_RATE, ANOMALY_MIN_GAP, ANOMALY_SOURCE, ANOMALY_WINDOW,
  chapterRollup, clustersOf, configKey, metaOf, partnerRollup, trendKeys,
  type ClusterLevel, type FreightMode, type Tier,
} from "@/lib/anomaly";
import type { LocaleKey } from "@/lib/locales";

/**
 * Unexplained Discrepancy Analysis (Gara, Giammatteo & Tosti 2018).
 *
 * The regression is fitted offline by analysis/step5_export.py; this reads
 * finished numbers. Four configurations ship and the reader switches between
 * them, because the cluster level and the freight instrument are judgement calls
 * whose consequences should be visible rather than settled behind the interface.
 *
 * Labelling is deliberate throughout: this is an "unexplained discrepancy
 * score", never a risk of money laundering, trade-based laundering or fraud.
 * Every ranked view carries the disclaimer, and no view implies that a low score
 * means clean or a high score means criminal.
 */

const TIER_STYLE: Record<Tier, string> = {
  1: "bg-[color-mix(in_srgb,var(--color-investigate)_14%,transparent)] text-[var(--color-investigate)]",
  2: "bg-[color-mix(in_srgb,var(--color-gold)_20%,transparent)] text-[var(--color-gold-ink)]",
  0: "bg-[var(--color-panel-2)] text-faint",
  3: "bg-[var(--color-panel-2)] text-faint",
};

const TH = "px-3 py-2 text-left text-[12.5px] font-medium text-faint whitespace-nowrap";
const THN = `${TH} text-right`;
const TD = "px-3 py-2 align-middle text-[13.5px]";
const TDN = `${TD} tabular text-right whitespace-nowrap`;

function TierTag({ tier }: { tier: Tier }) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-sm px-1.5 py-px text-[12px] font-medium ${TIER_STYLE[tier]}`}
      title={t(`anom.tier.${tier}.desc` as LocaleKey)}
    >
      {t(`anom.tier.${tier}` as LocaleKey)}
    </span>
  );
}

/** The disclaimer every ranked view carries. Non-negotiable, so it is one component. */
function Disclaimer() {
  const { t } = useI18n();
  return (
    <p className="mt-2 text-[12.5px] leading-relaxed text-faint">{t("anom.disclaimer")}</p>
  );
}

/**
 * Interval drawn in the cell, so overlapping intervals are obvious in the table
 * and not only in the plot. Scaled across the visible range rather than the
 * cluster's own, or every row would look equally precise.
 */
function IntervalBar({ lo, hi, min, max, threshold }: { lo: number; hi: number; min: number; max: number; threshold: number }) {
  const span = max - min || 1;
  const pct = (v: number) => `${(100 * (v - min)) / span}%`;
  return (
    <div className="relative h-3 w-28 rounded-sm bg-[var(--color-panel-2)]">
      <span
        className="absolute top-0 h-3 w-px bg-[var(--color-investigate)] opacity-60"
        style={{ left: pct(threshold) }}
      />
      <span
        className="absolute top-[5px] h-[3px] rounded-sm bg-[var(--color-primary)]"
        style={{ left: pct(lo), width: `${(100 * (hi - lo)) / span}%` }}
      />
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
  const [freight, setFreight] = useState<FreightMode>("flat");
  const [page, setPage] = useState(0);
  const [trendKind, setTrendKind] = useState<"partners" | "chapters">("partners");
  const [trendKey, setTrendKey] = useState<string>(() => trendKeys("partners")[0] ?? "");

  const key = configKey(cluster, freight);
  const meta = useMemo(() => metaOf(key), [key]);
  const clusters = useMemo(() => clustersOf(key), [key]);
  const partners = useMemo(() => partnerRollup(key), [key]);
  const chapters = useMemo(() => chapterRollup(key), [key]);

  // ranked table shows the scored clusters; suppressed singletons are not ranked
  const ranked = useMemo(() => clusters.filter((c) => c.tier !== 3), [clusters]);
  const shown = ranked.slice(page * PAGE, page * PAGE + PAGE);
  const cat = useMemo(() => clusters.filter((c) => c.tier !== 3).slice(0, CAT_LIMIT), [clusters]);
  const bounds = useMemo(() => {
    const los = ranked.map((c) => c.lo90);
    const his = ranked.map((c) => c.uHat + 1.645 * c.postSd);
    return { min: Math.min(...los, meta.threshold), max: Math.max(...his, meta.threshold) };
  }, [ranked, meta.threshold]);

  const switchConfig = (fn: () => void) => { fn(); setPage(0); };
  const pages = Math.ceil(ranked.length / PAGE);

  return (
    <div className="space-y-7">
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("anom.title")}</h1>
          <span className="tabular text-[13px] text-faint">
            {t("anom.window")} {ANOMALY_WINDOW[0]}–{ANOMALY_WINDOW[1]}
          </span>
        </div>
        <p className="max-w-3xl rounded-md border-l-2 border-l-[var(--color-primary)] bg-[var(--color-panel)] px-4 py-3 text-[13.5px] leading-relaxed text-muted">
          {t("anom.lede")}
        </p>
      </section>

      {/* ---- the switch: cluster level and freight instrument ---- */}
      <section className="flex flex-wrap items-end gap-5">
        <label className="space-y-1.5">
          <span className="block text-[12.5px] font-medium text-faint" title={t("anom.cfg.clusterTip")}>
            {t("anom.cfg.cluster")}
          </span>
          <Segmented
            value={cluster}
            ariaLabel={t("anom.cfg.cluster")}
            onChange={(v) => switchConfig(() => setCluster(v))}
            options={[
              { key: "hs4" as ClusterLevel, label: `${t("anom.cfg.hs4")} · ${t("anom.cfg.recommended")}`, tip: t("anom.cfg.clusterTip") },
              { key: "hs6" as ClusterLevel, label: t("anom.cfg.hs6"), tip: t("anom.cfg.clusterTip") },
            ]}
          />
        </label>
        <label className="space-y-1.5">
          <span className="block text-[12.5px] font-medium text-faint" title={t("anom.cfg.freightTip")}>
            {t("anom.cfg.freight")}
          </span>
          <Segmented
            value={freight}
            ariaLabel={t("anom.cfg.freight")}
            onChange={(v) => switchConfig(() => setFreight(v))}
            options={[
              { key: "flat" as FreightMode, label: `${t("anom.cfg.flat")} · ${fmtPct(meta.freightWedge, 1)}`, tip: t("anom.cfg.freightTip") },
              { key: "modelc" as FreightMode, label: t("anom.cfg.modelc"), tip: t("anom.cfg.freightTip") },
            ]}
          />
        </label>
      </section>

      {/* ---- 1. summary cards ---- */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          label={t("anom.stat.cells")}
          value={fmtNum(meta.observations)}
          sub={fill(t("anom.stat.cellsSub"), { obs: fmtNum(meta.observations), clusters: fmtNum(meta.clusters) })}
        />
        <Stat label={t("anom.stat.tier1")} value={fmtNum(meta.tier1)} sub={t("anom.stat.tier1Sub")} />
        <Stat label={t("anom.stat.tier2")} value={fmtNum(meta.tier2)} sub={t("anom.stat.tier2Sub")} />
        <Stat label={t("anom.stat.value")} value={fmtUSD(meta.unexplainedUsd)} sub={t("anom.stat.valueSub")} />
        <Stat
          label={t("anom.stat.rho")}
          value={meta.rho.toFixed(3)}
          sub={fill(t("anom.stat.rhoSub"), { pct: fmtPct(1 - meta.rho, 0) })}
        />
      </section>

      {/* ---- 3. caterpillar plot, before the table: the shape frames the ranking ---- */}
      <section className="space-y-2">
        <SectionTitle title={t("anom.cat.title")} desc={t("anom.cat.desc")} />
        {cat.length === 0 ? <EmptyState text={t("anom.empty")} /> : (
          <>
            <Caterpillar clusters={cat} threshold={meta.threshold} />
            <p className="text-[12.5px] text-faint">
              {fill(t("anom.cat.showing"), { n: fmtNum(cat.length), total: fmtNum(ranked.length) })}
            </p>
          </>
        )}
        <Disclaimer />
      </section>

      {/* ---- 2. ranked cluster table ---- */}
      <section className="space-y-2">
        <SectionTitle title={t("anom.table.title")} desc={t("anom.table.desc")} />
        {ranked.length === 0 ? <EmptyState text={t("anom.empty")} /> : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse">
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
                      {c.label.length > 40 ? `${c.label.slice(0, 40)}…` : c.label}
                    </td>
                    <td className={TDN}>{c.nObs}</td>
                    <td className={`${TDN} font-semibold`}>{c.uHat.toFixed(3)}</td>
                    <td className={TD}>
                      <span
                        className="flex items-center gap-2"
                        title={`${c.lo90.toFixed(3)} – ${(c.uHat + 1.645 * c.postSd).toFixed(3)}`}
                      >
                        <IntervalBar
                          lo={c.lo90}
                          hi={c.uHat + 1.645 * c.postSd}
                          min={bounds.min}
                          max={bounds.max}
                          threshold={meta.threshold}
                        />
                        <span className="tabular text-[12px] text-faint">{c.lo90.toFixed(2)}</span>
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
          <div className="flex items-center gap-3 text-[13px]">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-md border border-[var(--color-border)] px-2 py-1 disabled:opacity-40"
            >
              ← {t("risk.prev")}
            </button>
            <span className="tabular text-faint">
              {page * PAGE + 1}–{Math.min((page + 1) * PAGE, ranked.length)} / {fmtNum(ranked.length)}
            </span>
            <button
              type="button"
              disabled={page >= pages - 1}
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
              className="rounded-md border border-[var(--color-border)] px-2 py-1 disabled:opacity-40"
            >
              {t("risk.next")} →
            </button>
          </div>
        )}
        <Disclaimer />
      </section>

      {/* ---- 4. partner rollup ---- */}
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

      {/* ---- 5. sector rollup ---- */}
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

      {/* ---- 6. monthly trend ---- */}
      <section className="space-y-2">
        <SectionTitle title={t("anom.trend.title")} desc={t("anom.trend.desc")} />
        <div className="flex flex-wrap items-end gap-4">
          <Segmented
            value={trendKind}
            ariaLabel={t("anom.trend.title")}
            onChange={(v) => { setTrendKind(v); setTrendKey(trendKeys(v)[0] ?? ""); }}
            options={[
              { key: "partners" as const, label: t("anom.trend.partner") },
              { key: "chapters" as const, label: t("anom.trend.chapter") },
            ]}
          />
          <select
            value={trendKey}
            onChange={(e) => setTrendKey(e.target.value)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1 text-[13px] text-foreground outline-none focus:border-[var(--color-primary)]"
          >
            {trendKeys(trendKind).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
        <TrendLine kind={trendKind} seriesKey={trendKey} />
      </section>

      {/* ---- 7. model diagnostics ---- */}
      <section className="space-y-3">
        <SectionTitle title={t("anom.diag.title")} desc={t("anom.diag.desc")} />
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="card p-4">
            <h3 className="mb-2 text-[13.5px] font-semibold">{t("anom.diag.coefTitle")}</h3>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={TH}>{t("anom.diag.term")}</th>
                  <th className={THN}>{t("anom.diag.coef")}</th>
                  <th className={THN}>{t("anom.diag.se")}</th>
                  <th className={THN}>{t("anom.diag.z")}</th>
                  <th className={THN}>{t("anom.diag.pval")}</th>
                </tr>
              </thead>
              <tbody className="zebra">
                {meta.coefficients.map((c) => (
                  <tr key={c.term} className="border-b border-[var(--color-border-soft)] last:border-0">
                    <td className={TD}>{t(`anom.diag.term.${c.term}` as LocaleKey)}</td>
                    <td className={TDN}>{c.coef.toFixed(4)}</td>
                    <td className={TDN}>{c.se.toFixed(4)}</td>
                    <td className={TDN}>{c.z.toFixed(2)}</td>
                    <td className={TDN}>{c.p < 0.001 ? "<0.001" : c.p.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[12.5px] leading-relaxed text-faint">{t("anom.diag.feNote")}</p>
          </div>

          <div className="card p-4">
            <h3 className="mb-2 text-[13.5px] font-semibold">{t("anom.diag.varTitle")}</h3>
            <dl className="space-y-1 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t("anom.diag.varU")}</dt>
                <dd className="tabular">{meta.varU.toFixed(4)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t("anom.diag.varE")}</dt>
                <dd className="tabular">{meta.varE.toFixed(4)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-[var(--color-border-soft)] pt-1 font-semibold">
                <dt>{t("anom.diag.rho")}</dt>
                <dd className="tabular">{meta.rho.toFixed(4)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-[12.5px] leading-relaxed text-faint">{t("anom.diag.rhoNote")}</p>
          </div>

          <div className="card p-4">
            <h3 className="mb-2 text-[13.5px] font-semibold">{t("anom.diag.sizeTitle")}</h3>
            <dl className="mb-3 grid grid-cols-2 gap-1 text-[13px]">
              <dt className="text-muted">{t("anom.diag.singleton")}</dt>
              <dd className="tabular text-right">{fmtPct(meta.singletonShare, 1)}</dd>
              <dt className="text-muted">{t("anom.diag.le3")}</dt>
              <dd className="tabular text-right">{fmtPct(meta.le3Share, 1)}</dd>
              <dt className="text-muted">{t("anom.diag.median")}</dt>
              <dd className="tabular text-right">{meta.medianSize.toFixed(0)}</dd>
              <dt className="text-muted">{t("anom.diag.max")}</dt>
              <dd className="tabular text-right">{meta.maxSize}</dd>
            </dl>
            <div className="space-y-1">
              {Object.entries(meta.sizeHist).slice(0, 8).map(([n, count]) => {
                const total = Math.max(...Object.values(meta.sizeHist));
                return (
                  <div key={n} className="flex items-center gap-2 text-[12px]">
                    <span className="tabular w-16 text-right text-faint">
                      {n} {t("anom.diag.sizeObs")}
                    </span>
                    <span className="h-2.5 rounded-sm bg-[var(--color-primary)]"
                      style={{ width: `${Math.max(2, (100 * count) / total)}%` }} />
                    <span className="tabular text-faint">{fmtNum(count)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card p-4">
            <h3 className="mb-2 text-[13.5px] font-semibold">{t("anom.diag.freightTitle")}</h3>
            <dl className="mb-2 grid grid-cols-2 gap-1 text-[13px]">
              <dt className="text-muted">{t("anom.diag.freightWedge")}</dt>
              <dd className="tabular text-right">{fmtPct(meta.freightWedge, 1)}</dd>
              <dt className="text-muted">{t("anom.diag.freightMedian")}</dt>
              <dd className="tabular text-right">{fmtPct(meta.freightFactorMedian, 1)}</dd>
            </dl>
            <p className="text-[12.5px] leading-relaxed text-faint">{t("anom.diag.freightNote")}</p>
            <h4 className="mt-3 mb-1 text-[13px] font-semibold">{t("anom.diag.placeboTitle")}</h4>
            <p className="text-[12.5px] leading-relaxed text-faint">{t("anom.diag.placeboNote")}</p>
          </div>
        </div>
      </section>

      {/* ---- how this works, in plain language ---- */}
      <section className="space-y-3">
        <SectionTitle title={t("anom.method.title")} />
        <div className="grid max-w-5xl gap-3 lg:grid-cols-3">
          {(["anom.method.p1", "anom.method.p2", "anom.method.p3"] as LocaleKey[]).map((k) => (
            <div key={k} className="card p-4 text-[13px] leading-relaxed text-muted">{t(k)}</div>
          ))}
        </div>
        <div className="max-w-3xl space-y-2 rounded-md border-l-2 border-l-[var(--color-gold)] bg-[var(--color-panel)] px-4 py-3">
          <p className="text-[13.5px] leading-relaxed text-muted">{t("anom.method.p4")}</p>
          <p className="text-[13.5px] leading-relaxed text-muted">{t("anom.method.p5")}</p>
          <p className="text-[13.5px] leading-relaxed text-muted">{t("anom.method.p6")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {([1, 2, 0, 3] as Tier[]).map((tier) => (
            <span key={tier} className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border-soft)] px-2.5 py-1.5">
              <TierTag tier={tier} />
              <span className="max-w-[22rem] text-[12px] leading-snug text-faint">
                {t(`anom.tier.${tier}.desc` as LocaleKey)}
              </span>
            </span>
          ))}
        </div>
      </section>

      {/* ---- limits, then external validation ---- */}
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-2 text-[13.5px] font-semibold">{t("anom.limits.title")}</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-muted">
            {(["anom.limits.l1", "anom.limits.l2", "anom.limits.l3", "anom.limits.l4"] as LocaleKey[]).map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
            <li>{fill(t("anom.limits.l5"), { y0: ANOMALY_WINDOW[0], y1: ANOMALY_WINDOW[1] })}</li>
            <li>{t("anom.limits.l6")}</li>
          </ul>
        </div>
        <div className="card p-4">
          <h3 className="mb-2 text-[13.5px] font-semibold">{t("anom.valid.title")}</h3>
          <p className="text-[13px] leading-relaxed text-muted">{t("anom.valid.pending")}</p>
          <dl className="mt-3 space-y-1 text-[12.5px] text-faint">
            <div className="flex gap-2"><dt>Method:</dt><dd>{ANOMALY_SOURCE.method}</dd></div>
            <div className="flex gap-2"><dt>Gravity:</dt><dd>{ANOMALY_SOURCE.gravity}</dd></div>
            <div className="flex gap-2"><dt>Tariff:</dt><dd>{ANOMALY_SOURCE.tariff}</dd></div>
            <div className="flex gap-2">
              <dt>Floor:</dt><dd>{fmtUSD(ANOMALY_MIN_GAP)} per cell-year</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
