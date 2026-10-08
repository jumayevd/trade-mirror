/**
 * Writes the compact copies of the data files that the browser downloads.
 *
 *   tsx scripts/build-wire.ts
 *
 * Runs before every build and dev server (npm prebuild/predev, and Vercel's
 * buildCommand), and before the scripts that load the engine (data:verify,
 * data:audit:ui), so the copies always follow the canonical files — they are
 * generated, never committed, never edited.
 *
 * Each table is stored column by column (src/lib/wire.ts) and must decode back
 * to the canonical file EXACTLY — every row, every value, the same order — or
 * nothing is written and the build stops. risk.json also loses `cells`: the
 * dashboard scores the period live, and only scripts/audit-onscreen.ts reads
 * the fitted per-cell scores, from the canonical file.
 */
import fs from "node:fs";
import path from "node:path";
import { decodePacked, encodePacked, type PackedTable } from "../src/lib/wire";

const ROOT = process.cwd();
const MB = (n: number) => `${(n / 1048576).toFixed(2)} MB`;

const tables: [from: string, to: string][] = [
  ["src/data/cells.json", "src/data/wire/cells.json"],
  ["src/data/monthly.json", "src/data/wire/monthly.json"],
  ["src/data/annualized-hs6.json", "src/data/wire/annualized-hs6.json"],
  ["public/data/monthly-hs6.json", "public/data/monthly-hs6.wire.json"],
];

function sameTable(a: PackedTable, b: PackedTable): string | null {
  const { r: ra, ...fa } = a;
  const { r: rb, ...fb } = b;
  if (JSON.stringify(fa) !== JSON.stringify(fb)) return "dictionary fields differ";
  if (ra.length !== rb.length) return `row count ${ra.length} vs ${rb.length}`;
  for (let i = 0; i < ra.length; i++) {
    const x = ra[i], y = rb[i];
    if (x.length !== y.length) return `row ${i}: length ${x.length} vs ${y.length}`;
    for (let c = 0; c < x.length; c++) if (x[c] !== y[c]) return `row ${i} col ${c}: ${x[c]} vs ${y[c]}`;
  }
  return null;
}

let failed = false;
const written: [string, string][] = [];
for (const [from, to] of tables) {
  const src = path.join(ROOT, from);
  const text = fs.readFileSync(src, "utf8");
  const table = JSON.parse(text) as PackedTable;
  for (const row of table.r) for (const v of row) {
    if (!Number.isSafeInteger(v)) { console.error(`${from}: non-integer value ${v} — the wire form stores integers only`); process.exit(1); }
  }
  const wireText = JSON.stringify(encodePacked(table));
  const problem = sameTable(table, decodePacked(JSON.parse(wireText)));
  if (problem) { console.error(`${from}: round-trip FAILED — ${problem}`); failed = true; continue; }
  written.push([to, wireText]);
  console.log(`${from.padEnd(30)} ${MB(text.length).padStart(9)} → ${MB(wireText.length).padStart(9)}  round-trip exact (${table.r.length.toLocaleString()} rows)`);
}

const risk = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/risk.json"), "utf8"));
const { cells: _scored, ...riskWire } = risk;
void _scored;
written.push(["src/data/wire/risk.json", JSON.stringify(riskWire)]);
console.log(`${"src/data/risk.json".padEnd(30)} ${MB(JSON.stringify(risk).length).padStart(9)} → ${MB(JSON.stringify(riskWire).length).padStart(9)}  without the fitted per-cell scores`);

if (failed) { console.error("wire copies NOT written"); process.exit(1); }
fs.mkdirSync(path.join(ROOT, "src/data/wire"), { recursive: true });
for (const [to, text] of written) {
  const dest = path.join(ROOT, to);
  // rewrite only on change, so a dev server does not see every file touched
  if (!fs.existsSync(dest) || fs.readFileSync(dest, "utf8") !== text) fs.writeFileSync(dest, text);
}
