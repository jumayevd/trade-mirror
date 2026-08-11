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
 * built, what the score diagnostics say, the limitations, and the bibliography.
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
const TH = "px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-faint";
const TD = "px-4 py-2 align-top text-[13px] text-muted";

/** A formula on its own line — monospace, quiet, never inside a sentence. */
function Formula({ children }: { children: React.ReactNode }) {
  return (
    <p className="tabular my-2 rounded-md border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-3 py-2 text-[13px] text-foreground">
      {children}
    </p>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="tabular mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-panel-2)] text-[11px] font-semibold text-muted">
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

export default function MethodologyView() {
  const { t } = useI18n();
  const k = FULL.kpis;
  const cov = diag.coverage[HS6];
  const cuts = diag.bandCuts[HS6];
  const rates = diag.gapRateQuantiles[HS6];
  const tr = (key: string) => t(key as LocaleKey);

  const MEASURES: { key: string; formula: string }[] = [
    { key: "expected", formula: "X_fob × (1 + f),  f ∈ {6%, 10%, 15%}" },
    { key: "positive", formula: "Σ max(X_fob × (1 + f) − M_cif, 0)" },
    { key: "gapRate", formula: "Σ max(D, 0) ÷ Σ X_fob × (1 + f)" },
  ];

  const LIMITS = ["1", "2", "3", "4", "5", "6", "7"];

  return (
    <div className="space-y-9">
      {/* ---------------------------------------------------------------- */}
      <section className="space-y-1.5">
        <p className="text-[10.5px] font-medium text-faint">
          UN Comtrade · {meta.window.start}–{meta.window.end} · v{METHODOLOGY_VERSION}
        </p>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("nav.methodology")}</h1>
        <p className={P}>{tr("meth.lede")}</p>
      </section>

      {/* 1. why a positive gap is worth reading ------------------------- */}
      <section className="space-y-2">
        <h2 className={H2}>{tr("meth.why.title")}</h2>
        <p className={P}>
          {tr("meth.why.p1")}
          <Cite ids={["bhagwati1964", "unsd2019"]} />
        </p>
        <p className={P}>
          {tr("meth.why.p2")}
          <Cite ids={["fisman2004", "javorcik2008", "berger2008", "farhad2019"]} />
        </p>
        <p className={P}>
          {tr("meth.why.p3")}
          <Cite ids={["buehn2011", "carrere2015", "kellenberg2019"]} />
        </p>
      </section>

      {/* 2. literature findings ------------------------------------------ */}
      <section className="space-y-2">
        <h2 className={H2}>{tr("meth.lit.title")}</h2>
        <p className={P}>{tr("meth.lit.desc")}</p>
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
        <h2 className={H2}>{tr("meth.measures.title")}</h2>
        <p className={P}>{tr("meth.measures.desc")}</p>
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
        <p className="max-w-3xl text-[11.5px] text-faint">
          {tr("meth.measures.note")}
          <Cite ids={["hummels2006", "gaulier2010"]} />
        </p>
        <p className="tabular max-w-3xl text-[11.5px] text-faint">
          {meta.window.start}–{meta.window.end}: {tr("meth.measures.headline")} {fmtUSD(k.positive.central)}{" "}
          ({fmtUSD(k.positive.low)}–{fmtUSD(k.positive.high)}) · {tr("meth.measures.coverage")} {fmtPct(k.coveragePct, 0)}
        </p>
      </section>

      {/* 4. the risk score ---------------------------------------------- */}
      <section className="space-y-3">
        <h2 className={H2}>{tr("meth.risk.title")}</h2>
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
            <Formula>gap rate = Σ max(X × (1 + f) − M, 0) ÷ Σ X × (1 + f)</Formula>
            {tr("meth.risk.s1.body2")}
            <Formula>G = percentile rank of the gap rate, 0 … 1</Formula>
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
            <Cite ids={["gara2018", "wco2011", "imf2023"]} />
          </Step>
        </div>

        <p className="max-w-3xl rounded-md border-l-2 border-l-[var(--color-investigate)] bg-[var(--color-panel)] px-4 py-2.5 text-[13px] leading-relaxed text-muted">
          <strong className="text-foreground">{tr("meth.risk.notEstimateLead")}</strong> {tr("meth.risk.notEstimate")}
        </p>
      </section>

      {/* 5. diagnostics -------------------------------------------------- */}
      <section className="space-y-2">
        <h2 className={H2}>{tr("meth.diag.title")}</h2>
        <p className={P}>{tr("meth.diag.desc")}</p>
        <div className="grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <Diag
            label={tr("meth.diag.unmatched")}
            value={fmtNum(cov.orphanImportCellYears + cov.lostExportCellYears)}
            note={tr("meth.diag.unmatchedNote")}
          />
        </div>
        <p className="tabular max-w-3xl text-[11.5px] text-faint">
          {tr("meth.diag.bands")}: Critical ≥ {cuts.critical.toFixed(1)} · High ≥ {cuts.high.toFixed(1)} · Elevated ≥ {cuts.elevated.toFixed(1)} (HS6)
        </p>
      </section>

      {/* 6. limitations --------------------------------------------------- */}
      <section className="space-y-2">
        <h2 className={H2}>{tr("meth.lim.title")}</h2>
        <ol className="max-w-3xl list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-muted">
          {LIMITS.map((n) => (
            <li key={n}>{tr(`meth.lim.${n}`)}</li>
          ))}
        </ol>
      </section>

      {/* 7. references ------------------------------------------------------ */}
      <section className="max-w-4xl space-y-2">
        <h2 className={H2}>{tr("meth.refs.title")}</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-[12.5px] leading-relaxed text-muted">
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
              . {r.source}. <span className="text-faint">{r.note}</span>
            </li>
          ))}
        </ol>
        <p className="text-[11.5px] text-faint">{tr("meth.refs.note")}</p>
      </section>
    </div>
  );
}

function Diag({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
        <InfoTip text={note} />
      </div>
      <div className="tabular mt-1.5 text-[22px] font-semibold leading-none">{value}</div>
      <p className="mt-1.5 text-[11px] leading-snug text-faint">{note}</p>
    </div>
  );
}
