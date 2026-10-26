"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ALERT_COLORS, ALERT_INK, COLORS } from "@/lib/format";
import type { RiskBand, Robustness, Tier } from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";

/** Fill {placeholders} in a translated string with runtime values. */
const fill = (s: string, vals: Record<string, string | number>) =>
  Object.entries(vals).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

/**
 * Stat tile (dataviz contract): sentence-case label, semibold proportional
 * value (auto-compact), optional context line and signed delta. Numbers use
 * proportional figures — tabular is reserved for table columns.
 */
export function Stat({
  label, value, sub, accent, info, delta, deltaGood, onClick,
}: {
  label: string; value: string; sub?: string; accent?: string; info?: string;
  delta?: string; deltaGood?: boolean; onClick?: () => void;
}) {
  const rail = accent ?? "var(--color-primary)";
  return (
    <div
      className={`stat-card ${onClick ? "card-hover cursor-pointer" : ""}`}
      style={{ ["--stat-rail" as string]: rail }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="fs-12.5 font-medium leading-snug text-muted">{label}</div>
        {info && <InfoTip text={info} />}
      </div>
      {/* the figure never breaks; when the tile is narrow the change drops below it */}
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="tabular whitespace-nowrap fs-24 font-semibold leading-none tracking-tight" style={accent ? { color: accent } : undefined}>
          {value}
        </span>
        {delta && (
          <span className="fs-12 font-medium" style={{ color: deltaGood ? "var(--color-ok)" : "var(--color-serious)" }}>
            {delta}
          </span>
        )}
      </div>
      {sub && <div className="mt-1.5 fs-12.5 leading-snug text-faint">{sub}</div>}
    </div>
  );
}

/**
 * What "positive discrepancy" means — the one term every trade page reads by —
 * framed and centred so it is the first thing a reader meets on each page.
 * The term and its meaning sit on one line where there is room, so the card
 * costs the page a single row.
 */
export function PosDefCard() {
  const { t } = useI18n();
  return (
    <figure
      className="relative mx-auto flex w-full max-w-[54rem] flex-col items-center gap-x-3 gap-y-1 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] px-5 pb-2 pt-2.5 text-center sm:flex-row sm:text-left"
      style={{ boxShadow: "0 1px 3px rgba(15, 37, 71, 0.06)" }}
    >
      <span aria-hidden className="absolute left-1/2 top-0 h-[3px] w-14 -translate-x-1/2 rounded-b-full bg-[var(--color-gold)]" />
      <figcaption className="shrink-0 whitespace-nowrap fs-11.5 font-semibold uppercase tracking-[0.14em] text-[var(--color-gold-ink)]">
        {t("kpi.positive")}
      </figcaption>
      <p className="fs-14 leading-snug text-foreground sm:border-l sm:border-[var(--color-border-soft)] sm:pl-3" style={{ textWrap: "balance" }}>
        {t("ovw.posDef")}
      </p>
    </figure>
  );
}

/**
 * The head of a trade page: title on the left, the definition card centred
 * (on Product Analysis and Discrepancy & Risk, where the positive discrepancy
 * is the subject), the page's own control (export, data window) on the right.
 * Stacks on narrow screens in the same order.
 */
export function PageHead({ title, right, definition = false }: { title: React.ReactNode; right?: React.ReactNode; definition?: boolean }) {
  return (
    <section className="flex flex-col gap-3 lg:grid lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center lg:gap-6">
      <div className="min-w-0">{title}</div>
      {definition ? <PosDefCard /> : <div aria-hidden className="hidden lg:block" />}
      <div className="flex lg:justify-end">{right}</div>
    </section>
  );
}

/**
 * The "i" beside a figure, and the panel it opens.
 *
 * This used to be a bare `title` attribute. That is a native tooltip: it waits
 * about a second before appearing, cannot be reached from the keyboard, and on a
 * touch screen never appears at all — so on a tablet the explanation behind
 * every KPI on the dashboard was simply unreachable, and on a desktop most
 * readers gave up before the delay elapsed.
 *
 * It is now a real tooltip. Hover peeks, click pins it open, Escape or a click
 * outside closes it, and it is a button so Tab reaches it and Enter opens it.
 *
 * The panel is positioned `fixed` against the trigger's viewport rect rather
 * than absolutely inside it, because the stat cards it usually sits in are
 * `overflow: hidden` and would otherwise clip it away.
 */
export function InfoTip({ text }: { text: string }) {
  const { t } = useI18n();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const PANEL = 300;
  const HEIGHT = 160; // enough for the longest tooltip; only decides which side to flip to
  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // keep the panel on screen: flip above when it would run off the bottom,
    // and pull it left when it would run off the right edge
    const left = Math.max(8, Math.min(r.left, vw - PANEL - 8));
    const below = r.bottom + 6;
    const top = below + HEIGHT > vh && r.top > HEIGHT + 10 ? r.top - 6 - HEIGHT : below;
    setPos({ top, left });
  }, []);

  const show = () => { place(); setOpen(true); };
  const hide = () => { setPinned(false); setOpen(false); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { hide(); btn.current?.focus(); } };
    const onDown = (e: MouseEvent) => { if (!btn.current?.contains(e.target as Node)) hide(); };
    // a fixed panel does not travel with the page, so close rather than drift
    const onMove = () => hide();
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={t("common.moreInfo")}
        aria-expanded={open}
        onClick={() => (pinned ? hide() : (setPinned(true), show()))}
        onPointerEnter={show}
        onPointerLeave={() => { if (!pinned) setOpen(false); }}
        onFocus={show}
        onBlur={() => { if (!pinned) setOpen(false); }}
        className={`inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border fs-11 leading-none transition-colors ${
          open
            ? "border-[var(--color-primary)] bg-[var(--color-primary-fill)] text-white"
            : "border-[var(--color-border)] text-faint hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        }`}
      >
        i
      </button>
      {open && pos && (
        <span
          role="tooltip"
          style={{ top: pos.top, left: pos.left, width: PANEL }}
          className="fixed z-50 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] p-2.5 fs-12.5 font-normal normal-case leading-relaxed tracking-normal text-foreground shadow-lg"
        >
          {text}
        </span>
      )}
    </>
  );
}

