"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import MultiSelect from "@/components/MultiSelect";
import type { SearchOption } from "@/components/SearchSelect";
import QueueTable, { LEVEL_LABEL_KEYS, type HsLevel } from "@/components/QueueTable";
import YearSelect from "@/components/YearSelect";
import { BandBadge, InfoTip, SectionTitle, Stat } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { useMonthlyDetail } from "@/lib/use-monthly-detail";
import { channelsToCsv, downloadCsv } from "@/lib/export";
import { COLORS, fmtNum } from "@/lib/format";
import diagnosticsRaw from "@/data/diagnostics.json";
import type { LocaleKey } from "@/lib/locales";
import { DEFAULT_FILTER, FREIGHT_SCENARIOS, aggregate, isDerivedYear, meta, yearsFor, yearsLabel, type Aggregate, type Channel, type Filter, type Granularity, type RiskBand } from "@/lib/dataset";

/**
 * Discrepancy & Risk — the screening queue. Every partner × code combination at
 * the active HS level, carrying the risk score RS = 100 × √(G × P), its two
 * components and its band. Time basis and period are the page's only filters, and they deliberately
 * do not read the shared filter context: partner and HS selections made
 * elsewhere never silently narrow the queue.
 *
 * The score is fitted on the whole yearly window, so the basis and period ticks
 * change which rows are listed and how large their gap is, not how a cell
 * scores; monthly-only combinations the yearly books never matched are listed
 * unscored.
 */

const levelChannels = (a: Aggregate, level: HsLevel): Channel[] =>
  level === 2 ? a.channels : level === 4 ? a.channels4 : a.channels6;

/** Percentile with linear interpolation over an ascending-sorted array. */
function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

const TH = "px-3 py-1.5 text-left text-[10.5px] font-medium text-faint whitespace-nowrap";
const TH_NUM = `${TH} text-right`;
const TD = "px-3 py-1.5 align-middle text-[13px]";
const TD_NUM = `${TD} tabular text-right whitespace-nowrap`;

const BANDS: RiskBand[] = ["critical", "high", "elevated", "low"];

/** Band cut-offs are fitted per HS level, so the legend quotes the live level. */
const BAND_CUTS = (diagnosticsRaw as unknown as {
  bandCuts: Record<string, { critical: number; high: number; elevated: number }>;
}).bandCuts;

