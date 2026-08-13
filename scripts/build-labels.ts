/**
 * Build the label dictionary that lets data-derived text follow the language
 * switch:  npx tsx scripts/build-labels.ts
 *
 * The source extract is English-only and stays that way. Everything the user
 * reads that comes out of it — partner names, regions, categories, HS chapter
 * and product descriptions — is translated here and shipped as
 * src/data/labels.json, keyed so that a missing entry falls back to the English
 * original rather than to a blank.
 *
 * Two different sources, on purpose:
 *  - Country names come from the platform's own CLDR data via Intl.DisplayNames.
 *    They are standardised, maintained, and correct in all three languages, so
 *    hand-translating 168 of them would only add a way to be wrong.
 *  - Everything else is a curated table: regions and categories below, HS
 *    chapter and product text in scripts/labels-text.json. HS text is keyed by
 *    the English string rather than by code, because the 2,065 HS4 and HS6 codes
 *    in the extract share only 1,270 distinct descriptions.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "src", "data");
const LANGS = ["ru", "uz"] as const;
type Lang = (typeof LANGS)[number];

interface MetaFile {
  partners: { iso3: string; name: string; region: string }[];
  chapters: { chapter: string; label: string }[];
  categories: { key: string; label: string }[];
  hs4labels: Record<string, string>;
  hs6labels: Record<string, string>;
}
const meta: MetaFile = JSON.parse(fs.readFileSync(path.join(ROOT, "meta.json"), "utf8"));

/* ------------------------------------------------------------------ */
/* Countries — ISO 3166-1 alpha-3 to alpha-2, then CLDR does the rest  */
/* ------------------------------------------------------------------ */

const ISO2: Record<string, string> = {
  AFG: "AF", AGO: "AO", ALB: "AL", AND: "AD", ARE: "AE", ARG: "AR", ARM: "AM", ATG: "AG",
  AUS: "AU", AUT: "AT", AZE: "AZ", BEL: "BE", BEN: "BJ", BGD: "BD", BGR: "BG", BHR: "BH",
  BHS: "BS", BIH: "BA", BLR: "BY", BLZ: "BZ", BOL: "BO", BRA: "BR", BRB: "BB", BTN: "BT",
  CAF: "CF", CAN: "CA", CHE: "CH", CHL: "CL", CHN: "CN", CIV: "CI", CMR: "CM", COD: "CD",
  COG: "CG", COL: "CO", COM: "KM", CRI: "CR", CUB: "CU", CYP: "CY", CZE: "CZ", DEU: "DE",
  DNK: "DK", DOM: "DO", DZA: "DZ", ECU: "EC", EGY: "EG", ESP: "ES", EST: "EE", ETH: "ET",
  FIN: "FI", FJI: "FJ", FRA: "FR", FRO: "FO", GAB: "GA", GBR: "GB", GEO: "GE", GHA: "GH",
  GIB: "GI", GIN: "GN", GNB: "GW", GRC: "GR", GRD: "GD", GRL: "GL", GTM: "GT", GUY: "GY",
  HKG: "HK", HND: "HN", HRV: "HR", HUN: "HU", IDN: "ID", IND: "IN", IRL: "IE", IRN: "IR",
  IRQ: "IQ", ISL: "IS", ISR: "IL", ITA: "IT", JAM: "JM", JOR: "JO", JPN: "JP", KAZ: "KZ",
  KEN: "KE", KGZ: "KG", KHM: "KH", KIR: "KI", KOR: "KR", KWT: "KW", LAO: "LA", LBN: "LB",
  LKA: "LK", LTU: "LT", LUX: "LU", LVA: "LV", MAC: "MO", MAR: "MA", MDA: "MD", MDG: "MG",
  MDV: "MV", MEX: "MX", MHL: "MH", MKD: "MK", MLI: "ML", MLT: "MT", MMR: "MM", MNE: "ME",
  MNG: "MN", MOZ: "MZ", MRT: "MR", MUS: "MU", MWI: "MW", MYS: "MY", NAM: "NA", NGA: "NG",
  NIC: "NI", NLD: "NL", NOR: "NO", NPL: "NP", NZL: "NZ", OMN: "OM", PAK: "PK", PAN: "PA",
  PER: "PE", PHL: "PH", POL: "PL", PRK: "KP", PRT: "PT", PRY: "PY", PSE: "PS", PYF: "PF",
  QAT: "QA", ROU: "RO", RUS: "RU", RWA: "RW", SAU: "SA", SDN: "SD", SEN: "SN", SGP: "SG",
  SLE: "SL", SLV: "SV", SMR: "SM", SRB: "RS", SSD: "SS", SUR: "SR", SVK: "SK", SVN: "SI",
  SWE: "SE", SWZ: "SZ", SYC: "SC", SYR: "SY", TCA: "TC", TCD: "TD", THA: "TH", TJK: "TJ",
  TKM: "TM", TTO: "TT", TUN: "TN", TUR: "TR", TZA: "TZ", UGA: "UG", UKR: "UA", URY: "UY",
  USA: "US", VEN: "VE", VGB: "VG", VNM: "VN", VUT: "VU", ZAF: "ZA", ZMB: "ZM", ZWE: "ZW",
  AIA: "AI", ASM: "AS", ATF: "TF", BDI: "BI", BFA: "BF", BLM: "BL", BRN: "BN", BWA: "BW",
  CCK: "CC", CYM: "KY", DMA: "DM", ERI: "ER", HMD: "HM", IOT: "IO", LBR: "LR", LSO: "LS",
  MSR: "MS", NCL: "NC", NRU: "NR", SLB: "SB", SOM: "SO", STP: "ST", TKL: "TK", TLS: "TL",
  TUV: "TV", WLF: "WF",
};

