"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BandBadge, EmptyState, InfoTip, RiskScore } from "@/components/ui";
import MultiSelect from "@/components/MultiSelect";
import LevelTabs, { LEVEL_LABEL_KEYS, type HsLevel } from "@/components/LevelTabs";
import type { SearchOption } from "@/components/SearchSelect";
import { fmtNum, fmtUSD, fmtUSDFull } from "@/lib/format";
import { GapCell, RankCell, ShareCell, productName } from "@/components/TableKit";
import { useI18n } from "@/lib/i18n";
import { useFitRows } from "@/lib/use-fit-rows";
import { hsFullLabel, yearsLabel, type Channel } from "@/lib/dataset";

/**
 * Products ranking (Discrepancy & Risk page) — every partner × code pair at the
 * active HS level with a positive discrepancy, ranked by screening priority.
 *
 * Export and Import are the pair's values on its positive HS6 lines, so every
 * row checks by hand: Export − Import ÷ (1 + freight) = Positive discrepancy,
 * and its share = Positive discrepancy ÷ Export. At HS2 and HS4 all three are
 * sums of the HS6 products beneath, never read from a separate layer.
 *
 * The page is read on one screen: the controls share a row with the page's own
 * filters (`lead`), the band frames (`summary`) sit between them and the
 * table, the columns sort on a click, and a page of the ranking is as many
 * rows as the window has room for.
 */

export { LEVEL_LABEL_KEYS, type HsLevel };

type SortKey = "risk" | "gap" | "gapPct" | "value" | "importReported";
type SortDir = "desc" | "asc";

/** Share of positive discrepancy = posT ÷ pePosT; null when there is no export. */
const gapPct = (c: Channel): number | null =>
  c.pePosT > 0 ? c.posT / c.pePosT : null;

/**
 * Every comparator ranks the strongest signal first; ascending reverses the
 * finished order so the tie-breaks stay attached to their primary key rather
 * than flipping independently of it.
 */
function sortChannels(rows: Channel[], sort: SortKey, dir: SortDir): Channel[] {
  const by: Record<SortKey, (a: Channel, b: Channel) => number> = {
    risk: (a, b) => b.mtrs - a.mtrs || b.posT - a.posT,
    gap: (a, b) => b.posT - a.posT || b.mtrs - a.mtrs,
    gapPct: (a, b) => (gapPct(b) ?? -1) - (gapPct(a) ?? -1) || b.posT - a.posT,
    value: (a, b) => b.pePosT - a.pePosT || b.posT - a.posT,
    importReported: (a, b) => b.uiPosT - a.uiPosT || b.posT - a.posT,
  };
  const sorted = [...rows].sort(by[sort]);
  return dir === "asc" ? sorted.reverse() : sorted;
}

