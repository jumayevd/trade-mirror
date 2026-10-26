"use client";

import { useMemo, useState } from "react";
import FilterBar from "@/components/FilterBar";
import LevelTabs, { type HsLevel } from "@/components/LevelTabs";
import {
  Stat, SectionTitle, RiskScore, BandBadge, EmptyState, Pill, TableReveal, PageHead,
} from "@/components/ui";
import { useFilter, useFilteredData } from "@/lib/filter-context";
import {
  hsLabel, isResidualChapter, yearsLabel, soleValue,
  type Channel, type RiskBand,
} from "@/lib/dataset";
import { GapCell, RankCell, ShareCell, productName } from "@/components/TableKit";
import { useI18n } from "@/lib/i18n";
import { channelsToCsv, downloadCsv } from "@/lib/export";
import { fmtUSD, fmtUSDFull, fmtPct, fmtNum, COLORS } from "@/lib/format";

/**
 * Product Analysis — the trade in view, one row per HS code, at HS2, HS4 or
 * HS6 with the same columns at every level.
 *
 * Every figure is measured on the partner × HS6 lines and summed upward: a
 * chapter or heading's export, import and positive discrepancy are the sums of
 * its HS6 products, so the frames read the same at all three levels. Export
 * and Import are the lines' values where the partner's exports exceed
 * Uzbekistan's imports, so on every row Export − Import ÷ (1 + freight) =
 * Positive discrepancy.
 */

const PAGE_SIZE = 20;