export function SectionTitle({ title, desc, right }: { title: string; desc?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 className="fs-18 font-semibold tracking-tight">{title}</h2>
        {desc && <p className="mt-0.5 max-w-3xl fs-13 leading-relaxed text-faint">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

/* ---------- chips: identity comes from a small colored dot beside ink text ---------- */

function DotChip({ dot, children, title, className = "" }: { dot?: string; children: React.ReactNode; title?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-1.5 py-px fs-12 font-medium leading-4 text-muted ${className}`} title={title}>
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}

/** Abnormal gap intensity (G) and persistence (P), the two MTRS components. */
export function ComponentChip({ kind, value }: { kind: "g" | "p"; value: number }) {
  const { t } = useI18n();
  return (
    <DotChip
      dot={kind === "g" ? COLORS.goldDeep : COLORS.navy3}
      title={t(kind === "g" ? "risk.tip.gComponent" : "risk.tip.pComponent")}
    >
      {kind === "g" ? "G" : "P"} {value.toFixed(2)}
    </DotChip>
  );
}

/** MTRS: bold number + mini track bar, coloured by the risk band. */
export function RiskScore({ score, band, scored = true }: { score: number; band: RiskBand; scored?: boolean }) {
  const { t } = useI18n();
  if (!scored) {
    return <span className="text-faint" title={t("risk.tip.notScored")}>{t("common.notComparable")}</span>;
  }
  return (
    <span
      className="inline-flex flex-col gap-[3px]"
      title={fill(t("qual.ui.riskTip"), { score: score.toFixed(0) })}
    >
      <span className="tabular fs-13 font-semibold leading-none">{score.toFixed(0)}</span>
      <span className="h-[3px] w-8 overflow-hidden rounded-full bg-[var(--color-panel-2)]">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(2, Math.min(score, 100))}%`, background: ALERT_COLORS[band] }} />
      </span>
    </span>
  );
}

export function BandBadge({ band }: { band: RiskBand }) {
  const { t } = useI18n();
  return (
    // a tinted pill in the band's alert colour: it should read as a warning level at a glance
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 fs-12 font-semibold leading-4"
      style={{
        color: ALERT_INK[band],
        background: `color-mix(in srgb, ${ALERT_COLORS[band]} 13%, transparent)`,
        borderColor: `color-mix(in srgb, ${ALERT_COLORS[band]} 35%, transparent)`,
      }}
      title={t(`band.desc.${band}` as never)}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ALERT_COLORS[band] }} />
      {t(`band.${band}` as never)}
    </span>
  );
}

