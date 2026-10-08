"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { aggregate, ALL_YEARS, DEFAULT_FILTER, needsMonthlyDetail, type Aggregate, type Filter, type RiskBand } from "@/lib/dataset";
import { useMonthlyDetail } from "@/lib/use-monthly-detail";
import { useI18n } from "@/lib/i18n";
import { labelsFor } from "@/lib/labels";

interface Ctx {
  filter: Filter;
  patch: (p: Partial<Filter>) => void;
  reset: () => void;
  /**
   * Bumps when the monthly HS6 detail lands. A page that aggregates the filter
   * itself puts this in its memo key, so it recomputes once the detail arrives.
   */
  detailVer: number;
}

const FilterCtx = createContext<Ctx | null>(null);

/** URL <-> filter state (spec §4.2/§5.2): applied filters live in the query string. */
function fromSearch(sp: URLSearchParams): Filter {
  const f = { ...DEFAULT_FILTER };
  const num = (k: string) => { const v = sp.get(k); return v == null ? null : Number(v); };
  const str = (k: string) => sp.get(k);
  const yearsRaw = str("years");
  // a cleared period travels as "none" — an absent key means the default year
  if (yearsRaw === "none") f.years = [];
  else if (yearsRaw) {
    const picked = yearsRaw.split(",").map(Number).filter((y) => ALL_YEARS.includes(y));
    if (picked.length) f.years = [...new Set(picked)].sort((a, b) => a - b);
  }
  if (sp.get("gran") === "month") f.granularity = "month";
  const monthsRaw = str("months");
  if (monthsRaw) {
    const picked = monthsRaw.split(",").map(Number).filter((m) => m >= 1 && m <= 12);
    if (picked.length) f.months = [...new Set(picked)].sort((x, y) => x - y);
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
  if (["all", "critical", "high", "elevated", "low"].includes(str("band") ?? "")) f.band = str("band") as "all" | RiskBand;
  return f;
}

const sameYears = (a: number[], b: number[]) =>
  a.length === b.length && a.every((y, i) => y === b[i]);

function toSearch(f: Filter): string {
  const sp = new URLSearchParams();
  const set = (k: string, v: string | number, d: string | number) => { if (v !== d) sp.set(k, String(v)); };
  if (!sameYears(f.years, DEFAULT_FILTER.years)) sp.set("years", f.years.length ? f.years.join(",") : "none");
  set("gran", f.granularity, "year");
  if (f.months.length) sp.set("months", f.months.join(","));
  set("cif", f.cif, DEFAULT_FILTER.cif);
  const setList = (k: string, v: string[]) => { if (v.length) sp.set(k, v.join(",")); };
  setList("country", f.country);
  setList("hs2", f.hs2); setList("hs4", f.hs4); setList("hs6", f.hs6);
  set("cat", f.category, "all");
  set("min", f.minGap, DEFAULT_FILTER.minGap); set("band", f.band, "all");
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function FilterProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [filter, setFilter] = useState<Filter>(() => fromSearch(new URLSearchParams(search?.toString() ?? "")));
  const skipSync = useRef(false);
  // monthly HS4/HS6 arrive from an on-demand fetch; recompute when they land
  const detailVer = useMonthlyDetail(filter.granularity === "month" || filter.years.some(needsMonthlyDetail));

  // reflect filter changes into the URL (shareable links, spec §5.2)
  useEffect(() => {
    if (skipSync.current) { skipSync.current = false; return; }
    const q = toSearch(filter);
    router.replace(`${pathname}${q}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  /*
   * The provider sits in the root layout, so anything computed here runs on
   * every page. It used to build two full aggregates eagerly — the filter, and
   * the same filter over every year — on Overview, Methodology and Data Quality
   * alike, which read neither; the all-years one alone froze the page for
   * seconds. Pages now aggregate what they show, themselves (useFilteredData).
   */
  const value = useMemo<Ctx>(
    () => ({
      filter,
      patch: (p) => setFilter((f) => ({ ...f, ...p })),
      reset: () => setFilter(DEFAULT_FILTER),
      detailVer,
    }),
    [filter, detailVer],
  );
  return <FilterCtx.Provider value={value}>{children}</FilterCtx.Provider>;
}

/**
 * The aggregate for the current filter, built only by the page that asks for
 * it. `over` adjusts the filter first (e.g. a rollup level); pass a stable value.
 */
export function useFilteredData(over?: Partial<Filter>): Aggregate {
  const { filter, detailVer } = useFilter();
  const { lang } = useI18n();
  const key = over ? JSON.stringify(over) : "";
  return useMemo(
    () => labelsFor(lang, () => aggregate(over ? { ...filter, ...over } : filter)),
    // `over` is keyed by value; detailVer re-runs it when the monthly detail lands
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter, lang, detailVer, key],
  );
}

export function useFilter(): Ctx {
  const ctx = useContext(FilterCtx);
  if (!ctx) throw new Error("useFilter must be used within FilterProvider");
  return ctx;
}
