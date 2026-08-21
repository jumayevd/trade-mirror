"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BandBadge, EmptyState, MissingValue, RiskScore } from "@/components/ui";
import MultiSelect from "@/components/MultiSelect";
import LevelTabs, { LEVEL_LABEL_KEYS, LEVEL_TIP_KEYS, type HsLevel } from "@/components/LevelTabs";
import type { SearchOption } from "@/components/SearchSelect";
import { fmtPct, fmtUSD, fmtUSDFull, COLORS } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { hsFullLabel, productByCmd, yearsLabel, type Channel, type Filter } from "@/lib/dataset";
import type { LocaleKey } from "@/lib/locales";

/**
 * Ranked analytical components (Discrepancy & Risk page) — every partner × code
 * combination at the active HS level, ranked by screening priority. One row =
 * one channel: who, what, how strong the signal is, and how big the gap is.
 */

export { LEVEL_LABEL_KEYS, type HsLevel };

/**
 * The window the score covers, on the score's own column. It is the period in
 * view — select one year and it reads "1 yr" — because G, P and the band are all
 * computed on what is on screen. Stating it stops the reader having to infer the
 * span from the picker.
 */
function WindowTag({ years }: { years: number }) {
  const { t } = useI18n();
  return (
    <span className="tabular ml-1.5 whitespace-nowrap rounded-sm bg-[var(--color-panel-2)] px-1 py-px text-[10.5px] font-normal tracking-normal text-faint">
      {years} {t("risk.unit.yr")}
    </span>
  );
}

/** Series-identity dot for column headers — the header text itself stays ink (rule 5). */
function HeadDot({ color }: { color: string }) {
  return (
    <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: color }} />
  );
}

type SortKey = "risk" | "gapPct" | "persistence" | "value" | "importReported";
type SortDir = "desc" | "asc";

const SORTS: { key: SortKey; labelKey: LocaleKey }[] = [
  { key: "risk", labelKey: "risk.th.riskValue" },
  { key: "gapPct", labelKey: "risk.th.gapPct" },
  { key: "persistence", labelKey: "common.persistence" },
  { key: "value", labelKey: "risk.th.exportReported" },
  { key: "importReported", labelKey: "risk.th.uzbImport" },
];

const PAGE_SIZES = [25, 50, 100];

/**
 * Gap as a share of the partner's reported FOB exports over the positive
 * channel-years: Gap % = posT ÷ pePosT. The denominator is what the partner says
 * it shipped, so the ratio reads as the share of that shipment Uzbekistan's book
 * does not account for. Null when there is no denominator.
 */
const gapPct = (c: Channel): number | null =>
  c.pePosT > 0 ? c.posT / c.pePosT : null;

/** Short alternative-explanation hints per engine flag, used in the expanded row. */
const FLAG_HINT_KEYS: Record<string, LocaleKey> = {
  transit: "risk.flag.transit",
  "residual-hs": "risk.flag.residualHs",
  "reporting-stop": "risk.flag.reportingStop",
  "sparse-reporter": "risk.flag.sparseReporter",
  "missing-weight": "risk.flag.missingWeight",
  "freight-sensitive": "risk.flag.freightSensitive",
};

/**
 * Every comparator ranks the strongest signal first; ascending reverses the
 * finished order so the tie-breaks stay attached to their primary key rather
 * than flipping independently of it.
 */
function sortChannels(rows: Channel[], sort: SortKey, dir: SortDir): Channel[] {
  const by: Record<SortKey, (a: Channel, b: Channel) => number> = {
    risk: (a, b) => b.mtrs - a.mtrs || b.posT - a.posT,
    gapPct: (a, b) => (gapPct(b) ?? -1) - (gapPct(a) ?? -1) || b.posT - a.posT,
    persistence: (a, b) =>
      b.persistence - a.persistence || b.posYears - a.posYears || b.posT - a.posT,
    value: (a, b) => b.pePosT - a.pePosT || b.posT - a.posT,
    importReported: (a, b) => b.uiPosT - a.uiPosT || b.posT - a.posT,
  };
  const sorted = [...rows].sort(by[sort]);
  return dir === "asc" ? sorted.reverse() : sorted;
}

type Translate = (key: LocaleKey) => string;

