"""
Quantity & unit-price layer (HS6 only).

Reads the raw UN Comtrade monthly chunks in comtrade_monthly_chunks/ — two files
per two-month block, one per side of the mirror — and emits the matched
quantity pairs the Quantity & Price Analysis page reads.

A row survives only when BOTH books report the same HS6 line, in the same month,
for the same partner, measured in the SAME quantity unit. Comparing $/kg against
$/unit would be meaningless, so the unit is part of the join key rather than a
column carried alongside it. Rows are kept at month grain; the yearly basis sums
value and quantity per year in the browser and divides once, so a yearly unit
price is a weighted average and never an average of monthly ratios.

Output: public/data/quantity-hs6.json (columnar, fetched on demand).
Run with: npm run data:quantity
"""
import csv, glob, io, json, os, sys
from collections import defaultdict

ROOT = os.getcwd()
SRC = os.path.join(ROOT, "comtrade_monthly_chunks")
OUT = os.path.join(ROOT, "public", "data", "quantity-hs6.json")

# The chunk files are cp1252, not UTF-8: m² and m³ are mojibake under UTF-8.
ENCODING = "cp1252"
IMPORT_SIDE = "uzbekistan_imports"
SKIP_UNITS = {"N/A", "", "n/a"}

csv.field_size_limit(10_000_000)


def read_side(path, is_import):
    """Fold one chunk file into {(year, month, iso, hs6, unit): [value, qty]}."""
    out = defaultdict(lambda: [0.0, 0.0])
    names, descs = {}, {}
    with io.open(path, encoding=ENCODING, newline="") as fh:
        for r in csv.DictReader(fh):
            if r["hs_level"] != "HS6":
                continue
            unit = (r["quantity_unit"] or "").strip()
            if unit in SKIP_UNITS:
                continue
            try:
                value = float(r["trade_value_usd"] or 0)
                qty = float(r["quantity"] or 0)
            except ValueError:
                continue
            if value <= 0 or qty <= 0:
                continue
            # Uzbekistan is the reporter on the import side, the partner on the
            # export side; the counterparty is what identifies the channel.
            iso = r["partner_iso"] if is_import else r["reporter_iso"]
            if not iso or iso == "UZB":
                continue
            code = r["hs_code"]
            key = (int(r["year"]), int(r["month"]), iso, code, unit)
            e = out[key]
            e[0] += value
            e[1] += qty
            names.setdefault(iso, (r["partner_name"] if is_import else r["reporter_name"]) or iso)
            descs.setdefault(code, r["commodity_name"] or code)
    return out, names, descs


def num(x, big):
    """Integers where the magnitude makes decimals noise, 2dp below that."""
    return int(round(x)) if x >= big else round(x, 2)


def main():
    if not os.path.isdir(SRC):
        sys.exit(f"missing source directory: {SRC}")
    blocks = defaultdict(dict)
    for path in sorted(glob.glob(os.path.join(SRC, "*.csv"))):
        base = os.path.basename(path)
        stem, side = base[:-4].split("__", 2)[0], IMPORT_SIDE in base
        block = base[:-4].rsplit("__", 1)[0]
        blocks[block]["imp" if side else "exp"] = path

    partner_names, code_descs = {}, {}
    rows = []
    matched = imports_only = exports_only = 0

    for block in sorted(blocks):
        pair = blocks[block]
        if "imp" not in pair or "exp" not in pair:
            print(f"  ! {block}: unpaired, skipped", flush=True)
            continue
        imp, n1, d1 = read_side(pair["imp"], True)
        exp, n2, d2 = read_side(pair["exp"], False)
        for src in (n1, n2):
            for k, v in src.items():
                partner_names.setdefault(k, v)
        for src in (d1, d2):
            for k, v in src.items():
                code_descs.setdefault(k, v)
        keys = imp.keys() & exp.keys()
        imports_only += len(imp) - len(keys)
        exports_only += len(exp) - len(keys)
        matched += len(keys)
        for k in keys:
            iv, iq = imp[k]
            ev, eq = exp[k]
            rows.append((k, iv, iq, ev, eq))
        print(f"  {block}: imp {len(imp):6d} exp {len(exp):6d} matched {len(keys):6d}", flush=True)

    if not rows:
        sys.exit("no matched quantity pairs found")

    years = sorted({k[0] for k, *_ in rows})
    y0 = years[0]
    partners = sorted({k[2] for k, *_ in rows})
    codes = sorted({k[3] for k, *_ in rows})
    units = sorted({k[4] for k, *_ in rows})
    pIdx = {v: i for i, v in enumerate(partners)}
    kIdx = {v: i for i, v in enumerate(codes)}
    uIdx = {v: i for i, v in enumerate(units)}

    packed = []
    for (y, m, iso, code, unit), iv, iq, ev, eq in rows:
        packed.append([
            pIdx[iso], kIdx[code], (y - y0) * 12 + (m - 1), uIdx[unit],
            num(iv, 1), num(iq, 100), num(ev, 1), num(eq, 100),
        ])
    packed.sort(key=lambda r: (r[2], r[0], r[1]))

    payload = {
        "v": 1,
        "y0": y0,
        "years": years,
        "p": partners,
        "k": codes,
        "u": units,
        "pn": {k: partner_names[k] for k in partners if k in partner_names},
        "kd": {k: code_descs[k] for k in codes if k in code_descs},
        "r": packed,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with io.open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))

    size = os.path.getsize(OUT) / 1_000_000
    print(f"\nmatched pairs      {matched:,}")
    print(f"import-only cells  {imports_only:,}")
    print(f"export-only cells  {exports_only:,}")
    print(f"partners {len(partners)}  HS6 codes {len(codes)}  units {len(units)}")
    print(f"years {years[0]}-{years[-1]}")
    print(f"wrote {OUT} ({size:.1f} MB)")


if __name__ == "__main__":
    main()
