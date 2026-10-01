"use client";

import { useMemo, useState } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import PartnerChannels, { type ChannelRow } from "@/app/partners/[iso]/PartnerChannels";
import { Stat, TransitTag, EmptyState, Segmented } from "@/components/ui";
import MultiSelect from "@/components/MultiSelect";
import type { SearchOption } from "@/components/SearchSelect";
import YearSelect from "@/components/YearSelect";
import { useMonthlyDetail } from "@/lib/use-monthly-detail";
import {
  aggregate, DEFAULT_FILTER, FREIGHT_SCENARIOS, needsMonthlyDetail, partnerMetaOf,
  yearsFor, yearsLabel, type Filter, type Granularity,
} from "@/lib/dataset";
import { channelsToCsv } from "@/lib/export";
import { useI18n } from "@/lib/i18n";
import { labelsFor } from "@/lib/labels";
import { fmtUSD, fmtUSDFull, fmtPct, fmtNum, COLORS } from "@/lib/format";

/**
 * Partner profile — one country in depth, reduced to its figures.
 *
 * Six frames and one table, all computed from the partner's HS6 lines for the
 * selected period and freight scenario. Export and Import are the lines'
 * values where the partner's exports exceed Uzbekistan's imports, so the
 * frames check by hand: Exports − Imports ÷ (1 + freight) = Positive
 * discrepancy, and its share = Positive discrepancy ÷ Exports. The product
 * narrowing lives on the table, whose total row is the sum of its HS6 rows —
 * HS2 and HS4 figures are therefore derived from HS6, never read separately.
 *
 * Risk bands are cut against the whole cross-section of the period (every
 * partner's HS6 lines), not against this partner alone, so "Critical" means
 * the same here as on Country Analysis.
 */

/** Fill {placeholders} in a translated string with dataset values. */
const fill = (s: string, vals: Record<string, string | number>) =>
  Object.entries(vals).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

