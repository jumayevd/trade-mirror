"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import { hsLabel, productByCmd, isResidualChapter, type Channel, type Direction } from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";
import { fmtUSD, fmtUSDFull, fmtPct, fmtNum } from "@/lib/format";

/**
 * Products (Modernist redesign, README §3) — two side-by-side tables:
 * chapters (HS2) left, HS6 products right, both sorted by the active
 * direction. Residual chapters 98–99 stay visible for transparency and are
 * excluded from residual-stage ranking (§7.2). Presentational only — every
 * figure comes from the shared aggregate() engine.
 */

const STEP = 20;

/* ---------------- shared table chrome (2px head rule, 1px row rules) ---------------- */
const TH = "py-2 pr-3 text-left align-bottom text-[10px] font-semibold uppercase tracking-[.1em] text-faint whitespace-nowrap";
const THN = `${TH} text-right`;
const TD = "py-[7px] pr-3 align-middle text-[13px]";
const TDN = `${TD} tabular text-right whitespace-nowrap`;
const HEAD_ROW = "border-b-2 border-[rgba(32,30,29,.4)]";
const BODY_ROW = "border-b border-[rgba(32,30,29,.18)]";

/** Mono § method-reference chip. */
function Ref({ s }: { s: string }) {
  return (
    <Link
      href="/methodology"
      className="tabular whitespace-nowrap bg-[rgba(32,30,29,.08)] px-1.5 py-px text-[10.5px] text-[rgba(32,30,29,.7)] hover:text-foreground"
      title={`Methodology ${s}`}
    >
      {s}
    </Link>
  );
}

