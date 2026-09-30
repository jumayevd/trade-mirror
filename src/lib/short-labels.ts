import shortRaw from "@/data/hs6-short.json";
import type { Lang } from "@/lib/locales";

/**
 * A few words a reader recognises, for places that cannot fit the
 * nomenclature's own 60-90 character text — the Overview's treemap tiles.
 *
 * The curated names in src/data/hs6-short.json cover every HS6 line that
 * reaches a top five in any window and freight scenario, in all three
 * languages; the official HS text is untranslated, so for these lines this is
 * also the only Russian and Uzbek the reader gets. Anything else falls back to
 * a rule-based shortening of the official text, which is always kept in the
 * tooltip beside it — nothing here replaces the description, it only fronts it.
 */
const SHORT = shortRaw as unknown as Record<string, Record<Lang, string> | string>;

const MAX = 30;

/** Rule-based fallback: the heading before the first ";", asides dropped, cut at a word. */
export function shortenHsText(text: string): string {
  const noAsides = text.replace(/\s*\([^)]*\)/g, "").replace(/…$/, "").trim();
  const head = noAsides.split(";")[0].trim();
  // a one-word heading ("Vehicles", "Machinery") says too little on its own;
  // then the start of the qualifier is kept and the whole cut to length
  const base = head.split(/\s+/).length >= 2 || head === noAsides ? head : noAsides.replace(";", ":");
  if (base.length <= MAX) return base;
  const cut = base.slice(0, MAX + 1);
  const atWord = cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\s]+$/, "");
  return `${atWord || base.slice(0, MAX)}…`;
}

export function hs6ShortLabel(cmd: string, lang: Lang, officialText: string): string {
  const entry = SHORT[cmd];
  if (entry && typeof entry === "object") return entry[lang] ?? entry.en;
  return shortenHsText(officialText);
}
