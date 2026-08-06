"use client";

import { Fragment, useMemo } from "react";
import Link from "next/link";
import { useFilter } from "@/lib/filter-context";
import { meta, DATA_VERSION, METHODOLOGY_VERSION, type PartnerMeta } from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";
import { fmtNum, fmtPct, fmtUSD } from "@/lib/format";

/**
 * Data quality (Modernist redesign, README §5) — the dataset facts strip
 * (moved here from Overview), the reporter coverage square grid, exclusions
 * as a definition list and weight availability as labelled bars. None of the
 * gaps documented here are treated as evidence of misreporting.
 */

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

function partnerTag(p: PartnerMeta): string {
  const tags: string[] = [];
  if (p.transit) tags.push("transit hub");
  if (p.lapse) tags.push(`last report ${p.lastReportedYear}`);
  return tags.join(" · ");
}

/** Labelled CSS bar (6px track, ink fill). */
function WeightBar({ name, share, sub }: { name: string; share: number; sub?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="font-extrabold">{name}</span>
        <span className="tabular text-[rgba(32,30,29,.6)]" title={sub}>{fmtPct(share, 0)}</span>
      </div>
      <div className="mt-[3px] h-[6px] bg-[rgba(32,30,29,.12)]">
        <div className="h-full bg-[#201e1d]" style={{ width: `${Math.min(100, Math.round(share * 100))}%` }} />
      </div>
    </div>
  );
}