function ShowMore({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  if (total <= shown) return null;
  return (
    <button
      onClick={onMore}
      className="mt-3 border border-[rgba(32,30,29,.4)] px-2.5 py-1 text-[11.5px] font-semibold text-muted hover:text-foreground"
    >
      Show {Math.min(STEP, total - shown)} more · {fmtNum(total - shown)} remaining
    </button>
  );
}

function ResidualTag() {
  return (
    <span
      className="tabular ml-1.5 whitespace-nowrap text-[10.5px] text-[rgba(32,30,29,.45)]"
      title="Residual HS chapter (98–99): shown for transparency, excluded from residual-stage ranking (§7.2)."
    >
      residual
    </span>
  );
}

/* ---------------- HS6 aggregation across partners ---------------- */

interface CodeAgg {
  cmd: string;
  label: string;
  posT: number;
  revT: number;
  absT: number;
  signedT: number;
  partners: number;
  anomaly: number;
  evidence: number;
  residual: boolean;
}

function aggregateByCode(chs: Channel[]): CodeAgg[] {
  const m = new Map<string, { posT: number; revT: number; signedT: number; pset: Set<string>; anomaly: number; evidence: number }>();
  for (const c of chs) {
    const e = m.get(c.cmd) ?? { posT: 0, revT: 0, signedT: 0, pset: new Set<string>(), anomaly: 0, evidence: 0 };
    e.posT += c.posT;
    e.revT += c.revT;
    e.signedT += c.signedT;
    e.pset.add(c.partnerIso);
    e.anomaly = Math.max(e.anomaly, c.anomaly);
    e.evidence = Math.max(e.evidence, c.evidence);
    m.set(c.cmd, e);
  }
  return [...m.entries()].map(([cmd, e]) => ({
    cmd,
    label: hsLabel(cmd),
    posT: e.posT,
    revT: e.revT,
    absT: e.posT + e.revT,
    signedT: e.signedT,
    partners: e.pset.size,
    anomaly: e.anomaly,
    evidence: e.evidence,
    residual: isResidualChapter(cmd.slice(0, 2)),
  }));
}

const dirValue = (d: Direction, r: { posT: number; revT: number; absT: number; signedT: number }) =>
  d === "reverse" ? r.revT : d === "absolute" ? r.absT : d === "net" ? r.signedT : r.posT;

export default function ProductsView() {
  const { filter, data } = useFilter();
  const { t } = useI18n();
  const [chapShown, setChapShown] = useState(STEP);
  const [prodShown, setProdShown] = useState(STEP);

  // any filter change resets the extended lists (adjust-during-render pattern)
  const [prevFilter, setPrevFilter] = useState(filter);
  if (prevFilter !== filter) {
    setPrevFilter(filter);
    setChapShown(STEP);
    setProdShown(STEP);
  }

  const dir = filter.direction;
  const valueHead = dir === "reverse" ? "Reverse" : "Positive";

  const chapters = useMemo(
    () => [...data.chapters].sort((a, b) => dirValue(dir, b) - dirValue(dir, a)),
    [data.chapters, dir],
  );
  const products = useMemo(
    () => aggregateByCode(data.channels6).sort((a, b) => dirValue(dir, b) - dirValue(dir, a)),
    [data.channels6, dir],
  );

  const isEmpty = chapters.length === 0 && products.length === 0;

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-[20px] font-extrabold tracking-tight">{t("nav.products")}</h1>
        <p className="mt-1 max-w-[44rem] text-[13px] leading-[1.55] text-[rgba(32,30,29,.68)]">
          Chapters first, then the HS6 codes inside the active scope — both tables follow the active
          direction; residual chapters 98–99 are shown for transparency and excluded from
          residual-stage ranking <Ref s="§7.2" />.
        </p>
      </section>

      {isEmpty ? (
        <EmptyState />
      ) : (
        <div className="grid gap-7 lg:grid-cols-2">
          {/* left — chapters */}
          <div>
            <div className="lbl">By chapter (HS2)</div>
            <table className="mt-2 w-full border-collapse">
              <thead>
                <tr className={HEAD_ROW}>
                  <th className={TH}>Chapter</th>
                  <th className={THN} title={dir === "reverse" ? "Reverse discrepancy: UZB records > partner (§2.1)." : "Positive discrepancy: partner > UZB after freight adjustment (§2.1)."}>{valueHead}</th>
                  <th className={THN} title="Positive discrepancy ÷ expected CIF (§2.2).">Gap rate</th>
                  <th className={THN} title="Partner × chapter channels under the active filters.">Channels</th>
                </tr>
              </thead>
              <tbody>
                {chapters.slice(0, chapShown).map((c) => (
                  <tr key={c.chapter} className={BODY_ROW}>
                    <td className={TD}>
                      <span className="tabular mr-1.5 text-[11px] text-[rgba(32,30,29,.5)]">{c.chapter}</span>
                      <span className="font-extrabold">{c.label.length > 40 ? `${c.label.slice(0, 40)}…` : c.label}</span>
                      {c.residual && <ResidualTag />}
                    </td>
                    <td className={`${TDN} font-semibold`} title={fmtUSDFull(dir === "reverse" ? c.revT : c.posT)}>
                      {fmtUSD(dir === "reverse" ? c.revT : c.posT)}
                    </td>
                    <td className={TDN}>{fmtPct(c.gapRate, 1)}</td>
                    <td className={`${TDN} text-[rgba(32,30,29,.6)]`}>{fmtNum(c.channels)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ShowMore shown={chapShown} total={chapters.length} onMore={() => setChapShown((s) => s + STEP)} />
          </div>

          {/* right — HS6 products */}
          <div>
            <div className="lbl">By product (HS6)</div>
            <table className="mt-2 w-full border-collapse">
              <thead>
                <tr className={HEAD_ROW}>
                  <th className={TH}>Code · label</th>
                  <th className={THN} title={dir === "reverse" ? "Reverse discrepancy, summed across partners (§2.1)." : "Positive discrepancy, summed across partners (§2.1)."}>{valueHead}</th>
                  <th className={THN} title="Distinct partner countries with an observation channel on this code.">Partners</th>
                  <th className={THN} title="Strongest partner channel on this code: anomaly strength (§4) / evidence quality (§5), 0–100.">Max A / E</th>
                </tr>
              </thead>
              <tbody>
                {products.slice(0, prodShown).map((r) => {
                  const profiled = productByCmd(r.cmd);
                  const label = r.label.length > 34 ? `${r.label.slice(0, 34)}…` : r.label;
                  return (
                    <tr key={r.cmd} className={BODY_ROW}>
                      <td className={TD}>
                        <span className="tabular mr-1.5 text-[11px] text-[rgba(32,30,29,.5)]">{r.cmd}</span>
                        {profiled ? (
                          <Link href={`/products/${r.cmd}`} className="hover:underline" title={r.label}>
                            {label}
                          </Link>
                        ) : (
                          <span title={r.label}>{label}</span>
                        )}
                        {r.residual && <ResidualTag />}
                      </td>
                      <td className={`${TDN} font-semibold`} title={fmtUSDFull(dir === "reverse" ? r.revT : r.posT)}>
                        {fmtUSD(dir === "reverse" ? r.revT : r.posT)}
                      </td>
                      <td className={`${TDN} text-[rgba(32,30,29,.6)]`}>{fmtNum(r.partners)}</td>
                      <td className={TDN}>
                        {r.anomaly.toFixed(0)} / {r.evidence.toFixed(0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <ShowMore shown={prodShown} total={products.length} onMore={() => setProdShown((s) => s + STEP)} />
          </div>
        </div>
      )}

      <p className="max-w-[44rem] text-[11.5px] leading-normal text-[rgba(32,30,29,.55)]">
        HS6 detail is subject to the materiality floor documented on the Data quality page <Ref s="§7.2" /> — products may sum to less than their chapter total. {t("common.source")}.
      </p>
    </div>
  );
}
