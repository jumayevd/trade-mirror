"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  SectionTitle, BandBadge, ComponentChip, RiskScore, RobustnessBadge,
} from "@/components/ui";
import { hs4Label, hsLabel, type RiskBand, type Robustness } from "@/lib/dataset";
import { fmtUSD, fmtUSDFull, fmtPct, COLORS } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

/**
 * Product-code narrowing for one partner profile (spec §6.6.5/§6.6.6). Three
 * cascading selects — chapter › HS4 › HS6 — filter both channel blocks below
 * them: the HS2 structure of the positive discrepancy and the ranked HS6
 * screening signals. Styling follows the shared FilterBar.
 */

export interface ChapterRow { chapter: string; label: string; posT: number }
export interface ChannelRow {
  cmd: string; label: string; chapter: string; hs4: string;
  band: RiskBand; mtrs: number; abnormalGap: number; persistence: number;
  robustness: Robustness; posT: number;
}

const sel = "rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1.5 text-[13px] text-foreground outline-none focus:border-[var(--color-primary)]";
const lbl = "text-[10px] font-semibold uppercase tracking-wider text-faint";
const PAGE = 12;

/** Sorted unique values, preserving the first label seen for each key. */
function options(pairs: [string, string][]): { code: string; label: string }[] {
  const m = new Map<string, string>();
  for (const [code, label] of pairs) if (!m.has(code)) m.set(code, label);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([code, label]) => ({ code, label }));
}

