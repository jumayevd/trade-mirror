"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/** An element's rendered width in px, kept current as it resizes (0 before mount). */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Room a short tabular figure needs inside a mark, in px, padding included. */
export const labelRoom = (text: string, px = 11.5) => text.length * px * 0.62 + 10;

/**
 * A tooltip for HTML charts: the exact figures behind a mark, shown on hover
 * or keyboard focus, so the marks themselves need print nothing but their size.
 *
 *   const tip = useHoverTip();
 *   <div {...tip.bind(<>…</>)} />
 *   {tip.node}
 *
 * It follows the pointer and stays inside the viewport. Marks keep their own
 * aria-label; this is the sighted reader's version of the same text.
 */
export function useHoverTip() {
  const [state, setState] = useState<{ x: number; y: number; content: ReactNode } | null>(null);

  const bind = useCallback((content: ReactNode) => ({
    onPointerMove: (e: React.PointerEvent) => setState({ x: e.clientX, y: e.clientY, content }),
    onPointerLeave: () => setState(null),
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setState({ x: r.left + r.width / 2, y: r.top, content });
    },
    onBlur: () => setState(null),
  }), []);

  const node = state ? <TipBox x={state.x} y={state.y}>{state.content}</TipBox> : null;
  return { bind, node };
}

function TipBox({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  // above the pointer by default; below it near the top of the window, and
  // pulled in from either edge so it never runs off screen
  const W = 260;
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const left = Math.max(8, Math.min(x - W / 2, vw - W - 8));
  const below = y < 120;
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 fs-12.5 leading-snug text-foreground shadow-md"
      style={{ left, top: below ? y + 18 : y - 12, width: W, transform: below ? undefined : "translateY(-100%)" }}
    >
      {children}
    </div>
  );
}
