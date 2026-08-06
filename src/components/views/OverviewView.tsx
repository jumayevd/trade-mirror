"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import TrendChart from "@/components/charts/TrendChart";
import { Stat, MethodRef } from "@/components/ui";
import { Cite } from "@/lib/references";
import { useFilter } from "@/lib/filter-context";
import {
  meta, DATA_VERSION, METHODOLOGY_VERSION, DIRECTION_LABELS, STAGE_LABELS, CLASS_LABELS,
  type Channel, type Direction,
} from "@/lib/dataset";
import { fmtUSD, fmtPct, fmtNum, CLASS_COLORS } from "@/lib/format";

/* Headline label + mono formula chip follow the active direction (Screens §1). */
const HEADLINE: Record<Direction, { label: string; formula: string }> = {
  positive: { label: "Residual unexplained discrepancy · positive", formula: "§2.1 · Σ max(X·(1+f) − M, 0)" },
  reverse: { label: "Reverse discrepancy · UZB records exceed partner", formula: "§2.1 · Σ max(M − X·(1+f), 0)" },
  absolute: { label: "Absolute two-sided asymmetry", formula: "§2.1 · positive + reverse" },
  net: { label: "Net signed discrepancy", formula: "§2.1 · Σ (X·(1+f) − M)" },
};

const READ_FIRST = [
  "A screening signal: where the two record systems disagree, and by how much.",
  "Not proof of smuggling, fraud or under-declaration — that is evidence level 5.",
  "Not a shadow-economy size or budget-loss estimate; no tax rate is applied.",
];

const COL_RULE = "1px solid rgba(32,30,29,.2)";
const ROW_RULE_2 = "2px solid rgba(32,30,29,.4)";
const BTN_SECONDARY =
  "inline-flex cursor-pointer items-center justify-center border border-[rgba(32,30,29,.4)] bg-transparent px-2.5 py-[5px] text-[11.5px] font-semibold text-foreground no-underline hover:bg-[rgba(32,30,29,.07)] active:bg-[rgba(32,30,29,.14)]";

