/**
 * Trade Mirror — methodology configuration
 * ----------------------------------------
 * "Mirror statistics" compares what Uzbekistan reports against what its trading
 * partners report for the SAME bilateral flow. Large, persistent, one-directional
 * gaps (beyond the known CIF/FOB valuation wedge) are fingerprints of smuggling,
 * customs under-valuation, tariff/VAT evasion, and trade mis-invoicing.
 *
 * Note: Uzbekistan has historically been a sparse/late reporter to UN Comtrade,
 * while its major partners (China, Russia, Korea, etc.) report consistently.
 * That asymmetry is exactly why mirror analysis is the right lens here — partner
 * data fills the gaps in Uzbekistan's own declarations.
 */

/** Uzbekistan — M49 / Comtrade area code. */
export const UZBEKISTAN = { code: "860", iso3: "UZB", name: "Uzbekistan" } as const;

/**
 * CIF/FOB wedge. Imports are valued CIF (incl. cost, insurance, freight); exports
 * FOB. So an HONEST importer reports ~8–15% ABOVE the partner's FOB export figure.
 * We use 10% as the central estimate to compute the "expected" import value and
 * isolate the anomalous portion of any gap. (World Bank / IMF convention.)
 */
export const CIF_FOB_FACTOR = 0.10;

/** CIF/FOB sensitivity band — central 10%, robustness range 5–15%, all offered in the UI. */
export const CIF_BAND = { low: 0.05, central: 0.10, high: 0.15 } as const;

/**
 * Re-export / transit hubs. Uzbekistan attributes imports to country of ORIGIN, not
 * consignment, so goods routed through these hubs can show phantom gaps. Bucketed
 * separately and excluded from the headline "core" estimate. KAZ is the main
 * land-transit corridor (also a direct neighbour — noted in the UI).
 */
export const TRANSIT_HUBS = new Set(["ARE", "CHE", "GBR", "SGP", "KAZ"]);

/**
 * HS sections — group the 2-digit chapters into economic categories for filtering
 * and grouping. Ranges are inclusive 2-digit chapter numbers.
 */
export const HS_SECTIONS: { key: string; label: string; from: number; to: number }[] = [
  { key: "agri", label: "Agriculture & food", from: 1, to: 24 },
  { key: "minerals", label: "Minerals & fuels", from: 25, to: 27 },
  { key: "chemicals", label: "Chemicals & pharma", from: 28, to: 38 },
  { key: "plastics", label: "Plastics & rubber", from: 39, to: 40 },
  { key: "hides", label: "Hides, wood & paper", from: 41, to: 49 },
  { key: "textiles", label: "Textiles & apparel", from: 50, to: 63 },
  { key: "footwear", label: "Footwear & headgear", from: 64, to: 67 },
  { key: "stone", label: "Stone, glass & ceramics", from: 68, to: 70 },
  { key: "precious", label: "Precious metals & stones", from: 71, to: 71 },
  { key: "metals", label: "Base metals & articles", from: 72, to: 83 },
  { key: "machinery", label: "Machinery & electronics", from: 84, to: 85 },
  { key: "transport", label: "Vehicles & transport", from: 86, to: 89 },
  { key: "instruments", label: "Instruments & misc.", from: 90, to: 97 },
  { key: "residual", label: "Unspecified / residual", from: 98, to: 99 },
];
export function categoryFor(chapter: string): { key: string; label: string } {
  const n = parseInt(chapter, 10);
  const s = HS_SECTIONS.find((x) => n >= x.from && n <= x.to);
  return s ? { key: s.key, label: s.label } : { key: "other", label: "Other" };
}

/** Comtrade flow codes. */
export const FLOW = { IMPORT: "M", EXPORT: "X" } as const;

export type Region =
  | "East Asia"
  | "Central Asia"
  | "Russia & CIS"
  | "Europe"
  | "Middle East"
  | "South Asia"
  | "Americas";

export interface Partner {
  /** Comtrade / M49 numeric area code (verified against the live reference at fetch time). */
  code: string;
  iso3: string;
  name: string;
  region: Region;
  /** Known precious-metal / re-export hub — relevant to the export under-invoicing story. */
  goldHub?: boolean;
}

