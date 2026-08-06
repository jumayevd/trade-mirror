"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import FilterBar from "@/components/FilterBar";
import Sparkline from "@/components/charts/Sparkline";
import RiskMap, { MAP_METRIC_LABELS, type MapMetric } from "@/components/charts/RiskMap";
import { Stat, SectionTitle, ContextLine, QualityTag, TransitTag, EmptyState, InfoTip, MissingValue } from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import { meta, partnerName, type PartnerAgg } from "@/lib/dataset";
import { channelsToCsv, downloadCsv } from "@/lib/export";
import { fmtNum, fmtUSD, fmtUSDFull, fmtPct, COLORS } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

/**
 * Country Analysis (spec §6.5) — geographic hero (click a country to open its
 * profile), ranked country table, per-year and per-country summary statistics,
 * and a compare mode (up to 4 partners side by side). Positive and reverse
 * discrepancies are always shown together; a residual unexplained discrepancy
 * is a statistical screening signal, never proof of wrongdoing.
 */

type SortKey = "positive" | "reverse" | "share" | "investigate";
type HeroMode = "map" | "table";

const MAX_COMPARE = 4;
const PAGE_SIZE = 15;

const gapRate = (p: PartnerAgg) => (p.peT > 0 ? p.posT / p.peT : 0);

const SORT_TIPS: Record<SortKey, string> = {
  positive: "Sort by cumulative positive discrepancy (partner reported more than Uzbekistan recorded).",
  reverse: "Sort by cumulative reverse discrepancy (Uzbekistan recorded more than the partner reported).",
  share: "Sort by positive discrepancy relative to partner-reported exports — flags pairs where the gap is large for their trade volume.",
  investigate: "Sort by the number of HS2 channels classified Investigate (high anomaly + high evidence).",
};

/** Compact client pagination footer — "X–Y of N". */
function Pager({
  page, total, onPage,
}: {
  page: number; total: number; onPage: (p: number) => void;
}) {
  if (total <= PAGE_SIZE) return null;
  const pages = Math.ceil(total / PAGE_SIZE);
  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);
  const btn = "rounded-md border border-[var(--color-border)] px-2 py-1 text-[12px] text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border-soft)] px-3 py-2">
      <span className="tabular text-[12px] text-faint">
        {from}–{to} of {total}
      </span>
      <button className={btn} onClick={() => onPage(page - 1)} disabled={page === 0} aria-label="Previous page">‹</button>
      <button className={btn} onClick={() => onPage(page + 1)} disabled={page >= pages - 1} aria-label="Next page">›</button>
    </div>
  );
}