export default function QueueView() {
  const { t } = useI18n();
  const [level, setLevel] = useState<HsLevel>(2);
  /** The page's controls: the time basis and which periods the screening covers. */
  const [granularity, setGranularity] = useState<Granularity>("year");
  const [years, setYears] = useState<number[]>(() => [...meta.years]);
  const [months, setMonths] = useState<number[]>([]);
  const [cif, setCif] = useState<number>(DEFAULT_FILTER.cif);
  // monthly HS4/HS6 arrive from an on-demand fetch; recompute when they land
  const detailVer = useMonthlyDetail(granularity === "month" || years.some(isDerivedYear));

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

  const stats = useMemo(() => {
    const counts = { critical: 0, high: 0, elevated: 0, low: 0 } as Record<RiskBand, number>;
    for (const c of channels) counts[c.band]++;
    return { counts };
  }, [channels]);

  const riskStats = useMemo(() => {
    if (channels.length === 0) return null;
    const top = channels.reduce((m, c) => (c.mtrs > m.mtrs ? c : m), channels[0]);
    const vals = channels.map((c) => c.mtrs).sort((a, b) => a - b);
    return { top, median: quantile(vals, 0.5) };
  }, [channels]);

  /** Score ranges quoted beside each band, at the HS level currently listed. */
  const bandRanges = useMemo<Record<RiskBand, string>>(() => {
    const c = BAND_CUTS[String(level)] ?? BAND_CUTS["6"];
    const n = (v: number) => v.toFixed(1);
    return {
      critical: `≥ ${n(c.critical)}`,
      high: `${n(c.high)} – ${n(c.critical)}`,
      elevated: `${n(c.elevated)} – ${n(c.high)}`,
      low: `< ${n(c.elevated)}`,
    };
  }, [level]);

  return (
    <div className="space-y-6">
      {/* header */}
      <section className="space-y-1.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <p className="text-[10.5px] font-medium text-faint">
              UN Comtrade · {yearsLabel(years)}
              {granularity === "month" ? ` · ${t("gran.month").toLowerCase()}${months.length ? `: ${months.join(", ")}` : ""}` : ""} · {t("filter.freight").toLowerCase()} {Math.round(cif * 100)}% · {t("risk.header.screening")}
            </p>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("nav.queue")}</h1>
            <p className="text-[13px] text-muted">
              <Link href="/methodology" className="hover:underline">{t("nav.methodology")} →</Link>
            </p>
          </div>
          <button
            onClick={exportCsv}
            disabled={channels.length === 0}
            className="no-print rounded-md border border-[var(--color-border)] px-2 py-1 text-[12px] font-medium text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            title={`${t("risk.export.tip")} (${t(LEVEL_LABEL_KEYS[level])})`}
          >
            {t("common.exportCsv")} ↓
          </button>
        </div>
      </section>

      {/* time basis + period selection — the whole page follows these ticks */}
      <section className="no-print flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">{t("filter.granularity")}</span>
          <div className="flex overflow-hidden rounded-md border border-[var(--color-border)]" role="group" aria-label={t("filter.granularity")}>
            {(["year", "month"] as const).map((g) => (
              <button
                key={g}
                onClick={() => pickGranularity(g)}
                aria-pressed={granularity === g}
                className={`px-2.5 py-1.5 text-[12px] whitespace-nowrap ${granularity === g ? "bg-[var(--color-primary)] font-semibold text-white" : "bg-[var(--color-panel)] font-medium text-muted hover:text-foreground"}`}
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
            searchable={false}
          />
        )}
        {/* freight scenario moves the gap values and Gap % — never the score,
            which stays fitted at the central rate (see Methodology) */}
        <div className="flex flex-col gap-1" title={t("filter.freight.tip")}>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">{t("filter.freight")}</span>
          <select
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1.5 text-[13px] text-foreground outline-none focus:border-[var(--color-primary)]"
            aria-label={t("filter.freight")}
            value={cif}
            onChange={(e) => setCif(+e.target.value)}
          >
            {FREIGHT_SCENARIOS.map((f) => (
              <option key={f} value={f}>
                {Math.round(f * 100)}%
                {f === meta.cif.central ? ` (${t("filter.central")})` : ""}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* MTRS summary */}
      <section className="space-y-3">
        <SectionTitle
          title={t("risk.score.title")}
          right={<InfoTip text={t("risk.score.info")} />}
        />
        {riskStats && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Stat
              label={t("risk.stat.highest")}
              value={riskStats.top.mtrs.toFixed(0)}
              sub={`${riskStats.top.partner} × HS ${riskStats.top.cmd}${riskStats.top.transit ? ` · ${t("risk.transitHub")}` : ""}`}
              info={`${t("risk.stat.highest.info")} (${t(LEVEL_LABEL_KEYS[level])}): G ${riskStats.top.abnormalGap.toFixed(2)} × P ${riskStats.top.persistence.toFixed(2)} → RS ${riskStats.top.mtrs.toFixed(1)}.${riskStats.top.transit ? ` ${t("risk.stat.highest.infoTransit")}` : ""}`}
              accent={COLORS.positive}
            />
            <Stat
              label={t("risk.stat.median")}
              value={riskStats.median.toFixed(0)}
              sub={`${fmtNum(channels.length)} ${t("risk.combinationsCount")}`}
              info={t("risk.stat.median.info")}
            />
            <Stat
              label={t("risk.stat.flagged")}
              value={fmtNum(stats.counts.critical + stats.counts.high)}
              sub={`${fmtNum(stats.counts.critical)} ${t("band.critical")} · ${fmtNum(stats.counts.high)} ${t("band.high")}`}
              info={t("risk.stat.flagged.info")}
            />
          </div>
        )}
      </section>

      {/* ranked queue */}
      <section className="space-y-3">
        <SectionTitle
          title={t("risk.ranked.title")}
          desc={t("risk.ranked.desc")}
          right={<InfoTip text={t("risk.ranked.info")} />}
        />

        <QueueTable channels={channels} level={level} onLevelChange={setLevel} filter={filter} years={data.years} />
      </section>

      {/* what the bands mean — read after the queue, so the ranks above have context */}
      <section className="space-y-3">
        <SectionTitle
          title={t("risk.bands.title")}
          desc={t("risk.bands.desc")}
          right={<InfoTip text={t("risk.bands.info")} />}
        />
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="border-b border-[var(--color-border)]">
              <tr>
                <th className={TH}>{t("risk.th.band")}</th>
                <th className={TH}>{t("risk.bands.colScore")}</th>
                <th className={TH}>{t("risk.bands.colWhere")}</th>
                <th className={TH_NUM}>{t("risk.bands.colCells")}</th>
                <th className={TH}>{t("risk.bands.colMeans")}</th>
              </tr>
            </thead>
            <tbody className="zebra">
              {BANDS.map((b) => (
                <tr key={b} className="border-b border-[var(--color-border-soft)] last:border-0">
                  <td className={`${TD} whitespace-nowrap`}><BandBadge band={b} /></td>
                  <td className={`${TD} tabular whitespace-nowrap`}>{bandRanges[b]}</td>
                  <td className={`${TD} whitespace-nowrap`}>{t(`risk.bands.${b}.where` as LocaleKey)}</td>
                  <td className={TD_NUM}>{fmtNum(stats.counts[b])}</td>
                  <td className={TD}>{t(`risk.bands.${b}.means` as LocaleKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="max-w-3xl text-xs text-faint">{t("risk.bands.footnote")}</p>
      </section>
    </div>
  );
}
