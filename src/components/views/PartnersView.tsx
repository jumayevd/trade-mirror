"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import FilterBar from "@/components/FilterBar";
import Sparkline from "@/components/charts/Sparkline";
import { Stat, SectionTitle, ContextLine, QualityTag, TransitTag, EmptyState, InfoTip } from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import { meta, type PartnerAgg } from "@/lib/dataset";
import { channelsToCsv, downloadCsv } from "@/lib/export";
import { fmtUSD, fmtUSDFull, fmtPct, COLORS } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

/**
 * Partners list (spec §6.5) — ranked table of partner countries under the active
 * filters, with a compare mode (up to 4 partners side by side). Positive and
 * reverse discrepancies are always shown together; a discrepancy is a screening
 * signal, never proof of wrongdoing.
 */
type SortKey = "positive" | "reverse" | "share" | "investigate";

const MAX_COMPARE = 4;

const gapRate = (p: PartnerAgg) => (p.peT > 0 ? p.posT / p.peT : 0);

const SORT_TIPS: Record<SortKey, string> = {
  positive: "Sort by cumulative positive discrepancy (partner reported more than Uzbekistan recorded).",
  reverse: "Sort by cumulative reverse discrepancy (Uzbekistan recorded more than the partner reported).",
  share: "Sort by positive discrepancy relative to partner-reported exports — flags pairs where the gap is large for their trade volume.",
  investigate: "Sort by the number of HS2 channels classified Investigate (high anomaly + high evidence).",
};

