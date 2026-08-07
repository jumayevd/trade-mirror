"use client";

import { useEffect, useRef, useState } from "react";
import type { Ref } from "@/lib/references";

/**
 * Methodology formula accordion — collapsed rows show only the measure name;
 * a click expands the formula, usage fields and research basis. The panel
 * animates on a pixel height measured in the click handler, so the transition
 * has two definite endpoints and the content stays in the DOM when collapsed.
 */

export interface MethodCard {
  name: string;
  formula: string;
  usedIn: string;
  population: string;
  denominator: string;
  interpretation: string;
  refs: Ref[];
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">{children}</div>;
}

function Row({ c }: { c: MethodCard }) {
  const [open, setOpen] = useState(false);
  const [height, setHeight] = useState(0);
  const inner = useRef<HTMLDivElement>(null);

  const toggle = () => {
    setHeight(inner.current?.scrollHeight ?? 0);
    setOpen((o) => !o);
  };

  // keep an open panel sized to its content when the text re-wraps
  useEffect(() => {
    if (!open) return;
    const onResize = () => setHeight(inner.current?.scrollHeight ?? 0);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  return (
    <div className="card overflow-hidden">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[color-mix(in_srgb,var(--color-primary)_4%,transparent)]"
      >
        <span className="text-[14.5px] font-semibold tracking-tight">{c.name}</span>
        <span aria-hidden className={`shrink-0 text-[13px] text-faint transition-transform duration-200 ${open ? "rotate-90" : ""}`}>▸</span>
      </button>
      <div
        className="overflow-hidden transition-[height,opacity] duration-300 ease-in-out"
        style={{ height: open ? height : 0, opacity: open ? 1 : 0 }}
      >
        <div ref={inner}>
          <div className="px-4 pb-4">
            <div className="tabular rounded-md bg-[var(--color-panel-2)] px-3 py-2 text-[12.5px] leading-relaxed">
              {c.formula}
            </div>
            <div className="mt-3 grid gap-x-6 gap-y-2.5 text-[13px] leading-snug sm:grid-cols-2">
              <div>
                <Label>Used in</Label>
                <div className="mt-0.5">{c.usedIn}</div>
              </div>
              <div>
                <Label>Population</Label>
                <div className="mt-0.5">{c.population}</div>
              </div>
              <div>
                <Label>Denominator</Label>
                <div className="mt-0.5">{c.denominator}</div>
              </div>
              <div>
                <Label>Interpretation</Label>
                <div className="mt-0.5">{c.interpretation}</div>
              </div>
            </div>
            <div className="mt-3 border-t border-dashed border-[var(--color-border)] pt-2.5">
              <Label>Research basis</Label>
              <ol className="mt-1 list-decimal space-y-1 pl-4 text-[12px] leading-snug text-muted">
                {c.refs.map((r) => (
                  <li key={r.id}>
                    {r.authors} ({r.year}). {r.url ? (
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">{r.title}</a>
                    ) : r.title}. {r.source}.
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MethodologyCards({ cards }: { cards: MethodCard[] }) {
  return (
    <div className="max-w-4xl space-y-2">
      {cards.map((c) => <Row key={c.name} c={c} />)}
    </div>
  );
}
