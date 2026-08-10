import ChannelProfileView from "@/components/views/ChannelProfileView";
import { aggregate, DEFAULT_FILTER, meta } from "@/lib/dataset";

/** Route shell: prerender params and metadata only. The page body is a client
 *  component so its copy follows the language switcher. */
const CHANNELS = aggregate({ ...DEFAULT_FILTER, years: [...meta.years], minGap: 0 }).channels6;

export function generateStaticParams() {
  return [...CHANNELS]
    .sort((a, b) => Math.abs(b.primary) - Math.abs(a.primary))
    .slice(0, 150)
    .map((c) => ({ iso: c.partnerIso.toLowerCase(), cmd: c.cmd }));
}

export async function generateMetadata({ params }: { params: Promise<{ iso: string; cmd: string }> }) {
  const { iso, cmd } = await params;
  return { title: `Channel ${iso.toUpperCase()} × ${cmd} — Mirror Trade Analytics` };
}

export default async function ChannelPage({ params }: { params: Promise<{ iso: string; cmd: string }> }) {
  const { iso, cmd } = await params;
  return <ChannelProfileView iso={iso} cmd={cmd} />;
}
