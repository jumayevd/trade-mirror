"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState, MissingValue } from "@/components/ui";
import { fmtNum, fmtPct, fmtUSD, fmtUSDFull, CLASS_COLORS } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { CLASS_LABELS, ROBUSTNESS_LABELS, productByCmd, type Channel, type Filter } from "@/lib/dataset";

/**
 * The queue (Modernist redesign, README §4) — toolbar (HS level, 220px search,
 * sort), 4-cell stat strip framed by 2px rules, the full-width ranked table,
 * and a single-select detail panel below the table with the per-year record
 * and the alternative explanations to weigh. Each row is a statistical
 * screening signal, never a finding of wrongdoing.
 */

export type HsLevel = 2 | 4 | 6;

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

type SortKey = "class" | "gap" | "anomaly" | "evidence" | "persistence";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "class", label: "Class + anomaly" },
  { key: "gap", label: "Discrepancy size" },
  { key: "anomaly", label: "Anomaly strength" },
  { key: "evidence", label: "Evidence quality" },
  { key: "persistence", label: "Persistence" },
];

const PAGE_SIZE = 25;

/** Short labels + alternative-explanation hints per engine flag. */
export const FLAG_INFO: Record<string, { chip: string; hint: string }> = {
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
    gap: (a, b) => abs(b) - abs(a) || b.anomaly - a.anomaly,
    anomaly: (a, b) => b.anomaly - a.anomaly || b.evidence - a.evidence || abs(b) - abs(a),
    evidence: (a, b) => b.evidence - a.evidence || b.anomaly - a.anomaly || abs(b) - abs(a),
    persistence: (a, b) =>
      b.posYears - a.posYears || b.longestPosStreak - a.longestPosStreak || abs(b) - abs(a),
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
    `(bounded asymmetry ${fmtPct(c.boundedAsymmetry, 0)}); this residual unexplained discrepancy ` +
    `is a statistical screening signal and is not proof of intentional misreporting.`
  );
}

/* ---------------- table chrome (2px head rule, 1px row rules) ---------------- */
const TH = "py-2 pr-2.5 text-left align-bottom text-[10px] font-semibold uppercase tracking-[.1em] text-faint whitespace-nowrap";
const THN = `${TH} text-right`;
const TD = "py-[7px] pr-2.5 align-middle text-[13px]";
const TDN = `${TD} tabular text-right whitespace-nowrap`;
const HEAD_ROW = "border-b-2 border-[rgba(32,30,29,.4)]";

