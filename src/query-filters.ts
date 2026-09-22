/** Blank inputs do not filter. Missing values cannot satisfy an explicitly chosen bound. */
export interface NumericRange { min: string; max: string }
export function parseBound(text: string): number | null {
  if (!text.trim()) return null;
  const normalized = text.trim().replace(',', '.');
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return NaN;
  return Number(normalized);
}
export function validRange(range: NumericRange): boolean {
  const min = parseBound(range.min), max = parseBound(range.max);
  return (min === null || Number.isFinite(min)) && (max === null || Number.isFinite(max))
    && (min === null || max === null || min <= max);
}
export function matchesRange(value: number | null, range: NumericRange): boolean {
  if (!validRange(range)) return false;
  const min = parseBound(range.min), max = parseBound(range.max);
  if (min === null && max === null) return true;
  return value !== null && Number.isFinite(value) && (min === null || value >= min) && (max === null || value <= max);
}
