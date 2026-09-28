/**
 * Light/dark theme, as a stored preference.
 *
 * The DOM side is pure CSS: every surface reads var(--color-*) tokens, and
 * html[data-theme="dark"] swaps the palette. The attribute is set by an inline
 * script in the root layout BEFORE hydration, so a dark reader never sees a
 * white flash.
 *
 * The canvas side cannot work that way: chart colors are baked into ECharts
 * options when components build them, and src/lib/format.ts chooses its palette
 * once, at module init, from the same attribute. So switching the theme writes
 * the preference and RELOADS the page — one honest reload beats threading a
 * theme dependency through every chart option memo in the codebase and being
 * wrong once. Filters survive the reload where they live in the URL.
 */
export type Theme = "light" | "dark";

const KEY = "tm-theme";

export const readTheme = (): Theme => {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
};

export const toggleTheme = (): void => {
  const next: Theme = readTheme() === "dark" ? "light" : "dark";
  try { localStorage.setItem(KEY, next); } catch { /* storage denied */ }
  location.reload();
};

/**
 * The inline bootstrap for the document head, kept here so the layout and the
 * store cannot disagree about the storage key. Default is light; dark is only
 * ever an explicit choice, so the deployed pages match their static render.
 */
export const THEME_BOOTSTRAP =
  `(function(){try{if(localStorage.getItem(${JSON.stringify(KEY)})==="dark")document.documentElement.dataset.theme="dark";}catch(e){}})();`;
