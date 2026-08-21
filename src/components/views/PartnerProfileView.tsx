"use client";

import { useMemo, useState } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import PartnerGaps from "@/components/charts/PartnerGaps";
import PartnerChannels, { type ChannelRow, type ChapterRow } from "@/app/partners/[iso]/PartnerChannels";
import { Stat, SectionTitle, ContextLine, QualityTag, TransitTag, EmptyState, Segmented } from "@/components/ui";
import MultiSelect from "@/components/MultiSelect";
import type { SearchOption } from "@/components/SearchSelect";
import YearSelect from "@/components/YearSelect";
import { useMonthlyDetail } from "@/lib/use-monthly-detail";
import {
  aggregate, meta, DEFAULT_FILTER, isDerivedYear, partnerMetaOf, isResidualChapter,
  yearsFor, yearsLabel, type Aggregate, type Filter, type Granularity,
} from "@/lib/dataset";
import { channelsToCsv } from "@/lib/export";
import { useI18n } from "@/lib/i18n";
import { labelsFor } from "@/lib/labels";
import type { Lang } from "@/lib/locales";
import { fmtUSD, fmtUSDFull, fmtPct, COLORS } from "@/lib/format";

/**
 * Partner profile (spec §6.6) — one partner country in depth. Computes its own
 * full-window aggregate with explicit filters (every year ticked, no materiality
 * floor) so the profile is stable regardless of the visitor's interactive filter
 * state elsewhere on the site.
 */
const FULL_FILTER: Filter = {
  ...DEFAULT_FILTER,
  years: [...meta.years],
  minGap: 0,
};
/** Latest single year — the one-year callout inside the executive summary. */
const SNAP_FILTER: Filter = { ...DEFAULT_FILTER, years: [meta.defaultYear], minGap: 0 };
const WINDOW = meta.years;

/**
 * Names inside an aggregate are localised as it is built, so the profile keeps
 * one aggregate per language — computed lazily on first use and shared by every
 * profile page thereafter. Without this the module-level aggregate would be
 * frozen in whatever language was active at first load.
 *
 * This one spans the whole window with no product filter: it is what the
 * pickers offer, so narrowing the page never removes the option that would
 * widen it again. The figures come from a second aggregate built from the
 * live controls.
 */
const AGG_CACHE = new Map<Lang, { full: Aggregate; snap: Aggregate }>();
function aggFor(lang: Lang): { full: Aggregate; snap: Aggregate } {
  let e = AGG_CACHE.get(lang);
  if (!e) {
    e = { full: aggregate(FULL_FILTER), snap: aggregate(SNAP_FILTER) };
    AGG_CACHE.set(lang, e);
  }
  return e;
}

/** Distinct codes as picker options, ascending, labelled with their description. */
function codeOptions(rows: { cmd: string; cmdLabel: string }[]): SearchOption[] {
  const m = new Map<string, string>();
  for (const r of rows) m.set(r.cmd, r.cmdLabel);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([cmd, label]) => ({ value: cmd, code: cmd, label }));
}

/** Fill {placeholders} in a translated string with dataset values. */
const fill = (s: string, vals: Record<string, string | number>) =>
  Object.entries(vals).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

type AltStatus = "unlikely" | "possible" | "material" | "cannot-assess";
const ALT_STATUS: Record<AltStatus, { label: string; color: string }> = {
  unlikely: { label: "prof.status.unlikely", color: "#15803d" },
  possible: { label: "prof.status.possible", color: "#b45309" },
  material: { label: "prof.status.material", color: "#d97706" },
  "cannot-assess": { label: "prof.status.cannotAssess", color: "#75847b" },
};

