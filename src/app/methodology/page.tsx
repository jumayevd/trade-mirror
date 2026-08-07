import MethodologyCards from "@/components/MethodologyCards";
import { aggregate, DEFAULT_FILTER, meta } from "@/lib/dataset";
import { fmtUSD, fmtPct } from "@/lib/format";
import { REFERENCES, type Ref } from "@/lib/references";

export const metadata = { title: "Methodology — Trade Mirror" };

const FULL = aggregate({ ...DEFAULT_FILTER, from: meta.window.start, to: meta.window.end, stage: "comparable", minGap: 0 });
const refById = new Map(REFERENCES.map((r) => [r.id, r]));

/* ------------------------------------------------------------------ */
/* Formula cards — name · formula · usage · population · denominator · */
/* interpretation · research basis (numbered citations)                */
/* ------------------------------------------------------------------ */

interface FormulaCard {
  name: string;
  formula: string;
  usedIn: string;
  population: string;
  denominator: string;
  interpretation: string;
  refs: string[];
}

const CARDS: FormulaCard[] = [
  {
    name: "expected import CIF",
    formula: "X_fob × (1 + f),  f ∈ {6%, 10%, 15%}",
    usedIn: "Basis of every discrepancy figure; freight selector in the filter bar",
    population: "Matched partner × product × year pairs",
    denominator: "Not applicable",
    interpretation: "Valuation-basis alignment only — the one methodological assumption, always shown as a band.",
    refs: ["hummels2006", "gaulier2010"],
  },
  {
    name: "signed discrepancy",
    formula: "D = X_fob × (1 + f) − M_cif",
    usedIn: "Queue “Signed” column; sector × partner heatmap; per-year detail panels",
    population: "Matched pairs where both sides reported",
    denominator: "Not applicable",
    interpretation: "Interpret as a statistical discrepancy only.",
    refs: ["bhagwati1964", "unsd2019"],
  },
  {
    name: "positive discrepancy",
    formula: "Σ max(D, 0)  per channel-year",
    usedIn: "Headline tile; amber series everywhere; country/product rankings",
    population: "Matched pairs, accumulated year by year",
    denominator: "Not applicable",
    interpretation: "A potential under-recording signal — never netted against reverse.",
    refs: ["buehn2011", "gfi2021"],
  },
  {
    name: "reverse discrepancy",
    formula: "Σ max(−D, 0)  per channel-year",
    usedIn: "Reverse tile; blue series; Reverse focus tab",
    population: "Matched pairs, accumulated year by year",
    denominator: "Not applicable",
    interpretation: "UZB records exceed the partner’s — shown separately; never read as over-reporting by default.",
    refs: ["buehn2011"],
  },
  {
    name: "gap rate / positive share",
    formula: "Σ max(D,0) ÷ Σ X_cif_exp",
    usedIn: "Country and sector tables (“Gap rate”)",
    population: "Positive direction, matched pairs",
    denominator: "Expected CIF imports",
    interpretation: "Share of expected imports that is potentially unrecorded.",
    refs: ["gfi2021"],
  },
  {
    name: "anomaly strength (A)",
    formula: "100 × (0.35·mag + 0.25·rel + 0.20·pers + 0.10·dyn + 0.10·uv)",
    usedIn: "“A” score on every channel; input to the risk score R",
    population: "Per channel (partner × code), weights sum to 1",
    denominator: "Fixed anchors: $1M → 0, $10B → 1 on the magnitude term",
    interpretation: "How unusual the discrepancy is. Contains no data-quality information.",
    refs: ["fisman2004", "javorcik2008"],
  },
  {
    name: "evidence quality (E)",
    formula: "100 × (0.25·cov + 0.20·rel + 0.15·hs + 0.15·wq + 0.10·fr + 0.10·tr + 0.05·res)",
    usedIn: "“E” score on every channel; input to the risk score R",
    population: "Per channel, weights sum to 1",
    denominator: "Component shares each bounded 0–1",
    interpretation: "How reliable and comparable the underlying records are — scored separately from A.",
    refs: ["yeats1990", "unsd2019"],
  },
  {
    name: "risk score (R)",
    formula: "R = √(A × E),  A = anomaly strength, E = evidence quality",
    usedIn: "“Risk” column, summary tiles and the top-channels chart in Discrepancy & Risk",
    population: "Per channel (partner × code)",
    denominator: "Both inputs bounded 0–100, so R is bounded 0–100",
    interpretation: "Composite screening priority — it ranks channels only and never alters the signal class or its transit handling. The geometric mean limits compensability: weak evidence bounds the score at R ≤ 10·√E, so the anomaly alone can never carry it.",
    refs: ["oecdjrc2008", "imf2023", "wco2011"],
  },
  {
    name: "signal class",
    formula: "matrix(A ≥ 55, E ≥ 60); transit overrides",
    usedIn: "Class labels across the site; queue default ordering",
    population: "Per channel",
    denominator: "Fixed thresholds, versioned with the methodology",
    interpretation: "Screening priority (Investigate / Verify data first / Monitor / Low).",
    refs: ["imf2023", "kellenberg2019"],
  },
];