export default function QualityView() {
  const { series } = useFilter();
  const { t } = useI18n();

  const partnersByCoverage = useMemo(
    () => [...meta.partners].sort((a, b) => b.coverage - a.coverage || a.name.localeCompare(b.name)),
    [],
  );
  const transitPartners = useMemo(() => partnersByCoverage.filter((p) => p.transit), [partnersByCoverage]);

  // dataset facts (moved here from the Overview)
  const datasetStats = useMemo(
    () => [
      { value: fmtNum(meta.datasetRows), label: "dataset rows" },
      { value: `${meta.window.start}–${meta.window.end}`, label: "window" },
      { value: fmtNum(meta.partners.length), label: "partners" },
      { value: fmtNum(meta.chapters.length), label: "HS2 chapters" },
      { value: fmtNum(Object.keys(meta.hs4labels).length), label: "HS4 groups · derived" },
      { value: fmtNum(Object.keys(meta.hs6labels).length), label: "HS6 products" },
    ],
    [],
  );

  // weight & quantity availability, from the full-window HS6 base
  const hs6 = series.baseChannels6;
  const weights = useMemo(() => {
    const withWeight = hs6.filter((c) => c.uvYears > 0);
    const withUvRatio = hs6.filter((c) => c.uvRatio != null);
    const peTotal = hs6.reduce((s, c) => s + c.peT, 0);
    const peWithWeight = withWeight.reduce((s, c) => s + c.peT, 0);
    return [
      {
        name: "HS6 channels with dual weight",
        share: hs6.length > 0 ? withWeight.length / hs6.length : 0,
        sub: `${fmtNum(withWeight.length)} of ${fmtNum(hs6.length)} channels have ≥1 year with net weight on both sides`,
      },
      {
        name: "Value-weighted share",
        share: peTotal > 0 ? peWithWeight / peTotal : 0,
        sub: `${fmtUSD(peWithWeight)} of ${fmtUSD(peTotal)} partner-reported value sits in dual-weight channels`,
      },
      {
        name: "Channels with a usable unit-value ratio",
        share: hs6.length > 0 ? withUvRatio.length / hs6.length : 0,
        sub: `${fmtNum(withUvRatio.length)} channels have ≥2 dual-weight years — the minimum for a unit-value ratio`,
      },
    ];
  }, [hs6]);

  const nonReporters = useMemo(
    () => meta.partners.filter((p) => p.reportedYears.length === 0).map((p) => p.name),
    [],
  );

  return (
    <div className="space-y-6">
      {/* header */}
      <section>
        <h1 className="text-[20px] font-extrabold tracking-tight">{t("nav.quality")}</h1>
        <p className="mt-1 max-w-[44rem] text-[13px] leading-[1.55] text-[rgba(32,30,29,.68)]">
          What the snapshot contains and what it cannot mirror — every exclusion below is a stated
          rule, not a judgement <Ref s="§7.1" /> <Ref s="§7.2" />.
        </p>
      </section>

      {/* dataset strip — six cells framed by 2px rules */}
      <div className="grid grid-cols-2 border-y-2 border-[rgba(32,30,29,.4)] sm:grid-cols-3 lg:grid-cols-6">
        {datasetStats.map((s, i) => (
          <div key={s.label} className={`py-3 pr-3 ${i > 0 ? "pl-3" : ""} ${i < datasetStats.length - 1 ? "border-r border-[rgba(32,30,29,.2)]" : ""}`}>
            <div className="tabular text-[20px] font-semibold leading-tight">{s.value}</div>
            <div className="text-[11px] text-[rgba(32,30,29,.6)]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* reporter coverage grid */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[16px] font-extrabold tracking-tight">Reporter coverage by partner and year</h2>
          <span className="tabular text-[10.5px] text-[rgba(32,30,29,.5)]">
            filled = reported · outline = no report, excluded from comparison <Ref s="§7.1" />
          </span>
        </div>
        <div className="mt-2.5 overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="grid grid-cols-[180px_1fr] border-t border-[rgba(32,30,29,.2)]">
              {partnersByCoverage.map((p) => {
                const tag = partnerTag(p);
                return (
                  <Fragment key={p.iso3}>
                    <div className="border-b border-[rgba(32,30,29,.14)] py-[7px] pr-3 text-[12.5px] font-extrabold">
                      <Link href={`/partners/${p.iso3.toLowerCase()}`} className="hover:underline">{p.name}</Link>
                      {tag && <span className="tabular ml-1.5 text-[10.5px] font-normal text-[rgba(32,30,29,.5)]">{tag}</span>}
                    </div>
                    <div className="flex items-center gap-1 border-b border-[rgba(32,30,29,.14)] py-[7px]">
                      {meta.years.map((y) => {
                        const reported = p.reportedYears.includes(y);
                        return (
                          <span
                            key={y}
                            className="h-[14px] w-[26px] shrink-0"
                            style={reported ? { background: "#201e1d" } : { border: "1px solid rgba(32,30,29,.35)" }}
                            title={
                              reported
                                ? `${p.name} reported to UN Comtrade in ${y}.`
                                : `${p.name} did not report in ${y} — the partner-year is excluded from comparison, never treated as a zero flow.`
                            }
                          />
                        );
                      })}
                      <span className="tabular ml-2 text-[11px] text-[rgba(32,30,29,.55)]">{fmtPct(p.coverage, 0)}</span>
                    </div>
                  </Fragment>
                );
              })}
            </div>
            <div className="tabular mt-1.5 flex gap-1 pl-[180px] text-[10px] text-[rgba(32,30,29,.5)]">
              {meta.years.map((y) => (
                <span key={y} className="w-[26px] shrink-0 text-center">{String(y).slice(2)}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* exclusions + weight availability */}
      <div className="grid gap-7 md:grid-cols-2">
        <section>
          <h2 className="text-[16px] font-extrabold tracking-tight">Excluded observations &amp; floors</h2>
          <ul className="mt-2.5 flex flex-col gap-2 text-[12.5px] leading-normal text-[rgba(32,30,29,.72)]">
            <li className="flex gap-2.5 border-b border-[rgba(32,30,29,.14)] pb-2">
              <span className="tabular w-[78px] shrink-0 font-semibold">{fmtUSD(meta.orphans.importValue)}</span>
              <span>Orphan flows — Uzbek imports with no partner mirror ({fmtNum(meta.orphans.importCells)} cells). Excluded, never compared against a fabricated zero.</span>
            </li>
            <li className="flex gap-2.5 border-b border-[rgba(32,30,29,.14)] pb-2">
              <span className="tabular w-[78px] shrink-0 font-semibold">±$100K</span>
              <span>Channel-year noise floor — smaller signed values are read as zero and never count toward persistence.</span>
            </li>
            <li className="flex gap-2.5 border-b border-[rgba(32,30,29,.14)] pb-2">
              <span className="tabular w-[78px] shrink-0 font-semibold">HS 98–99</span>
              <span>Residual and confidential codes cannot be mirror-matched by construction — visible for transparency, excluded from residual-stage ranking <Ref s="§7.2" />.</span>
            </li>
            <li className="flex gap-2.5 border-b border-[rgba(32,30,29,.14)] pb-2">
              <span className="tabular w-[78px] shrink-0 font-semibold">$8M / $4M</span>
              <span>HS6 materiality floor — 6-digit channels below $8M partner-reported value or $4M discrepancy over the window are dropped; HS2 totals are unaffected.</span>
            </li>
            <li className="flex gap-2.5">
              <span className="tabular w-[78px] shrink-0 font-semibold">Non-reporters</span>
              <span>
                {(nonReporters.length > 0 ? nonReporters : ["Turkmenistan"]).join(", ")}{" "}
                {(nonReporters.length || 1) === 1 ? "does" : "do"} not report to UN Comtrade — no mirror comparison is possible.
              </span>
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-[16px] font-extrabold tracking-tight">Weight &amp; quantity availability</h2>
          <p className="mt-1.5 text-[12.5px] leading-normal text-[rgba(32,30,29,.68)]">
            Dual weights enable the unit-value cross-check <Ref s="§4" /> — where they are missing the
            remaining anomaly weights are renormalised, never imputed.
          </p>
          <div className="mt-2.5 flex flex-col gap-[9px]">
            {weights.map((w) => (
              <WeightBar key={w.name} {...w} />
            ))}
          </div>
        </section>
      </div>

      {/* transit metadata */}
      <section className="rule-2 pt-3">
        <h2 className="text-[16px] font-extrabold tracking-tight">Transit &amp; re-export partners</h2>
        <p className="mt-0.5 max-w-[44rem] text-[12.5px] leading-normal text-[rgba(32,30,29,.62)]">
          Uzbekistan records imports by origin while hubs report re-exports by consignment, so routed
          goods create legitimate discrepancies — these partners are classed Transit-sensitive{" "}
          <Ref s="§6" /> and held out of the residual stage.
        </p>
        {transitPartners.length === 0 ? (
          <p className="mt-3 text-[13px] text-muted">No partners in the current dataset are flagged as transit hubs.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className={HEAD_ROW}>
                  <th className={TH}>{t("common.partner")}</th>
                  <th className={TH}>Region</th>
                  <th className={TH}>Reporting</th>
                  <th className={THN}>{t("kpi.coverage")}</th>
                </tr>
              </thead>
              <tbody>
                {transitPartners.map((p) => (
                  <tr key={p.iso3} className={BODY_ROW}>
                    <td className={`${TD} whitespace-nowrap`}>
                      <Link href={`/partners/${p.iso3.toLowerCase()}`} className="font-extrabold hover:underline">{p.name}</Link>
                      <span className="tabular ml-1.5 text-[10.5px] text-[rgba(32,30,29,.5)]">transit hub</span>
                    </td>
                    <td className={`${TD} text-[rgba(32,30,29,.7)]`}>{p.region}</td>
                    <td className={`${TD} tabular text-[12px] text-[rgba(32,30,29,.7)]`}>
                      {p.lapse ? `stopped after ${p.lastReportedYear}` : "reporting"}
                    </td>
                    <td className={TDN}>{fmtPct(p.coverage, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* versions */}
      <section className="rule-2 pt-3">
        <h2 className="text-[16px] font-extrabold tracking-tight">Data refresh &amp; versioning</h2>
        <dl className="mt-2.5 max-w-[44rem] text-[12.5px] leading-normal text-[rgba(32,30,29,.72)]">
          {(
            [
              [t("meta.dataVersion"), DATA_VERSION],
              [t("meta.generated"), meta.generatedAt],
              [t("meta.methodologyVersion"), `v${METHODOLOGY_VERSION}`],
              ["Source", `UN Comtrade · annual HS2 + HS6 · window ${meta.window.start}–${meta.window.end}`],
              ["Update policy", "Snapshots replace atomically — the site never mixes figures from two data versions; cite the version identifier when comparing."],
            ] as const
          ).map(([term, def]) => (
            <div key={term} className="flex gap-2.5 border-b border-[rgba(32,30,29,.14)] py-2 last:border-b-0">
              <dt className="w-[140px] shrink-0 text-[11px] font-semibold uppercase tracking-[.08em] text-faint">{term}</dt>
              <dd className="tabular min-w-0">{def}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
