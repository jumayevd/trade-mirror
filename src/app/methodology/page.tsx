import { EvidenceLadder } from "@/components/ui";
import { aggregate, DEFAULT_FILTER, meta, DATA_VERSION, METHODOLOGY_VERSION } from "@/lib/dataset";
import { fmtUSD } from "@/lib/format";

export const metadata = { title: "Methodology — Trade Mirror" };

const FULL = aggregate({ ...DEFAULT_FILTER, from: meta.window.start, to: meta.window.end, stage: "comparable", minGap: 0 });

function Formula({ children }: { children: React.ReactNode }) {
  return <div className="card my-3 px-4 py-3 font-mono text-[13px] text-foreground/90">{children}</div>;
}
function H({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold text-[var(--color-primary)]">{children}</h3>;
}

const DEFINITIONS: [string, string][] = [
  ["Reported flow", "A value one side actually submitted to UN Comtrade for a country-year-product."],
  ["Expected import CIF", "Partner export FOB × (1 + freight rate) — the partner's figure brought to an approximate import valuation basis."],
  ["Signed discrepancy", "Expected import CIF − Uzbekistan's recorded import CIF."],
  ["Positive discrepancy", "max(signed, 0): the partner reports more than Uzbekistan records."],
  ["Reverse discrepancy", "max(−signed, 0): Uzbekistan records more than the partner reports."],
  ["Absolute discrepancy", "Positive + reverse — the total two-sided asymmetry."],
  ["Bounded asymmetry %", "Absolute discrepancy ÷ max(expected CIF, UZB imports); bounded 0–100% for non-negative flows."],
  ["Residual unexplained discrepancy", "A comparable discrepancy that survives the basic checks: not transit-dominated, not a residual HS code, at least two comparable years, and sign-stable across the 6–15% freight band."],
  ["Robustness", "Whether the finding survives changes in assumptions (freight rate, coverage, data availability)."],
];

const CAUSES: [string, string][] = [
  ["CIF/FOB valuation", "Imports include freight and insurance; exports don't. Adjusted by the freight scenario — the one methodological assumption, shown as a 6–15% band."],
  ["Time lag", "Goods shipped in December may clear customs in January; annual data cuts across this."],
  ["Origin vs consignment", "Uzbekistan attributes imports to country of origin; hubs report re-exports by consignment — routed goods legitimately diverge."],
  ["Re-export & transit", "Goods passing through third countries can appear in one mirror and not the other."],
  ["Trade system differences", "General vs special trade system boundaries differ between reporters."],
  ["HS classification", "The two sides can classify the same good under different codes, especially near similar headings."],
  ["Confidentiality & residual codes", "Some exporters report sensitive trade under residual codes (HS 98–99) that can never be matched product-by-product."],
  ["Coverage & reporting quality", "A partner that reports late, partially or not at all creates gaps that are data artifacts, not trade."],
];

const SCORE_A = [
  ["Magnitude", "35%", "log₁₀-scaled residual discrepancy with fixed anchors ($1M → 0, $10B → 1)."],
  ["Relative size", "25%", "Bounded asymmetry — a 90%-missing flow outranks a 10%-missing one of equal size."],
  ["Persistence", "20%", "Share of comparable years in the same direction plus longest streak, shrunk when fewer than 3 years exist."],
  ["Dynamics", "10%", "Sustained growth of the discrepancy (recent vs early mean), not a single spike."],
  ["Value/quantity anomaly", "10%", "Unit-value divergence where both sides report weight; when weight is missing the remaining weights are renormalized."],
];
const SCORE_E = [
  ["Both-side coverage", "25%", "Comparable years ÷ years in the selected period; missing-as-zero is never allowed."],
  ["Reporter reliability", "20%", "Partner's reporting coverage across the window, halved after a reporting stop."],
  ["HS comparability", "15%", "Residual codes score 0; regular codes 0.8 pending the HS-concordance dataset (single-revision extract)."],
  ["Weight/quantity evidence", "15%", "Share of years with comparable physical measures on both sides."],
  ["Freight robustness", "10%", "Sign stable across the 6–15% band."],
  ["Transit exposure", "10%", "Direct partners score above transit-sensitive hubs."],
  ["Residual/noise penalty", "5%", "Residual chapters and sub-$1M channels are down-weighted."],
];

const MATRIX = [
  ["High anomaly", "High evidence", "Investigate", "Strongest open-data signal; priority for further statistical or customs review."],
  ["High anomaly", "Low evidence", "Verify data first", "Check statistical comparability before interpreting."],
  ["Low anomaly", "High evidence", "Monitor", "Good data, anomaly not yet strong."],
  ["Low anomaly", "Low evidence", "Low priority", "Not usable for substantive conclusions."],
  ["Any", "Transit-sensitive", "Transit-sensitive", "Shown separately; never mixed into core results."],
];

const FORBIDDEN: [string, string][] = [
  ["“The shadow economy equals X”", "“The sum of positive statistical asymmetries is X under the selected scenario.”"],
  ["“Undeclared imports of X”", "“Positive residual unexplained discrepancy of X.”"],
  ["“Country/product is involved in smuggling”", "“The channel is a high priority for further review.”"],
  ["“Confirmed under-valuation”", "“The unit-value pattern is consistent with a possible valuation difference.”"],
  ["“Budget losses equal gap × tax rate”", "“A fiscal estimate is impossible without rates, exemptions, tax bases and verified declarations.”"],
];

const REFS: [string, string][] = [
  ["IMF — The Use of Mirror Data by Customs Administrations (2023)", "https://www.imf.org/en/publications/tnm/issues/2023/09/26/the-use-of-mirror-data-by-customs-administrations-fromprinciplestopractice-537562"],
  ["UNSD — Guidelines on Analyzing and Reducing Bilateral Asymmetry (2019)", "https://comtradeapi.un.org/files/v1/app/wiki/Guidelines_on_Analyzing_and_Reducing_Bilateral_Asymmetry-23_Apr_2019.pdf"],
  ["World Bank / WITS — Imports, Exports and Mirror Data", "https://wits.worldbank.org/wits/wits/witshelp/content/data_retrieval/T/Intro/B2.Imports_Exports_and_Mirror.htm"],
  ["World Bank — Bridging the Gap in Trade Reporting (2024)", "https://documents1.worldbank.org/curated/en/099743506042435986/pdf/IDU-c7240652-37ed-4409-a8be-d65d86b26564.pdf"],
  ["Carrère & Grigoriou — Can mirror data help to capture informal international trade?", "https://ferdi.fr/dl/df-6iH6FxjdWS8K1vAs43xfqnwQ/ferdi-p123-can-mirror-data-help-to-capture-informal-international-trade.pdf"],
];

export default function MethodologyPage() {
  return (
    <div className="max-w-3xl space-y-10">
      {/* short "how to read" on top (spec 6.13) */}
      <section className="card space-y-2 border-l-2 border-l-[var(--color-primary)] p-5">
        <h2 className="text-lg font-semibold tracking-tight">How to read this dashboard</h2>
        <p className="text-sm leading-relaxed text-muted">
          Every trade flow is recorded at least twice — as a partner&apos;s export and as Uzbekistan&apos;s
          import. After a freight adjustment the two should roughly agree; where they don&apos;t, a{" "}
          <strong className="text-foreground">mirror discrepancy</strong> appears. This site measures those
          discrepancies, tests their robustness and data quality, and ranks channels for further review.
          A discrepancy — however large — is a <strong className="text-foreground">screening signal</strong>:
          it shows where to look, never what happened. Positive (partner &gt; UZB) and reverse
          (UZB &gt; partner) discrepancies are always shown separately; anomaly strength and evidence quality
          are always scored separately; and missing data is never treated as a zero flow.
        </p>
      </section>

      <section className="space-y-3 text-[15px] leading-relaxed text-muted">
        <H>1. Evidence ladder</H>
        <EvidenceLadder />
        <p>
          Open trade data supports levels 1–3: observed values, comparable pairs and residual unexplained
          discrepancies. Level 4 (behavioural evidence — tariff-incentive and misclassification tests) is
          planned once a reliable HS6 tariff dataset is added. Level 5 (verified non-compliance) requires
          declarations, audits or administrative decisions and is <em>never</em> claimed on this site.
        </p>
      </section>

      <section className="space-y-3 text-[15px] leading-relaxed text-muted">
        <H>2. Definitions</H>
        <Formula>expected_import_cif = partner_export_fob × (1 + freight_rate)</Formula>
        <Formula>signed = expected_import_cif − uzb_import_cif · positive = max(signed, 0) · reverse = max(−signed, 0) · absolute = |signed|</Formula>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <tbody className="zebra">
              {DEFINITIONS.map(([term, def]) => (
                <tr key={term} className="border-b border-[var(--color-border-soft)] align-top last:border-0">
                  <td className="w-56 px-4 py-2 font-medium text-foreground">{term}</td>
                  <td className="px-4 py-2 text-muted">{def}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Aggregation rules: positive and reverse totals are sums of per-channel-year maxima and are never
          netted against each other; a signed/net figure is never the only headline. Observations enter the
          mirror comparison only for country-years where the respective side actually reported.
        </p>
      </section>

      <section className="space-y-3 text-[15px] leading-relaxed text-muted">
        <H>3. Legitimate statistical causes of asymmetry</H>
        <ul className="ml-5 list-disc space-y-2">
          {CAUSES.map(([c, d]) => <li key={c}><strong className="text-foreground">{c}</strong> — {d}</li>)}
        </ul>
      </section>

      <section className="space-y-3 text-[15px] leading-relaxed text-muted">
        <H>4. Anomaly Strength (0–100)</H>
        <p>Ranks how unusual a discrepancy is. It deliberately contains <em>no</em> data-quality information.</p>
        <ScoreTable rows={SCORE_A} />
        <H>5. Evidence Quality (0–100)</H>
        <p>Ranks how reliable and comparable the underlying data is — displayed next to every anomaly, never hidden.</p>
        <ScoreTable rows={SCORE_E} />
        <p className="text-sm text-faint">
          Weights are configuration, versioned with the methodology (v{METHODOLOGY_VERSION}). Class thresholds:
          anomaly ≥ 55 counts as high, evidence ≥ 60 as high.
        </p>
      </section>

      <section className="space-y-3 text-[15px] leading-relaxed text-muted">
        <H>6. Classification matrix</H>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wider text-faint">
                <th className="px-4 py-2">Anomaly</th><th className="px-4 py-2">Evidence</th><th className="px-4 py-2">Class</th><th className="px-4 py-2">Meaning</th>
              </tr>
            </thead>
            <tbody className="zebra">
              {MATRIX.map((r) => (
                <tr key={r[2]} className="border-b border-[var(--color-border-soft)] align-top last:border-0">
                  <td className="px-4 py-2">{r[0]}</td><td className="px-4 py-2">{r[1]}</td>
                  <td className="px-4 py-2 font-medium text-foreground">{r[2]}</td><td className="px-4 py-2 text-muted">{r[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Robustness labels: <strong className="text-foreground">Robust</strong> (sign holds at 6/10/15%,
          enough comparable years, no major flags), <strong className="text-foreground">Freight-sensitive</strong>{" "}
          (sign or class changes across scenarios), <strong className="text-foreground">Coverage-sensitive</strong>{" "}
          (depends on a reporting stop or sparse reporting), <strong className="text-foreground">Insufficient data</strong>{" "}
          (fewer than two comparable years).
        </p>
      </section>

      <section className="space-y-3 text-[15px] leading-relaxed text-muted">
        <H>7. Missing data, zeros, residual codes, transit</H>
        <ul className="ml-5 list-disc space-y-2">
          <li><strong className="text-foreground">Missing is never zero.</strong> If a partner did not report a year, no gap is computed for it; coverage warnings appear instead.</li>
          <li><strong className="text-foreground">Residual codes (HS 98–99)</strong> are shown for transparency but excluded from audit-priority framing: they cannot be mirror-matched by construction.</li>
          <li><strong className="text-foreground">Transit hubs</strong> ({meta.partners.filter((p) => p.transit).map((p) => p.name).join(", ")}) are classified separately — origin-vs-consignment recording can create legitimate discrepancies.</li>
          <li><strong className="text-foreground">Noise floor:</strong> channel-years below ≈$0.1M are ignored; HS6 channels below ≈$8M partner value / ≈$4M discrepancy over the window are excluded from the shipped channel tables (product profiles disclose when their totals include sub-floor channels).</li>
          <li><strong className="text-foreground">Reporting stops</strong> (e.g. Russia after {meta.partners.find((p) => p.iso3 === "RUS")?.lastReportedYear ?? 2021}) down-weight evidence quality and exclude the partner from trend comparisons — a stop is not an improvement.</li>
        </ul>
      </section>

      <section className="space-y-3 text-[15px] leading-relaxed text-muted">
        <H>8. What may and may not be said</H>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wider text-faint">
                <th className="px-4 py-2">Not allowed</th><th className="px-4 py-2">Allowed</th>
              </tr>
            </thead>
            <tbody className="zebra">
              {FORBIDDEN.map(([bad, good]) => (
                <tr key={bad} className="border-b border-[var(--color-border-soft)] align-top last:border-0">
                  <td className="px-4 py-2 text-[var(--color-investigate)]">{bad}</td>
                  <td className="px-4 py-2 text-muted">{good}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 text-[15px] leading-relaxed text-muted">
        <H>9. Versioning & reproducibility</H>
        <p>
          Data version <strong className="text-foreground">{DATA_VERSION}</strong> · methodology{" "}
          <strong className="text-foreground">v{METHODOLOGY_VERSION}</strong> · generated {new Date(meta.generatedAt).toISOString().slice(0, 10)}.
          All pages and exports read one calculation source; filters are reflected in shareable URLs; CSV
          exports embed the data version, methodology version and active filter context. Cumulative
          {" "}{meta.window.start}–{meta.window.end} reference figures at the central scenario: comparable trade{" "}
          {fmtUSD(FULL.kpis.comparableTrade)}, positive discrepancy {fmtUSD(FULL.kpis.positive.central)}{" "}
          ({fmtUSD(FULL.kpis.positive.low)}–{fmtUSD(FULL.kpis.positive.high)} across the freight band), reverse{" "}
          {fmtUSD(FULL.kpis.reverse)}.
        </p>
      </section>

      <section className="space-y-3 text-[15px] leading-relaxed text-muted">
        <H>10. References</H>
        <ul className="ml-5 list-disc space-y-1 text-sm">
          {REFS.map(([label, url]) => (
            <li key={url}><a href={url} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">{label}</a></li>
          ))}
        </ul>
        <p className="text-xs text-faint">Architecture note: this version computes all figures from a versioned static snapshot in one client-side engine (one calculation source). The FastAPI + DuckDB service layer described in the technical specification is the planned next infrastructure step and does not change any formula on this page.</p>
      </section>
    </div>
  );
}

function ScoreTable({ rows }: { rows: string[][] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wider text-faint">
            <th className="px-4 py-2">Component</th><th className="px-4 py-2">Weight</th><th className="px-4 py-2">Computation</th>
          </tr>
        </thead>
        <tbody className="zebra">
          {rows.map((r) => (
            <tr key={r[0]} className="border-b border-[var(--color-border-soft)] align-top last:border-0">
              <td className="px-4 py-2 font-medium text-foreground">{r[0]}</td>
              <td className="px-4 py-2 text-faint">{r[1]}</td>
              <td className="px-4 py-2 text-muted">{r[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
