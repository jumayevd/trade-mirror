"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BAND_COLORS, COLORS } from "@/lib/format";
import { yearsFor, yearsLabel, type Filter, type RiskBand, type Robustness, type Tier } from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";
import { readZoom } from "@/lib/zoom-store";

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
        <div className="text-[12px] font-semibold uppercase leading-snug tracking-[0.08em] text-muted">{label}</div>
        {info && <InfoTip text={info} />}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[24px] font-semibold leading-none tracking-tight" style={accent ? { color: accent } : undefined}>
          {value}
        </span>
        {delta && (
          <span className="text-[12px] font-medium" style={{ color: deltaGood ? "var(--color-ok)" : "var(--color-serious)" }}>
            {delta}
          </span>
        )}
      </div>
      {sub && <div className="mt-1.5 text-[12.5px] leading-snug text-faint">{sub}</div>}
    </div>
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
    /*
     * globals.css puts `zoom` on body, so the two coordinate systems differ:
     * getBoundingClientRect reports rendered pixels, while a CSS `left` inside
     * that subtree is multiplied by the zoom before it lands. Written straight
     * across, the panel came out one zoom factor to the right — off the screen
     * entirely at 1.25. EChart corrects the same mismatch the same way.
     */
    const z = readZoom();
    const vw = window.innerWidth / z;
    const vh = window.innerHeight / z;
    // keep the panel on screen: flip above when it would run off the bottom,
    // and pull it left when it would run off the right edge
    const left = Math.max(8, Math.min(r.left / z, vw - PANEL - 8));
    const below = r.bottom / z + 6;
    const top = below + HEIGHT > vh && r.top / z > HEIGHT + 10 ? r.top / z - 6 - HEIGHT : below;
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
        className={`inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border text-[11px] leading-none transition-colors ${
          open
            ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
            : "border-[var(--color-border)] text-faint hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        }`}
      >
        i
      </button>
      {open && pos && (
        <span
          role="tooltip"
          style={{ top: pos.top, left: pos.left, width: PANEL }}
          className="fixed z-50 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] p-2.5 text-[12.5px] font-normal normal-case leading-relaxed tracking-normal text-foreground shadow-lg"
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
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {desc && <p className="mt-0.5 max-w-2xl text-[13.5px] leading-relaxed text-muted">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

/** Context line (spec §5.3) — quiet, single line, above analytical blocks. */
export function ContextLine({ filter }: { filter: Filter }) {
  const { t } = useI18n();
  // localized twin of dataset's contextLine(), which stays English for CSV headers
  const parts = [yearsLabel(filter.years.length ? filter.years : yearsFor(filter.granularity))];
  if (filter.granularity === "month") {
    parts.push(filter.months.length === 0 || filter.months.length === 12
      ? t("gran.month").toLowerCase()
      : `${t("gran.month").toLowerCase()}: ${filter.months.join(", ")}`);
  }
  const codes = (values: string[]) => (values.length <= 3 ? `HS ${values.join(", ")}` : `${values.length} HS`);
  if (filter.hs6.length > 0) parts.push(codes(filter.hs6));
  else if (filter.hs4.length > 0) parts.push(codes(filter.hs4));
  else if (filter.hs2.length > 0) parts.push(codes(filter.hs2));
  parts.push(`${t("filter.freight").toLowerCase()} ${Math.round(filter.cif * 100)}%`);
  return (
    <p className="mb-3 truncate font-mono text-[12px] text-faint" title={t("qual.ui.contextTip")}>
      {parts.join(" · ")}
    </p>
  );
}

/* ---------- chips: identity comes from a small colored dot beside ink text ---------- */

function DotChip({ dot, children, title, className = "" }: { dot?: string; children: React.ReactNode; title?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-1.5 py-px text-[12px] font-medium leading-4 text-muted ${className}`} title={title}>
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
      <span className="tabular text-[13px] font-semibold leading-none">{score.toFixed(0)}</span>
      <span className="h-[3px] w-8 overflow-hidden rounded-full bg-[var(--color-panel-2)]">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(2, Math.min(score, 100))}%`, background: BAND_COLORS[band] }} />
      </span>
    </span>
  );
}

export function BandBadge({ band }: { band: RiskBand }) {
  const { t } = useI18n();
  return (
    <DotChip dot={BAND_COLORS[band]} title={t(`band.desc.${band}` as never)}>
      {t(`band.${band}` as never)}
    </DotChip>
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
            className={`whitespace-nowrap px-2.5 py-1 text-[13px] ${i > 0 ? "border-l border-[var(--color-border)]" : ""} ${
              on
                ? "bg-[var(--color-primary)] font-semibold text-white"
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
            <span className={`rounded-md border px-1.5 py-0.5 text-[12px] ${"current" in s && s.current ? "border-[var(--color-primary)] font-semibold text-[var(--color-primary)]" : s.active ? "border-[var(--color-border)] text-muted" : "border-dashed border-[var(--color-border)] text-faint"}`}
              title={s.active ? t("qual.ui.ladder.tipOpen") : s.n === 4 ? t("qual.ui.ladder.tipBehavioural") : t("qual.ui.ladder.tipVerified")}>
              {s.n} · {t(s.key as never)}
            </span>
            {i < steps.length - 1 && <span className="text-[11.5px] text-faint">›</span>}
          </div>
        ))}
      </div>
      {!compact && <p className="mt-1.5 max-w-3xl text-[12px] text-faint">{t("ov.ladder.note")}</p>}
    </div>
  );
}

export function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md border border-[var(--color-border)] px-1.5 py-px text-[12px] font-medium text-muted">{children}</span>;
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