/** Minimal {placeholder} substitution so translated sentences keep their own word order. */
const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

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
    <th className={align === "right" ? "text-right" : "text-left"}>
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 ${active ? "" : "opacity-85 hover:opacity-100"}`}
        title={title ?? `${t("prod.sortBy")}: ${label}`}
      >
        {label}
        <span className={active ? "text-[var(--color-gold)]" : "opacity-40"}>{active && !sort.desc ? "↑" : "↓"}</span>
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
  const { filter, patch } = useFilter();
  const data = useFilteredData();
  const { t, lang } = useI18n();

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
  // bars scale to the rows on screen, whichever column the table is sorted by
  const maxGap = pageRows.reduce((m, r) => Math.max(m, r.posT), 0);

  // ---- frames: the scope in view, as the sum of its rows ----
  const node = useMemo(() => rows.reduce(
    (s, r) => ({ pe: s.pe + r.pePosT, ui: s.ui + r.uiPosT, pos: s.pos + r.posT }),
    { pe: 0, ui: 0, pos: 0 },
  ), [rows]);
  const nodeShare = node.pe > 0 ? node.pos / node.pe : 0;

  const cifPct = Math.round(filter.cif * 100);
  const period = yearsLabel(filter.years);
  const childUnit =
    level === 2 ? t("prod.unit.chapters") : level === 4 ? t("prod.unit.hs4groups") : t("prod.unit.hs6products");

  // ---- export: the active-level pair set (partner × code, raw + derived fields) ----
  const activeChannels = level === 2 ? data.channels : level === 4 ? data.channels4 : data.channels6;
  const exportCsv = () =>
    downloadCsv(`products_hs${level}_${period.replace(/[^0-9]+/g, "_")}.csv`, channelsToCsv(activeChannels, filter));

  const isEmpty = totalRows === 0;
  const td = "tabular text-right whitespace-nowrap fs-13";

  return (
    <div className="space-y-6">
      {/* header + export */}
      <PageHead
        title={<h1 className="whitespace-nowrap text-xl font-semibold tracking-tight sm:text-2xl">{t("nav.products")}</h1>}
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

      <FilterBar />
      {filter.years.length === 0 ? (
        <EmptyState text={t("common.noPeriod")} />
      ) : (
      <>

      {/* frames: the scope in view */}
      {isEmpty ? (
        <EmptyState />
      ) : (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t("prod.stat.exports")} value={fmtUSD(node.pe)} accent={COLORS.partner}
            info={`${t("prod.stat.exports.info")} ${period}: ${fmtUSDFull(node.pe)}.`} />
          <Stat label={t("prod.stat.imports")} value={fmtUSD(node.ui)} accent={COLORS.uzb}
            info={`${t("prod.stat.imports.info")} ${period}: ${fmtUSDFull(node.ui)}.`} />
          <Stat label={t("kpi.positive")} value={fmtUSD(node.pos)} accent={COLORS.positive}
            info={`${fill(t("prof.stat.positive.info"), { cif: cifPct })} ${fmtUSDFull(node.pos)}.`} />
          <Stat label={t("prof.stat.share")} value={fmtPct(nodeShare, 1)} accent={COLORS.positive}
            info={`${t("prof.stat.share.info")} ${fmtUSDFull(node.pos)} ÷ ${fmtUSDFull(node.pe)}.`} />
        </section>
      )}

      {/* HS level toggle + breadcrumb, driving the table */}
      <section className="flex flex-wrap items-center gap-3">
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
      </section>

      {/* ranked table — one layout for every level */}
      {!isEmpty && (
        <section>
          <SectionTitle
            title={level === 2 ? t("prod.table.hs2") : level === 4 ? t("prod.table.hs4") : t("prod.table.hs6")}
          />
          <TableReveal>
          <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="cbu-table min-w-[900px]">
              <thead>
                <tr>
                  <th className="w-10 text-right">#</th>
                  <th className="text-left">{t("common.product")}</th>
                  <SortableTh label={t("prof.th.export")} k="pePosT" sort={sort} onSort={onSort} title={t("prod.tip.export")} />
                  <SortableTh label={t("prof.th.import")} k="uiPosT" sort={sort} onSort={onSort} title={t("prod.tip.import")} />
                  <SortableTh label={t("prof.th.gap")} k="posT" sort={sort} onSort={onSort} title={t("prod.tip.positive")} />
                  <SortableTh label={t("prof.th.share")} k="share" sort={sort} onSort={onSort} title={t("prof.th.share.tip")} />
                  <SortableTh label={t("prod.col.partners")} k="partners" sort={sort} onSort={onSort} title={t("prod.tip.partners")} />
                  <SortableTh label={t("prof.th.score")} k="mtrs" sort={sort} onSort={onSort} title={t("prod.tip.maxRisk")} />
                  <th className="text-left" title={t("prod.tip.maxRisk")}>{t("prof.th.band")}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => {
                  // a few words that name the line; the code and the full text on hover
                  const name = productName(r.cmd, lang, r.label);
                  const full = `HS ${r.cmd} · ${r.label}`;
                  return (
                  <tr key={r.cmd}>
                    <td className="text-right"><RankCell n={page * PAGE_SIZE + i + 1} /></td>
                    <td className="max-w-[300px] fs-13">
                      <span className="flex min-w-0 items-center">
                        {level === 6 ? (
                          <span className="truncate font-medium" title={full}>{name}</span>
                        ) : (
                          <button
                            onClick={() => (level === 2 ? drillChapter(r.cmd) : drillHs4(r.cmd))}
                            className="truncate text-left font-medium text-[var(--color-primary)] hover:underline"
                            title={`${full}\n${fill(t(level === 2 ? "prod.tip.drillChapter" : "prod.tip.drillHs4"), { code: r.cmd })}`}
                          >
                            {name}
                          </button>
                        )}
                        {r.residual && <ResidualFlag />}
                      </span>
                    </td>
                    <td className={`${td} text-[var(--color-gold-ink)]`} title={fmtUSDFull(r.pePosT)}>{fmtUSD(r.pePosT)}</td>
                    <td className={`${td} text-muted`} title={fmtUSDFull(r.uiPosT)}>{fmtUSD(r.uiPosT)}</td>
                    <td className="w-[120px]"><GapCell value={r.posT} max={maxGap} /></td>
                    <td className="text-right"><ShareCell share={r.pePosT > 0 ? r.share : null} /></td>
                    <td className={`${td} text-muted`}>{fmtNum(r.partners)}</td>
                    <td className="text-right"><RiskScore score={r.mtrs} band={r.band} /></td>
                    <td><BandBadge band={r.band} /></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </div>
          <Pager page={page} total={totalRows} onPage={setPage} unit={childUnit} />
          </TableReveal>
        </section>
      )}
      </>
      )}
    </div>
  );
}