/** Segmented toggle in the house style (same look as the year quick-range buttons). */
function Segmented<T extends string>({
  value, options, onChange, ariaLabel,
}: {
  value: T; options: { key: T; label: string; tip?: string }[]; onChange: (v: T) => void; ariaLabel: string;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-panel-2)] p-1" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          title={o.tip}
          className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${
            value === o.key
              ? "bg-[var(--color-primary)] text-white"
              : "text-muted hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function PartnersView() {
  const { data, series, filter } = useFilter();
  const { t } = useI18n();
  const [sort, setSort] = useState<SortKey>("positive");
  const [sel, setSel] = useState<string[]>([]);
  const [heroMode, setHeroMode] = useState<HeroMode>("map");
  const [mapMetric, setMapMetric] = useState<MapMetric>("total");
  const [rankPage, setRankPage] = useState(0);
  const [sumPage, setSumPage] = useState(0);

  /* ------------------------------------------------------------------ */
  /* Ranking rows (filtered partner rollups)                             */
  /* ------------------------------------------------------------------ */
  const rows = useMemo(() => {
    const by: Record<SortKey, (a: PartnerAgg, b: PartnerAgg) => number> = {
      positive: (a, b) => b.posT - a.posT,
      reverse: (a, b) => b.revT - a.revT,
      share: (a, b) => gapRate(b) - gapRate(a),
      investigate: (a, b) => b.investigate - a.investigate || b.posT - a.posT,
    };
    return [...data.partners].sort(by[sort]);
  }, [data.partners, sort]);

  // keep pagination in range when filters shrink the list
  useEffect(() => { setRankPage(0); }, [rows.length, sort]);
  const pagedRows = rows.slice(rankPage * PAGE_SIZE, (rankPage + 1) * PAGE_SIZE);

  /* ------------------------------------------------------------------ */
  /* Summary by country — from base (pre-stage/signal) channels so the   */
  /* totals row reproduces data.kpis exactly (cross-page consistency)    */
  /* ------------------------------------------------------------------ */
  interface CountryTotals { iso3: string; peT: number; uiT: number; posT: number; revT: number }
  const countryTotals = useMemo<CountryTotals[]>(() => {
    const m = new Map<string, CountryTotals>();
    for (const c of data.baseChannels) {
      const e = m.get(c.partnerIso) ?? { iso3: c.partnerIso, peT: 0, uiT: 0, posT: 0, revT: 0 };
      e.peT += c.peT; e.uiT += c.uiT; e.posT += c.posT; e.revT += c.revT;
      m.set(c.partnerIso, e);
    }
    return [...m.values()].sort((a, b) => b.peT - a.peT);
  }, [data.baseChannels]);
  useEffect(() => { setSumPage(0); }, [countryTotals.length]);
  const pagedTotals = countryTotals.slice(sumPage * PAGE_SIZE, (sumPage + 1) * PAGE_SIZE);
  const uiBase = useMemo(() => data.baseChannels.reduce((s, c) => s + c.uiT, 0), [data.baseChannels]);

  /* ------------------------------------------------------------------ */
  /* KPI strip                                                           */
  /* ------------------------------------------------------------------ */
  const highTier = data.partners.filter((p) => p.tier === "High").length;
  const lapsed = meta.partners.filter((p) => p.lapse).length;
  const sparse = meta.partners.filter((p) => !p.lapse && p.coverage < 0.5).length;
  const transitCount = data.partners.filter((p) => p.transit).length;

  /* ------------------------------------------------------------------ */
  /* Compare selection                                                   */
  /* ------------------------------------------------------------------ */
  const compare = sel
    .map((iso) => data.partners.find((p) => p.iso3 === iso))
    .filter((p): p is PartnerAgg => !!p);
  const toggle = (iso: string) =>
    setSel((s) =>
      s.includes(iso) ? s.filter((x) => x !== iso) : s.length >= MAX_COMPARE ? s : [...s, iso],
    );

  const exportCsv = () =>
    downloadCsv("country_analysis_hs2_channels.csv", channelsToCsv(data.channels, filter));

  const K = 1 + filter.cif;

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

  /* ------------------------------------------------------------------ */
  /* Reusable ranking table (hero Table mode & the ranking section)      */
  /* ------------------------------------------------------------------ */
  const rankingTable =
    rows.length === 0 ? (
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
            {pagedRows.map((p) => {
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
        <Pager page={rankPage} total={rows.length} onPage={setRankPage} />
      </div>
    );

  return (
    <div className="space-y-8">
      {/* 1. header */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-faint">
              Explore · country screening · UN Comtrade · {meta.window.start}–{meta.window.end}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{t("nav.partners")}</h1>
            <p className="max-w-3xl text-[15px] leading-relaxed text-muted">
              Where the residual unexplained discrepancies sit geographically, and how each partner
              country ranks under the active filters. Positive (amber) means the partner reported more
              exports than Uzbekistan recorded as imports; reverse (blue) means Uzbekistan recorded
              more. Both are statistical screening signals, never evidence of wrongdoing. Click a
              country on the map or in the table to open its full profile.
            </p>
          </div>
          <button
            onClick={exportCsv}
            disabled={data.channels.length === 0}
            className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[13px] font-medium text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            title="Download the underlying country × HS2 channels for the active filters, with the calculation context in the header."
          >
            {t("common.exportCsv")} ↓
          </button>
        </div>
      </section>

      {/* 2. filters + context */}
      <FilterBar showMateriality />
      <ContextLine filter={filter} />

      {/* 3. map hero */}
      <section className="space-y-3">
        <SectionTitle
          title="Geographic view"
          desc="Countries shaded by the discrepancy metric in the active direction. Grey never means a zero gap — it marks partners with no comparable data or low reporting quality. Click a country to open its profile."
          right={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Segmented<MapMetric>
                ariaLabel="Map metric"
                value={mapMetric}
                onChange={setMapMetric}
                options={(Object.keys(MAP_METRIC_LABELS) as MapMetric[]).map((k) => ({
                  key: k,
                  label: MAP_METRIC_LABELS[k],
                  tip:
                    k === "total" ? "Cumulative discrepancy value in the active direction."
                      : k === "intensity" ? "Discrepancy per $100M of comparable (partner-reported) trade — normalizes away country size."
                        : "Number of country × HS2 channels passing the active filters.",
                }))}
              />
              <Segmented<HeroMode>
                ariaLabel="Map or table"
                value={heroMode}
                onChange={setHeroMode}
                options={[
                  { key: "map", label: "Map", tip: "Geographic view — click a country to open its profile." },
                  { key: "table", label: "Table", tip: "Skip the map and jump straight to the country ranking table." },
                ]}
              />
            </div>
          }
        />
        {heroMode === "map" ? (
          data.partners.length === 0 ? (
            <EmptyState />
          ) : (
            <RiskMap partners={data.partners} filter={filter} metric={mapMetric} />
          )
        ) : (
          rankingTable
        )}

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat
            label="Partners in view"
            value={String(data.partners.length)}
            sub="with comparable channels under the filters"
            info="Partner countries with at least one country × HS2 channel passing the active filters."
          />
          <Stat
            label="High-tier reporters"
            value={String(highTier)}
            sub={`of ${data.partners.length} partners in view`}
            accent="#15803d"
            info="Partners in view whose Comtrade reporting is complete and consistent (tier High) — mirror gaps with them are least likely to be reporting artifacts."
          />
          <Stat
            label="Lapsed / sparse reporters"
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
        </div>
      </section>

      {/* 7. compare panel (rendered as soon as anything is selected) */}
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

      {/* 4. country ranking (below the map; in Table mode it already IS the hero) */}
      {heroMode === "map" && (
        <section className="space-y-3">
          <SectionTitle
            title="Country ranking"
            desc="Country × HS2 channels rolled up per partner under the active filters. Tick up to four partners to compare them side by side. Source: UN Comtrade mirror statistics."
          />
          {rankingTable}
          <p className="max-w-3xl text-xs text-faint">
            Values in nominal USD, accumulated over the selected period. Positive = partner reported
            more than Uzbekistan recorded; reverse = Uzbekistan recorded more — the two are shown
            separately and never netted into a single headline. Missing partner-years are excluded
            from the comparison, never treated as zero. Source: UN Comtrade.
          </p>
        </section>
      )}

      {/* 5. summary statistics by year */}
      <section className="space-y-3">
        <SectionTitle
          title="Summary statistics by year"
          desc="Annual totals across all comparable channels under the active filters — how the two sides' reported values and the resulting discrepancies evolve over the selected period."
        />
        <p className="max-w-3xl text-xs text-muted">
          Tip: this table follows the selected year range — use the quick range buttons in the filter
          bar ({t("filter.lastYear")} / 2y / 4y / {t("filter.fullPeriod")}) or the start–end year
          selectors to widen it.
        </p>
        {data.annual.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead className="border-b border-[var(--color-border)]">
                <tr>
                  <th className={th}>{t("common.year")}</th>
                  <th className={thNum} title="Partner countries with at least one comparable channel in that year.">Comparable partners</th>
                  <th className={thNum} title="Partner-reported exports to Uzbekistan (FOB), comparable channels only.">Partner exports (FOB)</th>
                  <th className={thNum} title="Uzbekistan-recorded imports (CIF), comparable channels only.">UZB imports (CIF)</th>
                  <th className={thNum} title="Sum of channel-year gaps where the partner reported more (after the freight adjustment).">Positive</th>
                  <th className={thNum} title="Sum of channel-year gaps where Uzbekistan recorded more (after the freight adjustment).">Reverse</th>
                  <th className={thNum} title={`Positive discrepancy as a share of expected imports (partner exports × ${K.toFixed(2)} freight uplift) in that year.`}>Positive share</th>
                </tr>
              </thead>
              <tbody className="zebra">
                {data.annual.map((r) => {
                  const noData = r.comparablePartners === 0;
                  const expected = r.pe * K;
                  return (
                    <tr key={r.year} className="border-b border-[var(--color-border-soft)] last:border-b-0">
                      <td className={`${td} tabular font-medium`}>{r.year}</td>
                      <td className={tdNum}>{noData ? <MissingValue kind="notComparable" /> : fmtNum(r.comparablePartners)}</td>
                      <td className={tdNum} title={noData ? undefined : fmtUSDFull(r.pe)}>{noData ? <MissingValue /> : fmtUSD(r.pe)}</td>
                      <td className={tdNum} title={noData ? undefined : fmtUSDFull(r.ui)}>{noData ? <MissingValue /> : fmtUSD(r.ui)}</td>
                      <td className={tdNum} style={noData ? undefined : { color: COLORS.positive }} title={noData ? undefined : fmtUSDFull(r.positive)}>
                        {noData ? <MissingValue /> : fmtUSD(r.positive)}
                      </td>
                      <td className={tdNum} style={noData ? undefined : { color: COLORS.reverse }} title={noData ? undefined : fmtUSDFull(r.reverse)}>
                        {noData ? <MissingValue /> : fmtUSD(r.reverse)}
                      </td>
                      <td className={tdNum}>
                        {noData || expected <= 0 ? <MissingValue kind="notComparable" /> : fmtPct(r.positive / expected, 1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="max-w-3xl text-xs text-faint">
          Computed from all comparable channels before stage/signal filters — the same basis as the
          headline KPIs. Years in which no partner in view reported are shown as missing, never as
          zero flows. Source: UN Comtrade.
        </p>
      </section>

      {/* 6. summary by country */}
      <section className="space-y-3">
        <SectionTitle
          title="Summary by country"
          desc="Per-partner totals over the selected years, on the comparable-stage basis. The totals row reproduces the headline KPI figures, so this table reconciles exactly with the Executive Overview."
        />
        {countryTotals.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead className="border-b border-[var(--color-border)]">
                <tr>
                  <th className={th}>{t("common.partner")}</th>
                  <th className={thNum} title="Partner-reported exports to Uzbekistan (FOB), comparable channels only.">Partner exports (FOB)</th>
                  <th className={thNum} title="Uzbekistan-recorded imports (CIF), comparable channels only.">UZB imports (CIF)</th>
                  <th className={thNum} title="Cumulative positive discrepancy (partner > UZB records) after the freight adjustment.">Positive</th>
                  <th className={thNum} title="Cumulative reverse discrepancy (UZB records > partner) after the freight adjustment.">Reverse</th>
                  <th className={thNum} title="This partner's share of total comparable (partner-reported) trade in view.">Share of trade</th>
                </tr>
              </thead>
              <tbody className="zebra">
                {pagedTotals.map((r) => (
                  <tr key={r.iso3} className="border-b border-[var(--color-border-soft)]">
                    <td className={`${td} whitespace-nowrap`}>
                      <Link href={`/partners/${r.iso3.toLowerCase()}`} className="font-medium hover:underline">
                        {partnerName(r.iso3)}
                      </Link>
                    </td>
                    <td className={tdNum} title={fmtUSDFull(r.peT)}>{fmtUSD(r.peT)}</td>
                    <td className={tdNum} title={fmtUSDFull(r.uiT)}>{fmtUSD(r.uiT)}</td>
                    <td className={tdNum} style={{ color: COLORS.positive }} title={fmtUSDFull(r.posT)}>{fmtUSD(r.posT)}</td>
                    <td className={tdNum} style={{ color: COLORS.reverse }} title={fmtUSDFull(r.revT)}>{fmtUSD(r.revT)}</td>
                    <td className={tdNum}>
                      {data.kpis.comparableTrade > 0 ? fmtPct(r.peT / data.kpis.comparableTrade, 1) : <MissingValue kind="notComparable" />}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-panel-2)] font-semibold">
                  <td className={`${td} whitespace-nowrap`} title="Headline KPI figures — identical to the Executive Overview under the same filters.">
                    All partners ({fmtNum(countryTotals.length)})
                  </td>
                  <td className={tdNum} title={fmtUSDFull(data.kpis.comparableTrade)}>{fmtUSD(data.kpis.comparableTrade)}</td>
                  <td className={tdNum} title={fmtUSDFull(uiBase)}>{fmtUSD(uiBase)}</td>
                  <td className={tdNum} style={{ color: COLORS.positive }} title={`${fmtUSDFull(data.kpis.positive.central)} (central freight scenario; range ${fmtUSD(data.kpis.positive.low)}–${fmtUSD(data.kpis.positive.high)} across 6–15%)`}>
                    {fmtUSD(data.kpis.positive.central)}
                  </td>
                  <td className={tdNum} style={{ color: COLORS.reverse }} title={fmtUSDFull(data.kpis.reverse)}>{fmtUSD(data.kpis.reverse)}</td>
                  <td className={tdNum}>{fmtPct(1, 0)}</td>
                </tr>
              </tfoot>
            </table>
            <Pager page={sumPage} total={countryTotals.length} onPage={setSumPage} />
          </div>
        )}
        <p className="max-w-3xl text-xs text-faint">
          Comparable-stage basis (before stage/signal/materiality filters), so the totals row equals
          the headline KPIs shown across the site under the same period, direction and freight
          settings. Ranked by partner-reported exports. Missing partner-years are excluded, never
          counted as zero. Source: UN Comtrade.
        </p>
      </section>
    </div>
  );
}