/**
 * Curated partner set. Covers the overwhelming majority of Uzbekistan's two-way
 * trade plus the precious-metal re-export hubs (CH, AE, GB) that matter for the
 * export / capital-flight narrative. Codes are M49; the fetcher reconciles them
 * against Comtrade's live partnerAreas reference and auto-corrects mismatches.
 */
export const PARTNERS: Partner[] = [
  { code: "156", iso3: "CHN", name: "China", region: "East Asia" },
  { code: "643", iso3: "RUS", name: "Russia", region: "Russia & CIS" },
  { code: "398", iso3: "KAZ", name: "Kazakhstan", region: "Central Asia" },
  { code: "410", iso3: "KOR", name: "South Korea", region: "East Asia" },
  { code: "792", iso3: "TUR", name: "Türkiye", region: "Middle East" },
  { code: "276", iso3: "DEU", name: "Germany", region: "Europe" },
  { code: "417", iso3: "KGZ", name: "Kyrgyzstan", region: "Central Asia" },
  { code: "795", iso3: "TKM", name: "Turkmenistan", region: "Central Asia" },
  { code: "762", iso3: "TJK", name: "Tajikistan", region: "Central Asia" },
  { code: "4", iso3: "AFG", name: "Afghanistan", region: "South Asia" },
  { code: "364", iso3: "IRN", name: "Iran", region: "Middle East" },
  { code: "699", iso3: "IND", name: "India", region: "South Asia" },
  { code: "392", iso3: "JPN", name: "Japan", region: "East Asia" },
  { code: "842", iso3: "USA", name: "USA", region: "Americas" },
  { code: "440", iso3: "LTU", name: "Lithuania", region: "Europe" },
  { code: "428", iso3: "LVA", name: "Latvia", region: "Europe" },
  { code: "112", iso3: "BLR", name: "Belarus", region: "Russia & CIS" },
  { code: "804", iso3: "UKR", name: "Ukraine", region: "Russia & CIS" },
  { code: "31", iso3: "AZE", name: "Azerbaijan", region: "Russia & CIS" },
  { code: "268", iso3: "GEO", name: "Georgia", region: "Russia & CIS" },
  { code: "784", iso3: "ARE", name: "United Arab Emirates", region: "Middle East", goldHub: true },
  // NB: Comtrade DATA uses the statistical-area codes 757/251/842 (CHE incl. LIE,
  // FRA incl. MCO, USA incl. PR/VI) — the plain M49 codes 756/250/841 return zero rows.
  { code: "757", iso3: "CHE", name: "Switzerland", region: "Europe", goldHub: true },
  { code: "826", iso3: "GBR", name: "United Kingdom", region: "Europe", goldHub: true },
  { code: "251", iso3: "FRA", name: "France", region: "Europe" },
  { code: "380", iso3: "ITA", name: "Italy", region: "Europe" },
  { code: "528", iso3: "NLD", name: "Netherlands", region: "Europe" },
  { code: "616", iso3: "POL", name: "Poland", region: "Europe" },
  { code: "702", iso3: "SGP", name: "Singapore", region: "East Asia", goldHub: true },
  { code: "704", iso3: "VNM", name: "Vietnam", region: "East Asia" },
];

export interface HsChapter {
  /** 2-digit HS chapter. */
  chapter: string;
  label: string;
  /** High-risk / high-value: drill to 4-digit detail and spotlight in the UI. */
  highRisk?: boolean;
  /** 4-digit HS headings to pull when this chapter is high-risk. */
  drill?: { code: string; label: string }[];
}

/**
 * High-risk chapters get 4-digit drill-down. These are the categories most
 * associated with mis-invoicing in the literature for resource exporters like
 * Uzbekistan: precious metals (gold), vehicles, electronics, machinery, cotton,
 * fuels/gas, pharma, steel, instruments, tobacco, spirits, aluminium.
 */
