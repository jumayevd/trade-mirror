"use client";

import {
  useLayoutEffect, useRef, useState,
  type FocusEvent as ReactFocusEvent, type PointerEvent as ReactPointerEvent, type ReactNode,
} from "react";
import Link from "next/link";
import { InfoTip } from "@/components/ui";
import { COLORS, fmtPct, fmtUSD } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

/**
 * Building blocks for the executive summaries that lead Product Analysis and
 * Discrepancy & Risk. They follow the Overview's reading order — a row of
 * headline tiles, three takeaways in plain words, then two ranked panels — so
 * the trade pages read alike. The detail behind them (matrices, full tables)
 * stays on each page, below, behind a reveal.
 */

/** Fill {placeholders} in a translated string with runtime values. */
export const fill = (s: string, vals: Record<string, string | number>) =>
  Object.entries(vals).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

/* ------------------------------------------------------------------ */
/* Hero stat: the ONE lead number on a page (30px; other tiles 24px)   */
/* ------------------------------------------------------------------ */

export function HeroStat({
  label, value, sub, info, accent = COLORS.positive, trend,
}: { label: string; value: string; sub?: string; info?: string; accent?: string; trend?: ReactNode }) {
  return (
    <div className="stat-card" style={{ ["--stat-rail" as string]: accent }}>
      <div className="flex items-start justify-between gap-2">
        <div className="fs-12.5 font-medium leading-snug text-muted">{label}</div>
        {info && <InfoTip text={info} />}
      </div>
      {/* the trend sits beside the figure where the tile is wide enough, and
          wraps beneath it where it is not — it never pushes past the edge */}
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <span className="whitespace-nowrap fs-30 font-semibold leading-none tracking-tight" style={{ color: accent }}>
          {value}
        </span>
        {trend}
      </div>
      {sub && <div className="mt-1.5 fs-12.5 leading-snug text-faint">{sub}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline: is the headline growing or shrinking?                    */
/* ------------------------------------------------------------------ */

export interface TrendPoint {
  key: string;
  label: string;
  value: number;
  /** In the period the page is showing — drawn in the accent. */
  selected: boolean;
  /** Not a complete period yet (its months so far), so a dip is not a fall. */
  partial?: string;
}

interface AnnualRow { year: number; month?: number; label?: string; positive: number; comparablePartners: number }

/**
 * The headline's points across the whole window, the selected periods marked.
 * Leading periods where neither book is comparable are a data gap, not a
 * signal, so the line starts at the first period both books cover.
 */
export function buildTrend(
  annual: AnnualRow[],
  sel: { years: number[]; months: number[] },
  partialOf: (y: number) => string | undefined,
): TrendPoint[] {
  const first = annual.findIndex((a) => a.comparablePartners > 0);
  const rows = first > 0 ? annual.slice(first) : annual;
  const allYears = sel.years.length === 0;
  return rows.map((a) => ({
    key: `${a.year}-${a.month ?? 0}`,
    label: a.label ?? String(a.year),
    value: Math.max(0, a.positive),
    selected: (allYears || sel.years.includes(a.year)) && (a.month === undefined || sel.months.length === 0 || sel.months.includes(a.month)),
    partial: a.month === undefined ? partialOf(a.year) : undefined,
  }));
}

/**
 * 32px high, one line in the quiet navy and the selected periods in the CBU
 * gold, so the eye lands on "where we are" against "where we were". A partial
 * period is a hollow point on a dashed segment. Every point names itself on
 * hover; the summary sits in the label for screen readers.
 */
export function Sparkline({
  points, ariaLabel, format, partialWord,
}: { points: TrendPoint[]; ariaLabel: string; format: (v: number) => string; partialWord: string }) {
  const { tip, show, hide } = useTip();
  if (points.length < 2) return null;
  const W = 96, H = 32, P = 4;
  const max = Math.max(...points.map((p) => p.value)) || 1;
  const step = (W - 2 * P) / (points.length - 1);
  const x = (i: number) => P + i * step;
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const many = points.length > 24; // monthly: dots only where they mean something
  const line = (from: number, to: number) =>
    points.slice(from, to + 1).map((p, k) => `${k === 0 ? "M" : "L"}${x(from + k).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  // the dashed tail starts at the last complete point before a partial one
  const tail = points.findIndex((p) => p.partial);
  const solidEnd = tail > 0 ? tail - 1 : points.length - 1;
  return (
    <span className="flex shrink-0 flex-col items-end">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} onPointerLeave={hide} className="overflow-visible">
        <path d={line(0, solidEnd)} fill="none" stroke={COLORS.calm} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {tail > 0 && (
          <path d={line(tail - 1, points.length - 1)} fill="none" stroke={COLORS.calm} strokeWidth={2} strokeDasharray="3 3" strokeLinecap="round" />
        )}
        {points.map((p, i) => (p.selected || p.partial) && !(many && !p.selected) ? (
          <circle
            key={p.key}
            cx={x(i)}
            cy={y(p.value)}
            r={p.selected ? 3.5 : 3}
            fill={p.partial ? COLORS.surface : p.selected ? COLORS.accent : COLORS.calm}
            stroke={p.partial ? (p.selected ? COLORS.accent : COLORS.calm) : COLORS.surface}
            strokeWidth={p.partial ? 1.75 : 2}
          />
        ) : null)}
        {/* one hit band per point, the full height of the line */}
        {points.map((p, i) => (
          <rect
            key={`hit-${p.key}`}
            x={x(i) - step / 2}
            y={0}
            width={step}
            height={H}
            fill="transparent"
            onPointerEnter={(e) => show(e, p.label, [{ color: p.selected ? COLORS.accent : COLORS.calm, label: p.partial ? `${partialWord}: ${p.partial}` : "", value: format(p.value) }])}
            onPointerMove={(e) => show(e, p.label, [{ color: p.selected ? COLORS.accent : COLORS.calm, label: p.partial ? `${partialWord}: ${p.partial}` : "", value: format(p.value) }])}
          />
        ))}
      </svg>
      <span className="tabular mt-0.5 fs-11 leading-none text-faint">
        {points[0].label}–{points[points.length - 1].label}
      </span>
      <FloatingTip tip={tip} />
    </span>
  );
}

/** The headline's sparkline with the page's language and money format applied. */
export function TrendFor({ points }: { points: TrendPoint[] }) {
  const { t } = useI18n();
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <Sparkline
      points={points}
      format={fmtUSD}
      partialWord={t("sum.trend.partial")}
      ariaLabel={fill(t("sum.trend.aria"), { from: first.label, to: last.label, first: fmtUSD(first.value), last: fmtUSD(last.value) })}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Takeaways: what the numbers say, one figure and one sentence each   */
/* ------------------------------------------------------------------ */

export interface Takeaway {
  key: string;
  /** The figure the sentence is about — read first. */
  figure: string;
  text: string;
  /** A quiet context line under the sentence. */
  meta?: ReactNode;
  /** Identity rail on the left edge; the figure itself stays in ink. */
  accent?: string;
  href?: string;
  cta?: string;
}

export function Takeaways({ title, items }: { title: string; items: Takeaway[] }) {
  if (items.length === 0) return null;
  return (
    <section className="card p-4" aria-label={title}>
      <h2 className="mb-3 fs-15 font-bold tracking-tight">{title}</h2>
      <ul className={`grid gap-3 ${items.length >= 3 ? "md:grid-cols-3" : items.length === 2 ? "md:grid-cols-2" : ""}`}>
        {items.map((it) => (
          <li
            key={it.key}
            className="flex min-w-0 flex-col rounded-md border border-[var(--color-border-soft)] border-l-[3px] bg-[color-mix(in_srgb,var(--color-panel-2)_55%,var(--color-panel))] px-3.5 py-3"
            style={{ borderLeftColor: it.accent ?? "var(--color-primary)" }}
          >
            <span className="whitespace-nowrap fs-22 font-semibold leading-none tracking-tight text-[var(--color-primary)]">
              {it.figure}
            </span>
            <p className="mt-1.5 fs-13.5 leading-snug text-foreground">{it.text}</p>
            {it.meta && <p className="mt-1 fs-12.5 leading-snug text-faint">{it.meta}</p>}
            {it.href && it.cta && (
              <Link href={it.href} className="mt-auto pt-2 fs-12.5 font-medium text-[var(--color-primary)] hover:underline">
                {it.cta} →
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Panel: a titled card for one ranked view                            */
/* ------------------------------------------------------------------ */

export function Panel({
  title, desc, right, children, footer,
}: { title: string; desc?: string; right?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="card flex min-w-0 flex-col p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="fs-15 font-bold tracking-tight">{title}</h2>
          {desc && <p className="mt-0.5 max-w-xl fs-12.5 leading-snug text-faint">{desc}</p>}
        </div>
        {right}
      </div>
      {children}
      {footer}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Hover tooltip shared by the bars                                    */
/* ------------------------------------------------------------------ */

interface TipLine { color?: string; label: string; value: string }
interface TipState { x: number; y: number; title: string; lines: TipLine[] }

/**
 * One tooltip per chart, following the pointer. It appears at once — the
 * native title waits about a second and never shows on touch — and it only
 * repeats figures the chart also prints or the table behind it lists, so a
 * reader who never hovers loses nothing.
 */
function useTip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const show = (e: ReactPointerEvent, title: string, lines: TipLine[]) =>
    setTip({ x: e.clientX, y: e.clientY, title, lines });
  /** For keyboard focus, which has no pointer position: anchor to an element. */
  const showAt = (el: Element, title: string, lines: TipLine[]) => {
    const r = el.getBoundingClientRect();
    setTip({ x: r.left + 16, y: r.top, title, lines });
  };
  const hide = () => setTip(null);
  return { tip, show, showAt, hide };
}

const TIP_WIDTH = 250;

function FloatingTip({ tip }: { tip: TipState | null }) {
  if (!tip) return null;
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const left = Math.max(8, Math.min(tip.x + 14, vw - TIP_WIDTH - 8));
  // above the pointer, unless that would leave the window
  const above = tip.y > 110;
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 fs-12.5 leading-snug text-foreground shadow-lg"
      style={{ left, top: above ? tip.y - 12 : tip.y + 20, maxWidth: TIP_WIDTH, transform: above ? "translateY(-100%)" : undefined }}
    >
      <div className="mb-1 font-semibold">{tip.title}</div>
      {tip.lines.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          {/* a line without a swatch keeps the space, so its label aligns under the first */}
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: l.color ?? "transparent" }} />
          <span className="text-muted">{l.label}</span>
          <span className="tabular ml-auto whitespace-nowrap pl-3 font-semibold">{l.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bar list: one row per item, a bar scaled to the largest             */
/* ------------------------------------------------------------------ */

export interface BarSegment {
  key: string;
  value: number;
  color: string;
  /** The part's name, e.g. its risk band. */
  label: string;
  /** The part's value as printed in the tooltip. */
  valueText: string;
}

export interface BarItem {
  key: string;
  label: string;
  /** The full wording for the hover, when the label shortens it. */
  title?: string;
  meta?: ReactNode;
  badge?: ReactNode;
  value: number;
  /** Printed at the row's end — the bar never carries text of its own. */
  valueText: string;
  /** A second figure under the value, e.g. its share. */
  note?: string;
  /** Overrides the list's colour for this row (an "Other" row goes grey). */
  color?: string;
  /** Splits the bar into parts, in order; their sum is the row's value. */
  segments?: BarSegment[];
  href?: string;
  onClick?: () => void;
  actionTip?: string;
}

/** A split bar's parts as tooltip lines: name, amount and share of the row. */
function breakdownLines(item: BarItem): TipLine[] {
  const parts = item.segments?.filter((s) => s.value > 0) ?? [];
  const total = parts.reduce((s, p) => s + p.value, 0);
  return parts.map((s) => ({
    color: s.color, label: s.label, value: `${s.valueText} · ${fmtPct(total > 0 ? s.value / total : 0, 1)}`,
  }));
}

/**
 * The hit area reaches 6px above and below a 12px bar, so the pointer finds a
 * part without landing on it dead-centre; the 2px surface gap between parts is
 * the only place that answers with nothing.
 */
const HIT = "relative after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']";

/**
 * Bars are 12px, square at the baseline with a 4px rounded data end, on a faint
 * track so a short bar still reads against the full width. One series takes one
 * colour; a split bar separates its parts with a 2px surface gap, and hovering a
 * part names it with its value and its share of the row.
 */
function Bar({
  item, pct, color, onTip, onLeave,
}: {
  item: BarItem; pct: number; color: string;
  onTip: (e: ReactPointerEvent, title: string, lines: TipLine[]) => void;
  onLeave: () => void;
}) {
  const parts = item.segments?.filter((s) => s.value > 0) ?? [];
  const lines = breakdownLines(item);
  return (
    // a split bar is a picture of figures the row does not print, so it says
    // them in words; a single bar only repeats the value beside it
    <span
      className="mt-1.5 block h-3 w-full rounded-r-[4px] bg-[var(--color-panel-2)]"
      {...(parts.length > 0
        ? { role: "img", "aria-label": lines.map((l) => `${l.label} ${l.value}`).join(", ") }
        : { "aria-hidden": true })}
    >
      <span className="flex h-full gap-[2px]" style={{ width: `${pct}%` }}>
        {parts.length > 0 ? (
          parts.map((s, j) => {
            const tip = (e: ReactPointerEvent) => onTip(e, item.label, [lines[j]]);
            return (
              <span
                key={s.key}
                onPointerEnter={tip}
                onPointerMove={tip}
                onPointerLeave={onLeave}
                className={`${HIT} h-full min-w-[2px] cursor-default ${j === parts.length - 1 ? "rounded-r-[4px]" : ""}`}
                style={{ flexGrow: s.value, flexBasis: 0, background: s.color }}
              />
            );
          })
        ) : (
          <span
            onPointerEnter={(e) => onTip(e, item.title ?? item.label, [{ color, label: item.valueText, value: item.note ?? "" }])}
            onPointerMove={(e) => onTip(e, item.title ?? item.label, [{ color, label: item.valueText, value: item.note ?? "" }])}
            onPointerLeave={onLeave}
            className={`${HIT} h-full w-full cursor-default rounded-r-[4px]`}
            style={{ background: color }}
          />
        )}
      </span>
    </span>
  );
}

export function BarList({
  items, ranked = false, color = COLORS.positive, ariaLabel,
}: { items: BarItem[]; ranked?: boolean; color?: string; ariaLabel: string }) {
  const { tip, show, showAt, hide } = useTip();
  const max = Math.max(0, ...items.map((i) => i.value));
  /*
   * Keyboard focus on a split row opens the whole breakdown the pointer reads
   * part by part, so no figure sits behind a mouse alone (WCAG tooltip-keyboard).
   */
  const focusTip = (it: BarItem) => it.segments?.length
    ? {
        onFocus: (e: ReactFocusEvent<HTMLElement>) => showAt(e.currentTarget, it.label, breakdownLines(it)),
        onBlur: hide,
      }
    : {};
  return (
    <>
      <ol className="flex flex-col" aria-label={ariaLabel} onPointerLeave={hide}>
        {items.map((it, i) => {
          const pct = max > 0 ? Math.max(0.6, (100 * it.value) / max) : 0;
          const body = (
            <>
              {ranked && (
                <span className="tabular w-5 shrink-0 pt-px text-right fs-12.5 font-semibold text-faint">{i + 1}</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  {/* a long name wraps to a second line rather than losing its end */}
                  <span className="line-clamp-2 min-w-0 break-words fs-13.5 font-medium leading-snug" title={it.title ?? it.label}>{it.label}</span>
                  {it.badge && <span className="shrink-0">{it.badge}</span>}
                </span>
                <Bar item={it} pct={pct} color={it.color ?? color} onTip={show} onLeave={hide} />
                {it.meta && (
                  <span className="mt-1 block truncate fs-12 text-faint" title={typeof it.meta === "string" ? it.meta : undefined}>
                    {it.meta}
                  </span>
                )}
              </span>
              <span className="shrink-0 pl-1 text-right">
                <span className="tabular block whitespace-nowrap fs-13.5 font-semibold">{it.valueText}</span>
                {it.note && <span className="tabular block whitespace-nowrap fs-12 text-faint">{it.note}</span>}
              </span>
            </>
          );
          const row = "flex w-full items-start gap-3 rounded-md px-2 py-1.5 text-left";
          const live = `${row} hover:bg-[var(--color-panel-2)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]`;
          return (
            <li key={it.key} className="border-b border-[var(--color-border-soft)] last:border-b-0">
              {it.href ? (
                <Link href={it.href} className={live} title={it.actionTip} {...focusTip(it)}>{body}</Link>
              ) : it.onClick ? (
                <button type="button" onClick={it.onClick} className={live} title={it.actionTip}>{body}</button>
              ) : it.segments?.length ? (
                // not a link, but focusable, so the keyboard can read its breakdown
                <div tabIndex={0} className={`${row} focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]`} {...focusTip(it)}>{body}</div>
              ) : (
                <div className={row}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
      <FloatingTip tip={tip} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Share strip: one 100% bar, its parts in order                       */
/* ------------------------------------------------------------------ */

/** Relative luminance of a #rrggbb colour (WCAG). */
function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** White or dark ink, whichever clears the fill by more. */
function inkOn(hex: string): string {
  if (!hex.startsWith("#")) return "#ffffff";
  const l = luminance(hex);
  const DARK = 0.0122; // #0f1d33
  return 1.05 / (l + 0.05) >= (l + 0.05) / (DARK + 0.05) ? "#ffffff" : "#0f1d33";
}

/**
 * The element's rendered width. Read once before the first paint — so labels
 * that fit are there from the first frame — then kept current by a
 * ResizeObserver, which only reports on frames the page actually renders.
 */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export interface StripSegment {
  key: string;
  value: number;
  color: string;
  /** Printed inside the part when it fits — its share. */
  text: string;
  /** The part's name, for the tooltip. */
  label: string;
  /** The part's figures, for the tooltip. */
  detail: string;
  /** Further figures for the tooltip only — detail an executive need not read, kept a hover away. */
  more?: { label: string; value: string }[];
}

/**
 * Part-to-whole in one bar. A part prints its share inside only when the text
 * fits with room to spare — measured against the bar's rendered width — so a
 * label is never clipped; hovering a part names it, and the legend beneath
 * carries every value regardless.
 */
export function ShareStrip({
  segments, ariaLabel, title, height = 22,
}: { segments: StripSegment[]; ariaLabel: string; title: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const parts = segments.filter((s) => s.value > 0);
  const total = parts.reduce((s, p) => s + p.value, 0);
  const usable = Math.max(0, width - 2 * (parts.length - 1));
  // the label's font follows the fluid type pixel — globals.css's --fpx, which
  // reads back as its unresolved clamp(), so it is worked out the same way here
  const fpx = typeof window === "undefined"
    ? 1
    : Math.min(1.2, Math.max(0.9, Math.min(window.innerWidth / 1366, window.innerHeight / 720)));
  return (
    <>
      <div
        ref={ref}
        role="img"
        // the strip's insight in words, for readers who cannot see the parts
        aria-label={`${ariaLabel}: ${parts.map((s) => `${s.label} ${s.detail}`).join(", ")}`}
        className="flex w-full gap-[2px]"
        style={{ height }}
        onPointerLeave={hide}
      >
        {parts.map((s, i) => {
          const px = total > 0 ? (s.value / total) * usable : 0;
          const fits = px >= s.text.length * 7.4 * fpx + 14;
          const onTip = (e: ReactPointerEvent) => show(e, title, [
            { color: s.color, label: s.label, value: s.detail },
            ...(s.more ?? []),
          ]);
          return (
            <div
              key={s.key}
              onPointerEnter={onTip}
              onPointerMove={onTip}
              className={`flex min-w-[2px] cursor-default items-center justify-center ${i === 0 ? "rounded-l-[4px]" : ""} ${i === parts.length - 1 ? "rounded-r-[4px]" : ""}`}
              style={{ flexGrow: s.value, flexBasis: 0, background: s.color, color: inkOn(s.color) }}
            >
              {fits && <span className="tabular whitespace-nowrap fs-12 font-semibold">{s.text}</span>}
            </div>
          );
        })}
      </div>
      <FloatingTip tip={tip} />
    </>
  );
}
