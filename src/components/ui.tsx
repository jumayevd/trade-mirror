"use client";

import { anomalyColor, evidenceColor, CLASS_COLORS } from "@/lib/format";
import { CLASS_LABELS, ROBUSTNESS_LABELS, contextLine, type Filter, type Robustness, type SignalClass, type Tier } from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";

export function Stat({
  label, value, sub, accent, info, onClick,
}: {
  label: string; value: string; sub?: string; accent?: string; info?: string; onClick?: () => void;
}) {
  return (
    <div className={`card p-4 ${onClick ? "card-hover cursor-pointer" : ""}`} onClick={onClick}
      role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wider text-faint">{label}</div>
        {info && <InfoTip text={info} />}
      </div>
      <div className="tabular mt-1.5 text-[26px] font-semibold leading-tight" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[13px] text-muted">{sub}</div>}
    </div>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <span className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-[var(--color-border)] text-[10px] text-faint" title={text}>
      i
    </span>
  );
}

export function SectionTitle({ title, desc, right }: { title: string; desc?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {desc && <p className="mt-1 max-w-2xl text-sm text-muted">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

/** Context line (spec §5.3) — above every analytical block. */
export function ContextLine({ filter }: { filter: Filter }) {
  return (
    <p className="mb-3 rounded-md bg-[var(--color-panel-2)] px-3 py-1.5 font-mono text-[11px] text-muted" title="Active calculation context — every number below uses exactly these parameters.">
      {contextLine(filter)}
    </p>
  );
}

/** Anomaly strength 0–100. Amber at most — never red on its own. */
export function AnomalyBadge({ score }: { score: number }) {
  const c = anomalyColor(score);
  return (
    <span className="tabular inline-flex min-w-[2.6rem] items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold"
      style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}
      title={`Anomaly strength ${score.toFixed(0)}/100 — how unusual the discrepancy is (magnitude, relative size, persistence, dynamics, unit-value). Says nothing about data quality.`}>
      A {score.toFixed(0)}
    </span>
  );
}

/** Evidence quality 0–100 — green/grey scale, never an accusation. */
export function EvidenceBadge({ score }: { score: number }) {
  const c = evidenceColor(score);
  return (
    <span className="tabular inline-flex min-w-[2.6rem] items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold"
      style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}
      title={`Evidence quality ${score.toFixed(0)}/100 — how reliable and comparable the underlying data is (coverage, reporter reliability, HS comparability, weight availability, freight robustness, transit exposure).`}>
      E {score.toFixed(0)}
    </span>
  );
}

export function ClassBadge({ cls }: { cls: SignalClass }) {
  const { t } = useI18n();
  const c = CLASS_COLORS[cls];
  return (
    <span className="cursor-help rounded-md border px-1.5 py-0.5 text-[11px] font-medium"
      style={{ color: c, borderColor: `color-mix(in srgb, ${c} 40%, transparent)`, background: `color-mix(in srgb, ${c} 7%, transparent)` }}
      title={CLASS_LABELS[cls].desc}>
      {t(`cls.${cls}` as never)}
    </span>
  );
}

export function RobustnessBadge({ r }: { r: Robustness }) {
  const { t } = useI18n();
  const c = r === "robust" ? "#15803d" : r === "insufficient" ? "#75847b" : "#b45309";
  return (
    <span className="rounded-md px-1.5 py-0.5 text-[11px] font-medium"
      style={{ color: c, background: `color-mix(in srgb, ${c} 10%, transparent)` }}
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
export function QualityTag({ tier, tip }: { tier: Tier; tip?: string }) {
  const c = tier === "High" ? "#15803d" : tier === "Medium" ? "#b45309" : "#75847b";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium"
      style={{ color: c, borderColor: `color-mix(in srgb, ${c} 35%, transparent)` }} title={tip ?? TIER_TIP[tier]}>
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      Data: {tier.toLowerCase()}
    </span>
  );
}

export function TransitTag() {
  return (
    <span className="cursor-help rounded-md px-1.5 py-0.5 text-[11px] font-medium"
      style={{ color: "var(--color-transit)", background: "color-mix(in srgb, var(--color-transit) 10%, transparent)" }}
      title="Transit / re-export hub. Uzbekistan records imports by country of ORIGIN while hubs report re-exports by consignment, so routed goods can create legitimate discrepancies. Assessed separately from core channels.">
      transit ⓘ
    </span>
  );
}

/** Evidence ladder (spec §2.4) — highlight = the highest level open data supports. */
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
      <div className="flex flex-wrap items-center gap-1.5">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className={`rounded-md border px-2 py-1 text-xs font-medium ${"current" in s && s.current ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)] text-[var(--color-primary)]" : s.active ? "border-[var(--color-border)] text-muted" : "border-dashed border-[var(--color-border)] text-faint"}`}
              title={s.active ? "Supported by open trade data" : s.n === 4 ? "Requires tariff/behavioural evidence — planned phase 2" : "Requires declarations, audit or administrative decision — never claimed on this site"}>
              {s.n}. {t(s.key as never)}
            </span>
            {i < steps.length - 1 && <span className="text-faint">›</span>}
          </div>
        ))}
      </div>
      {!compact && <p className="mt-2 max-w-3xl text-xs text-faint">{t("ov.ladder.note")}</p>}
    </div>
  );
}

export function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-[var(--color-panel-2)] px-2 py-0.5 text-xs font-medium text-muted">{children}</span>;
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
