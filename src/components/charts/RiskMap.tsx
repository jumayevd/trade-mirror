"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import { partnerMetaOf, type Filter, type PartnerAgg } from "@/lib/dataset";
import { COLORS, fmtNum, fmtUSD } from "@/lib/format";
import { baseTooltip } from "@/lib/echartBase";

/**
 * Geographic view (spec §6.3, secondary to the analytic matrix).
 * Countries are shaded by the discrepancy in the ACTIVE direction only —
 * positive uses the amber ramp, reverse the blue ramp (red stays reserved for
 * the Investigate class and is never used here). Low-quality reporters and
 * countries without comparable data stay grey with an explanatory tooltip;
 * missing partner data is never treated as a zero gap.
 */

export type MapMetric = "total" | "intensity" | "channels";

export const MAP_METRIC_LABELS: Record<MapMetric, string> = {
  total: "Total value",
  intensity: "Per $100M comparable trade",
  channels: "Channel count",
};

/** ISO3 -> country name used in the bundled world GeoJSON (public/world.json). */
const GEO_NAME: Record<string, string> = {
  CHN: "China", RUS: "Russia", KAZ: "Kazakhstan", KOR: "Korea", TUR: "Turkey",
  DEU: "Germany", KGZ: "Kyrgyzstan", TKM: "Turkmenistan", TJK: "Tajikistan",
  AFG: "Afghanistan", IRN: "Iran", IND: "India", JPN: "Japan", USA: "United States",
  LTU: "Lithuania", LVA: "Latvia", BLR: "Belarus", UKR: "Ukraine", AZE: "Azerbaijan",
  GEO: "Georgia", ARE: "United Arab Emirates", CHE: "Switzerland", GBR: "United Kingdom",
  FRA: "France", ITA: "Italy", NLD: "Netherlands", POL: "Poland", SGP: "Singapore", VNM: "Vietnam",
};
const ISO_BY_GEO: Record<string, string> = Object.fromEntries(Object.entries(GEO_NAME).map(([iso, n]) => [n, iso]));

/** Sequential ramps: amber for positive/absolute/net, blue for reverse (spec §10.1). */
const RAMP_AMBER = ["#fde68a", "#fcd34d", "#f59e0b", "#d97706", "#92400e"];
const RAMP_BLUE = ["#bfdbfe", "#93c5fd", "#60a5fa", "#2563eb", "#1e40af"];

function dirValue(p: PartnerAgg, f: Filter): number {
  switch (f.direction) {
    case "positive": return p.posT;
    case "reverse": return p.revT;
    case "absolute": return p.absT;
    case "net": return p.signedT;
  }
}

export default function RiskMap({ partners, filter, metric }: { partners: PartnerAgg[]; filter: Filter; metric: MapMetric }) {
  const router = useRouter();
  const [geo, setGeo] = useState<unknown>(null);

  useEffect(() => {
    let alive = true;
    fetch("/world.json").then((r) => r.json()).then((j) => alive && setGeo(j)).catch(() => {});
    return () => { alive = false; };
  }, []);

  const byIso = useMemo(() => new Map(partners.map((p) => [p.iso3, p])), [partners]);

  const metricOf = useMemo(() => (p: PartnerAgg): number | null => {
    const v = Math.abs(dirValue(p, filter));
    if (metric === "channels") return p.channels;
    if (metric === "intensity") return p.peT > 0 ? (v / p.peT) * 1e8 : null;
    return v;
  }, [filter, metric]);

  // colour only credible reporters with a nonzero metric; low-quality & no-data stay grey
  const data = useMemo(() => {
    const out: { name: string; value: number }[] = [];
    for (const p of partners) {
      if (p.tier === "Low" || !GEO_NAME[p.iso3]) continue;
      const v = metricOf(p);
      if (v == null || v <= 0) continue;
      out.push({ name: GEO_NAME[p.iso3], value: Math.round(v) });
    }
    return out;
  }, [partners, metricOf]);

  const fmtMetric = metric === "channels" ? fmtNum : fmtUSD;
  const mx = useMemo(() => Math.max(...data.map((d) => d.value), 1), [data]);

  const pieces = useMemo(() => {
    const ramp = filter.direction === "reverse" ? RAMP_BLUE : RAMP_AMBER;
    const t = [0.5, 0.2, 0.05, 0.01].map((f) => f * mx);
    return [
      { min: t[0], label: `over ${fmtMetric(t[0])}`, color: ramp[4] },
      { min: t[1], max: t[0], label: `${fmtMetric(t[1])} – ${fmtMetric(t[0])}`, color: ramp[3] },
      { min: t[2], max: t[1], label: `${fmtMetric(t[2])} – ${fmtMetric(t[1])}`, color: ramp[2] },
      { min: t[3], max: t[2], label: `${fmtMetric(t[3])} – ${fmtMetric(t[2])}`, color: ramp[1] },
      { max: t[3], label: `under ${fmtMetric(t[3])}`, color: ramp[0] },
    ];
  }, [mx, filter.direction, fmtMetric]);

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
            return `<b>${it.name}</b><br/><span style="${small}">Not in the analyzed partner set — no data (grey does not mean a zero gap)</span>`;
          }
          const pr = byIso.get(iso);
          if (!pr) {
            return `<b>${partnerMetaOf(iso)!.name}</b><br/><span style="${small}">No comparable observations under the current filters. Partner data missing for the period is not treated as a zero gap.</span>`;
          }
          const v = metricOf(pr);
          const metricLine = v == null
            ? `${MAP_METRIC_LABELS[metric]}: <span style="${small}">not computable (no comparable trade base)</span>`
            : `${MAP_METRIC_LABELS[metric]}: <b>${fmtMetric(v)}</b>`;
          const grey = pr.tier === "Low"
            ? `<br/><span style="font-size:11px;color:${COLORS.warn}">Low data quality — greyed out; the discrepancy may be a reporting artifact</span>`
            : "";
          const transit = pr.transit
            ? `<br/><span style="font-size:11px;color:${COLORS.transit}">Transit / re-export hub — origin-vs-consignment recording can create legitimate discrepancies</span>`
            : "";
          return [
            `<b>${pr.name}</b> · <span style="${small}">data quality: ${pr.tier}</span>`,
            metricLine,
            `<span style="color:${COLORS.positive}">Positive</span>: ${fmtUSD(pr.posT)} · <span style="color:${COLORS.reverse}">Reverse</span>: ${fmtUSD(pr.revT)}`,
            `<span style="${small}">Partner exports (FOB) ${fmtUSD(pr.peT)} · UZB imports (CIF) ${fmtUSD(pr.uiT)} · ${fmtNum(pr.channels)} channels</span>`,
          ].join("<br/>") + grey + transit +
            `<br/><span style="${small}">Click to open the partner profile. Screening signal, not evidence of wrongdoing.</span>`;
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
          name: MAP_METRIC_LABELS[metric],
          type: "map",
          map: "world",
          roam: true,
          scaleLimit: { min: 1, max: 8 },
          itemStyle: { areaColor: "#eef1ee", borderColor: "#d8ded9", borderWidth: 0.5 },
          emphasis: { label: { show: false }, itemStyle: { areaColor: "#cfd8d1" } },
          select: { itemStyle: { areaColor: "#cfd8d1" }, label: { show: false } },
          data,
        },
      ],
    }),
    [data, pieces, byIso, metric, metricOf, fmtMetric],
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
        <div className="flex h-full items-center justify-center text-sm text-muted">Loading map…</div>
      )}
    </div>
  );
}
