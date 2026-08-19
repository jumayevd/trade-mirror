"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import MultiSelect from "@/components/MultiSelect";
import type { SearchOption } from "@/components/SearchSelect";
import YearSelect from "@/components/YearSelect";
import { EmptyState, InfoTip, SectionTitle, Segmented } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { fmtUSDFull, COLORS } from "@/lib/format";
import { hsFullText } from "@/lib/dataset";
import { fmtNum } from "@/lib/format";
import {
  ensureQuantity, quantityFailed, quantityMonths, quantityPartners, quantityReady,
  quantityCoverage, quantityRows, quantityVer, quantityYears, subscribeQuantity,
  QUANTITY_FLOOR, QUANTITY_FREIGHT,
  type QuantityBasis, type QuantityRow,
} from "@/lib/quantity";

/** Series-identity dot for column headers — the text itself stays ink (rule 5). */
function HeadDot({ color }: { color: string }) {
  return (
    <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: color }} />
  );
}

/**
 * Quantity & Price Analysis — HS6 only, and only where both books report the
 * same line, month, partner and quantity unit. Unit price is Σ value ÷ Σ
 * quantity over the selected periods, so a yearly price is weighted by how much
 * actually moved rather than being an average of monthly ratios.
 *
 * Text runs a step larger than the rest of the dashboard: this table is read
 * across nine numeric columns rather than scanned for a rank.
 */

const PAGE_SIZES = [25, 50, 100];
type SortDir = "desc" | "asc";

/** Quantities span grams to millions of units, so precision follows magnitude. */
function fmtQty(v: number): string {
  if (v >= 1000) return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);
  if (v >= 1) return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(v);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(v);
}

/** Unit prices run from fractions of a cent to five figures. */
function fmtPrice(v: number): string {
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 0 : abs >= 1 ? 2 : 4;
  return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v)}`;
}

/** Month numbers as contiguous named runs: [1..10] -> "January–October". */
function monthRuns(months: number[], name: (m: number) => string): string {
  const runs: string[] = [];
  let start = months[0];
  let prev = months[0];
  for (const m of months.slice(1)) {
    if (m === prev + 1) { prev = m; continue; }
    runs.push(start === prev ? name(start) : `${name(start)}–${name(prev)}`);
    start = prev = m;
  }
  runs.push(start === prev ? name(start) : `${name(start)}–${name(prev)}`);
  return runs.join(", ");
}

function fmtSignedPrice(v: number): string {
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtPrice(Math.abs(v))}`;
}