/** One-sentence cautious reading, built strictly from measured fields. */
function interpretation(c: Channel, f: Filter, t: Translate): string {
  const pct = gapPct(c);
  const score = c.scored
    ? ` ${t("risk.read.scoreLead")} ${c.mtrs.toFixed(0)} (G ${c.abnormalGap.toFixed(2)} × P ${c.persistence.toFixed(2)}).`
    : "";
  return (
    `${c.partner} × HS ${c.cmd} — ${t("risk.read.lead")} ${c.posYears}/${c.comparableYears} ` +
    `${t("risk.read.comparableYears")} (${t("risk.read.longestStreak")} ${c.longestPosStreak}). ` +
    `${t("risk.read.gapLead")} ${fmtUSD(c.posT)} ${t("risk.read.atFreight")} ${Math.round(f.cif * 100)}%` +
    `${pct == null ? "" : ` — ${fmtPct(pct, 1)} ${t("risk.read.ofExpectedCif")}`}.${score}`
  );
}

export default function QueueTable({
  channels,
  level,
  onLevelChange,
  filter,
  years,
}: {
  /** Combinations at the ACTIVE HS level, already ranked by the engine. */
  channels: Channel[];
  level: HsLevel;
  onLevelChange: (l: HsLevel) => void;
  filter: Filter;
  years: number[];
}) {
  const { t } = useI18n();
  /** Freight factor: recorded CIF imports are divided by this to reach an FOB basis. */
  const K = 1 + filter.cif;
  /*
   * The score is computed on the period in view, so the window it describes is
   * whatever the picker holds — named here once and quoted in the tooltips, so a
   * one-year selection cannot be mistaken for a verdict on eight.
   */
  const windowYears = years.length;
  const windowTip = ` ${t("risk.window.tip")
    .replace("{window}", yearsLabel(years))
    .replace("{n}", String(windowYears))}`;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("risk");
  const [dir, setDir] = useState<SortDir>("desc");
  const [pageSize, setPageSize] = useState(25);
  const [pageRaw, setPageRaw] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  /** Cross-cutting selections: many partners and many products at once. */
  const [partnerSel, setPartnerSel] = useState<string[]>([]);
  const [productSel, setProductSel] = useState<string[]>([]);

  // options come from the channels actually on screen, so the pickers never
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

  const keyOf = (c: Channel) => `${c.partnerIso}|${c.cmd}|${c.level}`;

  const controls = (patch: () => void) => {
    patch();
    setPageRaw(0);
    setExpanded(null);
  };

  const th = "px-3 py-1.5 text-left text-[12px] font-medium text-faint whitespace-nowrap";
  const thNum = `${th} text-right`;
  const td = "px-3 py-1.5 align-middle text-[13px]";
  const tdNum = `${td} tabular text-right whitespace-nowrap`;

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
          className="w-60 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2.5 py-1 text-[13px] outline-none placeholder:text-faint focus:border-[var(--color-primary)]"
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

        <label className="flex items-center gap-1.5 text-[13px] text-muted">
          {t("risk.sortLabel")}
          <select
            value={sort}
            onChange={(e) => controls(() => setSort(e.target.value as SortKey))}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1 text-[13px] text-foreground outline-none focus:border-[var(--color-primary)]"
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
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1 text-[13px] text-foreground outline-none focus:border-[var(--color-primary)]"
          >
            <option value="desc">{t("risk.sortDesc")}</option>
            <option value="asc">{t("risk.sortAsc")}</option>
          </select>
        </label>

        <span className="tabular text-[13px] text-faint">
          {rows.length === 0
            ? `0 ${t("risk.combinationsCount")}`
            : `${(start + 1).toLocaleString()}–${Math.min(start + pageSize, rows.length).toLocaleString()} / ${rows.length.toLocaleString()} ${t("risk.combinationsCount")}`}
        </span>
      </div>

      {/* table */}
      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse">
            <thead className="border-b border-[var(--color-border)]">
              <tr>
                <th className={th}>{t("common.partner")}</th>
                <th className={th} title={t(LEVEL_TIP_KEYS[level])}>{t("risk.th.hsCode")}</th>
                <th className={th}>{t("common.product")}</th>
                <th className={th} title={`${t("risk.tip.riskValue")}${windowTip}`}>
                  {t("risk.th.riskValue")}<WindowTag years={windowYears} />
                </th>
                <th className={thNum} title={`${t("risk.tip.uzbImport")} ${t("filter.freight")}: ${Math.round(filter.cif * 100)}%.`}>{t("risk.th.uzbImport")}</th>
                <th className={thNum} title={t("risk.tip.exportReported")}>{t("risk.th.exportReported")}</th>
                <th className={thNum} title={t("risk.tip.gap")}><HeadDot color={COLORS.positive} />{t("risk.th.gap")}</th>
                <th className={thNum} title={t("risk.tip.gapPct")}>{t("risk.th.gapPct")}</th>
                <th className={th} title={`${t("risk.tip.persistence")}${windowTip}`}>
                  {t("common.persistence")}
                </th>
                <th className={th} title={`${t("risk.tip.band")}${windowTip}`}>
                  {t("risk.th.band")}
                </th>
              </tr>
            </thead>
            <tbody className="zebra">
              {pageRows.map((c) => {
                const key = keyOf(c);
                const open = expanded === key;
                const product = c.level === 6 ? productByCmd(c.cmd) : undefined;
                const pct = gapPct(c);
                return [
                  <tr
                    key={key}
                    onClick={() => setExpanded(open ? null : key)}
                    className="cursor-pointer border-b border-[var(--color-border-soft)] hover:bg-[color-mix(in_srgb,var(--color-primary)_4%,transparent)]"
                    title={t("risk.tip.rowExpand")}
                  >
                    <td className={`${td} whitespace-nowrap`}>
                      {/* keyboard path to the same toggle the row click performs */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setExpanded(open ? null : key); }}
                        aria-expanded={open}
                        aria-label={t("risk.tip.rowExpand")}
                        className="mr-1.5 text-faint hover:text-foreground focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                      >
                        {open ? "▾" : "▸"}
                      </button>
                      <Link
                        href={`/partners/${c.partnerIso.toLowerCase()}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium hover:underline"
                      >
                        {c.partner}
                      </Link>
                    </td>
                    <td className={`${td} tabular`}>{c.cmd}</td>
                    <td className={`${td} max-w-[280px]`}>
                      {/* the column is narrow, so the cell abbreviates; hover carries the
                          complete nomenclature line, not the extract's 90-char cut */}
                      {product ? (
                        <Link
                          href={`/products/${c.cmd}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline"
                          title={hsFullLabel(c.cmd)}
                        >
                          {c.cmdLabel.length > 44 ? `${c.cmdLabel.slice(0, 44)}…` : c.cmdLabel}
                        </Link>
                      ) : (
                        <span title={hsFullLabel(c.cmd)}>
                          {c.cmdLabel.length > 44 ? `${c.cmdLabel.slice(0, 44)}…` : c.cmdLabel}
                        </span>
                      )}
                    </td>
                    <td className={td}><RiskScore score={c.mtrs} band={c.band} scored={c.scored} /></td>
                    {/* imports divided down to an FOB basis at the selected freight
                        scenario, so the row reads as an identity: export − import = gap */}
                    <td className={tdNum} title={c.uiPosT > 0 ? fmtUSDFull(c.uiPosT / K) : undefined}>
                      {/* no positive-year UZB record — a gap in the mirror, never a measured zero */}
                      {c.uiPosT > 0 ? fmtUSD(c.uiPosT / K) : <MissingValue />}
                    </td>
                    <td className={tdNum} title={fmtUSDFull(c.pePosT)}>{fmtUSD(c.pePosT)}</td>
                    <td className={`${tdNum} font-semibold`} title={fmtUSDFull(c.posT)}>{fmtUSD(c.posT)}</td>
                    <td className={tdNum}>
                      {pct == null ? <MissingValue kind="notComparable" /> : fmtPct(pct, 1)}
                    </td>
                    {/* k and n are the years in view, and P is what they produce
                        under Laplace's rule — printed so the score above can be
                        checked against the column beside it. */}
                    <td
                      className={`${td} tabular whitespace-nowrap`}
                      title={`${t("risk.tip.persistenceCell")} ${c.posYears}/${c.comparableYears} · ` +
                        `${t("risk.read.longestStreak")} ${c.longestPosStreak} · ` +
                        `P = (${c.posYears} + 1) ÷ (${c.comparableYears} + 2) = ${c.persistence.toFixed(2)}`}
                    >
                      {c.posYears}/{c.comparableYears} {t("risk.unit.yr")} · P {c.persistence.toFixed(2)}
                    </td>
                    <td className={td}><BandBadge band={c.band} /></td>
                  </tr>,
                  open ? (
                    <tr key={`${key}-detail`} className="border-b border-[var(--color-border-soft)] bg-[var(--color-panel-2)]">
                      <td colSpan={10} className="px-4 py-3">
                        <YearDetail c={c} filter={filter} years={years} />
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* pagination */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-[13px] text-muted">
            {t("risk.rowsPerPage")}
            <select
              value={pageSize}
              onChange={(e) => controls(() => setPageSize(+e.target.value))}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1 text-[13px] text-foreground outline-none focus:border-[var(--color-primary)]"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => { setPageRaw(Math.max(0, page - 1)); setExpanded(null); }}
              disabled={page === 0}
              className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[13px] text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← {t("risk.prev")}
            </button>
            <span className="tabular text-[13px] text-muted">
              {t("risk.page")} {page + 1} / {pageCount}
            </span>
            <button
              onClick={() => { setPageRaw(Math.min(pageCount - 1, page + 1)); setExpanded(null); }}
              disabled={page >= pageCount - 1}
              className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[13px] text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("risk.next")} →
            </button>
          </div>
        </div>
      )}

      <p className="max-w-3xl text-xs text-faint">
        {t("risk.table.footnote")} “{t("common.notReported")}”{t("risk.table.footnoteZero")}{" "}
        {t("common.source")}.
      </p>
    </div>
  );
}