export const HIGH_RISK_CHAPTERS: HsChapter[] = [
  {
    chapter: "71",
    label: "Precious metals & stones (gold)",
    highRisk: true,
    drill: [
      { code: "7108", label: "Gold (unwrought/semi-mfd)" },
      { code: "7106", label: "Silver" },
      { code: "7102", label: "Diamonds" },
      { code: "7110", label: "Platinum group" },
      { code: "7113", label: "Jewellery of precious metal" },
    ],
  },
  {
    chapter: "87",
    label: "Vehicles",
    highRisk: true,
    drill: [
      { code: "8703", label: "Cars & passenger vehicles" },
      { code: "8704", label: "Goods/trucks" },
      { code: "8708", label: "Vehicle parts" },
      { code: "8711", label: "Motorcycles" },
    ],
  },
  {
    chapter: "85",
    label: "Electrical machinery & electronics",
    highRisk: true,
    drill: [
      { code: "8517", label: "Phones & telecom" },
      { code: "8528", label: "Monitors & TVs" },
      { code: "8542", label: "Integrated circuits" },
      { code: "8507", label: "Batteries" },
      { code: "8504", label: "Transformers/converters" },
    ],
  },
  {
    chapter: "84",
    label: "Machinery & mechanical appliances",
    highRisk: true,
    drill: [
      { code: "8471", label: "Computers & data machines" },
      { code: "8473", label: "Computer parts" },
      { code: "8418", label: "Refrigeration" },
      { code: "8413", label: "Pumps" },
    ],
  },
  {
    chapter: "52",
    label: "Cotton",
    highRisk: true,
    drill: [
      { code: "5201", label: "Raw cotton" },
      { code: "5205", label: "Cotton yarn" },
      { code: "5208", label: "Woven cotton fabric" },
    ],
  },
  {
    chapter: "27",
    label: "Mineral fuels & gas",
    highRisk: true,
    drill: [
      { code: "2709", label: "Crude petroleum" },
      { code: "2710", label: "Refined petroleum" },
      { code: "2711", label: "Petroleum gas (incl. natural gas)" },
    ],
  },
  {
    chapter: "30",
    label: "Pharmaceuticals",
    highRisk: true,
    drill: [{ code: "3004", label: "Medicaments (packaged)" }],
  },
  {
    chapter: "72",
    label: "Iron & steel",
    highRisk: true,
    drill: [
      { code: "7208", label: "Hot-rolled flat steel" },
      { code: "7210", label: "Coated flat steel" },
    ],
  },
  {
    chapter: "90",
    label: "Optical, medical & precision instruments",
    highRisk: true,
    drill: [
      { code: "9018", label: "Medical instruments" },
      { code: "9027", label: "Lab/analysis instruments" },
    ],
  },
  {
    chapter: "24",
    label: "Tobacco",
    highRisk: true,
    drill: [{ code: "2402", label: "Cigarettes & cigars" }],
  },
  {
    chapter: "22",
    label: "Beverages & spirits",
    highRisk: true,
    drill: [{ code: "2208", label: "Spirits & liquors" }],
  },
  {
    chapter: "76",
    label: "Aluminium",
    highRisk: true,
    drill: [{ code: "7601", label: "Unwrought aluminium" }],
  },
];

