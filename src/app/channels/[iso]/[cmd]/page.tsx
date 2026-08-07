import { notFound } from "next/navigation";
import Link from "next/link";
import ChannelChart from "@/components/charts/ChannelChart";
import {
  Stat, SectionTitle, ContextLine, AnomalyBadge, EvidenceBadge, ClassBadge,
  RobustnessBadge, QualityTag, TransitTag, MissingValue, InfoTip,
} from "@/components/ui";
import {
  aggregate, meta, DEFAULT_FILTER, partnerMetaOf, productByCmd, isResidualChapter,
  CLASS_LABELS, type Filter, type SignalClass,
} from "@/lib/dataset";
import { fmtUSD, fmtUSDFull, fmtPct, COLORS } from "@/lib/format";

/**
 * Channel profile (spec §6.9) — one country × HS6 pair, the most detailed page of the site.
 * Server component: computes its own full-window aggregate with explicit filters so the
 * profile is stable regardless of the visitor's interactive filter state.
 */
const FULL_FILTER: Filter = {
  ...DEFAULT_FILTER,
  years: [...meta.years],
  minGap: 0,
};
const FULL = aggregate(FULL_FILTER);
const WINDOW = meta.years;

const NEXT_STEP: Record<SignalClass, string> = {
  investigate: "further statistical reconciliation and, where appropriate, customs analytics review",
  verify: "verification of statistical comparability before interpretation",
  monitor: "routine monitoring",
  low: "no action",
  transit: "clarification of routing and origin attribution first",
};

const FLAG_LABELS: Record<string, string> = {
  transit: "transit/re-export exposure",
  "residual-hs": "residual HS category (unallocated or confidential trade)",
  "reporting-stop": "the partner stopped reporting within the window",
  "sparse-reporter": "sparse partner reporting coverage",
  "missing-weight": "no dual-sided weight data",
  "freight-sensitive": "the sign is sensitive to the freight assumption",
};

type AltStatus = "unlikely" | "possible" | "material" | "cannot-assess";
const ALT_STATUS: Record<AltStatus, { label: string; color: string }> = {
  unlikely: { label: "Unlikely", color: "#15803d" },
  possible: { label: "Possible", color: "#b45309" },
  material: { label: "Material", color: "#d97706" },
  "cannot-assess": { label: "Cannot assess", color: "#75847b" },
};

export function generateStaticParams() {
  return [...FULL.channels6]
    .sort((a, b) => Math.abs(b.primary) - Math.abs(a.primary))
    .slice(0, 150)
    .map((c) => ({ iso: c.partnerIso.toLowerCase(), cmd: c.cmd }));
}

export async function generateMetadata({ params }: { params: Promise<{ iso: string; cmd: string }> }) {
  const { iso, cmd } = await params;
  return { title: `Channel ${iso.toUpperCase()} x ${cmd} — Trade Mirror` };
}

