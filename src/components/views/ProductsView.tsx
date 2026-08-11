"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import FilterBar from "@/components/FilterBar";
import LevelTabs, { type HsLevel } from "@/components/LevelTabs";
import Sparkline from "@/components/charts/Sparkline";
import {
  Stat, SectionTitle, ContextLine, RiskScore, BandBadge, EmptyState, MissingValue, Pill,
} from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import {
  meta, hsLabel, productByCmd, isResidualChapter, yearsLabel, soleValue, observedTotals,
  type Channel, type ChapterAgg, type RiskBand,
} from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";
import { channelsToCsv, downloadCsv } from "@/lib/export";
import { fmtUSD, fmtUSDFull, fmtPct, fmtNum, COLORS } from "@/lib/format";

const PAGE_SIZE = 15;

/** Minimal {placeholder} substitution so translated sentences keep their own word order. */
const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

/* ------------------------------------------------------------------ */
/* Aggregation: children of a node, grouped by code across partners    */
/* ------------------------------------------------------------------ */

interface CodeAgg {
  cmd: string;
  label: string;
  peT: number;
  uiT: number;
  posT: number;
  partners: number;
  mtrs: number;
  band: RiskBand;
  residual: boolean;
}

/** Group partner × code channels by code (summing values across partners). */
function aggregateByCode(chs: Channel[], prefix: string): CodeAgg[] {
  const m = new Map<
    string,
    { peT: number; uiT: number; posT: number; pset: Set<string>; mtrs: number; band: RiskBand }
  >();
  for (const c of chs) {
    if (prefix && !c.cmd.startsWith(prefix)) continue;
    const e = m.get(c.cmd) ?? { peT: 0, uiT: 0, posT: 0, pset: new Set<string>(), mtrs: 0, band: "low" as RiskBand };
    e.peT += c.peT;
    e.uiT += c.uiT;
    e.posT += c.posT;
    e.pset.add(c.partnerIso);
    // a product line inherits its worst partner channel
    if (c.mtrs > e.mtrs) { e.mtrs = c.mtrs; e.band = c.band; }
    m.set(c.cmd, e);
  }
  return [...m.entries()].map(([cmd, e]) => ({
    cmd,
    label: hsLabel(cmd),
    peT: e.peT,
    uiT: e.uiT,
    posT: e.posT,
    partners: e.pset.size,
    mtrs: e.mtrs,
    band: e.band,
    residual: isResidualChapter(cmd.slice(0, 2)),
  }));
}

/* ------------------------------------------------------------------ */
/* Small chrome pieces                                                 */
/* ------------------------------------------------------------------ */

/** Series-identity dot for column headers — the header text itself stays ink (rule 5). */
function HeadDot({ color }: { color: string }) {
  return (
    <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: color }} />
  );
}

function ResidualFlag() {
  const { t } = useI18n();
  return (
    <span className="ml-2 inline-flex whitespace-nowrap" title={t("prod.residual.tip")}>
      <Pill>{t("prod.residual.pill")}</Pill>
    </span>
  );
}

