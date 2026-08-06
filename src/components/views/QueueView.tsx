"use client";

import FilterBar from "@/components/FilterBar";
import QueueTable from "@/components/QueueTable";
import { ContextLine, InfoTip } from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import { useI18n } from "@/lib/i18n";
import { fmtNum, fmtPct } from "@/lib/format";

/**
 * Investigation Queue (spec §6.4) — the central working table. Ranks
 * country × HS channels by class, anomaly strength and evidence quality
 * under the active filters. Every row is a statistical screening signal —
 * a priority for further review, never a finding of wrongdoing.
 */
export default function QueueView() {
  const { data, filter } = useFilter();
  const { t } = useI18n();
  const k = data.kpis;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-faint">
          Investigate · screening queue
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{t("nav.queue")}</h1>
        <p className="max-w-3xl text-[15px] leading-relaxed text-muted">
          All comparable country × HS channels under the current filters, ranked by signal
          class, anomaly strength and evidence quality. A residual unexplained discrepancy
          is a screening signal for statistical or customs review — it is not proof of
          smuggling, fraud or under-declaration. Tip: setting the materiality floor to{" "}
          <strong className="text-foreground">$1M</strong> in the filter bar focuses the
          queue on economically meaningful signals.
        </p>
      </section>

      <FilterBar showMateriality />
      <ContextLine filter={filter} />

      {/* concentration strip */}
      <section className="card flex flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-faint">
            Top-5 share
          </span>
          <span className="tabular text-lg font-semibold">{fmtPct(k.top5Share, 0)}</span>
          <InfoTip text="Share of the total discrepancy (active direction) carried by the five largest channels under the current filters. High concentration means a handful of channels drive the aggregate number." />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-faint">
            HHI
          </span>
          <span className="tabular text-lg font-semibold">{fmtNum(k.hhi)}</span>
          <InfoTip text="Herfindahl–Hirschman index of channel concentration (0–10,000). Above ~2,500 the discrepancy is highly concentrated: verify the few dominant channels first, since a single data issue there would move the aggregate." />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-faint">
            Channels
          </span>
          <span className="tabular text-lg font-semibold">{fmtNum(k.channelCount)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-faint">
            Partners
          </span>
          <span className="tabular text-lg font-semibold">{fmtNum(k.partnerCount)}</span>
        </div>
        <p className="min-w-[200px] flex-1 text-xs text-faint">
          Concentration is computed on the active direction over filtered HS2 channels.
          Source: UN Comtrade mirror statistics.
        </p>
      </section>

      <QueueTable
        channels2={data.channels}
        channels6={data.channels6}
        filter={filter}
        years={data.years}
      />
    </div>
  );
}
