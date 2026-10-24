"use client";

import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

/**
 * False in the prerendered HTML and during hydration, true from the first
 * client render after it. Lets a page leave out of its HTML what nobody can use
 * before scripts run — a dropdown's thousands of options, say — without a
 * hydration mismatch: React renders the server's version first, then this one.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}
