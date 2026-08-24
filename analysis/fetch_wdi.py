"""
Fetch partner GDP per capita from the World Bank WDI into analysis/data/.

    python analysis/fetch_wdi.py

NY.GDP.PCAP.KD - GDP per capita in constant 2015 US$ - for the model window. The
specification carries it as a partner-level control: richer partners tend to keep
better trade records, so the coefficient is expected negative and the term stops
reporting quality being read as an anomaly.

Not vendored into the repository; this script downloads it and later steps read
analysis/data/wdi_gdppc.csv.
"""

from __future__ import annotations

import csv
import json
import sys
import urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
DEST = DATA / "wdi_gdppc.csv"
INDICATOR = "NY.GDP.PCAP.KD"
URL = (f"https://api.worldbank.org/v2/country/all/indicator/{INDICATOR}"
       "?format=json&per_page=20000&date=2019:2024")


def main() -> int:
    DATA.mkdir(parents=True, exist_ok=True)
    if DEST.exists():
        print(f"have {DEST.name}")
        return 0
    print(f"fetching {INDICATOR} 2019-2024")
    try:
        with urllib.request.urlopen(URL, timeout=180) as r:
            payload = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"  failed: {e}", file=sys.stderr)
        return 1

    meta, rows = payload[0], payload[1]
    out = [
        {"iso3": r["countryiso3code"], "year": int(r["date"]), "gdp_pc": float(r["value"])}
        for r in rows
        # aggregates (EAS, AFE, WLD ...) come back with the same shape; they are
        # dropped downstream by the merge, but a 3-letter code is required here
        if r["value"] is not None and len(r["countryiso3code"] or "") == 3
    ]
    with DEST.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["iso3", "year", "gdp_pc"])
        w.writeheader()
        w.writerows(sorted(out, key=lambda r: (r["iso3"], r["year"])))

    isos = {r["iso3"] for r in out}
    print(f"  wrote {DEST.name}: {len(out):,} observations, {len(isos)} economies "
          f"(of {meta.get('total')} returned)")
    print("\nSource: World Bank, World Development Indicators, NY.GDP.PCAP.KD "
          "(GDP per capita, constant 2015 US$).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
