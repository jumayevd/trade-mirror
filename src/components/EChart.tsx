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

/**
 * Events ECharts hit-tests through `offsetX/Y`. Browsers disagree on which
 * coordinate space those carry once CSS `zoom` is in the ancestry (Chrome
 * changed behaviour in 128, Edge/Safari differ again), so hover can land a
 * few percent off the mark — worst at the far corner of a large canvas.
 */
const POINTER_EVENTS = ["click", "dblclick", "mousedown", "mouseup", "mousemove", "contextmenu", "wheel"] as const;

export default function EChart({ option, className, style, registerMaps, onEvents }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const outer = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  /*
   * Self-calibrating pointer correction. `clientX` and getBoundingClientRect()
   * always share one space (the visual viewport), so mapping through their
   * ratio yields the chart's local coordinates no matter how the browser
   * scaled `offsetX`. Runs on the wrapper in the CAPTURE phase, which is
   * guaranteed to precede zrender's own listeners on the inner element; when
   * the two spaces already agree it redefines nothing.
   */
  useEffect(() => {
    const host = outer.current;
    if (!host) return;
    const fix = (e: Event) => {
      const el = ref.current;
      if (!el || !(e instanceof MouseEvent)) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height || !el.clientWidth || !el.clientHeight) return;
      const sx = rect.width / el.clientWidth;
      const sy = rect.height / el.clientHeight;
      const ox = (e.clientX - rect.left) / sx;
      const oy = (e.clientY - rect.top) / sy;
      if (Math.abs(ox - e.offsetX) < 1 && Math.abs(oy - e.offsetY) < 1) return;
      Object.defineProperty(e, "offsetX", { value: ox, configurable: true });
      Object.defineProperty(e, "offsetY", { value: oy, configurable: true });
    };
    for (const type of POINTER_EVENTS) host.addEventListener(type, fix, { capture: true, passive: true });
    return () => {
      for (const type of POINTER_EVENTS) host.removeEventListener(type, fix, { capture: true });
    };
  }, []);

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
    <div ref={outer} className={className} style={{ width: "100%", height: "100%", ...style }}>
      <div ref={ref} className="chart-frame" />
    </div>
  );
}