export default function PartnerProfileView({ iso }: { iso: string }) {
  const { t, lang } = useI18n();
  const ISO = useMemo(() => iso.toUpperCase(), [iso]);
  const pm0 = partnerMetaOf(ISO);

  /** The page's own controls, mirroring the Executive Overview's. */
  const [granularity, setGranularity] = useState<Granularity>("year");
  const [years, setYears] = useState<number[]>(() => [...meta.years]);
  const [months, setMonths] = useState<number[]>([]);
  const [hs2Sel, setHs2Sel] = useState<string[]>([]);
  const [hs4Sel, setHs4Sel] = useState<string[]>([]);
  const [hs6Sel, setHs6Sel] = useState<string[]>([]);
  const detailVer = useMonthlyDetail(granularity === "month" || years.some(isDerivedYear));

  const { full: BASE, snap: SNAP } = useMemo(() => labelsFor(lang, () => aggFor(lang)), [lang]);

  /** Everything the page shows follows these ticks, scoped to this partner. */
  const viewFilter = useMemo<Filter>(() => ({
    ...DEFAULT_FILTER,
    minGap: 0,
    country: [ISO],
    granularity,
    years,
    months,
    hs2: hs2Sel,
    hs4: hs4Sel,
    hs6: hs6Sel,
  }), [ISO, granularity, years, months, hs2Sel, hs4Sel, hs6Sel]);

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

  // the pickers offer only what this partner actually trades, drawn from the
  // unfiltered aggregate so narrowing never hides the way back
  const baseHs2 = useMemo(() => BASE.channels.filter((c) => c.partnerIso === ISO), [BASE, ISO]);
  const baseHs4 = useMemo(() => BASE.channels4.filter((c) => c.partnerIso === ISO), [BASE, ISO]);
  const baseHs6 = useMemo(() => BASE.channels6.filter((c) => c.partnerIso === ISO), [BASE, ISO]);
  const hs2Options = useMemo(() => codeOptions(baseHs2), [baseHs2]);
  const hs4Options = useMemo(
    () => codeOptions(baseHs4.filter((c) => hs2Sel.length === 0 || hs2Sel.includes(c.chapter))),
    [baseHs4, hs2Sel],
  );
  const hs6Options = useMemo(
    () => codeOptions(baseHs6.filter((c) =>
      (hs2Sel.length === 0 || hs2Sel.includes(c.chapter)) &&
      (hs4Sel.length === 0 || hs4Sel.includes(c.cmd.slice(0, 4))))),
    [baseHs6, hs2Sel, hs4Sel],
  );

  const controls = (
    <section className="no-print flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="flex flex-col gap-1">
        <span className="text-[11.5px] font-semibold uppercase tracking-wider text-faint">{t("filter.granularity")}</span>
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
      <MultiSelect values={hs2Sel} onChange={setHs2Sel} options={hs2Options} label={t("filter.hs2")} allLabel={t("filter.all")} />
      <MultiSelect values={hs4Sel} onChange={setHs4Sel} options={hs4Options} label={t("filter.hs4")} allLabel={t("filter.all")} />
      <MultiSelect values={hs6Sel} onChange={setHs6Sel} options={hs6Options} label={t("filter.hs6")} allLabel={t("filter.all")} />
    </section>
  );

  if (!pm0) notFound();

  const p = FULL.partners.find((x) => x.iso3 === ISO);
  const name = labelsFor(lang, () => pm0.name);
  const period = yearsLabel(years);

  // a narrow enough selection can leave this partner with nothing comparable —
  // that is an empty result, not a missing page
  if (!p) {
    return (
      <div className="space-y-6">
        <div>
          <Link href="/partners" className="text-sm text-muted hover:text-foreground">&larr; {t("prof.back")}</Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
            <span className="text-sm text-faint">{pm0.region} &middot; {fill(t("prof.header.meta"), { period })}</span>
          </div>
        </div>
        {controls}
        <EmptyState />
      </div>
    );
  }

  const pm = pm0;
  const snap = SNAP.partners.find((x) => x.iso3 === p.iso3);
  const cifPct = Math.round(FULL_FILTER.cif * 100);

  const hs2 = FULL.channels.filter((c) => c.partnerIso === p.iso3);
  const hs6 = FULL.channels6.filter((c) => c.partnerIso === p.iso3);
  // slim, serializable rows for the client-side HS2 › HS4 › HS6 narrowing
  const structure: ChapterRow[] = [...hs2]
    .filter((c) => c.posT > 0)
    .sort((a, b) => b.posT - a.posT)
    .map((c) => ({ chapter: c.chapter, label: c.cmdLabel, posT: Math.round(c.posT) }));
  const signalRows: ChannelRow[] = hs6.map((c) => ({
    // engine order is preserved: band → MTRS → size
    cmd: c.cmd, label: c.cmdLabel, chapter: c.chapter, hs4: c.cmd.slice(0, 4),
    band: c.band, mtrs: c.mtrs, abnormalGap: c.abnormalGap, persistence: c.persistence,
    robustness: c.robustness, posT: Math.round(c.posT),
  }));

  // weight availability among this partner's HS6 channels, value-weighted (measured, optional)
  const pe6 = hs6.reduce((s, c) => s + c.peT, 0);
  const pe6w = hs6.reduce((s, c) => s + (c.uvYears > 0 ? c.peT : 0), 0);
  const weightShare = pe6 > 0 ? pe6w / pe6 : null;

  // positive channel-years only, so exports − adjusted imports = the positive discrepancy
  const adjImport = p.uiPosT / (1 + FULL_FILTER.cif);
  const posShare = adjImport > 0 ? p.posT / adjImport : 0;
  const trendWord = t(p.trend > 1_000_000 ? "prof.trend.rising" : p.trend < -1_000_000 ? "prof.trend.declining" : "prof.trend.stable");
  const topSector = structure[0];

  // ---- executive summary (spec §6.6.1) — standardized cautious template from measured fields ----
  const coverageSentence =
    pm.lapse
      ? fill(t("prof.sum.covLapse"), { name, year: pm.lastReportedYear, k: pm.reportedYears.length, n: WINDOW.length })
      : pm.coverage < 1
        ? fill(t("prof.sum.covPartial"), { name, k: pm.reportedYears.length, n: WINDOW.length })
        : fill(t("prof.sum.covFull"), { name });
  const summary = [
    fill(t("prof.sum.observed"), { start: meta.window.start, end: meta.window.end, name, pe: fmtUSD(p.observed.pe), ui: fmtUSD(p.observed.ui) }),
    fill(t("prof.sum.screened"), { name, cif: cifPct, pePos: fmtUSD(p.pePosT), expected: fmtUSD(adjImport), uiPos: fmtUSD(p.uiPosT), pos: fmtUSD(p.posT) }),
    topSector
      ? fill(t("prof.sum.topSector"), { sector: topSector.label.toLowerCase(), chapter: topSector.chapter, value: fmtUSD(topSector.posT), trend: trendWord })
      : fill(t("prof.sum.noSector"), { trend: trendWord }),
    snap ? fill(t("prof.sum.snapYear"), { year: meta.defaultYear, value: fmtUSD(snap.posT) }) : "",
    coverageSentence,
    pm.transit ? fill(t("prof.sum.transit"), { name }) : "",
  ].filter(Boolean).join(" ");

  // ---- alternative explanations (spec §6.6.8) — partner-level, statuses from measured fields ----
  const flipShare = hs2.length > 0 ? hs2.filter((c) => c.flipsAcrossFreight).length / hs2.length : 0;
  const residualPos = hs2.filter((c) => isResidualChapter(c.chapter)).reduce((s, c) => s + c.posT, 0);
  const residualShare = p.posT > 0 ? residualPos / p.posT : 0;
  const weakReporter = pm.lapse || pm.coverage < 0.8;
  const alternatives: { title: string; status: AltStatus; note: string }[] = [
    {
      title: t("prof.alt.cif.title"),
      status: flipShare >= 0.3 ? "material" : "possible",
      note: fill(t("prof.alt.cif.note"), { cif: cifPct, name, pct: fmtPct(flipShare, 0) }) + (flipShare >= 0.3 ? ` ${t("prof.alt.cif.material")}` : ""),
    },
    {
      title: t("prof.alt.transit.title"),
      status: pm.transit ? "material" : "unlikely",
      note: pm.transit ? fill(t("prof.alt.transit.yes"), { name }) : fill(t("prof.alt.transit.no"), { name }),
    },
    {
      title: t("prof.alt.reporting.title"),
      status: weakReporter ? "material" : pm.coverage < 1 ? "possible" : "unlikely",
      note: weakReporter
        ? fill(t("prof.alt.reporting.weak"), {
            name, k: pm.reportedYears.length, n: WINDOW.length,
            lapse: pm.lapse ? fill(t("prof.alt.reporting.lastReport"), { year: pm.lastReportedYear }) : "",
          })
        : fill(t(pm.coverage < 1 ? "prof.alt.reporting.okPartial" : "prof.alt.reporting.okFull"), { name, k: pm.reportedYears.length, n: WINDOW.length }),
    },
    {
      title: t("prof.alt.classification.title"),
      status: "cannot-assess",
      note: t("prof.alt.classification.note"),
    },
    {
      title: t("prof.alt.timing.title"),
      status: "possible",
      note: t("prof.alt.timing.note"),
    },
    {
      title: t("prof.alt.residual.title"),
      status: residualShare >= 0.1 ? "material" : residualShare > 0 ? "possible" : "unlikely",
      note: residualShare > 0
        ? fill(t("prof.alt.residual.some"), { pct: fmtPct(residualShare, 0), name })
        : fill(t("prof.alt.residual.none"), { name }),
    },
  ];

  // ---- downloads (spec §6.6.9): server-rendered data-URI link, no client JS needed ----
  const csv = channelsToCsv(hs6, viewFilter);
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${csv}`)}`;

  return (
    <div className="space-y-8">
      {/* header */}
      <div>
        <Link href="/partners" className="text-sm text-muted hover:text-foreground">← {t("prof.back")}</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          <span className="text-sm text-faint">{p.region} · {fill(t("prof.header.meta"), { period })}</span>
          <QualityTag tier={p.tier} />
          {p.transit && <TransitTag />}
        </div>
      </div>

      {controls}

      <ContextLine filter={viewFilter} />

      {/* 1. executive summary */}
      <section className="card border-l-2 border-l-[var(--color-primary)] p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-faint">{t("prof.execSummary")}</h2>
        <p className="text-[15px] leading-relaxed text-muted">{summary}</p>
      </section>

      {/* 2. key indicators */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("kpi.positive")} value={fmtUSD(p.posT)} accent={COLORS.positive}
          sub={fill(t("prof.stat.posShareSub"), { pct: fmtPct(posShare, 0) })}
          info={`${fill(t("prof.stat.positive.info"), { cif: cifPct })} ${fmtUSDFull(p.posT)}.`} />
        <Stat label={t("prof.stat.coverage")} value={`${pm.reportedYears.length}/${WINDOW.length} ${t("prof.unit.yrs")}`}
          sub={pm.lapse ? fill(t("prof.stat.stoppedAfter"), { year: pm.lastReportedYear }) : fill(t("prof.stat.coverageSub"), { pct: fmtPct(pm.coverage, 0) })}
          info={t("prof.stat.coverage.info")} />
        <Stat label={t("prof.stat.hs2Sectors")} value={String(hs2.length)}
          sub={fill(t("prof.stat.trendSub"), { trend: trendWord })}
          info={t("prof.stat.hs2Sectors.info")} />
        <Stat label={t("prof.stat.hs6Channels")} value={String(hs6.length)}
          sub={fill(t("prof.stat.flaggedSub"), { n: p.flagged })}
          info={t("prof.stat.hs6Channels.info")} />
      </section>

      {/* 3. reporting quality */}
      <section className="card p-5">
        <SectionTitle
          title={t("prof.quality.title")}
          desc={t("prof.quality.desc")}
          right={pm.lapse ? (
            <span className="rounded-md border px-2 py-1 text-xs font-medium" style={{ color: "#b45309", borderColor: "color-mix(in srgb, #b45309 40%, transparent)" }}
              title={fill(t("prof.quality.stopBadgeTip"), { name, year: pm.lastReportedYear })}>
              {fill(t("prof.stat.stoppedAfter"), { year: pm.lastReportedYear })}
            </span>
          ) : undefined}
        />
        <div className="flex flex-wrap gap-1.5">
          {WINDOW.map((y) => {
            const has = pm.reportedYears.includes(y);
            return (
              <span key={y} className="tabular flex h-10 w-12 flex-col items-center justify-center rounded-lg border text-[12px]"
                style={{
                  borderColor: has ? "color-mix(in srgb, var(--color-ok, #15803d) 45%, transparent)" : "var(--color-border)",
                  background: has ? "color-mix(in srgb, var(--color-ok, #15803d) 10%, transparent)" : "transparent",
                  color: has ? "var(--color-foreground)" : "var(--color-faint)",
                }}
                title={fill(t(has ? "prof.quality.cellReported" : "prof.quality.cellMissing"), { name, year: y })}>
                <span>{`'${String(y).slice(2)}`}</span>
                <span style={{ color: has ? "var(--color-ok, #15803d)" : "var(--color-faint)" }}>{has ? "●" : "○"}</span>
              </span>
            );
          })}
        </div>
        <p className="mt-3 max-w-3xl text-sm text-muted">
          {weightShare != null
            ? fill(t("prof.quality.weightYes"), { pct: fmtPct(weightShare, 0), name })
            : fill(t("prof.quality.weightNo"), { name })}
          {" "}{t("prof.quality.hollow")}
        </p>
      </section>

      {/* 4. reported vs recorded chart */}
      <section>
        <SectionTitle
          title={t("prof.byYear.title")}
          desc={fill(t("prof.byYear.desc"), { period, name, cif: cifPct })}
        />
        <PartnerGaps byYear={p.byYear} partner={name} />
      </section>

      {/* 5+6. product-code narrowing over the HS2 structure and HS6 signals */}
      <PartnerChannels
        iso={p.iso3}
        partner={name}
        totalPos={p.posT}
        chapters={structure}
        rows={signalRows}
      />

      {/* 7. transit & attribution note */}
      {pm.transit && (
        <section className="card p-5" style={{ borderLeft: `2px solid ${COLORS.transit}` }}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider" style={{ color: COLORS.transit }}>
            {t("prof.transit.title")}
          </h2>
          <p className="max-w-3xl text-sm leading-relaxed text-muted">
            {fill(t("prof.transit.body"), { name })}
          </p>
        </section>
      )}

      {/* 8. alternative explanations */}
      <section className="card p-5">
        <SectionTitle
          title={t("prof.alt.title")}
          desc={t("prof.alt.desc")}
        />
        <ul className="space-y-3">
          {alternatives.map((a) => {
            const s = ALT_STATUS[a.status];
            return (
              <li key={a.title} className="flex flex-wrap items-start gap-x-3 gap-y-1 text-sm">
                <span className="w-40 shrink-0 rounded-md border px-1.5 py-0.5 text-center text-[12px] font-medium"
                  style={{ color: s.color, borderColor: `color-mix(in srgb, ${s.color} 40%, transparent)`, background: `color-mix(in srgb, ${s.color} 8%, transparent)` }}>
                  {t(s.label as never)}
                </span>
                <span className="min-w-[12rem] font-medium">{a.title}</span>
                <span className="basis-full text-muted md:min-w-0 md:flex-1 md:basis-0">{a.note}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 9. downloads */}
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
          className="rounded-md border border-[var(--color-border)] px-3 py-2 text-[13px] font-medium text-muted hover:text-foreground"
        >
          {t("common.exportCsv")} ↓
        </a>
      </section>
    </div>
  );
}
