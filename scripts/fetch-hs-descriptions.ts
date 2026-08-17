/**
 * Full HS descriptions, from UN Comtrade's own classification reference.
 *
 * The trade extract ships product descriptions cut at 90 characters with a
 * trailing ellipsis — 2,082 of 5,114 HS6 lines and 420 of 1,214 HS4 lines. The
 * part that gets cut is often the part that distinguishes neighbouring codes
 * ("…whether or not" what?), so the truncated label is exactly the wrong 90
 * characters to keep.
 *
 * Comtrade publishes the complete nomenclature as a public reference file, no
 * key required. This script pulls it and writes src/data/hs-full.json with the
 * full text for the codes whose shipped label is truncated — only those, so the
 * bundle carries the repair and not a second copy of the whole nomenclature.
 *
 * Note on HS4: the extract's HS4 labels are summaries in the HS6 house style,
 * not the official heading text, so for those codes the reference text is a
 * differently-worded sentence rather than a longer one. It is still the official
 * description of the heading, and complete, which the truncated summary is not.
 *
 *   npx tsx scripts/fetch-hs-descriptions.ts
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import metaRaw from "../src/data/meta.json";

const REFERENCE = "https://comtradeapi.un.org/files/v1/app/reference/HS.json";
const OUT = resolve(process.cwd(), "src/data/hs-full.json");
/** The character the extract truncates with. */
const ELLIPSIS = "…";

interface RefRow { id: string; text: string }
interface Meta {
  chapters: { chapter: string; label: string }[];
  hs4labels: Record<string, string>;
  hs6labels: Record<string, string>;
}

const meta = metaRaw as unknown as Meta;

async function main() {
  process.stdout.write(`fetching ${REFERENCE}\n`);
  const res = await fetch(REFERENCE);
  if (!res.ok) throw new Error(`Comtrade reference returned ${res.status}`);
  const body = (await res.json()) as { results: RefRow[] };

  // rows read "0101 - Horses, asses, mules and hinnies; live"
  const full = new Map<string, string>();
  for (const row of body.results) {
    const prefix = `${row.id} - `;
    const text = row.text.startsWith(prefix) ? row.text.slice(prefix.length) : row.text;
    full.set(row.id, text.trim());
  }
  process.stdout.write(`reference rows           ${body.results.length}\n`);

  const out: Record<string, string> = {};
  const missing: string[] = [];
  let checked = 0;
  const collect = (labels: Record<string, string>, level: string) => {
    let repaired = 0;
    for (const [code, label] of Object.entries(labels)) {
      if (!label.trimEnd().endsWith(ELLIPSIS)) continue;
      checked++;
      const text = full.get(code);
      if (!text) { missing.push(code); continue; }
      out[code] = text;
      repaired++;
    }
    process.stdout.write(`${level.padEnd(24)}${repaired} truncated labels repaired\n`);
  };
  collect(Object.fromEntries(meta.chapters.map((c) => [c.chapter, c.label])), "HS2 chapters");
  collect(meta.hs4labels, "HS4 headings");
  collect(meta.hs6labels, "HS6 lines");

  if (missing.length) {
    process.stdout.write(`WARNING: ${missing.length} codes absent from the reference: ${missing.slice(0, 10).join(", ")}\n`);
  }

  writeFileSync(OUT, JSON.stringify(out), "utf8");
  const kb = Math.round(JSON.stringify(out).length / 1024);
  process.stdout.write(`\nwrote src/data/hs-full.json  ${Object.keys(out).length} codes, ${kb} KB (of ${checked} truncated)\n`);
}

main().catch((e) => { process.stderr.write(`${e}\n`); process.exit(1); });
