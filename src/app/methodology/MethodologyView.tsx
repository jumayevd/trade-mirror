"use client";

import { InfoTip } from "@/components/ui";
import { aggregate, DEFAULT_FILTER, meta, METHODOLOGY_VERSION } from "@/lib/dataset";
import diagnosticsRaw from "@/data/diagnostics.json";
import { fmtNum, fmtPct, fmtUSD } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { LocaleKey } from "@/lib/locales";
import { Cite, REFERENCES } from "@/lib/references";

/**
 * Methodology — the shortest honest account of what the numbers are.
 *
 * Order: why a positive mirror gap is worth reading at all, the literature the
 * reading rests on, the measures the dashboard shows, how the risk score is
 * built, what the score diagnostics say, and the bibliography.
 */

const FULL = aggregate({ ...DEFAULT_FILTER, years: [...meta.years], minGap: 0 });

interface Diagnostics {
  corGP: Record<string, number>;
  gapRateQuantiles: Record<string, { p50: number; p90: number; p99: number }>;
  coverage: Record<string, {
    matchedCellYears: number; matchedCells: number;
    orphanImportCellYears: number; lostExportCellYears: number;
    inScopeCells: number; inScopeCellYears: number;
    valueRetainedShare: number; belowFloor: number;
  }>;
  bandCuts: Record<string, { critical: number; high: number; elevated: number }>;
}
const diag = diagnosticsRaw as unknown as Diagnostics;
const HS6 = "6";

const H2 = "text-[15px] font-semibold tracking-tight";
const P = "max-w-3xl text-[13px] leading-relaxed text-muted";
const TH = "px-4 py-2 text-left text-[11.5px] font-semibold uppercase tracking-[0.1em] text-faint";
const TD = "px-4 py-2 align-top text-[13px] text-muted";

/** A formula on its own line — monospace, quiet, never inside a sentence. */
function Formula({ children }: { children: React.ReactNode }) {
  return (
    <p className="tabular my-2 rounded-md border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-3 py-2 text-[13px] text-foreground">
      {children}
    </p>
  );
}

/**
 * Section header: a numbered eyebrow above the heading. The page is an argument
 * in order — why the gap is readable, what the literature says, what is measured,
 * how it is scored, what qualifies it — and numbering makes that sequence visible
 * instead of leaving six equal-weight headings in a column.
 */
function SectionHead({ n, title, desc }: { n: string; title: string; desc?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2.5">
        <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--color-primary)] text-[12px] font-semibold text-white">
          {n}
        </span>
        <h2 className={H2}>{title}</h2>
      </div>
      {desc ? <p className={P}>{desc}</p> : null}
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="tabular mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-panel-2)] text-[12px] font-semibold text-muted">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13.5px] font-semibold">{title}</h3>
        <div className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted">{children}</div>
      </div>
    </div>
  );
}

/** Papers behind the reading, with their one-line findings. Order = the table. */
const LIT: { key: string; refId: string }[] = [
  { key: "bhagwati", refId: "bhagwati1964" },
  { key: "yeats", refId: "yeats1990" },
  { key: "fisman", refId: "fisman2004" },
  { key: "javorcik", refId: "javorcik2008" },
  { key: "berger", refId: "berger2008" },
  { key: "ferrantino", refId: "ferrantino2008" },
  { key: "buehn", refId: "buehn2011" },
  { key: "carrere", refId: "carrere2015" },
  { key: "kellenberg", refId: "kellenberg2019" },
  { key: "farhad", refId: "farhad2019" },
  { key: "gara", refId: "gara2018" },
  { key: "choi", refId: "choi2019" },
  { key: "nitsch", refId: "nitsch2016" },
  { key: "medina", refId: "medina2018" },
];

const refById = new Map(REFERENCES.map((r) => [r.id, r]));

/**
 * The four bands as percentile cuts on the score. Written as bare numbers so the
 * rows read the same in every language; the fitted thresholds per HS level are
 * in Model diagnostics below.
 */
const BAND_ROWS: { key: string; pct: string; share: string }[] = [
  { key: "critical", pct: "≥ 97.5", share: "2.5%" },
  { key: "high", pct: "75.0 – 97.5", share: "22.5%" },
  { key: "elevated", pct: "50.0 – 75.0", share: "25%" },
  { key: "low", pct: "< 50.0", share: "50%" },
];

