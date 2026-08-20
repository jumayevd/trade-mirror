"use client";

import { notFound } from "next/navigation";
import Link from "next/link";
import ProductChart from "@/components/charts/ProductChart";
import {
  Stat, SectionTitle, ContextLine, BandBadge, ComponentChip, RiskScore,
  RobustnessBadge, QualityTag, TransitTag, MissingValue, InfoTip,
} from "@/components/ui";
import {
  aggregate, products, meta, DEFAULT_FILTER, isResidualChapter, categoryLabel, hsLabel,
  type Filter, type RiskBand, type Tier,
} from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";
import { labelsFor } from "@/lib/labels";
import { fmtUSD, fmtUSDFull, fmtPct, COLORS, BAND_COLORS } from "@/lib/format";

/**
 * HS6 product profile (spec §6.8) — one 6-digit line across all partners.
 * Server component: computes its own full-window aggregate with explicit
 * filters, so the profile is stable regardless of the visitor's interactive
 * filter state. Product-file figures are cumulative over the full window at
 * the central freight assumption.
 */
const FULL_FILTER: Filter = {
  ...DEFAULT_FILTER,
  years: [...meta.years],
  minGap: 0,
};
const FULL = aggregate(FULL_FILTER);

const PROFILED = products.slice(0, 80);
const BAND_ORDER: RiskBand[] = ["critical", "high", "elevated", "low"];



/** Fill {placeholders} in a translated string with computed values. */
const fill = (str: string, vals: Record<string, string | number>) =>
  Object.entries(vals).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), str);

