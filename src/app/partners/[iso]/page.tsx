import PartnerProfileView from "@/components/views/PartnerProfileView";
import { aggregate, DEFAULT_FILTER, meta } from "@/lib/dataset";

/** Route shell: prerender params and metadata only. The page body is a client
 *  component so its copy follows the language switcher. */
const PARTNERS = aggregate({ ...DEFAULT_FILTER, years: [...meta.years], minGap: 0 }).partners;

export function generateStaticParams() {
  return PARTNERS.map((p) => ({ iso: p.iso3.toLowerCase() }));
}

export async function generateMetadata({ params }: { params: Promise<{ iso: string }> }) {
  const { iso } = await params;
  const p = PARTNERS.find((x) => x.iso3 === iso.toUpperCase());
  return { title: p ? `${p.name} — partner profile — Mirror Trade Analytics` : "Partner — Mirror Trade Analytics" };
}

export default async function PartnerPage({ params }: { params: Promise<{ iso: string }> }) {
  const { iso } = await params;
  return <PartnerProfileView iso={iso} />;
}