export default async function ChannelPage({ params }: { params: Promise<{ iso: string; cmd: string }> }) {
  const { iso, cmd } = await params;
  const channel = FULL.channels6.find((c) => c.partnerIso === iso.toUpperCase() && c.cmd === cmd);
  if (!channel) notFound();

  const pm = partnerMetaOf(channel.partnerIso)!;
  const product = productByCmd(channel.cmd);
  const period = `${meta.window.start}–${meta.window.end}`;
  const cifPct = Math.round(meta.cif.central * 100);
  const expectedLow = channel.peT * (1 + meta.cif.low);
  const expectedHigh = channel.peT * (1 + meta.cif.high);

  // sign reversals across comparable years (transitions between + and − among non-noise years)
  const NOISE = 100_000;
  const signSeq = channel.years
    .map((r) => (r.signed > NOISE ? 1 : r.signed < -NOISE ? -1 : 0))
    .filter((s) => s !== 0);
  let reversals = 0;
  for (let i = 1; i < signSeq.length; i++) if (signSeq[i] !== signSeq[i - 1]) reversals++;

  const trendWord = channel.trend > 1_000_000 ? "rising" : channel.trend < -1_000_000 ? "declining" : "broadly stable";
  const weakReporter = channel.flags.includes("reporting-stop") || channel.flags.includes("sparse-reporter");
  const residual = isResidualChapter(channel.chapter);

  // alternative-explanations checklist (spec §6.9.7) — statuses derived from measured flags
  const alternatives: { title: string; status: AltStatus; note: string }[] = [
    {
      title: "CIF/FOB valuation assumption",
      status: "possible",
      note: `Partner exports are valued FOB while Uzbekistan records CIF; the comparison assumes a ${cifPct}% central freight wedge inside a 6–15% band. ${channel.flipsAcrossFreight
        ? "For this channel the sign of the net discrepancy changes within that band, so the assumption materially affects the reading."
        : "For this channel the sign of the net discrepancy holds across the whole band."}`,
    },
    {
      title: "Transit / re-export routing",
      status: channel.transit ? "material" : "unlikely",
      note: channel.transit
        ? `${channel.partner} is a transit/re-export hub: Uzbekistan attributes imports to country of origin while hubs report re-exports by consignment, so routed goods can create legitimate discrepancies here.`
        : `${channel.partner} is not flagged as a transit/re-export hub, which weakens routing-based explanations for this pair.`,
    },
    {
      title: "Partner reporting quality",
      status: weakReporter ? "material" : "unlikely",
      note: weakReporter
        ? `${channel.partner}'s Comtrade reporting is incomplete (${pm.reportedYears.length}/${WINDOW.length} years reported${pm.lapse ? `; last report ${pm.lastReportedYear}` : ""}). Part of the apparent discrepancy may be a reporting artifact rather than a measured gap.`
        : `${channel.partner} reported consistently across the window (${pm.reportedYears.length}/${WINDOW.length} years), so reporting gaps are an unlikely driver.`,
    },
    {
      title: "Classification differences",
      status: "cannot-assess",
      note: "Both sides are extracted under a single HS revision, but no code-level concordance table is applied yet, so reclassification between similar HS6 lines on the two sides can be neither confirmed nor excluded.",
    },
    {
      title: "Timing and lag effects",
      status: "possible",
      note: "Goods shipped late in one calendar year may be recorded by the importer in the next; such year-edge effects create small legitimate discrepancies in any country pair.",
    },
    {
      title: "Confidentiality / residual codes",
      status: residual ? "material" : "unlikely",
      note: residual
        ? `HS chapter ${channel.chapter} is a residual category used for unallocated or confidential trade — a large mirror gap here is substantially a classification artifact by construction.`
        : "This product sits in a regular HS chapter, not a residual/confidentiality bucket, so this explanation is an unlikely driver.",
    },
  ];

  const limitations = channel.flags.length > 0
    ? channel.flags.map((f) => FLAG_LABELS[f] ?? f).join("; ")
    : "no material quality flags on this channel";

  const narrative =
    `In ${period}, ${channel.partner} reported exports of HS ${channel.cmd} worth ${fmtUSD(channel.peT)}, ` +
    `while Uzbekistan recorded imports of ${fmtUSD(channel.uiT)}. Under the central ${cifPct}% freight adjustment ` +
    `the residual positive asymmetry is ${fmtUSD(channel.posT)} and ${channel.flipsAcrossFreight ? "does not hold" : "holds"} ` +
    `across all three freight scenarios (6%, 10%, 15%). The channel has ${channel.comparableYears} of ${WINDOW.length} ` +
    `comparable years and evidence quality ${channel.evidence.toFixed(0)}/100. Main limitations: ${limitations}. ` +
    `The pattern is classified as “${CLASS_LABELS[channel.cls].label}” and warrants ${NEXT_STEP[channel.cls]}.`;

  return (
    <div className="space-y-8">
      {/* 1. header */}
      <div>
        <Link href="/risk" className="text-sm text-muted hover:text-foreground">← Screening queue</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            <Link href={`/partners/${channel.partnerIso.toLowerCase()}`} className="hover:underline">{channel.partner}</Link>
            <span className="text-faint"> × </span>
            {product ? (
              <Link href={`/products/${channel.cmd}`} className="hover:underline">{channel.cmdLabel}</Link>
            ) : (
              <span title="No dedicated product profile — below the profiling threshold">{channel.cmdLabel}</span>
            )}
          </h1>
          <span className="tabular rounded bg-[var(--color-panel-2)] px-2 py-0.5 text-xs text-faint">HS {channel.cmd}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ClassBadge cls={channel.cls} />
          <AnomalyBadge score={channel.anomaly} />
          <EvidenceBadge score={channel.evidence} />
          <RobustnessBadge r={channel.robustness} />
          {channel.transit && <TransitTag />}
          <span className="text-xs text-faint">{channel.region} · channel profile · full {period} window</span>
        </div>
      </div>

      <ContextLine filter={FULL_FILTER} />

      {/* 2. trade comparison */}
      <section>
        <SectionTitle
          title="Trade comparison"
          desc="Cumulative full-window values for this single country × HS6 pair. The positive discrepancy is accumulated year by year, so it is never diluted by the net figure."
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Stat label="Partner exports (FOB)" value={fmtUSD(channel.peT)} accent={COLORS.partner}
            sub={`${channel.partner} reported`} info={`Cumulative exports of HS ${channel.cmd} to Uzbekistan as reported by ${channel.partner}, FOB. ${fmtUSDFull(channel.peT)}.`} />
          <Stat label={`Expected CIF (${cifPct}%)`} value={fmtUSD(channel.expectedT)}
            sub={`band ${fmtUSD(expectedLow)} – ${fmtUSD(expectedHigh)}`}
            info={`Partner exports × (1 + freight). Central ${cifPct}% scenario; the sub-line shows the 6% and 15% band endpoints.`} />
          <Stat label="UZB imports (CIF)" value={fmtUSD(channel.uiT)} accent={COLORS.uzb}
            sub="Uzbekistan recorded" info={`Cumulative imports of HS ${channel.cmd} from ${channel.partner} as recorded by Uzbekistan. ${fmtUSDFull(channel.uiT)}.`} />
          <Stat label="Positive discrepancy" value={fmtUSD(channel.posT)} accent={COLORS.positive}
            sub="partner > UZB, by year" info="Σ max(expected CIF − UZB imports, 0) over comparable years." />
          <Stat label="Signed (net)" value={fmtUSD(channel.signedT, { sign: true })}
            sub={`bounded asymmetry ${fmtPct(channel.boundedAsymmetry)}`}
            info="Expected CIF minus UZB imports, summed over the window. Shown for context only — years of opposite sign offset inside this figure, which is why screening uses the positive discrepancy." />
        </div>
      </section>

      {/* 3. yearly chart */}
      <section>
        <SectionTitle
          title="Reported vs recorded, by year"
          desc={`Source: UN Comtrade mirror data, ${period}. Amber = ${channel.partner}'s reported exports (FOB); blue = Uzbekistan's recorded imports (CIF); dashed line = signed discrepancy at the central ${cifPct}% freight adjustment. Only years where both sides reported are drawn — hollow years mean there is no partner reference and no gap is computed.`}
        />
        <ChannelChart years={channel.years} windowYears={WINDOW} partner={channel.partner} />
      </section>

      {/* 4. historical persistence */}
      <section>
        <SectionTitle
          title="Historical persistence"
          desc="Persistent, one-directional discrepancies are stronger screening signals than one-off spikes or alternating signs."
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Stat label="Comparable years" value={`${channel.comparableYears}/${WINDOW.length}`}
            sub="both sides reported" info="Years inside the window where both the partner and Uzbekistan reported this pair. Missing years are excluded, never zero-filled." />
          <Stat label="Positive years" value={String(channel.posYears)} accent={COLORS.positive}
            sub={`of ${channel.comparableYears} comparable`}
            info="Comparable years where expected CIF exceeded UZB imports beyond the noise floor. Only these years contribute to the positive discrepancy." />
          <Stat label="Longest positive streak" value={`${channel.longestPosStreak} yr${channel.longestPosStreak === 1 ? "" : "s"}`}
            sub="consecutive positive years" info="Longest run of consecutive comparable years with a positive discrepancy." />
          <Stat label="Sign reversals" value={String(reversals)}
            sub="sign changes over time" info="How many times the signed discrepancy changed sign across comparable years (noise-floor filtered). Frequent changes weaken a persistent reading." />
          <Stat label="Trend" value={trendWord} accent={trendWord === "rising" ? COLORS.positive : undefined}
            sub={`${channel.trend >= 0 ? "+" : "−"}${fmtUSD(Math.abs(channel.trend))} recent vs early avg`}
            info="Average yearly discrepancy in the most recent years minus the earliest years of the comparable series." />
        </div>
      </section>

      {/* 5. value–quantity decomposition */}
      <section className="card p-5">
        <SectionTitle
          title="Value–quantity decomposition"
          desc="Where both sides report weight, unit values ($/kg) help separate price under-declaration from missing volume. A unit-value gap alone is still a screening signal."
        />
        {channel.uvRatio != null ? (
          <div className="flex flex-wrap items-start gap-8 text-sm">
            <div>
              <div className="flex items-center gap-1 text-xs text-faint">Channel UV ratio (UZB / partner) <InfoTip text="Ratio of Uzbekistan's implied unit value to the partner's for this specific channel, computed over years where BOTH sides reported net weight. Below 1 = Uzbekistan declares a lower price per kilo." /></div>
              <div className="tabular text-xl font-semibold" style={{ color: channel.uvRatio < 0.85 ? COLORS.positive : COLORS.ok }}>
                {channel.uvRatio.toFixed(2)}
              </div>
              <div className="text-xs text-faint">from {channel.uvYears} dual-weight year{channel.uvYears === 1 ? "" : "s"} in this channel</div>
            </div>
            <div>
              <div className="text-xs text-faint">Uzbekistan declared (product-level)</div>
              <div className="tabular text-xl">{product?.uv ? `$${product.uv.uvUzb.toFixed(2)}/kg` : <MissingValue kind="notComparable" />}</div>
            </div>
            <div>
              <div className="text-xs text-faint">Partners declared (product-level)</div>
              <div className="tabular text-xl">{product?.uv ? `$${product.uv.uvPtn.toFixed(2)}/kg` : <MissingValue kind="notComparable" />}</div>
            </div>
            <p className="max-w-sm text-xs leading-relaxed text-faint">
              The $/kg figures are <strong className="text-muted">product-level</strong> — HS {channel.cmd} across all partners
              {product?.uv ? `, over ${product.uv.years} dual-weight year${product.uv.years === 1 ? "" : "s"}` : ""} — not specific to
              this channel. Only the ratio on the left is channel-specific. A ratio below 1 is consistent with under-valuation but can
              also reflect product-mix or quality differences.
            </p>
          </div>
        ) : (
          <p className="max-w-3xl text-sm text-muted">
            Unit-value decomposition is unavailable for this channel: fewer than two comparable years have net weight reported on
            <em> both</em> sides ({channel.uvYears} dual-weight year{channel.uvYears === 1 ? "" : "s"}). Without a dual-sided weight
            reference, price and volume effects cannot be separated — the value discrepancy above stands on its own and this absence
            is a data limitation, not a zero.
          </p>
        )}
      </section>

      {/* 6. data quality panel */}
      <section className="card p-5">
        <SectionTitle
          title="Data quality"
          desc="How reliable and comparable the underlying records are — quality caveats are about the data, never about conduct."
          right={<QualityTag tier={channel.tier} />}
        />
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-faint">
              Partner reporting coverage · {pm.reportedYears.length}/{WINDOW.length} years · {fmtPct(pm.coverage, 0)}
              {pm.lapse && <span className="ml-2 normal-case" style={{ color: "#b45309" }}>stopped reporting after {pm.lastReportedYear}</span>}
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
                    title={has ? `${channel.partner} reported in ${y}` : `${channel.partner} did not report in ${y} — no mirror reference; not a zero gap`}>
                    <span>{`'${String(y).slice(2)}`}</span>
                    <span style={{ color: has ? "var(--color-ok)" : "var(--color-faint)" }}>{has ? "●" : "○"}</span>
                  </span>
                );
              })}
            </div>
          </div>
          <ul className="space-y-2 text-sm text-muted">
            <li className="flex gap-2">
              <span className="shrink-0 text-faint">HS comparability</span>
              <span>
                Both sides extracted under a single HS revision — broadly comparable, but no code-level concordance table is applied
                yet, so residual classification differences cannot be excluded{residual ? `; chapter ${channel.chapter} is additionally a residual/confidentiality category` : ""}.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-faint">Transit exposure</span>
              <span>
                {channel.transit
                  ? `${channel.partner} is a transit/re-export hub — origin-vs-consignment recording can create legitimate discrepancies; this channel is assessed in the transit-sensitive track.`
                  : `${channel.partner} is not flagged as a transit/re-export hub.`}
              </span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-faint">Freight sensitivity</span>
              <span>
                {channel.flipsAcrossFreight
                  ? "The sign of the net discrepancy CHANGES within the 6–15% freight band — the direction of this signal depends on the freight assumption and should not be read as settled."
                  : "The sign of the net discrepancy holds across the whole 6–15% freight band."}
              </span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-faint">Weight data</span>
              <span>
                {channel.uvYears > 0
                  ? `Net weight reported on both sides in ${channel.uvYears} of ${channel.comparableYears} comparable years.`
                  : "No year has net weight on both sides — quantity-based checks are unavailable for this channel."}
              </span>
            </li>
          </ul>
        </div>
      </section>

      {/* 7. alternative explanations */}
      <section className="card p-5">
        <SectionTitle
          title="Alternative explanations"
          desc="Benign or technical explanations weighed for this specific channel before any substantive reading. Statuses are derived from measured flags, not judgment calls."
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

      {/* 8. interpretation narrative */}
      <section className="card border-l-2 border-l-[var(--color-accent)] p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-faint">Interpretation</h2>
        <p className="text-[15px] leading-relaxed text-muted">{narrative}</p>
        <p className="mt-3 text-xs text-faint">
          A statistical screening assessment generated from measured mirror data (UN Comtrade, {period}). Discrepancies are screening
          signals for reconciliation and review — establishing any violation requires declarations, audit or inspection, which open
          trade statistics cannot provide.
        </p>
      </section>
    </div>
  );
}