const BTN = "border border-[rgba(32,30,29,.4)] px-2 py-1 text-[11.5px] font-semibold text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";

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
  const [pageRaw, setPageRaw] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  // any filter change closes the detail panel — its per-year figures would be
  // stale (adjust-during-render pattern)
  const [prevFilter, setPrevFilter] = useState(filter);
  if (prevFilter !== filter) {
    setPrevFilter(filter);
    setExpanded(null);
    setPageRaw(0);
  }

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

  // 4-cell stat strip over the rows in scope (after search, before pagination)
  const strip = useMemo(() => {
    const investigate = rows.filter((c) => c.cls === "investigate").length;
    const partners = new Set(rows.map((c) => c.partnerIso)).size;
    const sortedAbs = [...rows].sort((a, b) => Math.abs(b.primary) - Math.abs(a.primary));
    const total = sortedAbs.reduce((s, c) => s + Math.abs(c.primary), 0);
    const top5 = sortedAbs.slice(0, 5).reduce((s, c) => s + Math.abs(c.primary), 0);
    return { investigate, partners, top5Share: total > 0 ? top5 / total : 0 };
  }, [rows]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(pageRaw, pageCount - 1);
  const start = page * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  const keyOf = (c: Channel) => `${c.partnerIso}|${c.cmd}|${c.level}`;
  const detail = expanded ? rows.find((c) => keyOf(c) === expanded) ?? null : null;

  const controls = (patch: () => void) => {
    patch();
    setPageRaw(0);
    setExpanded(null);
  };

  const stripCells: { value: string; label: string; color?: string }[] = [
    { value: fmtNum(rows.length), label: `channels in scope (${LEVEL_LABELS[level]})` },
    { value: fmtNum(strip.investigate), label: "Investigate class · A ≥ 55 and E ≥ 60 (§6)", color: "#ae1800" },
    { value: fmtNum(strip.partners), label: "distinct partners represented" },
    { value: fmtPct(strip.top5Share, 0), label: "top-5 share of the active-direction total" },
  ];

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex border border-[rgba(32,30,29,.4)]" role="group" aria-label="HS level">
          {([2, 4, 6] as const).map((l) => (
            <button
              key={l}
              onClick={() => controls(() => onLevelChange(l))}
              aria-pressed={level === l}
              title={LEVEL_TIPS[l]}
              className={`px-2.5 py-[5px] text-[11.5px] font-extrabold whitespace-nowrap ${
                level === l ? "bg-[#201e1d] text-[#f3f2f2]" : "text-muted hover:text-foreground"
              }`}
            >
              {LEVEL_LABELS[l]}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => controls(() => setQuery(e.target.value))}
          placeholder="Search partner, code or label…"
          aria-label="Search the queue"
          className="w-[220px] border border-[rgba(32,30,29,.4)] bg-[#f3f2f2] px-2.5 py-[5px] text-[12.5px] outline-none placeholder:text-faint"
        />

        <select
          value={sort}
          onChange={(e) => controls(() => setSort(e.target.value as SortKey))}
          aria-label="Sort the queue"
          className="border border-[rgba(32,30,29,.4)] bg-[#f3f2f2] px-2 py-[5px] text-[12.5px] font-semibold text-foreground outline-none"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>

        <span className="tabular ml-auto text-[11px] text-faint">
          {rows.length === 0
            ? "0 channels"
            : `${fmtNum(start + 1)}–${fmtNum(Math.min(start + PAGE_SIZE, rows.length))} of ${fmtNum(rows.length)}`}
        </span>
      </div>

      {/* stat strip — framed by 2px rules top and bottom */}
      <div className="grid grid-cols-2 border-y-2 border-[rgba(32,30,29,.4)] lg:grid-cols-4">
        {stripCells.map((s, i) => (
          <div key={s.label} className={`py-3 pr-3.5 ${i > 0 ? "pl-3.5" : ""} ${i < stripCells.length - 1 ? "border-r border-[rgba(32,30,29,.2)]" : ""}`}>
            <div className="tabular text-[22px] font-semibold leading-none" style={s.color ? { color: s.color } : undefined}>
              {s.value}
            </div>
            <div className="mt-1 text-[11.5px] leading-snug text-[rgba(32,30,29,.62)]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* table */}
      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse">
            <thead>
              <tr className={HEAD_ROW}>
                <th className={TH} aria-label="Expand" />
                <th className={TH} title="Signal class (§6): anomaly × evidence matrix — a review order, not a verdict.">Class</th>
                <th className={TH}>{t("common.partner")}</th>
                <th className={TH} title={LEVEL_TIPS[level]}>Code · label</th>
                <th className={THN} title="Partner-reported exports, FOB.">Partner FOB</th>
                <th className={THN} title={`Partner exports × (1 + ${Math.round(filter.cif * 100)}% freight) — the expected CIF import value (§2.1).`}>Expected CIF</th>
                <th className={THN} title="Uzbekistan-recorded imports, CIF.">UZB imports</th>
                <th className={THN} title="Expected CIF − UZB imports over comparable years (§2.1). + = positive (partner > UZB); − = reverse.">Signed</th>
                <th className={THN} title="Bounded asymmetry: absolute discrepancy ÷ max(expected CIF, UZB imports) (§2.2).">Asym</th>
                <th className={THN} title="Anomaly strength 0–100 (§4) — how unusual the discrepancy is; independent of data quality.">A</th>
                <th className={THN} title="Evidence quality 0–100 (§5) — how reliable and comparable the underlying data is.">E</th>
                <th className={TH} title="Robustness: does the sign hold across the 6–15% freight band with enough comparable years?">Robustness</th>
                <th className={TH}>{t("common.flags")}</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c) => {
                const key = keyOf(c);
                const open = expanded === key;
                const product = c.level === 6 ? productByCmd(c.cmd) : undefined;
                const label = c.cmdLabel.length > 40 ? `${c.cmdLabel.slice(0, 40)}…` : c.cmdLabel;
                return (
                  <tr
                    key={key}
                    onClick={() => setExpanded(open ? null : key)}
                    className="cursor-pointer border-b border-[rgba(32,30,29,.18)]"
                    style={open ? { background: "rgba(236,48,19,.06)" } : undefined}
                    title="Click for the per-year record and the alternative explanations to weigh"
                  >
                    <td className={`${TD} w-4 text-[rgba(32,30,29,.45)]`} aria-hidden>{open ? "▾" : "▸"}</td>
                    <td className={`${TD} whitespace-nowrap text-[12px] font-extrabold`} style={{ color: CLASS_COLORS[c.cls] }} title={CLASS_LABELS[c.cls].desc}>
                      {t(`cls.${c.cls}` as never)}
                    </td>
                    <td className={`${TD} whitespace-nowrap font-extrabold`}>
                      <Link
                        href={`/partners/${c.partnerIso.toLowerCase()}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:underline"
                      >
                        {c.partner}
                      </Link>
                    </td>
                    <td className={`${TD} max-w-[280px]`}>
                      <span className="tabular mr-1.5 text-[11px] text-[rgba(32,30,29,.5)]">{c.cmd}</span>
                      {product ? (
                        <Link
                          href={`/products/${c.cmd}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[rgba(32,30,29,.75)] hover:underline"
                          title={c.cmdLabel}
                        >
                          {label}
                        </Link>
                      ) : (
                        <span className="text-[rgba(32,30,29,.75)]" title={c.cmdLabel}>{label}</span>
                      )}
                    </td>
                    <td className={TDN} title={fmtUSDFull(c.peT)}>{fmtUSD(c.peT)}</td>
                    <td className={TDN} title={fmtUSDFull(c.expectedT)}>{fmtUSD(c.expectedT)}</td>
                    <td className={TDN} title={fmtUSDFull(c.uiT)}>{fmtUSD(c.uiT)}</td>
                    <td
                      className={`${TDN} font-semibold`}
                      style={{ color: c.signedT >= 0 ? "#ae1800" : "rgba(32,30,29,.7)" }}
                      title={`${fmtUSDFull(c.signedT)} — ${c.signedT >= 0 ? "positive: partner > UZB records" : "reverse: UZB records > partner"}`}
                    >
                      {fmtUSD(c.signedT, { sign: true })}
                    </td>
                    <td className={TDN}>{fmtPct(c.boundedAsymmetry, 0)}</td>
                    <td className={TDN}>{c.anomaly.toFixed(0)}</td>
                    <td className={`${TDN} text-[rgba(32,30,29,.7)]`}>{c.evidence.toFixed(0)}</td>
                    <td className={`${TD} whitespace-nowrap text-[11.5px] text-[rgba(32,30,29,.7)]`} title={ROBUSTNESS_LABELS[c.robustness]}>
                      {t(`rob.${c.robustness}` as never)}
                    </td>
                    <td
                      className={`${TD} max-w-[200px] text-[11px] text-[rgba(32,30,29,.6)]`}
                      title={c.flags.map((f) => FLAG_INFO[f]?.hint ?? f).join("\n")}
                    >
                      {c.flags.length === 0 ? <span className="text-faint">—</span> : c.flags.map((f) => FLAG_INFO[f]?.chip ?? f).join(" · ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* detail panel — single-select, below the table */}
      {detail && <DetailPanel c={detail} filter={filter} years={years} onClose={() => setExpanded(null)} />}

      {/* pagination */}
      {rows.length > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2">
          <button className={BTN} onClick={() => { setPageRaw(Math.max(0, page - 1)); setExpanded(null); }} disabled={page === 0}>
            ← Prev
          </button>
          <span className="tabular text-[11.5px] text-muted">
            {page + 1} / {pageCount}
          </span>
          <button className={BTN} onClick={() => { setPageRaw(Math.min(pageCount - 1, page + 1)); setExpanded(null); }} disabled={page >= pageCount - 1}>
            Next →
          </button>
        </div>
      )}

      <p className="max-w-[44rem] text-[11.5px] leading-normal text-[rgba(32,30,29,.55)]">
        Nominal USD; FOB = partner-reported exports, CIF = Uzbekistan-recorded imports; HS4 is derived
        from HS6 by truncation. Missing partner-years read “{t("common.notReported")}”, never zero. {t("common.source")}.
      </p>
    </div>
  );
}

/** Detail panel: per-year record + cautious reading + alternative explanations. */
function DetailPanel({
  c, filter, years, onClose,
}: {
  c: Channel; filter: Filter; years: number[]; onClose: () => void;
}) {
  const { t } = useI18n();
  const byYear = new Map(c.years.map((yr) => [yr.y, yr]));
  const hints = c.flags.map((f) => FLAG_INFO[f]?.hint).filter((h): h is string => !!h);
  const dth = "py-1.5 pr-2.5 text-left text-[10px] font-semibold uppercase tracking-[.1em] text-faint";
  const dthn = `${dth} text-right`;
  const dtd = "py-1.5 pr-2.5 text-[12px]";
  const dtdn = `${dtd} tabular text-right whitespace-nowrap`;

  return (
    <div className="border-2 border-[rgba(32,30,29,.4)] bg-[#eae9e9] px-5 py-4">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-[16px] font-extrabold tracking-tight">
          {c.partner} × HS <span className="tabular">{c.cmd}</span> — {c.cmdLabel}
        </h3>
        <button
          onClick={onClose}
          className="shrink-0 border border-[rgba(32,30,29,.4)] px-2 py-1 text-[11px] font-semibold text-muted hover:text-foreground"
        >
          Close
        </button>
      </div>

      <div className="mt-3 grid gap-7 lg:grid-cols-[minmax(320px,420px)_1fr]">
        <div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[rgba(32,30,29,.4)]">
                <th className={dth}>{t("common.year")}</th>
                <th className={dthn}>Partner FOB</th>
                <th className={dthn}>UZB imports</th>
                <th className={dthn}>Signed</th>
              </tr>
            </thead>
            <tbody>
              {years.map((y) => {
                const yr = byYear.get(y);
                return (
                  <tr key={y} className="border-b border-[rgba(32,30,29,.14)]">
                    <td className={`${dtd} tabular`}>{y}</td>
                    {yr ? (
                      <>
                        <td className={dtdn} title={fmtUSDFull(yr.pe)}>{fmtUSD(yr.pe)}</td>
                        <td className={dtdn} title={fmtUSDFull(yr.ui)}>{fmtUSD(yr.ui)}</td>
                        <td className={dtdn} style={{ color: yr.signed >= 0 ? "#ae1800" : "rgba(32,30,29,.7)" }} title={fmtUSDFull(yr.signed)}>
                          {fmtUSD(yr.signed, { sign: true })}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className={dtdn}><MissingValue /></td>
                        <td className={dtdn}><MissingValue /></td>
                        <td className={dtdn}><MissingValue kind="notComparable" /></td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-1.5 text-[11px] text-faint">
            “{t("common.notReported")}” = partner data missing for that year; never treated as a zero gap.
          </p>
        </div>

        <div>
          <div className="lbl">Reading</div>
          <p className="mt-1.5 mb-3.5 text-[13px] leading-[1.55] text-[rgba(32,30,29,.75)]">{interpretation(c, filter)}</p>
          <div className="lbl">Alternative explanations to weigh</div>
          {hints.length > 0 ? (
            <ul className="mt-1.5 flex flex-col gap-1.5 text-[12.5px] leading-normal text-[rgba(32,30,29,.7)]">
              {hints.map((h, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-extrabold text-[#ec3013]" aria-hidden>!</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-[12.5px] leading-normal text-[rgba(32,30,29,.7)]">
              No standard alternative-explanation flags apply; valuation, timing and classification
              differences can still account for part of the discrepancy.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