export default function OverviewView() {
  const { data, series, filter } = useFilter();
  const k = data.kpis;

  const head = HEADLINE[filter.direction];
  const headValue =
    filter.direction === "reverse" ? k.reverse
      : filter.direction === "absolute" ? k.absolute
        : filter.direction === "net" ? k.net
          : k.positive.central;
  const share = k.comparableTrade > 0 ? headValue / k.comparableTrade : 0;
  const period = filter.from === filter.to ? String(filter.from) : `${filter.from}–${filter.to}`;

  // freight sensitivity strip: fill to the 6% value as a share of the 15% value
  const lowW = k.positive.high > 0 ? Math.round((k.positive.low / k.positive.high) * 100) : 0;
  const centralW = k.positive.high > 0 ? Math.round((k.positive.central / k.positive.high) * 100) : 0;

  return (
    <div>
      {/* ---- Row 1: headline (1fr) | Read this first (320px) ---- */}
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) 320px", borderBottom: ROW_RULE_2 }}>
        <div style={{ padding: "26px 28px", borderRight: COL_RULE }}>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className="lbl">{head.label}</span>
            <MethodRef>{head.formula}</MethodRef>
          </div>
          <div className="flex flex-wrap items-end gap-5" style={{ marginTop: 10 }}>
            <div className="tabular" style={{ fontSize: 64, fontWeight: 600, lineHeight: 0.95, letterSpacing: "-0.03em" }}>
              {fmtUSD(headValue)}
            </div>
            <div style={{ paddingBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#ae1800" }}>
                {fmtPct(share, 1)} of comparable trade
              </div>
              <div className="tabular" style={{ fontSize: 11.5, color: "rgba(32,30,29,.6)" }}>
                {fmtUSD(k.positive.low)}–{fmtUSD(k.positive.high)} across 6–15% freight
              </div>
            </div>
          </div>
          <p style={{ margin: "12px 0 0", maxWidth: "36rem", fontSize: 13.5, lineHeight: 1.55, color: "rgba(32,30,29,.72)" }}>
            {period} · {DIRECTION_LABELS[filter.direction].toLowerCase()} · {STAGE_LABELS[filter.stage].toLowerCase()} stage.
            The share of partner-reported flows that Uzbekistan&apos;s own records do not account for after a{" "}
            {Math.round(filter.cif * 100)}% freight adjustment, over {fmtNum(k.channelCount)} partner × chapter channels.
          </p>
          <p style={{ margin: "6px 0 0", maxWidth: "36rem", fontSize: 12, lineHeight: 1.5, color: "rgba(32,30,29,.55)" }}>
            Built in the mirror-statistics tradition of partner-country comparison, from Bhagwati onward — one
            input to shadow-economy research, never its measure
            <Cite ids={["bhagwati1964", "carrere2015", "medina2018"]} />.
          </p>
          <div
            className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[rgba(32,30,29,.2)]"
            style={{ marginTop: 18, borderTop: COL_RULE }}
          >
            <div style={{ padding: "12px 12px 0 0" }}>
              <Stat value={fmtUSD(k.comparableTrade)} label="comparable trade" refId="§1.2" />
            </div>
            <div style={{ padding: "12px 12px 0 12px" }}>
              <Stat
                value={fmtUSD(filter.direction === "reverse" ? k.positive.central : k.reverse)}
                label={filter.direction === "reverse" ? "positive, separate" : "reverse, separate"}
                refId="§2.1"
              />
            </div>
            <div style={{ padding: "12px 12px 0 12px" }}>
              <Stat value={fmtPct(k.coveragePct, 0)} label="partner-year coverage" refId="§7.1" />
            </div>
            <div style={{ padding: "12px 0 0 12px" }}>
              <Stat value={String(k.robustSignals)} label="robust Investigate signals" refId="§6" accent="#ae1800" />
            </div>
          </div>
        </div>

        {/* right rail on the secondary surface */}
        <div style={{ padding: "26px 28px", background: "#eae9e9" }}>
          <div className="lbl">Read this first</div>
          <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10, fontSize: 12.5, lineHeight: 1.5, color: "rgba(32,30,29,.72)" }}>
            {READ_FIRST.map((s) => (
              <li key={s} style={{ display: "flex", gap: 8 }}>
                <span style={{ color: "#ec3013", fontWeight: 800 }}>→</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
          <Link href="/methodology" className={BTN_SECONDARY} style={{ marginTop: 14 }}>
            Formulas &amp; method §2
          </Link>
          <div style={{ marginTop: 18, borderTop: "1px solid rgba(32,30,29,.25)", paddingTop: 12 }}>
            <div className="lbl">Freight sensitivity §2.3</div>
            <div style={{ marginTop: 8, position: "relative", height: 12, background: "rgba(32,30,29,.12)" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${lowW}%`, background: "rgba(236,48,19,.3)" }} />
              <div style={{ position: "absolute", top: -4, bottom: -4, width: 3, left: `${centralW}%`, background: "#ec3013" }} />
            </div>
            <div className="tabular" style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "rgba(32,30,29,.6)" }}>
              <span>6% {fmtUSD(k.positive.low)}</span>
              <span>10% {fmtUSD(k.positive.central)}</span>
              <span>15% {fmtUSD(k.positive.high)}</span>
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 11.5, lineHeight: 1.5, color: "rgba(32,30,29,.6)" }}>
              {fmtPct(k.flipShare, 0)} of channels change sign inside the band and are held back from the
              residual stage.
            </p>
          </div>
        </div>
      </div>

      {/* ---- Row 2: eight-year record (1fr) | concentration (320px) ---- */}
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) 320px", borderBottom: ROW_RULE_2 }}>
        <div style={{ padding: "22px 28px", borderRight: COL_RULE }}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Eight-year record</h2>
            <span className="tabular" style={{ fontSize: 10.5, color: "rgba(32,30,29,.5)" }}>
              red = positive · grey = reverse · dashes = structural breaks §6.10
            </span>
          </div>
          <div style={{ marginTop: 8 }}>
            <TrendChart annual={series.annual} height={236} />
          </div>
        </div>
        <Concentration />
      </div>

      {/* ---- Bottom: priority queue preview ---- */}
      <QueuePreview channels={data.channels6} />

      {/* dataset footer — one mono line; full detail lives on Data quality */}
      <p className="tabular" style={{ padding: "0 28px 26px", margin: 0, fontSize: 11, color: "rgba(32,30,29,.55)" }}>
        {fmtNum(meta.datasetRows)} records · {meta.window.start}–{meta.window.end} · {fmtNum(meta.partners.length)}{" "}
        partners · UN Comtrade · data {DATA_VERSION} · methodology v{METHODOLOGY_VERSION} ·{" "}
        <Link href="/quality" style={{ textDecoration: "underline" }}>Data quality</Link>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Concentration: six CSS bars on the active direction (no chart)      */
/* ------------------------------------------------------------------ */

function Concentration() {
  const { data } = useFilter();
  const k = data.kpis;
  const rows = data.concentration.slice(0, 6);
  const max = rows.length ? Math.abs(rows[0].value) : 1;

  return (
    <div style={{ padding: "22px 28px" }}>
      <div className="flex items-baseline justify-between">
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Concentration</h2>
        <span className="tabular" style={{ fontSize: 10.5, color: "rgba(32,30,29,.5)" }}>§9</span>
      </div>
      {rows.length === 0 ? (
        <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "rgba(32,30,29,.6)" }}>
          No channels above the noise floor under the active filters.
        </p>
      ) : (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 9 }}>
          {rows.map((c) => (
            <div key={`${c.iso3}-${c.cmd}`}>
              <div className="flex justify-between gap-2" style={{ fontSize: 12 }}>
                <span
                  style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={c.name}
                >
                  {c.partner} · {c.cmd}
                </span>
                <span className="tabular" style={{ color: "rgba(32,30,29,.6)" }}>{fmtUSD(Math.abs(c.value))}</span>
              </div>
              <div style={{ marginTop: 3, height: 6, background: "rgba(32,30,29,.12)" }}>
                <div style={{ height: "100%", width: `${Math.max(4, Math.round((Math.abs(c.value) / max) * 100))}%`, background: "#ec3013" }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="tabular" style={{ margin: "12px 0 0", fontSize: 11, lineHeight: 1.5, color: "rgba(32,30,29,.6)" }}>
        Top-5 share {fmtPct(k.top5Share, 0)} · HHI {fmtNum(k.hhi)} · {fmtNum(k.channelCount)} channels
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Priority queue preview: top 6 of N, columns carry their § reference */
/* ------------------------------------------------------------------ */

const TH = "pb-[7px] pr-2.5 pt-[7px] text-left align-middle text-[10px] font-semibold uppercase tracking-[.1em] text-[rgba(32,30,29,.55)] whitespace-nowrap";
const TD = "py-[9px] pr-2.5 align-middle text-[13px]";

function QueuePreview({ channels }: { channels: Channel[] }) {
  const router = useRouter();
  const top = channels.slice(0, 6);

  return (
    <div style={{ padding: "22px 28px 34px" }}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
            Priority queue — top {top.length} of {fmtNum(channels.length)}
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "rgba(32,30,29,.6)" }}>
            Ranked by class, then anomaly strength, then evidence quality. Click a row for the per-year record.
          </p>
        </div>
        <Link href="/risk" className={BTN_SECONDARY}>Open full queue</Link>
      </div>
      {top.length === 0 ? (
        <p style={{ margin: "14px 0 0", fontSize: 13, color: "rgba(32,30,29,.6)" }}>
          No channels match the active filters.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table style={{ width: "100%", marginTop: 14, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: ROW_RULE_2 }}>
                <th className={TH}>Class §6</th>
                <th className={TH}>Partner · product</th>
                <th className={`${TH} text-right`}>A §4</th>
                <th className={`${TH} text-right`}>E §5</th>
                <th className={`${TH} text-right`}>Persistence</th>
                <th className={`${TH} text-right`}>Discrepancy</th>
              </tr>
            </thead>
            <tbody>
              {top.map((c) => (
                <tr
                  key={`${c.partnerIso}-${c.cmd}`}
                  onClick={() => router.push(`/channels/${c.partnerIso.toLowerCase()}/${c.cmd}`)}
                  style={{ borderBottom: "1px solid rgba(32,30,29,.18)", cursor: "pointer" }}
                  title={`${c.partner} × HS ${c.cmd} — open the per-year record`}
                >
                  <td className={TD} style={{ fontSize: 12, fontWeight: 800, color: CLASS_COLORS[c.cls], whiteSpace: "nowrap" }}>
                    {CLASS_LABELS[c.cls].label}
                  </td>
                  <td className={TD}>
                    <span style={{ fontWeight: 800 }}>{c.partner}</span>{" "}
                    <span style={{ color: "rgba(32,30,29,.65)" }}>{c.cmdLabel}</span>{" "}
                    <span className="tabular" style={{ fontSize: 11, color: "rgba(32,30,29,.5)" }}>HS {c.cmd}</span>
                  </td>
                  <td className={`${TD} tabular text-right whitespace-nowrap`}>{c.anomaly.toFixed(0)}</td>
                  <td className={`${TD} tabular text-right whitespace-nowrap`}>{c.evidence.toFixed(0)}</td>
                  <td className={`${TD} tabular text-right whitespace-nowrap`} style={{ color: "rgba(32,30,29,.7)" }}>
                    {c.posYears}/{c.comparableYears} yr · streak {c.longestPosStreak}
                  </td>
                  <td className={`${TD} tabular text-right whitespace-nowrap`} style={{ fontWeight: 600 }}>
                    {fmtUSD(c.primary)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ margin: "14px 0 0", maxWidth: "46rem", fontSize: 11.5, lineHeight: 1.5, color: "rgba(32,30,29,.55)" }}>
        Anomaly and evidence are scored independently (§4, §5): a strong anomaly on weak data is labelled
        &ldquo;verify data first&rdquo;, never escalated. Source: UN Comtrade.
      </p>
    </div>
  );
}