/**
 * Segmented control. The active option takes the primary fill — the quiet panel
 * tint it used to rely on read as "disabled" as often as "selected", so which
 * option was live had to be inferred from the content underneath.
 */
export function Segmented<T extends string>({
  value, options, onChange, ariaLabel, className = "",
}: {
  value: T;
  options: { key: T; label: string; tip?: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex w-fit overflow-hidden rounded-md border border-[var(--color-border)] ${className}`}
    >
      {options.map((o, i) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={on}
            title={o.tip}
            className={`whitespace-nowrap px-2.5 py-1 fs-13 ${i > 0 ? "border-l border-[var(--color-border)]" : ""} ${
              on
                ? "bg-[var(--color-primary-fill)] font-semibold text-white"
                : "bg-[var(--color-panel)] font-medium text-muted hover:bg-[var(--color-panel-2)] hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function RobustnessBadge({ r }: { r: Robustness }) {
  const { t } = useI18n();
  return (
    <DotChip dot={r === "robust" ? COLORS.good : r === "insufficient" ? COLORS.axis : COLORS.goldDeep}
      title={fill(t("qual.ui.robustnessTip"), { label: t(`rob.${r}` as never) })}>
      {t(`rob.${r}` as never)}
    </DotChip>
  );
}

const TIER_TIP_KEY: Record<Tier, string> = {
  High: "qual.ui.tierTip.high",
  Medium: "qual.ui.tierTip.medium",
  Low: "qual.ui.tierTip.low",
};
const TIER_LABEL_KEY: Record<Tier, string> = {
  High: "qual.ui.tier.high",
  Medium: "qual.ui.tier.medium",
  Low: "qual.ui.tier.low",
};
export function QualityTag({ tier, tip }: { tier: Tier; tip?: string }) {
  const { t } = useI18n();
  const dot = tier === "High" ? COLORS.good : tier === "Medium" ? COLORS.gold : COLORS.axis;
  return <DotChip dot={dot} title={tip ?? t(TIER_TIP_KEY[tier] as never)}>{t(TIER_LABEL_KEY[tier] as never)}</DotChip>;
}

export function TransitTag() {
  const { t } = useI18n();
  return (
    <DotChip className="cursor-help" title={t("qual.ui.transitTip")}>
      {t("qual.ui.transitTag")}
    </DotChip>
  );
}

/** Evidence ladder (spec §2.4) — one quiet row. */
export function EvidenceLadder({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const steps = [
    { key: "ov.ladder.observed", n: 1, active: true },
    { key: "ov.ladder.comparable", n: 2, active: true },
    { key: "ov.ladder.residual", n: 3, active: true, current: true },
    { key: "ov.ladder.behavioural", n: 4, active: false },
    { key: "ov.ladder.verified", n: 5, active: false },
  ] as const;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1">
            <span className={`rounded-md border px-1.5 py-0.5 fs-12 ${"current" in s && s.current ? "border-[var(--color-primary)] font-semibold text-[var(--color-primary)]" : s.active ? "border-[var(--color-border)] text-muted" : "border-dashed border-[var(--color-border)] text-faint"}`}
              title={s.active ? t("qual.ui.ladder.tipOpen") : s.n === 4 ? t("qual.ui.ladder.tipBehavioural") : t("qual.ui.ladder.tipVerified")}>
              {s.n} · {t(s.key as never)}
            </span>
            {i < steps.length - 1 && <span className="fs-11.5 text-faint">›</span>}
          </div>
        ))}
      </div>
      {!compact && <p className="mt-1.5 max-w-3xl fs-12 text-faint">{t("ov.ladder.note")}</p>}
    </div>
  );
}

export function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md border border-[var(--color-border)] px-1.5 py-px fs-12 font-medium text-muted">{children}</span>;
}

export function EmptyState({ text }: { text?: string }) {
  const { t } = useI18n();
  return <p className="card p-8 text-center text-sm text-muted">{text ?? t("common.noResults")}</p>;
}

/** "Not reported / Not comparable" instead of 0 or dash (spec §10.3). */
export function MissingValue({ kind = "notReported" }: { kind?: "notReported" | "notComparable" }) {
  const { t } = useI18n();
  return <span className="text-faint" title={t("common.partnerMissing")}>{t(`common.${kind}` as never)}</span>;
}
