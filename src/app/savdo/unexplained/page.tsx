import { notFound } from "next/navigation";
import AnomalyView from "@/components/views/AnomalyView";
import { SHOW_UNEXPLAINED } from "@/lib/flags";

/*
 * Hidden from the deployed dashboard while the section is being finished; the
 * address is also redirected away in next.config.ts. Both are deliberate:
 * hiding only the sidebar entry would leave the page a typed URL away, and a
 * prerendered notFound() still answers 200 with whatever title it exports.
 * Generating the metadata keeps the section's name out of that response.
 */
export function generateMetadata() {
  return SHOW_UNEXPLAINED
    ? { title: "Unexplained Discrepancy Analysis - Mirror Trade Analytics" }
    : {};
}

export default function UnexplainedPage() {
  if (!SHOW_UNEXPLAINED) notFound();
  return <AnomalyView />;
}
