"use client";

import { useMemo, useState } from "react";
import ValueMatrix, { type MatrixColumn, type MatrixRow } from "@/components/charts/ValueMatrix";
import MultiSelect from "@/components/MultiSelect";
import type { SearchOption } from "@/components/SearchSelect";
import QueueTable, { LEVEL_LABEL_KEYS, type HsLevel } from "@/components/QueueTable";
import YearSelect from "@/components/YearSelect";
import { EmptyState, InfoTip, PageHead, PosDefNote, SectionTitle, Segmented, TableReveal, TransitTag } from "@/components/ui";
import { BarList, KpiTile, Meter, Panel, ShareStrip, Takeaways, TrendFor, buildTrend, type BarItem, type Takeaway } from "@/components/summary";
import { useI18n } from "@/lib/i18n";
import { labelsFor } from "@/lib/labels";
import { productShortLabel } from "@/lib/short-labels";
import { useMonthlyDetail } from "@/lib/use-monthly-detail";
import { channelsToCsv, downloadCsv } from "@/lib/export";
import { BAND_COLORS, COLORS, fmtNum, fmtPct, fmtUSD, fmtUSDFull, monthRuns } from "@/lib/format";
import { DEFAULT_FILTER, FREIGHT_SCENARIOS, aggregate, categoryLabel, comparableMonthsOfYear, isDerivedYear, needsMonthlyDetail, yearsFor, type Aggregate, type Channel, type Filter, type Granularity, type RiskBand } from "@/lib/dataset";

/**
 * Discrepancy & Risk — the products ranking. Every partner × code pair at the
 * active HS level with a positive discrepancy, carrying the risk score
 * RS = 100 × √(G × P) and its band. Time basis, period and freight are the
 * page's only filters, and they deliberately do not read the shared filter
 * context: partner and HS selections made elsewhere never silently narrow it.
 *
 * The page leads with an executive summary in the Overview's reading order:
 * the gap and how much of it sits in the top two bands, one strip showing how
 * the bands split the gap against how they split the pairs, three takeaways,
 * then the largest Critical pairs and the risk mix by sector or country. The
 * sector × band matrix and the full ranking follow, each behind a reveal.
 *
 * Every level is measured on the same HS6 lines: an HS2 or HS4 pair's export,
 * import and discrepancy are the sums of its HS6 products, so the three tabs
 * total to the same trade.
 */

const levelChannels = (a: Aggregate, level: HsLevel): Channel[] =>
  level === 2 ? a.channels : level === 4 ? a.channels4 : a.channels6;

const BANDS: RiskBand[] = ["critical", "high", "elevated", "low"];
/**
 * Rows in each summary panel. The mix rows carry no second line, so the mix
 * panel lists more of them to end level with the ten pairs beside it: 13 is
 * every named sector, and the same depth of countries.
 */
const TOP_PAIRS = 10;
const TOP_MIX = 13;

