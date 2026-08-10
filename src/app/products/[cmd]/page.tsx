import ProductProfileView from "@/components/views/ProductProfileView";
import { products } from "@/lib/dataset";

/** Route shell: prerender params and metadata only. The page body is a client
 *  component so its copy follows the language switcher. */
const PROFILED = products.slice(0, 80);

export function generateStaticParams() {
  return PROFILED.map((p) => ({ cmd: p.cmd }));
}

export async function generateMetadata({ params }: { params: Promise<{ cmd: string }> }) {
  const { cmd } = await params;
  const p = products.find((x) => x.cmd === cmd);
  return { title: p ? `HS ${p.cmd} · ${p.label} — Mirror Trade Analytics` : "Product — Mirror Trade Analytics" };
}

export default async function ProductPage({ params }: { params: Promise<{ cmd: string }> }) {
  const { cmd } = await params;
  return <ProductProfileView cmd={cmd} />;
}
