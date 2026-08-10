"use client";

import { notFound } from "next/navigation";
import Link from "next/link";
import ProductChart from "@/components/charts/ProductChart";
import {
  Stat, SectionTitle, ContextLine, BandBadge, ComponentChip, RiskScore,
  RobustnessBadge, QualityTag, TransitTag, MissingValue, InfoTip,
} from "@/components/ui";
import {
  aggregate, products, meta, DEFAULT_FILTER, isResidualChapter, categoryLabel,
  BAND_LABELS, type Filter, type RiskBand, type Tier,
} from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";
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



export default function ProductProfileView({ cmd }: { cmd: string }) {
  const { t } = useI18n();
  const p = products.find((x) => x.cmd === cmd);
  if (!p) notFound();

  const period = `${meta.window.start}–${meta.window.end}`;
  const cifPct = Math.round(meta.cif.central * 100);
  const residual = isResidualChapter(p.chapter);

  const expected = p.ptnExp * (1 + meta.cif.central);
  const gapShare = expected > 0 ? p.positiveGap / expected : 0;
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
  const trendWord = recent > early * 1.15 ? "rising" : recent < early * 0.85 ? "declining" : "broadly stable";

  // ---- automatic interpretation template (facts + caveats, spec §10) ----
  const routingSentence = residual
    ? `HS chapter ${p.chapter} is a residual category ("${p.chapterLabel.toLowerCase()}") used for unallocated or confidential trade, so a large mirror gap here is substantially a classification artifact by construction and carries no screening priority; it is tracked for transparency of the trade record only.`
    : p.transitShare >= 0.5
      ? `A majority of the gap (${fmtPct(p.transitShare, 0)}) involves transit/re-export hubs, where origin-vs-consignment recording can create legitimate discrepancies — routing should be clarified before any substantive reading.`
      : p.transitShare >= 0.2
        ? `${fmtPct(p.transitShare, 0)} of the gap runs through transit/re-export hubs; the remainder is direct-trade discrepancy.`
        : `The gap is dominated by direct (non-hub) trade, which weakens re-export-based explanations but does not exclude valuation, timing or classification effects.`;
  const uvSentence = !p.uv
    ? "No year has net weight reported on both sides, so price and volume effects cannot be separated — this absence is a data limitation, not a zero."
    : p.uv.uvRatio < 0.85
      ? `Where both sides report weight (${p.uv.years} year${p.uv.years === 1 ? "" : "s"}), Uzbekistan's declared unit value ($${p.uv.uvUzb.toFixed(2)}/kg) runs ${Math.round((1 - p.uv.uvRatio) * 100)}% below the partners' ($${p.uv.uvPtn.toFixed(2)}/kg) — a pattern consistent with under-valuation, but one that can also reflect product-mix or quality differences.`
      : p.uv.uvRatio <= 1.2
        ? `Where both sides report weight (${p.uv.years} year${p.uv.years === 1 ? "" : "s"}), declared unit values are broadly comparable, pointing more to volume or classification differences than to price under-declaration.`
        : `Where both sides report weight (${p.uv.years} year${p.uv.years === 1 ? "" : "s"}), Uzbekistan's declared unit value is above the partners' — no under-valuation signal.`;
  const confSentence =
    confTier === "High"
      ? `${fmtPct(p.highConfShare, 0)} of the gap comes from partners with complete, consistent reporting, so a pure reporting artifact is an unlikely driver.`
      : confTier === "Medium"
        ? `Only ${fmtPct(p.highConfShare, 0)} of the gap comes from consistently reporting partners — part of the discrepancy may be a reporting artifact and comparability should be verified first.`
        : `Just ${fmtPct(p.highConfShare, 0)} of the gap comes from consistently reporting partners — data quality should be verified before any interpretation.`;
  const clsSentence =
    channels.length === 0
      ? "No comparable country channels exist for this line in the screening set."
      : flaggedCount > 0
        ? `Of ${channels.length} country channels, ${flaggedCount} ${flaggedCount === 1 ? "falls" : "fall"} in the “${BAND_LABELS.critical.label}” or “${BAND_LABELS.high.label}” risk band — priorities for further statistical or customs review.`
        : `None of the ${channels.length} country channels reaches the “${BAND_LABELS.high.label}” risk band under the current methodology.`;

  const narrative =
    `Over ${period}, partners reported cumulative exports of ${p.label} (HS ${p.cmd}) to Uzbekistan worth ${fmtUSD(p.ptnExp)}, ` +
    `while Uzbekistan recorded imports of ${fmtUSD(p.uzbImp)}. Under the central ${cifPct}% freight adjustment the cumulative ` +
    `positive gap is ${fmtUSD(p.positiveGap)} (${fmtPct(gapShare, 0)} of expected CIF imports) and is ${trendWord} across the window. ` +
    `${routingSentence} ${uvSentence} ${confSentence} ${clsSentence} These discrepancies are statistical screening signals — ` +
    `legitimate causes such as freight valuation, transit routing, timing, classification and reporting differences typically act ` +
    `together.`;

  return (
    <div className="space-y-8">
      {/* 1. header */}
      <div>
        <Link href="/products" className="text-sm text-muted hover:text-foreground">← All HS6 products</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{p.label}</h1>
          <span className="tabular rounded bg-[var(--color-panel-2)] px-2 py-0.5 text-xs text-faint">HS {p.cmd}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-faint">
          <span className="tabular">{p.chapter}</span>
          <span>{p.chapterLabel}</span>
          <span>·</span>
          <span>{categoryLabel(p.category)}</span>
          {residual && (
            <span
              className="rounded-md px-2 py-0.5 text-[11px] font-medium"
              style={{ color: COLORS.transit, background: "color-mix(in srgb, var(--color-transit) 10%, transparent)" }}
              title={t("pprof.residual.tip")}
            >
              residual — transparency only
            </span>
          )}
          <span>· product profile · full {period} window · central {cifPct}% freight</span>
        </div>
      </div>

      <ContextLine filter={FULL_FILTER} />

      {/* 2. cumulative KPIs */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label={t("pprof.stat.positiveGap")} value={fmtUSD(p.positiveGap)} accent={COLORS.positive}
          sub={`${fmtPct(gapShare, 0)} of expected CIF imports`}
          info={`Sum of positive yearly CIF-adjusted discrepancies across all partners, ${period}, at the central ${cifPct}% freight assumption. ${fmtUSDFull(p.positiveGap)}.`} />
        <Stat label={t("pprof.stat.partnerExports")} value={fmtUSD(p.ptnExp)} accent={COLORS.partner}
          sub={`vs ${fmtUSD(p.uzbImp)} UZB recorded (CIF)`}
          info={`Cumulative partner-reported exports of HS ${p.cmd} to Uzbekistan vs Uzbekistan-recorded imports. ${fmtUSDFull(p.ptnExp)} vs ${fmtUSDFull(p.uzbImp)}.`} />
        <Stat label={t("pprof.stat.concentration")} value={topChannel && totalPos > 0 ? fmtPct(topShare, 0) : "n/a"}
          sub={topChannel && totalPos > 0 ? `${topChannel.partner} holds the largest share` : "no positive-gap channels"}
          info={t("pprof.stat.concentration.info")} />
        <Stat label={t("pprof.stat.trend")} value={trendWord} accent={trendWord === "rising" ? COLORS.positive : undefined}
          sub={`avg ${fmtUSD(recent)}/yr recent vs ${fmtUSD(early)}/yr early`}
          info={t("pprof.stat.trend.info")} />
        <Stat label={t("pprof.stat.reporterQuality")} value={confTier}
          sub={`${fmtPct(p.highConfShare, 0)} of gap from reliable reporters`}
          info={t("pprof.stat.reporterQuality.info")} />
      </section>

      {/* 3. annual chart */}
      <section>
        <SectionTitle
          title={t("prof.byYear.title")}
          desc={`Source: UN Comtrade mirror data, ${period}, all partners combined. Amber = partner-reported exports (FOB); blue = Uzbekistan-recorded imports (CIF); dashed line = signed CIF-adjusted gap at the central ${cifPct}% freight assumption. Years without data on either side are simply absent — never drawn as zero.`}
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
          <p className="text-sm text-muted">
            No comparable country channels for this line — both sides must report a country pair before it can be screened.
            Missing partner reporting is a data limitation, not a zero gap.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {BAND_ORDER.filter((k) => (bandCounts.get(k) ?? 0) > 0).map((k) => (
              <div key={k} className="flex items-center gap-2 rounded-md border border-[var(--color-border-soft)] px-3 py-2"
                title={BAND_LABELS[k].desc}>
                <BandBadge band={k} />
                <span className="tabular text-lg font-semibold" style={{ color: BAND_COLORS[k] }}>{bandCounts.get(k)}</span>
                <span className="text-xs text-faint">channel{(bandCounts.get(k) ?? 0) === 1 ? "" : "s"}</span>
              </div>
            ))}
            <p className="basis-full text-xs text-faint">
              {channels.length} comparable channel{channels.length === 1 ? "" : "s"} in total. The “{BAND_LABELS.critical.label}”
              and “{BAND_LABELS.high.label}” bands mark a priority for further statistical or customs review.
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
          <p className="card p-8 text-center text-sm text-muted">
            No comparable country channels for this line in the screening set.
          </p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="zebra w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wider text-faint">
                  <th className="px-3 py-2 font-medium">Partner</th>
                  <th className="px-3 py-2 font-medium">Risk</th>
                  <th className="px-3 py-2 font-medium">Band · components</th>
                  <th className="px-3 py-2 text-right font-medium">Partner exports (FOB)</th>
                  <th className="px-3 py-2 text-right font-medium">UZB imports (CIF)</th>
                  <th className="px-3 py-2 text-right font-medium" style={{ color: COLORS.positive }}>Positive discrepancy</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Years <InfoTip text="Comparable years (both sides reported) out of the window. Missing partner-years are excluded, never zero-filled." />
                  </th>
                  <th className="px-3 py-2 font-medium">Robustness</th>
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
                        Channel →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-faint">
          Source: UN Comtrade · full {period} window · nominal USD · central {cifPct}% freight. A country absent from this
          table has no comparable observation for this line — partner data missing is not treated as a zero gap.
        </p>
      </section>

      {/* 6. data coverage: unit values / weight availability */}
      <section className="card p-5">
        <SectionTitle
          title={t("pprof.uv.title")}
          desc={t("pprof.uv.desc")}
          right={<QualityTag tier={confTier} tip={`${fmtPct(p.highConfShare, 0)} of the gap comes from partners with complete, consistent Comtrade reporting.`} />}
        />
        {p.uv ? (
          <div className="flex flex-wrap items-start gap-8 text-sm">
            <div>
              <div className="text-xs text-faint">Uzbekistan declared</div>
              <div className="tabular text-xl">${p.uv.uvUzb.toFixed(2)}/kg</div>
            </div>
            <div>
              <div className="text-xs text-faint">Partners declared</div>
              <div className="tabular text-xl">${p.uv.uvPtn.toFixed(2)}/kg</div>
            </div>
            <div>
              <div className="flex items-center gap-1 text-xs text-faint">
                UV ratio (UZB / partner) <InfoTip text="Below 1 = Uzbekistan declares a lower price per kilo than its partners where both report weight. Consistent with under-valuation but can also reflect product-mix or quality differences." />
              </div>
              <div className="tabular text-xl font-semibold" style={{ color: p.uv.uvRatio < 0.85 ? COLORS.positive : COLORS.ok }}>
                {p.uv.uvRatio.toFixed(2)}
              </div>
            </div>
            <p className="max-w-sm text-xs leading-relaxed text-faint">
              Based on {p.uv.years} dual-weight year{p.uv.years === 1 ? "" : "s"} across all partners;
              {" "}{uvChannels} of {channels.length || "no"} country channel{channels.length === 1 ? " has" : "s have"} at least
              one dual-weight year. Years without weight on both sides are excluded from the ratio, never zero-filled.
            </p>
          </div>
        ) : (
          <p className="max-w-3xl text-sm text-muted">
            No year in the window has net weight reported on <em>both</em> sides for this product, so unit values cannot be
            compared and price vs volume effects cannot be separated. This absence is a data limitation —{" "}
            <MissingValue kind="notComparable" /> — never a zero, and the value discrepancy above stands on its own.
          </p>
        )}
      </section>

      {/* 7. interpretation */}
      <section className="card border-l-2 border-l-[var(--color-accent)] p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-faint">{t("pprof.interpretation")}</h2>
        <p className="text-[15px] leading-relaxed text-muted">{narrative}</p>
        <p className="mt-3 text-xs text-faint">
          A statistical screening assessment generated from measured mirror data (UN Comtrade, {period}). Establishing any
          violation requires declarations, audit or inspection (evidence level 5), which open trade statistics cannot provide.
          Profile totals include all partner channels for this product, including small ones excluded elsewhere by the
          materiality floor.
        </p>
      </section>

      {/* 8. HS revision note */}
      <section className="rounded-md border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-4 py-3 text-xs text-faint">
        <strong className="text-muted">HS comparability note.</strong> Both sides are extracted under a single HS revision, so
        codes are broadly comparable; a code-level concordance table across revisions is planned but not yet applied, and
        residual classification differences between similar HS6 lines cannot be excluded
        {residual ? ` — chapter ${p.chapter} is additionally a residual/confidentiality category` : ""}.
      </section>
    </div>
  );
}
