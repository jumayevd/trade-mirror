/**
 * One-off probe: how many records would an "all commodity codes" query return?
 * Decides how to chunk the HS6 pull without hitting the 100k cap.
 * Run: npx tsx scripts/probe-hs6.ts
 */
import "dotenv/config";
import { probeCount } from "./comtrade";
import { PARTNERS, UZBEKISTAN } from "./config";

(async () => {
  const partnerCsv = PARTNERS.map((p) => p.code).join(",");

  for (const year of [2023, 2019]) {
    const uzb = await probeCount({
      freq: "A", reporterCode: UZBEKISTAN.code, partnerCode: partnerCsv,
      flowCode: "M", periods: [year], cmdCode: "", label: `probe-uzb-${year}`,
    });
    console.log(`UZB imports, all cmd levels, ${year}: ${uzb.toLocaleString()} records`);

    const ptn = await probeCount({
      freq: "A", reporterCode: partnerCsv, partnerCode: UZBEKISTAN.code,
      flowCode: "X", periods: [year], cmdCode: "", label: `probe-ptn-${year}`,
    });
    console.log(`Partner exports to UZB, all cmd levels, ${year}: ${ptn.toLocaleString()} records`);
  }
})();
