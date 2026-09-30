"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import { partnerMetaOf, type PartnerAgg } from "@/lib/dataset";
import { COLORS, IS_DARK, fmtNum, fmtUSD } from "@/lib/format";
import { CHART_FONT, baseTooltip } from "@/lib/echartBase";
import { useI18n } from "@/lib/i18n";

/**
 * Geographic view (spec §6.3, secondary to the analytic matrix).
 * Countries are shaded by the positive discrepancy on the amber ramp (red stays
 * reserved for the Critical risk band and is never used here). Low-quality
 * reporters and countries without comparable data stay grey with an explanatory
 * tooltip; missing partner data is never treated as a zero gap. Regions outside
 * the analyzed partner set are inert — no tooltip, no hover, no pointer.
 */

export type MapMetric = "total" | "channels";

/** Locale keys for the map metrics — resolved through `t` at render time. */
export const MAP_METRIC_KEYS: Record<MapMetric, string> = {
  total: "ctry.map.metric.total",
  channels: "ctry.map.metric.channels",
};

/** Reporting-quality tier, as a word the reader's language actually uses. */
const TIER_KEYS = {
  High: "tier.high",
  Medium: "tier.medium",
  Low: "tier.low",
} as const;

/**
 * ISO3 -> country name used in the bundled world GeoJSON (public/world.json).
 * The GeoJSON carries no ISO code (only `name`), so the table is explicit and
 * covers every partner in meta.partners; each value is verified against the
 * feature names in that file. Hong Kong SAR (HKG) is the one partner with no
 * separate geometry in this GeoJSON, so it is reachable from the ranking table
 * rather than the map — it is never drawn as a grey "no data" country.
 */
const GEO_NAME: Record<string, string> = {
  AFG: "Afghanistan", ALB: "Albania", ARE: "United Arab Emirates", ARG: "Argentina",
  ARM: "Armenia", AUS: "Australia", AUT: "Austria", AZE: "Azerbaijan",
  BEL: "Belgium", BGD: "Bangladesh", BGR: "Bulgaria", BHR: "Bahrain",
  BIH: "Bosnia and Herz.", BLR: "Belarus", BOL: "Bolivia", BRA: "Brazil",
  CAN: "Canada", CHE: "Switzerland", CHL: "Chile", CHN: "China",
  COL: "Colombia", CUB: "Cuba", CYP: "Cyprus", CZE: "Czech Rep.",
  DEU: "Germany", DNK: "Denmark", ECU: "Ecuador", EGY: "Egypt",
  ESP: "Spain", EST: "Estonia", FIN: "Finland", FRA: "France",
  GBR: "United Kingdom", GEO: "Georgia", GRC: "Greece", GTM: "Guatemala",
  HND: "Honduras", HRV: "Croatia", HUN: "Hungary", IDN: "Indonesia",
  IND: "India", IRL: "Ireland", IRN: "Iran", ISR: "Israel",
  ITA: "Italy", JOR: "Jordan", JPN: "Japan", KAZ: "Kazakhstan",
  KEN: "Kenya", KGZ: "Kyrgyzstan", KHM: "Cambodia", KOR: "Korea",
  KWT: "Kuwait", LBN: "Lebanon", LKA: "Sri Lanka", LTU: "Lithuania",
  LUX: "Luxembourg", LVA: "Latvia", MAR: "Morocco", MDA: "Moldova",
  MEX: "Mexico", MLI: "Mali", MLT: "Malta", MNE: "Montenegro",
  MNG: "Mongolia", MOZ: "Mozambique", MYS: "Malaysia", NLD: "Netherlands",
  NOR: "Norway", NZL: "New Zealand", OMN: "Oman", PAK: "Pakistan",
  PHL: "Philippines", POL: "Poland", PRT: "Portugal", PSE: "Palestine",
  ROU: "Romania", RUS: "Russia", RWA: "Rwanda", SAU: "Saudi Arabia",
  SGP: "Singapore", SRB: "Serbia", SVK: "Slovakia", SVN: "Slovenia",
  SWE: "Sweden", THA: "Thailand", TJK: "Tajikistan", TUN: "Tunisia",
  TUR: "Turkey", TZA: "Tanzania", UGA: "Uganda", UKR: "Ukraine",
  USA: "United States", VNM: "Vietnam", ZAF: "South Africa", ZWE: "Zimbabwe",
};
const ISO_BY_GEO: Record<string, string> = Object.fromEntries(Object.entries(GEO_NAME).map(([iso, n]) => [n, iso]));

