"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import QueueTable, { LEVEL_LABEL_KEYS, type HsLevel } from "@/components/QueueTable";
import YearSelect from "@/components/YearSelect";
import { BandBadge, InfoTip, SectionTitle, Stat, TransitTag } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { channelsToCsv, downloadCsv } from "@/lib/export";
import { COLORS, fmtNum, fmtPct, fmtUSD } from "@/lib/format";
import {
  aggregate, DEFAULT_FILTER, meta, partnerEffects, partnerMetaOf, RISK_CONFIG, yearsLabel,
  type Aggregate, type Channel, type Filter, type RiskBand,
} from "@/lib/dataset";

/**
 * Discrepancy & Risk — the screening queue. Every partner × code combination at
 * the active HS level, carrying the MTRS v3.0 score, its two components and its
 * band. Period is the page's only filter, and it deliberately does not read the
 * shared filter context: partner and HS selections made elsewhere never silently
 * narrow the queue.
 *
 * The score itself is pooled over the whole window, so ticking years changes
 * which rows are listed and how large their gap is, not how a cell scores.
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
  /** The one control on this page: which years the screening covers. */
  const [years, setYears] = useState<number[]>(() => [...meta.years]);

  const filter = useMemo<Filter>(() => ({ ...DEFAULT_FILTER, years }), [years]);
  const data = useMemo(() => aggregate(filter), [filter]);
  const channels = levelChannels(data, level);

  const suffix = years.length === meta.years.length ? "" : `-${years.join("_")}`;
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
              UN Comtrade · {yearsLabel(years)} · {t("risk.header.screening")}
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

      {/* period selection — the whole page follows these ticks */}
      <section className="no-print">
        <YearSelect years={years} onChange={setYears} />
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
              info={`${t("risk.stat.highest.info")} (${t(LEVEL_LABEL_KEYS[level])}): G ${riskStats.top.abnormalGap.toFixed(2)} × P ${riskStats.top.persistence.toFixed(2)} → MTRS ${riskStats.top.mtrs.toFixed(1)}.${riskStats.top.transit ? ` ${t("risk.stat.highest.infoTransit")}` : ""}`}
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