export default function QueueTable({
  channels,
  level,
  onLevelChange,
  years,
  lead,
  summary,
  emptyText,
}: {
  /** Pairs at the ACTIVE HS level, already ranked by the engine. */
  channels: Channel[];
  level: HsLevel;
  onLevelChange: (l: HsLevel) => void;
  years: number[];
  /** The page's own filters, at the start of the controls row. */
  lead?: React.ReactNode;
  /** What sits between the controls and the table (the band frames). */
  summary?: React.ReactNode;
  /** What an empty table says, when the page knows why it is empty. */
  emptyText?: string;
}) {
  const { t, lang } = useI18n();
  // the score is computed on the period in view; the tooltips name that window
  const windowTip = ` ${t("risk.window.tip")
    .replace("{window}", yearsLabel(years))
    .replace("{n}", String(years.length))}`;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("risk");
  const [dir, setDir] = useState<SortDir>("desc");
  const [pageRaw, setPageRaw] = useState(0);
  const [box, pageSize] = useFitRows(10);
  /** Cross-cutting selections: many partners and many products at once. */
  const [partnerSel, setPartnerSel] = useState<string[]>([]);
  const [productSel, setProductSel] = useState<string[]>([]);

  // options come from the pairs actually on screen, so the pickers never
  // offer a partner or code that would yield an empty table
  const partnerOptions = useMemo<SearchOption[]>(() => {
    const m = new Map<string, string>();
    for (const c of channels) m.set(c.partnerIso, c.partner);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
      .map(([iso, name]) => ({ value: iso, code: iso, label: name }));
  }, [channels]);

  const productOptions = useMemo<SearchOption[]>(() => {
    const m = new Map<string, string>();
    for (const c of channels) m.set(c.cmd, c.cmdLabel);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([cmd, label]) => ({ value: cmd, code: cmd, label }));
  }, [channels]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const partners = new Set(partnerSel);
    const products = new Set(productSel);
    const filtered = channels.filter((c) => {
      if (partners.size && !partners.has(c.partnerIso)) return false;
      if (products.size && !products.has(c.cmd)) return false;
      if (!q) return true;
      return (
        c.partner.toLowerCase().includes(q) ||
        c.partnerIso.toLowerCase().includes(q) ||
        c.cmd.includes(q) ||
        c.cmdLabel.toLowerCase().includes(q)
      );
    });
    return sortChannels(filtered, sort, dir);
  }, [channels, query, sort, dir, partnerSel, productSel]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(pageRaw, pageCount - 1);
  const start = page * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  const controls = (patch: () => void) => {
    patch();
    setPageRaw(0);
  };
  // a column head sorts by its figure; a second click turns the order round
  const onSort = (k: SortKey) => controls(() => {
    if (k === sort) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSort(k); setDir("desc"); }
  });
  // the arrow runs on with the last word, so a two-word head stays two lines
  const sortTh = (k: SortKey, label: string, tip: string, align = "text-right") => (
    <th className={align} title={tip}>
      <button onClick={() => onSort(k)} className={sort === k ? "" : "opacity-85 hover:opacity-100"}>
        {label}
        <span aria-hidden className={`ml-1 ${sort === k ? "text-[var(--color-gold)]" : "opacity-40"}`}>{sort === k && dir === "asc" ? "↑" : "↓"}</span>
      </button>
    </th>
  );

  // bars scale to the rows on screen: sorted by score, one large pair would flatten the rest
  const maxGap = pageRows.reduce((m, c) => Math.max(m, c.posT), 0);
  const tdNum = "tabular text-right whitespace-nowrap";
  const pagerBtn = "rounded-md border border-[var(--color-border)] px-2 py-1 fs-13 text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex flex-auto flex-col gap-3">
      {/* controls: the page's filters, then the table's own */}
      <div className="no-print flex flex-wrap items-end gap-x-3 gap-y-2">
        {lead}

        <LevelTabs
          level={level}
          onChange={(l) => controls(() => onLevelChange(l))}
          label={t("risk.a11y.hsLevel")}
        />

        <input
          type="search"
          value={query}
          onChange={(e) => controls(() => setQuery(e.target.value))}
          placeholder={t("risk.search.placeholder")}
          aria-label={t("risk.a11y.search")}
          className="h-[33px] w-44 max-w-full min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2.5 fs-13 outline-none placeholder:text-faint focus:border-[var(--color-primary)]"
        />

        <MultiSelect
          values={partnerSel}
          onChange={(v) => controls(() => setPartnerSel(v))}
          options={partnerOptions}
          label={t("common.partner")}
          allLabel={t("filter.all")}
        />

        <MultiSelect
          values={productSel}
          onChange={(v) => controls(() => setProductSel(v))}
          options={productOptions}
          label={t("filter.products")}
          allLabel={t("filter.all")}
        />
      </div>

      {summary}

      {rows.length === 0 && <EmptyState text={emptyText} />}

      {/* table: the box takes the height left over; a page is the rows that fit it */}
      <div ref={box} className="fill-rest overflow-hidden" hidden={rows.length === 0}>
        <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="cbu-table cbu-fit min-w-[880px]">
            <thead>
              <tr>
                <th className="w-10 text-right">#</th>
                <th className="text-left">{t("common.product")}</th>
                <th className="text-left">{t("common.partner")}</th>
                {sortTh("value", t("prof.th.export"), t("risk.tip.export"))}
                {sortTh("importReported", t("prof.th.import"), t("risk.tip.import"))}
                {sortTh("gap", t("prof.th.gap"), t("risk.tip.gap"))}
                {sortTh("gapPct", t("prof.th.share"), t("prof.th.share.tip"))}
                {sortTh("risk", t("prof.th.score"), `${t("risk.tip.riskValue")}${windowTip}`)}
                <th className="text-left" title={`${t("risk.tip.band")}${windowTip}`}>{t("prof.th.band")}</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c, i) => (
                <tr key={`${c.partnerIso}|${c.cmd}|${c.level}`}>
                  <td className="text-right"><RankCell n={start + i + 1} /></td>
                  <td>
                    {/* a few words that name the line, on one line; the code and the full nomenclature on hover */}
                    <span className="block max-w-[300px] truncate font-medium" title={`HS ${c.cmd} · ${hsFullLabel(c.cmd)}`}>
                      {productName(c.cmd, lang, c.cmdLabel)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    <Link href={`/partners/${c.partnerIso.toLowerCase()}`} className="text-[var(--color-primary)] hover:underline">
                      {c.partner}
                    </Link>
                  </td>
                  <td className={`${tdNum} text-[var(--color-gold-ink)]`} title={fmtUSDFull(c.pePosT)}>{fmtUSD(c.pePosT)}</td>
                  <td className={`${tdNum} text-muted`} title={fmtUSDFull(c.uiPosT)}>{fmtUSD(c.uiPosT)}</td>
                  <td className="w-[120px]"><GapCell value={c.posT} max={maxGap} /></td>
                  <td className="text-right"><ShareCell share={gapPct(c)} /></td>
                  <td className="text-right"><RiskScore score={c.mtrs} band={c.band} scored={c.scored} /></td>
                  <td><BandBadge band={c.band} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      </div>

      {/* what the table is, where the page is in it, and the way through it */}
      {rows.length > 0 && (
        <div className="no-print flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex items-center gap-1.5 fs-13 font-semibold">
            {t("risk.ranked.title")}
            <InfoTip text={t("risk.ranked.info")} />
          </span>
          <span className="tabular fs-13 text-faint">
            {fmtNum(start + 1)}–{fmtNum(start + pageRows.length)} / {fmtNum(rows.length)}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setPageRaw(Math.max(0, page - 1))} disabled={page === 0} className={pagerBtn}>
              ← {t("risk.prev")}
            </button>
            <span className="tabular fs-13 text-muted">
              {t("risk.page")} {fmtNum(page + 1)} / {fmtNum(pageCount)}
            </span>
            <button onClick={() => setPageRaw(Math.min(pageCount - 1, page + 1))} disabled={page >= pageCount - 1} className={pagerBtn}>
              {t("risk.next")} →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