type MixBy = "sector" | "country";

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
  const [mixBy, setMixBy] = useState<MixBy>("sector");
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
   * The summary grid behind the reveal: the positive discrepancy of the listed
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
  // the cells shade by amount in one navy, as the Products matrix does; the
  // band's own step marks only its heading — the paler steps would carry white
  // figures badly at full strength
  const bandColumns = useMemo<MatrixColumn[]>(() => BANDS.map((b) => ({
    label: t(`band.${b}` as never),
    sub: bandRange[b],
    color: COLORS.positive,
    mark: BAND_COLORS[b],
  })), [t, bandRange]);
  const bandMatrix = useMemo<MatrixRow[]>(() => bandHeat.map((r) => ({
    key: r.key,
    label: r.label,
    values: r.values,
    notes: r.counts.map((n) => (n > 0 ? `${fmtNum(n)} ${t("risk.heat.products")}` : null)),
  })), [bandHeat, t]);

  const levelName = t(LEVEL_LABEL_KEYS[level]);
  const bandName = (b: RiskBand) => t(`band.${b}` as never);
  const topBands = useMemo(() => ({ critical: t("band.critical"), high: t("band.high") }), [t]);

  /*
   * The summary's rollups, over the same listed pairs as the frames. The
   * residual chapters (98–99) are not comparable at product level, so they are
   * never named as a leading sector; they stay in the matrix behind the reveal.
   */
  const summary = useMemo(() => labelsFor(lang, () => {
    const byPartner = new Map<string, { iso: string; name: string; transit: boolean; values: number[]; total: number; nHigh: number }>();
    for (const c of channels) {
      const e = byPartner.get(c.partnerIso)
        ?? { iso: c.partnerIso, name: c.partner, transit: c.transit, values: BANDS.map(() => 0), total: 0, nHigh: 0 };
      e.values[BANDS.indexOf(c.band)] += c.posT;
      e.total += c.posT;
      if (c.band === "critical" || c.band === "high") e.nHigh++;
      byPartner.set(c.partnerIso, e);
    }
    const highOf = (values: number[]) => values[0] + values[1];
    const countries = [...byPartner.values()]
      .filter((e) => e.total > 0)
      .map((e) => ({ ...e, high: highOf(e.values) }))
      .sort((a, b) => b.high - a.high || b.total - a.total);
    const sectors = bandHeat
      .filter((r) => r.key !== "residual")
      .map((r) => ({ ...r, high: highOf(r.values) }))
      .sort((a, b) => b.high - a.high || b.total - a.total);
    const topCritical = channels
      .filter((c) => c.band === "critical" && c.posT > 0)
      .sort((a, b) => b.posT - a.posT)
      .slice(0, TOP_PAIRS);
    return { countries, sectors, topCritical };
  }), [channels, bandHeat, lang]);

  /*
   * The headline's trend: the whole window on the same basis and freight, the
   * selected periods marked. With every period selected — the default — it is
   * the page's own aggregate, so nothing is computed twice.
   */
  const fullWindow = years.length === yearsFor(granularity).length && months.length === 0;
  const trend = useMemo(() => {
    // every year named: an empty list reads the annual book only and drops the derived years
    const series = fullWindow ? data : aggregate({ ...filter, years: [...yearsFor(granularity)], months: [] });
    const partialOf = (y: number) => (isDerivedYear(y) && comparableMonthsOfYear(y).length < 12
      ? monthRuns(comparableMonthsOfYear(y), (n) => t(`month.${n}` as never))
      : undefined);
    return buildTrend(series.annual, { years, months }, partialOf);
  }, [fullWindow, data, filter, years, months, granularity, t]);

  const highVol = stats.volume.critical + stats.volume.high;
  const highCount = stats.counts.critical + stats.counts.high;
  const share = (v: number) => (stats.totalVolume > 0 ? v / stats.totalVolume : 0);

  const takeaways = useMemo<Takeaway[]>(() => {
    const out: Takeaway[] = [];
    if (stats.totalVolume <= 0) return out;
    if (stats.counts.critical > 0) {
      out.push({
        key: "critical",
        figure: fmtPct(stats.volume.critical / stats.totalVolume, 1),
        text: fill(t("risk.tk.critical"), {
          band: topBands.critical,
          pairPct: fmtPct(stats.counts.critical / stats.total, 1),
        }),
        accent: BAND_COLORS.critical,
      });
    }
    const sector = [...summary.sectors].sort((a, b) => b.values[0] - a.values[0])[0];
    if (sector && sector.values[0] > 0) {
      out.push({
        key: "sector",
        figure: fmtUSD(sector.values[0]),
        text: fill(t("risk.tk.sector"), {
          sector: sector.label,
          band: topBands.critical,
          pct: fmtPct(sector.values[0] / stats.volume.critical, 1),
        }),
        accent: BAND_COLORS.critical,
      });
    }
    const country = summary.countries[0];
    if (country && country.high > 0) {
      out.push({
        key: "country",
        figure: fmtUSD(country.high),
        text: fill(t("risk.tk.country"), { country: country.name, ...topBands }),
        // the one caveat that changes how the figure reads; counts stay in the table
        meta: country.transit ? t("risk.tk.transit") : undefined,
        accent: BAND_COLORS.high,
        href: `/savdo/partners/${country.iso.toLowerCase()}`,
        cta: t("nav.partners"),
      });
    }
    return out;
  }, [stats, summary, topBands, t]);

  const pairItems = useMemo<BarItem[]>(() => labelsFor(lang, () => summary.topCritical.map((c) => ({
    key: `${c.partnerIso}|${c.cmd}`,
    label: c.partner,
    title: `${c.partner} · HS ${c.cmd} · ${c.cmdLabel}`,
    badge: c.transit ? <TransitTag /> : undefined,
    meta: `${productShortLabel(c.cmd, lang)} · HS ${c.cmd}`,
    value: c.posT,
    valueText: fmtUSD(c.posT),
    note: fill(t("risk.top.score"), { score: c.mtrs.toFixed(0) }),
    href: `/savdo/partners/${c.partnerIso.toLowerCase()}`,
  }))), [summary, lang, t]);

  const mixItems = useMemo<BarItem[]>(() => {
    // the parts run Critical → Low from the baseline, so the top two bands'
    // share reads as the left of every bar and shrinks down the ranking; each
    // part's amount is in its hover, and in the matrix behind the reveal
    const segs = (values: number[]) => BANDS.map((b, j) => ({
      key: b, value: values[j], color: BAND_COLORS[b], label: t(`band.${b}` as never), valueText: fmtUSD(values[j]),
    }));
    if (mixBy === "sector") {
      return summary.sectors.slice(0, TOP_MIX).map((r) => ({
        key: r.key,
        label: r.label,
        value: r.total,
        valueText: fmtUSD(r.total),
        note: fmtPct(r.total > 0 ? r.high / r.total : 0, 1),
        segments: segs(r.values),
      }));
    }
    return summary.countries.slice(0, TOP_MIX).map((r) => ({
      key: r.iso,
      label: r.name,
      badge: r.transit ? <TransitTag /> : undefined,
      value: r.total,
      valueText: fmtUSD(r.total),
      note: fmtPct(r.total > 0 ? r.high / r.total : 0, 1),
      segments: segs(r.values),
      href: `/savdo/partners/${r.iso.toLowerCase()}`,
    }));
  }, [summary, mixBy, t]);

  const ready = years.length > 0 && channels.length > 0;

  return (
    <div className="space-y-6">
      {/* header */}
      <PageHead
        title={<h1 className="whitespace-nowrap text-xl font-semibold tracking-tight sm:text-2xl">{t("nav.queue")}</h1>}
        link={{ href: "/savdo/methodology", label: t("nav.methodology") }}
        definition={false}
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
        {/* what the figure below is, beside the control that moves it most */}
        <PosDefNote />
      </section>

      {years.length === 0 && <EmptyState text={t("common.noPeriod")} />}
      {years.length > 0 && channels.length === 0 && <EmptyState />}

      {/* 1. one row: the gap, how much of it is high-risk, and how the bands split it */}
      {ready && (
        // one row from 1280px; below it the band card takes the full width under the two tiles
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            hero
            label={t("kpi.positive")}
            value={fmtUSD(stats.totalVolume)}
            sub={fill(t("risk.kpi.pairsSub"), { n: fmtNum(stats.total), level: levelName })}
            info={`${fill(t("prof.stat.positive.info"), { cif: Math.round(cif * 100) })} ${fmtUSDFull(stats.totalVolume)}.`}
            footer={<TrendFor points={trend} />}
          />
          {/* the high-risk figure, and how its two bands make it up against the whole gap */}
          <KpiTile
            label={fill(t("risk.kpi.highRisk"), topBands)}
            value={fmtUSD(highVol)}
            sub={fill(t("risk.kpi.highRiskSub"), { pct: fmtPct(share(highVol), 1), n: fmtNum(highCount) })}
            accent={BAND_COLORS.critical}
            info={t("risk.kpi.highRisk.info")}
            footer={
              <Meter
                of={stats.totalVolume}
                ariaLabel={t("kpi.positive")}
                segments={(["critical", "high"] as RiskBand[]).map((b) => ({
                  key: b, value: stats.volume[b], color: BAND_COLORS[b], label: bandName(b), valueText: fmtUSD(stats.volume[b]),
                }))}
                caption={
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {(["critical", "high"] as RiskBand[]).map((b) => (
                      <span key={b} className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-sm" style={{ background: BAND_COLORS[b] }} />
                        {bandName(b)} <span className="tabular">{fmtPct(share(stats.volume[b]), 1)}</span>
                      </span>
                    ))}
                  </span>
                }
              />
            }
          />

          {/* one strip, the four bands' figures beneath it; pair counts and
              score ranges are in each part's hover */}
          <div className="card flex min-w-0 flex-col p-4 sm:col-span-2">
            <div className="mb-2.5 flex items-start justify-between gap-3">
              <h2 className="fs-15 font-bold tracking-tight">{t("risk.mix.title")}</h2>
              <InfoTip text={`${t("risk.tip.band")} ${t("risk.tip.riskValue")}`} />
            </div>
            <ShareStrip
              height={28}
              title={t("risk.mix.title")}
              ariaLabel={t("risk.mix.title")}
              segments={BANDS.map((b) => ({
                key: b,
                value: stats.volume[b],
                color: BAND_COLORS[b],
                text: fmtPct(share(stats.volume[b]), 1),
                label: bandName(b),
                detail: `${fmtUSD(stats.volume[b])} · ${fmtPct(share(stats.volume[b]), 1)}`,
                more: [
                  {
                    label: t("risk.mix.byPairs"),
                    value: `${fmtNum(stats.counts[b])} · ${fmtPct(stats.total > 0 ? stats.counts[b] / stats.total : 0, 1)}`,
                  },
                  { label: t("prof.th.score"), value: bandRange[b] },
                ],
              }))}
            />
            <dl className="mt-auto grid grid-cols-2 gap-x-4 gap-y-2 pt-3 sm:grid-cols-4">
              {BANDS.map((b) => (
                <div key={b} className="min-w-0">
                  <dt className="flex items-center gap-1.5 fs-12.5 font-medium text-muted" title={t(`band.desc.${b}` as never)}>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: BAND_COLORS[b] }} />
                    {bandName(b)}
                  </dt>
                  {/* amount over share, so a narrow column never runs one into the next */}
                  <dd className="mt-1 whitespace-nowrap fs-18 font-semibold leading-none tracking-tight" title={fmtUSDFull(stats.volume[b])}>
                    {stats.volume[b] > 0 ? fmtUSD(stats.volume[b]) : "—"}
                  </dd>
                  <dd className="tabular mt-0.5 fs-12.5 text-faint">{fmtPct(share(stats.volume[b]), 1)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}

      {/* 2. what the numbers say */}
      {ready && <Takeaways title={t("sum.takeaways")} items={takeaways} />}

      {/* 3. where to look first: the largest Critical pairs, and the risk mix */}
      {ready && (
        <section className="space-y-2">
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title={fill(t("risk.top.title"), { band: topBands.critical })} desc={t("risk.top.desc")}>
              {pairItems.length === 0
                ? <EmptyState />
                : <BarList items={pairItems} ranked color={BAND_COLORS.critical} ariaLabel={fill(t("risk.top.title"), { band: topBands.critical })} />}
            </Panel>
            <Panel
              title={mixBy === "sector" ? t("risk.dist.sectors") : t("risk.dist.countries")}
              desc={fill(t("risk.dist.desc"), topBands)}
              right={
                <Segmented<MixBy>
                  value={mixBy}
                  onChange={setMixBy}
                  ariaLabel={t("risk.dist.aria")}
                  options={[
                    { key: "sector", label: t("risk.dist.tabSectors") },
                    { key: "country", label: t("risk.dist.tabCountries") },
                  ]}
                />
              }
            >
              {/* the key to the colours, and to the percentage at each row's end */}
              <div className="mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-2 fs-12 text-muted" aria-hidden>
                <span className="flex flex-wrap gap-x-3 gap-y-1">
                  {BANDS.map((b) => (
                    <span key={b} className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: BAND_COLORS[b] }} />
                      {bandName(b)}
                    </span>
                  ))}
                </span>
                <span className="text-faint">{fill(t("risk.dist.pct"), topBands)}</span>
              </div>
              <BarList items={mixItems} ariaLabel={mixBy === "sector" ? t("risk.dist.sectors") : t("risk.dist.countries")} />
            </Panel>
          </div>
          <p className="fs-12.5 leading-relaxed text-faint">{t("risk.note")}</p>
        </section>
      )}

      {/* 4. the full picture behind the summary: where the gap sits, by sector and risk category */}
      {years.length > 0 && bandHeat.length > 0 && (
        <section>
          <SectionTitle title={t("risk.heat.title")} desc={fill(t("risk.heat.sub"), { level: levelName })} />
          <TableReveal showLabel={t("common.showBreakdown")} hideLabel={t("common.hideBreakdown")}>
            <div className="card p-4">
              <ValueMatrix
                rows={bandMatrix}
                columns={bandColumns}
                totalWord={t("heat.total")}
                totalRowLabel={t("heat.allSectors")}
                shareWord={t("heat.share")}
                rowTitle={t("heat.sector")}
                ariaLabel={t("risk.heat.title")}
              />
            </div>
          </TableReveal>
        </section>
      )}

      {/* 5. the ranking */}
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
