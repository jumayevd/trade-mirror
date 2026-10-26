"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SectionTitle, BandBadge, RiskScore } from "@/components/ui";
import { hsLabel, hs4Label, type RiskBand } from "@/lib/dataset";
import { fmtUSD, fmtUSDFull, fmtPct, fmtNum } from "@/lib/format";
import { GapCell, ShareCell, productName } from "@/components/TableKit";
import { useI18n } from "@/lib/i18n";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * HS6 products risk signals for one partner: every HS6 product both books
 * reported in the period, one row each, with the HS2 › HS4 › HS6 narrowing
 * scoped to this table.
 *
 * All figures are the HS6 lines' own. A chapter or heading is never read from
 * a separate layer: choosing HS2 or HS4 narrows the rows, and the total row
 * beneath is the sum of exactly the HS6 rows shown — so a chapter's export,
 * import and positive discrepancy are derived from its products by
 * construction. Export and Import are the lines' values where the partner's
 * exports exceed Uzbekistan's imports, so on every row and on the total,
 * Export − Import ÷ (1 + freight) = Positive discrepancy.
 */

const TH = "text-left";
const TH_NUM = "text-right";
const TD = "";
const TD_NUM = "tabular whitespace-nowrap text-right";
const PAGE = 10;

export interface ChannelRow {
  cmd: string; label: string; chapter: string; hs4: string;
  band: RiskBand; mtrs: number;
  /** Positive-line export and import, and the positive discrepancy between them. */
  pePosT: number; uiPosT: number; posT: number;
}

const BAND_RANK: Record<RiskBand, number> = { critical: 0, high: 1, elevated: 2, low: 3 };

const sel = "h-[33px] rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 fs-13 text-foreground outline-none focus:border-[var(--color-primary)] max-w-[18rem]";
const lbl = "fs-12.5 font-medium text-faint";

/** Sorted unique codes with their labels. */
function options(pairs: [string, string][]): { code: string; label: string }[] {
  const m = new Map<string, string>();
  for (const [code, label] of pairs) if (!m.has(code)) m.set(code, label);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([code, label]) => ({ code, label }));
}

const share = (pos: number, pe: number) => (pe > 0 ? pos / pe : null);

