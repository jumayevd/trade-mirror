import { Suspense } from "react";
import MonthlyVeil from "@/components/MonthlyVeil";
import { FilterProvider } from "@/lib/filter-context";

/**
 * Mirror Trade pages share one filter state, computed client-side over the
 * bundled trade datasets. Scoping the provider here keeps those datasets — tens
 * of megabytes of JSON — out of every page outside /savdo. The monthly rows
 * load on demand; the veil covers a page waiting for them.
 */
export default function SavdoLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <FilterProvider>
        <div className="relative">
          {children}
          <MonthlyVeil />
        </div>
      </FilterProvider>
    </Suspense>
  );
}