/**
 * Partner codes that are not countries. UN Comtrade carries a few reporting
 * aggregates alongside real reporters; CLDR has no entry for them, so they are
 * translated here by hand rather than left in English.
 */
const NON_ISO_PARTNERS: Record<string, [string, string]> = {
  S19: ["Прочие страны Азии, не указанные отдельно", "Boshqa Osiyo mamlakatlari (alohida koʻrsatilmagan)"],
};

/* ------------------------------------------------------------------ */
/* Regions and categories — small, curated                             */
/* ------------------------------------------------------------------ */

const REGIONS: Record<string, [string, string]> = {
  // English: [ru, uz]
  "Africa": ["Африка", "Afrika"],
  "Americas": ["Америка", "Amerika"],
  "Central Asia": ["Центральная Азия", "Markaziy Osiyo"],
  "East Asia": ["Восточная Азия", "Sharqiy Osiyo"],
  "Europe": ["Европа", "Yevropa"],
  "Middle East": ["Ближний Восток", "Yaqin Sharq"],
  "Oceania": ["Океания", "Okeaniya"],
  "Other": ["Прочие", "Boshqa"],
  "Russia & CIS": ["Россия и СНГ", "Rossiya va MDH"],
  "South Asia": ["Южная Азия", "Janubiy Osiyo"],
};

const CATEGORIES: Record<string, [string, string]> = {
  agri: ["Сельское хозяйство и продовольствие", "Qishloq xoʻjaligi va oziq-ovqat"],
  minerals: ["Минеральное сырьё и топливо", "Mineral xomashyo va yoqilgʻi"],
  chemicals: ["Химия и фармацевтика", "Kimyo va farmatsevtika"],
  plastics: ["Пластмассы и каучук", "Plastmassa va kauchuk"],
  hides: ["Кожа, древесина и бумага", "Teri, yogʻoch va qogʻoz"],
  textiles: ["Текстиль и одежда", "Toʻqimachilik va kiyim"],
  footwear: ["Обувь и головные уборы", "Poyabzal va bosh kiyimlar"],
  stone: ["Камень, стекло и керамика", "Tosh, shisha va keramika"],
  precious: ["Драгоценные металлы и камни", "Qimmatbaho metallar va toshlar"],
  metals: ["Недрагоценные металлы и изделия", "Metallar va ulardan buyumlar"],
  machinery: ["Машины и электроника", "Mashina va elektronika"],
  transport: ["Транспортные средства", "Transport vositalari"],
  instruments: ["Приборы и прочее", "Asboblar va boshqalar"],
  residual: ["Не указано / остаточное", "Koʻrsatilmagan / qoldiq"],
};

/* ------------------------------------------------------------------ */
/* HS chapter and product text — curated, keyed by the English string  */
/* ------------------------------------------------------------------ */