/*
 * Six classes on a single-hue sequential ramp, low → high: the house navy,
 * stepped by lightness alone.
 *
 * Magnitude is a sequential job, and one hue says "more of the same thing"
 * where a multi-hue ramp invites the reader to look for a boundary at each
 * hue change. It also leaves gold to the accents the interface reserves it for.
 *
 * Dark mode gets its own steps rather than an inverted copy: the ramp must
 * separate from the chart surface AND from the inert fill used for countries
 * outside the partner set, and on a dark ground a deep-navy low end vanishes
 * into both, so there it runs light-ward instead.
 *
 * Checked for what a sequential ramp needs — strictly monotonic lightness,
 * evenly spaced steps (max/min 1.43 and 1.48), a total OKLab-L range of 0.51
 * and 0.44, and a low end clear of the no-data fill (ΔE 12.8 and 11.6). The
 * categorical validator does not apply: its adjacent-pair separation check
 * asks for the opposite of what one hue stepped by lightness wants, and its
 * own output says as much.
 */
const RAMP = IS_DARK
  ? ["#344c79", "#41608f", "#5179ac", "#6b95c8", "#8db3de", "#b7d2f2"]
  : ["#b7cbe8", "#95b3da", "#6e92c5", "#4a72ab", "#2d5286", "#19335e"];

/** Two significant figures, so class edges read as $1.2M rather than $1,187,433. */
function niceRound(x: number): number {
  if (!(x > 0)) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(x)) - 1);
  return Math.round(x / p) * p;
}

/**
 * Class edges at the quantiles of the values actually on the map. The old
 * edges were fixed fractions of the largest value (50/20/5/1%), and with one
 * partner far above the rest nearly every country fell below 1% of it —
 * the palest bin — so the map read as a single colour. Quantile edges put
 * roughly the same number of countries in each class.
 */
function quantileEdges(values: number[], classes: number): number[] {
  const v = [...values].sort((a, b) => a - b);
  if (v.length === 0) return [];
  const edges: number[] = [];
  for (let i = 1; i < classes; i++) {
    const q = v[Math.min(v.length - 1, Math.floor((i * v.length) / classes))];
    const e = niceRound(q);
    if (e > 0 && (edges.length === 0 || e > edges[edges.length - 1])) edges.push(e);
  }
  return edges;
}

/** One map region. `silent` regions are outside the partner set: inert and never a pointer. */
interface Region { name: string; value: number; cursor?: string; silent?: boolean }

