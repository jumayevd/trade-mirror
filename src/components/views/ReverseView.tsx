"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { EChartsOption } from "echarts";
import FilterBar from "@/components/FilterBar";
import EChart from "@/components/EChart";
import { Stat, SectionTitle, ContextLine, EvidenceBadge, TransitTag, EmptyState, MissingValue, InfoTip } from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import { aggregate, meta, type Channel, type Filter } from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";
import { fmtUSD, fmtUSDFull, COLORS } from "@/lib/format";
import { baseTooltip, valueAxis, catAxis, baseGrid, baseTextStyle } from "@/lib/echartBase";
import { channelsToCsv, downloadCsv } from "@/lib/export";

const ROWS_STEP = 25;

/** Neutral, non-accusatory explanations for reverse discrepancies (spec §6.11). */
const EXPLANATIONS: { title: string; body: string }[] = [
  {
    title: "Origin vs consignment attribution",
    body: "Uzbekistan records imports by country of origin, while many partners record exports by country of last consignment. Goods produced in country A but shipped via country B appear as an Uzbek import from A with no matching export in A's books — a legitimate reverse discrepancy.",
  },
  {
    title: "Re-export through third countries",
    body: "When goods reach Uzbekistan through a transit or re-export hub, the origin country may record the initial export to the hub rather than to Uzbekistan. The Uzbek import record is then larger than the partner's directly reported export.",
  },
  {
    title: "Partner under-reporting or coverage gaps",
    body: "Some partners report trade sparsely, stopped reporting mid-window, or apply confidentiality suppression to specific commodity lines. A missing or incomplete partner record inflates the reverse side without any real flow difference. Partner data missing for a year is never treated as a zero gap here.",
  },
  {
    title: "Timing differences",
    body: "Shipments departing late in one calendar year and clearing Uzbek customs early in the next are recorded in different reference periods by the two sides, producing offsetting discrepancies in adjacent years.",
  },
  {
    title: "Classification differences",
    body: "The two administrations may classify the same goods under different HS codes (or different revisions of the nomenclature), moving value between chapters and creating paired positive/reverse discrepancies across codes.",
  },
];

const FLAG_LABELS: Record<string, string> = {
  transit: "transit",
  "residual-hs": "residual HS",
  "reporting-stop": "reporting stop",
  "sparse-reporter": "sparse reporter",
  "missing-weight": "no weight data",
  "freight-sensitive": "freight-sensitive",
};

function FlagPills({ c }: { c: Channel }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {c.flags.length === 0 && <span className="text-faint">—</span>}
      {c.flags.map((f) =>
        f === "transit" ? (
          <TransitTag key={f} />
        ) : (
          <span key={f} className="rounded-md bg-[var(--color-panel-2)] px-1.5 py-0.5 text-[11px] text-muted" title={`Quality flag: ${FLAG_LABELS[f] ?? f}`}>
            {FLAG_LABELS[f] ?? f}
          </span>
        ),
      )}
    </span>
  );
}

