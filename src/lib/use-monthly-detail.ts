"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ensureMonthlyDetail, monthlyDetailVer, subscribeMonthlyDetail } from "@/lib/dataset";

/**
 * Kicks off the on-demand fetch of the monthly HS6 detail whenever the monthly
 * basis is active, and returns a version number that bumps when the detail
 * arrives — put it in the dependency list of any memoized aggregate so the
 * view recomputes once the finer levels are available.
 */
export function useMonthlyDetail(active: boolean): number {
  useEffect(() => {
    if (active) ensureMonthlyDetail();
  }, [active]);
  // server snapshot is 0: SSR always renders the chapter-level view
  return useSyncExternalStore(subscribeMonthlyDetail, monthlyDetailVer, () => 0);
}
