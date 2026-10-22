"use client";

import { useCallback, useMemo, useState } from "react";
import ValueMatrix, { type MatrixColumn, type MatrixRow } from "@/components/charts/ValueMatrix";
import FilterBar from "@/components/FilterBar";
import LevelTabs, { type HsLevel } from "@/components/LevelTabs";
import {
  SectionTitle, RiskScore, BandBadge, EmptyState, Pill, TableReveal, PageHead, PosDefNote,
} from "@/components/ui";
import { BarList, KpiTile, Meter, Panel, Takeaways, TrendFor, buildTrend, type BarItem, type Takeaway } from "@/components/summary";
import { useFilter } from "@/lib/filter-context";
import {
  aggregate, categoryLabel, comparableMonthsOfYear, hsLabel, isDerivedYear, isResidualChapter, yearsFor, yearsLabel, soleValue,
  type Channel, type RiskBand,
} from "@/lib/dataset";
import { labelsFor } from "@/lib/labels";
import { productShortLabel } from "@/lib/short-labels";
import { useI18n } from "@/lib/i18n";
import { useMonthlyDetail } from "@/lib/use-monthly-detail";
import { channelsToCsv, downloadCsv } from "@/lib/export";
import { fmtUSD, fmtUSDFull, fmtPct, fmtNum, monthRuns, BAND_COLORS, COLORS } from "@/lib/format";

/**
 * Product Analysis — the trade in view, one row per HS code, at HS2, HS4 or
 * HS6 with the same columns at every level.
 *
 * The page leads with an executive summary in the Overview's reading order:
 * headline tiles, three takeaways, then where the gap sits by sector and the
 * ten products that carry most of it. The summary follows the filter bar only;
 * the sector × year matrix and the drillable table follow beneath it, each
 * behind a reveal, and the table keeps its own drill.
 *
 * Every figure is measured on the partner × HS6 lines and summed upward: a
 * chapter or heading's export, import and positive discrepancy are the sums of
 * its HS6 products, so the frames read the same at all three levels. Export
 * and Import are the lines' values where the partner's exports exceed
 * Uzbekistan's imports, so on every row Export − Import ÷ (1 + freight) =
 * Positive discrepancy.
 */

const PAGE_SIZE = 20;
/** Sectors listed in the sector × year matrix — few enough that each cell can print its figures. */
const HEAT_TOP = 10;
/**
 * Sectors named in the summary panel; the rest fold into one "Other sectors"
 * row. Ten plus that row ends the panel level with the top ten products beside it.
 */
const SECTOR_TOP = 10;
/** Products in the summary's ranked panel. */
const PRODUCT_TOP = 10;

/** Minimal {placeholder} substitution so translated sentences keep their own word order. */
const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ------------------------------------------------------------------ */
/* Aggregation: partner × code pairs grouped by code                  */
/* ------------------------------------------------------------------ */

interface CodeAgg {
  cmd: string;
  label: string;
  pePosT: number;
  uiPosT: number;
  posT: number;
  share: number;
  partners: number;
  mtrs: number;
  band: RiskBand;
  residual: boolean;
}

/** Group partner × code pairs by code, summing across partners. */
function aggregateByCode(chs: Channel[], prefix: string): CodeAgg[] {
  const m = new Map<
    string,
    { pe: number; ui: number; pos: number; pset: Set<string>; mtrs: number; band: RiskBand }
  >();
  for (const c of chs) {
    if (prefix && !c.cmd.startsWith(prefix)) continue;
    const e = m.get(c.cmd) ?? { pe: 0, ui: 0, pos: 0, pset: new Set<string>(), mtrs: -1, band: "low" as RiskBand };
    e.pe += c.pePosT;
    e.ui += c.uiPosT;
    e.pos += c.posT;
    e.pset.add(c.partnerIso);
    // a code carries its highest-scoring partner pair
    if (c.mtrs > e.mtrs) { e.mtrs = c.mtrs; e.band = c.band; }
    m.set(c.cmd, e);
  }
  return [...m.entries()].map(([cmd, e]) => ({
    cmd,
    label: hsLabel(cmd),
    pePosT: e.pe,
    uiPosT: e.ui,
    posT: e.pos,
    share: e.pe > 0 ? e.pos / e.pe : 0,
    partners: e.pset.size,
    mtrs: Math.max(0, e.mtrs),
    band: e.band,
    residual: isResidualChapter(cmd.slice(0, 2)),
  }));
}

