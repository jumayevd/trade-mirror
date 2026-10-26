"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BandBadge, EmptyState, RiskScore } from "@/components/ui";
import MultiSelect from "@/components/MultiSelect";
import LevelTabs, { LEVEL_LABEL_KEYS, type HsLevel } from "@/components/LevelTabs";
import type { SearchOption } from "@/components/SearchSelect";
import { fmtUSD, fmtUSDFull } from "@/lib/format";
import { GapCell, RankCell, ShareCell, productName } from "@/components/TableKit";
import { useI18n } from "@/lib/i18n";
import { hsFullLabel, yearsLabel, type Channel } from "@/lib/dataset";
import type { LocaleKey } from "@/lib/locales";

/**
 * Products ranking (Discrepancy & Risk page) — every partner × code pair at the
 * active HS level with a positive discrepancy, ranked by screening priority.
 *
 * Export and Import are the pair's values on its positive HS6 lines, so every
 * row checks by hand: Export − Import ÷ (1 + freight) = Positive discrepancy,
 * and its share = Positive discrepancy ÷ Export. At HS2 and HS4 all three are
 * sums of the HS6 products beneath, never read from a separate layer.
 */

export { LEVEL_LABEL_KEYS, type HsLevel };

type SortKey = "risk" | "gap" | "gapPct" | "value" | "importReported";
type SortDir = "desc" | "asc";

const SORTS: { key: SortKey; labelKey: LocaleKey }[] = [
  { key: "risk", labelKey: "prof.th.score" },
  { key: "gap", labelKey: "prof.th.gap" },
  { key: "gapPct", labelKey: "prof.th.share" },
  { key: "value", labelKey: "prof.th.export" },
  { key: "importReported", labelKey: "prof.th.import" },
];

const PAGE_SIZES = [10, 20, 50, 100];

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
}: {
  /** Pairs at the ACTIVE HS level, already ranked by the engine. */
  channels: Channel[];
  level: HsLevel;
  onLevelChange: (l: HsLevel) => void;
  years: number[];
}) {
  const { t, lang } = useI18n();
  // the score is computed on the period in view; the tooltips name that window
  const windowTip = ` ${t("risk.window.tip")
    .replace("{window}", yearsLabel(years))
    .replace("{n}", String(years.length))}`;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("risk");
  const [dir, setDir] = useState<SortDir>("desc");
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [pageRaw, setPageRaw] = useState(0);
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

  // bars scale to the rows on screen: sorted by score, one large pair would flatten the rest
  const maxGap = pageRows.reduce((m, c) => Math.max(m, c.posT), 0);
  const tdNum = "tabular text-right whitespace-nowrap";
  const pagerBtn = "rounded-md border border-[var(--color-border)] px-2 py-1 fs-13 text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="space-y-3">
      {/* controls */}
      <div className="flex flex-wrap items-end gap-3">
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
          className="h-[33px] w-60 max-w-full min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2.5 fs-13 outline-none placeholder:text-faint focus:border-[var(--color-primary)]"
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

        <label className="flex min-w-0 flex-wrap items-center gap-1.5 fs-13 text-muted">
          {t("risk.sortLabel")}
          <select
            value={sort}
            onChange={(e) => controls(() => setSort(e.target.value as SortKey))}
            className="h-[33px] min-w-0 max-w-full rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 fs-13 text-foreground outline-none focus:border-[var(--color-primary)]"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{t(s.labelKey)}</option>
            ))}
          </select>
          <select
            value={dir}
            onChange={(e) => controls(() => setDir(e.target.value as SortDir))}
            aria-label={t("risk.sortDir")}
            title={t("risk.sortDir")}
            className="h-[33px] min-w-0 max-w-full rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 fs-13 text-foreground outline-none focus:border-[var(--color-primary)]"
          >
            <option value="desc">{t("risk.sortDesc")}</option>
            <option value="asc">{t("risk.sortAsc")}</option>
          </select>
        </label>

      </div>

      {/* table */}
      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="cbu-table min-w-[880px]">
            <thead>
              <tr>
                <th className="w-10 text-right">#</th>
                <th className="text-left">{t("common.product")}</th>
                <th className="text-left">{t("common.partner")}</th>
                <th className="text-right" title={t("risk.tip.export")}>{t("prof.th.export")}</th>
                <th className="text-right" title={t("risk.tip.import")}>{t("prof.th.import")}</th>
                <th className="text-right" title={t("risk.tip.gap")}>{t("prof.th.gap")}</th>
                <th className="text-right" title={t("prof.th.share.tip")}>{t("prof.th.share")}</th>
                <th className="text-right" title={`${t("risk.tip.riskValue")}${windowTip}`}>{t("prof.th.score")}</th>
                <th className="text-left" title={`${t("risk.tip.band")}${windowTip}`}>{t("prof.th.band")}</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c, i) => (
                <tr key={`${c.partnerIso}|${c.cmd}|${c.level}`}>
                  <td className="text-right"><RankCell n={start + i + 1} /></td>
                  <td className="min-w-[200px] max-w-[320px]">
                    {/* a few words that name the line; the code and the full nomenclature on hover */}
                    <span className="line-clamp-2 font-medium leading-snug" title={`HS ${c.cmd} · ${hsFullLabel(c.cmd)}`}>
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
      )}

      {/* pagination */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 fs-13 text-muted">
            {t("risk.rowsPerPage")}
            <select
              value={pageSize}
              onChange={(e) => controls(() => setPageSize(+e.target.value))}
              className="h-[33px] min-w-0 max-w-full rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 fs-13 text-foreground outline-none focus:border-[var(--color-primary)]"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setPageRaw(Math.max(0, page - 1))} disabled={page === 0} className={pagerBtn}>
              ← {t("risk.prev")}
            </button>
            <span className="tabular fs-13 text-muted">
              {t("risk.page")} {page + 1} / {pageCount}
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
