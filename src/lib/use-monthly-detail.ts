"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  ensureMonthlyChapters, ensureMonthlyDetail, monthlyDetailVer, subscribeMonthlyDetail, wantMonthly,
} from "@/lib/dataset";

/** Runs `fn` once the browser is idle; Safari has no requestIdleCallback, so a short delay stands in. */
function whenIdle(fn: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, 1500);
  return () => window.clearTimeout(id);
}

/**
 * The monthly data, on demand. While the monthly basis is active this loads
 * the chapter rows and then the HS6 detail, and marks the view as waiting so
 * the trade layout veils it until the rows land. While it is not, the chapter
 * rows are fetched once the page is idle, so a later switch to the monthly
 * basis usually finds them ready — without holding up the first paint.
 *
 * Returns a version number that bumps whenever monthly data arrives: put it in
 * the dependency list of any memoized aggregate so the view recomputes.
 */
export function useMonthlyDetail(active: boolean): number {
  useEffect(() => {
    if (!active) return whenIdle(ensureMonthlyChapters);
    ensureMonthlyDetail();
    return wantMonthly();
  }, [active]);
  // server snapshot is 0: SSR always renders the chapter-level view
  return useSyncExternalStore(subscribeMonthlyDetail, monthlyDetailVer, () => 0);
}
