"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnomalyBadge, ClassBadge, EmptyState, EvidenceBadge, MissingValue, RiskScore, RobustnessBadge } from "@/components/ui";
import { fmtPct, fmtUSD, fmtUSDFull, COLORS } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { productByCmd, type Channel, type Filter } from "@/lib/dataset";

/**
 * Ranked analytical components (Discrepancy & Risk page) — every partner × code
 * combination at the active HS level under the current filters, with the raw
 * components of the composite ranking laid out column by column. Each row is a
 * statistical screening signal, never a finding of wrongdoing.
 */

export type HsLevel = 2 | 4 | 6;

/** Series-identity dot for column headers — the header text itself stays ink (rule 5). */
function HeadDot({ color }: { color: string }) {
  return (
    <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: color }} />
  );
}

export const LEVEL_LABELS: Record<HsLevel, string> = {
  2: "HS2",
  4: "HS4 · derived",
  6: "HS6",
};

const LEVEL_TIPS: Record<HsLevel, string> = {
  2: "HS2 chapter combinations — coarsest, most stable rollups.",
  4: "HS4 combinations, derived from HS6 by truncating codes to 4 digits — not independently reported, hence “derived”.",
  6: "HS6 product combinations — the finest screening granularity in the dataset.",
};

type SortKey = "class" | "risk" | "gap" | "anomaly" | "evidence" | "persistence" | "value";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "class", label: "Class + anomaly (default)" },
  { key: "risk", label: "Risk score (composite)" },
  { key: "gap", label: "Discrepancy size" },
  { key: "anomaly", label: "Anomaly strength" },
  { key: "evidence", label: "Evidence quality" },
  { key: "persistence", label: "Persistence" },
  { key: "value", label: "Trade value (partner FOB)" },
];

const PAGE_SIZES = [25, 50, 100];

/** Short chip labels + alternative-explanation hints per engine flag. */
const FLAG_INFO: Record<string, { chip: string; hint: string }> = {
  transit: {
    chip: "transit hub",
    hint: "The partner is a re-export/transit hub — origin-vs-consignment recording can create legitimate discrepancies without any misreporting.",
  },
  "residual-hs": {
    chip: "residual HS",
    hint: "HS 98/99 residual codes are not consistently comparable across reporters; the gap may be a classification artifact.",
  },
  "reporting-stop": {
    chip: "reporting stop",
    hint: "The partner stopped reporting to Comtrade during the window — part of the gap can reflect missing reports rather than a measured discrepancy.",
  },
  "sparse-reporter": {
    chip: "sparse reporter",
    hint: "The partner reported in fewer than half of the window years — sparse coverage weakens the mirror comparison.",
  },
  "missing-weight": {
    chip: "no weight data",
    hint: "No dual weight data is available, so the unit-value cross-check cannot corroborate or weaken this signal.",
  },
  "freight-sensitive": {
    chip: "freight-sensitive",
    hint: "The sign of the discrepancy flips within the 6–15% freight band — the gap may be a valuation assumption artifact.",
  },
};

function sortChannels(rows: Channel[], sort: SortKey): Channel[] {
  if (sort === "class") return rows; // engine order: class → anomaly → evidence → |primary|
  const abs = (c: Channel) => Math.abs(c.primary);
  const by: Record<Exclude<SortKey, "class">, (a: Channel, b: Channel) => number> = {
    risk: (a, b) => b.risk - a.risk || b.evidence - a.evidence || abs(b) - abs(a),
    gap: (a, b) => abs(b) - abs(a) || b.anomaly - a.anomaly,
    anomaly: (a, b) => b.anomaly - a.anomaly || b.evidence - a.evidence || abs(b) - abs(a),
    evidence: (a, b) => b.evidence - a.evidence || b.anomaly - a.anomaly || abs(b) - abs(a),
    persistence: (a, b) =>
      b.posYears - a.posYears || b.longestPosStreak - a.longestPosStreak || abs(b) - abs(a),
    value: (a, b) => b.peT - a.peT || abs(b) - abs(a),
  };
  return [...rows].sort(by[sort]);
}

