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

/**
 * The `.chart-frame` wrapper cancels the page zoom (see globals.css), so inside
 * it one CSS pixel is one on-screen pixel again. The canvas therefore only needs
 * the plain device pixel ratio to stay sharp — and, more importantly, ECharts'
 * pointer maths and the rendered geometry share one coordinate system, so hover
 * lands on the mark under the cursor.
 */
function bitmapRatio(): number {
  if (typeof window === "undefined") return 1;
  return window.devicePixelRatio || 1;
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
    const chart = echarts.init(ref.current, undefined, {
      renderer: "canvas",
      devicePixelRatio: bitmapRatio(),
    });
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
    <div className={className} style={{ width: "100%", height: "100%", ...style }}>
      <div ref={ref} className="chart-frame" />
    </div>
  );
}
