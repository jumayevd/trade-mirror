"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Sparkline from "@/components/charts/Sparkline";
import RiskMap, { MAP_METRIC_LABELS, type MapMetric } from "@/components/charts/RiskMap";
import { EmptyState, MissingValue } from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import { meta, type Direction, type PartnerAgg } from "@/lib/dataset";
import { fmtNum, fmtUSD, fmtUSDFull, fmtPct, COLORS } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

/**
 * Countries (Modernist redesign, README §2) — the table of every mirror
 * counterpart is the main object, sorted by the active direction. The clickable
 * world map stays as a collapsible secondary block above it; the by-year
 * summary and the compare mode keep their function with compressed chrome.
 * Every figure is a screening signal, never proof of wrongdoing.
 */

const MAX_COMPARE = 4;

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

/** Square segmented control — active segment is inked. */
function Segmented<T extends string>({
  value, options, onChange, ariaLabel,
}: {
  value: T; options: { key: T; label: string; tip?: string }[]; onChange: (v: T) => void; ariaLabel: string;
}) {
  return (
    <div className="inline-flex border border-[rgba(32,30,29,.4)]" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          title={o.tip}
          aria-pressed={value === o.key}
          className={`px-2.5 py-1 text-[11.5px] font-extrabold whitespace-nowrap ${
            value === o.key ? "bg-[#201e1d] text-[#f3f2f2]" : "text-muted hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Partner status as a quiet mono tag: "transit hub" / "last report 2021". */
function partnerTag(p: PartnerAgg): string {
  const tags: string[] = [];
  if (p.transit) tags.push("transit hub");
  if (p.lapse) tags.push(`last report ${p.lastReportedYear}`);
  return tags.join(" · ");
}

const gapRate = (p: PartnerAgg) => (p.peT > 0 ? p.posT / p.peT : 0);

const dirValue = (d: Direction, p: PartnerAgg) =>
  d === "reverse" ? p.revT : d === "absolute" ? p.absT : d === "net" ? p.signedT : p.posT;

export default function PartnersView() {
  const { data, series, filter } = useFilter();
  const { t } = useI18n();
  const [mapOpen, setMapOpen] = useState(true);
  const [mapMetric, setMapMetric] = useState<MapMetric>("total");
  const [sel, setSel] = useState<string[]>([]);

  const rows = useMemo(
    () => [...data.partners].sort((a, b) => dirValue(filter.direction, b) - dirValue(filter.direction, a)),
    [data.partners, filter.direction],
  );

  const compare = sel
    .map((iso) => data.partners.find((p) => p.iso3 === iso))
    .filter((p): p is PartnerAgg => !!p);
  const toggle = (iso: string) =>
    setSel((s) => (s.includes(iso) ? s.filter((x) => x !== iso) : s.length >= MAX_COMPARE ? s : [...s, iso]));

  const K = 1 + filter.cif;

  return (
    <div className="space-y-6">
      {/* header */}
      <section>
        <h1 className="text-[20px] font-extrabold tracking-tight">{t("nav.partners")}</h1>
        <p className="mt-1 max-w-[44rem] text-[13px] leading-[1.55] text-[rgba(32,30,29,.68)]">
          Every mirror counterpart under the active scope — gap rate is the positive discrepancy over
          expected CIF <Ref s="§2.2" />; coverage is the share of window years the partner reported{" "}
          <Ref s="§7.1" />, missing years excluded and never read as zero.
        </p>
      </section>

      {/* geographic view — secondary, collapsible, above the table */}
      <section className="rule-2 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => setMapOpen((o) => !o)}
            aria-expanded={mapOpen}
            className="lbl flex items-center gap-2 hover:text-foreground"
          >
            <span aria-hidden>{mapOpen ? "▾" : "▸"}</span> Geographic view
          </button>
          {mapOpen && (
            <Segmented<MapMetric>
              ariaLabel="Map metric"
              value={mapMetric}
              onChange={setMapMetric}
              options={(Object.keys(MAP_METRIC_LABELS) as MapMetric[]).map((k) => ({
                key: k,
                label: MAP_METRIC_LABELS[k],
                tip:
                  k === "total" ? "Cumulative discrepancy value in the active direction."
                    : k === "intensity" ? "Discrepancy per $100M of comparable trade — normalizes away country size."
                      : "Country × HS2 channels passing the active filters.",
              }))}
            />
          )}
        </div>
        {mapOpen && (
          <div className="mt-3">
            {data.partners.length === 0 ? (
              <EmptyState />
            ) : (
              <RiskMap partners={data.partners} filter={filter} metric={mapMetric} />
            )}
            <p className="mt-1.5 text-[11px] leading-normal text-[rgba(32,30,29,.55)]">
              Grey never means a zero gap — it marks partners with no comparable data. Click a country to open its profile.
            </p>
          </div>
        )}
      </section>

      {/* the table — main object */}
      <section className="rule-2 pt-3">
        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className={HEAD_ROW}>
                  <th className={TH} aria-label="Compare" title={`Tick up to ${MAX_COMPARE} partners to compare them side by side.`} />
                  <th className={TH}>{t("common.partner")}</th>
                  <th className={THN} title="Partner-reported exports (FOB) in channels where both sides reported (§1.2).">Comparable trade</th>
                  <th className={THN} title="Positive discrepancy: partner reported more than Uzbekistan recorded (§2.1).">Positive</th>
                  <th className={THN} title="Reverse discrepancy: Uzbekistan recorded more than the partner reported (§2.1).">Reverse</th>
                  <th className={THN} title="Positive discrepancy ÷ partner-reported exports (§2.2).">Gap rate</th>
                  <th className={THN} title="Share of window years the partner reported (§7.1). Missing years are never zero gaps.">Coverage</th>
                  <th className={TH} title="HS2 chapter carrying the largest discrepancy in the active direction.">Top chapter</th>
                  <th className={THN} title="HS2 channels classified Investigate (§6) — a review-priority count, not a finding.">Investigate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const topCh = p.topChapters[0];
                  const tag = partnerTag(p);
                  const checked = sel.includes(p.iso3);
                  return (
                    <tr key={p.iso3} className={BODY_ROW}>
                      <td className={`${TD} w-6`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!checked && sel.length >= MAX_COMPARE}
                          onChange={() => toggle(p.iso3)}
                          aria-label={`Compare ${p.name}`}
                          className="h-3.5 w-3.5 accent-[#201e1d] disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <Link href={`/partners/${p.iso3.toLowerCase()}`} className="font-extrabold hover:underline">
                          {p.name}
                        </Link>
                        {tag && <span className="tabular ml-2 text-[11px] text-[rgba(32,30,29,.45)]">{tag}</span>}
                      </td>
                      <td className={TDN} title={fmtUSDFull(p.peT)}>{fmtUSD(p.peT)}</td>
                      <td className={`${TDN} font-semibold text-[#ae1800]`} title={fmtUSDFull(p.posT)}>{fmtUSD(p.posT)}</td>
                      <td className={`${TDN} text-[rgba(32,30,29,.7)]`} title={fmtUSDFull(p.revT)}>{fmtUSD(p.revT)}</td>
                      <td className={TDN}>{fmtPct(gapRate(p), 0)}</td>
                      <td className={TDN} title={p.lapse ? `Reported ${p.reportedYears.length} year(s); stopped after ${p.lastReportedYear}.` : `Reported in ${p.reportedYears.length} of ${meta.years.length} window years.`}>
                        <span className="inline-flex items-center justify-end gap-1.5">
                          <span className="tabular">{fmtPct(p.coverage, 0)}</span>
                          <span className="inline-block h-[5px] w-12 bg-[rgba(32,30,29,.14)]">
                            <span className="block h-full bg-[#201e1d]" style={{ width: `${Math.round(p.coverage * 100)}%` }} />
                          </span>
                        </span>
                      </td>
                      <td className={`${TD} max-w-[220px] text-[12.5px] text-[rgba(32,30,29,.7)]`}>
                        {topCh ? (
                          <span title={`HS ${topCh.chapter} · ${topCh.label} — ${fmtUSDFull(topCh.value)} (${fmtPct(topCh.share, 0)} of this partner's discrepancy)`}>
                            <span className="tabular mr-1.5 text-[11px] text-[rgba(32,30,29,.5)]">{topCh.chapter}</span>
                            {topCh.label.length > 30 ? `${topCh.label.slice(0, 30)}…` : topCh.label}
                          </span>
                        ) : (
                          <span className="text-faint" title="No HS2 chapter above the noise floor in the active direction.">below noise</span>
                        )}
                      </td>
                      <td className={`${TDN} font-semibold`}>{fmtNum(p.investigate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* compare panel */}
      {compare.length > 0 && (
        <section className="rule-2 pt-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-[16px] font-extrabold tracking-tight">Compare partners ({compare.length}/{MAX_COMPARE})</h2>
            <button
              onClick={() => setSel([])}
              className="border border-[rgba(32,30,29,.4)] px-2 py-1 text-[11px] font-semibold text-muted hover:text-foreground"
            >
              Clear
            </button>
          </div>
          <p className="mt-0.5 text-[12.5px] text-[rgba(32,30,29,.62)]">
            Selected-period figures side by side; mini trend is the positive discrepancy by reported year over the full window — missing years skipped, never drawn as zero.
          </p>
          <div className="mt-3 grid gap-7 sm:grid-cols-2 xl:grid-cols-4">
            {compare.map((p) => {
              const full = series.partners.find((x) => x.iso3 === p.iso3);
              const spark = (full ?? p).byYear.filter((y) => y.reported).map((y) => Math.round(y.positive));
              const tag = partnerTag(p);
              return (
                <div key={p.iso3} className="border-t border-[rgba(32,30,29,.2)] pt-2.5">
                  <div className="mb-2 flex flex-wrap items-baseline gap-2">
                    <Link href={`/partners/${p.iso3.toLowerCase()}`} className="min-w-0 flex-1 truncate text-[13px] font-extrabold hover:underline">
                      {p.name}
                    </Link>
                    {tag && <span className="tabular text-[10.5px] text-[rgba(32,30,29,.45)]">{tag}</span>}
                  </div>
                  {spark.length >= 2 ? (
                    <Sparkline data={spark} color={COLORS.positive} width={180} height={36} />
                  ) : (
                    <p className="text-[11px] text-faint">Fewer than two reported years — no trend can be drawn.</p>
                  )}
                  <dl className="mt-2 space-y-1 text-[12px]">
                    {(
                      [
                        ["Comparable trade", fmtUSD(p.peT), fmtUSDFull(p.peT)],
                        ["Positive", fmtUSD(p.posT), fmtUSDFull(p.posT)],
                        ["Reverse", fmtUSD(p.revT), fmtUSDFull(p.revT)],
                        ["Gap rate", fmtPct(gapRate(p), 0), "Positive discrepancy ÷ partner-reported exports (§2.2)."],
                        ["Coverage", `${fmtPct(p.coverage, 0)}${p.lapse ? ` · stopped ${p.lastReportedYear}` : ""}`, "Reported years ÷ window years (§7.1)."],
                        ["Investigate", fmtNum(p.investigate), "HS2 channels classified Investigate (§6)."],
                      ] as const
                    ).map(([label, value, tip]) => (
                      <div key={label} className="flex justify-between gap-2 border-b border-[rgba(32,30,29,.14)] pb-1 last:border-b-0">
                        <dt className="text-faint">{label}</dt>
                        <dd className="tabular" title={tip}>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* summary statistics by year */}
      <section className="rule-2 pt-3">
        <h2 className="text-[16px] font-extrabold tracking-tight">Summary statistics by year</h2>
        <p className="mt-0.5 text-[12.5px] text-[rgba(32,30,29,.62)]">
          Annual totals across all comparable channels in view <Ref s="§2.1" /> — years in which no partner reported are shown as missing, never as zero flows.
        </p>
        {data.annual.length === 0 ? (
          <div className="mt-3"><EmptyState /></div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr className={HEAD_ROW}>
                  <th className={TH}>{t("common.year")}</th>
                  <th className={THN} title="Partner countries with at least one comparable channel in that year.">Comparable partners</th>
                  <th className={THN} title="Partner-reported exports to Uzbekistan (FOB), comparable channels only.">Partner exports (FOB)</th>
                  <th className={THN} title="Uzbekistan-recorded imports (CIF), comparable channels only.">UZB imports (CIF)</th>
                  <th className={THN} title="Σ max(expected CIF − UZB imports, 0) (§2.1).">Positive</th>
                  <th className={THN} title="Σ max(UZB imports − expected CIF, 0) (§2.1).">Reverse</th>
                  <th className={THN} title={`Positive discrepancy ÷ expected imports (partner exports × ${K.toFixed(2)}) in that year (§2.2).`}>Positive share</th>
                </tr>
              </thead>
              <tbody>
                {data.annual.map((r) => {
                  const noData = r.comparablePartners === 0;
                  const expected = r.pe * K;
                  return (
                    <tr key={r.year} className={BODY_ROW}>
                      <td className={`${TD} tabular font-semibold`}>{r.year}</td>
                      <td className={TDN}>{noData ? <MissingValue kind="notComparable" /> : fmtNum(r.comparablePartners)}</td>
                      <td className={TDN} title={noData ? undefined : fmtUSDFull(r.pe)}>{noData ? <MissingValue /> : fmtUSD(r.pe)}</td>
                      <td className={TDN} title={noData ? undefined : fmtUSDFull(r.ui)}>{noData ? <MissingValue /> : fmtUSD(r.ui)}</td>
                      <td className={`${TDN} font-semibold text-[#ae1800]`} title={noData ? undefined : fmtUSDFull(r.positive)}>
                        {noData ? <MissingValue /> : fmtUSD(r.positive)}
                      </td>
                      <td className={`${TDN} text-[rgba(32,30,29,.7)]`} title={noData ? undefined : fmtUSDFull(r.reverse)}>
                        {noData ? <MissingValue /> : fmtUSD(r.reverse)}
                      </td>
                      <td className={TDN}>
                        {noData || expected <= 0 ? <MissingValue kind="notComparable" /> : fmtPct(r.positive / expected, 1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 max-w-[44rem] text-[11.5px] leading-normal text-[rgba(32,30,29,.55)]">
          Computed on the comparable-stage basis, before stage/signal/materiality filters <Ref s="§1.2" />. {t("common.source")}.
        </p>
      </section>
    </div>
  );
}
