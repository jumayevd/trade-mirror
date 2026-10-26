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
 * the official heading, which the tile wraps and the tooltip repeats in full —
 * nothing here replaces the description, it only fronts it.
 */
const SHORT = shortRaw as unknown as Record<string, Record<Lang, string> | string>;

/** Past this the heading is cut back to its last clause or word — never with an ellipsis. */
const MAX = 60;

/**
 * Rule-based fallback: the heading before the first ";", asides dropped. It is
 * not clipped to a tile's width — the tile wraps it (GapTreemap sets the label
 * to break lines) and the full text sits in the tooltip. An ellipsis baked into
 * the label here would survive any amount of wrapping, which is how
 * "Units of automatic data…" sat on a 350px tile.
 */
export function shortenHsText(text: string): string {
  const noAsides = text.replace(/\s*\([^)]*\)/g, "").replace(/…$/, "").trim();
  const head = noAsides.split(";")[0].trim();
  // a one-word heading ("Vehicles", "Machinery") says too little on its own;
  // then the first qualifier is kept as well
  const base = head.split(/\s+/).length >= 2 || head === noAsides ? head : noAsides.split(";").slice(0, 2).join(":").trim();
  if (base.length <= MAX) return base;
  const cut = base.slice(0, MAX + 1);
  const clause = Math.max(cut.lastIndexOf(", "), cut.lastIndexOf(": "));
  const at = clause > MAX / 2 ? clause : cut.lastIndexOf(" ");
  return (at > 0 ? cut.slice(0, at) : cut.slice(0, MAX)).replace(/[,;:\s]+$/, "");
}

export function hs6ShortLabel(cmd: string, lang: Lang, officialText: string): string {
  const entry = SHORT[cmd];
  if (entry && typeof entry === "object") return entry[lang] ?? entry.en;
  return shortenHsText(officialText);
}

/** A table cell's product name: read at a glance, the official line on hover. */
const BRIEF_MAX = 38;
/** Words a cut name must not end on. */
const TRAILING: Record<Lang, RegExp> = {
  en: /\s+(and|or|of|from|for|with|the|in|on|by|to|other|than|not|whether|n\.e\.c\.?)$/i,
  ru: /\s+(и|или|из|для|с|со|в|на|по|к|от|кроме|не|прочие|прочих)$/i,
  uz: /\s+(va|yoki|uchun|bilan|boshqa|hamda)$/i,
};
/** A qualifier that only narrows by exclusion or cross-reference says nothing at a glance. */
const FILLER = /^(n\.e\.c|other|not |consisting|whether|excluding|не |кроме|прочие|состоящ|boshqa|nomlanmagan|\d)/i;

/**
 * The few words of an HS line that name it: a curated name where there is one,
 * else the heading before the ";", with the first short qualifier kept
 * ("Fruit, edible: bananas", "Furniture: wooden") so sibling lines under one
 * heading stay apart, cut back at a comma or a word — never mid-word, never on
 * "and" or "of", never with an ellipsis.
 */
export function briefHsLabel(cmd: string, lang: Lang, officialText: string): string {
  const entry = SHORT[cmd];
  if (entry && typeof entry === "object") return entry[lang] ?? entry.en;
  const text = officialText.replace(/\s*\([^)]*\)/g, "").replace(/[…,;:\s]+$/, "").trim();
  const [head, rest] = [text.split(";")[0].trim(), text.split(";").slice(1).join(";").trim()];
  const qual = rest.split(",")[0].trim();
  let out = head;
  if (qual && !FILLER.test(qual) && head.length + qual.length + 2 <= BRIEF_MAX) out = `${head}: ${qual}`;
  if (out.length <= BRIEF_MAX) return out;
  const cut = out.slice(0, BRIEF_MAX + 1);
  const comma = cut.lastIndexOf(", ");
  let s = comma > BRIEF_MAX / 2 ? cut.slice(0, comma) : cut.slice(0, Math.max(cut.lastIndexOf(" "), 1));
  for (let prev = ""; prev !== s; ) { prev = s; s = s.replace(TRAILING[lang], "").replace(/[,;:\s]+$/, ""); }
  return s;
}
