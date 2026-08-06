"use client";

import { useMemo } from "react";
import Link from "next/link";
import FilterBar from "@/components/FilterBar";
import Sparkline from "@/components/charts/Sparkline";
import TrendChart from "@/components/charts/TrendChart";
import { ClassBadge, ContextLine, EmptyState, SectionTitle, TransitTag } from "@/components/ui";
import { meta, DIRECTION_LABELS, type Filter } from "@/lib/dataset";
import { channelsToCsv, downloadCsv } from "@/lib/export";
import { useFilter } from "@/lib/filter-context";
import { COLORS, fmtUSD, fmtUSDFull } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

const RISING = COLORS.positive; // amber — a widening discrepancy is an anomaly signal, never red
const FALLING = COLORS.ok; // green — a closing discrepancy

interface MoverRowData {
  key: string;
  label: string;
  total: number;
  trend: number;
  series: { y: number; v: number }[];
  href?: string;
}

function MoverList({ title, note, rows, rising }: { title: string; note: string; rows: MoverRowData[]; rising: boolean }) {
  const color = rising ? RISING : FALLING;
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold" style={{ color }}>
        {rising ? "▲ Rising" : "▼ Falling"} — {title}
      </h3>
      <p className="mb-2 text-xs text-muted">{note}</p>
      {rows.length === 0 ? (
        <p className="card p-4 text-sm text-muted">No {rising ? "rising" : "falling"} entries under the current filters.</p>
      ) : (
        <div className="card zebra divide-y divide-[var(--color-border-soft)]">
          {rows.map((r) => {
            const inner = (
              <div className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.label}</div>
                  <div className="tabular text-xs text-faint" title={fmtUSDFull(r.total)}>
                    {fmtUSD(r.total)} over reported years
                  </div>
                </div>
                <Sparkline data={r.series.map((s) => Math.round(s.v))} color={color} type="line" />
                <span
                  className="tabular w-24 shrink-0 text-right text-sm font-medium"
                  style={{ color }}
                  title={`Trend: mean of recent reported years minus mean of early ones (${fmtUSDFull(r.trend)}/yr).`}
                >
                  {rising ? "▲" : "▼"} {fmtUSD(Math.abs(r.trend))}
                </span>
              </div>
            );
            return r.href ? (
              <Link key={r.key} href={r.href} className="block hover:bg-[var(--color-panel-2)]">
                {inner}
              </Link>
            ) : (
              <div key={r.key}>{inner}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TrendsView() {
  const { filter, series } = useFilter();
  const { t } = useI18n();

  // trends ALWAYS use the full window — the same filters re-applied over 2017–2024
  const fullFilter = useMemo<Filter>(
    () => ({ ...filter, from: meta.window.start, to: meta.window.end }),
    [filter],
  );
  const snapshot = filter.from === filter.to;

  const goods: MoverRowData[] = series.movers.goods.map((g) => ({
    key: g.key,
    label: `${g.key} · ${g.label}`,
    total: g.total,
    trend: g.trend,
    series: g.series,
  }));
  const countries: MoverRowData[] = series.movers.countries.map((c) => ({
    key: c.key,
    label: c.label,
    total: c.total,
    trend: c.trend,
    series: c.series,
    href: `/partners/${c.iso3.toLowerCase()}`,
  }));
  const risingGoods = goods.filter((g) => g.trend > 0).sort((a, b) => b.trend - a.trend).slice(0, 8);
  const fallingGoods = goods.filter((g) => g.trend < 0).sort((a, b) => a.trend - b.trend).slice(0, 8);
  const risingCountries = countries.filter((c) => c.trend > 0).sort((a, b) => b.trend - a.trend).slice(0, 8);
  const fallingCountries = countries.filter((c) => c.trend < 0).sort((a, b) => a.trend - b.trend).slice(0, 8);

  const persistent = useMemo(
    () =>
      series.channels6
        .filter((c) => c.comparableYears >= 3)
        .sort(
          (a, b) =>
            b.longestPosStreak - a.longestPosStreak ||
            b.posYears / b.comparableYears - a.posYears / a.comparableYears ||
            b.posT - a.posT,
        ),
    [series],
  );
  const persistentShown = persistent.slice(0, 30);

  const th = "px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-faint whitespace-nowrap";
  const thNum = `${th} text-right`;
  const td = "px-2 py-2 align-middle text-[13px]";
  const tdNum = `${td} tabular text-right whitespace-nowrap`;

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("nav.trends")}</h1>
        <p className="max-w-3xl text-[15px] leading-relaxed text-muted">
          How the residual unexplained discrepancy evolves over time. To keep trends comparable, every
          block on this page is computed over the full {meta.window.start}–{meta.window.end} window —
          the period filter selects the snapshot used on ranking pages, but never truncates the series
          shown here. A rising trend is a screening signal to examine, not proof of under-declaration
          or any other wrongdoing; a falling trend is not by itself proof of improvement.
        </p>
      </section>

      <FilterBar showMateriality />
      <ContextLine filter={fullFilter} />

      {snapshot && (
        <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-2.5 text-sm text-muted">
          <strong className="text-foreground">Snapshot vs. trend:</strong> the ranking pages currently
          show the {filter.from} snapshot, while this page always computes over the full{" "}
          {meta.window.start}–{meta.window.end} window. Numbers here will not match single-year pages —
          by design.
        </p>
      )}

      {/* 1. annual overview */}
      <section>
        <SectionTitle
          title="Annual overview"
          desc={`Positive and reverse discrepancies per year under the current filters (direction filter does not net them), full ${meta.window.start}–${meta.window.end} window. The comparable-partner line shows how much of each year's movement can be a coverage effect. Source: UN Comtrade.`}
        />
        <div className="card p-4">
          <TrendChart annual={series.annual} height={340} />
        </div>
      </section>

      {/* 2. rising / falling movers */}
      <section>
        <SectionTitle
          title="Rising and falling"
          desc={`Trend = mean of recent reported years minus mean of early ones, on the active direction (${DIRECTION_LABELS[filter.direction]}). Amber ▲ = widening; green ▼ = narrowing. Both are statistical movements, not attributions of cause.`}
        />
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-6">
            <MoverList
              title="goods (HS2 chapters)"
              note="Chapters whose discrepancy is widening fastest across the window."
              rows={risingGoods}
              rising
            />
            <MoverList
              title="goods (HS2 chapters)"
              note="Chapters whose discrepancy is narrowing. Valuation, classification or reporting changes can drive this as much as real flows."
              rows={fallingGoods}
              rising={false}
            />
          </div>
          <div className="space-y-6">
            <MoverList
              title="partner countries"
              note="Partners whose discrepancy is widening fastest across the window."
              rows={risingCountries}
              rising
            />
            <MoverList
              title="partner countries"
              note="Partners whose discrepancy is narrowing across reported years."
              rows={fallingCountries}
              rising={false}
            />
          </div>
        </div>
        <p className="mt-3 max-w-3xl text-xs text-faint">
          Partners that stopped reporting to Comtrade during the window (e.g. after 2021) are excluded
          from these lists: a reporting stop removes the mirror rather than closing the gap, so it is a
          data-coverage artifact — not an improvement and not a deterioration. Trends use reported
          partner-years only; missing years are never treated as zero flows.
        </p>
      </section>

      {/* 3. persistent channels */}
      <section>
        <SectionTitle
          title="Persistent channels"
          desc="HS6 channels with at least 3 comparable years, ranked by the longest consecutive run of positive-discrepancy years. Persistence makes a random or one-off statistical artifact less likely, but it remains a screening signal — it is not proof of intentional misreporting."
          right={
            <button
              onClick={() => downloadCsv("trends-persistent-channels.csv", channelsToCsv(persistent, fullFilter))}
              disabled={persistent.length === 0}
              className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[13px] font-medium text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              title="Download every persistent channel under the current filters with the calculation context in the header."
            >
              {t("common.exportCsv")} ↓
            </button>
          }
        />
        {persistent.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[880px] border-collapse">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>
                    <th className={th}>Class</th>
                    <th className={th}>{t("common.partner")}</th>
                    <th className={th}>HS6 · {t("common.product")}</th>
                    <th className={thNum} title="Longest consecutive run of years with a positive discrepancy (partner > UZB records).">Streak</th>
                    <th className={thNum} title="Years with a positive discrepancy out of comparable years in the window.">Pos / comp. yrs</th>
                    <th className={thNum} title="Positive discrepancy accumulated over the full window (never netted against reverse years).">Positive total</th>
                  </tr>
                </thead>
                <tbody className="zebra">
                  {persistentShown.map((c) => (
                    <tr key={`${c.partnerIso}-${c.cmd}`} className="border-b border-[var(--color-border-soft)] hover:bg-[color-mix(in_srgb,var(--color-primary)_4%,transparent)]">
                      <td className={td}><ClassBadge cls={c.cls} /></td>
                      <td className={`${td} whitespace-nowrap`}>
                        <Link href={`/partners/${c.partnerIso.toLowerCase()}`} className="font-medium hover:underline">
                          {c.partner}
                        </Link>{" "}
                        {c.transit && <TransitTag />}
                      </td>
                      <td className={`${td} max-w-[320px]`}>
                        <span className="tabular mr-1.5 text-xs text-faint">{c.cmd}</span>
                        <Link href={`/channels/${c.partnerIso.toLowerCase()}/${c.cmd}`} className="hover:underline" title={c.cmdLabel}>
                          {c.cmdLabel.length > 52 ? `${c.cmdLabel.slice(0, 52)}…` : c.cmdLabel}
                        </Link>
                      </td>
                      <td className={tdNum} title={`Longest consecutive positive streak: ${c.longestPosStreak} year${c.longestPosStreak === 1 ? "" : "s"}.`}>
                        {c.longestPosStreak} yr
                      </td>
                      <td className={tdNum}>{c.posYears}/{c.comparableYears}</td>
                      <td className={tdNum} style={{ color: COLORS.positive }} title={fmtUSDFull(c.posT)}>
                        {fmtUSD(c.posT)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-faint">
              Showing the top {persistentShown.length.toLocaleString()} of {persistent.length.toLocaleString()} channels
              with ≥3 comparable years; the CSV export contains all of them. Comparable years count only
              years where both sides reported — missing partner-years are excluded, never treated as zero.{" "}
              {t("common.source")}.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