function ReverseTrendChart({ annual }: { annual: { year: number; positive: number; reverse: number }[] }) {
  const option: EChartsOption = {
    backgroundColor: "transparent",
    textStyle: baseTextStyle,
    grid: baseGrid,
    tooltip: {
      ...baseTooltip(),
      trigger: "axis",
      valueFormatter: (v) => fmtUSDFull(Number(v ?? 0)),
    },
    legend: { top: 4, textStyle: { color: COLORS.text }, itemWidth: 14, itemHeight: 9 },
    xAxis: catAxis(annual.map((a) => a.year)),
    yAxis: valueAxis("USD"),
    series: [
      {
        name: "Reverse discrepancy (UZB > partner)",
        type: "bar",
        data: annual.map((a) => Math.round(a.reverse)),
        itemStyle: { color: COLORS.reverse, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 44,
      },
      {
        name: "Positive discrepancy (partner > UZB), for contrast",
        type: "line",
        data: annual.map((a) => Math.round(a.positive)),
        showSymbol: true,
        symbolSize: 5,
        lineStyle: { color: COLORS.positive, width: 2 },
        itemStyle: { color: COLORS.positive },
      },
    ],
  };
  return <EChart option={option} style={{ height: 320 }} />;
}

export default function ReverseView() {
  const { filter } = useFilter();
  const { t } = useI18n();

  // Local reverse aggregate — the global filter is NOT mutated (spec §6.11).
  const revFilter = useMemo<Filter>(() => ({ ...filter, direction: "reverse" }), [filter]);
  const rev = useMemo(() => aggregate(revFilter), [revFilter]);
  const fullFilter = useMemo<Filter>(
    () => ({ ...revFilter, from: meta.window.start, to: meta.window.end }),
    [revFilter],
  );
  const revSeries = useMemo(() => aggregate(fullFilter), [fullFilter]);

  const ranked = useMemo(() => [...rev.channels6].sort((a, b) => b.revT - a.revT), [rev]);
  const robustCount = useMemo(() => rev.channels6.filter((c) => c.robustness === "robust").length, [rev]);
  const gappyPartners = useMemo(() => meta.partners.filter((p) => p.lapse || p.coverage < 0.5), []);
  const topPartner = rev.partners[0] ?? null;
  const topProduct = ranked[0] ?? null;

  const [rows, setRows] = useState(ROWS_STEP);
  const visible = ranked.slice(0, rows);

  const exportCsv = () => downloadCsv(`reverse-discrepancies-${revFilter.from}-${revFilter.to}.csv`, channelsToCsv(ranked, revFilter));

  return (
    <div className="space-y-8">
      {/* header */}
      <section className="space-y-3">
        <p className="text-xs uppercase tracking-wider text-faint">
          UN Comtrade · {meta.window.start}–{meta.window.end} · reverse-direction screening
        </p>
        <h1 className="max-w-4xl text-2xl font-semibold tracking-tight">Reverse discrepancies: where Uzbekistan records more than partners report</h1>
        <p className="max-w-3xl text-[15px] leading-relaxed text-muted">
          A reverse discrepancy means Uzbekistan&apos;s import record exceeds the partner&apos;s expected
          export (partner exports × (1 + freight)). It is analysed separately from positive discrepancies
          and never netted against them. Reverse discrepancies most often reflect how the two sides
          attribute origin, route goods, or cover their reporting — they are screening signals, not
          evidence of misreporting by either side.
        </p>
        <p className="max-w-3xl rounded-md border-l-2 border-l-[var(--color-reverse)] bg-[var(--color-panel)] px-4 py-2.5 text-sm text-muted">
          <strong className="text-foreground">
            This site never automatically concludes that Uzbekistan over-reports imports.
          </strong>{" "}
          A reverse discrepancy is a statistical asymmetry between two record-keeping systems; the neutral
          explanations below are assessed before any interpretation, and none of the patterns shown here is
          proof of intentional misreporting.
        </p>
      </section>

      <FilterBar />
      <ContextLine filter={revFilter} />

      {/* KPI row (all computed on the local reverse aggregate) */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat
          label={t("kpi.reverse")}
          value={fmtUSD(rev.kpis.reverse)}
          sub={t("kpi.reverse.sub")}
          accent={COLORS.reverse}
          info="Σ max(UZB imports − expected CIF, 0) across comparable channel-years under the current filters. Shown separately — never netted against positive discrepancies."
        />
        <Stat
          label="Robust reverse channels"
          value={String(robustCount)}
          sub="HS6, sign holds at 6–15% freight"
          info="Filtered HS6 channels whose reverse discrepancy keeps its sign across the whole 6–15% freight band, with enough comparable years and no major coverage flags."
        />
        <Stat
          label="Partners with reporting gaps"
          value={String(gappyPartners.length)}
          sub="lapsed or <50% coverage in window"
          info="Partners that stopped reporting mid-window or reported fewer than half of the window years. Their missing years are excluded from comparison — never treated as zero exports — but surviving years can still show artificial reverse discrepancies."
        />
        <Stat
          label="Top partner by reverse"
          value={topPartner ? topPartner.name : "None"}
          sub={topPartner ? `${fmtUSD(topPartner.revT)} in period` : "no comparable observations"}
          accent={topPartner ? COLORS.reverse : undefined}
          info="Partner with the largest total reverse discrepancy under the current filters."
        />
        <Stat
          label="Top product by reverse"
          value={topProduct ? `HS ${topProduct.cmd}` : "None"}
          sub={topProduct ? `${topProduct.cmdLabel.slice(0, 44)} · ${fmtUSD(topProduct.revT)}` : "no comparable observations"}
          accent={topProduct ? COLORS.reverse : undefined}
          info="HS6 product with the largest total reverse discrepancy under the current filters."
        />
      </section>

      {/* trend — full window */}
      <section>
        <SectionTitle
          title="Reverse discrepancy over time"
          desc={`Full ${meta.window.start}–${meta.window.end} window under the current filters (source: UN Comtrade). Blue bars: reverse discrepancy (UZB records > partner). Amber line: positive discrepancy, shown for scale contrast only — the two are never netted.`}
        />
        <ContextLine filter={fullFilter} />
        {revSeries.annual.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="card p-3">
            <ReverseTrendChart annual={revSeries.annual} />
          </div>
        )}
      </section>

      {/* reporting gaps strip — missing data is surfaced, never zeroed */}
      <section className="card p-4">
        <SectionTitle
          title="Partners with missing or lapsed reporting"
          desc="A partner that stops reporting cannot show an export match, so its channels can drift into the reverse (or positive) column for artificial reasons. Missing partner-years are excluded from all totals on this page — they are never treated as a zero gap."
        />
        {gappyPartners.length === 0 ? (
          <p className="text-sm text-muted">All partners in the current window report with sufficient coverage.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {gappyPartners.map((p) => (
              <span key={p.iso3} className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs">
                <Link href={`/partners/${p.iso3.toLowerCase()}`} className="font-medium hover:underline">{p.name}</Link>
                <span className="text-faint">{p.lapse ? `last reported ${p.lastReportedYear}, then` : `${p.reportedYears.length}/${meta.years.length} years, otherwise`}</span>
                <MissingValue />
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ranked table */}
      <section>
        <SectionTitle
          title="Largest reverse channels (HS6)"
          desc="Partner × HS6 channels ranked by total reverse discrepancy in the selected period. Evidence quality and quality flags indicate how comparable the underlying records are before any interpretation is attempted."
          right={
            <button
              onClick={exportCsv}
              className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[13px] font-medium text-muted hover:text-foreground"
              title="Download all ranked rows under the active filters, with data version and methodology in the header."
            >
              {t("common.exportCsv")} ↓
            </button>
          }
        />
        <ContextLine filter={revFilter} />
        {ranked.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="card overflow-x-auto">
            <table className="zebra w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wider text-faint">
                  <th className="px-3 py-2 font-medium">{t("common.partner")}</th>
                  <th className="px-3 py-2 font-medium">{t("common.product")}</th>
                  <th className="px-3 py-2 text-right font-medium">UZB imports (CIF)</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Expected CIF{" "}
                    <InfoTip text={`Partner exports × (1 + ${Math.round(revFilter.cif * 100)}% freight). Compared against Uzbekistan's CIF import record.`} />
                  </th>
                  <th className="px-3 py-2 text-right font-medium" style={{ color: COLORS.reverse }}>Reverse value</th>
                  <th className="px-3 py-2 font-medium">{t("common.evidence")}</th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t("common.persistence")} <InfoTip text="Years with a reverse discrepancy above the noise floor, out of comparable years in the selected period." />
                  </th>
                  <th className="px-3 py-2 font-medium">{t("common.flags")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-soft)]">
                {visible.map((c) => (
                  <tr key={`${c.partnerIso}-${c.cmd}`}>
                    <td className="px-3 py-2">
                      <Link href={`/partners/${c.partnerIso.toLowerCase()}`} className="font-medium hover:underline">{c.partner}</Link>
                    </td>
                    <td className="max-w-[320px] px-3 py-2">
                      <Link href={`/channels/${c.partnerIso.toLowerCase()}/${c.cmd}`} className="hover:underline">
                        <span className="tabular text-xs text-faint">{c.cmd}</span>{" "}
                        <span className="truncate">{c.cmdLabel}</span>
                      </Link>
                    </td>
                    <td className="tabular px-3 py-2 text-right" title={fmtUSDFull(c.uiT)}>{fmtUSD(c.uiT)}</td>
                    <td className="tabular px-3 py-2 text-right" title={fmtUSDFull(c.expectedT)}>
                      {c.peT > 0 ? fmtUSD(c.expectedT) : <MissingValue kind="notComparable" />}
                    </td>
                    <td className="tabular px-3 py-2 text-right font-semibold" style={{ color: COLORS.reverse }} title={fmtUSDFull(c.revT)}>
                      {fmtUSD(c.revT)}
                    </td>
                    <td className="px-3 py-2"><EvidenceBadge score={c.evidence} /></td>
                    <td className="tabular px-3 py-2 text-right" title="Years with a reverse discrepancy / comparable years">
                      {c.revYears}/{c.comparableYears} yr
                    </td>
                    <td className="px-3 py-2"><FlagPills c={c} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between text-xs text-faint">
          <span>
            Showing {Math.min(rows, ranked.length)} of {ranked.length} channels · {t("common.source")} · values in nominal USD
          </span>
          {rows < ranked.length && (
            <button onClick={() => setRows((r) => r + ROWS_STEP)} className="font-medium text-[var(--color-primary)] hover:underline">
              {t("common.showMore")}
            </button>
          )}
        </div>
      </section>

      {/* interpretation panel */}
      <section className="card p-4">
        <SectionTitle
          title="How to read a reverse discrepancy"
          desc="Neutral explanations to rule out before any substantive interpretation. Several typically act at once, and open trade data alone cannot separate their contributions."
        />
        <ul className="grid gap-3 md:grid-cols-2">
          {EXPLANATIONS.map((e) => (
            <li key={e.title} className="rounded-md border border-[var(--color-border-soft)] p-3">
              <div className="text-sm font-semibold">{e.title}</div>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{e.body}</p>
            </li>
          ))}
          <li className="rounded-md border border-[var(--color-border-soft)] bg-[var(--color-panel)] p-3">
            <div className="text-sm font-semibold">What is never concluded here</div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              The site never automatically concludes that Uzbekistan over-reports imports, or that any
              partner under-reports exports. A persistent reverse discrepancy — even a robust one — is a
              statistical screening signal and is not proof of intentional misreporting by either
              administration; confirmation requires declarations, audit or administrative review (evidence
              level 5), which open data cannot provide.
            </p>
          </li>
        </ul>
      </section>
    </div>
  );
}
