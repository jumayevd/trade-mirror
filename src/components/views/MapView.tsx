"use client";

import { useState } from "react";
import FilterBar from "@/components/FilterBar";
import RiskMatrix from "@/components/charts/RiskMatrix";
import RiskMap, { MAP_METRIC_LABELS, type MapMetric } from "@/components/charts/RiskMap";
import { ContextLine, SectionTitle } from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import { useI18n } from "@/lib/i18n";
import { channelsToCsv, downloadCsv } from "@/lib/export";

/**
 * Risk Map page (spec §6.3). The PRIMARY view is the analytic matrix
 * (anomaly strength × evidence quality over HS6 channels); the geographic
 * world map is a secondary lens reached via the toggle.
 */

type MapMode = "matrix" | "geo";

const btn = (active: boolean) =>
  `rounded-md px-2.5 py-1 text-[12px] font-medium ${active ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-panel-2)] text-muted hover:text-foreground"}`;

export default function MapView() {
  const { data, filter } = useFilter();
  const { t } = useI18n();
  const [mode, setMode] = useState<MapMode>("matrix");
  const [metric, setMetric] = useState<MapMetric>("total");

  const exportCsv = () => downloadCsv(`trade-mirror-risk-matrix-${filter.from}-${filter.to}.csv`, channelsToCsv(data.channels6, filter));

  return (
    <div className="space-y-6">
      <SectionTitle
        title={t("nav.riskmap")}
        desc="Where the screening signals sit. The matrix plots every country × HS6 channel by anomaly strength (how unusual the residual discrepancy is) against evidence quality (how reliable and comparable the underlying data is) — two deliberately separate scores. The geographic view is a secondary lens on the same numbers. Source: UN Comtrade mirror statistics."
        right={
          <button onClick={exportCsv}
            className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[13px] text-muted hover:text-foreground"
            title="Export all HS6 channels under the active filters, with raw and derived fields plus data/methodology version.">
            {t("common.exportCsv")}
          </button>
        }
      />

      <FilterBar showMateriality />
      <ContextLine filter={filter} />

      {/* view toggle: matrix is the primary view, geography secondary */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1" role="tablist" aria-label="Risk map view">
          <button role="tab" aria-selected={mode === "matrix"} className={btn(mode === "matrix")} onClick={() => setMode("matrix")}>
            Matrix (primary)
          </button>
          <button role="tab" aria-selected={mode === "geo"} className={btn(mode === "geo")} onClick={() => setMode("geo")}>
            Geography
          </button>
        </div>
        {mode === "geo" && (
          <div className="flex items-center gap-1" role="tablist" aria-label="Map metric">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">Shade by</span>
            {(Object.keys(MAP_METRIC_LABELS) as MapMetric[]).map((m) => (
              <button key={m} role="tab" aria-selected={metric === m} className={btn(metric === m)} onClick={() => setMetric(m)}
                title={m === "intensity" ? "Discrepancy per $100M of comparable trade — normalises away sheer trade volume." : m === "channels" ? "Number of country × HS2 channels with comparable data under the current filters." : "Total discrepancy in the active direction."}>
                {MAP_METRIC_LABELS[m]}
              </button>
            ))}
          </div>
        )}
      </div>

      {mode === "matrix" ? (
        <section>
          <SectionTitle
            title="Anomaly × evidence matrix"
            desc={`Each bubble is one country × HS6 channel under the active filters (${data.channels6.length} shown); bubble area scales with the residual discrepancy in the active direction. Quadrant guides at E=60 and A=55 mirror the classification thresholds documented in the Methodology. Colour = signal class (screening priority), NOT wrongdoing — red marks the Investigate class only (strong anomaly on good data), never an accusation. Click a bubble to open the channel profile.`}
          />
          <RiskMatrix channels={data.channels6} filter={filter} />
        </section>
      ) : (
        <section>
          <SectionTitle
            title="Geographic view (secondary)"
            desc={`Partners shaded by ${MAP_METRIC_LABELS[metric].toLowerCase()} in the active direction — amber ramp for positive/absolute, blue for reverse; red is never used on the map. Grey countries are outside the analyzed partner set, are low-quality reporters, or have no comparable observations under the current filters — grey never means a zero gap. Click a shaded country to open the partner profile.`}
          />
          <RiskMap partners={data.partners} filter={filter} metric={metric} />
        </section>
      )}

      {/* explanatory footnotes */}
      <section className="card p-4">
        <h3 className="mb-2 text-sm font-semibold">How to read this page</h3>
        <ul className="max-w-4xl space-y-1.5 text-xs leading-relaxed text-muted">
          <li>
            <strong className="text-foreground">Two separate scores.</strong> Anomaly strength measures how unusual the residual
            unexplained discrepancy is (magnitude, relative size, persistence, dynamics, unit values); evidence quality measures how
            reliable and comparable the underlying data is. A strong anomaly on weak data means “verify the data first”, not “investigate”.
          </li>
          <li>
            <strong className="text-foreground">Directions are kept apart.</strong> Positive = the partner reports more than Uzbekistan
            records; reverse = Uzbekistan records more. Both are shown in every tooltip; a net figure is never the only headline.
          </li>
          <li>
            <strong className="text-foreground">Colour = signal class, not wrongdoing.</strong> Red is reserved for the Investigate class
            (high anomaly and high evidence quality — a priority for further statistical or customs review). Purple marks transit-sensitive
            channels, which are assessed separately because re-export routing can create legitimate discrepancies.
          </li>
          <li>
            <strong className="text-foreground">Missing data is not a zero gap.</strong> Countries outside the partner set, low-quality
            reporters and partner-years without reports stay grey on the map and are excluded from the scores rather than treated as zeros.
          </li>
          <li>
            <strong className="text-foreground">Interpretation limits.</strong> Every pattern on this page is a statistical screening
            signal. Freight valuation, transit routing, classification, timing and reporting-practice differences all contribute, and a
            discrepancy is not proof of intentional misreporting. {t("common.source")}.
          </li>
        </ul>
      </section>
    </div>
  );
}
