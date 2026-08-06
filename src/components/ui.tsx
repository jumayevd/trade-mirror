"use client";

import { anomalyColor, evidenceColor, CLASS_COLORS } from "@/lib/format";
import { CLASS_LABELS, ROBUSTNESS_LABELS, contextLine, type Filter, type Robustness, type SignalClass, type Tier } from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";

/**
 * Strip cell (Modernist handoff): 20px mono tabular figure, 11.5px label,
 * optional 10px mono § reference. Cells sit in a rule-separated strip —
 * each carries its own 1px right rule; the strip's parent draws the 1px/2px
 * horizontal rules. The methodology tooltip stays on `title`.
 */
export function Stat({
  label, value, sub, accent, info, sec, refId, delta, deltaGood, onClick,
}: {
  label: string; value: string; sub?: string; accent?: string; info?: string;
  /** mono § methodology reference, e.g. "§2.1" (alias: refId) */
  sec?: string; refId?: string;
  delta?: string; deltaGood?: boolean; onClick?: () => void;
}) {
  const ref = sec ?? refId;
  return (
    <div
      className={`border-r border-[rgba(32,30,29,0.2)] py-3 pr-3 last:border-r-0 ${onClick ? "cursor-pointer hover:bg-[rgba(32,30,29,0.045)]" : ""}`}
      title={info} onClick={onClick}
      role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}>
      <div className="tabular flex items-baseline gap-2 text-[20px] font-semibold leading-tight"
        style={accent ? { color: accent } : undefined}>
        {value}
        {delta && (
          <span className="text-[11px] font-semibold" style={{ color: deltaGood ? "#201e1d" : "#ae1800" }}>
            {delta}
          </span>
        )}
      </div>
      <div className="text-[11.5px] leading-snug text-[rgba(32,30,29,0.6)]">{label}</div>
      {ref && <div className="tabular mt-px text-[10px] text-[rgba(32,30,29,0.4)]">{ref}</div>}
      {sub && <div className="mt-0.5 text-[11px] leading-snug text-faint">{sub}</div>}
    </div>
  );
}

/** Mono methodology chip, e.g. "§2.1 · Σ max(X·(1+f) − M, 0)". */
export function MethodRef({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span className="tabular inline-block bg-[rgba(32,30,29,0.08)] px-1.5 py-0.5 text-[10.5px] leading-4 text-[rgba(32,30,29,0.7)]"
      title={title}>
      {children}
    </span>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <span className="inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center border border-[var(--color-border)] text-[9px] leading-none text-faint" title={text}>
      i
    </span>
  );
}