export default function MethodologyView() {
  const { t } = useI18n();
  const k = FULL.kpis;
  const cov = diag.coverage[HS6];
  const cuts = diag.bandCuts[HS6];
  const rates = diag.gapRateQuantiles[HS6];
  const tr = (key: string) => t(key as LocaleKey);

  const MEASURES: { key: string; formula: string }[] = [
    { key: "importFob", formula: "M_cif ÷ (1 + f),  f ∈ {0% … 25%}, central 10%" },
    { key: "positive", formula: "Σ max(X_fob − M_cif ÷ (1 + f), 0)" },
    { key: "gapRate", formula: "Σ max(D, 0) ÷ Σ X_fob" },
  ];

  return (
    <div className="space-y-9">
      {/* ---------------------------------------------------------------- */}
      <section className="space-y-1.5">
        <p className="text-[12px] font-medium text-faint">
          UN Comtrade · {meta.window.start}–{meta.window.end} · v{METHODOLOGY_VERSION}
        </p>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("nav.methodology")}</h1>
        <p className="max-w-3xl rounded-md border-l-2 border-l-[var(--color-primary)] bg-[var(--color-panel)] px-4 py-3 text-[13.5px] leading-relaxed text-muted">
          {tr("meth.lede")}
        </p>
      </section>

      {/* 1. why a positive gap is worth reading ------------------------- */}
      <section className="space-y-3">
        <SectionHead n="1" title={tr("meth.why.title")} />
        {/* three separate reasons, so they get three cards rather than one column
            of paragraphs a reader has to segment themselves */}
        <div className="grid max-w-5xl gap-3 lg:grid-cols-3">
          <div className="card p-4 text-[13px] leading-relaxed text-muted">
            {tr("meth.why.p1")}
            <Cite ids={["bhagwati1964", "unsd2019"]} />
          </div>
          <div className="card p-4 text-[13px] leading-relaxed text-muted">
            {tr("meth.why.p2")}
            <Cite ids={["fisman2004", "javorcik2008", "berger2008", "farhad2019"]} />
          </div>
          <div className="card p-4 text-[13px] leading-relaxed text-muted">
            {tr("meth.why.p3")}
            <Cite ids={["buehn2011", "carrere2015", "kellenberg2019"]} />
          </div>
        </div>
      </section>

      {/* 2. literature findings ------------------------------------------ */}
      <section className="space-y-2">
        <SectionHead n="2" title={tr("meth.lit.title")} desc={tr("meth.lit.desc")} />
        <div className="card max-w-5xl overflow-x-auto">
          <table className="w-full min-w-[680px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className={TH}>{tr("meth.lit.colPaper")}</th>
                <th className={TH}>{tr("meth.lit.colFinding")}</th>
              </tr>
            </thead>
            <tbody className="zebra">
              {LIT.map((row) => {
                const r = refById.get(row.refId);
                if (!r) return null;
                return (
                  <tr key={row.key} className="border-b border-[var(--color-border-soft)] last:border-0">
                    <td className={`${TD} whitespace-nowrap font-medium text-foreground`} title={`${r.title}. ${r.source}.`}>
                      {r.authors.split(",")[0].split("&")[0].trim()}
                      {r.authors.includes("&") ? " et al." : ""} ({r.year})
                    </td>
                    <td className={TD}>{tr(`meth.lit.${row.key}`)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. the measures on the dashboard ------------------------------- */}
      <section className="space-y-2">
        <SectionHead n="3" title={tr("meth.measures.title")} desc={tr("meth.measures.desc")} />
        <div className="card max-w-4xl overflow-x-auto">
          <table className="w-full min-w-[620px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className={TH}>{tr("meth.col.measure")}</th>
                <th className={TH}>{tr("meth.col.formula")}</th>
                <th className={TH}>{tr("meth.col.means")}</th>
              </tr>
            </thead>
            <tbody className="zebra">
              {MEASURES.map((m) => (
                <tr key={m.key} className="border-b border-[var(--color-border-soft)] last:border-0">
                  <td className={`${TD} whitespace-nowrap font-medium text-foreground`}>{tr(`meth.m.${m.key}.name`)}</td>
                  <td className={`${TD} tabular whitespace-nowrap`}>{m.formula}</td>
                  <td className={TD}>{tr(`meth.m.${m.key}.means`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="max-w-3xl text-[12.5px] text-faint">
          {tr("meth.measures.note")}
          <Cite ids={["hummels2006", "gaulier2010"]} />
        </p>
        <p className="tabular max-w-3xl text-[12.5px] text-faint">
          {meta.window.start}–{meta.window.end}: {tr("meth.measures.headline")} {fmtUSD(k.positive.central)}{" "}
          ({fmtUSD(k.positive.low)}–{fmtUSD(k.positive.high)}) · {tr("meth.measures.coverage")} {fmtPct(k.coveragePct, 0)}
        </p>
      </section>

      {/* 4. the risk score ---------------------------------------------- */}
      <section className="space-y-3">
        <SectionHead n="4" title={tr("meth.risk.title")} />
        <p className={P}>
          {tr("meth.risk.desc")}
          <Cite ids={["gara2018", "choi2019"]} />
        </p>

        <div className="card max-w-3xl space-y-4 p-4">
          <Step n="0" title={tr("meth.risk.s0.title")}>
            {tr("meth.risk.s0.body")}
            <Cite ids={["choi2019"]} />
          </Step>

          <Step n="1" title={tr("meth.risk.s1.title")}>
            {tr("meth.risk.s1.body")}
            <Formula>gap rate = Σ max(X − M ÷ (1 + f), 0) ÷ Σ X</Formula>
            {tr("meth.risk.s1.body2")}{" "}
            {tr("meth.risk.s1.body3")}
            <Cite ids={["bhagwati1964", "oecdjrc2008"]} />
          </Step>

          <Step n="2" title={tr("meth.risk.s2.title")}>
            {tr("meth.risk.s2.body")}
            <Formula>P = (k + 1) / (n + 2)</Formula>
            {tr("meth.risk.s2.body2")}
            <Cite ids={["laplace1812", "farhad2019"]} />
          </Step>

          <Step n="3" title={tr("meth.risk.s3.title")}>
            <Formula>RS = 100 × √(G × P)</Formula>
            {tr("meth.risk.s3.body")}
            <Cite ids={["oecdjrc2008", "undp2010"]} />
          </Step>

          <Step n="4" title={tr("meth.risk.s4.title")}>
            {tr("meth.risk.s4.body")}
            <div className="mt-2 overflow-x-auto rounded-md border border-[var(--color-border-soft)]">
              <table className="w-full min-w-[420px]">
                <thead>
                  <tr className="border-b border-[var(--color-border-soft)]">
                    <th className={TH}>{tr("meth.risk.s4.colBand")}</th>
                    <th className={TH}>{tr("meth.risk.s4.colPct")}</th>
                    <th className={TH}>{tr("meth.risk.s4.colShare")}</th>
                  </tr>
                </thead>
                <tbody className="zebra">
                  {BAND_ROWS.map((b) => (
                    <tr key={b.key} className="border-b border-[var(--color-border-soft)] last:border-0">
                      <td className={`${TD} whitespace-nowrap font-medium text-foreground`}>{tr(`band.${b.key}`)}</td>
                      <td className={`${TD} tabular whitespace-nowrap`}>{b.pct}</td>
                      <td className={`${TD} tabular whitespace-nowrap`}>{b.share}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2">{tr("meth.risk.s4.body2")}</p>
            <Cite ids={["gara2018", "wco2011", "imf2023"]} />
          </Step>
        </div>

        <p className="max-w-3xl rounded-md border-l-2 border-l-[var(--color-investigate)] bg-[var(--color-panel)] px-4 py-2.5 text-[13px] leading-relaxed text-muted">
          <strong className="text-foreground">{tr("meth.risk.notEstimateLead")}</strong> {tr("meth.risk.notEstimate")}
        </p>
      </section>

      {/* 5. diagnostics -------------------------------------------------- */}
      <section className="space-y-2">
        <SectionHead n="5" title={tr("meth.diag.title")} desc={tr("meth.diag.desc")} />
        <div className="grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Diag label="cor(G, P)" value={diag.corGP[HS6].toFixed(2)} note={tr("meth.diag.corGP")} />
          <Diag
            label={tr("meth.diag.matched")}
            value={fmtNum(cov.matchedCells)}
            note={`${fmtPct(cov.valueRetainedShare, 0)} ${tr("meth.diag.matchedNote")}`}
          />
          <Diag
            label={tr("meth.diag.gapRate")}
            value={fmtPct(rates.p50, 0)}
            note={`${tr("meth.diag.gapRateNote")} p90 ${fmtPct(rates.p90, 0)} · p99 ${fmtPct(rates.p99, 0)}`}
          />
        </div>
        {/* the fitted cut-offs were a run-on line of numbers; as a table each
            band's threshold is findable instead of parsed out of prose */}
        <div className="max-w-md overflow-hidden rounded-md border border-[var(--color-border-soft)]">
          <table className="w-full">
            <caption className="border-b border-[var(--color-border-soft)] bg-[var(--color-panel)] px-4 py-2 text-left text-[12px] font-medium text-muted">
              {tr("meth.diag.bands")} (HS6)
            </caption>
            <tbody className="zebra">
              {([["critical", cuts.critical], ["high", cuts.high], ["elevated", cuts.elevated]] as const).map(([b, v]) => (
                <tr key={b} className="border-b border-[var(--color-border-soft)] last:border-0">
                  <td className={`${TD} whitespace-nowrap font-medium text-foreground`}>{tr(`band.${b}`)}</td>
                  <td className={`${TD} tabular whitespace-nowrap text-right`}>≥ {v.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 6. references ------------------------------------------------------ */}
      <section className="max-w-4xl space-y-2">
        <SectionHead n="6" title={tr("meth.refs.title")} />
        <ol className="list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-muted lg:columns-2 lg:gap-8">
          {/* the annotated readings live in the Literature findings table — the
              list here is the bare citation, only for sources actually used */}
          {REFERENCES.map((r) => (
            <li key={r.id}>
              {r.authors} ({r.year}).{" "}
              {r.url ? (
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                  {r.title}
                </a>
              ) : (
                <em>{r.title}</em>
              )}
              . {r.source}.
            </li>
          ))}
        </ol>
        <p className="text-[12.5px] text-faint">{tr("meth.refs.note")}</p>
      </section>
    </div>
  );
}

function Diag({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
        <InfoTip text={note} />
      </div>
      <div className="tabular mt-1.5 text-[22px] font-semibold leading-none">{value}</div>
      <p className="mt-1.5 text-[12px] leading-snug text-faint">{note}</p>
    </div>
  );
}