/** One-sentence cautious interpretation, built strictly from measured fields. */
function interpretation(c: Channel, f: Filter): string {
  const yrs = c.comparableYears;
  const dominant =
    c.posT >= c.revT
      ? `partner-reported exports exceeded Uzbekistan's import records in ${c.posYears} of ${yrs} comparable year${yrs === 1 ? "" : "s"} (longest streak ${c.longestPosStreak})`
      : `Uzbekistan's import records exceeded partner-reported exports in ${c.revYears} of ${yrs} comparable year${yrs === 1 ? "" : "s"}`;
  return (
    `For ${c.partner} × HS ${c.cmd}, ${dominant}, leaving a signed discrepancy of ` +
    `${fmtUSD(c.signedT, { sign: true })} at the ${Math.round(f.cif * 100)}% freight assumption ` +
    `(bounded asymmetry ${fmtPct(c.boundedAsymmetry, 0)}).`
  );
}

export default function QueueTable({
  channels,
  level,
  onLevelChange,
  filter,
  years,
}: {
  /** Combinations at the ACTIVE HS level, already filtered by the engine. */
  channels: Channel[];
  level: HsLevel;
  onLevelChange: (l: HsLevel) => void;
  filter: Filter;
  years: number[];
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("class");
  const [pageSize, setPageSize] = useState(25);
  const [pageRaw, setPageRaw] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const searched = q
      ? channels.filter(
          (c) =>
            c.partner.toLowerCase().includes(q) ||
            c.partnerIso.toLowerCase().includes(q) ||
            c.cmd.includes(q) ||
            c.cmdLabel.toLowerCase().includes(q),
        )
      : channels;
    return sortChannels(searched, sort);
  }, [channels, query, sort]);

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

  const th = "px-3 py-1.5 text-left text-[10.5px] font-medium text-faint whitespace-nowrap";
  const thNum = `${th} text-right`;
  const td = "px-3 py-1.5 align-middle text-[13px]";
  const tdNum = `${td} tabular text-right whitespace-nowrap`;

  return (
    <div className="space-y-3">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-md border border-[var(--color-border)]" role="group" aria-label="HS level">
          {([2, 4, 6] as const).map((l) => (
            <button
              key={l}
              onClick={() => controls(() => onLevelChange(l))}
              aria-pressed={level === l}
              className={`px-2 py-1 text-[12px] whitespace-nowrap ${level === l ? "bg-[var(--color-panel-2)] font-semibold text-foreground" : "bg-[var(--color-panel)] font-medium text-muted hover:text-foreground"}`}
              title={LEVEL_TIPS[l]}
            >
              {LEVEL_LABELS[l]}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => controls(() => setQuery(e.target.value))}
          placeholder="Search partner, HS code or label…"
          aria-label="Search the ranked components"
          className="w-60 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2.5 py-1 text-[13px] outline-none placeholder:text-faint focus:border-[var(--color-primary)]"
        />

        <label className="flex items-center gap-1.5 text-[12px] text-muted">
          Sort
          <select
            value={sort}
            onChange={(e) => controls(() => setSort(e.target.value as SortKey))}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1 text-[12px] text-foreground outline-none focus:border-[var(--color-primary)]"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </label>

        <span className="tabular text-[12px] text-faint">
          {rows.length === 0
            ? "0 combinations"
            : `${(start + 1).toLocaleString()}–${Math.min(start + pageSize, rows.length).toLocaleString()} of ${rows.length.toLocaleString()} combinations`}
        </span>
      </div>

      {/* table */}
      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[1360px] border-collapse">
            <thead className="border-b border-[var(--color-border)]">
              <tr>
                <th className={th} aria-label="Expand" />
                <th className={th}>Class</th>
                <th className={th} title="Composite risk score 0–100 = √(A × E), the geometric mean of anomaly strength and evidence quality. Weak evidence bounds the score (R ≤ 10·√E), so the anomaly alone can never carry it. A screening priority.">Risk</th>
                <th className={th} title="Anomaly strength 0–100 — how unusual the discrepancy is. Independent of data quality.">A</th>
                <th className={th} title="Evidence quality 0–100 — how reliable and comparable the underlying data is.">E</th>
                <th className={th}>{t("common.partner")}</th>
                <th className={th} title={LEVEL_TIPS[level]}>{LEVEL_LABELS[level]} code</th>
                <th className={thNum} title="Partner-reported exports, FOB.">Partner FOB</th>
                <th className={thNum} title={`Partner exports × (1 + ${Math.round(filter.cif * 100)}% freight) — the expected CIF import value.`}>Expected CIF</th>
                <th className={thNum} title="Uzbekistan-recorded imports, CIF.">UZB imports</th>
                <th className={thNum} title="Expected CIF − UZB imports, summed over comparable years. + = positive (partner > UZB, orange dot); − = reverse (UZB > partner, blue dot)."><HeadDot color={COLORS.positive} /><HeadDot color={COLORS.reverse} />Signed</th>
                <th className={thNum} title="Positive discrepancy — years where expected CIF exceeded UZB records, accumulated separately, never netted away."><HeadDot color={COLORS.positive} />Positive</th>
                <th className={thNum} title="Reverse discrepancy — years where UZB records exceeded expected CIF, accumulated separately, never netted away."><HeadDot color={COLORS.reverse} />Reverse</th>
                <th className={thNum} title="Bounded asymmetry: absolute discrepancy over max(expected CIF, UZB imports), 0–100%.">Asym</th>
                <th className={th} title="Years with a positive discrepancy out of comparable years, and the longest consecutive streak.">{t("common.persistence")}</th>
                <th className={th}>{t("filter.robustness")}</th>
                <th className={th}>{t("common.flags")}</th>
              </tr>
            </thead>
            <tbody className="zebra">
              {pageRows.map((c) => {
                const key = keyOf(c);
                const open = expanded === key;
                const product = c.level === 6 ? productByCmd(c.cmd) : undefined;
                return [
                  <tr
                    key={key}
                    onClick={() => setExpanded(open ? null : key)}
                    className="cursor-pointer border-b border-[var(--color-border-soft)] hover:bg-[color-mix(in_srgb,var(--color-primary)_4%,transparent)]"
                    title="Click to expand per-year detail"
                  >
                    <td className={`${td} w-6 text-faint`} aria-hidden>{open ? "▾" : "▸"}</td>
                    <td className={td}><ClassBadge cls={c.cls} /></td>
                    <td className={td}><RiskScore score={c.risk} cls={c.cls} /></td>
                    <td className={td}><AnomalyBadge score={c.anomaly} /></td>
                    <td className={td}><EvidenceBadge score={c.evidence} /></td>
                    <td className={`${td} whitespace-nowrap`}>
                      <Link
                        href={`/partners/${c.partnerIso.toLowerCase()}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium hover:underline"
                      >
                        {c.partner}
                      </Link>
                    </td>
                    <td className={`${td} max-w-[280px]`}>
                      <span className="tabular mr-1.5 font-mono text-xs text-faint">{c.cmd}</span>
                      {product ? (
                        <Link
                          href={`/products/${c.cmd}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline"
                          title={c.cmdLabel}
                        >
                          {c.cmdLabel.length > 44 ? `${c.cmdLabel.slice(0, 44)}…` : c.cmdLabel}
                        </Link>
                      ) : (
                        <span title={c.cmdLabel}>
                          {c.cmdLabel.length > 44 ? `${c.cmdLabel.slice(0, 44)}…` : c.cmdLabel}
                        </span>
                      )}
                    </td>
                    <td className={tdNum} title={fmtUSDFull(c.peT)}>{fmtUSD(c.peT)}</td>
                    <td className={tdNum} title={fmtUSDFull(c.expectedT)}>{fmtUSD(c.expectedT)}</td>
                    <td className={tdNum} title={fmtUSDFull(c.uiT)}>{fmtUSD(c.uiT)}</td>
                    <td
                      className={`${tdNum} font-semibold`}
                      title={`${fmtUSDFull(c.signedT)} — ${c.signedT >= 0 ? "positive: partner > UZB records" : "reverse: UZB records > partner"}`}
                    >
                      {fmtUSD(c.signedT, { sign: true })}
                    </td>
                    <td className={tdNum} title={`Positive: ${fmtUSDFull(c.posT)}`}>
                      {fmtUSD(c.posT)}
                    </td>
                    <td className={tdNum} title={`Reverse: ${fmtUSDFull(c.revT)}`}>
                      {fmtUSD(c.revT)}
                    </td>
                    <td className={tdNum}>{fmtPct(c.boundedAsymmetry, 0)}</td>
                    <td className={`${td} tabular whitespace-nowrap`} title={`${c.posYears} of ${c.comparableYears} comparable years show a positive discrepancy; longest consecutive streak ${c.longestPosStreak}.`}>
                      {c.posYears}/{c.comparableYears} yr · streak {c.longestPosStreak}
                    </td>
                    <td className={td}><RobustnessBadge r={c.robustness} /></td>
                    <td className={td}>
                      <span className="flex max-w-[180px] flex-wrap gap-1">
                        {c.flags.map((f) => (
                          <span
                            key={f}
                            className="cursor-help whitespace-nowrap rounded border border-[var(--color-border)] bg-[var(--color-panel)] px-1.5 py-px text-[10.5px] font-medium leading-4 text-muted"
                            title={FLAG_INFO[f]?.hint ?? f}
                          >
                            {FLAG_INFO[f]?.chip ?? f}
                          </span>
                        ))}
                      </span>
                    </td>
                  </tr>,
                  open ? (
                    <tr key={`${key}-detail`} className="border-b border-[var(--color-border-soft)] bg-[var(--color-panel-2)]">
                      <td colSpan={17} className="px-4 py-3">
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
          <label className="flex items-center gap-1.5 text-[12px] text-muted">
            Rows per page
            <select
              value={pageSize}
              onChange={(e) => controls(() => setPageSize(+e.target.value))}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1 text-[12px] text-foreground outline-none focus:border-[var(--color-primary)]"
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
              className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[12px] text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="tabular text-[12px] text-muted">
              Page {page + 1} of {pageCount}
            </span>
            <button
              onClick={() => { setPageRaw(Math.min(pageCount - 1, page + 1)); setExpanded(null); }}
              disabled={page >= pageCount - 1}
              className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[12px] text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      <p className="max-w-3xl text-xs text-faint">
        Values in nominal USD. FOB = partner-reported exports; CIF = Uzbekistan-recorded
        imports; expected CIF applies the active freight scenario. HS4 rows are derived
        from HS6 by code truncation, not independently reported. Missing partner-years are
        shown as “{t("common.notReported")}”, never as zero. Source: UN Comtrade.
      </p>
    </div>
  );
}

/** Expanded row: per-year mini table + cautious auto-interpretation + alternative explanations. */
function YearDetail({ c, filter, years }: { c: Channel; filter: Filter; years: number[] }) {
  const { t } = useI18n();
  const byYear = new Map(c.years.map((yr) => [yr.y, yr]));
  const th = "px-3 py-1.5 text-left text-[10.5px] font-medium text-faint";
  const thNum = `${th} text-right`;
  const td = "px-3 py-1.5 text-[12px]";
  const tdNum = `${td} tabular text-right whitespace-nowrap`;
  const hints = c.flags.map((f) => FLAG_INFO[f]?.hint).filter((h): h is string => !!h);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(320px,420px)_1fr]">
      <div>
        <h4 className="mb-1 text-[10.5px] font-medium text-faint">
          Per-year detail · {c.partner} × HS <span className="font-mono">{c.cmd}</span>
        </h4>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className={th}>{t("common.year")}</th>
              <th className={thNum}>Partner FOB</th>
              <th className={thNum}>UZB imports</th>
              <th className={thNum}><HeadDot color={COLORS.positive} /><HeadDot color={COLORS.reverse} />Signed</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => {
              const yr = byYear.get(y);
              return (
                <tr key={y} className="border-b border-[var(--color-border-soft)]">
                  <td className={`${td} tabular`}>{y}</td>
                  {yr ? (
                    <>
                      <td className={tdNum} title={fmtUSDFull(yr.pe)}>{fmtUSD(yr.pe)}</td>
                      <td className={tdNum} title={fmtUSDFull(yr.ui)}>{fmtUSD(yr.ui)}</td>
                      <td className={tdNum} title={fmtUSDFull(yr.signed)}>
                        {fmtUSD(yr.signed, { sign: true })}
                      </td>
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
        <p className="mt-1 text-[11px] text-faint">
          “{t("common.notReported")}” = partner data missing for that year; not treated as a zero gap.
        </p>
      </div>

      <div className="space-y-3 text-[13px] leading-relaxed">
        <div>
          <h4 className="mb-1 text-[10.5px] font-medium text-faint">Reading</h4>
          <p className="text-muted">{interpretation(c, filter)}</p>
        </div>
        <div>
          <h4 className="mb-1 text-[10.5px] font-medium text-faint">
            Alternative explanations to weigh
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
            <p className="text-muted">
              No standard alternative-explanation flags apply to this combination; valuation,
              timing and classification differences can still account for part of the discrepancy.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
