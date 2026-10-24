"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import HeatGrid, { type HeatColumn, type HeatRow } from "@/components/charts/HeatGrid";
import MultiSelect from "@/components/MultiSelect";
import type { SearchOption } from "@/components/SearchSelect";
import QueueTable, { LEVEL_LABEL_KEYS, type HsLevel } from "@/components/QueueTable";
import YearSelect from "@/components/YearSelect";
import { EmptyState, InfoTip, PageHead, SectionTitle, TableReveal } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { labelsFor } from "@/lib/labels";
import { useMonthlyDetail } from "@/lib/use-monthly-detail";
import { channelsToCsv, downloadCsv } from "@/lib/export";
import { BAND_COLORS, BAND_INK, fmtNum, fmtPct, fmtUSD, fmtUSDFull } from "@/lib/format";
import { DEFAULT_FILTER, FREIGHT_SCENARIOS, aggregate, categoryLabel, needsMonthlyDetail, yearsFor, type Aggregate, type Channel, type Filter, type Granularity, type RiskBand } from "@/lib/dataset";

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
  const { t, lang } = useI18n();
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
  const channels = useMemo(() => levelChannels(data, level), [data, level]);

  const basisSuffix = granularity === "month" ? `-monthly${months.length ? `-m${months.join("_")}` : ""}` : "";
  const cifSuffix = cif === DEFAULT_FILTER.cif ? "" : `-f${Math.round(cif * 100)}`;
  const suffix = `${years.length === yearsFor(granularity).length ? "" : `-${years.join("_")}`}${basisSuffix}${cifSuffix}`;
  const exportCsv = () => downloadCsv(`discrepancy-risk-hs${level}${suffix}.csv`, channelsToCsv(channels, filter));

  /**
   * The band frames: for every listed pair, its band's pair count and volume
   * (positive discrepancy). Built from `channels`, so they follow the time
   * basis, period, months and freight scenario exactly as the table does.
   */
  const stats = useMemo(() => {
    const counts = { critical: 0, high: 0, elevated: 0, low: 0 } as Record<RiskBand, number>;
    const volume = { critical: 0, high: 0, elevated: 0, low: 0 } as Record<RiskBand, number>;
    let totalVolume = 0;
    for (const c of channels) {
      counts[c.band]++;
      volume[c.band] += c.posT;
      totalVolume += c.posT;
    }
    return { counts, volume, totalVolume, total: channels.length };
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

  /**
   * The summary grid above the ranking: the positive discrepancy of the listed
   * pairs by sector and risk category, and how many pairs make up each cell.
   * Sectors run largest first, the unclassified residual last.
   */
  const bandHeat = useMemo(() => labelsFor(lang, () => {
    const byCat = new Map<string, { values: number[]; counts: number[] }>();
    for (const c of channels) {
      let e = byCat.get(c.category);
      if (!e) { e = { values: BANDS.map(() => 0), counts: BANDS.map(() => 0) }; byCat.set(c.category, e); }
      const j = BANDS.indexOf(c.band);
      e.values[j] += c.posT;
      e.counts[j]++;
    }
    return [...byCat.entries()]
      .map(([key, e]) => ({ key, label: categoryLabel(key), values: e.values, counts: e.counts, total: e.values.reduce((a, b) => a + b, 0) }))
      .filter((r) => r.total > 0)
      .sort((a, b) => Number(a.key === "residual") - Number(b.key === "residual") || b.total - a.total);
  }), [channels, lang]);
  const bandRows = useMemo<HeatRow[]>(
    () => bandHeat.map((r) => ({ key: r.key, label: r.label, values: r.values, counts: r.counts })),
    [bandHeat],
  );
  const bandColumns = useMemo<HeatColumn[]>(() => BANDS.map((b) => ({
    key: b,
    label: t(`band.${b}` as never),
    sub: bandRange[b],
  })), [t, bandRange]);

  const levelName = t(LEVEL_LABEL_KEYS[level]);

  return (
    <div className="space-y-6">
      {/* header */}
      <PageHead
        title={
          <div className="space-y-1.5">
            <h1 className="whitespace-nowrap text-xl font-semibold tracking-tight sm:text-2xl">{t("nav.queue")}</h1>
            <p className="fs-13 text-muted">
              <Link href="/methodology" className="hover:underline">{t("nav.methodology")} →</Link>
            </p>
          </div>
        }
        right={
        <button
          onClick={exportCsv}
          disabled={channels.length === 0}
          className="no-print rounded-md border border-[var(--color-border)] px-2 py-1 fs-13 font-medium text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          title={`${t("risk.export.tip")} (${levelName})`}
        >
          {t("common.exportCsv")} ↓
        </button>
        }
      />

      {/* time basis + period selection — the whole page follows these ticks */}
      <section className="no-print flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="flex flex-col gap-1">
          <span className="fs-12.5 font-medium text-faint">{t("filter.granularity")}</span>
          <div className="flex h-[33px] overflow-hidden rounded-md border border-[var(--color-border)]" role="group" aria-label={t("filter.granularity")}>
            {(["year", "month"] as const).map((g) => (
              <button
                key={g}
                onClick={() => pickGranularity(g)}
                aria-pressed={granularity === g}
                className={`px-2.5 py-1.5 fs-13 whitespace-nowrap ${granularity === g ? "bg-[var(--color-primary-fill)] font-semibold text-white" : "bg-[var(--color-panel)] font-medium text-muted hover:text-foreground"}`}
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
          <span className="fs-12.5 font-medium text-faint">{t("filter.freight")}</span>
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

      {/* the frames — one per risk band: its volume, score range, pairs and share */}
      {years.length > 0 && channels.length > 0 && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {BANDS.map((b) => {
            const vol = stats.volume[b];
            const share = stats.totalVolume > 0 ? vol / stats.totalVolume : 0;
            const color = BAND_COLORS[b];
            const ink = BAND_INK[b];
            return (
              <div key={b} className="stat-card" style={{ ["--stat-rail" as string]: color }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="fs-12.5 font-medium leading-snug text-muted">
                    {fill(t("risk.band.title"), { band: t(`band.${b}` as never) })}
                  </div>
                  <span className="ml-auto flex items-center gap-1.5">
                  <span
                    className="tabular whitespace-nowrap rounded px-1.5 py-0.5 fs-12.5 font-semibold"
                    style={{ color: ink, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
                    title={t("risk.band.range")}
                  >
                    {bandRange[b]}
                  </span>
                  <InfoTip text={fill(t("risk.band.info"), {
                    n: fmtNum(stats.counts[b]), total: fmtNum(stats.total), level: levelName,
                    pct: stats.total > 0 ? fmtPct(stats.counts[b] / stats.total, 1) : "—",
                  })} />
                  </span>
                </div>
                <div className="mt-2 fs-12 text-faint">{t("kpi.positive")}</div>
                <div className="mt-1 tabular whitespace-nowrap fs-24 font-semibold leading-none tracking-tight" style={{ color: ink }} title={fmtUSDFull(vol)}>
                  {vol > 0 ? fmtUSD(vol) : "—"}
                </div>
                <dl className="mt-3 space-y-1 border-t border-[var(--color-border-soft)] pt-2 fs-13">
                  <div className="flex justify-between gap-2">
                    <dt className="text-faint">{t("risk.band.pairs")}</dt>
                    <dd className="tabular font-medium">{fmtNum(stats.counts[b])}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-faint">{t("risk.band.share")}</dt>
                    <dd className="tabular font-medium">{stats.totalVolume > 0 ? fmtPct(share, 1) : "—"}</dd>
                  </div>
                </dl>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-panel-2)]" aria-hidden>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, share * 100)}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* the summary: where the gap sits, by sector and risk category */}
      {years.length > 0 && bandHeat.length > 0 && (
        <section className="card p-4">
          <SectionTitle title={t("risk.heat.title")} desc={fill(t("risk.heat.sub"), { level: levelName })} />
          <HeatGrid
            rows={bandRows}
            columns={bandColumns}
            shareBasis="row"
            words={{
              amount: t("risk.mix.amount"), share: t("risk.mix.shareOfSector"), view: t("risk.mix.view"),
              rowHead: t("heat.sector"), all: t("heat.allSectors"), total: t("heat.total"),
              ofAll: t("heat.share"), shareOf: t("heat.ofSector"), products: t("risk.heat.products"),
              aria: t("risk.heat.title"),
            }}
          />
        </section>
      )}

      {/* the ranking */}
      {years.length > 0 && (
      <section className="space-y-3">
        <SectionTitle
          title={t("risk.ranked.title")}
          right={<InfoTip text={t("risk.ranked.info")} />}
        />
        <TableReveal>
          <QueueTable channels={channels} level={level} onLevelChange={setLevel} years={data.years} />
        </TableReveal>
      </section>
      )}
    </div>
  );
}
