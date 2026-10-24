"use client";

import { useSyncExternalStore } from "react";
import { monthlyPending, subscribeMonthlyDetail } from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";

/**
 * Covers a trade page while a view on the monthly basis waits for the monthly
 * rows (see useMonthlyDetail): computed over no rows its figures would read as
 * zeros, and a number shown then replaced is worse than a moment of loading.
 * Sits inside a `relative` box around the page.
 */
export default function MonthlyVeil() {
  const pending = useSyncExternalStore(subscribeMonthlyDetail, monthlyPending, () => false);
  const { t } = useI18n();
  if (!pending) return null;
  return (
    <div className="absolute inset-0 z-30 flex justify-center bg-[color-mix(in_srgb,var(--background)_82%,transparent)] pt-40">
      <p role="status" aria-live="polite"
        className="flex h-fit items-center gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-2.5 fs-13.5 font-medium shadow-sm">
        <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)] motion-reduce:animate-none" />
        {t("trade.monthlyLoading")}
      </p>
    </div>
  );
}