/* ------------------------------------------------------------------ */
/* Small chrome pieces                                                 */
/* ------------------------------------------------------------------ */

function ResidualFlag() {
  const { t } = useI18n();
  return (
    <span className="ml-2 inline-flex whitespace-nowrap" title={t("prod.residual.tip")}>
      <Pill>{t("prod.residual.pill")}</Pill>
    </span>
  );
}

type SortKey = "pePosT" | "uiPosT" | "posT" | "share" | "partners" | "mtrs";

function SortableTh({
  label, k, sort, onSort, align = "right", title,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; desc: boolean };
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
  title?: string;
}) {
  const { t } = useI18n();
  const active = sort.key === k;
  return (
    <th className={`px-3 py-1.5 font-medium whitespace-nowrap ${align === "right" ? "text-center" : "text-left"}`}>
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 ${active ? "" : "hover:text-foreground"}`}
        title={title ?? `${t("prod.sortBy")}: ${label}`}
      >
        {label}
        <span className={active ? "" : "opacity-30"}>{active && !sort.desc ? "↑" : "↓"}</span>
      </button>
    </th>
  );
}

function Pager({
  page, total, onPage, unit,
}: {
  page: number;
  total: number;
  onPage: (p: number) => void;
  unit: string;
}) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  return (
    <div className="mt-2 flex items-center justify-between text-xs text-faint">
      <span className="tabular">
        {from}–{to} / {fmtNum(total)} · {unit}
      </span>
      {pages > 1 && (
        <span className="flex items-center gap-1">
          <button
            onClick={() => onPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="rounded-md border border-[var(--color-border)] px-2 py-1 font-medium text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            ‹ {t("prod.pager.prev")}
          </button>
          <span className="tabular px-1.5">
            {page + 1}/{pages}
          </span>
          <button
            onClick={() => onPage(Math.min(pages - 1, page + 1))}
            disabled={page >= pages - 1}
            className="rounded-md border border-[var(--color-border)] px-2 py-1 font-medium text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("prod.pager.next")} ›
          </button>
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

export default function ProductsView() {
  const { filter, patch, data } = useFilter();
  const { t, lang } = useI18n();

  // ---- sector × year matrix: the selected period, under every filter on the page ----
  // Read straight off the page's aggregate, so it follows the years, months,
  // partner, HS and freight selections. Each year's figure is that sector's
  // positive channel-years; the bottom row is every sector, so the top ten
  // read against the whole.
  const heatPartial = useCallback((y: number) => isDerivedYear(y) && comparableMonthsOfYear(y).length < 12, []);
  const heat = useMemo(() => labelsFor(lang, () => {
    const years = [...data.years].sort((x, y) => x - y);
    const col = new Map(years.map((y, i) => [y, i]));
    const byCat = new Map<string, number[]>();
    for (const c of data.baseChannels) {
      let row = byCat.get(c.category);
      if (!row) { row = years.map(() => 0); byCat.set(c.category, row); }
      for (const r of c.years) {
        const i = col.get(r.y);
        if (i !== undefined && r.posY > 0) row[i] += r.posY;
      }
    }
    const all = [...byCat.entries()]
      .map(([key, values]) => ({ key, values, total: values.reduce((x, y) => x + y, 0) }))
      .filter((r) => r.total > 0);
    const totals = years.map((_, j) => all.reduce((sum, r) => sum + r.values[j], 0));
    const rows: MatrixRow[] = all
      .filter((r) => r.key !== "residual")
      .sort((x, y) => y.total - x.total)
      .slice(0, HEAT_TOP)
      .map((r) => ({
        key: r.key,
        label: categoryLabel(r.key),
        values: r.values,
        notes: r.values.map((v, j) => (totals[j] > 0 && v > 0 ? fmtPct(v / totals[j], 1) : null)),
      }));
    return { years, totals, rows };
  }), [data, lang]);
  const heatColumns = useMemo<MatrixColumn[]>(() => heat.years.map((y) => {
    const months = isDerivedYear(y) ? monthRuns(comparableMonthsOfYear(y), (n) => t(`month.${n}` as never)) : "";
    return { label: heatPartial(y) ? `${y}*` : String(y), sub: heatPartial(y) ? months : undefined, color: COLORS.positive };
  }), [heat, heatPartial, t]);

  // ---- the executive summary: the filter bar's scope at HS6, never the table's drill ----
  // Read at the measurement grain, so the tiles, the sector panel and the top
  // ten all sum against one total — the same one the HS6 table prints at the root.
  const summary = useMemo(() => labelsFor(lang, () => {
    const codes = aggregateByCode(data.channels6, "")
      .filter((r) => r.posT > 0)
      .sort((a, b) => b.posT - a.posT);
    const tot = codes.reduce(
      (s, r) => ({ pe: s.pe + r.pePosT, ui: s.ui + r.uiPosT, pos: s.pos + r.posT }),
      { pe: 0, ui: 0, pos: 0 },
    );
    const partners = new Set<string>();
    const bySector = new Map<string, { value: number; byCmd: Map<string, number> }>();
    for (const c of data.channels6) {
      if (c.posT <= 0) continue;
      partners.add(c.partnerIso);
      const e = bySector.get(c.category) ?? { value: 0, byCmd: new Map<string, number>() };
      e.value += c.posT;
      e.byCmd.set(c.cmd, (e.byCmd.get(c.cmd) ?? 0) + c.posT);
      bySector.set(c.category, e);
    }
    // the residual chapters (98–99) are not comparable at product level: they
    // count toward "Other sectors" but are never named as a leading sector
    const sectors = [...bySector.entries()]
      .filter(([key]) => key !== "residual")
      .map(([key, e]) => {
        let lead = "";
        let best = -1;
        for (const [cmd, v] of e.byCmd) if (v > best) { best = v; lead = cmd; }
        return { key, label: categoryLabel(key), value: e.value, lead };
      })
      .sort((a, b) => b.value - a.value);
    const top10 = codes.slice(0, PRODUCT_TOP).reduce((s, r) => s + r.posT, 0);
    const critical = codes.filter((r) => r.band === "critical");
    return {
      codes, tot, partners: partners.size, sectors, top10,
      critical: { n: critical.length, value: critical.reduce((s, r) => s + r.posT, 0) },
    };
  }), [data, lang]);
  const sumShare = summary.tot.pe > 0 ? summary.tot.pos / summary.tot.pe : 0;

  /*
   * The headline's trend: the whole window under the same filters, this period
   * marked. Every year is named explicitly — an empty year list reads the
   * annual book only, which would end the line before the derived years and
   * leave a 2026 selection off its own trend.
   */
  const detailVer = useMonthlyDetail(false);
  const trend = useMemo(() => {
    const window = yearsFor(filter.granularity);
    const whole = filter.years.length === window.length && filter.months.length === 0
      ? data
      : aggregate({ ...filter, years: [...window], months: [] });
    return buildTrend(
      whole.annual,
      { years: filter.years, months: filter.months },
      (y) => (heatPartial(y) ? monthRuns(comparableMonthsOfYear(y), (n) => t(`month.${n}` as never)) : undefined),
    );
    // detailVer: the derived years' rows arrive with the monthly detail
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filter, heatPartial, t, detailVer]);

  const takeaways = useMemo<Takeaway[]>(() => {
    const out: Takeaway[] = [];
    const { tot, sectors, codes, critical } = summary;
    if (tot.pos <= 0) return out;
    const lead = sectors[0];
    if (lead) {
      out.push({
        key: "sector",
        figure: fmtPct(lead.value / tot.pos, 1),
        text: fill(t("prod.tk.sector"), { sector: lead.label, value: fmtUSD(lead.value) }),
      });
    }
    const top = codes[0];
    if (top) {
      out.push({
        key: "product",
        figure: fmtUSD(top.posT),
        text: fill(t("prod.tk.product"), { product: productShortLabel(top.cmd, lang), code: top.cmd }),
        meta: `${t("prod.col.partners")}: ${fmtNum(top.partners)}`,
      });
    }
    if (critical.n > 0) {
      out.push({
        key: "critical",
        figure: fmtUSD(critical.value),
        text: fill(t("prod.tk.critical"), { band: t("band.critical"), pct: fmtPct(critical.value / tot.pos, 1) }),
        // the unit is written to sit mid-sentence; here it opens the line
        meta: `${capFirst(t("prod.unit.hs6products"))}: ${fmtNum(critical.n)}`,
        accent: BAND_COLORS.critical,
        href: "/savdo/risk",
        cta: t("nav.queue"),
      });
    }
    return out;
  }, [summary, t, lang]);

  const sectorItems = useMemo<BarItem[]>(() => {
    const { tot, sectors } = summary;
    const shown = sectors.slice(0, SECTOR_TOP);
    const items: BarItem[] = shown.map((s) => ({
      key: s.key,
      label: s.label,
      meta: s.lead ? fill(t("prod.sector.lead"), { product: productShortLabel(s.lead, lang) }) : undefined,
      value: s.value,
      valueText: fmtUSD(s.value),
      note: fmtPct(s.value / tot.pos, 1),
    }));
    const rest = tot.pos - shown.reduce((x, s) => x + s.value, 0);
    if (rest > tot.pos * 0.0005) {
      items.push({
        key: "other",
        label: t("prod.sector.other"),
        value: rest,
        valueText: fmtUSD(rest),
        note: fmtPct(rest / tot.pos, 1),
        color: COLORS.axis,
      });
    }
    return items;
  }, [summary, t, lang]);

  // a product row narrows the page to that product through the filter bar,
  // where the selection shows and clears like any other — the Overview's
  // product tiles land on the same state
  const productItems = useMemo<BarItem[]>(() => summary.codes.slice(0, PRODUCT_TOP).map((r) => ({
    key: r.cmd,
    label: productShortLabel(r.cmd, lang),
    title: `HS ${r.cmd} · ${r.label}`,
    meta: `HS ${r.cmd} · ${t("prod.col.partners")}: ${fmtNum(r.partners)}`,
    badge: <BandBadge band={r.band} />,
    value: r.posT,
    valueText: fmtUSD(r.posT),
    note: fmtPct(r.posT / summary.tot.pos, 1),
    onClick: filter.hs6.length === 1 && filter.hs6[0] === r.cmd ? undefined : () => patch({ hs6: [r.cmd] }),
    actionTip: t("prod.top.focus"),
  })), [summary, lang, t, filter.hs6, patch]);

  // ---- drill state (local; the shareable filter state stays in the URL via FilterBar) ----
  const [level, setLevel] = useState<HsLevel>(6);
  const [chapter, setChapter] = useState<string | null>(null); // drilled HS2 chapter
  const [hs4, setHs4] = useState<string | null>(null); // drilled HS4 code
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>(() => ({ key: "posT", desc: true }));
  const [page, setPage] = useState(0);

  // Respect the global HS2 filter: a single chosen chapter overrides (and disables)
  // the local drill. A multi-chapter selection has no single node to drill into, so
  // the local drill stays in charge and the aggregate does the narrowing.
  const effChapter = soleValue(filter.hs2) ?? chapter;

  // Resets below are adjusted during render (react.dev: "Adjusting some state
  // when a prop changes") rather than in effects — the drill clearing must be
  // sticky (survive the filter being reverted), so it cannot be derived.
  const hs2Key = filter.hs2.join(",");
  const [prevHs2, setPrevHs2] = useState(hs2Key);
  if (prevHs2 !== hs2Key) {
    setPrevHs2(hs2Key);
    if (filter.hs2.length > 0) {
      setChapter(null);
      setHs4((h) => (h && filter.hs2.some((p) => h.startsWith(p)) ? h : null));
    }
  }

  // new drill target → default sort, first page
  const [prevView, setPrevView] = useState({ level, effChapter, hs4 });
  if (prevView.level !== level || prevView.effChapter !== effChapter || prevView.hs4 !== hs4) {
    setPrevView({ level, effChapter, hs4 });
    setSort({ key: "posT", desc: true });
    setPage(0);
  }

  // any other filter or sort change → first page
  const [prevPage, setPrevPage] = useState({ f: filter, s: sort });
  if (prevPage.f !== filter || prevPage.s !== sort) {
    setPrevPage({ f: filter, s: sort });
    setPage(0);
  }

  const onSort = (k: SortKey) =>
    setSort((s) => (s.key === k ? { key: k, desc: !s.desc } : { key: k, desc: true }));

  // ---- navigation handlers ----
  const goRoot = () => {
    // back to the default view: every HS6 product
    setLevel(6);
    setChapter(null);
    setHs4(null);
    if (filter.hs2.length > 0 || filter.hs4.length > 0 || filter.hs6.length > 0) patch({ hs2: [], hs4: [], hs6: [] });
  };
  const drillChapter = (code: string) => {
    if (filter.hs2.length === 0) setChapter(code);
    setHs4(null);
    setLevel(4);
  };
  const drillHs4 = (code: string) => {
    if (filter.hs2.length === 0) setChapter(code.slice(0, 2));
    setHs4(code);
    setLevel(6);
  };
  const setToggle = (lv: HsLevel) => {
    setLevel(lv);
    if (lv === 2) {
      setChapter(null);
      setHs4(null);
    } else if (lv === 4) {
      setHs4(null);
    }
  };

  // ---- rows for the active level: the same columns at HS2, HS4 and HS6 ----
  const rows = useMemo<CodeAgg[]>(() => {
    if (level === 2) return aggregateByCode(data.channels, "");
    if (level === 4) return aggregateByCode(data.channels4, effChapter ?? "");
    return aggregateByCode(data.channels6, hs4 ?? effChapter ?? "");
  }, [level, effChapter, hs4, data]);

  const sorted = useMemo(() => {
    const k = sort.key;
    return [...rows].sort((a, b) => (sort.desc ? b[k] - a[k] : a[k] - b[k]) || b.posT - a.posT);
  }, [rows, sort]);

  const totalRows = sorted.length;
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const cifPct = Math.round(filter.cif * 100);
  const period = yearsLabel(filter.years);
  const childUnit =
    level === 2 ? t("prod.unit.chapters") : level === 4 ? t("prod.unit.hs4groups") : t("prod.unit.hs6products");

  // ---- export: the active-level pair set (partner × code, raw + derived fields) ----
  const activeChannels = level === 2 ? data.channels : level === 4 ? data.channels4 : data.channels6;
  const exportCsv = () =>
    downloadCsv(`products_hs${level}_${period.replace(/[^0-9]+/g, "_")}.csv`, channelsToCsv(activeChannels, filter));

  const isEmpty = totalRows === 0;
  const td = "tabular px-3 py-1.5 text-center whitespace-nowrap";

  return (
    <div className="space-y-6">
      {/* header + export */}
      <PageHead
        title={<h1 className="whitespace-nowrap text-xl font-semibold tracking-tight sm:text-2xl">{t("nav.products")}</h1>}
        definition={false}
        right={
        <button
          onClick={exportCsv}
          disabled={activeChannels.length === 0}
          className="rounded-md border border-[var(--color-border)] px-2 py-1 fs-13 font-medium text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          title={`HS${level} · ${t("prod.export.tip")}`}
        >
          {t("common.exportCsv")}
        </button>
        }
      />

      <FilterBar note={<PosDefNote />} />
      {filter.years.length === 0 ? (
        <EmptyState text={t("common.noPeriod")} />
      ) : (
      <>

      {/* 1. headline tiles — the filter bar's scope, at the HS6 grain */}
      {summary.codes.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* each tile: its figure and context on top, its picture at the foot —
              the trend, or the share the figure is of its whole */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile
              hero
              label={t("kpi.positive")}
              value={fmtUSD(summary.tot.pos)}
              sub={fill(t("prod.kpi.posSub"), { pe: fmtUSD(summary.tot.pe), ui: fmtUSD(summary.tot.ui) })}
              info={`${fill(t("prof.stat.positive.info"), { cif: cifPct })} ${fmtUSDFull(summary.tot.pos)}. ${t("prod.stat.exports")}: ${fmtUSDFull(summary.tot.pe)}. ${t("prod.stat.imports")}: ${fmtUSDFull(summary.tot.ui)}. ${period}.`}
              footer={<TrendFor points={trend} />}
            />
            <KpiTile
              label={t("prof.stat.share")}
              value={fmtPct(sumShare, 1)}
              sub={t("prod.kpi.shareSub")}
              accent={COLORS.positive}
              info={`${t("prof.stat.share.info")} ${fmtUSDFull(summary.tot.pos)} ÷ ${fmtUSDFull(summary.tot.pe)}.`}
              footer={
                <Meter
                  of={summary.tot.pe}
                  ariaLabel={t("prof.stat.share")}
                  segments={[{ key: "gap", value: summary.tot.pos, color: COLORS.positive, label: t("kpi.positive"), valueText: fmtUSD(summary.tot.pos) }]}
                  caption={fill(t("prod.kpi.top10Sub"), { value: fmtUSD(summary.tot.pos), total: fmtUSD(summary.tot.pe) })}
                />
              }
            />
            <KpiTile
              label={t("prod.kpi.products")}
              value={fmtNum(summary.codes.length)}
              sub={fill(t("prod.kpi.productsSub"), { n: fmtNum(summary.partners) })}
              accent={COLORS.navy2}
              info={t("prod.kpi.products.info")}
              footer={
                // how many of them are in the top risk band — the bridge to Discrepancy & Risk
                <Meter
                  of={summary.codes.length}
                  ariaLabel={t("prod.kpi.products")}
                  segments={[{ key: "critical", value: summary.critical.n, color: BAND_COLORS.critical, label: t("band.critical"), valueText: fmtNum(summary.critical.n) }]}
                  caption={`${fill(t("risk.band.title"), { band: t("band.critical") })}: ${fmtNum(summary.critical.n)} (${fmtPct(summary.critical.n / summary.codes.length, 1)})`}
                />
              }
            />
            <KpiTile
              label={t("prod.kpi.top10")}
              value={fmtPct(summary.top10 / summary.tot.pos, 1)}
              sub={fill(t("prod.kpi.top10Sub"), { value: fmtUSD(summary.top10), total: fmtUSD(summary.tot.pos) })}
              accent={COLORS.navy3}
              info={t("prod.kpi.top10.info")}
              footer={
                <Meter
                  of={summary.tot.pos}
                  ariaLabel={t("prod.kpi.top10")}
                  segments={[{ key: "top10", value: summary.top10, color: COLORS.navy3, label: t("prod.kpi.top10"), valueText: fmtUSD(summary.top10) }]}
                />
              }
            />
          </section>

          {/* 2. what the numbers say */}
          <Takeaways title={t("sum.takeaways")} items={takeaways} />

          {/* 3. where the gap sits, and what carries it */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title={t("prod.sector.title")} desc={t("prod.sector.desc")}>
              <BarList items={sectorItems} ariaLabel={t("prod.sector.title")} />
            </Panel>
            <Panel title={t("prod.top.title")} desc={t("prod.top.desc")}>
              <BarList items={productItems} ranked ariaLabel={t("prod.top.title")} />
            </Panel>
          </div>
        </>
      )}

      {/* 4. sectors × years: how the gap moved — only when there is more than one year to read across */}
      {summary.codes.length > 0 && heat.years.length > 1 && heat.rows.length > 0 && (
        <section>
          <SectionTitle title={t("prod.heat.title")} desc={t("prod.heat.sub")} />
          <TableReveal showLabel={t("common.showBreakdown")} hideLabel={t("common.hideBreakdown")}>
            <div className="card p-4">
              <ValueMatrix
                rows={heat.rows}
                columns={heatColumns}
                totals={heat.totals}
                totalWord={t("heat.total")}
                totalRowLabel={t("heat.allSectors")}
                shareWord={t("heat.share")}
                rowTitle={t("heat.sector")}
                ariaLabel={t("prod.heat.title")}
              />
              {heat.years.some(heatPartial) && (
                <p className="mt-2 fs-12 text-faint">* {t("prod.heat.partial")}</p>
              )}
            </div>
          </TableReveal>
        </section>
      )}

      {/* 5. the full ranking — one layout for every level, with its own drill */}
      {summary.codes.length > 0 && (
        <section>
          <SectionTitle title={t("prod.detail.title")} desc={t("prod.detail.desc")} />
          <TableReveal>
          {/* HS level toggle + breadcrumb, driving the table */}
          <div className="flex flex-wrap items-center gap-3">
            <LevelTabs
              level={level}
              onChange={setToggle}
              label={t("prod.aria.hsLevel")}
              tips={{ 2: t("prod.level.hs2.tip"), 4: t("prod.level.hs4.tip"), 6: t("prod.level.hs6.tip") }}
            />
            <nav className="flex flex-wrap items-center gap-1.5 fs-13" aria-label={t("prod.aria.breadcrumb")}>
              {(effChapter || hs4) && (
                <button
                  onClick={goRoot}
                  className="text-muted hover:underline"
                  title={filter.hs2.length > 0 ? t("prod.breadcrumb.backAllClear") : t("prod.breadcrumb.backAll")}
                >
                  ← {t("prod.breadcrumb.backAll")}
                </button>
              )}
              {effChapter && level !== 2 && (
                <>
                  <span className="text-faint">›</span>
                  <button
                    onClick={() => drillChapter(effChapter)}
                    className={level === 4 && !hs4 ? "font-medium" : "text-muted hover:underline"}
                    title={`${t("prod.chapter")} ${effChapter} — ${t("prod.tip.showHs4")}`}
                  >
                    <span className="tabular">{effChapter}</span> {hsLabel(effChapter)}
                  </button>
                </>
              )}
              {hs4 && level === 6 && (
                <>
                  <span className="text-faint">›</span>
                  <span className="font-medium">
                    <span className="tabular">{hs4}</span> {hsLabel(hs4)}
                  </span>
                </>
              )}
              {level !== 2 && !effChapter && !hs4 && <Pill>HS{level} · {t("prod.flatView")}</Pill>}
            </nav>
          </div>
          {isEmpty ? (
            <EmptyState />
          ) : (
          <>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[1040px] fs-13">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left fs-12 font-medium text-faint">
                  <th className="px-3 py-1.5 font-medium">{t("prod.col.code")}</th>
                  <th className="px-3 py-1.5 font-medium">{t("common.product")}</th>
                  <SortableTh label={t("prof.th.export")} k="pePosT" sort={sort} onSort={onSort} title={t("prod.tip.export")} />
                  <SortableTh label={t("prof.th.import")} k="uiPosT" sort={sort} onSort={onSort} title={t("prod.tip.import")} />
                  <SortableTh label={t("prof.th.gap")} k="posT" sort={sort} onSort={onSort} title={t("prod.tip.positive")} />
                  <SortableTh label={t("prof.th.share")} k="share" sort={sort} onSort={onSort} title={t("prof.th.share.tip")} />
                  <SortableTh label={t("prod.col.partners")} k="partners" sort={sort} onSort={onSort} title={t("prod.tip.partners")} />
                  <SortableTh label={t("prof.th.score")} k="mtrs" sort={sort} onSort={onSort} title={t("prod.tip.maxRisk")} />
                  <th className="px-3 py-1.5 font-medium" title={t("prod.tip.maxRisk")}>{t("prof.th.band")}</th>
                </tr>
              </thead>
              <tbody className="zebra">
                {pageRows.map((r) => (
                  <tr key={r.cmd} className="border-b border-[var(--color-border-soft)] last:border-b-0">
                    <td className="tabular px-3 py-1.5 font-medium">{r.cmd}</td>
                    <td className="max-w-[320px] px-3 py-1.5">
                      {level === 6 ? (
                        <span>{r.label}</span>
                      ) : (
                        <button
                          onClick={() => (level === 2 ? drillChapter(r.cmd) : drillHs4(r.cmd))}
                          className="text-left font-medium hover:underline"
                          title={fill(t(level === 2 ? "prod.tip.drillChapter" : "prod.tip.drillHs4"), { code: r.cmd })}
                        >
                          {r.label}
                        </button>
                      )}
                      {r.residual && <ResidualFlag />}
                    </td>
                    <td className={`${td} text-muted`} title={fmtUSDFull(r.pePosT)}>{fmtUSD(r.pePosT)}</td>
                    <td className={`${td} text-muted`} title={fmtUSDFull(r.uiPosT)}>{fmtUSD(r.uiPosT)}</td>
                    <td className={`${td} font-medium`} style={{ color: COLORS.positive }} title={fmtUSDFull(r.posT)}>{fmtUSD(r.posT)}</td>
                    <td className={td}>{r.pePosT > 0 ? fmtPct(r.share, 1) : "—"}</td>
                    <td className={`${td} text-muted`}>{fmtNum(r.partners)}</td>
                    <td className={td}><RiskScore score={r.mtrs} band={r.band} /></td>
                    <td className="px-3 py-1.5"><BandBadge band={r.band} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={totalRows} onPage={setPage} unit={childUnit} />
          </>
          )}
          </TableReveal>
        </section>
      )}
      </>
      )}
    </div>
  );
}
