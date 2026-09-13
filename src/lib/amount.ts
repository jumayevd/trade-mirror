/**
 * Reading a money amount a person typed.
 *
 * Kept out of the component that uses it so the audit can exercise it directly:
 * a parser that silently misreads "2.5m" would change what a filter does
 * without changing anything a rendering test would notice.
 */
/**
 * Accepts what a reader would actually type: "250000", "250k", "2.5m", "1bn",
 * with or without separators or a currency sign. Returns null for anything it
 * cannot read, so a half-typed value never silently becomes a filter.
 */
export function parseAmount(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/[$\s, ]/g, "");
  if (!s) return null;
  const m = /^(\d+(?:\.\d+)?)(k|m|bn|b)?$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) return null;
  const unit = m[2] ?? "";
  const mult = unit === "k" ? 1e3 : unit === "m" ? 1e6 : unit ? 1e9 : 1;
  return Math.round(n * mult);
}
