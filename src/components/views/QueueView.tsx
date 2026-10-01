"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import MultiSelect from "@/components/MultiSelect";
import type { SearchOption } from "@/components/SearchSelect";
import QueueTable, { LEVEL_LABEL_KEYS, type HsLevel } from "@/components/QueueTable";
import YearSelect from "@/components/YearSelect";
import { EmptyState, InfoTip, SectionTitle, Stat } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { useMonthlyDetail } from "@/lib/use-monthly-detail";
import { channelsToCsv, downloadCsv } from "@/lib/export";
import { BAND_COLORS, COLORS, fmtNum, fmtPct } from "@/lib/format";
import { DEFAULT_FILTER, FREIGHT_SCENARIOS, aggregate, needsMonthlyDetail, yearsFor, type Aggregate, type Channel, type Filter, type Granularity, type RiskBand } from "@/lib/dataset";

/**
 * Discrepancy & Risk — the products ranking. Every partner × code pair at the
 * active HS level with a positive discrepancy, carrying the risk score
 * RS = 100 × √(G × P) and its band. Time basis, period and freight are the
 * page's only filters, and they deliberately do not read the shared filter
 * context: partner and HS selections made elsewhere never silently narrow it.
 *
 * Every level is measured on the same HS6 lines: an HS2 or HS4 pair's export,
 * import and discrepancy are the sums of its HS6 products, so the three tabs
 * total to the same trade.
 */

const levelChannels = (a: Aggregate, level: HsLevel): Channel[] =>
  level === 2 ? a.channels : level === 4 ? a.channels4 : a.channels6;

const BANDS: RiskBand[] = ["critical", "high", "elevated", "low"];

const fill = (s: string, vals: Record<string, string | number>) =>
  Object.entries(vals).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

