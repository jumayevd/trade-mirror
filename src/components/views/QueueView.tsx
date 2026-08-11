"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import MultiSelect from "@/components/MultiSelect";
import type { SearchOption } from "@/components/SearchSelect";
import QueueTable, { LEVEL_LABEL_KEYS, type HsLevel } from "@/components/QueueTable";
import YearSelect from "@/components/YearSelect";
import { BandBadge, InfoTip, SectionTitle, Stat, TransitTag } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { useMonthlyDetail } from "@/lib/use-monthly-detail";
import { channelsToCsv, downloadCsv } from "@/lib/export";
import { COLORS, fmtNum, fmtPct, fmtUSD } from "@/lib/format";
import {
  aggregate, DEFAULT_FILTER, meta, partnerEffects, partnerMetaOf, RISK_CONFIG, yearsFor, yearsLabel,
  type Aggregate, type Channel, type Filter, type Granularity, type RiskBand,
} from "@/lib/dataset";

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

export default function QueueView() {
  const { t } = useI18n();
  const [level, setLevel] = useState<HsLevel>(2);
  /** The page's controls: the time basis and which periods the screening covers. */
  const [granularity, setGranularity] = useState<Granularity>("year");
  const [years, setYears] = useState<number[]>(() => [...meta.years]);
  const [months, setMonths] = useState<number[]>([]);
  // monthly HS4/HS6 arrive from an on-demand fetch; recompute when they land
  const detailVer = useMonthlyDetail(granularity === "month");

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
    () => ({ ...DEFAULT_FILTER, granularity, years, months }),
    [granularity, years, months],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const data = useMemo(() => aggregate(filter), [filter, detailVer]);
  const channels = levelChannels(data, level);

  const basisSuffix = granularity === "month" ? `-monthly${months.length ? `-m${months.join("_")}` : ""}` : "";
  const suffix = `${years.length === yearsFor(granularity).length ? "" : `-${years.join("_")}`}${basisSuffix}`;
  const exportCsv = () => downloadCsv(`discrepancy-risk-hs${level}${suffix}.csv`, channelsToCsv(channels, filter));

  const stats = useMemo(() => {
    const sorted = [...channels].sort((a, b) => b.posT - a.posT);
    const total = sorted.reduce((s, c) => s + c.posT, 0);
    const top5 = sorted.slice(0, 5).reduce((s, c) => s + c.posT, 0);
    const counts = { critical: 0, high: 0, elevated: 0, low: 0 } as Record<RiskBand, number>;
    for (const c of channels) counts[c.band]++;
    return { counts, top5Share: total > 0 ? top5 / total : 0, total };
  }, [channels]);

  const riskStats = useMemo(() => {
    if (channels.length === 0) return null;
    const top = channels.reduce((m, c) => (c.mtrs > m.mtrs ? c : m), channels[0]);
    const vals = channels.map((c) => c.mtrs).sort((a, b) => a - b);
    return { top, median: quantile(vals, 0.5) };
  }, [channels]);

  const effects = useMemo(() => partnerEffects(level).slice(0, 12), [level]);

  return (
    <div className="space-y-6">
      {/* header */}
      <section className="space-y-1.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <p className="text-[10.5px] font-medium text-faint">
              UN Comtrade · {yearsLabel(years)}
              {granularity === "month" ? ` · ${t("gran.month").toLowerCase()}${months.length ? `: ${months.join(", ")}` : ""}` : ""} · {t("risk.header.screening")}
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

        <p className="max-w-3xl text-[12px] text-muted">
          <span className="tabular font-medium text-foreground">{fmtNum(channels.length)}</span>{" "}
          {t(LEVEL_LABEL_KEYS[level])} {t("risk.combinationsCount")}
          · {t("risk.top5")} = <span className="tabular font-medium text-foreground">{fmtPct(stats.top5Share, 0)}</span> ({fmtUSD(stats.total)})
          · <span className="cursor-help" title={t("risk.floor.tip")}>{t("risk.floor.label")} ${fmtNum(RISK_CONFIG.materialityFloor)}</span>
        </p>

        <QueueTable channels={channels} level={level} onLevelChange={setLevel} filter={filter} years={data.years} />
      </section>

      {/* partner reporting-discrepancy indicator (u_p) */}
      <section className="space-y-3">
        <SectionTitle
          title={t("risk.effects.title")}
          desc={t("risk.effects.desc")}
          right={<InfoTip text={t("risk.effects.info")} />}
        />
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse">
            <thead className="border-b border-[var(--color-border)]">
              <tr>
                <th className={TH}>{t("common.partner")}</th>
                <th className={TH_NUM} title={t("risk.effects.uTip")}>{t("risk.effects.uCol")}</th>
                <th className={TH_NUM}>{t("risk.effects.cellsCol")}</th>
              </tr>
            </thead>
            <tbody className="zebra">
              {effects.map((e) => {
                const pm = partnerMetaOf(e.iso);
                return (
                  <tr key={e.iso} className="border-b border-[var(--color-border-soft)] last:border-0">
                    <td className={`${TD} whitespace-nowrap`}>
                      <Link href={`/partners/${e.iso.toLowerCase()}`} className="font-medium hover:underline">
                        {pm?.name ?? e.iso}
                      </Link>
                      {pm?.transit && <span className="ml-1.5"><TransitTag /></span>}
                    </td>
                    <td className={TD_NUM}>{e.u > 0 ? "+" : ""}{e.u.toFixed(2)}</td>
                    <td className={TD_NUM}>{fmtNum(e.cells)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="max-w-3xl text-xs text-faint">{t("risk.effects.footnote")}</p>
      </section>

      {/* band legend */}
      <section className="flex flex-wrap items-center gap-2">
        {(["critical", "high", "elevated", "low"] as RiskBand[]).map((b) => (
          <span key={b} className="inline-flex items-center gap-1.5">
            <BandBadge band={b} />
            <span className="tabular text-[11px] text-faint">{fmtNum(stats.counts[b])}</span>
          </span>
        ))}
      </section>
    </div>
  );
}