export default function RiskMap({ partners, metric }: { partners: PartnerAgg[]; metric: MapMetric }) {
  const router = useRouter();
  const { t } = useI18n();
  const [geo, setGeo] = useState<unknown>(null);

  useEffect(() => {
    let alive = true;
    fetch("/world.json").then((r) => r.json()).then((j) => alive && setGeo(j)).catch(() => {});
    return () => { alive = false; };
  }, []);

  const byIso = useMemo(() => new Map(partners.map((p) => [p.iso3, p])), [partners]);

  /** Every region name present in the bundled GeoJSON — drives the inert/clickable split. */
  const geoNames = useMemo(() => {
    const g = geo as { features?: { properties?: { name?: string } }[] } | null;
    return (g?.features ?? []).map((f) => f.properties?.name).filter((n): n is string => !!n);
  }, [geo]);

  const metricOf = useMemo(() => (p: PartnerAgg): number | null => {
    if (metric === "channels") return p.channels;
    return p.posT;
  }, [metric]);

  // colour only credible reporters with a nonzero metric. Partners with low data
  // quality or no comparable observations stay grey but keep the tooltip that says
  // so — grey is never a zero gap. Regions outside the partner set are silent, so
  // they take no hover, no tooltip and the plain arrow cursor.
  const data = useMemo<Region[]>(() => {
    const out: Region[] = [];
    for (const name of geoNames) {
      const iso = ISO_BY_GEO[name];
      if (!iso || !partnerMetaOf(iso)) { out.push({ name, value: NaN, silent: true, cursor: "default" }); continue; }
      const p = byIso.get(iso);
      if (!p) { out.push({ name, value: NaN, cursor: "default" }); continue; }
      const v = p.tier === "Low" ? null : metricOf(p);
      out.push({ name, value: v == null || v <= 0 ? NaN : Math.round(v), cursor: "pointer" });
    }
    return out;
  }, [geoNames, byIso, metricOf]);

  const fmtMetric = metric === "channels" ? fmtNum : fmtUSD;
  const pieces = useMemo(() => {
    const values = data.map((d) => d.value).filter((v) => Number.isFinite(v) && v > 0);
    const e = quantileEdges(values, RAMP.length);
    if (e.length === 0) return [{ min: 0, label: t("ctry.map.under"), color: RAMP[0] }];
    // highest class first, as the legend reads top-down; the ramp is indexed
    // from the top so a short edge list (few countries) still ends on the
    // deepest colour for the largest gaps
    const top = RAMP.length - 1;
    const out: { min?: number; max?: number; label: string; color: string }[] = [];
    out.push({ min: e[e.length - 1], label: `${t("ctry.map.over")} ${fmtMetric(e[e.length - 1])}`, color: RAMP[top] });
    for (let i = e.length - 1; i >= 1; i--) {
      out.push({ min: e[i - 1], max: e[i], label: `${fmtMetric(e[i - 1])} – ${fmtMetric(e[i])}`, color: RAMP[top - (e.length - i)] });
    }
    out.push({ max: e[0], label: `${t("ctry.map.under")} ${fmtMetric(e[0])}`, color: RAMP[top - e.length] });
    return out;
  }, [data, fmtMetric, t]);

  const option = useMemo<EChartsOption>(
    () => ({
      backgroundColor: "transparent",
      tooltip: {
        ...baseTooltip(),
        trigger: "item",
        confine: true,
        formatter: (p: unknown) => {
          const it = p as { name: string };
          const iso = ISO_BY_GEO[it.name];
          const small = `font-size:0.9em;color:${COLORS.text}`;
          if (!iso || !partnerMetaOf(iso)) {
            return `<b>${it.name}</b><br/><span style="${small}">${t("ctry.map.notInSet")}</span>`;
          }
          const pr = byIso.get(iso);
          if (!pr) {
            return `<b>${partnerMetaOf(iso)!.name}</b><br/><span style="${small}">${t("ctry.map.noObservations")}</span>`;
          }
          const v = metricOf(pr);
          const metricName = t(MAP_METRIC_KEYS[metric] as never);
          const metricLine = v == null
            ? `${metricName}: <span style="${small}">${t("ctry.map.notComputable")}</span>`
            : `${metricName}: <b>${fmtMetric(v)}</b>`;
          const grey = pr.tier === "Low"
            ? `<br/><span style="font-size:0.9em;color:${COLORS.warn}">${t("ctry.map.lowQuality")}</span>`
            : "";
          const transit = pr.transit
            ? `<br/><span style="font-size:0.9em;color:${COLORS.transit}">${t("ctry.map.transitHub")}</span>`
            : "";
          return [
            `<b>${pr.name}</b> · <span style="${small}">${t("ctry.map.dataQuality")}: ${t(TIER_KEYS[pr.tier])}</span>`,
            metricLine,
            `${t("kpi.positive")}: <b style="color:${COLORS.positive}">${fmtUSD(pr.posT)}</b>`,
            // reported values come from the observed totals, not the paired subset the
            // discrepancy is built on, so they reconcile with the source statistics
            `<span style="${small}">${t("ctry.partnerExportsFob")} ${fmtUSD(pr.observed.pe)} · ${t("ctry.uzbImportsCif")} ${fmtUSD(pr.observed.ui)} · ${fmtNum(pr.channels)} ${t("ctry.channelsWord")}</span>`,
          ].join("<br/>") + grey + transit +
            `<br/><span style="${small}">${t("ctry.map.clickProfile")}</span>`;
        },
      },
      visualMap: {
        type: "piecewise",
        pieces,
        left: 8,
        bottom: 16,
        textStyle: { color: COLORS.text, fontSize: CHART_FONT.axisLabel },
        itemWidth: 14,
        itemHeight: 10,
      },
      series: [
        {
          name: t(MAP_METRIC_KEYS[metric] as never),
          type: "map",
          map: "world",
          roam: true,
          scaleLimit: { min: 1, max: 8 },
          // partner regions are clickable, so they carry the hand cursor; regions
          // outside the partner set are silent and fall back to the arrow
          cursor: "pointer",
          itemStyle: { areaColor: COLORS.mapArea, borderColor: COLORS.mapBorder, borderWidth: 0.5 },
          emphasis: { label: { show: false }, itemStyle: { areaColor: COLORS.mapEmphasis } },
          select: { itemStyle: { areaColor: COLORS.mapEmphasis }, label: { show: false } },
          data,
        },
      ],
    }),
    [data, pieces, byIso, metric, metricOf, fmtMetric, t],
  );

  const onEvents = useMemo(
    () => ({
      click: (params: unknown) => {
        const it = params as { name: string };
        const iso = ISO_BY_GEO[it.name];
        if (iso && byIso.has(iso)) router.push(`/partners/${iso.toLowerCase()}`);
      },
    }),
    [router, byIso],
  );

  const registerMaps = useMemo(() => (geo ? [{ name: "world", geoJson: geo }] : undefined), [geo]);

  return (
    <div className="card overflow-hidden" style={{ height: 540 }}>
      {geo ? <EChart option={option} registerMaps={registerMaps} onEvents={onEvents} /> : (
        <div className="flex h-full items-center justify-center text-sm text-muted">{t("ctry.map.loading")}</div>
      )}
    </div>
  );
}
