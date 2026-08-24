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
    id: "gara2018",
    authors: "Gara, M., Giammatteo, M. & Tosti, E.",
    year: "2018",
    title: "Magic mirror in my hand… How trade mirror statistics can help us detect illegal financial flows",
    source: "Bank of Italy Occasional Papers (QEF) No. 445; journal version: The World Economy (2019), 42(11)",
    url: "https://www.bancaditalia.it/pubblicazioni/qef/2018-0445/",
    note: "Mirror screening at country and product level, and the top-share critical band.",
  },
  {
    id: "choi2019",
    authors: "Choi, Y. S.",
    year: "2019",
    title: "Identifying trade mis-invoicing through customs data analysis",
    source: "World Customs Journal, 13(2)",
    note: "The direction filter and the exclusion of unmatched flows.",
  },
  {
    id: "berger2008",
    authors: "Berger, H. & Nitsch, V.",
    year: "2008",
    title: "Gotcha! A Profile of Smuggling in International Trade",
    source: "CESifo Working Paper No. 2475",
    note: "Which countries and products carry trade-gap smuggling.",
  },
  {
    id: "nitsch2016",
    authors: "Nitsch, V.",
    year: "2016",
    title: "Trillion Dollar Estimate: Illicit Financial Flows from Developing Countries",
    source: "Darmstadt Discussion Papers in Economics No. 227",
    note: "Why gap totals are not an illicit-flow estimate.",
  },
  {
    id: "farhad2019",
    authors: "Farhad, M., Jetter, M., Siddique, A. & Williams, A.",
    year: "2019",
    title: "Misreported Trade",
    source: "ESCoE Discussion Paper 2019-13",
    note: "Misreporting repeats in the same product lines, which is what persistence scores.",
  },
  {
    id: "mundlak1978",
    authors: "Mundlak, Y.",
    year: "1978",
    title: "On the Pooling of Time Series and Cross Section Data",
    source: "Econometrica, 46(1), 69–85",
    note: "The cluster-mean term that relaxes the random-effects orthogonality assumption.",
  },
  {
    id: "robinson1991",
    authors: "Robinson, G. K.",
    year: "1991",
    title: "That BLUP is a Good Thing: The Estimation of Random Effects",
    source: "Statistical Science, 6(1), 15–32",
    note: "Why a thin cluster's estimate is shrunk toward the mean, and by how much.",
  },
  {
    id: "goldstein1996",
    authors: "Goldstein, H. & Spiegelhalter, D. J.",
    year: "1996",
    title: "League Tables and Their Limitations: Statistical Issues in Comparisons of Institutional Performance",
    source: "Journal of the Royal Statistical Society, Series A, 159(3), 385–443",
    note: "Ranking units on shrunken estimates with overlapping intervals — the caterpillar plot and the two-tier rule.",
  },
  {
    id: "mayer2011",
    authors: "Mayer, T. & Zignago, S.",
    year: "2011",
    title: "Notes on CEPII’s Distances Measures: the GeoDist Database",
    source: "CEPII Working Paper 2011-25",
    url: "http://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=6",
    note: "Bilateral distance, contiguity and landlocked status for the freight step.",
  },
  {
    id: "laplace1812",
    authors: "Laplace, P.-S.",
    year: "1812",
    title: "Théorie analytique des probabilités",
    source: "Courcier, Paris",
    note: "The rule of succession, (k + 1) / (n + 2) — the persistence term.",
  },
  {
    id: "undp2010",
    authors: "United Nations Development Programme",
    year: "2010",
    title: "Human Development Report 2010: The Real Wealth of Nations",
    source: "UNDP, New York",
    url: "https://hdr.undp.org/content/human-development-report-2010",
    note: "Geometric aggregation of partly substitutable components, as in the HDI.",
  },
  {
    id: "bhagwati1964",
    authors: "Bhagwati, J.",
    year: "1964",
    title: "On the Underinvoicing of Imports",
    source: "Bulletin of the Oxford University Institute of Economics and Statistics, 27(4)",
    note: "The founding paper of partner-country trade comparison.",
  },
  {
    id: "yeats1990",
    authors: "Yeats, A.",
    year: "1990",
    title: "On the Accuracy of Economic Observations: Do Sub-Saharan Trade Statistics Mean Anything?",
    source: "World Bank Economic Review, 4(2)",
    note: "Reporting quality must be judged before a gap is interpreted.",
  },
  {
    id: "hummels2006",
    authors: "Hummels, D. & Lugovskyy, V.",
    year: "2006",
    title: "Are Matched Partner Trade Statistics a Usable Measure of Transportation Costs?",
    source: "Review of International Economics, 14(1)",
    note: "The CIF/FOB wedge is commodity-dependent — hence a freight band, not a rate.",
  },
  {
    id: "gaulier2010",
    authors: "Gaulier, G. & Zignago, S.",
    year: "2010",
    title: "BACI: International Trade Database at the Product-Level",
    source: "CEPII Working Paper 2010-23",
    url: "https://www.cepii.fr/CEPII/en/publications/wp/abstract.asp?NoDoc=2726",
    note: "Standard practice for reconciling CIF imports with FOB exports.",
  },
  {
    id: "fisman2004",
    authors: "Fisman, R. & Wei, S.-J.",
    year: "2004",
    title: "Tax Rates and Tax Evasion: Evidence from “Missing Imports” in China",
    source: "Journal of Political Economy, 112(2)",
    note: "Gaps that rise with the tax burden — the planned tariff module.",
  },
  {
    id: "javorcik2008",
    authors: "Javorcik, B. & Narciso, G.",
    year: "2008",
    title: "Differentiated Products and Evasion of Import Tariffs",
    source: "Journal of International Economics, 76(2)",
    note: "Under-valuation hides in differentiated goods, which needs price data this extract lacks.",
  },
  {
    id: "ferrantino2008",
    authors: "Ferrantino, M. & Wang, Z.",
    year: "2008",
    title: "Accounting for Discrepancies in Bilateral Trade: The Case of China, Hong Kong, and the United States",
    source: "China Economic Review, 19(3)",
    note: "Re-export routing creates large legitimate gaps — why transit hubs are tagged.",
  },
  {
    id: "buehn2011",
    authors: "Buehn, A. & Eichler, S.",
    year: "2011",
    title: "Trade Misinvoicing: The Dark Side of World Trade",
    source: "The World Economy, 34(8)",
    note: "Positive and reverse discrepancies are distinct, so net gaps are never the headline.",
  },
  {
    id: "carrere2015",
    authors: "Carrère, C. & Grigoriou, C.",
    year: "2015",
    title: "Can Mirror Data Help to Capture Informal International Trade?",
    source: "FERDI Working Paper P123",
    url: "https://ferdi.fr/dl/df-6iH6FxjdWS8K1vAs43xfqnwQ/ferdi-p123-can-mirror-data-help-to-capture-informal-international-trade.pdf",
    note: "Mirror data as a window onto informal trade, with coverage caveats.",
  },
  {
    id: "kellenberg2019",
    authors: "Kellenberg, D. & Levinson, A.",
    year: "2019",
    title: "Misreporting Trade: Tariff Evasion, Corruption, and Auditing Standards",
    source: "Review of International Economics, 27(1)",
    note: "Mirror gaps track institutions and audit standards across countries.",
  },
  {
    id: "oecdjrc2008",
    authors: "OECD & European Commission Joint Research Centre",
    year: "2008",
    title: "Handbook on Constructing Composite Indicators: Methodology and User Guide",
    source: "OECD Publishing, Paris",
    url: "https://doi.org/10.1787/9789264043466-en",
    note: "Rank normalisation before aggregation, and geometric means to limit compensability.",
  },
  {
    id: "wco2011",
    authors: "World Customs Organization",
    year: "2011",
    title: "Customs Risk Management Compendium",
    source: "WCO, Brussels",
    note: "Customs practice: a composite score ranks targets, it never concludes.",
  },
  {
    id: "unsd2019",
    authors: "United Nations Statistics Division",
    year: "2019",
    title: "Guidelines on the Analysis and Reduction of Bilateral Trade Asymmetries",
    source: "UNSD, New York",
    url: "https://comtradeapi.un.org/files/v1/app/wiki/Guidelines_on_Analyzing_and_Reducing_Bilateral_Asymmetry-23_Apr_2019.pdf",
    note: "The official taxonomy of legitimate asymmetry causes.",
  },
  {
    id: "imf2023",
    authors: "International Monetary Fund",
    year: "2023",
    title: "The Use of Mirror Data by Customs Administrations: From Principles to Practice",
    source: "IMF Technical Notes and Manuals 2023/005",
    url: "https://www.imf.org/en/publications/tnm/issues/2023/09/26/the-use-of-mirror-data-by-customs-administrations-fromprinciplestopractice-537562",
    note: "How customs administrations run mirror analysis for risk screening.",
  },
  {
    id: "medina2018",
    authors: "Medina, L. & Schneider, F.",
    year: "2018",
    title: "Shadow Economies Around the World: What Did We Learn Over the Last 20 Years?",
    source: "IMF Working Paper 18/17",
    url: "https://www.imf.org/en/Publications/WP/Issues/2018/01/25/Shadow-Economies-Around-the-World-What-Did-We-Learn-Over-the-Last-20-Years-45583",
    note: "Shadow-economy size needs structural methods; a mirror gap is one input signal.",
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
      className="cursor-help whitespace-nowrap text-[12px] text-faint"
      title={refs.map((r) => `${r.authors} (${r.year}). ${r.title}. ${r.source}.`).join("\n")}
    >
      {" "}({refs.map(short).join("; ")})
    </span>
  );
}
