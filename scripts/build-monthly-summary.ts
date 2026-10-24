/**
 * Derive src/data/monthly-summary.json from public/data/monthly.json — the few
 * facts every trade page needs from the monthly book before the book itself
 * loads (see src/lib/monthly-summary.ts).
 *
 *     npx tsx scripts/build-monthly-summary.ts
 *
 * Runs before every `next build` and `next dev`, so the summary never lags the
 * book; the output is deterministic, so an unchanged book rewrites the same file.
 */
import fs from "node:fs";
import path from "node:path";
import { summarizeMonthly, type PackedMonthly } from "../src/lib/monthly-summary";

const ROOT = process.cwd();
const book: PackedMonthly = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "monthly.json"), "utf8"));
const out = path.join(ROOT, "src", "data", "monthly-summary.json");
const json = JSON.stringify(summarizeMonthly(book));
if (!fs.existsSync(out) || fs.readFileSync(out, "utf8") !== json) fs.writeFileSync(out, json);
console.log(`monthly-summary.json  ${(json.length / 1024).toFixed(1)} KB from ${book.r.length.toLocaleString()} monthly rows`);
