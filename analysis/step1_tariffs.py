"""
Step 1 - parse Uzbekistan's import tariff schedule (TN VED 2022, HS10).

    python analysis/step1_tariffs.py

Reads ../tariffs.xlsx and writes analysis/out/tariffs_hs10.csv and
analysis/out/tariffs_hs6.csv. Every rate is parsed, never approximated: the
parse rate has to be 100% or the failures are printed for inspection, because a
silently dropped line would quietly bias the freight sample in Step 3.

Rate grammar actually present in the file (surveyed, not assumed):

    plain            "10"                                        -> 10% ad valorem
    compound minimum "20, no ne menee 0,3 doll. USA za kg"       -> 20% with a $0.30/kg floor
    additive         "70 + 3 doll. USA za kub. sm"               -> 70% plus $3/cm3
    multi-tier       "1. 5 %\n2. 15 %"                           -> tier 1 is the base rate
    pure specific    "5 doll. USA za kg"                          -> absent from this schedule

Tiers may themselves be compound or additive, the separator is "za" or "/", the
decimal mark is a comma, and units appear both abbreviated and spelled out.
"""

from __future__ import annotations

import csv
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent
SRC = ROOT.parent.parent / "tariffs.xlsx"
OUT = ROOT / "out"
SHEET = "Ставки пошлин"

# Column positions in the sheet, which carries two header rows worth of text in one.
COL_HS10, COL_UNIT, COL_MFN, COL_NON_MFN, COL_SPEC_CODE, COL_SPEC_UNIT = 0, 1, 2, 3, 4, 5

#: Russian unit names, abbreviated and spelled out, to a stable token.
UNITS = {
    "кг": "kg",
    "шт": "unit",
    "штук": "unit",
    "л": "l",
    "литр": "l",
    "литра": "l",
    "пар": "pair",
    "пары": "pair",
    "м2": "m2",
    "кв. м": "m2",
    "куб. см": "cm3",
    "куб.см": "cm3",
    "1000 шт": "1000_units",
}

MONEY = r"(\d+(?:[.,]\d+)?)\s*долл\.?\s*США"
SEP = r"(?:за|/)"
RE_PLAIN = re.compile(r"^(\d+(?:[.,]\d+)?)\s*%?$")
RE_MIN = re.compile(rf"^(\d+(?:[.,]\d+)?)\s*%?\s*,?\s*но\s+не\s+менее\s+{MONEY}\s*{SEP}\s*(.+?)\.?$", re.I)
RE_PLUS = re.compile(rf"^(\d+(?:[.,]\d+)?)\s*%?\s*\+\s*{MONEY}\s*{SEP}\s*(.+?)\.?$", re.I)
RE_SPEC = re.compile(rf"^{MONEY}\s*{SEP}\s*(.+?)\.?$", re.I)
RE_TIER = re.compile(r"^\s*\d+\.\s*")


def num(s: str) -> float:
    """Rates use a decimal comma; the thousands separator never appears."""
    return float(s.replace(",", "."))


def unit(raw: str) -> str:
    key = raw.strip().rstrip(".").lower()
    if key in UNITS:
        return UNITS[key]
    # "куб. см" arrives with assorted spacing
    squashed = re.sub(r"\s+", " ", key)
    return UNITS.get(squashed, squashed)


class ParseError(ValueError):
    pass


def parse_simple(raw: str) -> dict:
    """One rate expression: plain, compound-minimum, additive or pure specific."""
    s = re.sub(r"\s+", " ", raw.strip()).strip()
    m = RE_PLAIN.match(s)
    if m:
        return {"adv": num(m.group(1)), "spec": None, "spec_unit": None, "type": "adv"}
    m = RE_MIN.match(s)
    if m:
        return {"adv": num(m.group(1)), "spec": num(m.group(2)), "spec_unit": unit(m.group(3)),
                "type": "adv_min_spec"}
    m = RE_PLUS.match(s)
    if m:
        return {"adv": num(m.group(1)), "spec": num(m.group(2)), "spec_unit": unit(m.group(3)),
                "type": "adv_plus_spec"}
    m = RE_SPEC.match(s)
    if m:
        return {"adv": 0.0, "spec": num(m.group(1)), "spec_unit": unit(m.group(2)), "type": "spec"}
    raise ParseError(s)


def parse_rate(raw: object) -> dict:
    """
    Parse one cell. Multi-tier cells take tier 1 as the base rate — the schedule
    lists tiers in ascending preference order, so tier 1 is what an ordinary
    importer faces — and record the highest ad valorem across all tiers, which is
    the worst case a cell can attract.
    """
    if raw is None:
        raise ParseError("<empty>")
    s = str(raw).strip()
    if s == "":
        raise ParseError("<empty>")

    tiers = [t for t in (x.strip() for x in s.splitlines()) if t]
    if len(tiers) > 1 or RE_TIER.match(tiers[0]):
        parsed = [parse_simple(RE_TIER.sub("", t)) for t in tiers]
        base = parsed[0]
        return {**base, "type": "tiered", "adv_max": max(p["adv"] for p in parsed), "tiers": len(parsed)}
    one = parse_simple(tiers[0])
    return {**one, "adv_max": one["adv"], "tiers": 1}


