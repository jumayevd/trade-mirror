"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { aggregate, DEFAULT_FILTER, meta, type Aggregate, type Filter, type SignalClass } from "@/lib/dataset";

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
  const yearsRaw = str("years");
  if (yearsRaw) {
    const picked = yearsRaw.split(",").map(Number).filter((y) => meta.years.includes(y));
    if (picked.length) f.years = [...new Set(picked)].sort((a, b) => a - b);
  }
  const cif = num("cif"); if (cif != null && cif >= 0 && cif <= 0.3) f.cif = cif;
  /** Comma-separated multi-select values; "all" is still accepted from older links. */
  const list = (k: string) => {
    const raw = sp.get(k);
    if (!raw || raw === "all") return null;
    const picked = [...new Set(raw.split(",").map((v) => v.trim()).filter(Boolean))];
    return picked.length ? picked : null;
  };
  f.country = list("country") ?? f.country;
  f.hs2 = list("hs2") ?? f.hs2;
  f.hs4 = list("hs4") ?? f.hs4;
  f.hs6 = list("hs6") ?? f.hs6;
  f.category = str("cat") ?? f.category;
  const mg = num("min"); if (mg != null && mg >= 0) f.minGap = mg;
  if (["all", "investigate", "verify", "monitor", "low", "transit"].includes(str("sig") ?? "")) f.signal = str("sig") as "all" | SignalClass;
  return f;
}

const sameYears = (a: number[], b: number[]) =>
  a.length === b.length && a.every((y, i) => y === b[i]);

function toSearch(f: Filter): string {
  const sp = new URLSearchParams();
  const set = (k: string, v: string | number, d: string | number) => { if (v !== d) sp.set(k, String(v)); };
  if (!sameYears(f.years, DEFAULT_FILTER.years)) sp.set("years", f.years.join(","));
  set("cif", f.cif, DEFAULT_FILTER.cif);
  const setList = (k: string, v: string[]) => { if (v.length) sp.set(k, v.join(",")); };
  setList("country", f.country);
  setList("hs2", f.hs2); setList("hs4", f.hs4); setList("hs6", f.hs6);
  set("cat", f.category, "all");
  set("min", f.minGap, DEFAULT_FILTER.minGap); set("sig", f.signal, "all");
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
      series: aggregate({ ...filter, years: [...meta.years] }),
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
