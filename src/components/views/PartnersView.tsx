"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import FilterBar from "@/components/FilterBar";
import RiskMap from "@/components/charts/RiskMap";
import { SectionTitle, QualityTag, TransitTag, EmptyState, InfoTip } from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import { aggregate, type PartnerAgg, DATA_WINDOW } from "@/lib/dataset";
import { channelsToCsv, downloadCsv } from "@/lib/export";
import { fmtNum, fmtUSD, fmtUSDFull, fmtPct, COLORS } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { labelsFor } from "@/lib/labels";
import { hs6ShortLabel } from "@/lib/short-labels";

/**
 * Country Analysis (spec §6.5) — geographic hero (click a country to open its
 * profile), ranked country table, per-year and per-country summary statistics,
 * and a compare mode (up to 4 partners side by side). Only the positive
 * discrepancy is screened: partner-reported exports uplifted by freight, minus
 * Uzbekistan-recorded imports, accumulated over the years where it is positive.
 */

type SortKey = "export" | "import" | "positive" | "share" | "channels";

const MAX_COMPARE = 4;
const PAGE_SIZE = 10;


/** Same noise floor the engine screens on — quoted in the ranking footnote. */

/*
 * Positive discrepancy ÷ the exports printed beside it. Export and Import are
 * the partner's HS6 lines where its exports exceed Uzbekistan's imports, so
 * each row checks by hand: Export − Import ÷ (1 + freight) = Positive
 * discrepancy, and this rate = Positive discrepancy ÷ Export. Dividing by ALL
 * comparable exports, as before, gave a rate no figure on the row explained.
 */
const gapRate = (p: PartnerAgg) => (p.pePosT > 0 ? p.posT / p.pePosT : 0);

/** Series-identity dot for column headers / labels — the text itself stays ink (rule 5). */
function HeadDot({ color }: { color: string }) {
  return (
    <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: color }} />
  );
}

/** Locale keys for the column-sort tooltips — resolved through `t` at render time. */
const SORT_TIP_KEYS: Record<SortKey, string> = {
  export: "ctry.sortTip.export",
  import: "ctry.sortTip.import",
  positive: "ctry.sortTip.positive",
  share: "ctry.sortTip.share",
  channels: "ctry.sortTip.channels",
};

/** Compact client pagination footer — "X–Y of N". */
function Pager({
  page, total, onPage,
}: {
  page: number; total: number; onPage: (p: number) => void;
}) {
  const { t } = useI18n();
  if (total <= PAGE_SIZE) return null;
  const pages = Math.ceil(total / PAGE_SIZE);
  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);
  const btn = "rounded-md border border-[var(--color-border)] px-2 py-1 fs-13 text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border-soft)] px-3 py-2">
      <span className="tabular fs-13 text-faint">
        {from}–{to} {t("ctry.pager.of")} {total}
      </span>
      <button className={btn} onClick={() => onPage(page - 1)} disabled={page === 0} aria-label={t("ctry.pager.prev")}>‹</button>
      <button className={btn} onClick={() => onPage(page + 1)} disabled={page >= pages - 1} aria-label={t("ctry.pager.next")}>›</button>
    </div>
  );
}