/** Expanded row: per-year mini table + cautious auto-reading + alternative explanations. */
function YearDetail({ c, filter, years }: { c: Channel; filter: Filter; years: number[] }) {
  const { t } = useI18n();
  const K = 1 + filter.cif;
  const byYear = new Map(c.years.map((yr) => [yr.y, yr]));
  const th = "px-3 py-1.5 text-left text-[12px] font-medium text-faint";
  const thNum = `${th} text-right`;
  const td = "px-3 py-1.5 text-[13px]";
  const tdNum = `${td} tabular text-right whitespace-nowrap`;
  const hints = c.flags
    .map((f) => FLAG_HINT_KEYS[f])
    .filter((k): k is LocaleKey => !!k)
    .map((k) => t(k));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(320px,420px)_1fr]">
      <div>
        <h4 className="mb-1 text-[12px] font-medium text-faint">
          {t("risk.detail.perYear")} · {c.partner} × HS <span className="tabular">{c.cmd}</span>
        </h4>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className={th}>{t("common.year")}</th>
              <th className={thNum}>{t("risk.th.exportReported")}</th>
              <th className={thNum}>{t("risk.th.uzbImport")}</th>
              <th className={thNum}><HeadDot color={COLORS.positive} />{t("risk.th.gap")}</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => {
              const yr = byYear.get(y);
              const gap = yr ? Math.max(0, yr.signed) : 0;
              return (
                <tr key={y} className="border-b border-[var(--color-border-soft)]">
                  <td className={`${td} tabular`}>{y}</td>
                  {yr ? (
                    <>
                      <td className={tdNum} title={fmtUSDFull(yr.pe)}>{fmtUSD(yr.pe)}</td>
                      <td className={tdNum} title={fmtUSDFull(yr.ui / K)}>{fmtUSD(yr.ui / K)}</td>
                      <td className={tdNum} title={fmtUSDFull(gap)}>{fmtUSD(gap)}</td>
                    </>
                  ) : (
                    <>
                      <td className={tdNum}><MissingValue /></td>
                      <td className={tdNum}><MissingValue /></td>
                      <td className={tdNum}><MissingValue kind="notComparable" /></td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-1 text-[12px] text-faint">
          “{t("common.notReported")}” — {t("risk.detail.notReportedNote")}
        </p>
      </div>

      <div className="space-y-3 text-[13px] leading-relaxed">
        <div>
          <h4 className="mb-1 text-[12px] font-medium text-faint">{t("risk.detail.reading")}</h4>
          <p className="text-muted">{interpretation(c, filter, t)}</p>
        </div>
        <div>
          <h4 className="mb-1 text-[12px] font-medium text-faint">
            {t("risk.detail.alternatives")}
          </h4>
          {hints.length > 0 ? (
            <ul className="space-y-1">
              {hints.map((h, i) => (
                <li key={i} className="flex gap-2 text-muted">
                  <span className="text-[var(--color-warn,#a16207)]">!</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">{t("risk.detail.noFlags")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
