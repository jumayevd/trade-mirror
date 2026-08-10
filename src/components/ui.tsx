"use client";

import { anomalyColor, evidenceColor, CLASS_COLORS, COLORS } from "@/lib/format";
import { contextLine, type Filter, type Robustness, type SignalClass, type Tier } from "@/lib/dataset";
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
        <div className="text-[10.5px] font-semibold uppercase leading-snug tracking-[0.08em] text-muted">{label}</div>
        {info && <InfoTip text={info} />}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[24px] font-semibold leading-none tracking-tight" style={accent ? { color: accent } : undefined}>
          {value}
        </span>
        {delta && (
          <span className="text-[11px] font-medium" style={{ color: deltaGood ? "var(--color-ok)" : "var(--color-serious)" }}>
            {delta}
          </span>
        )}
      </div>
      {sub && <div className="mt-1.5 text-[11.5px] leading-snug text-faint">{sub}</div>}
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
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {desc && <p className="mt-0.5 max-w-2xl text-[12.5px] leading-relaxed text-muted">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

/** Context line (spec §5.3) — quiet, single line, above analytical blocks. */
export function ContextLine({ filter }: { filter: Filter }) {
  const { t } = useI18n();
  return (
    <p className="mb-3 truncate font-mono text-[10.5px] text-faint" title={t("qual.ui.contextTip")}>
      {contextLine(filter)}
    </p>
  );
}

/* ---------- chips: identity comes from a small colored dot beside ink text ---------- */

function DotChip({ dot, children, title, className = "" }: { dot?: string; children: React.ReactNode; title?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-1.5 py-px text-[10.5px] font-medium leading-4 text-muted ${className}`} title={title}>
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}

export function AnomalyBadge({ score }: { score: number }) {
  const { t } = useI18n();
  return (
    <DotChip dot={anomalyColor(score)} title={fill(t("qual.ui.anomalyTip"), { score: score.toFixed(0) })}>
      A {score.toFixed(0)}
    </DotChip>
  );
}

export function EvidenceBadge({ score }: { score: number }) {
  const { t } = useI18n();
  return (
    <DotChip dot={evidenceColor(score)} title={fill(t("qual.ui.evidenceTip"), { score: score.toFixed(0) })}>
      E {score.toFixed(0)}
    </DotChip>
  );
}

/** Composite risk score: bold number + mini track bar, coloured by the signal class. */
export function RiskScore({ score, cls }: { score: number; cls: SignalClass }) {
  const { t } = useI18n();
  return (
    <span
      className="inline-flex flex-col gap-[3px]"
      title={fill(t("qual.ui.riskTip"), { score: score.toFixed(0) })}
    >
      <span className="tabular text-[13px] font-semibold leading-none">{score.toFixed(0)}</span>
      <span className="h-[3px] w-8 overflow-hidden rounded-full bg-[var(--color-panel-2)]">
        <span className="block h-full rounded-full" style={{ width: `${Math.min(score, 100)}%`, background: CLASS_COLORS[cls] }} />
      </span>
    </span>
  );
}

export function ClassBadge({ cls }: { cls: SignalClass }) {
  const { t } = useI18n();
  return (
    <DotChip dot={CLASS_COLORS[cls]} title={t(`qual.ui.clsDesc.${cls}` as never)}>
      {t(`cls.${cls}` as never)}
    </DotChip>
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
            <span className={`rounded-md border px-1.5 py-0.5 text-[11px] ${"current" in s && s.current ? "border-[var(--color-primary)] font-semibold text-[var(--color-primary)]" : s.active ? "border-[var(--color-border)] text-muted" : "border-dashed border-[var(--color-border)] text-faint"}`}
              title={s.active ? t("qual.ui.ladder.tipOpen") : s.n === 4 ? t("qual.ui.ladder.tipBehavioural") : t("qual.ui.ladder.tipVerified")}>
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
  return <span className="rounded-md border border-[var(--color-border)] px-1.5 py-px text-[10.5px] font-medium text-muted">{children}</span>;
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
