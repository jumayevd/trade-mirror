"use client";

import { useMemo } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import ChannelChart from "@/components/charts/ChannelChart";
import {
  Stat, SectionTitle, ContextLine, BandBadge,
  RobustnessBadge, QualityTag, TransitTag, MissingValue, InfoTip,
} from "@/components/ui";
import {
  aggregate, meta, DEFAULT_FILTER, partnerMetaOf, productByCmd, isResidualChapter,
  type Aggregate, type Filter, type RiskBand,
} from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";
import { labelsFor } from "@/lib/labels";
import type { Lang, LocaleKey } from "@/lib/locales";
import { fmtUSD, fmtUSDFull, fmtPct, COLORS } from "@/lib/format";

/**
 * Channel profile (spec §6.9) — one country × HS6 pair, the most detailed page of
 * the site. Computes its own full-window aggregate with explicit filters so the
 * profile is stable regardless of the visitor's interactive filter state.
 */
const FULL_FILTER: Filter = {
  ...DEFAULT_FILTER,
  years: [...meta.years],
  minGap: 0,
};
const WINDOW = meta.years;

/**
 * Partner and product names are localised as the aggregate is built, so the page
 * keeps one aggregate per language — computed on first use and shared by every
 * channel page. A single module-level aggregate would freeze the names in
 * whatever language happened to be active at first load.
 */
const AGG_CACHE = new Map<Lang, Aggregate>();
const aggFor = (lang: Lang): Aggregate => {
  let a = AGG_CACHE.get(lang);
  if (!a) { a = aggregate(FULL_FILTER); AGG_CACHE.set(lang, a); }
  return a;
};

/** Fill {placeholders} in a translated string with dataset values. */
const fill = (s: string, vals: Record<string, string | number>) =>
  Object.entries(vals).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

const NEXT_STEP: Record<RiskBand, LocaleKey> = {
  critical: "chan.next.critical",
  high: "chan.next.high",
  elevated: "chan.next.elevated",
  low: "chan.next.low",
};

const FLAG_LABEL_KEYS: Record<string, LocaleKey> = {
  transit: "chan.flag.transit",
  "residual-hs": "chan.flag.residualHs",
  "reporting-stop": "chan.flag.reportingStop",
  "sparse-reporter": "chan.flag.sparseReporter",
  "missing-weight": "chan.flag.missingWeight",
  "freight-sensitive": "chan.flag.freightSensitive",
};

type AltStatus = "unlikely" | "possible" | "material" | "cannot-assess";
const ALT_STATUS: Record<AltStatus, { label: LocaleKey; color: string }> = {
  unlikely: { label: "prof.status.unlikely", color: "#15803d" },
  possible: { label: "prof.status.possible", color: "#b45309" },
  material: { label: "prof.status.material", color: "#d97706" },
  "cannot-assess": { label: "prof.status.cannotAssess", color: "#75847b" },
};

