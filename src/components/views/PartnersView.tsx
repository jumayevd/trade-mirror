"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import FilterBar from "@/components/FilterBar";
import Sparkline from "@/components/charts/Sparkline";
import RiskMap, { MAP_METRIC_KEYS, type MapMetric } from "@/components/charts/RiskMap";
import { SectionTitle, ContextLine, QualityTag, TransitTag, EmptyState, InfoTip, MissingValue, Segmented } from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import { meta, type PartnerAgg } from "@/lib/dataset";
import { channelsToCsv, downloadCsv } from "@/lib/export";
import { fmtNum, fmtUSD, fmtUSDFull, fmtPct, COLORS } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

/**
 * Country Analysis (spec §6.5) — geographic hero (click a country to open its
 * profile), ranked country table, per-year and per-country summary statistics,
 * and a compare mode (up to 4 partners side by side). Only the positive
 * discrepancy is screened: partner-reported exports uplifted by freight, minus
 * Uzbekistan-recorded imports, accumulated over the years where it is positive.
 */

type SortKey = "positive" | "share" | "channels";
type HeroMode = "map" | "table";

const MAX_COMPARE = 4;
const PAGE_SIZE = 15;

const gapRate = (p: PartnerAgg) => (p.peT > 0 ? p.posT / p.peT : 0);

/** Series-identity dot for column headers / labels — the text itself stays ink (rule 5). */
function HeadDot({ color }: { color: string }) {
  return (
    <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: color }} />
  );
}

/** Locale keys for the column-sort tooltips — resolved through `t` at render time. */
const SORT_TIP_KEYS: Record<SortKey, string> = {
  positive: "ctry.sortTip.positive",
  share: "ctry.sortTip.share",
  channels: "ctry.sortTip.channels",
};

/** Compact client pagination footer — "X–Y of N". */
function Pager({
  page, total, onPage,
}: {
  page: number; total: number; onPage: (p: number) => void;
}) {
  const { t } = useI18n();
  if (total <= PAGE_SIZE) return null;
  const pages = Math.ceil(total / PAGE_SIZE);
  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);
  const btn = "rounded-md border border-[var(--color-border)] px-2 py-1 text-[12px] text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border-soft)] px-3 py-2">
      <span className="tabular text-[12px] text-faint">
        {from}–{to} {t("ctry.pager.of")} {total}
      </span>
      <button className={btn} onClick={() => onPage(page - 1)} disabled={page === 0} aria-label={t("ctry.pager.prev")}>‹</button>
      <button className={btn} onClick={() => onPage(page + 1)} disabled={page >= pages - 1} aria-label={t("ctry.pager.next")}>›</button>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Dynamics (re-homed from the deleted Trends page)                        */
/* ---------------------------------------------------------------------- */

interface CountryMover {
  key: string; label: string; iso3: string; total: number; trend: number;
  series: { y: number; v: number }[];
}