/** Short human labels for every 2-digit HS chapter (for the heatmap / leaderboard). */
export const CHAPTER_LABELS: Record<string, string> = {
  "01": "Live animals", "02": "Meat", "03": "Fish", "04": "Dairy & eggs",
  "05": "Animal products nes", "06": "Live plants", "07": "Vegetables", "08": "Fruit & nuts",
  "09": "Coffee, tea & spices", "10": "Cereals", "11": "Milling products", "12": "Oil seeds",
  "13": "Gums & resins", "14": "Vegetable plaiting", "15": "Fats & oils", "16": "Prepared meat/fish",
  "17": "Sugar", "18": "Cocoa", "19": "Cereal preparations", "20": "Prepared vegetables/fruit",
  "21": "Misc edible preps", "22": "Beverages & spirits", "23": "Animal feed", "24": "Tobacco",
  "25": "Salt, earths & stone", "26": "Ores & ash", "27": "Mineral fuels & gas",
  "28": "Inorganic chemicals", "29": "Organic chemicals", "30": "Pharmaceuticals",
  "31": "Fertilizers", "32": "Dyes & pigments", "33": "Cosmetics & oils", "34": "Soaps & waxes",
  "35": "Albuminoids & glues", "36": "Explosives", "37": "Photographic goods", "38": "Misc chemicals",
  "39": "Plastics", "40": "Rubber", "41": "Raw hides & skins", "42": "Leather articles",
  "43": "Furskins", "44": "Wood", "45": "Cork", "46": "Straw & basketware", "47": "Wood pulp",
  "48": "Paper & paperboard", "49": "Printed books", "50": "Silk", "51": "Wool",
  "52": "Cotton", "53": "Other vegetable fibres", "54": "Man-made filaments",
  "55": "Man-made staple fibres", "56": "Wadding & nonwovens", "57": "Carpets",
  "58": "Special woven fabrics", "59": "Coated textiles", "60": "Knitted fabrics",
  "61": "Knitted apparel", "62": "Woven apparel", "63": "Made-up textiles", "64": "Footwear",
  "65": "Headgear", "66": "Umbrellas", "67": "Feathers & artificial flowers",
  "68": "Stone & cement articles", "69": "Ceramics", "70": "Glass",
  "71": "Precious metals & stones", "72": "Iron & steel", "73": "Iron/steel articles",
  "74": "Copper", "75": "Nickel", "76": "Aluminium", "78": "Lead", "79": "Zinc", "80": "Tin",
  "81": "Other base metals", "82": "Tools & cutlery", "83": "Misc base metal articles",
  "84": "Machinery", "85": "Electrical machinery", "86": "Railway", "87": "Vehicles",
  "88": "Aircraft", "89": "Ships", "90": "Precision instruments", "91": "Clocks & watches",
  "92": "Musical instruments", "93": "Arms & ammunition", "94": "Furniture & bedding",
  "95": "Toys & sports", "96": "Misc manufactured articles", "97": "Art & antiques",
  "98": "Special classification", "99": "Unspecified commodities",
};

/** All 2-digit HS chapters (01–97, excluding reserved 77). */
export const ALL_CHAPTERS: string[] = Object.keys(CHAPTER_LABELS);

/** Years pulled from Comtrade (fetch range). */
export const ANNUAL_YEARS: number[] = Array.from(
  { length: 2024 - 2010 + 1 },
  (_, i) => 2010 + i,
);

/**
 * Valid analysis window. Uzbekistan only began reporting to UN Comtrade in 2017, so
 * mirror gaps are meaningless before then (UZB side is simply absent). 2025 is annual-
 * incomplete (monthly only). All gap aggregates are restricted to this window.
 */
export const ANALYSIS_START_YEAR = 2017;
export const ANALYSIS_END_YEAR = 2024;
export const ANALYSIS_YEARS: number[] = ANNUAL_YEARS.filter(
  (y) => y >= ANALYSIS_START_YEAR && y <= ANALYSIS_END_YEAR,
);

/** Recent years to also pull at monthly frequency (for momentum / latest signal). */
export const MONTHLY_YEARS: number[] = [2023, 2024, 2025];

/** UN Comtrade API constants. */
export const COMTRADE = {
  /** Authenticated endpoint (requires subscription key). */
  authBase: "https://comtradeapi.un.org/data/v1/get",
  /** Public preview endpoint — no key, capped at 500 rows. Used for dev before a key is set. */
  previewBase: "https://comtradeapi.un.org/public/v1/preview",
  /** Reference data (public, no key). */
  reference: {
    partnerAreas: "https://comtradeapi.un.org/files/v1/app/reference/partnerAreas.json",
    reporters: "https://comtradeapi.un.org/files/v1/app/reference/Reporters.json",
  },
  typeCode: "C", // commodities
  clCode: "HS", // Harmonized System
  /** Max periods per request (annual: 12; monthly: 12 within a single call). */
  maxPeriodsPerCall: 12,
  /** Free-tier record cap per call. */
  maxRecordsPerCall: 100000,
} as const;

