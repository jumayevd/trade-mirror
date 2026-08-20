"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import * as echarts from "echarts";
import { readZoom, serverZoom, subscribeZoom } from "@/lib/zoom-store";
import { baseTextStyle } from "@/lib/echartBase";

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
 * Charts inherit the page zoom, so a chart's CSS pixel is `zoom` screen pixels.
 * The backing store has to carry that as well as the device ratio or the canvas
 * is drawn at the smaller size and stretched, which softens every label and
 * hairline. ECharts takes this only at init, so the chart is re-initialised when
 * the reading scale changes.
 */
function bitmapRatio(zoom: number): number {
  if (typeof window === "undefined") return zoom;
  return (window.devicePixelRatio || 1) * zoom;
}

/**
 * Events ECharts hit-tests through `offsetX/Y`. Browsers disagree on which
 * coordinate space those carry once CSS `zoom` is in the ancestry (Chrome
 * changed behaviour in 128, Edge/Safari differ again), so hover can land a
 * few percent off the mark — worst at the far corner of a large canvas.
 *
 * This is every event zrender binds to the chart element, under BOTH of the
 * schemes it chooses between, because it does not choose the one you would
 * expect. zrender picks pointer events when
 *
 *     'onpointerdown' in window && (browser.edge || browser.ie >= 11)
 *
 * and it detects Edge with /Edge?\/([\d.]+)/ — the optional `e` matches
 * `Edg/` too, so every modern Chromium Edge takes the pointer path and reads
 * `pointermove` where Chrome reads `mousemove`. Correcting only the mouse
 * names left hover and clicking uncorrected on Edge, which is the default
 * browser on Windows: the error is the reading scale, so the cursor missed by
 * a quarter of its distance from the chart's left edge and every region
 * resolved to its neighbour. Covering both lists costs nothing on Chrome,
 * where the extra names are simply never dispatched to zrender.
 *
 * zrender's document-level listeners are not here on purpose: those go through
 * its own `calculate` path, which measures with four probe elements and is
 * already zoom-correct.
 */
const POINTER_EVENTS = [
  // shared by both schemes
  "click", "dblclick", "contextmenu", "wheel", "mousewheel",
  // the mouse scheme (Chrome, Firefox, Safari)
  "mousedown", "mouseup", "mousemove", "mouseout",
  // the pointer scheme (Edge, IE11)
  "pointerdown", "pointerup", "pointermove", "pointerout",
] as const;

export default function EChart({ option, className, style, registerMaps, onEvents }: Props) {
  const zoom = useSyncExternalStore(subscribeZoom, readZoom, serverZoom);
  /*
   * The root textStyle is merged in rather than assumed: five of the charts never
   * set one, and without it their unsized text falls back to ECharts' own 12
   * instead of the dashboard's scale. A chart's own textStyle still wins.
   *
   * Sizes are passed through untouched. They used to be multiplied here to make
   * up for the chart frame cancelling the page zoom; the frame no longer does, so
   * the declared size is the size, and canvas text and the DOM tooltip can no
   * longer drift apart.
   */
  const resolved = useMemo(() => ({
    ...option,
    textStyle: { ...baseTextStyle, ...(option.textStyle as object | undefined) },
  }), [option]);
  const ref = useRef<HTMLDivElement>(null);
  const outer = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  /*
   * Handlers are bound to the chart once, at init, but callers rebuild them on
   * every render — RiskMap's click closes over the partner map of the aggregate
   * it was rendered with. Binding the function itself froze that closure: a
   * country that gained data after the chart mounted stayed unclickable until a
   * reload, because the handler still tested the partner set from mount time.
   * The chart gets a stable trampoline instead, and this ref carries whatever
   * the latest render produced.
   */
  const eventsRef = useRef(onEvents);
  useEffect(() => { eventsRef.current = onEvents; });

  /*
   * Which events are bound is part of the chart's identity; which functions
   * serve them is not. Re-initialising on the names alone keeps the binding
   * honest without tearing the chart down every time a filter moves.
   */
  const eventNames = Object.keys(onEvents ?? {}).sort().join(",");

  /*
   * Self-calibrating pointer correction. `clientX` and getBoundingClientRect()
   * always share one space (the visual viewport), so mapping through their
   * ratio yields the chart's local coordinates no matter how the browser
   * scaled `offsetX`. Runs on the wrapper in the CAPTURE phase, which is
   * guaranteed to precede zrender's own listeners on the inner element; when
   * the two spaces already agree it redefines nothing.
   *
   * This is now the only thing keeping hover on the right mark. The chart frame
   * used to cancel the page zoom, which left the two spaces already in agreement
   * and made this a no-op; charts inherit the zoom now, so rect.width /
   * clientWidth is the zoom factor and dividing it out is what lands the cursor
   * on the mark beneath it.
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
      devicePixelRatio: bitmapRatio(zoom),
    });
    chartRef.current = chart;
    chart.setOption(resolved);

    for (const evt of eventNames ? eventNames.split(",") : []) {
      chart.on(evt, (params: unknown) => eventsRef.current?.[evt]?.(params));
    }

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
    // re-init on maps, reading scale or which events are bound; option updates
    // are handled below and handlers are read live through eventsRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerMaps, zoom, eventNames]);

  useEffect(() => {
    chartRef.current?.setOption(resolved, true);
  }, [resolved]);

  return (
    <div ref={outer} className={className} style={{ width: "100%", height: "100%", ...style }}>
      <div ref={ref} className="chart-frame" />
    </div>
  );
}
