"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";

type EChartsOption = echarts.EChartsOption;

interface Props {
  option: EChartsOption;
  className?: string;
  style?: React.CSSProperties;
  /** Optional GeoJSON maps to register before rendering (for the geo view). */
  registerMaps?: { name: string; geoJson: unknown }[];
  /** Event handlers, e.g. { click: (params) => ... } */
  onEvents?: Record<string, (params: unknown) => void>;
}

export default function EChart({ option, className, style, registerMaps, onEvents }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (registerMaps) {
      for (const m of registerMaps) {
        // @ts-expect-error geojson typing is loose
        echarts.registerMap(m.name, m.geoJson);
      }
    }
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    chart.setOption(option);

    if (onEvents) {
      for (const [evt, handler] of Object.entries(onEvents)) {
        chart.on(evt, handler);
      }
    }

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
    // re-init only when maps change; option updates handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerMaps]);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ width: "100%", height: "100%", ...style }}
    />
  );
}
