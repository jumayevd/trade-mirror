"""Validate the HS label batches: script mixing, stray glyphs, length sanity.

    python scripts/check-labels.py

Run from the repository root after editing any scripts/labels-text*.json.
"""
import glob, json, os, re, sys

ROOT = r"D:\Housing Demand CBU\Trade Mirror\trade-mirror"
todo = set(json.load(open(os.path.join(ROOT, "scripts", "labels-text.todo.json"), encoding="utf-8")))
meta = json.load(open(os.path.join(ROOT, "src", "data", "meta.json"), encoding="utf-8"))
valid = set(meta["hs4labels"].values()) | set(meta["hs6labels"].values()) | {c["label"] for c in meta["chapters"]}

CYR = re.compile(r"[А-Яа-яЁё]")
LAT = re.compile(r"[A-Za-z]")
# anything outside Latin, Cyrillic, digits, and ordinary punctuation is suspect
STRAY = re.compile(r"[^\u0000-\u024F\u0400-\u04FF\u2010-\u2027\u02BB\u02BC\u2018\u2019\u201C\u201D\s]")

problems = []
seen = {}
for f in sorted(glob.glob(os.path.join(ROOT, "scripts", "labels-text-*.json"))):
    d = json.load(open(f, encoding="utf-8"))
    name = os.path.basename(f)
    for en, (ru, uz) in d.items():
        if en not in valid:
            problems.append(f"{name}: KEY NOT IN DATASET -> {en[:60]!r}")
        if en in seen:
            problems.append(f"{name}: duplicate key (also in {seen[en]}) -> {en[:50]!r}")
        seen[en] = name
        for lang, s in (("ru", ru), ("uz", uz)):
            if not s.strip():
                problems.append(f"{name}: empty {lang} for {en[:50]!r}")
                continue
            m = STRAY.search(s)
            if m:
                problems.append(f"{name}: stray glyph {m.group()!r} in {lang}: {s[:70]!r}")
            # Russian must be Cyrillic-dominant; Uzbek Latin must carry no Cyrillic
            if lang == "ru" and not CYR.search(s):
                problems.append(f"{name}: ru has no Cyrillic: {s[:70]!r}")
            if lang == "uz" and CYR.search(s):
                problems.append(f"{name}: uz contains Cyrillic: {s[:70]!r}")
            if en.endswith("…") and not s.endswith("…"):
                problems.append(f"{name}: {lang} lost the trailing ellipsis: {s[-40:]!r}")
            if len(s) > 3 * len(en) + 40:
                problems.append(f"{name}: {lang} implausibly long vs source: {s[:60]!r}")

print(f"checked {len(seen)} entries across {len(glob.glob(os.path.join(ROOT, 'scripts', 'labels-text-*.json')))} batch files")
print(f"remaining untranslated: {len(todo - set(seen))}")
if problems:
    print(f"\n{len(problems)} PROBLEMS:")
    for p in problems[:40]:
        print("  " + p)
    sys.exit(1)
print("no problems found")
