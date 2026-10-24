"use client";

import { Fragment, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { readTheme, type Theme } from "@/lib/theme-store";

const subscribeNever = () => () => {};
const serverTheme = (): Theme => "light";

/**
 * The prerendered pages are built in the light theme, and much of their colour
 * is not CSS: src/lib/format.ts picks its palette in JavaScript, once, from the
 * theme (IS_DARK), and views write those colours into inline styles — card
 * rails, band colours, chart fills. A dark reader's browser would hydrate that
 * light markup, and React does not correct mismatched attributes when it
 * hydrates, so the light colours would stay.
 *
 * This hydrates against the light render (the server snapshot), then — for a
 * dark reader only — renders again under a new key, so React discards the
 * prerendered subtree and builds it fresh in the dark palette. THEME_BOOTSTRAP
 * keeps <main> hidden for that reader (html[data-pretheme]) until the fresh
 * subtree is in place; a light reader hydrates once and sees no difference.
 */
export default function ThemeRemount({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribeNever, readTheme, serverTheme);
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.pretheme === theme) delete root.dataset.pretheme;
  }, [theme]);
  return <Fragment key={theme}>{children}</Fragment>;
}