export function SectionTitle({ title, desc, right }: { title: string; desc?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[16px] font-extrabold tracking-tight">{title}</h2>
        {desc && <p className="mt-0.5 max-w-2xl text-[12.5px] leading-relaxed text-muted">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

/** Context line — quiet mono line stating the active calculation context. */
export function ContextLine({ filter }: { filter: Filter }) {
  return (
    <p className="tabular mb-3 truncate text-[10.5px] text-[rgba(32,30,29,0.5)]"
      title="Active calculation context — every number below uses exactly these parameters.">
      {contextLine(filter)}
    </p>
  );
}

/* ---------- badges: plain weighted text in class color — no borders, dots or pills ---------- */

export function AnomalyBadge({ score }: { score: number }) {
  return (
    <span className="tabular whitespace-nowrap text-[12px]" style={{ color: anomalyColor(score) }}
      title={`Anomaly strength ${score.toFixed(0)}/100 (§4) — how unusual the discrepancy is (magnitude, relative size, persistence, dynamics, unit values). Says nothing about data quality.`}>
      A {score.toFixed(0)}
    </span>
  );
}

export function EvidenceBadge({ score }: { score: number }) {
  return (
    <span className="tabular whitespace-nowrap text-[12px]" style={{ color: evidenceColor(score) }}
      title={`Evidence quality ${score.toFixed(0)}/100 (§5) — how reliable and comparable the underlying data is (coverage, reporter reliability, HS comparability, weight availability, freight robustness, transit exposure).`}>
      E {score.toFixed(0)}
    </span>
  );
}

export function ClassBadge({ cls }: { cls: SignalClass }) {
  const { t } = useI18n();
  return (
    <span className="whitespace-nowrap text-[12px] font-extrabold" style={{ color: CLASS_COLORS[cls] }}
      title={CLASS_LABELS[cls].desc}>
      {t(`cls.${cls}` as never)}
    </span>
  );
}

export function RobustnessBadge({ r }: { r: Robustness }) {
  const { t } = useI18n();
  return (
    <span className="whitespace-nowrap text-[11.5px] text-[rgba(32,30,29,0.7)]"
      title={`Robustness: ${ROBUSTNESS_LABELS[r]}. Robust = the sign holds at 6%, 10% and 15% freight, with enough comparable years and no major quality flags.`}>
      {t(`rob.${r}` as never)}
    </span>
  );
}

const TIER_TIP: Record<Tier, string> = {
  High: "Reliable mirror: the partner reported consistently across the window.",
  Medium: "Partial mirror: some years missing — interpret with care.",
  Low: "Weak mirror: sparse or lapsed reporting — the discrepancy may be a data artifact.",
};
const TIER_COLOR: Record<Tier, string> = {
  High: "#201e1d",
  Medium: "#605d5d",
  Low: "rgba(32,30,29,.55)",
};
export function QualityTag({ tier, tip }: { tier: Tier; tip?: string }) {
  return (
    <span className="cursor-help whitespace-nowrap text-[11px] font-extrabold" style={{ color: TIER_COLOR[tier] }}
      title={tip ?? TIER_TIP[tier]}>
      data {tier.toLowerCase()}
    </span>
  );
}

export function TransitTag() {
  return (
    <span className="cursor-help whitespace-nowrap text-[11px] font-extrabold text-[#605d5d]"
      title="Transit / re-export hub. Uzbekistan records imports by country of ORIGIN while hubs report re-exports by consignment, so routed goods can create legitimate discrepancies. Assessed separately from core channels.">
      transit
    </span>
  );
}

/** Evidence ladder — plain text steps joined by ›; the current step is 800 in accent-700. */
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
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11.5px]">
        {steps.map((s, i) => (
          <span key={s.key} className="flex items-baseline gap-2">
            <span
              className={"current" in s && s.current ? "font-extrabold text-[#ae1800]" : s.active ? "text-muted" : "text-faint"}
              title={s.active ? "Supported by open trade data" : s.n === 4 ? "Requires tariff/behavioural evidence — planned phase 2" : "Requires declarations, audit or administrative decision — never claimed on this site"}>
              {s.n} · {t(s.key as never)}
            </span>
            {i < steps.length - 1 && <span className="text-[10px] text-faint">›</span>}
          </span>
        ))}
      </div>
      {!compact && <p className="mt-1.5 max-w-3xl text-[11px] text-faint">{t("ov.ladder.note")}</p>}
    </div>
  );
}

/** Quiet mono tag (e.g. "transit hub", "last report 2021"). */
export function Pill({ children }: { children: React.ReactNode }) {
  return <span className="tabular whitespace-nowrap text-[10.5px] text-[rgba(32,30,29,0.5)]">{children}</span>;
}

export function EmptyState({ text }: { text?: string }) {
  const { t } = useI18n();
  return <p className="rule-1 border-b border-b-[rgba(32,30,29,0.2)] p-8 text-center text-[13px] text-muted">{text ?? t("common.noResults")}</p>;
}

/** "Not reported / Not comparable" instead of 0 or dash — missing data never reads as zero. */
export function MissingValue({ kind = "notReported" }: { kind?: "notReported" | "notComparable" }) {
  const { t } = useI18n();
  return <span className="text-faint" title={t("common.partnerMissing")}>{t(`common.${kind}` as never)}</span>;
}