/** Supporting measures — used in the interface, documented compactly. */
const SUPPORTING: { name: string; formula: string; usedIn: string; refs: string[] }[] = [
  { name: "bounded asymmetry %", formula: "|D| ÷ max(X_cif_exp, M_cif)", usedIn: "Queue “Asym” column; anomaly input", refs: ["unsd2019"] },
  { name: "partner-year coverage", formula: "reported ÷ window partner-years", usedIn: "Comparable-trade tile; Data Quality grid", refs: ["yeats1990"] },
  { name: "robustness", formula: "sign(D) stable at 6/10/15% ∧ ≥2 years", usedIn: "Robustness labels; robust-signals tile", refs: ["hummels2006"] },
  { name: "residual stage", formula: "comparable ∧ ¬transit ∧ ¬HS98–99 ∧ ≥2 yrs ∧ sign-stable", usedIn: "Default evidence-stage filter", refs: ["carrere2015", "unsd2019"] },
  { name: "concentration / HHI", formula: "Σ sᵢ² × 10 000 over direction shares", usedIn: "Overview caption; Statistical profile", refs: ["imf2023"] },
];

const FORBIDDEN: [string, string][] = [
  ["“The shadow economy equals X”", "“The sum of positive statistical asymmetries is X under the selected scenario.”"],
  ["“Undeclared imports of X”", "“Positive residual unexplained discrepancy of X.”"],
  ["“Country/product is involved in smuggling”", "“The channel is a high priority for further review.”"],
  ["“Confirmed under-valuation”", "“The unit-value pattern is consistent with a possible valuation difference.”"],
  ["“Budget losses equal gap × tax rate”", "“A fiscal estimate is impossible without rates, exemptions, tax bases and verified declarations.”"],
];

/** Resolve citation ids to full references once, on the server. */
const RESOLVED = CARDS.map((c) => ({
  ...c,
  refs: c.refs.map((id) => refById.get(id)).filter((r): r is Ref => !!r),
}));

export default function MethodologyPage() {
  const k = FULL.kpis;
  return (
    <div className="space-y-8">
      <section className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Methodology</h1>
        <p className="max-w-3xl text-[13px] leading-relaxed text-muted">
          Every trade flow is recorded twice — as a partner&apos;s export (X) and as Uzbekistan&apos;s import (M).
          After a freight adjustment the two should roughly agree; each card below defines one figure the
          dashboard shows, where it is used, and the literature it rests on. Every number is a{" "}
          <strong className="text-foreground">statistical screening signal</strong> — mirror gaps inform
          shadow-economy research but never measure it.
        </p>
        <p className="tabular text-[11.5px] text-faint">
          {meta.window.start}–{meta.window.end} cumulative at central freight: comparable trade {fmtUSD(k.comparableTrade)} ·
          positive {fmtUSD(k.positive.central)} ({fmtUSD(k.positive.low)}–{fmtUSD(k.positive.high)}) ·
          reverse {fmtUSD(k.reverse)} · flip share {fmtPct(k.flipShare, 0)}
        </p>
      </section>

      {/* formula list — names only; click a row for formula, usage and sources */}
      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold tracking-tight">
          Formulas <span className="text-[12px] font-normal text-faint">· click a measure to open it</span>
        </h2>
        <MethodologyCards cards={RESOLVED} />
      </section>

      {/* supporting measures — compact, one line each */}
      <section className="max-w-4xl">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">Supporting measures</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">
                <th className="px-4 py-2">Measure</th>
                <th className="px-4 py-2">Formula</th>
                <th className="px-4 py-2">Used in</th>
                <th className="px-4 py-2">Basis</th>
              </tr>
            </thead>
            <tbody className="zebra">
              {SUPPORTING.map((s) => {
                const refs = s.refs.map((id) => refById.get(id)).filter((r): r is Ref => !!r);
                return (
                  <tr key={s.name} className="border-b border-[var(--color-border-soft)] align-top last:border-0">
                    <td className="px-4 py-2 font-medium">{s.name}</td>
                    <td className="tabular px-4 py-2 text-muted">{s.formula}</td>
                    <td className="px-4 py-2 text-muted">{s.usedIn}</td>
                    <td className="px-4 py-2 text-muted" title={refs.map((r) => `${r.authors} (${r.year}). ${r.title}. ${r.source}.`).join("\n")}>
                      {refs.map((r) => `${r.authors.split(",")[0].split("&")[0].trim()} ${r.year}`).join("; ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* what may / may not be said */}
      <section className="max-w-4xl">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">Wording rules</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">
                <th className="px-4 py-2">Not allowed</th>
                <th className="px-4 py-2">Allowed</th>
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

      {/* full reference list */}
      <section className="max-w-4xl">
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">References</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-[12.5px] leading-relaxed text-muted">
          {REFERENCES.map((r) => (
            <li key={r.id}>
              {r.authors} ({r.year}). {r.url ? (
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">{r.title}</a>
              ) : <em>{r.title}</em>}. {r.source}. <span className="text-faint">{r.note}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[11.5px] text-faint">
          Missing partner-years are never treated as zero flows. Residual codes (HS 98–99) are shown for
          transparency and excluded from screening priority. Source: UN Comtrade, single versioned snapshot.
        </p>
      </section>
    </div>
  );
}
