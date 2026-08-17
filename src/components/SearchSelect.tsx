"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

/**
 * Filter picker with type-ahead search. The country and HS pickers carry up to
 * ~1,500 options, which is far past what a native <select> can be scanned in, so
 * the list is searchable by code or label. Matching is case-insensitive over both
 * the option value (e.g. an HS code) and its label. Every match is rendered — the
 * list scrolls rather than truncating, so scrolling to the end reaches the last
 * code rather than an arbitrary cut-off.
 */

export interface SearchOption {
  value: string;
  /** Short leading token — an HS code or ISO3 — rendered in mono. */
  code?: string;
  label: string;
  /**
   * Complete source text, when the visible label is an abbreviation of it.
   * Shown on hover so the full nomenclature line is always one gesture away.
   */
  full?: string;
}

export default function SearchSelect({
  value,
  onChange,
  options,
  allLabel,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SearchOption[];
  /** Label for the catch-all "all" entry, always offered first. */
  allLabel: string;
  ariaLabel: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const all: SearchOption[] = useMemo(
    () => [{ value: "all", label: allLabel }, ...options],
    [options, allLabel],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.code ?? o.value).toLowerCase().includes(q),
    );
  }, [all, query]);

  const current = all.find((o) => o.value === value);

  // close on outside click or Escape; listeners only, no state writes in the effect body
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // focus the search box as soon as the panel opens
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  // keep the arrow-key highlight inside the scroll viewport
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const commit = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
    setActive(0);
    trigger.current?.focus();
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = matches[active];
      if (pick) commit(pick.value);
    }
  };

  return (
    <div ref={wrap} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setAlignRight(r.left > window.innerWidth / 2);
          setOpen((o) => !o);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="flex w-full min-w-[9rem] max-w-[16rem] items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1.5 text-left text-[13px] text-foreground outline-none hover:border-[var(--color-primary)] focus:border-[var(--color-primary)]"
      >
        <span className="truncate">
          {current?.code && <span className="tabular mr-1 text-faint">{current.code}</span>}
          {current?.label ?? allLabel}
        </span>
        <span aria-hidden className="shrink-0 text-[10px] text-faint">▾</span>
      </button>

      {open && (
        <div className={`absolute z-40 mt-1 w-[min(32rem,90vw)] overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] shadow-lg ${alignRight ? "right-0" : "left-0"}`}>
          <input
            ref={input}
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onInputKey}
            placeholder={t("filter.search")}
            aria-label={t("filter.search")}
            className="w-full border-b border-[var(--color-border-soft)] bg-[var(--color-panel)] px-2.5 py-1.5 text-[13px] outline-none placeholder:text-faint focus-visible:border-[var(--color-primary)] focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]"
          />
          <ul ref={listRef} role="listbox" aria-label={ariaLabel} className="max-h-64 overflow-y-auto py-1">
            {matches.length === 0 && (
              <li className="px-2.5 py-2 text-[12px] text-faint">{t("filter.noMatches")}</li>
            )}
            {matches.map((o, i) => (
              <li key={o.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  data-active={i === active}
                  aria-selected={o.value === value}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => commit(o.value)}
                  title={o.full ?? o.label}
                  className={`flex w-full items-start gap-2 px-2.5 py-1 text-left text-[13px] ${
                    i === active ? "bg-[var(--color-panel-2)]" : ""
                  } ${o.value === value ? "font-semibold text-foreground" : "text-muted hover:text-foreground"}`}
                >
                  {o.code && <span className="tabular mt-px shrink-0 text-[11px] text-faint">{o.code}</span>}
                  {/* long HS descriptions wrap instead of losing their tail */}
                  <span className="min-w-0 leading-snug break-words">{o.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
