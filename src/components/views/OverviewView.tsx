"use client";

import Link from "next/link";
import FilterBar from "@/components/FilterBar";
import TrendChart from "@/components/charts/TrendChart";
import { Stat, SectionTitle, ContextLine, EvidenceLadder, AnomalyBadge, EvidenceBadge, ClassBadge, RobustnessBadge, TransitTag, EmptyState } from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import { meta } from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";
import { fmtUSD, fmtPct, COLORS } from "@/lib/format";

const CAN = [
  "Identify where partner-reported exports and Uzbekistan's import records diverge, and by how much under stated freight scenarios.",
  "Separate discrepancies with complete, comparable data from cases driven by missing reporting, transit routing or residual codes.",
  "Rank country × HS6 channels by anomaly strength and evidence quality as priorities for further statistical or customs review.",
  "Show whether a discrepancy is persistent across years and robust to the freight assumption.",
];
const CANNOT = [
  "Prove smuggling, fraud, illegal imports or any specific violation — that requires declarations, audit or inspection (evidence level 5).",
  "Measure the size of the shadow economy or precise budget losses.",
  "Attribute a discrepancy to a single cause: valuation, timing, classification, re-export and reporting differences all contribute.",
  "Establish that any named country or company acted improperly.",
];

export default function OverviewView() {
  const { data, series, filter } = useFilter();
  const { t } = useI18n();
  const k = data.kpis;
  const top = data.channels6.slice(0, 8);
  const flipPct = fmtPct(k.flipShare, 0);

  return (
    <div className="space-y-8">
      {/* 1. hero / purpose */}
      <section className="space-y-3">
        <p className="text-xs uppercase tracking-wider text-faint">
          UN Comtrade · {meta.window.start}–{meta.window.end} · statistical reconciliation & risk screening
        </p>
        <h1 className="max-w-4xl text-2xl font-semibold tracking-tight sm:text-[32px] sm:leading-tight">
          {t("ov.question")}
        </h1>
        <p className="max-w-3xl text-[15px] leading-relaxed text-muted">
          Every trade flow is recorded at least twice — as a partner&apos;s export and as Uzbekistan&apos;s
          import. This platform systematically detects where the two diverge, tests how robust and
          well-evidenced each divergence is, and prioritises channels for further review.
        </p>
        <p className="max-w-3xl rounded-md border-l-2 border-l-[var(--color-primary)] bg-[var(--color-panel)] px-4 py-2.5 text-sm text-muted">
          <strong className="text-foreground">{t("ov.disclaimer")}</strong>
        </p>
      </section>

      {/* 2. evidence ladder */}
      <section className="card p-4">
        <h2 className="mb-2 text-sm font-semibold">{t("ov.ladder")}</h2>
        <EvidenceLadder />
      </section>

      <FilterBar />
      <ContextLine filter={filter} />

      {/* 3. KPI row */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label={t("kpi.comparableTrade")} value={fmtUSD(k.comparableTrade)} sub={t("kpi.comparableTrade.sub")}
          info="Partner-reported exports (FOB) in channels where both sides reported for the selected period — the denominator of the analysis." />
        <Stat label={t("kpi.positive")} value={fmtUSD(k.positive.central)} sub={t("kpi.positive.sub")} accent={COLORS.positive}
          info="Σ max(expected CIF − UZB imports, 0) per channel-year. Expected CIF = partner exports × (1 + freight)." />
        <Stat label={t("kpi.reverse")} value={fmtUSD(k.reverse)} sub={t("kpi.reverse.sub")} accent={COLORS.reverse}
          info="Σ max(UZB imports − expected CIF, 0). Shown separately — never netted away against positive discrepancies." />
        <Stat label={t("kpi.absolute")} value={fmtUSD(k.absolute)} sub={t("kpi.absolute.sub")}
          info="Positive + reverse: the total two-sided asymmetry." />
        <Stat label={t("kpi.coverage")} value={fmtPct(k.coveragePct, 0)} sub={t("kpi.coverage.sub")}
          info="Share of partner-years in the selected period where the partner actually reported. Missing partner-years are never treated as zero flows." />
        <Stat label={t("kpi.robust")} value={String(k.robustSignals)} sub={t("kpi.robust.sub")} accent="var(--color-primary)"
          info="HS6 channels classified Investigate (high anomaly + high evidence) whose sign holds across the whole 6–15% freight band." />
      </section>

      {/* 4. uncertainty band */}
      <section className="card p-4">
        <SectionTitle title={t("ov.uncertainty")} desc={t("ov.uncertainty.desc")} />
        <div className="flex flex-wrap items-center gap-6">
          <UncBar low={k.positive.low} central={k.positive.central} high={k.positive.high} />
          <p className="max-w-xs text-xs text-muted">
            {fmtUSD(k.positive.low)} at 6% freight · {fmtUSD(k.positive.central)} at 10% ·{" "}
            {fmtUSD(k.positive.high)} at 15%. <strong className="text-foreground">{flipPct}</strong> of
            comparable channels change sign across this band (freight-sensitive).
          </p>
        </div>
      </section>

      {/* 5. reconciliation funnel */}
      <section className="card p-4">
        <SectionTitle title={t("ov.funnel")} desc="How observation channels narrow from everything observed to residual unexplained discrepancies." />
        <Funnel
          steps={[
            { label: `${t("ov.ladder.observed")} / ${t("ov.ladder.comparable")}`, count: data.funnel.comparableChannels, value: data.funnel.comparableValue, note: "channels with both sides reported (value = partner exports)" },
            { label: t("stage.residual"), count: data.funnel.residualChannels, value: data.funnel.residualValue, note: "pass transit/residual/coverage/freight flags (value = positive discrepancy)" },
            { label: t("kpi.robust"), count: k.robustSignals, value: null, note: "Investigate class, robust across the freight band (HS6)" },
          ]}
        />
      </section>

      {/* 7. trend (full window) */}
      <section>
        <SectionTitle title={t("ov.trend")} desc={`Full ${meta.window.start}–${meta.window.end} window under the current filters. Amber: positive discrepancy. Blue: reverse. Line: comparable partners per year.`} />
        <TrendChart annual={series.annual} />
      </section>

      {/* 8. top signals */}
      <section>
        <SectionTitle title={t("ov.topSignals")}
          desc="Country × HS6 channels ranked by class, anomaly strength and evidence quality under the current filters."
          right={<Link href="/risk" className="text-sm font-medium text-[var(--color-primary)] hover:underline">{t("nav.queue")} →</Link>} />
        {top.length === 0 ? <EmptyState /> : (
          <div className="card zebra divide-y divide-[var(--color-border-soft)]">
            {top.map((c) => (
              <div key={`${c.partnerIso}-${c.cmd}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
                <ClassBadge cls={c.cls} />
                <AnomalyBadge score={c.anomaly} />
                <EvidenceBadge score={c.evidence} />
                <Link href={`/channels/${c.partnerIso.toLowerCase()}/${c.cmd}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                  {c.partner} · {c.cmdLabel} <span className="tabular text-xs text-faint">HS {c.cmd}</span>
                </Link>
                {c.transit && <TransitTag />}
                <RobustnessBadge r={c.robustness} />
                <span className="tabular w-24 text-right text-sm" style={{ color: c.signedT >= 0 ? COLORS.positive : COLORS.reverse }}>
                  {fmtUSD(c.primary)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 9. what can / cannot be concluded */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--color-quality)" }}>{t("ov.can")}</h3>
          <ul className="space-y-2 text-sm text-muted">
            {CAN.map((x, i) => <li key={i} className="flex gap-2"><span style={{ color: "var(--color-quality)" }}>✓</span><span>{x}</span></li>)}
          </ul>
        </div>
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold text-[var(--color-investigate)]">{t("ov.cannot")}</h3>
          <ul className="space-y-2 text-sm text-muted">
            {CANNOT.map((x, i) => <li key={i} className="flex gap-2"><span className="text-[var(--color-investigate)]">✕</span><span>{x}</span></li>)}
          </ul>
        </div>
      </section>
    </div>
  );
}

function UncBar({ low, central, high }: { low: number; central: number; high: number }) {
  const max = Math.max(high, 1);
  const pct = (v: number) => `${(v / max) * 100}%`;
  return (
    <div className="min-w-[260px] flex-1">
      <div className="relative h-8 overflow-hidden rounded-md bg-[var(--color-panel-2)]">
        <div className="absolute inset-y-0 left-0 rounded-md" style={{ width: pct(high), background: "color-mix(in srgb, var(--color-positive) 18%, transparent)" }} />
        <div className="absolute inset-y-0 left-0 rounded-md" style={{ width: pct(low), background: "color-mix(in srgb, var(--color-positive) 38%, transparent)" }} />
        <div className="absolute inset-y-0 w-[3px] bg-[var(--color-positive)]" style={{ left: pct(central) }} title={`Central (10%): ${fmtUSD(central)}`} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-faint">
        <span>6%: {fmtUSD(low)}</span><span>10%: {fmtUSD(central)}</span><span>15%: {fmtUSD(high)}</span>
      </div>
    </div>
  );
}

function Funnel({ steps }: { steps: { label: string; count: number; value: number | null; note: string }[] }) {
  const max = Math.max(...steps.map((s) => s.count), 1);
  return (
    <div className="space-y-2">
      {steps.map((s) => (
        <div key={s.label} className="flex items-center gap-3">
          <span className="w-52 shrink-0 truncate text-sm text-muted" title={s.note}>{s.label}</span>
          <div className="h-6 flex-1 overflow-hidden rounded bg-[var(--color-panel-2)]">
            <div className="flex h-full items-center rounded bg-[color-mix(in_srgb,var(--color-primary)_22%,transparent)] px-2 text-[11px] font-medium text-[var(--color-primary)]"
              style={{ width: `${Math.max(4, (s.count / max) * 100)}%` }}>
              {s.count.toLocaleString()}
            </div>
          </div>
          <span className="tabular w-20 shrink-0 text-right text-sm text-muted">{s.value != null ? fmtUSD(s.value) : "—"}</span>
        </div>
      ))}
    </div>
  );
}