export default function ProductProfileView({ cmd }: { cmd: string }) {
  const { t, lang } = useI18n();
  const p = products.find((x) => x.cmd === cmd);
  if (!p) notFound();

  const period = `${meta.window.start}–${meta.window.end}`;
  // product and chapter names are data-derived: translate them like everywhere else
  const label = labelsFor(lang, () => hsLabel(p.cmd));
  const chapterLabel = labelsFor(lang, () => hsLabel(p.chapter));
  const cifPct = Math.round(meta.cif.central * 100);
  const residual = isResidualChapter(p.chapter);

  const gapShare = p.ptnExp > 0 ? p.positiveGap / p.ptnExp : 0;
  const confTier: Tier = p.highConfShare >= 0.7 ? "High" : p.highConfShare >= 0.4 ? "Medium" : "Low";

  // full-window channel drill-down for this HS6 line (no materiality floor)
  const channels = FULL.channels6
    .filter((c) => c.cmd === cmd)
    .sort((a, b) => b.posT - a.posT);

  // concentration on the positive side
  const totalPos = channels.reduce((s, c) => s + c.posT, 0);
  const topChannel = channels[0] ?? null;
  const topShare = topChannel && totalPos > 0 ? topChannel.posT / totalPos : 0;

  // risk band summary
  const bandCounts = new Map<RiskBand, number>();
  for (const c of channels) bandCounts.set(c.band, (bandCounts.get(c.band) ?? 0) + 1);
  const flaggedCount = (bandCounts.get("critical") ?? 0) + (bandCounts.get("high") ?? 0);

  // data coverage: dual-weight availability across channels
  const uvChannels = channels.filter((c) => c.uvYears > 0).length;

  // trend from the product file (yearly positive gap, early vs recent halves)
  const half = Math.max(1, Math.floor(p.byYear.length / 2));
  const early = p.byYear.slice(0, half).reduce((s, y) => s + Math.max(0, y.gap), 0) / half;
  const recent = p.byYear.slice(-half).reduce((s, y) => s + Math.max(0, y.gap), 0) / half;
  const rising = recent > early * 1.15;
  const trendWord = t(rising ? "pprof.trend.rising" : recent < early * 0.85 ? "pprof.trend.declining" : "pprof.trend.stable");

  // ---- automatic interpretation template (facts + caveats, spec §10) ----
  const routingSentence = residual
    ? fill(t("pprof.narr.routing.residual"), { chapter: p.chapter, label: chapterLabel.toLowerCase() })
    : p.transitShare >= 0.5
      ? fill(t("pprof.narr.routing.hubMajority"), { pct: fmtPct(p.transitShare, 0) })
      : p.transitShare >= 0.2
        ? fill(t("pprof.narr.routing.hubSome"), { pct: fmtPct(p.transitShare, 0) })
        : t("pprof.narr.routing.direct");
  const uvSentence = !p.uv
    ? t("pprof.narr.uv.none")
    : p.uv.uvRatio < 0.85
      ? fill(t("pprof.narr.uv.below"), {
          years: p.uv.years, uzb: p.uv.uvUzb.toFixed(2), ptn: p.uv.uvPtn.toFixed(2),
          pct: Math.round((1 - p.uv.uvRatio) * 100),
        })
      : p.uv.uvRatio <= 1.2
        ? fill(t("pprof.narr.uv.similar"), { years: p.uv.years })
        : fill(t("pprof.narr.uv.above"), { years: p.uv.years });
  const confSentence = fill(
    t(confTier === "High" ? "pprof.narr.conf.high" : confTier === "Medium" ? "pprof.narr.conf.medium" : "pprof.narr.conf.low"),
    { pct: fmtPct(p.highConfShare, 0) },
  );
  const bandName = { critical: t("band.critical"), high: t("band.high") };
  const clsSentence =
    channels.length === 0
      ? t("pprof.narr.cls.none")
      : flaggedCount > 0
        ? fill(t("pprof.narr.cls.flagged"), { n: channels.length, k: flaggedCount, critical: bandName.critical, high: bandName.high })
        : fill(t("pprof.narr.cls.clean"), { n: channels.length, high: bandName.high });

  const narrative = [
    fill(t("pprof.narr.lead"), {
      period, label, cmd: p.cmd, ptnExp: fmtUSD(p.ptnExp), uzbImp: fmtUSD(p.uzbImp),
      cif: cifPct, gap: fmtUSD(p.positiveGap), share: fmtPct(gapShare, 0), trend: trendWord,
    }),
    routingSentence, uvSentence, confSentence, clsSentence, t("pprof.narr.tail"),
  ].join(" ");

  return (
    <div className="space-y-8">
      {/* 1. header */}
      <div>
        <Link href="/products" className="text-sm text-muted hover:text-foreground">{t("pprof.backAll")}</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{label}</h1>
          <span className="tabular rounded bg-[var(--color-panel-2)] px-2 py-0.5 text-xs text-faint">HS {p.cmd}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-faint">
          <span className="tabular">{p.chapter}</span>
          <span>{chapterLabel}</span>
          <span>·</span>
          <span>{categoryLabel(p.category)}</span>
          {residual && (
            <span
              className="rounded-md px-2 py-0.5 text-[11px] font-medium"
              style={{ color: COLORS.transit, background: "color-mix(in srgb, var(--color-transit) 10%, transparent)" }}
              title={t("pprof.residual.tip")}
            >
              {t("pprof.residualBadge")}
            </span>
          )}
          <span>· {fill(t("pprof.headerMeta"), { period, cif: cifPct })}</span>
        </div>
      </div>

      <ContextLine filter={FULL_FILTER} />

      {/* 2. cumulative KPIs */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label={t("pprof.stat.positiveGap")} value={fmtUSD(p.positiveGap)} accent={COLORS.positive}
          sub={fill(t("pprof.stat.positiveGap.sub"), { pct: fmtPct(gapShare, 0) })}
          info={fill(t("pprof.stat.positiveGap.info"), { period, cif: cifPct, full: fmtUSDFull(p.positiveGap) })} />
        <Stat label={t("pprof.stat.partnerExports")} value={fmtUSD(p.ptnExp)} accent={COLORS.partner}
          sub={fill(t("pprof.stat.partnerExports.sub"), { v: fmtUSD(p.uzbImp) })}
          info={fill(t("pprof.stat.partnerExports.info"), { cmd: p.cmd, a: fmtUSDFull(p.ptnExp), b: fmtUSDFull(p.uzbImp) })} />
        <Stat label={t("pprof.stat.concentration")} value={topChannel && totalPos > 0 ? fmtPct(topShare, 0) : "n/a"}
          sub={topChannel && totalPos > 0 ? fill(t("pprof.stat.concentration.sub"), { partner: topChannel.partner }) : t("pprof.stat.concentration.subNone")}
          info={t("pprof.stat.concentration.info")} />
        <Stat label={t("pprof.stat.trend")} value={trendWord} accent={rising ? COLORS.positive : undefined}
          sub={fill(t("pprof.stat.trend.sub"), { recent: fmtUSD(recent), early: fmtUSD(early) })}
          info={t("pprof.stat.trend.info")} />
        <Stat label={t("pprof.stat.reporterQuality")} value={t(`tier.${confTier.toLowerCase()}` as never)}
          sub={fill(t("pprof.stat.reporterQuality.sub"), { pct: fmtPct(p.highConfShare, 0) })}
          info={t("pprof.stat.reporterQuality.info")} />
      </section>

      {/* 3. annual chart */}
      <section>
        <SectionTitle
          title={t("prof.byYear.title")}
          desc={fill(t("pprof.byYear.desc"), { period, cif: cifPct })}
        />
        <ProductChart product={p} />
      </section>

      {/* 4. risk band summary */}
      <section className="card p-5">
        <SectionTitle
          title={t("pprof.bands.title")}
          desc={t("pprof.bands.desc")}
        />
        {channels.length === 0 ? (
          <p className="text-sm text-muted">{t("pprof.bands.none")}</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {BAND_ORDER.filter((k) => (bandCounts.get(k) ?? 0) > 0).map((k) => (
              <div key={k} className="flex items-center gap-2 rounded-md border border-[var(--color-border-soft)] px-3 py-2"
                title={t(`band.desc.${k}` as never)}>
                <BandBadge band={k} />
                <span className="tabular text-lg font-semibold" style={{ color: BAND_COLORS[k] }}>{bandCounts.get(k)}</span>
                <span className="text-xs text-faint">{t("pprof.bands.channelsWord")}</span>
              </div>
            ))}
            <p className="basis-full text-xs text-faint">
              {fill(t("pprof.bands.total"), { n: channels.length, critical: bandName.critical, high: bandName.high })}
            </p>
          </div>
        )}
      </section>

      {/* 5. partner decomposition (full channel drill-down) */}
      <section>
        <SectionTitle
          title={t("pprof.decomp.title")}
          desc={t("pprof.decomp.desc")}
        />
        {channels.length === 0 ? (
          <p className="card p-8 text-center text-sm text-muted">{t("pprof.decomp.empty")}</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="zebra w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wider text-faint">
                  <th className="px-3 py-2 font-medium">{t("pprof.th.partner")}</th>
                  <th className="px-3 py-2 font-medium">{t("pprof.th.risk")}</th>
                  <th className="px-3 py-2 font-medium">{t("pprof.th.band")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("pprof.th.partnerExports")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("pprof.th.uzbImports")}</th>
                  <th className="px-3 py-2 text-right font-medium" style={{ color: COLORS.positive }}>{t("pprof.th.positiveGap")}</th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t("pprof.th.years")} <InfoTip text={t("pprof.th.yearsTip")} />
                  </th>
                  <th className="px-3 py-2 font-medium">{t("pprof.th.robustness")}</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-soft)]">
                {channels.map((c) => (
                  <tr key={c.partnerIso}>
                    <td className="px-3 py-2">
                      <Link href={`/partners/${c.partnerIso.toLowerCase()}`} className="font-medium hover:underline">{c.partner}</Link>
                      {c.transit && <span className="ml-2 inline-block align-middle"><TransitTag /></span>}
                    </td>
                    <td className="px-3 py-2"><RiskScore score={c.mtrs} band={c.band} scored={c.scored} /></td>
                    <td className="px-3 py-2">
                      <span className="inline-flex flex-wrap gap-1">
                        <BandBadge band={c.band} />
                        <ComponentChip kind="g" value={c.abnormalGap} />
                        <ComponentChip kind="p" value={c.persistence} />
                      </span>
                    </td>
                    <td className="tabular px-3 py-2 text-right" title={fmtUSDFull(c.peT)}>
                      {c.peT > 0 ? fmtUSD(c.peT) : <MissingValue kind="notReported" />}
                    </td>
                    <td className="tabular px-3 py-2 text-right" title={fmtUSDFull(c.uiT)}>
                      {c.uiT > 0 ? fmtUSD(c.uiT) : <MissingValue kind="notReported" />}
                    </td>
                    <td className="tabular px-3 py-2 text-right font-semibold" style={{ color: COLORS.positive }} title={fmtUSDFull(c.posT)}>
                      {fmtUSD(c.posT)}
                    </td>
                    <td className="tabular px-3 py-2 text-right">{c.comparableYears}/{meta.years.length}</td>
                    <td className="px-3 py-2"><RobustnessBadge r={c.robustness} /></td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/channels/${c.partnerIso.toLowerCase()}/${c.cmd}`} className="text-xs font-medium text-[var(--color-primary)] hover:underline">
                        {t("pprof.link.channel")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-faint">
          {fill(t("pprof.decomp.footnote"), { period, cif: cifPct })}
        </p>
      </section>

      {/* 6. data coverage: unit values / weight availability */}
      <section className="card p-5">
        <SectionTitle
          title={t("pprof.uv.title")}
          desc={t("pprof.uv.desc")}
          right={<QualityTag tier={confTier} tip={fill(t("pprof.uv.qualityTip"), { pct: fmtPct(p.highConfShare, 0) })} />}
        />
        {p.uv ? (
          <div className="flex flex-wrap items-start gap-8 text-sm">
            <div>
              <div className="text-xs text-faint">{t("pprof.uv.uzbDeclared")}</div>
              <div className="tabular text-xl">${p.uv.uvUzb.toFixed(2)}/kg</div>
            </div>
            <div>
              <div className="text-xs text-faint">{t("pprof.uv.partnersDeclared")}</div>
              <div className="tabular text-xl">${p.uv.uvPtn.toFixed(2)}/kg</div>
            </div>
            <div>
              <div className="flex items-center gap-1 text-xs text-faint">
                {t("pprof.uv.ratioLabel")} <InfoTip text={t("pprof.uv.ratioTip")} />
              </div>
              <div className="tabular text-xl font-semibold" style={{ color: p.uv.uvRatio < 0.85 ? COLORS.positive : COLORS.ok }}>
                {p.uv.uvRatio.toFixed(2)}
              </div>
            </div>
            <p className="max-w-sm text-xs leading-relaxed text-faint">
              {fill(t("pprof.uv.basis"), { years: p.uv.years, uvChannels, channels: channels.length })}
            </p>
          </div>
        ) : (
          <p className="max-w-3xl text-sm text-muted">
            {t("pprof.uv.noneA")} <em>{t("pprof.uv.noneEmph")}</em> {t("pprof.uv.noneB")}{" "}
            <MissingValue kind="notComparable" /> {t("pprof.uv.noneC")}
          </p>
        )}
      </section>

      {/* 7. interpretation */}
      <section className="card border-l-2 border-l-[var(--color-accent)] p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-faint">{t("pprof.interpretation")}</h2>
        <p className="text-[15px] leading-relaxed text-muted">{narrative}</p>
        <p className="mt-3 text-xs text-faint">{fill(t("pprof.interp.footnote"), { period })}</p>
      </section>

      {/* 8. HS revision note */}
      <section className="rounded-md border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-4 py-3 text-xs text-faint">
        <strong className="text-muted">{t("pprof.hsNote.title")}</strong> {t("pprof.hsNote.body")}
        {residual ? fill(t("pprof.hsNote.residualTail"), { chapter: p.chapter }) : ""}.
      </section>
    </div>
  );
}
