/**
 * Keeps every partner the monthly books mention in src/data/meta.json.
 *
 * Channel building resolves partners through the meta list, so a partner
 * missing from it is silently dropped — its trade leaves every total, which
 * breaks the 1:1 reconciliation against UN Comtrade. The monthly series runs
 * past the annual window and names partners the annual workbook never saw
 * (S19 "Other Asia, nes", the Cayman Islands, …).
 *
 * Both monthly build steps call this: build-monthly.ts when the monthly book
 * is repacked, and build-annualized.ts, which runs at the end of
 * `npm run data:excel` — after build-from-excel.ts has rewritten meta.json
 * from the annual workbook alone and dropped them again.
 */
import { NAME_OVERRIDES, REGION_BY_ISO, TRANSIT_HUBS } from "./config";

interface MetaPartner { iso3: string; name: string }
interface MetaFile { partners: MetaPartner[] }

/** Appends the missing partners in place and returns their ISO codes. */
export function appendMonthlyPartners(
  meta: MetaFile,
  isos: Iterable<string>,
  names: Record<string, string> = {},
): string[] {
  const known = new Set(meta.partners.map((p) => p.iso3));
  const missing = [...new Set(isos)].filter((iso) => !known.has(iso));
  for (const iso of missing) {
    meta.partners.push({
      iso3: iso,
      name: NAME_OVERRIDES[iso] ?? (names[iso] ?? iso).trim(),
      region: REGION_BY_ISO[iso] ?? "Other",
      code: iso,
      transit: TRANSIT_HUBS.has(iso),
      // monthly-only partner: no annual Comtrade reports inside the yearly window
      coverage: 0,
      reportedYears: [],
      lastReportedYear: 0,
      lapse: false,
      tier: "Low",
    } as MetaPartner);
  }
  if (missing.length) meta.partners.sort((a, b) => a.name.localeCompare(b.name));
  return missing;
}
