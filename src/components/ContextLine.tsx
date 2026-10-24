"use client";

import { yearsFor, yearsLabel, type Filter } from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";

/*
 * Kept out of ui.tsx on purpose: it reads the trade dataset, and ui.tsx is
 * shared by pages that must not load it (the Shadow Economy pages, the home).
 */
/** Context line (spec §5.3) — quiet, single line, above analytical blocks. */
export function ContextLine({ filter }: { filter: Filter }) {
  const { t } = useI18n();
  // localized twin of dataset's contextLine(), which stays English for CSV headers
  const parts = [yearsLabel(filter.years.length ? filter.years : yearsFor(filter.granularity))];
  if (filter.granularity === "month") {
    parts.push(filter.months.length === 0 || filter.months.length === 12
      ? t("gran.month").toLowerCase()
      : `${t("gran.month").toLowerCase()}: ${filter.months.join(", ")}`);
  }
  const codes = (values: string[]) => (values.length <= 3 ? `HS ${values.join(", ")}` : `${values.length} HS`);
  if (filter.hs6.length > 0) parts.push(codes(filter.hs6));
  else if (filter.hs4.length > 0) parts.push(codes(filter.hs4));
  else if (filter.hs2.length > 0) parts.push(codes(filter.hs2));
  parts.push(`${t("filter.freight").toLowerCase()} ${Math.round(filter.cif * 100)}%`);
  return (
    <p className="mb-3 truncate font-mono fs-12 text-faint" title={t("qual.ui.contextTip")}>
      {parts.join(" · ")}
    </p>
  );
}
