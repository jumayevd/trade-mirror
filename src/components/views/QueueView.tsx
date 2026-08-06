"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import FilterBar from "@/components/FilterBar";
import QueueTable, { LEVEL_LABELS, type HsLevel } from "@/components/QueueTable";
import RiskMatrix from "@/components/charts/RiskMatrix";
import { ContextLine, InfoTip, SectionTitle, Stat } from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import { useI18n } from "@/lib/i18n";
import { channelsToCsv, downloadCsv } from "@/lib/export";
import { fmtNum, fmtPct, fmtUSD } from "@/lib/format";
import { meta, type Channel } from "@/lib/dataset";

/**
 * Discrepancy & Risk — the central screening page. Combines the analytic risk
 * matrix (anomaly × evidence) with a ranked table of ALL partner × code
 * combinations at the selected HS level. Every row and bubble is a statistical
 * screening signal — a priority for further review, never a finding of wrongdoing.
 */
export default function QueueView() {
  const { data, filter } = useFilter();
  const { t } = useI18n();
  const [level, setLevel] = useState<HsLevel>(2);

  // combinations at the ACTIVE level, already filtered by the engine
  const channels: Channel[] = level === 2 ? data.channels : level === 4 ? data.channels4 : data.channels6;

  const stats = useMemo(() => {
    const investigate = channels.filter((c) => c.cls === "investigate").length;
    const partners = new Set(channels.map((c) => c.partnerIso)).size;
    const sorted = [...channels].sort((a, b) => Math.abs(b.primary) - Math.abs(a.primary));
    const total = sorted.reduce((s, c) => s + Math.abs(c.primary), 0);
    const top5 = sorted.slice(0, 5).reduce((s, c) => s + Math.abs(c.primary), 0);
    const dirTotal = sorted.reduce((s, c) => s + c.primary, 0);
    return { investigate, partners, top5Share: total > 0 ? top5 / total : 0, dirTotal };
  }, [channels]);

  const exportCsv = () =>
    downloadCsv(`discrepancy-risk-hs${level}.csv`, channelsToCsv(channels, filter));

  return (
    <div className="space-y-8">
      {/* header */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-faint">
              UN Comtrade · {meta.window.start}–{meta.window.end} · mirror-statistics screening
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{t("nav.queue")}</h1>
            <p className="max-w-3xl text-[15px] leading-relaxed text-muted">
              Transparent analytical components for prioritizing additional review.
            </p>
          </div>
          <button
            onClick={exportCsv}
            disabled={channels.length === 0}
            className="no-print rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[13px] font-medium text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            title={`Download every ${LEVEL_LABELS[level]} partner × code combination under the current filters, with the calculation context in the header.`}
          >
            {t("common.exportCsv")} ↓
          </button>
        </div>
        <p className="max-w-3xl text-[13px] leading-relaxed text-muted">
          Each row pairs a residual unexplained discrepancy with the components behind its
          ranking — anomaly strength, evidence quality, persistence and robustness. These are
          screening signals for statistical or customs review, not proof of smuggling, fraud
          or under-declaration.
        </p>
      </section>

      <FilterBar showMateriality />
      <ContextLine filter={filter} />
      <p className="-mt-4 max-w-3xl text-xs text-faint">
        Default materiality is <strong className="text-foreground">0</strong> — all partner × code
        combinations under the current filters are shown. Raise the materiality floor in the filter
        bar to focus on economically meaningful discrepancies.
      </p>

      {/* 1. analytical significance */}
      <section>
        <SectionTitle
          title="Analytical significance"
          desc={`Every ${LEVEL_LABELS[level]} combination positioned by evidence quality (x) and anomaly strength (y); bubble area is proportional to the discrepancy in the active direction, colour is the signal class. Quadrant guides mirror the classification thresholds (E 60, A 55) documented in the Methodology.`}
        />
        <RiskMatrix channels={channels} filter={filter} />
      </section>

      {/* 2. ranked analytical components */}
      <section>
        <SectionTitle
          title="Ranked analytical components"
          desc={`All partner × code combinations at the selected HS level under the current filters, ranked by signal class, anomaly strength and evidence quality. HS4 is derived from HS6 by code truncation. Click a row to expand per-year detail.`}
        />

        <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Combinations"
            value={fmtNum(channels.length)}
            sub={`${LEVEL_LABELS[level]} partner × code combinations under current filters`}
            info="Count of partner × code combinations at the selected HS level that pass the active period, stage, view, signal-class, robustness and materiality filters."
          />
          <Stat
            label="Investigate class"
            value={fmtNum(stats.investigate)}
            sub={`of ${fmtNum(channels.length)} combinations`}
            accent={stats.investigate > 0 ? "#dc2626" : undefined}
            info="Combinations with high anomaly strength AND high evidence quality — the strongest open-data signals. A priority for further review, not a finding of wrongdoing."
          />
          <Stat
            label={t("common.partner") + "s"}
            value={fmtNum(stats.partners)}
            sub="distinct partners represented"
            info="Number of distinct partner countries appearing in the combinations below."
          />
          <Stat
            label="Top-5 share"
            value={fmtPct(stats.top5Share, 0)}
            sub={`of ${fmtUSD(Math.abs(stats.dirTotal))} in the active direction`}
            info="Share of the total discrepancy (active direction) carried by the five largest combinations at this level. High concentration means a handful of combinations drive the aggregate — verify those first."
          />
        </div>

        <QueueTable
          channels={channels}
          level={level}
          onLevelChange={setLevel}
          filter={filter}
          years={data.years}
        />
      </section>

      {/* footer note */}
      <p className="flex max-w-3xl items-start gap-2 text-xs text-faint">
        <InfoTip text="Ranking order: signal class, then anomaly strength, then evidence quality, then discrepancy size." />
        <span>
          The composite ranking blends anomaly strength and evidence quality; it is a screening
          heuristic for ordering additional review — not a measure of likelihood or wrongdoing.
          Score definitions, weights and classification thresholds are documented in the{" "}
          <Link href="/methodology" className="underline hover:text-foreground">Methodology</Link>.
        </span>
      </p>
    </div>
  );
}
