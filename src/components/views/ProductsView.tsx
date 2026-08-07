"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import FilterBar from "@/components/FilterBar";
import Sparkline from "@/components/charts/Sparkline";
import {
  Stat, SectionTitle, ContextLine, AnomalyBadge, EvidenceBadge, EmptyState, MissingValue, Pill,
} from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import {
  meta, hsLabel, productByCmd, isResidualChapter, type Channel, type ChapterAgg,
} from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";
import { channelsToCsv, downloadCsv } from "@/lib/export";
import { fmtUSD, fmtUSDFull, fmtPct, fmtNum, COLORS } from "@/lib/format";

type HsLevel = 2 | 4 | 6;
const PAGE_SIZE = 15;

/* ------------------------------------------------------------------ */
/* Aggregation: children of a node, grouped by code across partners    */
/* ------------------------------------------------------------------ */

interface CodeAgg {
  cmd: string;
  label: string;
  peT: number;
  uiT: number;
  posT: number;
  revT: number;
  partners: number;
  anomaly: number;
  evidence: number;
  residual: boolean;
}

/** Group partner × code channels by code (summing values across partners). */
function aggregateByCode(chs: Channel[], prefix: string): CodeAgg[] {
  const m = new Map<
    string,
    { peT: number; uiT: number; posT: number; revT: number; pset: Set<string>; anomaly: number; evidence: number }
  >();
  for (const c of chs) {
    if (prefix && !c.cmd.startsWith(prefix)) continue;
    const e = m.get(c.cmd) ?? { peT: 0, uiT: 0, posT: 0, revT: 0, pset: new Set<string>(), anomaly: 0, evidence: 0 };
    e.peT += c.peT;
    e.uiT += c.uiT;
    e.posT += c.posT;
    e.revT += c.revT;
    e.pset.add(c.partnerIso);
    e.anomaly = Math.max(e.anomaly, c.anomaly);
    e.evidence = Math.max(e.evidence, c.evidence);
    m.set(c.cmd, e);
  }
  return [...m.entries()].map(([cmd, e]) => ({
    cmd,
    label: hsLabel(cmd),
    peT: e.peT,
    uiT: e.uiT,
    posT: e.posT,
    revT: e.revT,
    partners: e.pset.size,
    anomaly: e.anomaly,
    evidence: e.evidence,
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
  return (
    <span
      className="ml-2 inline-flex whitespace-nowrap"
      title="Residual HS category (chapters 98–99): special-transaction and confidential codes are not comparable at product level. Shown for transparency only — excluded from residual-stage rankings."
    >
      <Pill>residual · transparency only</Pill>
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
  const active = sort.key === k;
  return (
    <th className={`px-3 py-1.5 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 ${active ? "" : "hover:text-foreground"}`}
        title={title ?? `Sort by ${label.toLowerCase()}`}
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
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  return (
    <div className="mt-2 flex items-center justify-between text-xs text-faint">
      <span className="tabular">
        {from}–{to} of {fmtNum(total)} {unit}
      </span>
      {pages > 1 && (
        <span className="flex items-center gap-1">
          <button
            onClick={() => onPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="rounded-md border border-[var(--color-border)] px-2 py-1 font-medium text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            ‹ Prev
          </button>
          <span className="tabular px-1.5">
            {page + 1}/{pages}
          </span>
          <button
            onClick={() => onPage(Math.min(pages - 1, page + 1))}
            disabled={page >= pages - 1}
            className="rounded-md border border-[var(--color-border)] px-2 py-1 font-medium text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next ›
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
  return (
    <div>
      <p className="mb-1.5 text-[10.5px] font-medium text-faint">{title}</p>
      {rows.length === 0 ? (
        <p className="text-[12px] text-faint">No chapters in this group under the active filters.</p>
      ) : (
        <div className="space-y-1">
          {rows.map((g) => (
            <div key={g.key} className="flex items-center gap-3 text-[13px]">
              <span className="tabular w-6 shrink-0 text-[11px] text-faint">{g.key}</span>
              <button
                onClick={() => onDrill(g.key)}
                className="min-w-0 flex-1 truncate text-left hover:underline"
                title={`${g.key} · ${g.label} — drill into the chapter's derived HS4 groups`}
              >
                {g.label}
              </button>
              <span className="tabular w-16 shrink-0 text-right text-muted" title={`Full-window total: ${fmtUSDFull(g.total)}`}>
                {fmtUSD(g.total)}
              </span>
              <span className="shrink-0">
                <Sparkline data={g.series.map((x) => Math.round(x.v))} color={color} type="line" width={88} height={24} />
              </span>
              <span className="tabular w-16 shrink-0 text-right font-medium" style={{ color: deltaColor }} title={`Trend: ${fmtUSDFull(g.trend)} — average of the latest reported years minus the earliest (see footnote)`}>
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
  const dirKey = filter.direction === "reverse" ? "revT" : "posT";
  const [level, setLevel] = useState<HsLevel>(2);
  const [chapter, setChapter] = useState<string | null>(null); // drilled HS2 chapter
  const [hs4, setHs4] = useState<string | null>(null); // drilled HS4 code
  const [sort, setSort] = useState<{ key: string; desc: boolean }>(() => ({ key: dirKey, desc: true }));
  const [page, setPage] = useState(0);

  // respect the global HS2 filter: it overrides (and disables) the local chapter drill
  const effChapter = filter.hs2 !== "all" ? filter.hs2 : chapter;

  // Resets below are adjusted during render (react.dev: "Adjusting some state
  // when a prop changes") rather than in effects — the drill clearing must be
  // sticky (survive the filter being reverted), so it cannot be derived.
  const [prevHs2, setPrevHs2] = useState(filter.hs2);
  if (prevHs2 !== filter.hs2) {
    setPrevHs2(filter.hs2);
    if (filter.hs2 !== "all") {
      setChapter(null);
      setHs4((h) => (h && h.startsWith(filter.hs2) ? h : null));
    }
  }

  // new drill target or direction → default sort, first page
  const [prevView, setPrevView] = useState({ level, effChapter, hs4, dirKey });
  if (prevView.level !== level || prevView.effChapter !== effChapter || prevView.hs4 !== hs4 || prevView.dirKey !== dirKey) {
    setPrevView({ level, effChapter, hs4, dirKey });
    setSort({ key: dirKey, desc: true });
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
    if (filter.hs2 !== "all") patch({ hs2: "all" });
  };
  const drillChapter = (code: string) => {
    if (filter.hs2 === "all") setChapter(code);
    setHs4(null);
    setLevel(4);
  };
  const drillHs4 = (code: string) => {
    if (filter.hs2 === "all") setChapter(code.slice(0, 2));
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
  const chapterRows = data.chapters; // HS2 level (ChapterAgg, already ranked by direction)
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
    const src: { peT: number; uiT: number; posT: number; revT: number }[] =
      level === 2 ? chapterRows : childRows;
    return src.reduce(
      (s, r) => ({ peT: s.peT + r.peT, uiT: s.uiT + r.uiT, posT: s.posT + r.posT, revT: s.revT + r.revT }),
      { peT: 0, uiT: 0, posT: 0, revT: 0 },
    );
  }, [level, chapterRows, childRows]);

  const nodeTitle =
    level === 6 && hs4
      ? `${hs4} · ${hsLabel(hs4)}`
      : effChapter && level !== 2
        ? `${effChapter} · ${hsLabel(effChapter)}`
        : "All chapters in view";
  const childUnit = level === 2 ? "chapters" : level === 4 ? "HS4 groups (derived)" : "HS6 products";

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
  const dirIsReverse = filter.direction === "reverse";
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
  const exportCsv = () =>
    downloadCsv(`products_hs${level}_${filter.from}-${filter.to}.csv`, channelsToCsv(activeChannels, filter));

  // ---- level toggle (quiet segmented) ----
  const levelBtn = (lv: HsLevel, label: string, tip: string) => (
    <button
      key={lv}
      onClick={() => setToggle(lv)}
      className={`whitespace-nowrap rounded-md border px-2 py-1 text-[12px] ${
        level === lv
          ? "border-[var(--color-border)] bg-[var(--color-panel-2)] font-semibold text-foreground"
          : "border-[var(--color-border)] font-medium text-muted hover:text-foreground"
      }`}
      title={tip}
    >
      {label}
    </button>
  );

  const isEmpty = totalRows === 0;

  return (
    <div className="space-y-6">
      {/* 1. header + export */}
      <section className="space-y-2">
        <p className="text-[10.5px] font-medium text-faint">
          UN Comtrade · {meta.window.start}–{meta.window.end} · HS2 → HS4 (derived) → HS6 hierarchy
        </p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("nav.products")}</h1>
            <p className="max-w-3xl text-[13px] leading-relaxed text-muted">
              Where the residual unexplained discrepancy sits in the commodity classification — drill
              from HS2 chapters through derived HS4 groups to HS6 products. Every figure is a
              statistical screening signal.
            </p>
          </div>
          <button
            onClick={exportCsv}
            disabled={activeChannels.length === 0}
            className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[12px] font-medium text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            title={`Download all partner × HS${level} channels under the active filters (raw + derived fields, with the calculation context in the header).`}
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
        <nav className="flex flex-wrap items-center gap-1.5 text-[13px]" aria-label="HS hierarchy breadcrumb">
          <button
            onClick={goRoot}
            className={level === 2 ? "font-medium" : "text-muted hover:underline"}
            title={filter.hs2 !== "all" ? "Back to all chapters (also clears the HS2 filter)" : "Back to all chapters"}
          >
            HS2 · all chapters
          </button>
          {effChapter && level !== 2 && (
            <>
              <span className="text-faint">›</span>
              <button
                onClick={() => drillChapter(effChapter)}
                className={level === 4 && !hs4 ? "font-medium" : "text-muted hover:underline"}
                title={`Chapter ${effChapter} — show its derived HS4 groups`}
              >
                <span className="tabular">{effChapter}</span> {hsLabel(effChapter)}
              </button>
            </>
          )}
          {hs4 && level === 6 && (
            <>
              <span className="text-faint">›</span>
              <span className="font-medium" title="HS4 · derived — labels borrow the largest child product's description">
                <span className="tabular">{hs4}</span> {hsLabel(hs4)}
              </span>
            </>
          )}
          {level !== 2 && !effChapter && !hs4 && <Pill>flat view — all HS{level} codes in scope</Pill>}
        </nav>
        <div className="flex items-center gap-1" role="group" aria-label="HS level">
          {levelBtn(2, "HS2", "2-digit chapters — the coarsest, most comparable level")}
          {levelBtn(4, "HS4 · derived", "4-digit groups derived from HS6 by truncation — not reported directly; labels borrow the largest child product's description")}
          {levelBtn(6, "HS6", "6-digit products — finest detail; subject to the HS6 materiality floor")}
        </div>
      </section>

      {/* 5a. snapshot of the current node */}
      <section>
        <SectionTitle
          title={`Snapshot — ${nodeTitle}`}
          desc={`Totals across the ${fmtNum(totalRows)} ${childUnit} below, under the active filters. Positive and reverse discrepancies are reported separately — netting them can hide both.`}
        />
        {isEmpty ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat
              label="Reported exports (FOB)"
              value={fmtUSD(node.peT)}
              sub={`partner-reported, ${filter.from === filter.to ? filter.from : `${filter.from}–${filter.to}`}`}
              info="Sum of partner-reported exports to Uzbekistan (FOB, nominal USD) across the channels in view. Missing partner-years are excluded, never counted as zero."
            />
            <Stat
              label="UZB imports (CIF)"
              value={fmtUSD(node.uiT)}
              sub="Uzbekistan-recorded imports"
              info="Sum of Uzbekistan-recorded imports (CIF, nominal USD) across the channels in view."
            />
            <Stat
              label="Positive discrepancy"
              value={fmtUSD(node.posT)}
              sub={`partner > UZB after ${Math.round(filter.cif * 100)}% freight`}
              accent={COLORS.positive}
              info="Sum of channel-years where the partner-reported figure (freight-adjusted) exceeds Uzbekistan's record. A screening signal with several legitimate explanations."
            />
            <Stat
              label="Reverse discrepancy"
              value={fmtUSD(node.revT)}
              sub="UZB > partner (recorded more)"
              accent={COLORS.reverse}
              info="Sum of channel-years where Uzbekistan records more than the partner reported. Often reflects transit re-routing or partner coverage gaps."
            />
          </div>
        )}
      </section>

      {/* 5b. children composition */}
      {!isEmpty && composition.length > 0 && (
        <section>
          <SectionTitle
            title="Composition by positive discrepancy"
            desc={`Largest ${childUnit} within ${nodeTitle.toLowerCase() === "all chapters in view" ? "the current view" : nodeTitle} by positive discrepancy (orange). Top ${composition.length} shown.`}
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
                <span className="tabular w-12 shrink-0 text-right text-[11px] text-faint" title="Share of the node's positive discrepancy">
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
          title={level === 2 ? "HS2 chapters" : level === 4 ? "HS4 groups · derived" : "HS6 products"}
          desc={
            level === 2
              ? "Chapters ranked under the active filters. Click a chapter to drill into its derived HS4 groups. Source: UN Comtrade mirror statistics."
              : level === 4
                ? "Derived 4-digit groups, aggregated across partners (values summed per code; anomaly/evidence show the strongest partner channel). Click a group to drill into its HS6 products."
                : "6-digit products, aggregated across partners. Rows with a profile link have per-country breakdowns; others fall below the profiling threshold."
          }
        />
        {isEmpty ? (
          <EmptyState />
        ) : level === 2 ? (
          <>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[960px] text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-[10.5px] font-medium text-faint">
                    <th className="px-3 py-1.5 font-medium">Code</th>
                    <th className="px-3 py-1.5 font-medium">Chapter</th>
                    <SortableTh label="Comparable trade" k="peT" sort={sort} onSort={onSort} title="Partner-reported exports (FOB) in the chapter — the comparison base" />
                    <SortableTh label="Positive" k="posT" sort={sort} onSort={onSort} color={COLORS.positive} title="Positive discrepancy: partner > UZB after freight adjustment" />
                    <SortableTh label="Reverse" k="revT" sort={sort} onSort={onSort} color={COLORS.reverse} title="Reverse discrepancy: UZB records more than the partner reported" />
                    <SortableTh label="Gap rate" k="gapRate" sort={sort} onSort={onSort} title="Positive discrepancy as a share of expected CIF value" />
                    <SortableTh label="Channels" k="channels" sort={sort} onSort={onSort} title="Partner × chapter observation channels under the active filters" />
                    <th className="px-3 py-1.5 font-medium">Top partner</th>
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
                          title={`Drill into chapter ${c.chapter} — derived HS4 groups`}
                        >
                          {c.label}
                        </button>
                        {c.residual && <ResidualFlag />}
                      </td>
                      <td className="tabular px-3 py-1.5 text-right text-muted" title={fmtUSDFull(c.peT)}>
                        {c.peT > 0 ? fmtUSD(c.peT) : <MissingValue />}
                      </td>
                      <td className="tabular px-3 py-1.5 text-right font-medium" title={fmtUSDFull(c.posT)}>
                        {fmtUSD(c.posT)}
                      </td>
                      <td className="tabular px-3 py-1.5 text-right font-medium" title={fmtUSDFull(c.revT)}>
                        {fmtUSD(c.revT)}
                      </td>
                      <td className="tabular px-3 py-1.5 text-right text-muted" title="Positive discrepancy ÷ expected CIF value of the chapter">
                        {fmtPct(c.gapRate, 1)}
                      </td>
                      <td className="tabular px-3 py-1.5 text-right text-muted">{fmtNum(c.channels)}</td>
                      <td className="px-3 py-1.5">
                        {c.topPartner ? (
                          <Link href={`/partners/${c.topPartner.iso3.toLowerCase()}`} className="hover:underline" title={`Largest channel in this chapter: ${fmtUSDFull(c.topPartner.value)}`}>
                            {c.topPartner.name}
                          </Link>
                        ) : (
                          <MissingValue kind="notComparable" />
                        )}
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
                    <th className="px-3 py-1.5 font-medium">Code</th>
                    <th className="px-3 py-1.5 font-medium">{t("common.product")}</th>
                    <SortableTh label="Reported exports" k="peT" sort={sort} onSort={onSort} title="Partner-reported exports (FOB), summed across partners" />
                    <SortableTh label="UZB imports" k="uiT" sort={sort} onSort={onSort} title="Uzbekistan-recorded imports (CIF), summed across partners" />
                    <SortableTh label="Positive" k="posT" sort={sort} onSort={onSort} color={COLORS.positive} title="Positive discrepancy: partner > UZB after freight adjustment" />
                    <SortableTh label="Reverse" k="revT" sort={sort} onSort={onSort} color={COLORS.reverse} title="Reverse discrepancy: UZB records more than the partner reported" />
                    <SortableTh label="Partners" k="partners" sort={sort} onSort={onSort} title="Distinct partner countries with an observation channel on this code" />
                    <SortableTh label="Max A / E" k="anomaly" sort={sort} onSort={onSort} align="left" title="Strongest partner channel on this code: anomaly strength / evidence quality (0–100). A signal ranking aid." />
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
                              title={`Drill into ${r.cmd} — HS6 products. HS4 label borrows the largest child product's description.`}
                            >
                              {r.label}
                            </button>
                          ) : profiled ? (
                            <Link href={`/products/${r.cmd}`} className="font-medium hover:underline" title="Open the product profile — per-country breakdown and signal classification.">
                              {r.label}
                            </Link>
                          ) : (
                            <span title="Below profiling threshold — no dedicated profile page; the row is still fully counted in all totals.">
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
                        <td className="tabular px-3 py-1.5 text-right font-medium" title={fmtUSDFull(r.revT)}>
                          {fmtUSD(r.revT)}
                        </td>
                        <td className="tabular px-3 py-1.5 text-right text-muted">{fmtNum(r.partners)}</td>
                        <td className="px-3 py-1.5">
                          <span className="flex items-center gap-1.5">
                            <AnomalyBadge score={r.anomaly} />
                            <EvidenceBadge score={r.evidence} />
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
            title="Sector dynamics"
            desc={`Chapters where the ${dirIsReverse ? "reverse" : "positive"} discrepancy is growing or receding over the full ${meta.window.start}–${meta.window.end} window (period filter ignored; other filters apply). Top 6 each way.`}
          />
          <div className="card grid gap-x-8 gap-y-4 p-4 lg:grid-cols-2">
            <MoverList
              title="Rising"
              rows={movers.rising}
              color={dirIsReverse ? COLORS.reverse : COLORS.positive}
              deltaColor="var(--color-serious)"
              onDrill={drillChapter}
            />
            <MoverList
              title="Easing"
              rows={movers.easing}
              color={COLORS.axis}
              deltaColor="var(--color-ok)"
              onDrill={drillChapter}
            />
          </div>
          <p className="mt-2 max-w-3xl text-[11px] text-faint">
            Trend = average of the last (up to three) reported years minus the average of the first (up to
            three), on the annual {dirIsReverse ? "reverse" : "positive"} discrepancy. Residual chapters
            (98–99) and chapters with fewer than two reported years are excluded. A rising residual
            discrepancy is a screening signal.
          </p>
        </section>
      )}

      {/* 6. footnote */}
      <p className="max-w-3xl text-xs text-faint">
        HS4 is not reported directly in this dataset: 4-digit groups are <strong className="text-muted">derived
        from HS6 codes by truncation</strong>, and each HS4 label borrows the largest child product&apos;s
        description — they are navigation aids, not official 4-digit statistics. HS6 detail is subject to the
        materiality floor documented on the Data Quality page, so HS6 children may sum to less than their
        chapter total. Values are nominal USD under the active freight assumption
        ({Math.round(filter.cif * 100)}%). {t("common.source")}.
      </p>
    </div>
  );
}