export default function PartnersView() {
  const { data, series, filter } = useFilter();
  const { t } = useI18n();
  const [sort, setSort] = useState<SortKey>("positive");
  const [sel, setSel] = useState<string[]>([]);

  const rows = useMemo(() => {
    const by: Record<SortKey, (a: PartnerAgg, b: PartnerAgg) => number> = {
      positive: (a, b) => b.posT - a.posT,
      reverse: (a, b) => b.revT - a.revT,
      share: (a, b) => gapRate(b) - gapRate(a),
      investigate: (a, b) => b.investigate - a.investigate || b.posT - a.posT,
    };
    return [...data.partners].sort(by[sort]);
  }, [data.partners, sort]);

  // KPI row (spec §6.5.1)
  const highTier = data.partners.filter((p) => p.tier === "High").length;
  const lapsed = meta.partners.filter((p) => p.lapse).length;
  const sparse = meta.partners.filter((p) => !p.lapse && p.coverage < 0.5).length;
  const transitCount = data.partners.filter((p) => p.transit).length;

  const compare = sel
    .map((iso) => data.partners.find((p) => p.iso3 === iso))
    .filter((p): p is PartnerAgg => !!p);

  const toggle = (iso: string) =>
    setSel((s) =>
      s.includes(iso) ? s.filter((x) => x !== iso) : s.length >= MAX_COMPARE ? s : [...s, iso],
    );

  const th = "px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-faint whitespace-nowrap";
  const thNum = `${th} text-right`;
  const td = "px-2 py-2 align-middle text-[13px]";
  const tdNum = `${td} tabular text-right whitespace-nowrap`;

  const sortBtn = (k: SortKey, label: string) => (
    <button
      onClick={() => setSort(k)}
      title={SORT_TIPS[k]}
      className={`inline-flex items-center gap-0.5 uppercase tracking-wider hover:text-foreground ${sort === k ? "text-foreground" : ""}`}
    >
      {label}
      <span aria-hidden>{sort === k ? "▾" : ""}</span>
    </button>
  );

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-faint">Explore · partner screening</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t("nav.partners")}</h1>
        <p className="max-w-3xl text-[15px] leading-relaxed text-muted">
          Partner countries ranked under the current filters. Positive discrepancy (amber)
          means the partner reported more exports than Uzbekistan recorded as imports;
          reverse (blue) means Uzbekistan recorded more. Both are residual unexplained
          discrepancies — statistical screening signals, not evidence of smuggling or
          under-declaration. Open a partner for its full profile, or tick up to{" "}
          {MAX_COMPARE} partners to compare them side by side.
        </p>
      </section>

      <FilterBar showMateriality />
      <ContextLine filter={filter} />

      {/* KPI row */}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label="Partners in view"
          value={String(data.partners.length)}
          sub="with comparable channels under the filters"
          info="Partner countries with at least one country × HS2 channel passing the active filters."
        />
        <Stat
          label="Comparable partners"
          value={String(highTier)}
          sub="high-tier reporters in view"
          accent="var(--color-quality, #15803d)"
          info="Partners in view whose Comtrade reporting is complete and consistent (tier High) — mirror gaps with them are least likely to be reporting artifacts."
        />
        <Stat
          label="Missing / lapsed reporters"
          value={`${lapsed} · ${sparse}`}
          sub="stopped reporting · sparse (<50% of years)"
          info={`Across all ${meta.partners.length} tracked partners (unfiltered): ${lapsed} stopped reporting to Comtrade within the ${meta.window.start}–${meta.window.end} window and ${sparse} more reported in fewer than half of the years. Their missing years have no mirror reference and are never treated as zero gaps.`}
        />
        <Stat
          label="Transit-sensitive"
          value={String(transitCount)}
          sub="re-export hubs in view"
          accent={COLORS.transit}
          info="Partners flagged as transit/re-export hubs. Origin-vs-consignment recording can create legitimate discrepancies there, so they are assessed in a separate track."
        />
      </section>

      {/* compare panel */}
      {compare.length > 0 && (
        <section className="card p-4">
          <SectionTitle
            title={`Compare partners (${compare.length}/${MAX_COMPARE})`}
            desc={`Key figures for the selected period side by side. Mini trend: positive discrepancy by year over the full ${meta.window.start}–${meta.window.end} window (reported years only — missing partner-years are skipped, never drawn as zero).`}
            right={
              <button
                onClick={() => setSel([])}
                className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[13px] text-muted hover:text-foreground"
              >
                Clear ✕
              </button>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {compare.map((p) => {
              const full = series.partners.find((x) => x.iso3 === p.iso3);
              const spark = (full ?? p).byYear
                .filter((y) => y.reported)
                .map((y) => Math.round(y.positive));
              return (
                <div key={p.iso3} className="rounded-lg border border-[var(--color-border-soft)] p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Link href={`/partners/${p.iso3.toLowerCase()}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline">
                      {p.name}
                    </Link>
                    <QualityTag tier={p.tier} />
                    {p.transit && <TransitTag />}
                  </div>
                  {spark.length >= 2 ? (
                    <Sparkline data={spark} color={COLORS.positive} width={180} height={38} />
                  ) : (
                    <p className="text-[11px] text-faint">
                      Fewer than two reported years — no trend can be drawn.
                    </p>
                  )}
                  <dl className="mt-2 space-y-1 text-[12px]">
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint">Comparable trade</dt>
                      <dd className="tabular" title={fmtUSDFull(p.peT)}>{fmtUSD(p.peT)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint">Positive</dt>
                      <dd className="tabular" style={{ color: COLORS.positive }} title={fmtUSDFull(p.posT)}>{fmtUSD(p.posT)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint">Reverse</dt>
                      <dd className="tabular" style={{ color: COLORS.reverse }} title={fmtUSDFull(p.revT)}>{fmtUSD(p.revT)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint">Gap rate</dt>
                      <dd className="tabular" title="Positive discrepancy / partner-reported exports.">{fmtPct(gapRate(p), 0)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint">Coverage</dt>
                      <dd className="tabular">{fmtPct(p.coverage, 0)}{p.lapse ? ` · stopped ${p.lastReportedYear}` : ""}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint">Investigate channels</dt>
                      <dd className="tabular">{p.investigate}</dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ranking table */}
      <section className="space-y-3">
        <SectionTitle
          title="Partner ranking"
          desc="Country × HS2 channels rolled up per partner under the active filters. Source: UN Comtrade mirror statistics."
          right={
            <button
              onClick={() => downloadCsv("partners_hs2_channels.csv", channelsToCsv(data.channels, filter))}
              disabled={data.channels.length === 0}
              className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[13px] font-medium text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              title="Download the underlying HS2 channels for every partner in view, with the calculation context in the header."
            >
              {t("common.exportCsv")} ↓
            </button>
          }
        />
        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[1060px] border-collapse">
              <thead className="border-b border-[var(--color-border)]">
                <tr>
                  <th className={th} title={`Tick up to ${MAX_COMPARE} partners to compare them side by side.`}>
                    <span className="inline-flex items-center gap-1">Cmp <InfoTip text={`Select up to ${MAX_COMPARE} partners for the side-by-side compare panel.`} /></span>
                  </th>
                  <th className={th}>{t("common.partner")}</th>
                  <th className={th}>Data quality</th>
                  <th className={thNum} title="Partner-reported exports (FOB) in channels where both sides reported.">Comparable trade</th>
                  <th className={thNum}>{sortBtn("positive", "Positive")}</th>
                  <th className={thNum}>{sortBtn("reverse", "Reverse")}</th>
                  <th className={thNum}>{sortBtn("share", "Gap rate")}</th>
                  <th className={thNum} title="Share of window years in which the partner reported to Comtrade. Missing years have no mirror reference and are never treated as zero gaps.">Coverage</th>
                  <th className={th} title="HS2 chapter carrying the largest discrepancy (active direction) for this partner.">Top HS2</th>
                  <th className={thNum}>{sortBtn("investigate", "Investigate")}</th>
                </tr>
              </thead>
              <tbody className="zebra">
                {rows.map((p) => {
                  const topCh = p.topChapters[0];
                  const checked = sel.includes(p.iso3);
                  return (
                    <tr key={p.iso3} className="border-b border-[var(--color-border-soft)] hover:bg-[color-mix(in_srgb,var(--color-primary)_4%,transparent)]">
                      <td className={td}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!checked && sel.length >= MAX_COMPARE}
                          onChange={() => toggle(p.iso3)}
                          aria-label={`Compare ${p.name}`}
                          className="h-3.5 w-3.5 accent-[var(--color-primary)] disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className={`${td} whitespace-nowrap`}>
                        <Link href={`/partners/${p.iso3.toLowerCase()}`} className="font-medium hover:underline">
                          {p.name}
                        </Link>
                        <span className="ml-2 text-xs text-faint">{p.region}</span>
                      </td>
                      <td className={`${td} whitespace-nowrap`}>
                        <span className="inline-flex items-center gap-1.5">
                          <QualityTag tier={p.tier} />
                          {p.transit && <TransitTag />}
                        </span>
                      </td>
                      <td className={tdNum} title={fmtUSDFull(p.peT)}>{fmtUSD(p.peT)}</td>
                      <td className={tdNum} style={{ color: COLORS.positive }} title={`Positive discrepancy (partner > UZB records): ${fmtUSDFull(p.posT)}`}>
                        {fmtUSD(p.posT)}
                      </td>
                      <td className={tdNum} style={{ color: COLORS.reverse }} title={`Reverse discrepancy (UZB records > partner): ${fmtUSDFull(p.revT)}`}>
                        {fmtUSD(p.revT)}
                      </td>
                      <td className={tdNum} title="Positive discrepancy / partner-reported exports.">{fmtPct(gapRate(p), 0)}</td>
                      <td className={tdNum} title={p.lapse ? `Reported ${p.reportedYears.length} year(s); stopped after ${p.lastReportedYear}. Missing years are not zero gaps.` : `Reported in ${p.reportedYears.length} of ${meta.years.length} window years.`}>
                        {fmtPct(p.coverage, 0)}
                        {p.lapse && <span className="ml-1 text-[10px]" style={{ color: "#b45309" }}>⏹ {p.lastReportedYear}</span>}
                      </td>
                      <td className={`${td} max-w-[220px]`}>
                        {topCh ? (
                          <span title={`HS ${topCh.chapter} · ${topCh.label} — ${fmtUSDFull(topCh.value)} (${fmtPct(topCh.share, 0)} of this partner's positive discrepancy)`}>
                            <span className="tabular mr-1.5 text-xs text-faint">{topCh.chapter}</span>
                            <span className="text-[13px]">{topCh.label.length > 34 ? `${topCh.label.slice(0, 34)}…` : topCh.label}</span>
                          </span>
                        ) : (
                          <span className="text-faint" title="No HS2 chapter above the noise floor in the active direction for this partner.">below noise</span>
                        )}
                      </td>
                      <td className={tdNum} title="Number of this partner's HS2 channels classified Investigate (high anomaly + high evidence). A screening priority count, not a finding of wrongdoing.">
                        {p.investigate}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="max-w-3xl text-xs text-faint">
          Values in nominal USD, accumulated over the selected period. Positive = partner
          reported more than Uzbekistan recorded; reverse = Uzbekistan recorded more — the
          two are shown separately and never netted into a single headline. Missing
          partner-years are excluded from the comparison, never treated as zero. Source: UN
          Comtrade.
        </p>
      </section>
    </div>
  );
}
