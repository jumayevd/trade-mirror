"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { QualityTag, TransitTag, EmptyState } from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import { products, meta, categoryLabel, isResidualChapter, DATA_VERSION, METHODOLOGY_VERSION, type Tier } from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";
import { fmtUSD, fmtUSDFull, fmtPct, COLORS } from "@/lib/format";

const ROWS_STEP = 40;

const confTier = (share: number): Tier => (share >= 0.7 ? "High" : share >= 0.4 ? "Medium" : "Low");

/**
 * HS6 products (spec §6.8): individual 6-digit lines ranked by cumulative
 * positive gap. Product figures come from the full-window product file — they
 * approximate the residual positive discrepancy per product and do NOT respond
 * to the period/direction/stage filters (category does apply).
 */
export default function ProductsView() {
  const { filter, patch } = useFilter();
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(ROWS_STEP);

  const ranked = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products
      .filter((p) => {
        if (filter.category !== "all" && p.category !== filter.category) return false;
        if (needle && !`${p.cmd} ${p.label} ${p.chapterLabel}`.toLowerCase().includes(needle)) return false;
        return true;
      })
      .sort((a, b) => b.positiveGap - a.positiveGap);
  }, [q, filter.category]);

  const visible = ranked.slice(0, rows);
  const cifPct = Math.round(meta.cif.central * 100);

  return (
    <div className="space-y-6">
      {/* header */}
      <section className="space-y-3">
        <p className="text-xs uppercase tracking-wider text-faint">
          UN Comtrade · {meta.window.start}–{meta.window.end} · product-level screening
        </p>
        <h1 className="max-w-4xl text-2xl font-semibold tracking-tight">HS6 products: 6-digit lines behind the sector totals</h1>
        <p className="max-w-3xl text-[15px] leading-relaxed text-muted">
          Individual HS6 lines ranked by their cumulative positive gap (partner-reported exports above
          Uzbekistan&apos;s import records after the central freight adjustment). A product-level gap is a
          statistical screening signal — legitimate causes include freight valuation, transit routing,
          classification and reporting differences — and is not proof of under-declaration or smuggling.
          Open a profile for the per-country breakdown and signal classification.
        </p>
      </section>

      {/* fixed context strip — this page uses the full-window product file, not the interactive period */}
      <p
        className="rounded-md bg-[var(--color-panel-2)] px-3 py-1.5 font-mono text-[11px] text-muted"
        title="Product figures are precomputed over the full window and do not respond to the period, direction, stage, view or freight filters. The category filter does apply."
      >
        {meta.window.start}–{meta.window.end} (full window, cumulative) | Positive gap (partner &gt; UZB) | Freight {cifPct}% (central) | Data
        version {DATA_VERSION} | Methodology v{METHODOLOGY_VERSION}
      </p>

      {/* controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setRows(ROWS_STEP); }}
          placeholder="Search by HS6 code or product name…"
          aria-label="Search products"
          className="w-72 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1.5 text-sm outline-none placeholder:text-faint focus:border-[var(--color-primary)]"
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          {t("filter.category")}
          <select
            value={filter.category}
            onChange={(e) => { patch({ category: e.target.value, hs2: "all" }); setRows(ROWS_STEP); }}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1.5 text-[13px] text-foreground outline-none focus:border-[var(--color-primary)]"
          >
            <option value="all">{t("filter.all")}</option>
            {meta.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        <span className="ml-auto text-xs text-faint">{ranked.length} products</span>
      </div>

      {/* ranked table */}
      {ranked.length === 0 ? (
        <EmptyState text="No products match the search and category selection." />
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="zebra w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wider text-faint">
                  <th className="px-3 py-2 font-medium">HS6</th>
                  <th className="px-3 py-2 font-medium">{t("common.product")}</th>
                  <th className="px-3 py-2 font-medium">Chapter</th>
                  <th className="px-3 py-2 text-right font-medium" style={{ color: COLORS.positive }}>Positive gap</th>
                  <th className="px-3 py-2 font-medium">Top partner</th>
                  <th className="px-3 py-2 font-medium">Weight data</th>
                  <th className="px-3 py-2 font-medium">Reporter quality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-soft)]">
                {visible.map((p) => (
                  <tr key={p.cmd}>
                    <td className="tabular px-3 py-2 text-xs text-faint">{p.cmd}</td>
                    <td className="max-w-[320px] px-3 py-2">
                      <Link href={`/products/${p.cmd}`} className="font-medium hover:underline">{p.label}</Link>
                      {isResidualChapter(p.chapter) && (
                        <span
                          className="ml-2 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ color: COLORS.transit, background: "color-mix(in srgb, var(--color-transit) 10%, transparent)" }}
                          title="Residual HS category — gaps here are substantially classification artifacts; shown for transparency only."
                        >
                          residual
                        </span>
                      )}
                      {p.transitShare >= 0.4 && (
                        <span className="ml-2 inline-block align-middle" title={`${fmtPct(p.transitShare)} of this product's gap runs through transit/re-export hubs.`}>
                          <TransitTag />
                        </span>
                      )}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-xs text-muted" title={`HS ${p.chapter} · ${p.chapterLabel} · ${categoryLabel(p.category)}`}>
                      <span className="tabular text-faint">{p.chapter}</span> {p.chapterLabel}
                    </td>
                    <td className="tabular px-3 py-2 text-right font-semibold" style={{ color: COLORS.positive }} title={`${fmtUSDFull(p.positiveGap)} · partners reported ${fmtUSD(p.ptnExp)} vs ${fmtUSD(p.uzbImp)} recorded`}>
                      {fmtUSD(p.positiveGap)}
                    </td>
                    <td className="px-3 py-2">
                      {p.partners[0] ? (
                        <Link href={`/partners/${p.partners[0].iso3.toLowerCase()}`} className="hover:underline">{p.partners[0].name}</Link>
                      ) : (
                        <span className="text-faint" title="No partner channel above the materiality threshold for this product.">none above threshold</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {p.uv ? (
                        <span style={{ color: "var(--color-quality)" }} title={`Net weight reported on both sides in ${p.uv.years} year${p.uv.years === 1 ? "" : "s"} — unit-value checks available.`}>
                          yes · {p.uv.years} yr{p.uv.years === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <span className="text-faint" title="No year has net weight on both sides — price vs volume effects cannot be separated. A data limitation, not a zero.">
                          no dual-sided weight
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <QualityTag
                        tier={confTier(p.highConfShare)}
                        tip={`${fmtPct(p.highConfShare, 0)} of this product's gap comes from partners with complete, consistent Comtrade reporting (High ≥ 70%, Medium ≥ 40%).`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-faint">
            <span>
              Showing {Math.min(rows, ranked.length)} of {ranked.length} products · {t("common.source")} · cumulative
              {" "}{meta.window.start}–{meta.window.end}, nominal USD at the central {cifPct}% freight assumption
            </span>
            {rows < ranked.length && (
              <button onClick={() => setRows((r) => r + ROWS_STEP)} className="font-medium text-[var(--color-primary)] hover:underline">
                {t("common.showMore")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
