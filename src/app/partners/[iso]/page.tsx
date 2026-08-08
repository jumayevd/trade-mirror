import { notFound } from "next/navigation";
import Link from "next/link";
import PartnerGaps from "@/components/charts/PartnerGaps";
import PartnerChannels, { type ChannelRow, type ChapterRow } from "./PartnerChannels";
import { Stat, SectionTitle, ContextLine, QualityTag, TransitTag } from "@/components/ui";
import {
  aggregate, meta, DEFAULT_FILTER, partnerMetaOf, isResidualChapter, type Filter,
} from "@/lib/dataset";
import { channelsToCsv } from "@/lib/export";
import { fmtUSD, fmtUSDFull, fmtPct, COLORS } from "@/lib/format";

/**
 * Partner profile (spec §6.6) — one partner country in depth. Server component:
 * computes its own full-window aggregate with explicit filters (every year
 * ticked, no materiality floor) so the profile is stable regardless of the
 * visitor's interactive filter state elsewhere on the site.
 */
const FULL_FILTER: Filter = {
  ...DEFAULT_FILTER,
  years: [...meta.years],
  minGap: 0,
};
const FULL = aggregate(FULL_FILTER);
/** Latest single year — the one-year callout inside the executive summary. */
const SNAP = aggregate({ ...DEFAULT_FILTER, years: [meta.defaultYear], minGap: 0 });
const WINDOW = meta.years;

type AltStatus = "unlikely" | "possible" | "material" | "cannot-assess";
const ALT_STATUS: Record<AltStatus, { label: string; color: string }> = {
  unlikely: { label: "Unlikely", color: "#15803d" },
  possible: { label: "Possible", color: "#b45309" },
  material: { label: "Material", color: "#d97706" },
  "cannot-assess": { label: "Cannot assess", color: "#75847b" },
};

export function generateStaticParams() {
  return FULL.partners.map((p) => ({ iso: p.iso3.toLowerCase() }));
}

export async function generateMetadata({ params }: { params: Promise<{ iso: string }> }) {
  const { iso } = await params;
  const p = FULL.partners.find((x) => x.iso3 === iso.toUpperCase());
  return { title: p ? `${p.name} — partner profile — Mirror Trade Analytics` : "Partner — Mirror Trade Analytics" };
}

