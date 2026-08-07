/**
 * Research bibliography for the dashboard. Every method component cites its
 * source literature via <Cite ids=[...]/>; the full list renders on the
 * Methodology page. This grounds the platform in the mirror-statistics and
 * shadow-economy research tradition without ever claiming that a mirror gap
 * measures the shadow economy.
 */

export interface Ref {
  id: string;
  authors: string;
  year: string;
  title: string;
  source: string;
  url?: string;
  note: string; // what this work grounds in OUR method
}

export const REFERENCES: Ref[] = [
  {
    id: "bhagwati1964",
    authors: "Bhagwati, J.",
    year: "1964",
    title: "On the Underinvoicing of Imports",
    source: "Bulletin of the Oxford University Institute of Economics and Statistics, 27(4)",
    note: "The founding paper of partner-country trade comparison: systematic import–export gaps as evidence consistent with misinvoicing.",
  },
  {
    id: "yeats1990",
    authors: "Yeats, A.",
    year: "1990",
    title: "On the Accuracy of Economic Observations: Do Sub-Saharan Trade Statistics Mean Anything?",
    source: "World Bank Economic Review, 4(2)",
    note: "Why raw mirror gaps overstate irregularities — reporting quality must be assessed before interpretation (our evidence-quality score).",
  },
  {
    id: "hummels2006",
    authors: "Hummels, D. & Lugovskyy, V.",
    year: "2006",
    title: "Are Matched Partner Trade Statistics a Usable Measure of Transportation Costs?",
    source: "Review of International Economics, 14(1)",
    note: "The CIF/FOB wedge between matched mirrors is noisy and commodity-dependent — the reason we show a 6–15% scenario band rather than one rate.",
  },
  {
    id: "gaulier2010",
    authors: "Gaulier, G. & Zignago, S.",
    year: "2010",
    title: "BACI: International Trade Database at the Product-Level",
    source: "CEPII Working Paper 2010-23",
    url: "https://www.cepii.fr/CEPII/en/publications/wp/abstract.asp?NoDoc=2726",
    note: "Standard practice for reconciling CIF imports with FOB exports at product level; motivates our expected-CIF construction.",
  },
  {
    id: "fisman2004",
    authors: "Fisman, R. & Wei, S.-J.",
    year: "2004",
    title: "Tax Rates and Tax Evasion: Evidence from “Missing Imports” in China",
    source: "Journal of Political Economy, 112(2)",
    note: "The behavioural test: gaps that grow with the tax burden are consistent with evasion incentives — the design of our planned phase-2 tariff module.",
  },
  {
    id: "javorcik2008",
    authors: "Javorcik, B. & Narciso, G.",
    year: "2008",
    title: "Differentiated Products and Evasion of Import Tariffs",
    source: "Journal of International Economics, 76(2)",
    note: "Under-valuation concentrates in differentiated goods where prices are hard to verify — why unit-value checks matter (our value/quantity component).",
  },
  {
    id: "ferrantino2008",
    authors: "Ferrantino, M. & Wang, Z.",
    year: "2008",
    title: "Accounting for Discrepancies in Bilateral Trade: The Case of China, Hong Kong, and the United States",
    source: "China Economic Review, 19(3)",
    note: "Re-export and transit routing create large legitimate mirror gaps — the basis for our transit-sensitive classification.",
  },
  {
    id: "buehn2011",
    authors: "Buehn, A. & Eichler, S.",
    year: "2011",
    title: "Trade Misinvoicing: The Dark Side of World Trade",
    source: "The World Economy, 34(8)",
    note: "Separating positive and reverse discrepancies as distinct phenomena — the reason net gaps are never our headline.",
  },
  {
    id: "carrere2015",
    authors: "Carrère, C. & Grigoriou, C.",
    year: "2015",
    title: "Can Mirror Data Help to Capture Informal International Trade?",
    source: "FERDI Working Paper P123",
    url: "https://ferdi.fr/dl/df-6iH6FxjdWS8K1vAs43xfqnwQ/ferdi-p123-can-mirror-data-help-to-capture-informal-international-trade.pdf",
    note: "Mirror statistics as a window onto informal trade — with strict caveats on coverage and valuation that our stages implement.",
  },
  {
    id: "kellenberg2019",
    authors: "Kellenberg, D. & Levinson, A.",
    year: "2019",
    title: "Misreporting Trade: Tariff Evasion, Corruption, and Auditing Standards",
    source: "Review of International Economics, 27(1)",
    note: "Cross-country evidence that mirror gaps correlate with institutions and audit standards at the country level.",
  },
  {
    id: "oecdjrc2008",
    authors: "OECD & European Commission Joint Research Centre",
    year: "2008",
    title: "Handbook on Constructing Composite Indicators: Methodology and User Guide",
    source: "OECD Publishing, Paris",
    url: "https://doi.org/10.1787/9789264043466-en",
    note: "The aggregation theory behind the risk score: geometric means limit compensability, so a weak evidence base caps the composite instead of being averaged away.",
  },
  {
    id: "wco2011",
    authors: "World Customs Organization",
    year: "2011",
    title: "Customs Risk Management Compendium",
    source: "WCO, Brussels",
    note: "Customs risk-selectivity practice: composite scores rank targets for review — a score triggers scrutiny, never a conclusion. The operational frame for R.",
  },
  {
    id: "unsd2019",
    authors: "United Nations Statistics Division",
    year: "2019",
    title: "Guidelines on the Analysis and Reduction of Bilateral Trade Asymmetries",
    source: "UNSD, New York",
    url: "https://comtradeapi.un.org/files/v1/app/wiki/Guidelines_on_Analyzing_and_Reducing_Bilateral_Asymmetry-23_Apr_2019.pdf",
    note: "The official taxonomy of legitimate asymmetry causes (trade system, partner attribution, timing, confidentiality) used in our checklists.",
  },
  {
    id: "imf2023",
    authors: "International Monetary Fund",
    year: "2023",
    title: "The Use of Mirror Data by Customs Administrations: From Principles to Practice",
    source: "IMF Technical Notes and Manuals 2023/005",
    url: "https://www.imf.org/en/publications/tnm/issues/2023/09/26/the-use-of-mirror-data-by-customs-administrations-fromprinciplestopractice-537562",
    note: "How customs administrations operationalize mirror analysis for risk screening — the institutional template for our investigation queue.",
  },
  {
    id: "gfi2021",
    authors: "Global Financial Integrity",
    year: "2021",
    title: "Trade-Related Illicit Financial Flows in 134 Developing Countries 2009–2018",
    source: "GFI, Washington DC",
    url: "https://gfintegrity.org/report/trade-related-illicit-financial-flows-in-134-developing-countries-2009-2018/",
    note: "The gross (positive + reverse, never netted) aggregation convention for value gaps that our totals follow.",
  },
  {
    id: "medina2018",
    authors: "Medina, L. & Schneider, F.",
    year: "2018",
    title: "Shadow Economies Around the World: What Did We Learn Over the Last 20 Years?",
    source: "IMF Working Paper 18/17",
    url: "https://www.imf.org/en/Publications/WP/Issues/2018/01/25/Shadow-Economies-Around-the-World-What-Did-We-Learn-Over-the-Last-20-Years-45583",
    note: "Shadow-economy measurement requires structural methods; trade mirror gaps are one input signal, never the measure itself — our central caveat.",
  },
  {
    id: "wits",
    authors: "World Bank",
    year: "n.d.",
    title: "Imports, Exports and Mirror Data (WITS Help)",
    source: "World Integrated Trade Solution",
    url: "https://wits.worldbank.org/wits/wits/witshelp/content/data_retrieval/T/Intro/B2.Imports_Exports_and_Mirror.htm",
    note: "Practical guidance on using partner (mirror) data when own reporting is incomplete — the rationale for the partner-side baseline.",
  },
];

const byId = new Map(REFERENCES.map((r) => [r.id, r]));

function short(r: Ref): string {
  const name = r.authors.split(",")[0].split("&")[0].trim();
  return `${name} ${r.year}`;
}

/** Inline citation: quiet superscript-style source note with full titles on hover. */
export function Cite({ ids }: { ids: string[] }) {
  const refs = ids.map((i) => byId.get(i)).filter((r): r is Ref => !!r);
  if (refs.length === 0) return null;
  return (
    <span
      className="cursor-help whitespace-nowrap text-[11px] text-faint"
      title={refs.map((r) => `${r.authors} (${r.year}). ${r.title}. ${r.source}.`).join("\n")}
    >
      {" "}({refs.map(short).join("; ")})
    </span>
  );
}
