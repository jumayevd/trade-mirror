"use client";

import { useCallback, useState } from "react";

/**
 * How many rows a ranking table can list in the box a one-screen page gives
 * it. The box is the page's `.fill-rest` part — it takes the height the window
 * has spare — and holds the table's card; this measures the box, the card's
 * head, foot and pager (everything but the body rows) and one body row, and
 * answers with the count that fills the box without a scrollbar. Rows are one
 * line high (`.cbu-fit`), so the division is exact.
 *
 * Never fewer than `min`: on a window too short even for those, the box is
 * held at their height and the page scrolls instead. Before the first
 * measurement — and in the prerendered HTML — the answer is `initial`.
 *
 * The box is a callback ref, so a table that comes and goes (an empty period,
 * the map/table switch) is measured again each time it mounts.
 */
export function useFitRows(initial: number, min = 3) {
  const [rows, setRows] = useState(initial);

  const box = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const measure = () => {
      const card = el.firstElementChild as HTMLElement | null;
      const body = card?.querySelector("tbody");
      if (!card || !body || body.rows.length === 0) return;
      let row = 0;
      for (const r of body.rows) row = Math.max(row, r.getBoundingClientRect().height);
      if (row <= 0) return;
      const rest = card.getBoundingClientRect().height - body.getBoundingClientRect().height;
      el.style.minHeight = `${Math.ceil(rest + min * row)}px`;
      const fit = Math.max(min, Math.floor((el.clientHeight - rest + 0.5) / row));
      setRows((n) => (n === fit ? n : fit));
    };
    // the observer reports once on observe, so the first measurement needs no call
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [min]);

  return [box, rows] as const;
}