export default function PartnerChannels({
  iso, rows,
}: {
  iso: string; rows: ChannelRow[];
}) {
  const { t, lang } = useI18n();
  const [hs2, setHs2] = useState("all");
  const [hs4, setHs4] = useState("all");
  const [hs6, setHs6] = useState("all");
  const [page, setPage] = useState(0);
  // the code lists run to thousands of options on a large partner — 1.5 MB of
  // HTML per prerendered page; they render once scripts can use them
  const hydrated = useHydrated();

  // strongest signal first: band, then score, then size
  const ranked = useMemo(
    () => [...rows].sort((a, b) =>
      BAND_RANK[a.band] - BAND_RANK[b.band] || b.mtrs - a.mtrs || b.posT - a.posT),
    [rows],
  );

  const hs2Options = useMemo(
    () => options(ranked.map((r) => [r.chapter, hsLabel(r.chapter)] as [string, string])),
    [ranked],
  );
  const hs4Options = useMemo(
    () => options(ranked.filter((r) => hs2 === "all" || r.chapter === hs2)
      .map((r) => [r.hs4, hs4Label(r.hs4)] as [string, string])),
    [ranked, hs2],
  );
  const hs6Options = useMemo(
    () => options(ranked
      .filter((r) => (hs2 === "all" || r.chapter === hs2) && (hs4 === "all" || r.hs4 === hs4))
      .map((r) => [r.cmd, r.label] as [string, string])),
    [ranked, hs2, hs4],
  );

  const filtered = useMemo(
    () => ranked.filter((r) =>
      (hs2 === "all" || r.chapter === hs2)
      && (hs4 === "all" || r.hs4 === hs4)
      && (hs6 === "all" || r.cmd === hs6)),
    [ranked, hs2, hs4, hs6],
  );
  // the total row: a sum of exactly the HS6 rows the filters leave
  const total = useMemo(() => filtered.reduce(
    (a, r) => ({ pe: a.pe + r.pePosT, ui: a.ui + r.uiPosT, pos: a.pos + r.posT }),
    { pe: 0, ui: 0, pos: 0 },
  ), [filtered]);

  const narrowed = hs2 !== "all" || hs4 !== "all" || hs6 !== "all";
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const at = Math.min(page, pages - 1);
  const shown = filtered.slice(at * PAGE, at * PAGE + PAGE);
  // bars scale to the rows on screen
  const maxGap = shown.reduce((m, c) => Math.max(m, c.posT), 0);

  const pick = (level: "hs2" | "hs4" | "hs6", v: string) => {
    setPage(0);
    if (level === "hs2") { setHs2(v); setHs4("all"); setHs6("all"); return; }
    if (level === "hs4") { setHs4(v); setHs6("all"); return; }
    setHs6(v);
  };

  const btn = "rounded-md border border-[var(--color-border)] px-2 py-1 fs-13 text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <section className="space-y-3">
      <SectionTitle title={t("prof.signals.title")} />

      {/* narrowing, scoped to this table */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="flex flex-col gap-1">
          <span className={lbl}>HS2</span>
          <select className={sel} value={hs2} onChange={(e) => pick("hs2", e.target.value)} aria-label={t("prof.aria.hs2")}>
            <option value="all">{t("filter.all")}</option>
            {hydrated && hs2Options.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className={lbl}>HS4</span>
          <select className={sel} value={hs4} onChange={(e) => pick("hs4", e.target.value)} aria-label={t("prof.aria.hs4")}>
            <option value="all">{t("filter.all")}</option>
            {hydrated && hs4Options.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className={lbl}>HS6</span>
          <select className={sel} value={hs6} onChange={(e) => pick("hs6", e.target.value)} aria-label={t("prof.aria.hs6")}>
            <option value="all">{t("filter.all")}</option>
            {hydrated && hs6Options.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
          </select>
        </div>
        <span className="tabular fs-13 text-faint">
          {t("filter.channelCount")
            .split("{shown}").join(fmtNum(filtered.length))
            .split("{total}").join(fmtNum(rows.length))}
        </span>
        {narrowed && (
          <button
            onClick={() => { setHs2("all"); setHs4("all"); setHs6("all"); setPage(0); }}
            className="ml-auto rounded-md border border-[var(--color-border)] px-2.5 py-1.5 fs-13 text-muted hover:text-foreground"
          >
            {t("filter.reset")} ✕
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="card p-8 text-center text-sm text-muted">{t("prof.signals.none")}</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="cbu-table min-w-[820px]">
            <thead>
              <tr>
                <th className={TH}>{t("prof.th.product")}</th>
                <th className={TH_NUM} title={t("ctry.col.export.tip")}>{t("prof.th.export")}</th>
                <th className={TH_NUM} title={t("ctry.col.import.tip")}>{t("prof.th.import")}</th>
                <th className={TH_NUM}>{t("prof.th.gap")}</th>
                <th className={TH_NUM} title={t("prof.th.share.tip")}>{t("prof.th.share")}</th>
                <th className={TH_NUM}>{t("prof.th.score")}</th>
                <th className={TH}>{t("prof.th.band")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const sh = share(c.posT, c.pePosT);
                return (
                  <tr key={c.cmd}>
                    <td className="max-w-[20rem]">
                      {/* a few words that name the line; the code and the full text on hover */}
                      <Link href={`/channels/${iso.toLowerCase()}/${c.cmd}`}
                        className="line-clamp-2 font-medium leading-snug text-[var(--color-primary)] hover:underline" title={`HS ${c.cmd} · ${c.label}`}>
                        {productName(c.cmd, lang, c.label)}
                      </Link>
                    </td>
                    <td className={`${TD_NUM} text-[var(--color-gold-ink)]`} title={fmtUSDFull(c.pePosT)}>{fmtUSD(c.pePosT)}</td>
                    <td className={`${TD_NUM} text-muted`} title={fmtUSDFull(c.uiPosT)}>{fmtUSD(c.uiPosT)}</td>
                    <td className="w-[130px]"><GapCell value={c.posT} max={maxGap} /></td>
                    <td className="text-right"><ShareCell share={sh} /></td>
                    <td className="text-right"><RiskScore score={c.mtrs} band={c.band} /></td>
                    <td className={TD}><BandBadge band={c.band} /></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className={TD}>
                  {t("prof.signals.total").split("{n}").join(fmtNum(filtered.length))}
                </td>
                <td className={TD_NUM} title={fmtUSDFull(total.pe)}>{fmtUSD(total.pe)}</td>
                <td className={TD_NUM} title={fmtUSDFull(total.ui)}>{fmtUSD(total.ui)}</td>
                <td className={`${TD_NUM} text-[var(--color-positive)]`} title={fmtUSDFull(total.pos)}>{fmtUSD(total.pos)}</td>
                <td className={TD_NUM}>{total.pe > 0 ? fmtPct(total.pos / total.pe, 1) : "—"}</td>
                <td className={TD} colSpan={2} />
              </tr>
            </tfoot>
          </table>
          {filtered.length > PAGE && (
            <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border-soft)] px-3 py-2">
              <span className="tabular fs-13 text-faint">
                {fmtNum(at * PAGE + 1)}–{fmtNum(Math.min((at + 1) * PAGE, filtered.length))} {t("ctry.pager.of")} {fmtNum(filtered.length)}
              </span>
              <button className={btn} onClick={() => setPage(at - 1)} disabled={at === 0} aria-label={t("ctry.pager.prev")}>‹</button>
              <button className={btn} onClick={() => setPage(at + 1)} disabled={at >= pages - 1} aria-label={t("ctry.pager.next")}>›</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