export default function PartnerProfileView({ iso }: { iso: string }) {
  const { t, lang } = useI18n();
  const ISO = useMemo(() => iso.toUpperCase(), [iso]);
  const pm0 = partnerMetaOf(ISO);

  /** The page's own controls. Every year is ticked by default. */
  const [granularity, setGranularity] = useState<Granularity>("year");
  const [years, setYears] = useState<number[]>(() => [...yearsFor("year")]);
  const [months, setMonths] = useState<number[]>([]);
  const [cif, setCif] = useState<number>(DEFAULT_FILTER.cif);
  const detailVer = useMonthlyDetail(granularity === "month" || years.some(needsMonthlyDetail));

  const viewFilter = useMemo<Filter>(() => ({
    ...DEFAULT_FILTER,
    minGap: 0,
    country: [ISO],
    granularity,
    years,
    months,
    cif,
  }), [ISO, granularity, years, months, cif]);

  const FULL = useMemo(
    () => labelsFor(lang, () => aggregate(viewFilter)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewFilter, lang, detailVer],
  );

  const pickGranularity = (g: Granularity) => {
    if (g === granularity) return;
    setGranularity(g);
    setMonths([]);
    const window = yearsFor(g);
    const kept = years.filter((y) => window.includes(y));
    setYears(kept.length ? kept : [...window]);
  };

  const monthOptions = useMemo<SearchOption[]>(
    () => Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: t(`month.${i + 1}` as never) })),
    [t],
  );

  const controls = (
    <section className="no-print flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="flex flex-col gap-1">
        <span className="fs-11.5 font-semibold uppercase tracking-wider text-faint">{t("filter.granularity")}</span>
        <Segmented<Granularity>
          ariaLabel={t("filter.granularity")}
          value={granularity}
          onChange={pickGranularity}
          options={[{ key: "year", label: t("gran.year") }, { key: "month", label: t("gran.month") }]}
        />
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
      <div className="flex flex-col gap-1" title={t("filter.freight.tip")}>
        <span className="fs-11.5 font-semibold uppercase tracking-wider text-faint">{t("filter.freight")}</span>
        <select
          aria-label={t("filter.freight")}
          value={cif}
          onChange={(e) => setCif(+e.target.value)}
          className="h-[33px] rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 fs-13 text-foreground outline-none focus:border-[var(--color-primary)]"
        >
          {FREIGHT_SCENARIOS.map((f) => (
            <option key={f} value={f}>
              {f === 0 ? t("filter.freightNone") : `${Math.round(f * 100)}%`}
            </option>
          ))}
        </select>
      </div>
    </section>
  );

  if (!pm0) notFound();

  const p = FULL.partners.find((x) => x.iso3 === ISO);
  const name = labelsFor(lang, () => pm0.name);
  const period = yearsLabel(years);

  const header = (
    <div>
      <Link href="/partners" className="text-sm text-muted hover:text-foreground">← {t("prof.back")}</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
        <span className="text-sm text-faint">{pm0.region}</span>
        {pm0.transit && <TransitTag />}
      </div>
    </div>
  );

  // a narrow enough period can leave this partner with nothing comparable —
  // that is an empty result, not a missing page
  if (!p) {
    return (
      <div className="space-y-6">
        {header}
        {controls}
        <EmptyState />
      </div>
    );
  }

  const cifPct = Math.round(cif * 100);

  // every HS6 product both books reported for this partner in the period —
  // the table's rows, the product count and the critical share's denominator
  const hs6 = FULL.baseChannels6.filter((c) => c.partnerIso === p.iso3);
  const criticalHs6 = hs6.filter((c) => c.band === "critical").length;
  const rows: ChannelRow[] = hs6.map((c) => ({
    cmd: c.cmd, label: c.cmdLabel, chapter: c.chapter, hs4: c.cmd.slice(0, 4),
    band: c.band, mtrs: c.mtrs,
    pePosT: c.pePosT, uiPosT: c.uiPosT, posT: c.posT,
  }));
  const posShare = p.pePosT > 0 ? p.posT / p.pePosT : 0;

  const csv = channelsToCsv(hs6, viewFilter);
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${csv}`)}`;

  return (
    <div className="space-y-8">
      {header}
      {controls}

      {/* the six frames — two rows of three: the trade, then its risk */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label={t("prof.stat.exports")} value={fmtUSD(p.pePosT)} accent={COLORS.navy2}
          info={`${t("prof.stat.exports.info")} ${period}: ${fmtUSDFull(p.pePosT)}.`} />
        <Stat label={t("prof.stat.imports")} value={fmtUSD(p.uiPosT)} accent={COLORS.navy2}
          info={`${t("prof.stat.imports.info")} ${period}: ${fmtUSDFull(p.uiPosT)}.`} />
        <Stat label={t("kpi.positive")} value={fmtUSD(p.posT)} accent={COLORS.positive}
          info={`${fill(t("prof.stat.positive.info"), { cif: cifPct })} ${fmtUSDFull(p.posT)}.`} />
        <Stat label={t("prof.stat.share")} value={fmtPct(posShare, 1)} accent={COLORS.positive}
          info={`${t("prof.stat.share.info")} ${fmtUSDFull(p.posT)} ÷ ${fmtUSDFull(p.pePosT)}.`} />
        <Stat label={t("prof.stat.hs6Channels")} value={fmtNum(hs6.length)} accent={COLORS.navy3}
          info={t("prof.stat.hs6Channels.info")} />
        <Stat label={t("prof.stat.criticalHs6")} value={fmtNum(criticalHs6)} accent={COLORS.investigate}
          info={`${fill(t("prof.stat.criticalOfAll"), {
            n: fmtNum(criticalHs6), total: fmtNum(hs6.length),
            pct: hs6.length > 0 ? fmtPct(criticalHs6 / hs6.length, 1) : "—",
          })} ${t("prof.stat.criticalHs6.info")}`} />
      </section>

      <PartnerChannels iso={p.iso3} rows={rows} />

      {/* transit & attribution note */}
      {pm0.transit && (
        <section className="card p-5" style={{ borderLeft: `2px solid ${COLORS.transit}` }}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider" style={{ color: COLORS.transit }}>
            {t("prof.transit.title")}
          </h2>
          <p className="max-w-3xl text-sm leading-relaxed text-muted">
            {fill(t("prof.transit.body"), { name })}
          </p>
        </section>
      )}

      {/* downloads */}
      <section className="card flex flex-wrap items-center gap-4 p-5">
        <div className="min-w-[240px] flex-1">
          <h2 className="text-sm font-semibold">{t("prof.downloads")}</h2>
          <p className="mt-1 text-xs text-muted">
            {fill(t("prof.dl.desc"), { n: hs6.length, name, period })}
          </p>
        </div>
        <a
          href={csvHref}
          download={`partner_${p.iso3}_hs6_channels.csv`}
          className="rounded-md border border-[var(--color-border)] px-3 py-2 fs-13 font-medium text-muted hover:text-foreground"
        >
          {t("common.exportCsv")} ↓
        </a>
      </section>
    </div>
  );
}
