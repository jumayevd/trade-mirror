"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import { partnerMetaOf, type PartnerAgg } from "@/lib/dataset";
import { COLORS, fmtNum, fmtUSD } from "@/lib/format";
import { baseTooltip } from "@/lib/echartBase";
import { useI18n } from "@/lib/i18n";

/**
 * Geographic view (spec §6.3, secondary to the analytic matrix).
 * Countries are shaded by the positive discrepancy on the amber ramp (red stays
 * reserved for the Investigate class and is never used here). Low-quality
 * reporters and countries without comparable data stay grey with an explanatory
 * tooltip; missing partner data is never treated as a zero gap. Regions outside
 * the analyzed partner set are inert — no tooltip, no hover, no pointer.
 */

export type MapMetric = "total" | "intensity" | "channels";

/** Locale keys for the three map metrics — resolved through `t` at render time. */
export const MAP_METRIC_KEYS: Record<MapMetric, string> = {
  total: "ctry.map.metric.total",
  intensity: "ctry.map.metric.intensity",
  channels: "ctry.map.metric.channels",
};

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

/** Sequential amber ramp derived from the positive-discrepancy data color (spec §10.1). */
const RAMP_AMBER = ["#f3e3cf", "#e8c79e", "#d9a15e", "#c2701e", "#8f5010"];

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
    if (metric === "intensity") return p.peT > 0 ? (p.posT / p.peT) * 1e8 : null;
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
  const mx = useMemo(
    () => Math.max(...data.map((d) => d.value).filter((v) => Number.isFinite(v)), 1),
    [data],
  );

  const pieces = useMemo(() => {
    const b = [0.5, 0.2, 0.05, 0.01].map((f) => f * mx);
    return [
      { min: b[0], label: `${t("ctry.map.over")} ${fmtMetric(b[0])}`, color: RAMP_AMBER[4] },
      { min: b[1], max: b[0], label: `${fmtMetric(b[1])} – ${fmtMetric(b[0])}`, color: RAMP_AMBER[3] },
      { min: b[2], max: b[1], label: `${fmtMetric(b[2])} – ${fmtMetric(b[1])}`, color: RAMP_AMBER[2] },
      { min: b[3], max: b[2], label: `${fmtMetric(b[3])} – ${fmtMetric(b[2])}`, color: RAMP_AMBER[1] },
      { max: b[3], label: `${t("ctry.map.under")} ${fmtMetric(b[3])}`, color: RAMP_AMBER[0] },
    ];
  }, [mx, fmtMetric, t]);

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
          const small = `font-size:11px;color:${COLORS.text}`;
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
            ? `<br/><span style="font-size:11px;color:${COLORS.warn}">${t("ctry.map.lowQuality")}</span>`
            : "";
          const transit = pr.transit
            ? `<br/><span style="font-size:11px;color:${COLORS.transit}">${t("ctry.map.transitHub")}</span>`
            : "";
          return [
            `<b>${pr.name}</b> · <span style="${small}">${t("ctry.map.dataQuality")}: ${pr.tier}</span>`,
            metricLine,
            `${t("kpi.positive")}: <b style="color:${COLORS.positive}">${fmtUSD(pr.posT)}</b>`,
            `<span style="${small}">${t("ctry.partnerExportsFob")} ${fmtUSD(pr.peT)} · ${t("ctry.uzbImportsCif")} ${fmtUSD(pr.uiT)} · ${fmtNum(pr.channels)} ${t("ctry.channelsWord")}</span>`,
          ].join("<br/>") + grey + transit +
            `<br/><span style="${small}">${t("ctry.map.clickProfile")}</span>`;
        },
      },
      visualMap: {
        type: "piecewise",
        pieces,
        left: 8,
        bottom: 16,
        textStyle: { color: COLORS.text, fontSize: 11 },
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
          itemStyle: { areaColor: "#eef1ee", borderColor: "#d8ded9", borderWidth: 0.5 },
          emphasis: { label: { show: false }, itemStyle: { areaColor: "#cfd8d1" } },
          select: { itemStyle: { areaColor: "#cfd8d1" }, label: { show: false } },
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
