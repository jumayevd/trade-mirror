"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { SearchOption } from "@/components/SearchSelect";

/**
 * Dropdown with tick boxes: many values selectable at once, searchable when the
 * list is long. An empty selection means "everything" rather than "nothing", so a
 * freshly cleared filter shows all the data instead of an empty table.
 */
export default function MultiSelect({
  values,
  onChange,
  options,
  label,
  allLabel,
  searchable = true,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: SearchOption[];
  /** Caption above the control. */
  label: string;
  /** Summary shown when nothing is ticked. */
  allLabel: string;
  searchable?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [query, setQuery] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const picked = useMemo(() => new Set(values), [values]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.code ?? o.value).toLowerCase().includes(q),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open && searchable) input.current?.focus();
  }, [open, searchable]);

  const toggle = (v: string) =>
    onChange(picked.has(v) ? values.filter((x) => x !== v) : [...values, v]);

  const summary = () => {
    if (values.length === 0) return allLabel;
    if (values.length === 1) {
      const o = options.find((x) => x.value === values[0]);
      return o ? (o.code ? `${o.code} · ${o.label}` : o.label) : values[0];
    }
    return `${values.length} ${t("filter.selected")}`;
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">{label}</span>
      <div ref={wrap} className="relative">
        <button
          ref={trigger}
          type="button"
          onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setAlignRight(r.left > window.innerWidth / 2);
          setOpen((o) => !o);
        }}
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={label}
          className={`flex w-full min-w-[9rem] max-w-[16rem] items-center justify-between gap-2 rounded-md border bg-[var(--color-panel)] px-2 py-1.5 text-left text-[13px] outline-none hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] ${
            values.length ? "border-[var(--color-primary)] font-medium text-foreground" : "border-[var(--color-border)] text-foreground"
          }`}
        >
          <span className="truncate">{summary()}</span>
          <span aria-hidden className="shrink-0 text-[10px] text-faint">▾</span>
        </button>

        {open && (
          <div className={`absolute z-40 mt-1 w-[min(34rem,92vw)] overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] shadow-lg ${alignRight ? "right-0" : "left-0"}`}>
            {searchable && (
              <input
                ref={input}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("filter.search")}
                aria-label={t("filter.search")}
                className="w-full border-b border-[var(--color-border-soft)] bg-[var(--color-panel)] px-2.5 py-1.5 text-[13px] outline-none placeholder:text-faint focus-visible:border-[var(--color-primary)] focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]"
              />
            )}
            <ul role="group" aria-label={label} className="max-h-64 overflow-y-auto py-1">
              {matches.length === 0 && (
                <li className="px-2.5 py-2 text-[12px] text-faint">{t("filter.noMatches")}</li>
              )}
              {matches.map((o) => {
                const on = picked.has(o.value);
                return (
                  <li key={o.value}>
                    <label
                      title={o.full ?? o.label}
                      className={`flex cursor-pointer items-start gap-2 px-2.5 py-1 text-[13px] hover:bg-[var(--color-panel-2)] ${
                        on ? "font-medium text-foreground" : "text-muted"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(o.value)}
                        className="mt-1 h-3 w-3 shrink-0 accent-[var(--color-primary)]"
                      />
                      {o.code && <span className="tabular mt-px shrink-0 text-[11px] text-faint">{o.code}</span>}
                      {/* HS descriptions run long: wrap them rather than cutting the
                          distinguishing tail, which is often the whole difference
                          between two neighbouring codes */}
                      <span className="min-w-0 leading-snug break-words">{o.label}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {values.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full border-t border-[var(--color-border-soft)] px-2.5 py-1.5 text-left text-[11px] font-medium text-muted hover:text-foreground"
              >
                {t("filter.clearSelection")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