def main() -> int:
    if not SRC.exists():
        print(f"missing {SRC}", file=sys.stderr)
        return 1
    OUT.mkdir(parents=True, exist_ok=True)

    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    ws = wb[SHEET]
    rows = list(ws.iter_rows(min_row=2, values_only=True))

    parsed, failures = [], []
    types = Counter()
    for r in rows:
        hs10 = str(r[COL_HS10]).strip()
        try:
            mfn = parse_rate(r[COL_MFN])
            non = parse_rate(r[COL_NON_MFN])
        except ParseError as e:
            failures.append((hs10, str(r[COL_MFN]), str(e)))
            continue
        types[mfn["type"]] += 1
        parsed.append({
            "hs10": hs10,
            "hs6": hs10[:6],
            "hs4": hs10[:4],
            "hs2": hs10[:2],
            "mfn_adv": mfn["adv"],
            "mfn_spec_usd": mfn["spec"],
            "mfn_spec_unit": mfn["spec_unit"],
            "rate_type": mfn["type"],
            "mfn_adv_max": mfn["adv_max"],
            "tiers": mfn["tiers"],
            "non_mfn_adv": non["adv"],
            "non_mfn_adv_max": non["adv_max"],
            "declared_spec_unit": unit(str(r[COL_SPEC_UNIT])) if r[COL_SPEC_UNIT] else None,
        })

    total = len(rows)
    ok = len(parsed)
    print(f"rows: {total:,}   parsed: {ok:,}   parse rate: {100 * ok / total:.2f}%")
    if failures:
        print(f"\nFAILURES ({len(failures)}):")
        for hs10, raw, err in failures[:50]:
            print(f"  {hs10}  {raw!r}  -> {err!r}")
        print("\nparse rate is not 100%; stopping rather than modelling on a biased subset")
        return 1

    print("\nrate types (MFN):")
    for t, c in types.most_common():
        print(f"  {t:16} {c:>7,}  {100 * c / ok:5.1f}%")

    # the declared specific-unit column is a cross-check on the parse, not an input
    mism = [p for p in parsed if p["mfn_spec_unit"] and p["declared_spec_unit"]
            and p["mfn_spec_unit"] != p["declared_spec_unit"]]
    have_spec = [p for p in parsed if p["mfn_spec_unit"]]
    print(f"\nspecific-rate units: parsed on {len(have_spec):,} lines; "
          f"disagreements with the sheet's own unit column: {len(mism)}")
    for p in mism[:10]:
        print(f"  {p['hs10']}  parsed {p['mfn_spec_unit']} vs declared {p['declared_spec_unit']}")

    with (OUT / "tariffs_hs10.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(parsed[0].keys()))
        w.writeheader()
        w.writerows(parsed)

    # ---- HS6 aggregate, and the clean-freight flag Step 3 depends on ----
    by6: dict[str, list[dict]] = defaultdict(list)
    for p in parsed:
        by6[p["hs6"]].append(p)

    hs6_rows = []
    for hs6, lines in sorted(by6.items()):
        clean = all(
            l["mfn_adv"] == 0 and l["mfn_spec_usd"] is None and l["rate_type"] == "adv"
            for l in lines
        )
        hs6_rows.append({
            "hs6": hs6,
            "hs4": hs6[:4],
            "hs2": hs6[:2],
            "hs10_lines": len(lines),
            # the rate an importer of this HS6 typically faces, and the worst case
            "mfn_adv_mean": round(sum(l["mfn_adv"] for l in lines) / len(lines), 4),
            "mfn_adv_max": max(l["mfn_adv_max"] for l in lines),
            "any_specific": any(l["mfn_spec_usd"] is not None for l in lines),
            "any_tiered": any(l["rate_type"] == "tiered" for l in lines),
            "all_zero_duty": all(l["mfn_adv"] == 0 for l in lines),
            "freight_clean_sample": clean,
        })

    with (OUT / "tariffs_hs6.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(hs6_rows[0].keys()))
        w.writeheader()
        w.writerows(hs6_rows)

    n_clean = sum(1 for r in hs6_rows if r["freight_clean_sample"])
    print(f"\nHS6 lines: {len(hs6_rows):,}")
    print(f"  freight_clean_sample = TRUE: {n_clean:,} ({100 * n_clean / len(hs6_rows):.1f}%)")
    print(f"  all zero duty but excluded by a specific or tiered component: "
          f"{sum(1 for r in hs6_rows if r['all_zero_duty'] and not r['freight_clean_sample']):,}")
    print(f"  mean MFN ad valorem across HS6: "
          f"{sum(r['mfn_adv_mean'] for r in hs6_rows) / len(hs6_rows):.2f}%")
    print(f"\nwrote {OUT / 'tariffs_hs10.csv'} and {OUT / 'tariffs_hs6.csv'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
