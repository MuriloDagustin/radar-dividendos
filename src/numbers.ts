export function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase();
}

const B3_TICKER = /^[A-Z]{4}\d{1,2}$/;

export function looksLikeTicker(ticker: string): boolean {
  return B3_TICKER.test(ticker);
}

export function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Fundamentus writes pt-BR: dot groups thousands, comma is the decimal separator.
 * "-" and "" mark a field the page does not publish, and become null.
 */
export function parsePtBrNumber(raw: string): number | null {
  const clean = raw.replace(/\s+/g, '').replace(/%$/, '');
  if (clean === '' || clean === '-' || clean === '--') return null;
  const numeric = clean.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(numeric)) return null;
  const value = Number(numeric);
  return Number.isFinite(value) ? value : null;
}

export function parsePtBrPercent(raw: string): number | null {
  const value = parsePtBrNumber(raw);
  return value === null ? null : value / 100;
}

export function formatPercent(v: number): string {
  return `${(v * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

export function formatMultiple(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatCurrency(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `R$ ${formatMultiple(v / 1e9)} bi`;
  if (abs >= 1e6) return `R$ ${formatMultiple(v / 1e6)} mi`;
  return `R$ ${formatMultiple(v)}`;
}