export default function PartnersView() {
  const { filter } = useFilter();
  const { lang, t } = useI18n();
  const data = useMemo(() => labelsFor(lang, () => aggregate({ ...filter, rollupLevel: 6 })), [filter, lang]);
  const [sort, setSort] = useState<SortKey>("positive");
  const [sel, setSel] = useState<string[]>([]);
  const [pageSel, setPageSel] = useState<{ len: number; sort: SortKey; page: number } | null>(null);

  /*
   * Per-partner HS6 facts. The top product is the partner's HS6 line with the
   * largest positive discrepancy — the column used to print an HS2 chapter under
   * an "HS6" heading. "All HS6 products" counts every line both books reported
   * in the period; the critical count and share are of those same lines.
   */
  const hs6Facts = useMemo(() => {
    const m = new Map<string, { all: number; critical: number; top: { cmd: string; label: string; posT: number } | null }>();
    const at = (iso: string) => {
      let e = m.get(iso);
      if (!e) { e = { all: 0, critical: 0, top: null }; m.set(iso, e); }
      return e;
    };
    for (const c of data.baseChannels6) {
      const e = at(c.partnerIso);
      e.all++;
      if (c.band === "critical") e.critical++;
      if (c.posT > 0 && (!e.top || c.posT > e.top.posT)) e.top = { cmd: c.cmd, label: c.cmdLabel, posT: c.posT };
    }
    return m;
  }, [data.baseChannels6]);

  /* ------------------------------------------------------------------ */
  /* Ranking rows (filtered partner rollups)                             */
  /* ------------------------------------------------------------------ */
  const rows = useMemo(() => {
    const by: Record<SortKey, (a: PartnerAgg, b: PartnerAgg) => number> = {
      export: (a, b) => b.pePosT - a.pePosT,
      import: (a, b) => b.uiPosT - a.uiPosT,
      positive: (a, b) => b.posT - a.posT,
      share: (a, b) => gapRate(b) - gapRate(a),
      channels: (a, b) => (hs6Facts.get(b.iso3)?.all ?? 0) - (hs6Facts.get(a.iso3)?.all ?? 0) || b.posT - a.posT,
    };
    return [...data.partners].sort(by[sort]);
  }, [data.partners, sort, hs6Facts]);


  const totals = useMemo(() => data.partners.reduce(
    (acc, p) => ({ pe: acc.pe + p.pePosT, ui: acc.ui + p.uiPosT }), { pe: 0, ui: 0 },
  ), [data.partners]);

  // pagination is derived: it falls back to page 0 whenever the list length or
  // sort has changed since the user last paged — no reset effect needed
  const rankPage = pageSel && pageSel.len === rows.length && pageSel.sort === sort ? pageSel.page : 0;
  const pagedRows = rows.slice(rankPage * PAGE_SIZE, (rankPage + 1) * PAGE_SIZE);

  /* ------------------------------------------------------------------ */
  /* Headline counts (one quiet sentence above the map)                  */
  /* ------------------------------------------------------------------ */
  const highTier = data.partners.filter((p) => p.tier === "High").length;
  const transitCount = data.partners.filter((p) => p.transit).length;

  /* ------------------------------------------------------------------ */
  /* Compare selection                                                   */
  /* ------------------------------------------------------------------ */
  const compare = sel
    .map((iso) => data.partners.find((p) => p.iso3 === iso))
    .filter((p): p is PartnerAgg => !!p);
  const toggle = (iso: string) =>
    setSel((s) =>
      s.includes(iso) ? s.filter((x) => x !== iso) : s.length >= MAX_COMPARE ? s : [...s, iso],
    );

  const exportCsv = () =>
    downloadCsv("country_analysis_hs6_channels.csv", channelsToCsv(data.channels6, filter));

  const th = "px-3 py-1.5 text-left fs-12 font-medium text-faint whitespace-nowrap";
  const thNum = `${th} text-right`;
  const td = "px-3 py-1.5 align-middle fs-13";
  const tdNum = `${td} tabular text-right whitespace-nowrap`;

  const sortBtn = (k: SortKey, label: string) => (
    <button
      onClick={() => setSort(k)}
      title={t(SORT_TIP_KEYS[k] as never)}
      className={`inline-flex items-center gap-0.5 hover:text-foreground ${sort === k ? "text-foreground" : ""}`}
    >
      {label}
      <span aria-hidden>{sort === k ? "▾" : ""}</span>
    </button>
  );

  /* ------------------------------------------------------------------ */
  /* Reusable ranking table (hero Table mode & the ranking section)      */
  /* ------------------------------------------------------------------ */
  const rankingTable =
    rows.length === 0 ? (
      <EmptyState />
    ) : (
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse">
          <thead className="border-b border-[var(--color-border)]">
            <tr>
              <th className={th} title={`${t("ctry.rank.cmpTipPre")} ${MAX_COMPARE} ${t("ctry.rank.cmpTipPost")}`}>
                <span className="inline-flex items-center gap-1">{t("ctry.rank.cmp")} <InfoTip text={`${t("ctry.rank.cmpInfoPre")} ${MAX_COMPARE} ${t("ctry.rank.cmpInfoPost")}`} /></span>
              </th>
              <th className={th}>{t("common.partner")}</th>
              <th className={thNum} title={t("ctry.col.export.tip")}>{sortBtn("export", t("ctry.col.export"))}</th>
              <th className={thNum} title={t("ctry.col.import.tip")}>{sortBtn("import", t("ctry.col.import"))}</th>
              <th className={thNum}><HeadDot color={COLORS.positive} />{sortBtn("positive", t("ctry.col.positive"))}</th>
              <th className={thNum}>{sortBtn("share", t("ctry.col.gapRate"))}</th>
              <th className={thNum}>{sortBtn("channels", t("ctry.col.channels"))}</th>
              <th className={th} title={t("ctry.rank.topHs2Tip")}>{t("ctry.col.topHs2")}</th>
            </tr>
          </thead>
          <tbody className="zebra">
            {pagedRows.map((p) => {
              const top = hs6Facts.get(p.iso3)?.top ?? null;
              const checked = sel.includes(p.iso3);
              return (
                <tr key={p.iso3} className="border-b border-[var(--color-border-soft)] hover:bg-[color-mix(in_srgb,var(--color-primary)_4%,transparent)]">
                  <td className={td}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && sel.length >= MAX_COMPARE}
                      onChange={() => toggle(p.iso3)}
                      aria-label={`${t("ctry.rank.compareAria")} ${p.name}`}
                      className="h-3.5 w-3.5 accent-[var(--color-primary)] disabled:cursor-not-allowed"
                    />
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <Link href={`/partners/${p.iso3.toLowerCase()}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <span className="ml-2 text-xs text-faint">{p.region}</span>
                    {p.transit && <span className="ml-2 align-middle"><TransitTag /></span>}
                  </td>
                  <td className={tdNum} title={fmtUSDFull(p.pePosT)}>{fmtUSD(p.pePosT)}</td>
                  <td className={tdNum} title={fmtUSDFull(p.uiPosT)}>{fmtUSD(p.uiPosT)}</td>
                  <td className={tdNum} title={`${t("kpi.positive")} (${t("kpi.positive.sub")}): ${fmtUSDFull(p.posT)}`}>
                    {fmtUSD(p.posT)}
                  </td>
                  <td className={tdNum} title={t("ctry.gapRateTip")}>{fmtPct(gapRate(p), 0)}</td>
                  <td className={tdNum} title={t("ctry.channelsTip")}>{fmtNum(hs6Facts.get(p.iso3)?.all ?? 0)}</td>
                  <td className={`${td} max-w-[220px]`}>
                    {top ? (
                      <span title={`HS ${top.cmd} · ${top.label} — ${fmtUSDFull(top.posT)} (${fmtPct(p.posT > 0 ? top.posT / p.posT : 0, 0)} ${t("ctry.rank.ofPartnerPositive")})`}>
                        <span className="tabular mr-1.5 text-xs text-faint">{top.cmd}</span>
                        <span className="fs-13">{hs6ShortLabel(top.cmd, lang, top.label)}</span>
                      </span>
                    ) : (
                      <span className="text-faint" title={t("ctry.rank.belowNoiseTip")}>{t("ctry.rank.belowNoise")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-panel-2)] font-semibold">
              <td className={td} />
              <td className={`${td} whitespace-nowrap`} title={t("ctry.rank.totalsTip")}>
                {t("ctry.rank.totalsRow")}
              </td>
              <td className={tdNum} title={fmtUSDFull(totals.pe)}>{fmtUSD(totals.pe)}</td>
              <td className={tdNum} title={fmtUSDFull(totals.ui)}>{fmtUSD(totals.ui)}</td>
              <td className={tdNum} title={`${fmtUSDFull(data.kpis.positive.central)} (${t("ctry.rank.freightRangePre")} ${fmtUSD(data.kpis.positive.low)}–${fmtUSD(data.kpis.positive.high)} ${t("ctry.rank.freightRangePost")})`}>
                {fmtUSD(data.kpis.positive.central)}
              </td>
              <td className={tdNum}>{totals.pe > 0 ? fmtPct(data.kpis.positive.central / totals.pe, 0) : "—"}</td>
              <td className={tdNum} colSpan={2} />
            </tr>
          </tfoot>
        </table>
        <Pager page={rankPage} total={rows.length} onPage={(p) => setPageSel({ len: rows.length, sort, page: p })} />
      </div>
    );

  return (
    <div className="space-y-6">
      {/* 1. header */}
      <section className="space-y-1.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("nav.partners")}</h1>
          </div>
          <button
            onClick={exportCsv}
            disabled={data.channels6.length === 0}
            className="rounded-md border border-[var(--color-border)] px-2 py-1 fs-13 font-medium text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            title={t("ctry.exportTip")}
          >
            {t("common.exportCsv")} ↓
          </button>
        </div>
      </section>

      {/* 2. filters + context */}
      <FilterBar />

      {/* 3. map hero */}
      <section className="space-y-3">
        <SectionTitle
          title={t("ctry.geo.title")}
          desc={t("ctry.geo.desc")}
          right={<InfoTip text={t("ctry.geo.info")} />}
        />
        <p className="max-w-3xl fs-13 text-muted">
          <span className="tabular font-medium text-foreground">{data.partners.length}</span> {t("ctry.stats.partners")}
          · <span className="tabular font-medium text-foreground" title={t("ctry.stats.highTierTip")}>{highTier}</span> {t("ctry.stats.highTier")}
          · <span className="tabular font-medium text-foreground" title={t("ctry.stats.transitTip")}>{transitCount}</span> {t("ctry.stats.transitHubs")}
        </p>
        {data.partners.length === 0 ? <EmptyState /> : <RiskMap partners={data.partners} metric="total" />}
      </section>

      {/* 4. compare panel (rendered as soon as anything is selected) */}
      {compare.length > 0 && (
        <section className="card p-4">
          <SectionTitle
            title={`${t("ctry.compare.title")} (${compare.length}/${MAX_COMPARE})`}
            desc={t("ctry.compare.desc")}
            right={
              <span className="flex items-center gap-2">
                <InfoTip text={`${t("ctry.compare.infoPre")} ${DATA_WINDOW.start}–${DATA_WINDOW.end} ${t("ctry.compare.infoPost")}`} />
                <button
                  onClick={() => setSel([])}
                  className="rounded-md border border-[var(--color-border)] px-2 py-1 fs-13 text-muted hover:text-foreground"
                >
                  {t("ctry.compare.clear")} ✕
                </button>
              </span>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {compare.map((p) => {
              const f = hs6Facts.get(p.iso3) ?? { all: 0, critical: 0, top: null };
              return (
                <div key={p.iso3} className="rounded-lg border border-[var(--color-border-soft)] p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Link href={`/partners/${p.iso3.toLowerCase()}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline">
                      {p.name}
                    </Link>
                    <QualityTag tier={p.tier} />
                    {p.transit && <TransitTag />}
                  </div>
                  <dl className="mt-2 space-y-1 fs-13">
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint"><HeadDot color={COLORS.positive} />{t("ctry.col.positive")}</dt>
                      <dd className="tabular" title={fmtUSDFull(p.posT)}>{fmtUSD(p.posT)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint">{t("ctry.col.gapRate")}</dt>
                      <dd className="tabular" title={t("ctry.gapRateTip")}>{fmtPct(gapRate(p), 0)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint">{t("ctry.compare.allHs6")}</dt>
                      <dd className="tabular" title={t("ctry.compare.allHs6.tip")}>{fmtNum(f.all)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint">{t("ctry.compare.flaggedChannels")}</dt>
                      <dd className="tabular">{fmtNum(f.critical)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint">{t("ctry.compare.criticalShare")}</dt>
                      <dd className="tabular" title={`${fmtNum(f.critical)} ÷ ${fmtNum(f.all)}`}>{f.all > 0 ? fmtPct(f.critical / f.all, 1) : "—"}</dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 5. country ranking */}
      <section className="space-y-3">
        <SectionTitle
          title={t("ctry.rank.title")}
          desc={t("ctry.rank.desc")}
          right={<InfoTip text={t("ctry.rank.info")} />}
        />
        {rankingTable}
      </section>

    </div>
  );
}
