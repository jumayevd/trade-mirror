"""
Fetch the CEPII GeoDist database into analysis/data/.

    python analysis/fetch_cepii.py

Two files, both from CEPII's public GeoDist distribution (Mayer & Zignago 2011,
"Notes on CEPII's distances measures: the GeoDist database", CEPII WP 2011-25):

    dist_cepii.xls   bilateral distances and contiguity, 50,176 country pairs
    geo_cepii.xls    country attributes including landlocked status

They are not vendored into the repository — CEPII asks that the data be obtained
from them and cited — so this script downloads them and later steps read from
analysis/data/. Re-running is cheap and skips files already present.
"""

from __future__ import annotations

import sys
import urllib.request
import zipfile
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
SOURCES = {
    "dist_cepii.zip": "http://www.cepii.fr/distance/dist_cepii.zip",
    "geo_cepii.xls": "http://www.cepii.fr/distance/geo_cepii.xls",
}


def main() -> int:
    DATA.mkdir(parents=True, exist_ok=True)
    for name, url in SOURCES.items():
        dest = DATA / name
        final = DATA / name.replace(".zip", ".xls")
        if final.exists():
            print(f"have {final.name} ({final.stat().st_size / 1e6:.1f} MB)")
            continue
        print(f"fetching {url}")
        try:
            with urllib.request.urlopen(url, timeout=180) as r, dest.open("wb") as fh:
                fh.write(r.read())
        except Exception as e:  # network, TLS, 404 - all fatal for the analysis
            print(f"  failed: {e}", file=sys.stderr)
            return 1
        if dest.suffix == ".zip":
            with zipfile.ZipFile(dest) as z:
                z.extractall(DATA)
            dest.unlink()
        print(f"  wrote {final.name} ({final.stat().st_size / 1e6:.1f} MB)")

    print("\nCite as: Mayer, T. & Zignago, S. (2011), Notes on CEPII's distances "
          "measures: the GeoDist database, CEPII Working Paper 2011-25.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