/** Helper: split an array into chunks of size n. */
export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** All high-risk 4-digit drill codes, flattened. */
export const DRILL_CODES: { code: string; label: string; chapter: string }[] =
  HIGH_RISK_CHAPTERS.flatMap((c) =>
    (c.drill ?? []).map((d) => ({ ...d, chapter: c.chapter })),
  );

/** Preferred short names; the workbook uses long UN designations. */
export const NAME_OVERRIDES: Record<string, string> = {
  RUS: "Russia", KOR: "South Korea", USA: "USA", HKG: "Hong Kong SAR",
  IRN: "Iran", VNM: "Vietnam", MDA: "Moldova", TZA: "Tanzania",
  BOL: "Bolivia", PSE: "Palestine", BIH: "Bosnia & Herzegovina",
  GBR: "United Kingdom", ARE: "United Arab Emirates", CZE: "Czechia",
};

export const REGION_BY_ISO: Record<string, string> = {
  // Central Asia
  KAZ: "Central Asia", KGZ: "Central Asia", TJK: "Central Asia", TKM: "Central Asia",
  // Russia & CIS
  RUS: "Russia & CIS", BLR: "Russia & CIS", UKR: "Russia & CIS", AZE: "Russia & CIS",
  GEO: "Russia & CIS", ARM: "Russia & CIS", MDA: "Russia & CIS",
  // East & Southeast Asia
  CHN: "East Asia", KOR: "East Asia", JPN: "East Asia", HKG: "East Asia",
  SGP: "East Asia", VNM: "East Asia", MYS: "East Asia", THA: "East Asia",
  IDN: "East Asia", PHL: "East Asia", KHM: "East Asia", MNG: "East Asia", TWN: "East Asia",
  // South Asia
  IND: "South Asia", PAK: "South Asia", BGD: "South Asia", LKA: "South Asia",
  AFG: "South Asia", NPL: "South Asia",
  // Middle East
  TUR: "Middle East", IRN: "Middle East", ARE: "Middle East", SAU: "Middle East",
  ISR: "Middle East", JOR: "Middle East", OMN: "Middle East", BHR: "Middle East",
  KWT: "Middle East", LBN: "Middle East", QAT: "Middle East", IRQ: "Middle East",
  PSE: "Middle East", SYR: "Middle East", YEM: "Middle East",
  // Europe
  DEU: "Europe", ITA: "Europe", FRA: "Europe", POL: "Europe", NLD: "Europe",
  CHE: "Europe", GBR: "Europe", LTU: "Europe", LVA: "Europe", EST: "Europe",
  CZE: "Europe", AUT: "Europe", HUN: "Europe", BEL: "Europe", SVN: "Europe",
  ESP: "Europe", FIN: "Europe", IRL: "Europe", BGR: "Europe", SVK: "Europe",
  SWE: "Europe", ROU: "Europe", DNK: "Europe", SRB: "Europe", GRC: "Europe",
  LUX: "Europe", NOR: "Europe", PRT: "Europe", HRV: "Europe", MLT: "Europe",
  CYP: "Europe", ALB: "Europe", BIH: "Europe", MNE: "Europe", MKD: "Europe",
  ISL: "Europe", LIE: "Europe",
  // Americas
  USA: "Americas", BRA: "Americas", MEX: "Americas", CAN: "Americas",
  ECU: "Americas", CUB: "Americas", ARG: "Americas", COL: "Americas",
  CHL: "Americas", HND: "Americas", GTM: "Americas", BOL: "Americas",
  PER: "Americas", URY: "Americas", CRI: "Americas", PAN: "Americas",
  // Africa
  ZAF: "Africa", EGY: "Africa", KEN: "Africa", MAR: "Africa", TUN: "Africa",
  RWA: "Africa", MOZ: "Africa", ZWE: "Africa", UGA: "Africa", TZA: "Africa",
  MLI: "Africa", NGA: "Africa", ETH: "Africa", GHA: "Africa", DZA: "Africa",
  SEN: "Africa", CIV: "Africa", CMR: "Africa", ZMB: "Africa", SDN: "Africa",
  // Oceania
  AUS: "Oceania", NZL: "Oceania",
};