export default function ChannelProfileView({ iso, cmd }: { iso: string; cmd: string }) {
  const { t, lang } = useI18n();
  const FULL = useMemo(() => labelsFor(lang, () => aggFor(lang)), [lang]);
  const channel = FULL.channels6.find((c) => c.partnerIso === iso.toUpperCase() && c.cmd === cmd);
  if (!channel) notFound();

  const pm = partnerMetaOf(channel.partnerIso)!;
  const product = productByCmd(channel.cmd);
  const period = `${meta.window.start}–${meta.window.end}`;
  const cifPct = Math.round(meta.cif.central * 100);
  const expectedLow = channel.peT * (1 + meta.cif.low);
  const expectedHigh = channel.peT * (1 + meta.cif.high);
  const partner = channel.partner; // localised by the aggregate

  // sign reversals across comparable years (transitions between + and − among non-noise years)
  const NOISE = 100_000;
  const signSeq = channel.years
    .map((r) => (r.signed > NOISE ? 1 : r.signed < -NOISE ? -1 : 0))
    .filter((s) => s !== 0);
  let reversals = 0;
  for (let i = 1; i < signSeq.length; i++) if (signSeq[i] !== signSeq[i - 1]) reversals++;

  const rising = channel.trend > 1_000_000;
  const trendWord = t(rising ? "prof.trend.rising" : channel.trend < -1_000_000 ? "prof.trend.declining" : "prof.trend.stable");
  const weakReporter = channel.flags.includes("reporting-stop") || channel.flags.includes("sparse-reporter");
  const residual = isResidualChapter(channel.chapter);
  const yrUnit = (n: number) => `${n} ${t(n === 1 ? "chan.unit.year" : "chan.unit.years")}`;

  // alternative-explanations checklist (spec §6.9.7) — statuses derived from measured flags
  const alternatives: { title: string; status: AltStatus; note: string }[] = [
    {
      title: t("prof.alt.cif.title"),
      status: "possible",
      note: `${fill(t("chan.alt.cif.note"), { cif: cifPct })} ${t(channel.flipsAcrossFreight ? "chan.alt.cif.flips" : "chan.alt.cif.holds")}`,
    },
    {
      title: t("prof.alt.transit.title"),
      status: channel.transit ? "material" : "unlikely",
      note: fill(t(channel.transit ? "chan.alt.transit.yes" : "chan.alt.transit.no"), { name: partner }),
    },
    {
      title: t("prof.alt.reporting.title"),
      status: weakReporter ? "material" : "unlikely",
      note: weakReporter
        ? fill(t("chan.alt.reporting.weak"), {
            name: partner, k: pm.reportedYears.length, n: WINDOW.length,
            lapse: pm.lapse ? fill(t("prof.alt.reporting.lastReport"), { year: pm.lastReportedYear }) : "",
          })
        : fill(t("chan.alt.reporting.ok"), { name: partner, k: pm.reportedYears.length, n: WINDOW.length }),
    },
    {
      title: t("prof.alt.classification.title"),
      status: "cannot-assess",
      note: t("chan.alt.classification.note"),
    },
    {
      title: t("prof.alt.timing.title"),
      status: "possible",
      note: t("chan.alt.timing.note"),
    },
    {
      title: t("prof.alt.residual.title"),
      status: residual ? "material" : "unlikely",
      note: residual
        ? fill(t("chan.alt.residual.yes"), { chapter: channel.chapter })
        : t("chan.alt.residual.no"),
    },
  ];

  const limitations = channel.flags.length > 0
    ? channel.flags.map((f) => (FLAG_LABEL_KEYS[f] ? t(FLAG_LABEL_KEYS[f]) : f)).join("; ")
    : t("chan.flags.none");

  const narrative = [
    fill(t("chan.narrative.trade"), {
      period, name: partner, cmd: channel.cmd, pe: fmtUSD(channel.peT), ui: fmtUSD(channel.uiT),
    }),
    fill(t("chan.narrative.residualGap"), {
      cif: cifPct, pos: fmtUSD(channel.posT),
      holds: t(channel.flipsAcrossFreight ? "chan.narrative.doesNotHold" : "chan.narrative.holds"),
    }),
    fill(t("chan.narrative.years"), { k: channel.comparableYears, n: WINDOW.length }),
    fill(t("chan.narrative.limitations"), { list: limitations }),
    fill(t("chan.narrative.score"), {
      score: channel.mtrs.toFixed(0), g: channel.abnormalGap.toFixed(2), p: channel.persistence.toFixed(2),
      flagged: channel.flaggedYears, matched: channel.matchedYears,
      band: t(`band.${channel.band}` as LocaleKey), next: t(NEXT_STEP[channel.band]),
    }),
  ].join(" ");

  return (
    <div className="space-y-8">
      {/* 1. header */}
      <div>
        <Link href="/risk" className="text-sm text-muted hover:text-foreground">← {t("nav.queue")}</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            <Link href={`/partners/${channel.partnerIso.toLowerCase()}`} className="hover:underline">{partner}</Link>
            <span className="text-faint"> × </span>
            {product ? (
              <Link href={`/products/${channel.cmd}`} className="hover:underline">{channel.cmdLabel}</Link>
            ) : (
              <span title={t("chan.noProfile")}>{channel.cmdLabel}</span>
            )}
          </h1>
          <span className="tabular rounded bg-[var(--color-panel-2)] px-2 py-0.5 text-xs text-faint">HS {channel.cmd}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <BandBadge band={channel.band} />
          <RobustnessBadge r={channel.robustness} />
          {channel.transit && <TransitTag />}
          <span className="text-xs text-faint">{channel.region} · {fill(t("chan.header.meta"), { period })}</span>
        </div>
      </div>

      <ContextLine filter={FULL_FILTER} />

      {/* 2. trade comparison */}
      <section>
        <SectionTitle
          title={t("chan.compare.title")}
          desc={t("chan.compare.desc")}
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Stat label={t("chan.stat.partnerExports")} value={fmtUSD(channel.peT)} accent={COLORS.partner}
            sub={fill(t("chan.sub.partnerReported"), { name: partner })}
            info={`${fill(t("chan.info.peCumulative"), { cmd: channel.cmd, name: partner })} ${fmtUSDFull(channel.peT)}.`} />
          <Stat label={`${t("chan.stat.expectedCif")} (${cifPct}%)`} value={fmtUSD(channel.expectedT)}
            sub={`${t("chan.sub.band")} ${fmtUSD(expectedLow)} – ${fmtUSD(expectedHigh)}`}
            info={fill(t("chan.info.expectedCif"), { cif: cifPct })} />
          <Stat label={t("chan.stat.uzbImports")} value={fmtUSD(channel.uiT)} accent={COLORS.uzb}
            sub={t("chan.sub.uzbRecorded")}
            info={`${fill(t("chan.info.uiCumulative"), { cmd: channel.cmd, name: partner })} ${fmtUSDFull(channel.uiT)}.`} />
          <Stat label={t("kpi.positive")} value={fmtUSD(channel.posT)} accent={COLORS.positive}
            sub={t("chan.sub.byYear")} info={t("chan.info.partnerExports")} />
          <Stat label={t("chan.stat.signed")} value={fmtUSD(channel.signedT, { sign: true })}
            sub={`${t("chan.sub.boundedAsymmetry")} ${fmtPct(channel.boundedAsymmetry)}`}
            info={t("chan.info.signed")} />
        </div>
      </section>

      {/* 3. yearly chart */}
      <section>
        <SectionTitle
          title={t("prof.byYear.title")}
          desc={fill(t("chan.byYear.desc"), { period, name: partner, cif: cifPct })}
        />
        <ChannelChart years={channel.years} windowYears={WINDOW} partner={partner} />
      </section>

      {/* 4. historical persistence */}
      <section>
        <SectionTitle
          title={t("chan.persistence.title")}
          desc={t("chan.persistence.desc")}
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Stat label={t("chan.stat.comparableYears")} value={`${channel.comparableYears}/${WINDOW.length}`}
            sub={t("chan.sub.bothReported")} info={t("chan.info.comparableYears")} />
          <Stat label={t("chan.stat.positiveYears")} value={String(channel.posYears)} accent={COLORS.positive}
            sub={fill(t("chan.sub.ofComparable"), { n: channel.comparableYears })}
            info={t("chan.info.positiveYears")} />
          <Stat label={t("chan.stat.longestStreak")} value={yrUnit(channel.longestPosStreak)}
            sub={t("chan.sub.consecutive")} info={t("chan.info.longestStreak")} />
          <Stat label={t("chan.stat.signReversals")} value={String(reversals)}
            sub={t("chan.sub.signChanges")} info={t("chan.info.signReversals")} />
          <Stat label={t("pprof.stat.trend")} value={trendWord} accent={rising ? COLORS.positive : undefined}
            sub={`${channel.trend >= 0 ? "+" : "−"}${fmtUSD(Math.abs(channel.trend))} ${t("chan.sub.recentVsEarly")}`}
            info={t("chan.info.trend")} />
        </div>
      </section>

      {/* 5. value–quantity decomposition */}
      <section className="card p-5">
        <SectionTitle
          title={t("chan.uv.title")}
          desc={t("pprof.uv.desc")}
        />
        {channel.uvRatio != null ? (
          <div className="flex flex-wrap items-start gap-8 text-sm">
            <div>
              <div className="flex items-center gap-1 text-xs text-faint">
                {t("chan.uv.ratioLabel")} <InfoTip text={t("chan.uv.ratioInfo")} />
              </div>
              <div className="tabular text-xl font-semibold" style={{ color: channel.uvRatio < 0.85 ? COLORS.positive : COLORS.ok }}>
                {channel.uvRatio.toFixed(2)}
              </div>
              <div className="text-xs text-faint">{fill(t("chan.uv.fromYears"), { n: channel.uvYears })}</div>
            </div>
            <div>
              <div className="text-xs text-faint">{t("chan.uv.uzbDeclared")}</div>
              <div className="tabular text-xl">{product?.uv ? `$${product.uv.uvUzb.toFixed(2)}/kg` : <MissingValue kind="notComparable" />}</div>
            </div>
            <div>
              <div className="text-xs text-faint">{t("chan.uv.ptnDeclared")}</div>
              <div className="tabular text-xl">{product?.uv ? `$${product.uv.uvPtn.toFixed(2)}/kg` : <MissingValue kind="notComparable" />}</div>
            </div>
            <p className="max-w-sm text-xs leading-relaxed text-faint">
              {fill(t("chan.uv.note"), {
                cmd: channel.cmd,
                years: product?.uv ? fill(t("chan.uv.noteYears"), { n: product.uv.years }) : "",
              })}
            </p>
          </div>
        ) : (
          <p className="max-w-3xl text-sm text-muted">{fill(t("chan.uv.unavailable"), { n: channel.uvYears })}</p>
        )}
      </section>

      {/* 6. data quality panel */}
      <section className="card p-5">
        <SectionTitle
          title={t("chan.quality.title")}
          desc={t("chan.quality.desc")}
          right={<QualityTag tier={channel.tier} />}
        />
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-faint">
              {t("chan.quality.coverageLead")} · {fill(t("chan.quality.coverageYears"), { k: pm.reportedYears.length, n: WINDOW.length })} · {fmtPct(pm.coverage, 0)}
              {pm.lapse && (
                <span className="ml-2 normal-case" style={{ color: "#b45309" }}>
                  {fill(t("prof.stat.stoppedAfter"), { year: pm.lastReportedYear })}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {WINDOW.map((y) => {
                const has = pm.reportedYears.includes(y);
                return (
                  <span key={y} className="tabular flex h-10 w-12 flex-col items-center justify-center rounded-lg border text-[11px]"
                    style={{
                      borderColor: has ? "color-mix(in srgb, var(--color-ok) 45%, transparent)" : "var(--color-border)",
                      background: has ? "color-mix(in srgb, var(--color-ok) 10%, transparent)" : "transparent",
                      color: has ? "var(--color-foreground)" : "var(--color-faint)",
                    }}
                    title={fill(t(has ? "prof.quality.cellReported" : "chan.quality.cellMissing"), { name: partner, year: y })}>
                    <span>{`'${String(y).slice(2)}`}</span>
                    <span style={{ color: has ? "var(--color-ok)" : "var(--color-faint)" }}>{has ? "●" : "○"}</span>
                  </span>
                );
              })}
            </div>
          </div>
          <ul className="space-y-2 text-sm text-muted">
            <li className="flex gap-2">
              <span className="shrink-0 text-faint">{t("chan.quality.hsLabel")}</span>
              <span>
                {t("chan.quality.hsBody")}
                {residual ? fill(t("chan.quality.hsResidual"), { chapter: channel.chapter }) : ""}
              </span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-faint">{t("chan.quality.transitLabel")}</span>
              <span>{fill(t(channel.transit ? "chan.quality.transitYes" : "chan.quality.transitNo"), { name: partner })}</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-faint">{t("chan.quality.freightLabel")}</span>
              <span>{t(channel.flipsAcrossFreight ? "chan.quality.freightFlips" : "chan.quality.freightHolds")}</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-faint">{t("chan.quality.weightLabel")}</span>
              <span>
                {channel.uvYears > 0
                  ? fill(t("chan.quality.weightSome"), { k: channel.uvYears, n: channel.comparableYears })
                  : t("chan.quality.weightNone")}
              </span>
            </li>
          </ul>
        </div>
      </section>

      {/* 7. alternative explanations */}
      <section className="card p-5">
        <SectionTitle
          title={t("prof.alt.title")}
          desc={t("chan.alt.desc")}
        />
        <ul className="space-y-3">
          {alternatives.map((a) => {
            const s = ALT_STATUS[a.status];
            return (
              <li key={a.title} className="flex flex-wrap items-start gap-x-3 gap-y-1 text-sm">
                <span className="w-40 shrink-0 rounded-md border px-1.5 py-0.5 text-center text-[11px] font-medium"
                  style={{ color: s.color, borderColor: `color-mix(in srgb, ${s.color} 40%, transparent)`, background: `color-mix(in srgb, ${s.color} 8%, transparent)` }}>
                  {t(s.label)}
                </span>
                <span className="min-w-[12rem] font-medium">{a.title}</span>
                <span className="basis-full text-muted md:min-w-0 md:flex-1 md:basis-0">{a.note}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 8. interpretation narrative */}
      <section className="card border-l-2 border-l-[var(--color-accent)] p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-faint">{t("chan.interpretation")}</h2>
        <p className="text-[15px] leading-relaxed text-muted">{narrative}</p>
        <p className="mt-3 text-xs text-faint">{fill(t("chan.interpretation.note"), { period })}</p>
      </section>
    </div>
  );
}
