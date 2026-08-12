/**
 * Data-derived labels, translated.
 *
 * The UN Comtrade extract is English-only, so partner names, regions,
 * categories and HS descriptions would otherwise stay English when the reader
 * switches language. This layer translates them on the way out, keyed by code
 * (or, for HS text, by the English string, since 2,065 HS4 and HS6 codes share
 * only 1,270 distinct descriptions). Anything the dictionary does not cover
 * falls back to the English original — never to a blank or a bare code.
 *
 * The dictionary is built by scripts/build-labels.ts. Country names come from
 * CLDR through Intl.DisplayNames, so they are standardised rather than
 * hand-written.
 *
 * Not a hook: these functions are called from `aggregate()` and from plain
 * helpers that never see React context. The provider pushes the active language
 * in with `setLabelLang` before any consumer renders, and views that memoise
 * derived data list `lang` among their dependencies so the memo is rebuilt when
 * it changes.
 */
import labelsRaw from "@/data/labels.json";
import type { Lang } from "@/lib/locales";

interface LabelDict {
  countries: Record<string, string>;
  regions: Record<string, string>;
  categories: Record<string, string>;
  /** HS chapter labels — a closed set of 97, complete. */
  text: Record<string, string>;
  /** HS4/HS6 product descriptions — 1,270 lines, translated in batches. */
  products: Record<string, string>;
  /** False while the product table is still being filled in. */
  productsComplete: boolean;
}

const DICTS = labelsRaw as unknown as Record<string, LabelDict>;

let current: Lang = "en";

/** Set by I18nProvider on every render, from the same store `t()` reads. */
export function setLabelLang(lang: Lang): void {
  current = lang;
}

export function labelLang(): Lang {
  return current;
}

const dict = (): LabelDict | null => (current === "en" ? null : DICTS[current] ?? null);

/** Country name for an ISO3 code, falling back to the extract's English name. */
export const tCountry = (iso3: string, english: string): string =>
  dict()?.countries[iso3] ?? english;

export const tRegion = (english: string): string => dict()?.regions[english] ?? english;

export const tCategory = (key: string, english: string): string =>
  dict()?.categories[key] ?? english;

/**
 * HS chapter and product descriptions, keyed by the English string.
 *
 * Chapters translate as soon as they are available. Product descriptions only
 * translate once the whole nomenclature table is done: a queue where five rows
 * are English and the sixth is Russian reads as a bug, whereas a column that is
 * consistently in the source nomenclature language reads as a deliberate choice.
 */
export const tText = (english: string): string => {
  const d = dict();
  if (!d) return english;
  return d.text[english] ?? (d.productsComplete ? d.products[english] ?? english : english);
};

/**
 * Marks the active language as an input to a computation that translates labels
 * internally. The translation functions read the language from this module
 * rather than from their arguments, so without this the dependency would be
 * invisible to both the reader and the exhaustive-deps lint rule:
 *
 *   const rows = useMemo(() => labelsFor(lang, () => aggregate(filter)), [filter, lang]);
 */
export const labelsFor = <T,>(lang: Lang, compute: () => T): T => {
  void lang;
  return compute();
};

/** Whether HS product descriptions are being shown translated in this language. */
export function productsLocalised(): boolean {
  return dict()?.productsComplete ?? false;
}
