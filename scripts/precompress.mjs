/**
 * Writes a .gz next to every compressible file of the static export, so the
 * portal server can send bytes as they lie on disk instead of gzipping the
 * bundles — the datasets make several of them tens of megabytes — on every
 * request. Usage: node scripts/precompress.mjs out
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import { gzipSync, constants } from "node:zlib";

const ROOT = process.argv[2] ?? "out";
const TYPES = new Set([".html", ".js", ".css", ".json", ".txt", ".svg", ".map", ".ico"]);
const MIN_BYTES = 1024;

let files = 0, before = 0, after = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) { walk(path); continue; }
    if (!TYPES.has(extname(name)) || st.size < MIN_BYTES) continue;
    const gz = gzipSync(readFileSync(path), { level: constants.Z_BEST_COMPRESSION });
    if (gz.length >= st.size) continue;
    writeFileSync(`${path}.gz`, gz);
    files++; before += st.size; after += gz.length;
  }
}
walk(ROOT);
const mb = (n) => (n / 1048576).toFixed(1);
console.log(`precompress: ${files} files, ${mb(before)} MB → ${mb(after)} MB gzip`);