export default function QueueView() {
  const { t } = useI18n();
  const [level, setLevel] = useState<HsLevel>(6);
  /** The page's controls: the time basis and which periods the screening covers. */
  const [granularity, setGranularity] = useState<Granularity>("year");
  const [years, setYears] = useState<number[]>(() => [...yearsFor("year")]);
  const [months, setMonths] = useState<number[]>([]);
  const [cif, setCif] = useState<number>(DEFAULT_FILTER.cif);
  // monthly HS4/HS6 arrive from an on-demand fetch; recompute when they land
  const detailVer = useMonthlyDetail(granularity === "month" || years.some(needsMonthlyDetail));

  const pickGranularity = (g: Granularity) => {
    if (g === granularity) return;
    setGranularity(g);
    setMonths([]);
    // keep only years the target basis actually carries; empty means the full window
    const window = yearsFor(g);
    const kept = years.filter((y) => window.includes(y));
    setYears(kept.length ? kept : [...window]);
  };

  const monthOptions = useMemo<SearchOption[]>(
    () => Array.from({ length: 12 }, (_, i) => ({
      value: String(i + 1),
      label: t(`month.${i + 1}` as never),
    })),
    [t],
  );

  const filter = useMemo<Filter>(
    () => ({ ...DEFAULT_FILTER, granularity, years, months, cif }),
    [granularity, years, months, cif],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const data = useMemo(() => aggregate(filter), [filter, detailVer]);
  const channels = levelChannels(data, level);

  const basisSuffix = granularity === "month" ? `-monthly${months.length ? `-m${months.join("_")}` : ""}` : "";
  const cifSuffix = cif === DEFAULT_FILTER.cif ? "" : `-f${Math.round(cif * 100)}`;
  const suffix = `${years.length === yearsFor(granularity).length ? "" : `-${years.join("_")}`}${basisSuffix}${cifSuffix}`;
  const exportCsv = () => downloadCsv(`discrepancy-risk-hs${level}${suffix}.csv`, channelsToCsv(channels, filter));

  /** The frames: score range over the scored pairs, and every listed pair by band. */
  const stats = useMemo(() => {
    const counts = { critical: 0, high: 0, elevated: 0, low: 0 } as Record<RiskBand, number>;
    for (const c of channels) counts[c.band]++;
    const scored = channels.filter((c) => c.scored);
    if (scored.length === 0) return { counts, total: channels.length, scored: 0, top: null, bottom: null, mean: 0 };
    let top = scored[0], bottom = scored[0], sum = 0;
    for (const c of scored) {
      if (c.mtrs > top.mtrs) top = c;
      if (c.mtrs < bottom.mtrs) bottom = c;
      sum += c.mtrs;
    }
    return { counts, total: channels.length, scored: scored.length, top, bottom, mean: sum / scored.length };
  }, [channels]);

  /** Score range of each band at the level listed, from the cut-offs fitted on this period. */
  const bandRange = useMemo<Record<RiskBand, string>>(() => {
    const c = data.bandCuts[level];
    const n = (v: number) => v.toFixed(1);
    return {
      critical: `≥ ${n(c.critical)}`,
      high: `${n(c.high)} – ${n(c.critical)}`,
      elevated: `${n(c.elevated)} – ${n(c.high)}`,
      low: `< ${n(c.elevated)}`,
    };
  }, [data, level]);

  const levelName = t(LEVEL_LABEL_KEYS[level]);
  const pairOf = (c: Channel) => `${c.partner} × HS ${c.cmd}`;
  const gp = (c: Channel) => `G ${c.abnormalGap.toFixed(2)} × P ${c.persistence.toFixed(2)} → RS ${c.mtrs.toFixed(1)}`;

  return (
    <div className="space-y-6">
      {/* header */}
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("nav.queue")}</h1>
          <p className="fs-13 text-muted">
            <Link href="/methodology" className="hover:underline">{t("nav.methodology")} →</Link>
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={channels.length === 0}
          className="no-print rounded-md border border-[var(--color-border)] px-2 py-1 fs-13 font-medium text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          title={`${t("risk.export.tip")} (${levelName})`}
        >
          {t("common.exportCsv")} ↓
        </button>
      </section>

      {/* time basis + period selection — the whole page follows these ticks */}
      <section className="no-print flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="flex flex-col gap-1">
          <span className="fs-11.5 font-semibold uppercase tracking-wider text-faint">{t("filter.granularity")}</span>
          <div className="flex h-[33px] overflow-hidden rounded-md border border-[var(--color-border)]" role="group" aria-label={t("filter.granularity")}>
            {(["year", "month"] as const).map((g) => (
              <button
                key={g}
                onClick={() => pickGranularity(g)}
                aria-pressed={granularity === g}
                className={`px-2.5 py-1.5 fs-13 whitespace-nowrap ${granularity === g ? "bg-[var(--color-primary)] font-semibold text-white" : "bg-[var(--color-panel)] font-medium text-muted hover:text-foreground"}`}
              >
                {t(g === "year" ? "gran.year" : "gran.month")}
              </button>
            ))}
          </div>
        </div>
        <YearSelect years={years} onChange={setYears} available={yearsFor(granularity)} />
        {granularity === "month" && (
          <MultiSelect
            values={months.map(String)}
            onChange={(v) => setMonths(v.map(Number).sort((a, b) => a - b))}
            options={monthOptions}
            label={t("filter.months")}
            allLabel={t("filter.allMonths")}
            selectAll
            searchable={false}
          />
        )}
        {/* freight scenario moves the gap values and their share — never the
            score, which stays fitted at the central rate (see Methodology) */}
        <div className="flex flex-col gap-1" title={t("filter.freight.tip")}>
          <span className="fs-11.5 font-semibold uppercase tracking-wider text-faint">{t("filter.freight")}</span>
          <select
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] h-[33px] px-2 py-1.5 fs-13 text-foreground outline-none focus:border-[var(--color-primary)]"
            aria-label={t("filter.freight")}
            value={cif}
            onChange={(e) => setCif(+e.target.value)}
          >
            {FREIGHT_SCENARIOS.map((f) => (
              <option key={f} value={f}>
                {f === 0 ? t("filter.freightNone") : `${Math.round(f * 100)}%`}
              </option>
            ))}
          </select>
        </div>
      </section>

      {years.length === 0 && <EmptyState text={t("common.noPeriod")} />}

      {/* the frames — the score range, then the pairs in each band */}
      {years.length > 0 && stats.top && stats.bottom && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-6 lg:grid-cols-12">
          <div className="col-span-2 sm:col-span-2 lg:col-span-4">
            <Stat label={t("risk.stat.highest")} value={stats.top.mtrs.toFixed(0)} accent={COLORS.positive}
              info={`${t("risk.stat.highest.info")} (${levelName}): ${pairOf(stats.top)}; ${gp(stats.top)}.${stats.top.transit ? ` ${t("risk.stat.highest.infoTransit")}` : ""}`} />
          </div>
          <div className="col-span-1 sm:col-span-2 lg:col-span-4">
            <Stat label={t("risk.stat.mean")} value={stats.mean.toFixed(0)} accent={COLORS.navy2}
              info={`${fill(t("risk.stat.mean.info"), { n: fmtNum(stats.scored), level: levelName, mean: stats.mean.toFixed(1) })} ${t("risk.score.info")}`} />
          </div>
          <div className="col-span-1 sm:col-span-2 lg:col-span-4">
            <Stat label={t("risk.stat.lowest")} value={stats.bottom.mtrs.toFixed(0)} accent={COLORS.navy3}
              info={`${t("risk.stat.lowest.info")} (${levelName}): ${pairOf(stats.bottom)}; ${gp(stats.bottom)}.`} />
          </div>
          {BANDS.map((b) => (
            <div key={b} className="col-span-1 sm:col-span-3 lg:col-span-3">
              <Stat
                label={fill(t("risk.stat.bandPairs"), { band: t(`band.${b}` as never) })}
                value={fmtNum(stats.counts[b])}
                accent={BAND_COLORS[b]}
                info={`${fill(t("risk.stat.bandPairs.info"), {
                  n: fmtNum(stats.counts[b]), total: fmtNum(stats.total), level: levelName,
                  pct: stats.total > 0 ? fmtPct(stats.counts[b] / stats.total, 1) : "—",
                })} ${fill(t("risk.stat.bandRange"), { range: bandRange[b] })}`}
              />
            </div>
          ))}
        </section>
      )}

      {/* the ranking */}
      {years.length > 0 && (
      <section className="space-y-3">
        <SectionTitle
          title={t("risk.ranked.title")}
          right={<InfoTip text={t("risk.ranked.info")} />}
        />
        <QueueTable channels={channels} level={level} onLevelChange={setLevel} years={data.years} />
      </section>
      )}
    </div>
  );
}