function SortableTh({
  label, k, sort, onSort, align = "right", color, title,
}: {
  label: string;
  k: string;
  sort: { key: string; desc: boolean };
  onSort: (k: string) => void;
  align?: "left" | "right";
  color?: string;
  title?: string;
}) {
  const { t } = useI18n();
  const active = sort.key === k;
  return (
    <th className={`px-3 py-1.5 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 ${active ? "" : "hover:text-foreground"}`}
        title={title ?? `${t("prod.sortBy")}: ${label}`}
      >
        {color && <HeadDot color={color} />}
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

interface Mover {
  key: string;
  label: string;
  total: number;
  trend: number;
  series: { y: number; v: number }[];
}

function MoverList({
  title, rows, color, deltaColor, onDrill,
}: {
  title: string;
  rows: Mover[];
  color: string;
  deltaColor: string;
  onDrill: (chapter: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div>
      <p className="mb-1.5 text-[10.5px] font-medium text-faint">{title}</p>
      {rows.length === 0 ? (
        <p className="text-[12px] text-faint">{t("prod.movers.empty")}</p>
      ) : (
        <div className="space-y-1">
          {rows.map((g) => (
            <div key={g.key} className="flex items-center gap-3 text-[13px]">
              <span className="tabular w-6 shrink-0 text-[11px] text-faint">{g.key}</span>
              <button
                onClick={() => onDrill(g.key)}
                className="min-w-0 flex-1 truncate text-left hover:underline"
                title={`${g.key} · ${g.label} — ${t("prod.tip.drillChapterMover")}`}
              >
                {g.label}
              </button>
              <span className="tabular w-16 shrink-0 text-right text-muted" title={`${t("prod.tip.fullWindowTotal")}: ${fmtUSDFull(g.total)}`}>
                {fmtUSD(g.total)}
              </span>
              <span className="shrink-0">
                <Sparkline data={g.series.map((x) => Math.round(x.v))} color={color} type="line" width={88} height={24} />
              </span>
              <span className="tabular w-16 shrink-0 text-right font-medium" style={{ color: deltaColor }} title={`${t("prod.col.trend")}: ${fmtUSDFull(g.trend)} — ${t("prod.tip.trendCalcFootnote")}`}>
                {fmtUSD(g.trend, { sign: true })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

export default function ProductsView() {
  const { filter, patch, data, series } = useFilter();
  const { t } = useI18n();

  // ---- drill state (local; the shareable filter state stays in the URL via FilterBar) ----
  const [level, setLevel] = useState<HsLevel>(2);
  const [chapter, setChapter] = useState<string | null>(null); // drilled HS2 chapter
  const [hs4, setHs4] = useState<string | null>(null); // drilled HS4 code
  const [sort, setSort] = useState<{ key: string; desc: boolean }>(() => ({ key: "posT", desc: true }));
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

  const onSort = (k: string) =>
    setSort((s) => (s.key === k ? { key: k, desc: !s.desc } : { key: k, desc: true }));

  // ---- navigation handlers ----
  const goRoot = () => {
    setLevel(2);
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

  // ---- rows for the active level ----
  const chapterRows = data.chapters; // HS2 level (ChapterAgg, already ranked by positive discrepancy)
  const childRows = useMemo<CodeAgg[]>(() => {
    if (level === 4) return aggregateByCode(data.channels4, effChapter ?? "");
    if (level === 6) return aggregateByCode(data.channels6, hs4 ?? effChapter ?? "");
    return [];
  }, [level, effChapter, hs4, data]);

  const sortedChapters = useMemo(() => {
    const k = sort.key as keyof ChapterAgg;
    const arr = [...chapterRows].sort((a, b) => {
      const av = typeof a[k] === "number" ? (a[k] as number) : 0;
      const bv = typeof b[k] === "number" ? (b[k] as number) : 0;
      return sort.desc ? bv - av : av - bv;
    });
    return arr;
  }, [chapterRows, sort]);

  const sortedChildren = useMemo(() => {
    const k = sort.key as keyof CodeAgg;
    return [...childRows].sort((a, b) => {
      const av = typeof a[k] === "number" ? (a[k] as number) : 0;
      const bv = typeof b[k] === "number" ? (b[k] as number) : 0;
      return sort.desc ? bv - av : av - bv;
    });
  }, [childRows, sort]);

  const totalRows = level === 2 ? sortedChapters.length : sortedChildren.length;
  const pageChapters = sortedChapters.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageChildren = sortedChildren.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // ---- snapshot of the current node (sum of the children shown, before pagination) ----
  const node = useMemo(() => {
    const src: { peT: number; uiT: number; posT: number }[] = level === 2 ? chapterRows : childRows;
    return src.reduce(
      (s, r) => ({ peT: s.peT + r.peT, uiT: s.uiT + r.uiT, posT: s.posT + r.posT }),
      { peT: 0, uiT: 0, posT: 0 },
    );
  }, [level, chapterRows, childRows]);

  /*
   * Channel-count denominator for the "screened X of N" caption, from the
   * pre-screen base (every comparable channel in view, either direction).
   */
  const nodeBase = useMemo(() => {
    /*
     * Count at the most specific code the user has committed to. A selected HS6
     * product is a narrower node than whatever level the drill happens to sit on.
     */
    const codeLevel = filter.hs6.length ? 6 : filter.hs4.length ? 4 : level;
    const prefix =
      codeLevel === 2 ? undefined
        : codeLevel === 4 ? (filter.hs4.length ? undefined : effChapter ?? undefined)
          : (filter.hs6.length ? undefined : hs4 ?? effChapter ?? undefined);
    return observedTotals(filter, codeLevel, prefix);
  }, [filter, level, effChapter, hs4]);

  /*
   * Reported totals over the SCREENED population: both books reported the
   * channel-year AND the partner side exceeds Uzbekistan's record after the
   * freight uplift. Restricting all three tiles to the same channel-years makes
   * them one identity — expected CIF − recorded imports = positive discrepancy,
   * to the dollar. (As-reported totals including one-sided flows live on the
   * Overview and Data Quality pages.)
   */
  const nodePos = useMemo(() => {
    const chs: Channel[] =
      level === 2
        ? (filter.hs6.length ? data.channels6 : filter.hs4.length ? data.channels4 : data.channels)
        : level === 4
          ? data.channels4.filter((c) => c.cmd.startsWith(effChapter ?? ""))
          : data.channels6.filter((c) => c.cmd.startsWith(hs4 ?? effChapter ?? ""));
    let pe = 0, ui = 0;
    for (const c of chs) for (const y of c.years) if (y.signed > 0) { pe += y.pe; ui += y.ui; }
    return { pe, ui };
  }, [level, effChapter, hs4, filter, data]);

  /** What the partner's FOB books become once the chosen freight margin is applied. */
  const expectedCif = nodePos.pe * (1 + filter.cif);

  // true when neither a chapter nor an HS4 code is drilled into — the node is the whole view
  const isAllNode = !(level === 6 && hs4) && !(effChapter && level !== 2);
  const nodeTitle =
    level === 6 && hs4
      ? `${hs4} · ${hsLabel(hs4)}`
      : effChapter && level !== 2
        ? `${effChapter} · ${hsLabel(effChapter)}`
        : t("prod.node.allChapters");
  const childUnit =
    level === 2 ? t("prod.unit.chapters") : level === 4 ? t("prod.unit.hs4groups") : t("prod.unit.hs6products");

  // ---- children composition (by positive value, amber bars) ----
  const composition = useMemo(() => {
    const rows: { cmd: string; label: string; posT: number }[] =
      level === 2
        ? chapterRows.map((c) => ({ cmd: c.chapter, label: c.label, posT: c.posT }))
        : childRows.map((c) => ({ cmd: c.cmd, label: c.label, posT: c.posT }));
    return rows.filter((r) => r.posT > 0).sort((a, b) => b.posT - a.posT).slice(0, 12);
  }, [level, chapterRows, childRows]);
  const compMax = composition[0]?.posT ?? 1;

  // ---- sector dynamics (HS2 only; movers over the full window) ----
  const movers = useMemo(() => {
    const eligible = series.movers.goods.filter(
      (g) => !isResidualChapter(g.key) && g.series.length >= 2 && g.total > 0,
    );
    return {
      rising: eligible.filter((g) => g.trend > 0).sort((a, b) => b.trend - a.trend).slice(0, 6),
      easing: eligible.filter((g) => g.trend < 0).sort((a, b) => a.trend - b.trend).slice(0, 6),
    };
  }, [series]);

  // ---- export: the active-level channel set (partner × code, raw + derived fields) ----
  const activeChannels = level === 2 ? data.channels : level === 4 ? data.channels4 : data.channels6;
  const period = yearsLabel(filter.years);
  const exportCsv = () =>
    downloadCsv(`products_hs${level}_${period.replace(/[^0-9]+/g, "_")}.csv`, channelsToCsv(activeChannels, filter));

  const isEmpty = totalRows === 0;

  return (
    <div className="space-y-6">
      {/* 1. header + export */}
      <section className="space-y-2">
        <p className="text-[10.5px] font-medium text-faint">
          UN Comtrade · {meta.window.start}–{meta.window.end} · {t("prod.eyebrow.hierarchy")}
        </p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("nav.products")}</h1>
          </div>
          <button
            onClick={exportCsv}
            disabled={activeChannels.length === 0}
            className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[12px] font-medium text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            title={`HS${level} · ${t("prod.export.tip")}`}
          >
            {t("common.exportCsv")}
          </button>
        </div>
      </section>

      {/* 2. filters + context */}
      <FilterBar />
      <ContextLine filter={filter} />

      {/* 3. HS level toggle + 4. breadcrumb */}
      <section className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap items-center gap-1.5 text-[13px]" aria-label={t("prod.aria.breadcrumb")}>
          <button
            onClick={goRoot}
            className={level === 2 ? "font-medium" : "text-muted hover:underline"}
            title={filter.hs2.length > 0 ? t("prod.breadcrumb.backAllClear") : t("prod.breadcrumb.backAll")}
          >
            {t("prod.breadcrumb.root")}
          </button>
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
              <span className="font-medium" title={t("prod.tip.hs4Derived")}>
                <span className="tabular">{hs4}</span> {hsLabel(hs4)}
              </span>
            </>
          )}
          {level !== 2 && !effChapter && !hs4 && <Pill>HS{level} · {t("prod.flatView")}</Pill>}
        </nav>
        <LevelTabs
          level={level}
          onChange={setToggle}
          label={t("prod.aria.hsLevel")}
          tips={{ 2: t("prod.level.hs2.tip"), 4: t("prod.level.hs4.tip"), 6: t("prod.level.hs6.tip") }}
        />
      </section>

      {/* 5a. snapshot of the current node */}
      <section>
        <SectionTitle
          title={`${t("prod.snapshot.title")} — ${nodeTitle}`}
          desc={fill(t("prod.snapshot.desc"), { unit: childUnit, n: fmtNum(totalRows) })}
        />
        {isEmpty ? (
          <EmptyState />
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label={t("prod.stat.reportedExports")}
              value={fmtUSD(nodePos.pe)}
              sub={`${t("prod.stat.reportedExports.sub")}, ${period} · ${fill(t("prod.stat.expectedCif"), { rate: Math.round(filter.cif * 100), value: fmtUSD(expectedCif) })}`}
              info={`${t("prod.stat.reportedExports.info")} ${t("prod.stat.allComparable.info")}`}
            />
            <Stat
              label={t("prod.stat.uzbImports")}
              value={fmtUSD(nodePos.ui)}
              sub={t("prod.stat.uzbImports.sub")}
              info={`${t("prod.stat.uzbImports.info")} ${t("prod.stat.allComparable.info")}`}
            />
            <Stat
              label={t("kpi.positive")}
              value={fmtUSD(node.posT)}
              sub={`${t("prod.stat.positive.sub")} (${Math.round(filter.cif * 100)}%) · ${fill(t("prod.stat.screenedOf"), { shown: fmtNum(totalRows), total: fmtNum(nodeBase.cells) })}`}
              accent={COLORS.positive}
              info={t("prod.stat.positive.info")}
            />
          </div>
        )}
      </section>

      {/* 5b. children composition */}
      {!isEmpty && composition.length > 0 && (
        <section>
          <SectionTitle
            title={t("prod.composition.title")}
            desc={fill(t("prod.composition.desc"), {
              unit: childUnit,
              scope: isAllNode ? t("prod.node.currentView") : nodeTitle,
              n: composition.length,
            })}
          />
          <div className="card space-y-1.5 p-4">
            {composition.map((r) => (
              <div key={r.cmd} className="flex items-center gap-3 text-[13px]">
                <span className="tabular w-14 shrink-0 text-[11px] text-faint">{r.cmd}</span>
                <span className="w-48 shrink-0 truncate" title={r.label}>
                  {r.label}
                </span>
                <span className="relative h-3.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-[var(--color-panel-2)]">
                  <span
                    className="absolute inset-y-0 left-0"
                    style={{
                      width: `${Math.max(1.5, (r.posT / compMax) * 100)}%`,
                      background: COLORS.positive,
                      opacity: 0.65,
                      borderRadius: "0 4px 4px 0",
                      boxShadow: `0 0 0 1px ${COLORS.surface}`,
                    }}
                    title={fmtUSDFull(r.posT)}
                  />
                </span>
                <span className="tabular w-20 shrink-0 text-right font-medium" title={fmtUSDFull(r.posT)}>
                  {fmtUSD(r.posT)}
                </span>
                <span className="tabular w-12 shrink-0 text-right text-[11px] text-faint" title={t("prod.tip.shareOfNode")}>
                  {node.posT > 0 ? fmtPct(r.posT / node.posT, 0) : "—"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5c. ranked children table */}
      <section>
        <SectionTitle
          title={level === 2 ? t("prod.table.hs2") : level === 4 ? t("prod.table.hs4") : t("prod.table.hs6")}
          desc={
            level === 2
              ? `${t("prod.table.hs2.desc")} ${t("common.source")}.`
              : level === 4
                ? t("prod.table.hs4.desc")
                : t("prod.table.hs6.desc")
          }
        />
        {isEmpty ? (
          <EmptyState />
        ) : level === 2 ? (
          <>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[840px] text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-[10.5px] font-medium text-faint">
                    <th className="px-3 py-1.5 font-medium">{t("prod.col.code")}</th>
                    <th className="px-3 py-1.5 font-medium">{t("prod.chapter")}</th>
                    <SortableTh label={t("kpi.positive")} k="posT" sort={sort} onSort={onSort} color={COLORS.positive} title={t("prod.tip.positive")} />
                    <SortableTh label={t("prod.col.gapRate")} k="gapRate" sort={sort} onSort={onSort} title={t("prod.tip.gapRate")} />
                    <SortableTh label={t("prod.col.channels")} k="channels" sort={sort} onSort={onSort} title={t("prod.tip.channels")} />
                    <th className="px-3 py-1.5 font-medium">{t("prod.col.topPartner")}</th>
                    <SortableTh label={t("prod.col.trend")} k="trend" sort={sort} onSort={onSort} title={t("prod.tip.trendCol")} />
                  </tr>
                </thead>
                <tbody className="zebra">
                  {pageChapters.map((c) => (
                    <tr key={c.chapter} className="border-b border-[var(--color-border-soft)] last:border-b-0">
                      <td className="tabular px-3 py-1.5 text-[11px] text-faint">{c.chapter}</td>
                      <td className="max-w-[300px] px-3 py-1.5">
                        <button
                          onClick={() => drillChapter(c.chapter)}
                          className="text-left font-medium hover:underline"
                          title={fill(t("prod.tip.drillChapter"), { code: c.chapter })}
                        >
                          {c.label}
                        </button>
                        {c.residual && <ResidualFlag />}
                      </td>
                      <td className="tabular px-3 py-1.5 text-right font-medium" title={fmtUSDFull(c.posT)}>
                        {fmtUSD(c.posT)}
                      </td>
                      <td className="tabular px-3 py-1.5 text-right text-muted" title={t("prod.tip.gapRateCell")}>
                        {fmtPct(c.gapRate, 1)}
                      </td>
                      <td className="tabular px-3 py-1.5 text-right text-muted">{fmtNum(c.channels)}</td>
                      <td className="px-3 py-1.5">
                        {c.topPartner ? (
                          <Link href={`/partners/${c.topPartner.iso3.toLowerCase()}`} className="hover:underline" title={`${t("prod.tip.largestChannel")}: ${fmtUSDFull(c.topPartner.value)}`}>
                            {c.topPartner.name}
                          </Link>
                        ) : (
                          <MissingValue kind="notComparable" />
                        )}
                      </td>
                      <td
                        className="tabular px-3 py-1.5 text-right font-medium"
                        style={{ color: c.trend > 0 ? "var(--color-serious)" : c.trend < 0 ? "var(--color-ok)" : undefined }}
                        title={`${t("prod.col.trend")}: ${fmtUSDFull(c.trend)} — ${t("prod.tip.trendCalc")}`}
                      >
                        {fmtUSD(c.trend, { sign: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} total={totalRows} onPage={setPage} unit={childUnit} />
          </>
        ) : (
          <>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[960px] text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-[10.5px] font-medium text-faint">
                    <th className="px-3 py-1.5 font-medium">{t("prod.col.code")}</th>
                    <th className="px-3 py-1.5 font-medium">{t("common.product")}</th>
                    <SortableTh label={t("prod.col.reportedExports")} k="peT" sort={sort} onSort={onSort} title={t("prod.tip.reportedExports")} />
                    <SortableTh label={t("prod.col.uzbImports")} k="uiT" sort={sort} onSort={onSort} title={t("prod.tip.uzbImports")} />
                    <SortableTh label={t("kpi.positive")} k="posT" sort={sort} onSort={onSort} color={COLORS.positive} title={t("prod.tip.positive")} />
                    <SortableTh label={t("prod.col.partners")} k="partners" sort={sort} onSort={onSort} title={t("prod.tip.partners")} />
                    <SortableTh label={t("prod.col.maxRisk")} k="mtrs" sort={sort} onSort={onSort} align="left" title={t("prod.tip.maxRisk")} />
                  </tr>
                </thead>
                <tbody className="zebra">
                  {pageChildren.map((r) => {
                    const profiled = r.cmd.length === 6 ? productByCmd(r.cmd) : undefined;
                    return (
                      <tr key={r.cmd} className="border-b border-[var(--color-border-soft)] last:border-b-0">
                        <td className="tabular px-3 py-1.5 text-[11px] text-faint">{r.cmd}</td>
                        <td className="max-w-[300px] px-3 py-1.5">
                          {level === 4 ? (
                            <button
                              onClick={() => drillHs4(r.cmd)}
                              className="text-left font-medium hover:underline"
                              title={fill(t("prod.tip.drillHs4"), { code: r.cmd })}
                            >
                              {r.label}
                            </button>
                          ) : profiled ? (
                            <Link href={`/products/${r.cmd}`} className="font-medium hover:underline" title={t("prod.tip.openProfile")}>
                              {r.label}
                            </Link>
                          ) : (
                            <span title={t("prod.tip.belowThreshold")}>
                              {r.label}
                            </span>
                          )}
                          {r.residual && <ResidualFlag />}
                        </td>
                        <td className="tabular px-3 py-1.5 text-right text-muted" title={fmtUSDFull(r.peT)}>
                          {r.peT > 0 ? fmtUSD(r.peT) : <MissingValue />}
                        </td>
                        <td className="tabular px-3 py-1.5 text-right text-muted" title={fmtUSDFull(r.uiT)}>
                          {r.uiT > 0 ? fmtUSD(r.uiT) : <MissingValue />}
                        </td>
                        <td className="tabular px-3 py-1.5 text-right font-medium" title={fmtUSDFull(r.posT)}>
                          {fmtUSD(r.posT)}
                        </td>
                        <td className="tabular px-3 py-1.5 text-right text-muted">{fmtNum(r.partners)}</td>
                        <td className="px-3 py-1.5">
                          <span className="flex items-center gap-1.5">
                            <RiskScore score={r.mtrs} band={r.band} />
                            <BandBadge band={r.band} />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager page={page} total={totalRows} onPage={setPage} unit={childUnit} />
          </>
        )}
      </section>

      {/* 5d. sector dynamics (HS2 level only) */}
      {level === 2 && !isEmpty && (movers.rising.length > 0 || movers.easing.length > 0) && (
        <section>
          <SectionTitle
            title={t("prod.dynamics.title")}
            desc={fill(t("prod.dynamics.desc"), { window: `${meta.window.start}–${meta.window.end}` })}
          />
          <div className="card grid gap-x-8 gap-y-4 p-4 lg:grid-cols-2">
            <MoverList
              title={t("prod.movers.rising")}
              rows={movers.rising}
              color={COLORS.positive}
              deltaColor="var(--color-serious)"
              onDrill={drillChapter}
            />
            <MoverList
              title={t("prod.movers.easing")}
              rows={movers.easing}
              color={COLORS.axis}
              deltaColor="var(--color-ok)"
              onDrill={drillChapter}
            />
          </div>
          <p className="mt-2 max-w-3xl text-[11px] text-faint">{t("prod.dynamics.note")}</p>
        </section>
      )}

      {/* 6. footnote */}
      <p className="max-w-3xl text-xs text-faint">
        {t("prod.footnote.a")} <strong className="text-muted">{t("prod.footnote.strong")}</strong>
        {t("prod.footnote.b")} ({Math.round(filter.cif * 100)}%). {t("common.source")}.
      </p>
    </div>
  );
}