export default async function PartnerPage({ params }: { params: Promise<{ iso: string }> }) {
  const { iso } = await params;
  const p = FULL.partners.find((x) => x.iso3 === iso.toUpperCase());
  if (!p) notFound();
  const pm = partnerMetaOf(p.iso3)!;
  const snap = SNAP.partners.find((x) => x.iso3 === p.iso3);

  const period = `${meta.window.start}–${meta.window.end}`;
  const cifPct = Math.round(meta.cif.central * 100);

  const hs2 = FULL.channels.filter((c) => c.partnerIso === p.iso3);
  const hs6 = FULL.channels6.filter((c) => c.partnerIso === p.iso3);
  // slim, serializable rows for the client-side HS2 › HS4 › HS6 narrowing
  const structure: ChapterRow[] = [...hs2]
    .filter((c) => c.posT > 0)
    .sort((a, b) => b.posT - a.posT)
    .map((c) => ({ chapter: c.chapter, label: c.cmdLabel, posT: Math.round(c.posT) }));
  const signalRows: ChannelRow[] = hs6.map((c) => ({
    // engine order is preserved: class → anomaly → evidence → size
    cmd: c.cmd, label: c.cmdLabel, chapter: c.chapter, hs4: c.cmd.slice(0, 4),
    cls: c.cls, anomaly: c.anomaly, evidence: c.evidence, robustness: c.robustness,
    posT: Math.round(c.posT),
  }));

  // weight availability among this partner's HS6 channels, value-weighted (measured, optional)
  const pe6 = hs6.reduce((s, c) => s + c.peT, 0);
  const pe6w = hs6.reduce((s, c) => s + (c.uvYears > 0 ? c.peT : 0), 0);
  const weightShare = pe6 > 0 ? pe6w / pe6 : null;

  const expected = p.peT * (1 + meta.cif.central);
  const posShare = expected > 0 ? p.posT / expected : 0;
  const trendWord = p.trend > 1_000_000 ? "rising" : p.trend < -1_000_000 ? "declining" : "broadly stable";
  const topSector = structure[0];

  // ---- executive summary (spec §6.6.1) — standardized cautious template from measured fields ----
  const coverageSentence =
    pm.lapse
      ? `${p.name} stopped reporting to UN Comtrade after ${pm.lastReportedYear} (${pm.reportedYears.length} of ${WINDOW.length} window years reported): later years have no mirror reference, no discrepancy is computed for them, and they are never treated as zero gaps.`
      : pm.coverage < 1
        ? `${p.name} reported to UN Comtrade in ${pm.reportedYears.length} of ${WINDOW.length} window years, so part of any apparent discrepancy may reflect missing reports rather than measured gaps.`
        : `${p.name} reported to UN Comtrade in every year of the window, so reporting gaps are an unlikely driver of the discrepancy.`;
  const summary = [
    `Between ${meta.window.start} and ${meta.window.end}, ${p.name} reported exports to Uzbekistan of ${fmtUSD(p.peT)} in comparable channels, while Uzbekistan recorded ${fmtUSD(p.uiT)} of imports from ${p.name}.`,
    `Accumulated year by year at the central ${cifPct}% freight adjustment, the positive discrepancy — partner-reported exports uplifted for freight, minus Uzbekistan-recorded imports, counted only where that difference is positive — is ${fmtUSD(p.posT)}.`,
    topSector
      ? `It concentrates in ${topSector.label.toLowerCase()} (HS ${topSector.chapter}, ${fmtUSD(topSector.posT)}) and is ${trendWord} over the window.`
      : `No single HS2 chapter carries a positive discrepancy above the noise floor, and the series is ${trendWord} over the window.`,
    snap ? `In ${meta.defaultYear} alone the positive discrepancy was ${fmtUSD(snap.posT)}.` : "",
    coverageSentence,
    pm.transit
      ? `As a transit/re-export hub, part of the discrepancy can reflect goods routed through ${p.name} and attributed by Uzbekistan to their country of origin — a legitimate recording difference assessed in a separate track.`
      : "",
  ].filter(Boolean).join(" ");

  // ---- alternative explanations (spec §6.6.8) — partner-level, statuses from measured fields ----
  const flipShare = hs2.length > 0 ? hs2.filter((c) => c.flipsAcrossFreight).length / hs2.length : 0;
  const residualPos = hs2.filter((c) => isResidualChapter(c.chapter)).reduce((s, c) => s + c.posT, 0);
  const residualShare = p.posT > 0 ? residualPos / p.posT : 0;
  const weakReporter = pm.lapse || pm.coverage < 0.8;
  const alternatives: { title: string; status: AltStatus; note: string }[] = [
    {
      title: "CIF/FOB valuation assumption",
      status: flipShare >= 0.3 ? "material" : "possible",
      note: `Partner exports are valued FOB while Uzbekistan records CIF; the comparison assumes a ${cifPct}% central freight wedge inside a 6–15% band. For ${p.name}, ${fmtPct(flipShare, 0)} of HS2 channels change the sign of their net discrepancy within that band${flipShare >= 0.3 ? " — the assumption materially affects the partner-level reading" : ""}.`,
    },
    {
      title: "Transit / re-export routing",
      status: pm.transit ? "material" : "unlikely",
      note: pm.transit
        ? `${p.name} is flagged as a transit/re-export hub: Uzbekistan attributes imports to country of origin while hubs report re-exports by consignment, so routed goods can create legitimate discrepancies without any misreporting.`
        : `${p.name} is not flagged as a transit/re-export hub, which weakens routing-based explanations for this partner.`,
    },
    {
      title: "Partner reporting quality",
      status: weakReporter ? "material" : pm.coverage < 1 ? "possible" : "unlikely",
      note: weakReporter
        ? `${p.name}'s Comtrade reporting is incomplete (${pm.reportedYears.length}/${WINDOW.length} years${pm.lapse ? `; last report ${pm.lastReportedYear}` : ""}). Part of the apparent discrepancy may be a reporting artifact rather than a measured gap.`
        : `${p.name} reported in ${pm.reportedYears.length} of ${WINDOW.length} window years, so reporting gaps are ${pm.coverage < 1 ? "only a partial" : "an unlikely"} driver.`,
    },
    {
      title: "Classification differences",
      status: "cannot-assess",
      note: "Both sides are extracted under a single HS revision, but no code-level concordance table is applied yet, so systematic reclassification between similar HS lines on the two sides can be neither confirmed nor excluded.",
    },
    {
      title: "Timing and lag effects",
      status: "possible",
      note: "Goods shipped late in one calendar year may be recorded by the importer in the next; such year-edge effects create small legitimate discrepancies in any country pair and partly wash out over the full window.",
    },
    {
      title: "Confidentiality / residual codes",
      status: residualShare >= 0.1 ? "material" : residualShare > 0 ? "possible" : "unlikely",
      note: residualShare > 0
        ? `${fmtPct(residualShare, 0)} of ${p.name}'s positive discrepancy sits in residual HS chapters (98/99) used for unallocated or confidential trade — that share is substantially a classification artifact by construction.`
        : `None of ${p.name}'s positive discrepancy sits in residual HS chapters (98/99), so confidentiality bucketing is an unlikely driver.`,
    },
  ];

  // ---- downloads (spec §6.6.9): server-rendered data-URI link, no client JS needed ----
  const csv = channelsToCsv(hs6, FULL_FILTER);
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${csv}`)}`;

  return (
    <div className="space-y-8">
      {/* header */}
      <div>
        <Link href="/partners" className="text-sm text-muted hover:text-foreground">← All partners</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
          <span className="text-sm text-faint">{p.region} · partner profile · full {period} window</span>
          <QualityTag tier={p.tier} />
          {p.transit && <TransitTag />}
        </div>
      </div>

      <ContextLine filter={FULL_FILTER} />

      {/* 1. executive summary */}
      <section className="card border-l-2 border-l-[var(--color-primary)] p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-faint">Executive summary</h2>
        <p className="text-[15px] leading-relaxed text-muted">{summary}</p>
      </section>

      {/* 2. key indicators */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Comparable trade" value={fmtUSD(p.peT)} accent={COLORS.partner}
          sub={`${p.name} reported, FOB`}
          info={`Cumulative partner-reported exports to Uzbekistan in channels where both sides reported, ${period}. ${fmtUSDFull(p.peT)}. Uzbekistan recorded ${fmtUSDFull(p.uiT)}.`} />
        <Stat label="Positive discrepancy" value={fmtUSD(p.posT)} accent={COLORS.positive}
          sub={`${fmtPct(posShare, 0)} of expected CIF imports`}
          info={`Σ max(expected CIF − UZB imports, 0) per channel-year at the central ${cifPct}% freight adjustment — a screening signal. ${fmtUSDFull(p.posT)}.`} />
        <Stat label="Coverage" value={`${pm.reportedYears.length}/${WINDOW.length} yrs`}
          sub={pm.lapse ? `stopped after ${pm.lastReportedYear}` : `${fmtPct(pm.coverage, 0)} of window years`}
          info="Years inside the window where the partner reported to UN Comtrade. Missing years have no mirror reference and are never treated as zero gaps." />
        <Stat label="HS2 sectors with signals" value={String(hs2.length)}
          sub={`${trendWord} trend`}
          info="HS2 chapters with at least one comparable channel carrying a positive discrepancy above the noise floor for this partner." />
        <Stat label="HS6 channels" value={String(hs6.length)}
          sub={`${p.investigate} classified Investigate (HS2)`}
          info="Country × HS6 product channels with comparable data for this partner. The sub-line counts this partner's HS2 channels in the Investigate class (high anomaly + high evidence) — a review priority." />
      </section>

      {/* 3. reporting quality */}
      <section className="card p-5">
        <SectionTitle
          title="Reporting quality"
          desc="How completely this partner reports to UN Comtrade — quality caveats are about the data, never about conduct."
          right={pm.lapse ? (
            <span className="rounded-md border px-2 py-1 text-xs font-medium" style={{ color: "#b45309", borderColor: "color-mix(in srgb, #b45309 40%, transparent)" }}
              title={`No Comtrade report from ${p.name} after ${pm.lastReportedYear}. Later years have no mirror reference.`}>
              stopped reporting after {pm.lastReportedYear}
            </span>
          ) : undefined}
        />
        <div className="flex flex-wrap gap-1.5">
          {WINDOW.map((y) => {
            const has = pm.reportedYears.includes(y);
            return (
              <span key={y} className="tabular flex h-10 w-12 flex-col items-center justify-center rounded-lg border text-[11px]"
                style={{
                  borderColor: has ? "color-mix(in srgb, var(--color-ok, #15803d) 45%, transparent)" : "var(--color-border)",
                  background: has ? "color-mix(in srgb, var(--color-ok, #15803d) 10%, transparent)" : "transparent",
                  color: has ? "var(--color-foreground)" : "var(--color-faint)",
                }}
                title={has ? `${p.name} reported in ${y}` : `${p.name} did not report in ${y} — partner data missing; not treated as a zero gap`}>
                <span>{`'${String(y).slice(2)}`}</span>
                <span style={{ color: has ? "var(--color-ok, #15803d)" : "var(--color-faint)" }}>{has ? "●" : "○"}</span>
              </span>
            );
          })}
        </div>
        <p className="mt-3 max-w-3xl text-sm text-muted">
          {weightShare != null ? (
            <>Net weight is reported on both sides for <strong className="text-foreground">{fmtPct(weightShare, 0)}</strong> of {p.name}&apos;s HS6 trade value (value-weighted), so quantity-based unit-value cross-checks are possible for that share of the trade.</>
          ) : (
            <>No HS6 channel of {p.name} has net weight reported on both sides — quantity-based cross-checks are unavailable for this partner. This is a data limitation, not a zero.</>
          )}
          {" "}Hollow years above mean the partner did not report: no discrepancy is computed there and cumulative figures understate rather than overstate.
        </p>
      </section>

      {/* 4. reported vs recorded chart */}
      <section>
        <SectionTitle
          title="Reported vs recorded, by year"
          desc={`Source: UN Comtrade mirror data, ${period}. Amber bars = ${p.name}'s reported exports (FOB); blue bars = Uzbekistan's recorded imports (CIF); the yearly positive discrepancy at the central ${cifPct}% freight adjustment is in the tooltip. Years without a partner report are skipped, never drawn as zero.`}
        />
        <PartnerGaps byYear={p.byYear} partner={p.name} />
      </section>

      {/* 5+6. product-code narrowing over the HS2 structure and HS6 signals */}
      <PartnerChannels
        iso={p.iso3}
        partner={p.name}
        totalPos={p.posT}
        chapters={structure}
        rows={signalRows}
      />

      {/* 7. transit & attribution note */}
      {pm.transit && (
        <section className="card p-5" style={{ borderLeft: `2px solid ${COLORS.transit}` }}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider" style={{ color: COLORS.transit }}>
            Transit &amp; attribution note
          </h2>
          <p className="max-w-3xl text-sm leading-relaxed text-muted">
            {p.name} is flagged as a transit/re-export hub. Uzbekistan records imports by
            country of <em>origin</em>, while hubs report re-exports by <em>consignment</em>:
            goods that merely pass through {p.name} can therefore appear as a discrepancy in
            this pair — and as a matching one in the origin country&apos;s pair — without any
            misreporting by either side. For this reason {p.name}&apos;s channels are classified
            in the transit-sensitive track and excluded from the core residual totals. A
            substantive reading of any signal here requires clarifying routing and origin
            attribution first.
          </p>
        </section>
      )}

      {/* 8. alternative explanations */}
      <section className="card p-5">
        <SectionTitle
          title="Alternative explanations"
          desc="Benign or technical explanations weighed at partner level before any substantive reading. Statuses are derived from measured flags and shares, not judgment calls."
        />
        <ul className="space-y-3">
          {alternatives.map((a) => {
            const s = ALT_STATUS[a.status];
            return (
              <li key={a.title} className="flex flex-wrap items-start gap-x-3 gap-y-1 text-sm">
                <span className="w-40 shrink-0 rounded-md border px-1.5 py-0.5 text-center text-[11px] font-medium"
                  style={{ color: s.color, borderColor: `color-mix(in srgb, ${s.color} 40%, transparent)`, background: `color-mix(in srgb, ${s.color} 8%, transparent)` }}>
                  {s.label}
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
          <h2 className="text-sm font-semibold">Downloads</h2>
          <p className="mt-1 text-xs text-muted">
            All {hs6.length} of {p.name}&apos;s HS6 channels over the full {period} window
            (every year, no materiality floor — not just the product codes selected above),
            with raw and derived fields plus the calculation context, data version and
            methodology version in the header block.
          </p>
        </div>
        <a
          href={csvHref}
          download={`partner_${p.iso3}_hs6_channels.csv`}
          className="rounded-md border border-[var(--color-border)] px-3 py-2 text-[13px] font-medium text-muted hover:text-foreground"
        >
          Export CSV ↓
        </a>
      </section>
    </div>
  );
}
