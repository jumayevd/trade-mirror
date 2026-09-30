"""
Rebuild src/data/official-imports.json from the statistics office's monthly
cumulative import workbook.

    python analysis/build_official_imports.py

Input: data/official/import_data_monthly_cumulative.xlsx — 96 HS chapters x
months 2023-M01 … 2026-M08, cumulative within each year, in THOUSAND USD.
(The workbook is gitignored like the mirror one; only the JSON it produces
ships.) Summing the 96 chapters gives total merchandise imports: the file has
no total row, and 96 is the full chapter set, so nothing is double counted.

The workbook reaches back only to 2023. Earlier years keep the annual totals
already published in the JSON, which is why the two bases are labelled
separately in `basis` — see the note written into the file.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "official" / "import_data_monthly_cumulative.xlsx"
DEST = ROOT / "src" / "data" / "official-imports.json"

THOUSAND = 1_000


def main() -> int:
    prev = json.loads(DEST.read_text(encoding="utf-8"))
    df = pd.read_excel(SRC)
    months = [c for c in df.columns if isinstance(c, str) and "-M" in c]
    assert len(df) == df["Code"].nunique() == 96, "expected one row per HS chapter"

    # one column is one month's cumulative total across every chapter
    total = {c: float(df[c].sum()) * THOUSAND for c in months}
    years = sorted({c[:4] for c in months})

    annual: dict[str, int] = {}
    # years the workbook does not reach keep their published annual totals
    for y, v in prev["annual"].items():
        if y < years[0]:
            annual[y] = v
    for y in years:
        dec = f"{y}-M12"
        if dec in total:
            annual[y] = round(total[dec])

    # the running year carries its cumulative series instead of an annual total
    cumulative: dict[str, list[int]] = {}
    for y in years:
        if y in annual:
            continue
        got = [total[c] for c in months if c.startswith(y)]
        cumulative[y] = [round(v) for v in got]

    doc = {
        "source": "National Statistics Committee of the Republic of Uzbekistan (stat.uz), "
                  "Foreign economic activity — import of goods by HS chapter, monthly cumulative",
        "datasets": {
            "monthlyCumulativeByChapter": "data/official/import_data_monthly_cumulative.xlsx "
                                          f"({years[0]}-M01 … {months[-1]}), 96 HS chapters, thousand USD",
            "annualPre" + years[0]: prev["datasets"]["annual"],
        },
        "retrievedAt": "2026-09-30",
        "units": "USD",
        "basis": {
            f"{years[0]}-onward": "sum of the 96 HS chapters in the monthly cumulative workbook",
            f"pre-{years[0]}": "the previously published annual totals, kept because the workbook "
                               "does not reach back that far",
        },
        "note": "The two bases do not agree over their overlap: the chapter workbook runs about "
                "10–14% above the annual series previously used, and the gap widens through 2026 "
                "(2026-M08: $34.27bn against $29.95bn). Both are published by the statistics "
                "office. Figures from 2023 onward therefore step up relative to 2017–2022, and a "
                "period spanning that boundary mixes the two.",
        "annual": annual,
        "cumulativeByMonth": cumulative,
    }
    DEST.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")

    print(f"wrote {DEST}")
    print(f"  annual  : {min(annual)}–{max(annual)} ({len(annual)} years)")
    for y in years:
        if y in annual:
            print(f"    {y}: ${annual[y] / 1e9:.2f}bn"
                  + (f"   was ${prev['annual'][y] / 1e9:.2f}bn" if y in prev["annual"] else "   (new)"))
    for y, v in cumulative.items():
        print(f"  {y} cumulative: {len(v)} months, latest ${v[-1] / 1e9:.2f}bn")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
