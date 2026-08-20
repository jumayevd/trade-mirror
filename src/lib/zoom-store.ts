/**
 * Reading scale, as a tiny external store.
 *
 * The dashboard is dense and much of its type sits at 10–13 CSS pixels, which is
 * comfortable on a laptop and small on a large monitor. `--page-zoom` in
 * globals.css scales the whole layout rather than only the font size, so
 * proportions hold; this store lets the reader pick the step and remembers it.
 *
 * It lives outside React for the same reason the language store does: the value
 * has to reach a CSS custom property on the document element, not just a
 * component subtree.
 */
export const ZOOM_STEPS = [1.1, 1.25, 1.4, 1.55] as const;
export type ZoomStep = (typeof ZOOM_STEPS)[number];

/** One step above the old fixed 1.1, since the complaint was that text ran small. */
export const DEFAULT_ZOOM: ZoomStep = 1.25;

const KEY = "tm-zoom";

let override: ZoomStep | null = null;
let listeners: Array<() => void> = [];

const valid = (n: number): n is ZoomStep => (ZOOM_STEPS as readonly number[]).includes(n);

export const readZoom = (): ZoomStep => {
  if (override) return override;
  let saved: string | null = null;
  try { saved = localStorage.getItem(KEY); } catch { /* server, or storage denied */ }
  const n = Number(saved);
  return saved !== null && valid(n) ? n : DEFAULT_ZOOM;
};

export const writeZoom = (z: ZoomStep) => {
  override = z;
  try { localStorage.setItem(KEY, String(z)); } catch { /* storage denied */ }
  for (const fn of listeners) fn();
};

export const subscribeZoom = (fn: () => void) => {
  listeners.push(fn);
  return () => { listeners = listeners.filter((x) => x !== fn); };
};

/** Server render uses the default, which is also the value baked into globals.css. */
export const serverZoom = (): ZoomStep => DEFAULT_ZOOM;

/**
 * Charts un-zoom themselves to keep canvas hit-testing aligned (see .chart-frame),
 * so the inverse has to move in step with the zoom or pointer coordinates drift.
 */
export function applyZoom(z: ZoomStep): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  root.setProperty("--page-zoom", String(z));
  root.setProperty("--page-unzoom", String(Math.round((1 / z) * 1e6) / 1e6));
}