/** One quiet column of movers — Rising or Easing. */
function MoverColumn({
  title, rows, color, deltaColor,
}: {
  title: string; rows: CountryMover[]; color: string; deltaColor: string;
}) {
  const { t } = useI18n();
  return (
    <div className="card p-3.5">
      <div className="mb-2 text-[10.5px] font-medium text-faint">{title}</div>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-[12px] text-faint">{t("ctry.movers.empty")}</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border-soft)]">
          {rows.map((m) => (
            <li key={m.key} className="flex items-center gap-3 py-1.5">
              <Link href={`/partners/${m.iso3.toLowerCase()}`} className="min-w-0 flex-1 truncate text-[13px] font-medium hover:underline">
                {m.label}
              </Link>
              <span className="tabular w-16 shrink-0 text-right text-[12px] text-muted"
                title={`${t("ctry.movers.totalTip")}: ${fmtUSDFull(m.total)}`}>
                {fmtUSD(m.total)}
              </span>
              <span className="shrink-0">
                {m.series.length >= 2 ? (
                  <Sparkline type="line" data={m.series.map((x) => Math.round(x.v))} color={color} width={88} height={26} />
                ) : (
                  <span className="inline-block w-[88px] text-center text-[10.5px] text-faint" title={t("ctry.fewYears")}>—</span>
                )}
              </span>
              <span className="tabular w-16 shrink-0 text-right text-[12px] font-medium" style={{ color: deltaColor }}
                title={`${t("ctry.movers.trendTip")}: ${fmtUSDFull(m.trend)}`}>
                {fmtUSD(m.trend, { sign: true })}
              </span>
            </li>
          ))}
        </ul>
      )}
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
  const [pageSel, setPageSel] = useState<{ len: number; sort: SortKey; page: number } | null>(null);

  /* ------------------------------------------------------------------ */
  /* Ranking rows (filtered partner rollups)                             */
  /* ------------------------------------------------------------------ */
  const rows = useMemo(() => {
    const by: Record<SortKey, (a: PartnerAgg, b: PartnerAgg) => number> = {
      positive: (a, b) => b.posT - a.posT,
      share: (a, b) => gapRate(b) - gapRate(a),
      channels: (a, b) => b.channels - a.channels || b.posT - a.posT,
    };
    return [...data.partners].sort(by[sort]);
  }, [data.partners, sort]);

  // full-window series per partner — the ranking sparkline is independent of the
  // ticked years, and only reported years are drawn (never a zero for a gap year)
  const sparkByIso = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const p of series.partners) {
      m.set(p.iso3, p.byYear.filter((y) => y.reported).map((y) => Math.round(y.positive)));
    }
    return m;
  }, [series.partners]);

  // pagination is derived: it falls back to page 0 whenever the list length or
  // sort has changed since the user last paged — no reset effect needed
  const rankPage = pageSel && pageSel.len === rows.length && pageSel.sort === sort ? pageSel.page : 0;
  const pagedRows = rows.slice(rankPage * PAGE_SIZE, (rankPage + 1) * PAGE_SIZE);

  /* ------------------------------------------------------------------ */
  /* Headline counts (one quiet sentence above the map)                  */
  /* ------------------------------------------------------------------ */
  const highTier = data.partners.filter((p) => p.tier === "High").length;
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

  /* ------------------------------------------------------------------ */
  /* Dynamics — full-window country movers (engine already excludes      */
  /* lapsed reporters, whose apparent declines are reporting artifacts)  */
  /* ------------------------------------------------------------------ */
  const risers = useMemo(
    () => series.movers.countries.filter((m) => m.trend > 0).sort((a, b) => b.trend - a.trend).slice(0, 6),
    [series.movers.countries],
  );
  const easers = useMemo(
    () => series.movers.countries.filter((m) => m.trend < 0).sort((a, b) => a.trend - b.trend).slice(0, 6),
    [series.movers.countries],
  );
  const exportCsv = () =>
    downloadCsv("country_analysis_hs2_channels.csv", channelsToCsv(data.channels, filter));

  const K = 1 + filter.cif;

  const th = "px-3 py-1.5 text-left text-[10.5px] font-medium text-faint whitespace-nowrap";
  const thNum = `${th} text-right`;
  const td = "px-3 py-1.5 align-middle text-[13px]";
  const tdNum = `${td} tabular text-right whitespace-nowrap`;

  const sortBtn = (k: SortKey, label: string) => (
    <button
      onClick={() => setSort(k)}
      title={t(SORT_TIP_KEYS[k] as never)}
      className={`inline-flex items-center gap-0.5 hover:text-foreground ${sort === k ? "text-foreground" : ""}`}
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
        <table className="w-full min-w-[860px] border-collapse">
          <thead className="border-b border-[var(--color-border)]">
            <tr>
              <th className={th} title={`${t("ctry.rank.cmpTipPre")} ${MAX_COMPARE} ${t("ctry.rank.cmpTipPost")}`}>
                <span className="inline-flex items-center gap-1">{t("ctry.rank.cmp")} <InfoTip text={`${t("ctry.rank.cmpInfoPre")} ${MAX_COMPARE} ${t("ctry.rank.cmpInfoPost")}`} /></span>
              </th>
              <th className={th}>{t("common.partner")}</th>
              <th className={thNum}><HeadDot color={COLORS.positive} />{sortBtn("positive", t("ctry.col.positive"))}</th>
              <th className={thNum}>{sortBtn("share", t("ctry.col.gapRate"))}</th>
              <th className={thNum}>{sortBtn("channels", t("ctry.col.channels"))}</th>
              <th className={th} title={`${t("ctry.rank.trendTipPre")} ${meta.window.start}–${meta.window.end} ${t("ctry.rank.trendTipPost")}`}>{t("ctry.col.trend")}</th>
              <th className={th} title={t("ctry.rank.topHs2Tip")}>{t("ctry.col.topHs2")}</th>
            </tr>
          </thead>
          <tbody className="zebra">
            {pagedRows.map((p) => {
              const topCh = p.topChapters[0];
              const checked = sel.includes(p.iso3);
              const spark = sparkByIso.get(p.iso3) ?? [];
              return (
                <tr key={p.iso3} className="border-b border-[var(--color-border-soft)] hover:bg-[color-mix(in_srgb,var(--color-primary)_4%,transparent)]">
                  <td className={td}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && sel.length >= MAX_COMPARE}
                      onChange={() => toggle(p.iso3)}
                      aria-label={`${t("ctry.rank.compareAria")} ${p.name}`}
                      className="h-3.5 w-3.5 accent-[var(--color-primary)] disabled:cursor-not-allowed"
                    />
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <Link href={`/partners/${p.iso3.toLowerCase()}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <span className="ml-2 text-xs text-faint">{p.region}</span>
                    {p.transit && <span className="ml-2 align-middle"><TransitTag /></span>}
                  </td>
                  <td className={tdNum} title={`${t("kpi.positive")} (${t("kpi.positive.sub")}): ${fmtUSDFull(p.posT)}`}>
                    {fmtUSD(p.posT)}
                  </td>
                  <td className={tdNum} title={t("ctry.gapRateTip")}>{fmtPct(gapRate(p), 0)}</td>
                  <td className={tdNum} title={t("ctry.channelsTip")}>{fmtNum(p.channels)}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    <span className="inline-flex items-center gap-2">
                      {spark.length >= 2 ? (
                        <Sparkline type="line" data={spark} color={COLORS.positive} width={72} height={22} />
                      ) : (
                        <span className="inline-block w-[72px] text-center text-[10.5px] text-faint" title={t("ctry.fewYears")}>—</span>
                      )}
                      <span className="tabular w-14 text-right text-[12px] text-muted" title={`${t("ctry.trendFullWindowTip")}: ${fmtUSDFull(p.trend)}`}>
                        {fmtUSD(p.trend, { sign: true })}
                      </span>
                    </span>
                  </td>
                  <td className={`${td} max-w-[220px]`}>
                    {topCh ? (
                      <span title={`HS ${topCh.chapter} · ${topCh.label} — ${fmtUSDFull(topCh.value)} (${fmtPct(topCh.share, 0)} ${t("ctry.rank.ofPartnerPositive")})`}>
                        <span className="tabular mr-1.5 text-xs text-faint">{topCh.chapter}</span>
                        <span className="text-[13px]">{topCh.label.length > 34 ? `${topCh.label.slice(0, 34)}…` : topCh.label}</span>
                      </span>
                    ) : (
                      <span className="text-faint" title={t("ctry.rank.belowNoiseTip")}>{t("ctry.rank.belowNoise")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-panel-2)] font-semibold">
              <td className={td} />
              <td className={`${td} whitespace-nowrap`} title={t("ctry.rank.totalsTip")}>
                {t("ctry.rank.totalsRow")}
              </td>
              <td className={tdNum} title={`${fmtUSDFull(data.kpis.positive.central)} (${t("ctry.rank.freightRangePre")} ${fmtUSD(data.kpis.positive.low)}–${fmtUSD(data.kpis.positive.high)} ${t("ctry.rank.freightRangePost")})`}>
                {fmtUSD(data.kpis.positive.central)}
              </td>
              <td className={tdNum} colSpan={4} />
            </tr>
          </tfoot>
        </table>
        <Pager page={rankPage} total={rows.length} onPage={(p) => setPageSel({ len: rows.length, sort, page: p })} />
      </div>
    );

  return (
    <div className="space-y-6">
      {/* 1. header */}
      <section className="space-y-1.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <p className="text-[10.5px] font-medium text-faint">
              {t("nav.explore")} · {t("ctry.eyebrow")} · UN Comtrade · {meta.window.start}–{meta.window.end}
            </p>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("nav.partners")}</h1>
            <p className="text-[12px] text-muted">
              <Link href="/methodology" className="hover:underline">{t("nav.methodology")} →</Link>
            </p>
          </div>
          <button
            onClick={exportCsv}
            disabled={data.channels.length === 0}
            className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[12px] font-medium text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            title={t("ctry.exportTip")}
          >
            {t("common.exportCsv")} ↓
          </button>
        </div>
      </section>

      {/* 2. filters + context */}
      <FilterBar />
      <ContextLine filter={filter} />

      {/* 3. map hero */}
      <section className="space-y-3">
        <SectionTitle
          title={t("ctry.geo.title")}
          desc={t("ctry.geo.desc")}
          right={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <InfoTip text={t("ctry.geo.info")} />
              <Segmented<MapMetric>
                ariaLabel={t("ctry.geo.metricAria")}
                value={mapMetric}
                onChange={setMapMetric}
                options={(Object.keys(MAP_METRIC_KEYS) as MapMetric[]).map((k) => ({
                  key: k,
                  label: t(MAP_METRIC_KEYS[k] as never),
                  tip: k === "total" ? t("ctry.map.tipTotal") : t("ctry.map.tipChannels"),
                }))}
              />
              <Segmented<HeroMode>
                ariaLabel={t("ctry.geo.viewAria")}
                value={heroMode}
                onChange={setHeroMode}
                options={[
                  { key: "map", label: t("ctry.geo.map"), tip: t("ctry.geo.mapTip") },
                  { key: "table", label: t("ctry.geo.table"), tip: t("ctry.geo.tableTip") },
                ]}
              />
            </div>
          }
        />
        <p className="max-w-3xl text-[12px] text-muted">
          <span className="tabular font-medium text-foreground">{data.partners.length}</span> {t("ctry.stats.partners")}
          · <span className="tabular font-medium text-foreground" title={t("ctry.stats.highTierTip")}>{highTier}</span> {t("ctry.stats.highTier")}
          · <span className="tabular font-medium text-foreground" title={t("ctry.stats.transitTip")}>{transitCount}</span> {t("ctry.stats.transitHubs")}
        </p>
        {heroMode === "map" ? (
          data.partners.length === 0 ? (
            <EmptyState />
          ) : (
            <RiskMap partners={data.partners} metric={mapMetric} />
          )
        ) : (
          rankingTable
        )}
      </section>

      {/* 4. compare panel (rendered as soon as anything is selected) */}
      {compare.length > 0 && (
        <section className="card p-4">
          <SectionTitle
            title={`${t("ctry.compare.title")} (${compare.length}/${MAX_COMPARE})`}
            desc={t("ctry.compare.desc")}
            right={
              <span className="flex items-center gap-2">
                <InfoTip text={`${t("ctry.compare.infoPre")} ${meta.window.start}–${meta.window.end} ${t("ctry.compare.infoPost")}`} />
                <button
                  onClick={() => setSel([])}
                  className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[12px] text-muted hover:text-foreground"
                >
                  {t("ctry.compare.clear")} ✕
                </button>
              </span>
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
                      {t("ctry.fewYears")}
                    </p>
                  )}
                  <dl className="mt-2 space-y-1 text-[12px]">
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint"><HeadDot color={COLORS.positive} />{t("ctry.col.positive")}</dt>
                      <dd className="tabular" title={fmtUSDFull(p.posT)}>{fmtUSD(p.posT)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint">{t("ctry.col.gapRate")}</dt>
                      <dd className="tabular" title={t("ctry.gapRateTip")}>{fmtPct(gapRate(p), 0)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint">{t("ctry.compare.coverage")}</dt>
                      <dd className="tabular">{fmtPct(p.coverage, 0)}{p.lapse ? ` · ${t("ctry.compare.stopped")} ${p.lastReportedYear}` : ""}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint">{t("ctry.compare.flaggedChannels")}</dt>
                      <dd className="tabular">{p.flagged}</dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 5. country ranking (below the map; in Table mode it already IS the hero) */}
      {heroMode === "map" && (
        <section className="space-y-3">
          <SectionTitle
            title={t("ctry.rank.title")}
            desc={t("ctry.rank.desc")}
            right={<InfoTip text={t("ctry.rank.info")} />}
          />
          {rankingTable}
        </section>
      )}

      {/* 6. dynamics (re-homed from the former Trends page) */}
      <section className="space-y-3">
        <SectionTitle
          title={t("ctry.dyn.title")}
          desc={t("ctry.dyn.desc")}
          right={<InfoTip text={`${t("ctry.dyn.infoPre")} ${meta.window.start}–${meta.window.end} ${t("ctry.dyn.infoPost")} ${t("common.source")}.`} />}
        />
        {risers.length === 0 && easers.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            <MoverColumn title={t("ctry.dyn.rising")} rows={risers} color={COLORS.positive} deltaColor="var(--color-serious)" />
            <MoverColumn title={t("ctry.dyn.easing")} rows={easers} color={COLORS.axis} deltaColor="var(--color-ok)" />
          </div>
        )}
      </section>

      {/* 7. summary statistics by year */}
      <section className="space-y-3">
        <SectionTitle
          title={t("ctry.annual.title")}
          desc={t("ctry.annual.desc")}
          right={<InfoTip text={`${t("ctry.annual.info")} ${t("common.source")}.`} />}
        />
        {data.annual.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead className="border-b border-[var(--color-border)]">
                <tr>
                  <th className={th}>{t("common.year")}</th>
                  <th className={thNum} title={t("ctry.annual.comparablePartnersTip")}>{t("ctry.annual.comparablePartners")}</th>
                  <th className={thNum} title={t("ctry.annual.partnerExportsTip")}>{t("ctry.partnerExportsFob")}</th>
                  <th className={thNum} title={t("ctry.annual.uzbImportsTip")}>{t("ctry.uzbImportsCif")}</th>
                  <th className={thNum} title={t("ctry.annual.positiveTip")}><HeadDot color={COLORS.positive} />{t("ctry.col.positive")}</th>
                  <th className={thNum} title={`${t("ctry.annual.positiveShareTipPre")} ${K.toFixed(2)} ${t("ctry.annual.positiveShareTipPost")}`}>{t("ctry.annual.positiveShare")}</th>
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
                      <td className={tdNum} title={noData ? undefined : fmtUSDFull(r.positive)}>
                        {noData ? <MissingValue /> : fmtUSD(r.positive)}
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
      </section>

    </div>
  );
}
