/**
 * One-off data profiler — tells us what analytics the raw pull can actually support.
 * Run: npx tsx scripts/profile-data.ts
 */
import { promises as fs } from "node:fs";
import path from "node:path";

interface Row {
  refYear: number;
  period: string;
  flowCode: string;
  reporterCode: string;
  reporterISO: string;
  partnerCode: string;
  partnerISO: string;
  cmdCode: string;
  aggrLevel: number;
  primaryValue: number;
  netWgt: number;
  qty: number;
  qtyUnitAbbr: string;
}

const UZB = "860";

function pct(n: number, d: number) {
  return d === 0 ? "0%" : `${Math.round((n / d) * 100)}%`;
}
function usd(n: number) {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString()}`;
}

(async () => {
  const file = path.join(process.cwd(), "data", "raw", "trade-rows.json");
  const rows: Row[] = JSON.parse(await fs.readFile(file, "utf8"));
  console.log(`\n=== Data profile — ${rows.length.toLocaleString()} rows ===\n`);

  const uzbImp = rows.filter((r) => r.reporterCode === UZB && r.flowCode === "M");
  const ptnExp = rows.filter((r) => r.reporterCode !== UZB && r.partnerCode === UZB && r.flowCode === "X");

  console.log(`UZB import rows:            ${uzbImp.length.toLocaleString()}`);
  console.log(`Partner export-to-UZB rows: ${ptnExp.length.toLocaleString()}\n`);

  // quantity/weight coverage at commodity detail (aggrLevel 2/4, excluding TOTAL)
  for (const [label, set] of [["UZB imports", uzbImp], ["Partner exports", ptnExp]] as const) {
    const detail = set.filter((r) => r.cmdCode !== "TOTAL" && r.aggrLevel >= 2);
    const wgt = detail.filter((r) => r.netWgt > 0).length;
    const q = detail.filter((r) => r.qty > 0).length;
    console.log(`${label} (commodity detail ${detail.length.toLocaleString()} rows): netWgt>0 ${pct(wgt, detail.length)} · qty>0 ${pct(q, detail.length)}`);
  }

  // unit-value feasibility: cells where BOTH sides have value+weight for same year+cmd
  console.log(`\n-- Unit-value (price/kg) feasibility, HS4 --`);
  const key = (r: Row) => `${r.refYear}|${r.partnerISO || r.reporterISO}|${r.cmdCode}`;
  // partner side keyed by (year, partnerReporterISO, cmd); uzb side keyed by (year, uzbPartnerISO, cmd)
  const uzbByKey = new Map<string, Row>();
  uzbImp.filter((r) => r.aggrLevel === 4 && r.netWgt > 0).forEach((r) => uzbByKey.set(`${r.refYear}|${r.partnerISO}|${r.cmdCode}`, r));
  let matched = 0;
  const samples: string[] = [];
  ptnExp.filter((r) => r.aggrLevel === 4 && r.netWgt > 0).forEach((r) => {
    const u = uzbByKey.get(`${r.refYear}|${r.reporterISO}|${r.cmdCode}`);
    if (u) {
      matched++;
      if (samples.length < 6 && r.refYear >= 2019) {
        const pUV = r.primaryValue / r.netWgt;
        const uUV = u.primaryValue / u.netWgt;
        samples.push(
          `  ${r.refYear} ${r.reporterISO} HS${r.cmdCode}: partner ${usd(pUV)}/kg vs UZB ${usd(uUV)}/kg (UZB ${uUV < pUV ? "lower" : "higher"} ${Math.round((1 - uUV / pUV) * 100)}%)`,
        );
      }
    }
  });
  console.log(`Matched HS4 unit-value cells (both sides have value+weight): ${matched.toLocaleString()}`);
  samples.forEach((s) => console.log(s));

  // year coverage of UZB's own reporting (does UZB report every year?)
  console.log(`\n-- UZB import reporting by year (count of detail rows) --`);
  const byYear = new Map<number, number>();
  uzbImp.filter((r) => r.cmdCode !== "TOTAL").forEach((r) => byYear.set(r.refYear, (byYear.get(r.refYear) ?? 0) + 1));
  const years = [...byYear.keys()].sort();
  console.log(years.map((y) => `${y}:${byYear.get(y)}`).join("  "));

  // monthly coverage
  const mUzb = uzbImp.filter((r) => r.period.length === 6);
  const mPtn = ptnExp.filter((r) => r.period.length === 6);
  const months = [...new Set([...mUzb, ...mPtn].map((r) => r.period))].sort();
  console.log(`\n-- Monthly rows -- UZB ${mUzb.length} · partner ${mPtn.length} · months: ${months[0]}..${months[months.length - 1]} (${months.length})`);

  // partner reliability (as mirror reporters of exports to UZB)
  console.log(`\n-- Partner mirror reliability (export-to-UZB, years present / total value) --`);
  const pAgg = new Map<string, { years: Set<number>; val: number }>();
  ptnExp.filter((r) => r.cmdCode === "TOTAL").forEach((r) => {
    const a = pAgg.get(r.reporterISO) ?? { years: new Set(), val: 0 };
    a.years.add(r.refYear);
    a.val += r.primaryValue;
    pAgg.set(r.reporterISO, a);
  });
  [...pAgg.entries()]
    .sort((a, b) => b[1].val - a[1].val)
    .forEach(([iso, a]) => console.log(`  ${iso}: ${a.years.size}/15 yrs · ${usd(a.val)}`));
})();
