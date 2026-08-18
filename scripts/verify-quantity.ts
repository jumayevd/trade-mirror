/** Runs the page's own aggregation against the built layer — npx tsx scripts/verify-quantity.ts */
import fs from "node:fs";
import path from "node:path";
import { loadQuantity, quantityRows, quantityYears, quantityMonths, quantityPartners, type PackedQuantity } from "../src/lib/quantity";

const p = path.join(process.cwd(), "public", "data", "quantity-hs6.json");
const payload = JSON.parse(fs.readFileSync(p, "utf-8")) as PackedQuantity;
loadQuantity(payload);

const years = quantityYears();
const latest = years[years.length - 1];
console.log("years:", years.join(", "));
console.log("latest (yearly default):", latest);
console.log("partners:", quantityPartners().length, "| months in latest:", quantityMonths([latest]).join(","));

const yearly = quantityRows({ basis: "year", years: [latest], months: [], partners: [] });
console.log(`\nYEARLY ${latest}: ${yearly.length.toLocaleString()} rows`);
const byDiff = [...yearly].sort((a, b) => b.diff - a.diff);
console.log("top 3 by difference (desc):");
for (const r of byDiff.slice(0, 3)) {
  console.log(`  ${r.partner} HS${r.cmd} ${r.unit}: imp ${r.impQty.toLocaleString()} @ $${r.impPrice.toFixed(2)} | exp ${r.expQty.toLocaleString()} @ $${r.expPrice.toFixed(2)} | diff ${r.diff.toFixed(2)}`);
}

// identity check: unit price must equal summed value / summed quantity
const bad = yearly.filter((r) => Math.abs(r.impPrice - r.impValue / r.impQty) > 1e-9 || r.impQty <= 0 || r.expQty <= 0);
console.log("rows failing the price identity or with non-positive quantity:", bad.length);

const monthly = quantityRows({ basis: "month", years: [latest], months: [1], partners: [] });
console.log(`\nMONTHLY ${latest}-01: ${monthly.length.toLocaleString()} rows`);

const chn = quantityRows({ basis: "year", years: [latest], months: [], partners: ["CHN"] });
console.log(`Filtered to CHN, ${latest}: ${chn.length.toLocaleString()} rows`);

// yearly must aggregate the months, not average them
const one = byDiff.find((r) => r.impQty > 1000)!;
const [pi, ki, ui] = one.key.split("|").map(Number);
let iv = 0, iq = 0;
for (const row of payload.r) {
  if (row[0] === pi && row[1] === ki && row[3] === ui && payload.y0 + Math.floor(row[2] / 12) === latest) { iv += row[4]; iq += row[5]; }
}
console.log(`\nweighted-average check for ${one.partner} HS${one.cmd}:`);
console.log(`  page price ${one.impPrice.toFixed(4)} vs recomputed ${(iv / iq).toFixed(4)} -> ${Math.abs(one.impPrice - iv / iq) < 1e-9 ? "MATCH" : "MISMATCH"}`);
