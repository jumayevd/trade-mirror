"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { aggregate, DEFAULT_FILTER, meta, type Aggregate, type Direction, type Filter, type SignalClass, type Stage, type ViewMode } from "@/lib/dataset";

interface Ctx {
  filter: Filter;
  patch: (p: Partial<Filter>) => void;
  reset: () => void;
  /** Aggregate for the selected period (snapshot or range). */
  data: Aggregate;
  /** Same filters over the FULL window — for time-series/trend components. */
  series: Aggregate;
}

const FilterCtx = createContext<Ctx | null>(null);

/** URL <-> filter state (spec §4.2/§5.2): applied filters live in the query string. */
function fromSearch(sp: URLSearchParams): Filter {
  const f = { ...DEFAULT_FILTER };
  const num = (k: string) => { const v = sp.get(k); return v == null ? null : Number(v); };
  const str = (k: string) => sp.get(k);
  f.from = num("from") ?? f.from;
  f.to = num("to") ?? f.to;
  if (["positive", "reverse", "absolute", "net"].includes(str("dir") ?? "")) f.direction = str("dir") as Direction;
  if (["all", "high", "core", "transit"].includes(str("view") ?? "")) f.view = str("view") as ViewMode;
  if (["comparable", "residual"].includes(str("stage") ?? "")) f.stage = str("stage") as Stage;
  const cif = num("cif"); if (cif != null && cif >= 0 && cif <= 0.3) f.cif = cif;
  f.country = str("country") ?? f.country;
  f.hs2 = str("hs2") ?? f.hs2;
  f.category = str("cat") ?? f.category;
  const mg = num("min"); if (mg != null && mg >= 0) f.minGap = mg;
  if (["all", "investigate", "verify", "monitor", "low", "transit"].includes(str("sig") ?? "")) f.signal = str("sig") as "all" | SignalClass;
  if (["all", "robust", "sensitive"].includes(str("rob") ?? "")) f.robust = str("rob") as Filter["robust"];
  return f;
}

function toSearch(f: Filter): string {
  const sp = new URLSearchParams();
  const set = (k: string, v: string | number, d: string | number) => { if (v !== d) sp.set(k, String(v)); };
  set("from", f.from, DEFAULT_FILTER.from); set("to", f.to, DEFAULT_FILTER.to);
  set("dir", f.direction, DEFAULT_FILTER.direction); set("view", f.view, DEFAULT_FILTER.view);
  set("stage", f.stage, DEFAULT_FILTER.stage); set("cif", f.cif, DEFAULT_FILTER.cif);
  set("country", f.country, "all"); set("hs2", f.hs2, "all"); set("cat", f.category, "all");
  set("min", f.minGap, DEFAULT_FILTER.minGap); set("sig", f.signal, "all"); set("rob", f.robust, "all");
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function FilterProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [filter, setFilter] = useState<Filter>(() => fromSearch(new URLSearchParams(search?.toString() ?? "")));
  const skipSync = useRef(false);

  // reflect filter changes into the URL (shareable links, spec §5.2)
  useEffect(() => {
    if (skipSync.current) { skipSync.current = false; return; }
    const q = toSearch(filter);
    router.replace(`${pathname}${q}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const value = useMemo<Ctx>(
    () => ({
      filter,
      patch: (p) => setFilter((f) => ({ ...f, ...p })),
      reset: () => setFilter(DEFAULT_FILTER),
      data: aggregate(filter),
      series: aggregate({ ...filter, from: meta.window.start, to: meta.window.end }),
    }),
    [filter],
  );
  return <FilterCtx.Provider value={value}>{children}</FilterCtx.Provider>;
}

export function useFilter(): Ctx {
  const ctx = useContext(FilterCtx);
  if (!ctx) throw new Error("useFilter must be used within FilterProvider");
  return ctx;
}