export default function QuantityView() {
  const { t, lang } = useI18n();
  const ver = useSyncExternalStore(subscribeQuantity, quantityVer, () => 0);
  useEffect(() => { ensureQuantity(); }, []);

  const [basis, setBasis] = useState<QuantityBasis>("year");
  const [years, setYears] = useState<number[]>([]);
  const [months, setMonths] = useState<number[]>([]);
  const [partners, setPartners] = useState<string[]>([]);
  const [dir, setDir] = useState<SortDir>("desc");
  const [pageSize, setPageSize] = useState(25);
  const [pageRaw, setPageRaw] = useState(0);

  const ready = quantityReady();
  const failed = quantityFailed();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const availableYears = useMemo(() => quantityYears(), [ver]);

  // The latest year is the default, but the payload arrives after first paint —
  // seed once, and never fight the user's later selection.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || availableYears.length === 0) return;
    seeded.current = true;
    setYears([availableYears[availableYears.length - 1]]);
  }, [availableYears]);

  const availableMonths = useMemo(
    () => (basis === "month" ? quantityMonths(years) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [basis, years, ver],
  );

  const partnerOptions = useMemo<SearchOption[]>(
    () => quantityPartners().map((p) => ({ value: p.iso, code: p.iso, label: p.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ver, lang],
  );

  const monthOptions = useMemo<SearchOption[]>(
    () => availableMonths.map((m) => ({ value: String(m), label: t(`month.${m}` as never) })),
    [availableMonths, t],
  );

  /**
   * Years in the selection that do not carry twelve months. A yearly total for
   * one of these covers less of the year, so the view says so rather than
   * letting it read as a full-year figure beside the complete ones.
   */
  const partialYears = useMemo(() => {
    if (basis !== "year" || !ready) return [];
    const cover = quantityCoverage();
    return years
      .map((y) => ({ year: y, months: cover.get(y) ?? [] }))
      .filter((e) => e.months.length > 0 && e.months.length < 12)
      .sort((a, b) => a.year - b.year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basis, years, ready, ver]);

  const rows = useMemo<QuantityRow[]>(() => {
    if (!ready || years.length === 0) return [];
    const out = quantityRows({ basis, years, months, partners });
    out.sort((a, b) => (dir === "desc" ? b.diff - a.diff : a.diff - b.diff));
    return out;
    // Language is a real input: partner and product names are resolved here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ver, basis, years, months, partners, dir, lang]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(pageRaw, pageCount - 1);
  const start = page * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  const reset = (patch: () => void) => { patch(); setPageRaw(0); };

  const pickBasis = (b: QuantityBasis) => {
    if (b === basis) return;
    reset(() => { setBasis(b); setMonths([]); });
  };

  // same cell scale as the ranked-components table, so the two read as one system
  const th = "px-3 py-1.5 text-left text-[10.5px] font-medium text-faint whitespace-nowrap";
  const thNum = `${th} text-right`;
  const td = "px-3 py-1.5 align-middle text-[13px]";
  const tdNum = `${td} tabular text-right whitespace-nowrap`;

  return (
    <div className="space-y-6">
      {/* header */}
      <section className="space-y-1.5">
        <p className="text-[10.5px] font-medium text-faint">
          UN Comtrade · {t("qty.header.kicker")}
        </p>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("nav.quantity")}</h1>
        <p className="max-w-3xl text-[13px] leading-relaxed text-muted">
          {t("qty.intro")}{" "}
          <Link href="/methodology" className="font-medium text-[var(--color-primary)] hover:underline">
            {t("nav.methodology")} →
          </Link>
        </p>
      </section>

      {/* controls */}
      <section className="no-print flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">{t("filter.granularity")}</span>
          <Segmented<QuantityBasis>
            ariaLabel={t("filter.granularity")}
            value={basis}
            onChange={pickBasis}
            options={[
              { key: "year", label: t("gran.year") },
              { key: "month", label: t("gran.month") },
            ]}
          />
        </div>

        <YearSelect
          years={years}
          onChange={(v) => reset(() => setYears(v))}
          label={t("qty.filter.year")}
          available={availableYears}
        />

        {basis === "month" && (
          <MultiSelect
            values={months.map(String)}
            onChange={(v) => reset(() => setMonths(v.map(Number).sort((a, b) => a - b)))}
            options={monthOptions}
            label={t("filter.months")}
            allLabel={t("filter.allMonths")}
            searchable={false}
          />
        )}

        <MultiSelect
          values={partners}
          onChange={(v) => reset(() => setPartners(v))}
          options={partnerOptions}
          label={t("common.partner")}
          allLabel={t("filter.all")}
        />

        <label className="flex items-center gap-1.5 text-[12px] text-muted">
          {t("qty.sortLabel")}
          <select
            value={dir}
            onChange={(e) => reset(() => setDir(e.target.value as SortDir))}
            aria-label={t("risk.sortDir")}
            title={t("risk.sortDir")}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1 text-[12px] text-foreground outline-none focus:border-[var(--color-primary)]"
          >
            <option value="desc">{t("risk.sortDesc")}</option>
            <option value="asc">{t("risk.sortAsc")}</option>
          </select>
        </label>

        <span className="tabular text-[12px] text-faint" title={`${t("qty.floor.tip")} $${fmtNum(QUANTITY_FLOOR)}.`}>
          {rows.length === 0
            ? `0 ${t("qty.rowsCount")}`
            : `${(start + 1).toLocaleString()}–${Math.min(start + pageSize, rows.length).toLocaleString()} / ${rows.length.toLocaleString()} ${t("qty.rowsCount")}`}
        </span>
      </section>

      {/* table */}
      <section className="space-y-3">
        <SectionTitle
          title={t("qty.table.title")}
          desc={t("qty.table.desc")}
          right={<InfoTip text={t("qty.table.info")} />}
        />

        {partialYears.length > 0 && (
          <p className="max-w-3xl text-xs leading-relaxed text-faint">
            <span className="font-medium text-muted">{t("qty.partial.lead")}</span>{" "}
            {partialYears
              .map((e) => `${e.year} — ${e.months.length}/12 (${monthRuns(e.months, (m) => t(`month.${m}` as never))})`)
              .join("; ")}
            . {t("qty.partial.note")}
          </p>
        )}

        {failed ? (
          <EmptyState text={t("qty.loadFailed")} />
        ) : !ready ? (
          <p className="card p-4 text-[13px] text-muted">{t("qty.loading")}</p>
        ) : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse">
              <thead className="border-b border-[var(--color-border)]">
                <tr>
                  <th className={th}>{t("common.partner")}</th>
                  <th className={th}>{t("risk.th.hsCode")}</th>
                  <th className={th}>{t("common.product")}</th>
                  <th className={thNum}>{t("qty.th.importQty")}</th>
                  <th className={thNum}>{t("qty.th.exportQty")}</th>
                  <th className={th}>{t("qty.th.unit")}</th>
                  <th className={thNum}>{t("qty.th.importPrice")}</th>
                  <th className={thNum} title={`${t("qty.tip.exportPrice")} ${Math.round(QUANTITY_FREIGHT * 100)}%.`}>{t("qty.th.exportPrice")}</th>
                  <th className={thNum}><HeadDot color={COLORS.positive} />{t("qty.th.diff")}</th>
                </tr>
              </thead>
              <tbody className="zebra">
                {pageRows.map((r) => (
                  <tr key={r.key} className="border-b border-[var(--color-border-soft)] last:border-0 hover:bg-[color-mix(in_srgb,var(--color-primary)_4%,transparent)]">
                    <td className={`${td} whitespace-nowrap`}>
                      <Link href={`/partners/${r.partnerIso.toLowerCase()}`} className="font-medium hover:underline">
                        {r.partner}
                      </Link>
                    </td>
                    <td className={`${td} tabular`}>{r.cmd}</td>
                    <td className={`${td} max-w-[280px]`}>
                      {/* the column is narrow, so the cell abbreviates; hover carries the
                          complete nomenclature line, not the extract's truncated description */}
                      <span title={hsFullText(r.cmd) ?? r.product}>
                        {r.product.length > 44 ? `${r.product.slice(0, 44)}…` : r.product}
                      </span>
                    </td>
                    <td className={tdNum} title={fmtUSDFull(r.impValue)}>{fmtQty(r.impQty)}</td>
                    <td className={tdNum} title={fmtUSDFull(r.expValue)}>{fmtQty(r.expQty)}</td>
                    <td className={`${td} whitespace-nowrap`}>{r.unit}</td>
                    <td className={tdNum}>{fmtPrice(r.impPrice)}</td>
                    <td className={tdNum}>{fmtPrice(r.expPrice)}</td>
                    <td
                      className={`${tdNum} font-semibold`}
                      style={{ color: r.diff > 0 ? COLORS.positive : r.diff < 0 ? COLORS.reverse : undefined }}
                    >
                      {fmtSignedPrice(r.diff)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* pagination */}
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-[12px] text-muted">
              {t("risk.rowsPerPage")}
              <select
                value={pageSize}
                onChange={(e) => reset(() => setPageSize(+e.target.value))}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1 text-[12px] text-foreground outline-none focus:border-[var(--color-primary)]"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setPageRaw(Math.max(0, page - 1))}
                disabled={page === 0}
                className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[13px] text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← {t("risk.prev")}
              </button>
              <span className="tabular text-[13px] text-muted">
                {t("risk.page")} {page + 1} / {pageCount}
              </span>
              <button
                onClick={() => setPageRaw(Math.min(pageCount - 1, page + 1))}
                disabled={page >= pageCount - 1}
                className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[13px] text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("risk.next")} →
              </button>
            </div>
          </div>
        )}

        <p className="max-w-3xl text-xs leading-relaxed text-faint">{t("qty.footnote")}</p>
      </section>
    </div>
  );
}
