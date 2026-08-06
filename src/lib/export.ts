import { contextLine, DATA_VERSION, METHODOLOGY_VERSION, type Channel, type Filter } from "@/lib/dataset";

/**
 * CSV export (spec §11.1): all rows under the active filters, raw + derived fields,
 * with data version, methodology version and filter context in a header block.
 */
export function channelsToCsv(channels: Channel[], filter: Filter): string {
  const header = [
    `# Uzbekistan Mirror Trade Evidence & Risk Screening Dashboard`,
    `# Context: ${contextLine(filter)}`,
    `# Data version: ${DATA_VERSION} | Methodology: v${METHODOLOGY_VERSION} | Generated: ${new Date().toISOString()}`,
    `# Units: USD (nominal). A discrepancy is a statistical screening signal, not evidence of wrongdoing.`,
    `# Source: UN Comtrade`,
  ].join("\n");

  const cols = [
    "partner_iso3", "partner", "hs_level", "code", "label", "chapter",
    "partner_exports_fob_usd", "expected_import_cif_usd", "uzb_imports_cif_usd",
    "signed_discrepancy_usd", "positive_discrepancy_usd", "reverse_discrepancy_usd", "absolute_discrepancy_usd",
    "bounded_asymmetry_pct", "positive_share_pct",
    "comparable_years", "positive_years", "longest_positive_streak",
    "anomaly_strength", "evidence_quality", "signal_class", "robustness", "stage", "flags",
  ];
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = channels.map((c) =>
    [
      c.partnerIso, esc(c.partner), c.level, c.cmd, esc(c.cmdLabel), c.chapter,
      Math.round(c.peT), Math.round(c.expectedT), Math.round(c.uiT),
      Math.round(c.signedT), Math.round(c.posT), Math.round(c.revT), Math.round(c.absT),
      (c.boundedAsymmetry * 100).toFixed(1), (c.positiveShare * 100).toFixed(1),
      c.comparableYears, c.posYears, c.longestPosStreak,
      c.anomaly.toFixed(1), c.evidence.toFixed(1), c.cls, c.robustness, c.stage, esc(c.flags.join(";")),
    ].join(","),
  );
  return `${header}\n${cols.join(",")}\n${rows.join("\n")}`;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
