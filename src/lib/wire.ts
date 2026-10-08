/**
 * The compact form the browser downloads the row tables in.
 *
 * The data files (src/data/cells.json, monthly.json, annualized-hs6.json and
 * public/data/monthly-hs6.json) are row tables: dictionaries plus `r`, an array
 * of fixed-order integer tuples. Stored row by row, every tuple repeats its
 * brackets and commas, and a partner or code index that changes slowly down the
 * table costs as many digits on every row as it would if it jumped about.
 *
 * Here the same table is stored column by column, in the ORIGINAL row order,
 * and a column whose values run in near-sequence (an index, a period offset)
 * keeps the difference from the row above instead of the value. Nothing is
 * rounded or dropped — every dollar survives — and decodePacked() rebuilds the
 * table exactly, including rows of different lengths. scripts/build-wire.ts
 * writes these files and refuses to if a single value fails to round-trip.
 *
 * The canonical files stay what every data script reads and writes; only the
 * app reads the wire form.
 */

/** A row table: any dictionary fields plus integer tuples in `r`. */
export interface PackedTable { r: number[][]; [field: string]: unknown }

export interface WireRows {
  /** Row count. */
  n: number;
  /** Run-length row lengths: [length, count, length, count, …]. */
  lens: number[];
  /** Per column: "d" stores differences from the previous row, "p" plain values. */
  modes: string;
  /** Column c holds the c-th value of every row at least c+1 long, in row order. */
  cols: number[][];
}

/** A row table with `r` swapped for its column form. */
export interface WireTable { rw: WireRows; [field: string]: unknown }

/** Digits a column costs as JSON text — the proxy for which mode compresses better. */
const textCost = (a: number[]): number => {
  let n = 0;
  for (const v of a) n += String(v).length + 1;
  return n;
};

export function encodeRows(rows: number[][]): WireRows {
  let width = 0;
  for (const r of rows) if (r.length > width) width = r.length;
  const lens: number[] = [];
  for (const r of rows) {
    if (lens.length && lens[lens.length - 2] === r.length) lens[lens.length - 1]++;
    else lens.push(r.length, 1);
  }
  const cols: number[][] = [];
  let modes = "";
  for (let c = 0; c < width; c++) {
    const plain: number[] = [];
    for (const r of rows) if (r.length > c) plain.push(r[c]);
    const diff = plain.map((v, i) => (i ? v - plain[i - 1] : v));
    const delta = textCost(diff) < textCost(plain);
    cols.push(delta ? diff : plain);
    modes += delta ? "d" : "p";
  }
  return { n: rows.length, lens, modes, cols };
}

export function decodeRows(w: WireRows): number[][] {
  const out: number[][] = new Array(w.n);
  const width = w.cols.length;
  const delta = Array.from({ length: width }, (_, c) => w.modes[c] === "d");
  const at = new Array<number>(width).fill(0);
  const prev = new Array<number>(width).fill(0);
  let i = 0;
  for (let li = 0; li < w.lens.length; li += 2) {
    const len = w.lens[li];
    for (let k = w.lens[li + 1]; k > 0; k--) {
      const row = new Array<number>(len);
      for (let c = 0; c < len; c++) {
        const v = w.cols[c][at[c]++];
        if (delta[c]) { prev[c] += v; row[c] = prev[c]; } else row[c] = v;
      }
      out[i++] = row;
    }
  }
  if (i !== w.n) throw new Error(`wire table: expected ${w.n} rows, decoded ${i}`);
  return out;
}

export function encodePacked<T extends PackedTable>(table: T): WireTable {
  const { r, ...fields } = table;
  return { ...fields, rw: encodeRows(r) };
}

/** The canonical table again — same fields, same rows, same order. */
export function decodePacked<T = PackedTable>(wire: WireTable): T {
  const { rw, ...fields } = wire;
  return { ...fields, r: decodeRows(rw) } as unknown as T;
}
