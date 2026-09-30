"use client";

import { useMemo } from "react";
import Link from "next/link";
import { SectionTitle, QualityTag, TransitTag, Pill } from "@/components/ui";
import { meta, partnerName, yearsFor, type PartnerMeta } from "@/lib/dataset";
import { labelsFor } from "@/lib/labels";
import { useI18n } from "@/lib/i18n";
import { fmtPct, COLORS } from "@/lib/format";

/** Fill {placeholders} in a translated string with dataset values. */
const fill = (s: string, vals: Record<string, string | number>) =>
  Object.entries(vals).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

/* ------------------------------------------------------------------ */
/* Reporter coverage cells                                             */
/* ------------------------------------------------------------------ */

type CellState = "reported" | "missing" | "stopMarker" | "stopped";

/** Coverage, lapse and tier are all measured on these same reported years (dataset.ts). */
function cellState(p: PartnerMeta, y: number): CellState {
  if (p.reportedYears.includes(y)) return "reported";
  if (p.lapse && y > p.lastReportedYear) {
    return y === p.lastReportedYear + 1 ? "stopMarker" : "stopped";
  }
  return "missing";
}

function CoverageCell({ p, y }: { p: PartnerMeta; y: number }) {
  const { t } = useI18n();
  const state = cellState(p, y);
  if (state === "reported") {
    return (
      <span
        className="mx-auto block h-2.5 w-2.5 rounded-full"
        style={{ background: COLORS.good }}
        title={fill(t("qual.cell.reported"), { name: partnerName(p.iso3), year: y })}
      />
    );
  }
  if (state === "stopMarker") {
    return (
      <span
        className="mx-auto block h-2.5 w-2.5 rounded-sm border-2"
        style={{ borderColor: "var(--color-serious)" }}
        title={fill(t("qual.cell.stopMarker"), { name: partnerName(p.iso3), year: p.lastReportedYear })}
      />
    );
  }
  if (state === "stopped") {
    return (
      <span
        className="mx-auto block h-[3px] w-2.5 rounded-full bg-[var(--color-border)]"
        title={fill(t("qual.cell.stopped"), { name: partnerName(p.iso3), year: p.lastReportedYear })}
      />
    );
  }
  return (
    <span
      className="mx-auto block h-2.5 w-2.5 rounded-full border"
      style={{ borderColor: COLORS.baseline }}
      title={fill(t("qual.cell.missing"), { name: partnerName(p.iso3), year: y })}
    />
  );
}

/** Legend chips — DotChip pattern: identity via a small mark beside ink text. */
function LegendChip({ marker, children }: { marker: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-1.5 py-px text-[12px] font-medium leading-4 text-muted">
      {marker}
      {children}
    </span>
  );
}

function CoverageLegend() {
  const { t } = useI18n();
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <LegendChip marker={<span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLORS.good }} />}>
        {t("qual.legend.reported")}
      </LegendChip>
      <LegendChip marker={<span className="h-2 w-2 shrink-0 rounded-full border" style={{ borderColor: COLORS.baseline }} />}>
        {t("qual.legend.notReported")}
      </LegendChip>
      <LegendChip marker={<span className="h-2 w-2 shrink-0 rounded-sm border-2" style={{ borderColor: "var(--color-serious)" }} />}>
        {t("qual.legend.stopsHere")}
      </LegendChip>
      <LegendChip marker={<span className="h-[3px] w-2 shrink-0 rounded-full bg-[var(--color-border)]" />}>
        {t("qual.legend.noLonger")}
      </LegendChip>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

/**
 * Data Quality — who reported exports to Uzbekistan in which year.
 * Deliberately unfiltered: this is the record every other page's numbers rest
 * on, so narrowing it to a selection would make it argue instead of describe.
 * Partners that never reported in the window have no row.
 */
export default function QualityView() {
  const { t, lang } = useI18n();
  const years = yearsFor("year");

  // Partner names are data-derived: translate them, and break coverage ties in
  // the reader's own alphabet rather than the English one.
  const partners = useMemo(
    () => labelsFor(lang, () =>
      meta.partners
        .filter((p) => p.reportedYears.length > 0)
        .map((p) => ({ ...p, name: partnerName(p.iso3) }))
        .sort((a, b) => b.coverage - a.coverage || a.name.localeCompare(b.name, lang))),
    [lang],
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("nav.quality")}</h1>

      <section>
        <SectionTitle title={t("qual.coverage.title")} />
        <CoverageLegend />
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[12px] text-faint">
                <th className="px-3 py-2 text-right font-medium">#</th>
                <th className="px-3 py-2 font-medium">{t("common.partner")}</th>
                {years.map((y) => (
                  <th key={y} className="tabular px-1.5 py-2 text-center font-medium">{y}</th>
                ))}
                <th className="px-3 py-2 text-right font-medium" title={fill(t("qual.coverage.tip"), { n: years.length, start: years[0], end: years[years.length - 1] })}>
                  {t("kpi.coverage")}
                </th>
                <th className="px-3 py-2 font-medium">{t("qual.coverage.status")}</th>
              </tr>
            </thead>
            <tbody className="zebra">
              {partners.map((p, i) => (
                <tr key={p.iso3} className="border-b border-[var(--color-border-soft)] last:border-b-0">
                  <td className="tabular px-3 py-1.5 text-right text-faint">{i + 1}</td>
                  <td className="px-3 py-1.5">
                    <Link href={`/partners/${p.iso3.toLowerCase()}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  {years.map((y) => (
                    <td key={y} className="px-1.5 py-1.5 text-center">
                      <CoverageCell p={p} y={y} />
                    </td>
                  ))}
                  <td
                    className="tabular px-3 py-1.5 text-right text-muted"
                    title={`${p.reportedYears.length} / ${years.length}`}
                  >
                    {fmtPct(p.coverage, 0)}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <QualityTag tier={p.tier} />
                      {p.transit && <TransitTag />}
                      {p.lapse && <Pill>{fill(t("qual.coverage.stoppedAfter"), { year: p.lastReportedYear })}</Pill>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
