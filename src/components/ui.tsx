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
    <div className={`card p-3.5 ${onClick ? "card-hover cursor-pointer" : ""}`} onClick={onClick}
      role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">{label}</div>
        {info && <InfoTip text={info} />}
      </div>
      <div className="tabular mt-1 text-[21px] font-semibold leading-tight" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs leading-snug text-muted">{sub}</div>}
    </div>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <span className="inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full border border-[var(--color-border)] text-[9px] leading-none text-faint" title={text}>
      i
    </span>
  );
}

export function SectionTitle({ title, desc, right }: { title: string; desc?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {desc && <p className="mt-0.5 max-w-2xl text-[12.5px] leading-relaxed text-muted">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

/** Context line (spec §5.3) — quiet, single line, above analytical blocks. */
export function ContextLine({ filter }: { filter: Filter }) {
  return (
    <p className="mb-3 truncate font-mono text-[10.5px] text-faint" title="Active calculation context — every number below uses exactly these parameters.">
      {contextLine(filter)}
    </p>
  );
}

/* ---------- quiet chip primitives ---------- */

function chip(color?: string) {
  return {
    className: "inline-flex items-center gap-1 rounded border px-1.5 py-px text-[10.5px] font-medium leading-4",
    style: {
      color: color ?? "var(--color-muted)",
      borderColor: "var(--color-border)",
      background: "var(--color-panel)",
    } as React.CSSProperties,
  };
}

/** Anomaly strength 0–100 — number-first, subtle color. */
export function AnomalyBadge({ score }: { score: number }) {
  const p = chip(anomalyColor(score));
  return (
    <span {...p} title={`Anomaly strength ${score.toFixed(0)}/100 — how unusual the discrepancy is (magnitude, relative size, persistence, dynamics, unit values). Says nothing about data quality.`}>
      A·{score.toFixed(0)}
    </span>
  );
}

/** Evidence quality 0–100. */
export function EvidenceBadge({ score }: { score: number }) {
  const p = chip(evidenceColor(score));
  return (
    <span {...p} title={`Evidence quality ${score.toFixed(0)}/100 — how reliable and comparable the underlying data is (coverage, reporter reliability, HS comparability, weight availability, freight robustness, transit exposure).`}>
      E·{score.toFixed(0)}
    </span>
  );
}

export function ClassBadge({ cls }: { cls: SignalClass }) {
  const { t } = useI18n();
  const c = CLASS_COLORS[cls];
  return (
    <span className="inline-flex items-center gap-1.5 rounded border px-1.5 py-px text-[10.5px] font-medium leading-4"
      style={{ color: cls === "low" ? "var(--color-muted)" : c, borderColor: "var(--color-border)", background: "var(--color-panel)" }}
      title={CLASS_LABELS[cls].desc}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {t(`cls.${cls}` as never)}
    </span>
  );
}

export function RobustnessBadge({ r }: { r: Robustness }) {
  const { t } = useI18n();
  const p = chip(r === "robust" ? "#2f7d4f" : "var(--color-muted)");
  return (
    <span {...p} title={`Robustness: ${ROBUSTNESS_LABELS[r]}. Robust = the sign holds at 6%, 10% and 15% freight, with enough comparable years and no major quality flags.`}>
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
  const c = tier === "High" ? "#2f7d4f" : tier === "Medium" ? "#a16207" : "#8a948e";
  return (
    <span className="inline-flex items-center gap-1.5 rounded border px-1.5 py-px text-[10.5px] font-medium leading-4"
      style={{ color: "var(--color-muted)", borderColor: "var(--color-border)" }} title={tip ?? TIER_TIP[tier]}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      data {tier.toLowerCase()}
    </span>
  );
}

export function TransitTag() {
  const p = chip("var(--color-transit)");
  return (
    <span {...p} className={`${p.className} cursor-help`}
      title="Transit / re-export hub. Uzbekistan records imports by country of ORIGIN while hubs report re-exports by consignment, so routed goods can create legitimate discrepancies. Assessed separately from core channels.">
      transit
    </span>
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
            <span className={`rounded border px-1.5 py-0.5 text-[11px] ${"current" in s && s.current ? "border-[var(--color-primary)] font-semibold text-[var(--color-primary)]" : s.active ? "border-[var(--color-border)] text-muted" : "border-dashed border-[var(--color-border)] text-faint"}`}
              title={s.active ? "Supported by open trade data" : s.n === 4 ? "Requires tariff/behavioural evidence — planned phase 2" : "Requires declarations, audit or administrative decision — never claimed on this site"}>
              {s.n} · {t(s.key as never)}
            </span>
            {i < steps.length - 1 && <span className="text-[10px] text-faint">›</span>}
          </div>
        ))}
      </div>
      {!compact && <p className="mt-1.5 max-w-3xl text-[11px] text-faint">{t("ov.ladder.note")}</p>}
    </div>
  );
}

export function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded border border-[var(--color-border)] px-1.5 py-px text-[10.5px] font-medium text-muted">{children}</span>;
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
