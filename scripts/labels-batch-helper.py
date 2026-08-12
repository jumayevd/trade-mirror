"""Attach a batch of translations to the exact English keys, by index.

Import `emit` from a throwaway script that holds the RU/UZ lists:

    from labels_batch_helper import emit
    emit(0, "labels-text-02.json", RU, UZ)

Keys are copied from scripts/labels-text.todo.json rather than retyped, so a
translation can never be attached to a subtly different English string.
"""
import json, os, sys

ROOT = r"D:\Housing Demand CBU\Trade Mirror\trade-mirror"
todo = json.load(open(os.path.join(ROOT, "scripts", "labels-text.todo.json"), encoding="utf-8"))


def emit(start, outfile, ru, uz):
    assert len(ru) == len(uz), f"ru {len(ru)} vs uz {len(uz)}"
    keys = todo[start:start + len(ru)]
    assert len(keys) == len(ru), f"only {len(keys)} keys left from {start}"
    out = {k: [ru[i], uz[i]] for i, k in enumerate(keys)}
    path = os.path.join(ROOT, "scripts", outfile)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"wrote {outfile}: {len(out)} entries, keys {start}..{start + len(ru) - 1}")
    print(f"  first: {keys[0][:60]}")
    print(f"  last:  {keys[-1][:60]}")