// Split across several files purely to keep each one reviewable: labels-text.json
// holds the HS chapters, labels-text-NN.json the HS4/HS6 product descriptions.
const SCRIPTS = path.join(process.cwd(), "scripts");
const TEXT: Record<string, [string, string]> = {};
for (const f of fs.readdirSync(SCRIPTS).filter((f) => /^labels-text(-\d+)?\.json$/.test(f)).sort()) {
  Object.assign(TEXT, JSON.parse(fs.readFileSync(path.join(SCRIPTS, f), "utf8")));
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

/*
 * Chapters and products are kept apart because they are complete at different
 * times. Chapter labels are a closed set of 97 and are done; HS4/HS6 product
 * descriptions are 1,270 lines of customs nomenclature being translated in
 * batches. A table where some rows are translated and the rest are not reads as
 * broken, so the product tier is only published once it is complete — until
 * then those descriptions stay in the source language, consistently.
 */
const out: Record<Lang, {
  countries: Record<string, string>;
  regions: Record<string, string>;
  categories: Record<string, string>;
  text: Record<string, string>;
  products: Record<string, string>;
  productsComplete: boolean;
}> = {
  ru: { countries: {}, regions: {}, categories: {}, text: {}, products: {}, productsComplete: false },
  uz: { countries: {}, regions: {}, categories: {}, text: {}, products: {}, productsComplete: false },
};

const CHAPTER_LABELS = new Set(meta.chapters.map((c) => c.label));
const PRODUCT_LABELS = new Set([...Object.values(meta.hs4labels), ...Object.values(meta.hs6labels)]);

/**
 * Uzbek spells the letters oʻ and gʻ with a modifier letter turned comma
 * (ʻ U+02BB), which is what the rest of the app's Uzbek copy uses. A few CLDR
 * entries spell that same mark with a typographic quote instead — "Amerika
 * Qo‘shma Shtatlari" — which renders as an opening quote and reads as a
 * mistake next to every other oʻ on the page.
 *
 * Only the mark directly after o or g is that letter. The apostrophe in
 * "Kot-d’Ivuar" is a genuine French elision and is left alone.
 */
const uzLetterMark = (s: string) => s.replace(/([oOgG])[‘’`´']/g, "$1ʻ");

const missingIso: string[] = [];
const englishCheck: { iso3: string; extract: string; cldr: string }[] = [];
const displayNames = {
  en: new Intl.DisplayNames(["en"], { type: "region" }),
  ru: new Intl.DisplayNames(["ru"], { type: "region" }),
  uz: new Intl.DisplayNames(["uz"], { type: "region" }),
};

for (const p of meta.partners) {
  const special = NON_ISO_PARTNERS[p.iso3];
  if (special) {
    out.ru.countries[p.iso3] = special[0];
    out.uz.countries[p.iso3] = special[1];
    continue;
  }
  const a2 = ISO2[p.iso3];
  if (!a2) { missingIso.push(p.iso3); continue; }
  const en = displayNames.en.of(a2);
  // a code CLDR does not know comes back unchanged — that is a mapping error
  if (!en || en === a2) { missingIso.push(`${p.iso3}→${a2}`); continue; }
  englishCheck.push({ iso3: p.iso3, extract: p.name, cldr: en });
  for (const lang of LANGS) {
    const name = displayNames[lang].of(a2);
    if (name && name !== a2) out[lang].countries[p.iso3] = lang === "uz" ? uzLetterMark(name) : name;
  }
}

for (const lang of LANGS) {
  const i = lang === "ru" ? 0 : 1;
  for (const [en, pair] of Object.entries(REGIONS)) out[lang].regions[en] = pair[i];
  for (const [key, pair] of Object.entries(CATEGORIES)) out[lang].categories[key] = pair[i];
  for (const [en, pair] of Object.entries(TEXT)) {
    if (!pair[i]) continue;
    if (CHAPTER_LABELS.has(en)) out[lang].text[en] = pair[i];
    if (PRODUCT_LABELS.has(en)) out[lang].products[en] = pair[i];
  }
  out[lang].productsComplete = [...PRODUCT_LABELS].every((en) => out[lang].products[en]);
}

fs.writeFileSync(path.join(ROOT, "labels.json"), JSON.stringify(out));

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

const englishText = new Set<string>([
  ...meta.chapters.map((c) => c.label),
  ...Object.values(meta.hs4labels),
  ...Object.values(meta.hs6labels),
]);
const covered = [...englishText].filter((s) => TEXT[s]?.[0] && TEXT[s]?.[1]).length;
const pct = (n: number, d: number) => `${((100 * n) / Math.max(d, 1)).toFixed(1)}%`;

console.log(`countries    ${Object.keys(out.ru.countries).length}/${meta.partners.length} (${pct(Object.keys(out.ru.countries).length, meta.partners.length)}) via CLDR`);
console.log(`regions      ${Object.keys(out.ru.regions).length}`);
console.log(`categories   ${Object.keys(out.ru.categories).length}/${meta.categories.length}`);
console.log(`HS chapters  ${Object.keys(out.ru.text).length}/${CHAPTER_LABELS.size}`);
console.log(`HS products  ${Object.keys(out.ru.products).length}/${PRODUCT_LABELS.size} (${pct(Object.keys(out.ru.products).length, PRODUCT_LABELS.size)}) — ` +
  (out.ru.productsComplete && out.uz.productsComplete
    ? "complete, published"
    : "INCOMPLETE, held back so tables do not mix languages"));
void covered;

if (missingIso.length) console.log(`\nUNMAPPED ISO CODES: ${missingIso.join(", ")}`);

// Where CLDR's English name differs from the extract's, print it: a large
// difference is usually a wrong alpha-2 mapping rather than a naming style.
const differs = englishCheck.filter((c) => c.extract !== c.cldr);
console.log(`\n${differs.length} country names differ from the extract's English (naming style, not a mapping error, unless the two are unrelated):`);
for (const c of differs.slice(0, 25)) console.log(`   ${c.iso3}  extract "${c.extract}"  vs CLDR "${c.cldr}"`);
if (differs.length > 25) console.log(`   … and ${differs.length - 25} more`);

const untranslated = [...englishText].filter((s) => !TEXT[s]);
if (untranslated.length) {
  fs.writeFileSync(
    path.join(process.cwd(), "scripts", "labels-text.todo.json"),
    JSON.stringify(untranslated.sort(), null, 1),
  );
  console.log(`\nwrote scripts/labels-text.todo.json with ${untranslated.length} untranslated strings`);
}
