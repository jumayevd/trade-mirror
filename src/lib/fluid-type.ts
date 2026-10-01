/**
 * The fluid type pixel, for text CSS cannot reach.
 *
 * DOM text is sized as N × `--fpx` in globals.css, which follows the viewport.
 * Chart text is drawn on a canvas from plain numbers, so it needs the same factor
 * computed here. The constants mirror `--fpx`; change both together.
 */
export const FLUID = { refW: 1366, refH: 720, min: 0.9, max: 1.25 } as const;

/**
 * One declared pixel in CSS pixels at the current viewport, 1 on the server.
 * Rounded to hundredths so a resize drag re-renders charts only when the type
 * visibly changes, not on every pixel.
 */
export function readFpx(): number {
  if (typeof window === "undefined") return 1;
  const raw = Math.min(window.innerWidth / FLUID.refW, window.innerHeight / FLUID.refH);
  return Math.round(Math.min(FLUID.max, Math.max(FLUID.min, raw)) * 100) / 100;
}

export const serverFpx = () => 1;

export const subscribeFpx = (fn: () => void) => {
  window.addEventListener("resize", fn);
  return () => window.removeEventListener("resize", fn);
};

/** Multiplies every `fontSize` and `lineHeight` in a chart option by the fluid pixel. */
export function scaleFonts<T>(node: T, fpx: number): T {
  if (fpx === 1 || node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((n) => scaleFonts(n, fpx)) as T;
  // class instances (gradients, Dates) pass through untouched
  const proto = Object.getPrototypeOf(node);
  if (proto !== Object.prototype && proto !== null) return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = (k === "fontSize" || k === "lineHeight") && typeof v === "number"
      ? Math.round(v * fpx * 10) / 10
      : scaleFonts(v, fpx);
  }
  return out as T;
}
