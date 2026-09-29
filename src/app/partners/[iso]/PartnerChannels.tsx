"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  SectionTitle, BandBadge, RiskScore,
} from "@/components/ui";
import { hs4Label, type RiskBand, type Robustness } from "@/lib/dataset";
import { fmtUSD, fmtUSDFull, COLORS } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

/**
 * Product-code narrowing for one partner profile (spec §6.6.5/§6.6.6). Three
 * cascading selects — chapter › HS4 › HS6 — filter both channel blocks below
 * them: the HS2 structure of the positive discrepancy and the ranked HS6
 * screening signals. Styling follows the shared FilterBar.
 */

const TH = "px-3 py-2 text-left text-[12.5px] font-medium text-faint whitespace-nowrap";
const TH_NUM = `${TH} text-right`;

/** Fill {placeholders} in a translated string with values. */
const fill = (s: string, vals: Record<string, string | number>) =>
  Object.entries(vals).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

export interface ChapterRow { chapter: string; label: string; posT: number }
export interface ChannelRow {
  cmd: string; label: string; chapter: string; hs4: string;
  band: RiskBand; mtrs: number; abnormalGap: number; persistence: number;
  robustness: Robustness; posT: number;
}

const sel = "rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1.5 text-[13px] text-foreground outline-none focus:border-[var(--color-primary)]";
const lbl = "text-[11.5px] font-semibold uppercase tracking-wider text-faint";
const PAGE = 10;

/** Sorted unique values, preserving the first label seen for each key. */
function options(pairs: [string, string][]): { code: string; label: string }[] {
  const m = new Map<string, string>();
  for (const [code, label] of pairs) if (!m.has(code)) m.set(code, label);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([code, label]) => ({ code, label }));
}

export default function PartnerChannels({
  iso, partner, rows,
}: {
  iso: string; partner: string; rows: ChannelRow[];
}) {
  const { t } = useI18n();
  const [hs2, setHs2] = useState("all");
  const [hs4, setHs4] = useState("all");
  const [hs6, setHs6] = useState("all");
  const [shown, setShown] = useState(PAGE);

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
          <span className="tabular text-[13px] text-faint">
            {t("filter.channelCount")
              .split("{shown}").join(String(filtered.length))
              .split("{total}").join(String(rows.length))}
          </span>
          {narrowed && (
            <button
              onClick={() => { setHs2("all"); setHs4("all"); setHs6("all"); setShown(PAGE); }}
              className="ml-auto rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[13px] text-muted hover:text-foreground"
            >
              {t("filter.reset")} ✕
            </button>
          )}
        </div>
      </section>

      {/* HS6 signals */}
      <section>
        <SectionTitle title={t("prof.signals.title")} />
        {filtered.length === 0 ? (
          <p className="card p-8 text-center text-sm text-muted">
            {fill(t("prof.signals.empty"), { partner })}
          </p>
        ) : (
          <>
            {/* A real table with a header row: the columns carried no labels at
                all, so a reader met five unexplained values per line. */}
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>
                    <th className={TH_NUM}>{t("prof.th.score")}</th>
                    <th className={TH}>{t("prof.th.band")}</th>
                    <th className={TH}>{t("prof.th.code")}</th>
                    <th className={TH}>{t("prof.th.product")}</th>
                    <th className={TH_NUM}>{t("prof.th.gap")}</th>
                  </tr>
                </thead>
                <tbody className="zebra">
                  {filtered.slice(0, shown).map((c) => (
                    <tr key={c.cmd} className="border-b border-[var(--color-border-soft)] last:border-0">
                      <td className="px-3 py-2 align-middle"><RiskScore score={c.mtrs} band={c.band} /></td>
                      <td className="px-3 py-2 align-middle"><BandBadge band={c.band} /></td>
                      <td className="tabular whitespace-nowrap px-3 py-2 align-middle text-[13.5px] font-medium">
                        {c.cmd}
                      </td>
                      <td className="max-w-[22rem] px-3 py-2 align-middle text-[13.5px]">
                        <Link href={`/channels/${iso.toLowerCase()}/${c.cmd}`}
                          className="block truncate font-medium hover:underline" title={c.label}>
                          {c.label}
                        </Link>
                      </td>
                      <td className="tabular whitespace-nowrap px-3 py-2 text-right align-middle text-[13.5px]"
                        style={{ color: COLORS.positive }}
                        title={`${t("prof.tip.positiveDiscrepancy")}: ${fmtUSDFull(c.posT)}`}>
                        {fmtUSD(c.posT)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {shown < filtered.length && (
              <button
                onClick={() => setShown((n) => n + PAGE * 2)}
                className="mt-2 rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[13px] text-muted hover:text-foreground"
              >
                {fill(t("prof.signals.more"), { n: filtered.length - shown })}
              </button>
            )}
          </>
        )}
      </section>
    </>
  );
}