export default function PartnerChannels({
  iso, partner, totalPos, chapters, rows,
}: {
  iso: string; partner: string; totalPos: number; chapters: ChapterRow[]; rows: ChannelRow[];
}) {
  const { t } = useI18n();
  const [hs2, setHs2] = useState("all");
  const [hs4, setHs4] = useState("all");
  const [hs6, setHs6] = useState("all");
  const [shown, setShown] = useState(PAGE);

  const hs2Options = useMemo(
    () => options([
      ...chapters.map((c) => [c.chapter, c.label] as [string, string]),
      ...rows.map((r) => [r.chapter, hsLabel(r.chapter)] as [string, string]),
    ]),
    [chapters, rows],
  );
  const hs4Options = useMemo(
    () => options(rows.filter((r) => hs2 === "all" || r.chapter === hs2).map((r) => [r.hs4, hs4Label(r.hs4)] as [string, string])),
    [rows, hs2],
  );
  const hs6Options = useMemo(
    () => options(rows
      .filter((r) => (hs2 === "all" || r.chapter === hs2) && (hs4 === "all" || r.hs4 === hs4))
      .map((r) => [r.cmd, r.label] as [string, string])),
    [rows, hs2, hs4],
  );

  const filtered = useMemo(
    () => rows.filter((r) =>
      (hs2 === "all" || r.chapter === hs2)
      && (hs4 === "all" || r.hs4 === hs4)
      && (hs6 === "all" || r.cmd === hs6)),
    [rows, hs2, hs4, hs6],
  );
  const structure = useMemo(
    () => chapters.filter((c) => hs2 === "all" || c.chapter === hs2).slice(0, 8),
    [chapters, hs2],
  );
  const maxBar = structure[0]?.posT ?? 0;
  const narrowed = hs2 !== "all" || hs4 !== "all" || hs6 !== "all";

  const pick = (level: "hs2" | "hs4" | "hs6", v: string) => {
    setShown(PAGE);
    if (level === "hs2") { setHs2(v); setHs4("all"); setHs6("all"); return; }
    if (level === "hs4") { setHs4(v); setHs6("all"); return; }
    setHs6(v);
  };

  return (
    <>
      {/* product-code narrowing */}
      <section className="card p-4">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <div className="flex flex-col gap-1">
            <span className={lbl}>HS2</span>
            <select className={sel} value={hs2} onChange={(e) => pick("hs2", e.target.value)} aria-label={t("prof.aria.hs2")}>
              <option value="all">{t("filter.all")}</option>
              {hs2Options.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className={lbl}>HS4</span>
            <select className={sel} value={hs4} onChange={(e) => pick("hs4", e.target.value)} aria-label={t("prof.aria.hs4")}>
              <option value="all">{t("filter.all")}</option>
              {hs4Options.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className={lbl}>HS6</span>
            <select className={sel} value={hs6} onChange={(e) => pick("hs6", e.target.value)} aria-label={t("prof.aria.hs6")}>
              <option value="all">{t("filter.all")}</option>
              {hs6Options.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
            </select>
          </div>
          <span className="tabular text-[12px] text-faint">
            {filtered.length} of {rows.length} HS6 channels
          </span>
          {narrowed && (
            <button
              onClick={() => { setHs2("all"); setHs4("all"); setHs6("all"); setShown(PAGE); }}
              className="ml-auto rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[13px] text-muted hover:text-foreground"
            >
              Reset ✕
            </button>
          )}
        </div>
      </section>

      {/* HS2 structure */}
      <section className="card p-5">
        <SectionTitle
          title={t("prof.structure.title")}
          desc={`${t("prof.structure.descPre")} ${partner} ${t("prof.structure.descPost")} (${fmtUSD(totalPos)}). ${t("common.source")}.`}
        />
        {structure.length === 0 ? (
          <p className="text-sm text-muted">
            No HS2 chapter carries a positive discrepancy above the noise floor under this
            product selection.
          </p>
        ) : (
          <div className="space-y-2">
            {structure.map((c) => (
              <div key={c.chapter} className="flex items-center gap-3">
                <span className="tabular w-8 shrink-0 text-xs text-faint">{c.chapter}</span>
                <span className="w-52 shrink-0 truncate text-sm text-muted" title={c.label}>{c.label}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-[var(--color-panel-2)]">
                  <div className="h-full rounded" style={{ width: `${Math.max(2, (c.posT / (maxBar || 1)) * 100)}%`, background: COLORS.positive }} />
                </div>
                <span className="tabular w-20 shrink-0 text-right text-sm" title={fmtUSDFull(c.posT)}>{fmtUSD(c.posT)}</span>
                <span className="tabular hidden w-12 shrink-0 text-right text-xs text-faint sm:block">{fmtPct(totalPos > 0 ? c.posT / totalPos : 0, 0)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* HS6 signals */}
      <section>
        <SectionTitle
          title={t("prof.signals.title")}
          desc={t("prof.signals.desc")}
        />
        {filtered.length === 0 ? (
          <p className="card p-8 text-center text-sm text-muted">
            No HS6 channel of {partner} has a comparable positive discrepancy above the noise
            floor under this product selection.
          </p>
        ) : (
          <>
            <div className="card zebra divide-y divide-[var(--color-border-soft)]">
              {filtered.slice(0, shown).map((c) => (
                <div key={c.cmd} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
                  <RiskScore score={c.mtrs} band={c.band} />
                  <BandBadge band={c.band} />
                  <ComponentChip kind="g" value={c.abnormalGap} />
                  <ComponentChip kind="p" value={c.persistence} />
                  <Link href={`/channels/${iso.toLowerCase()}/${c.cmd}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline" title={c.label}>
                    {c.label} <span className="tabular text-xs text-faint">HS {c.cmd}</span>
                  </Link>
                  <RobustnessBadge r={c.robustness} />
                  <span className="tabular w-24 whitespace-nowrap text-right text-sm" style={{ color: COLORS.positive }} title={`${t("prof.tip.positiveDiscrepancy")}: ${fmtUSDFull(c.posT)}`}>
                    {fmtUSD(c.posT)}
                  </span>
                </div>
              ))}
            </div>
            {shown < filtered.length && (
              <button
                onClick={() => setShown((n) => n + PAGE * 2)}
                className="mt-2 rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[13px] text-muted hover:text-foreground"
              >
                Show more ({filtered.length - shown} left)
              </button>
            )}
          </>
        )}
      </section>
    </>
  );
}
