import type { DividendEvent, DividendHistory, DividendRecord, DividendYear } from './types';

/**
 * A drop smaller than this is rounding and calendar drift, not a cut: a company paying four
 * quarterly instalments can land 13 payments in one year and 11 in the next.
 */
const CUT_TOLERANCE = 0.05;

/** dd/mm/yyyy is how both Fundamentus pages write dates. */
export function parseBrDate(raw: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Dispersion relative to the level, so a R$0,10 fund and a R$3,00 stock compare. */
export function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) return null;
  const average = mean(values);
  if (average === 0) return null;
  const variance = mean(values.map((v) => (v - average) ** 2));
  return Math.sqrt(variance) / Math.abs(average);
}

/**
 * The running year is excluded from every judgement: it is incomplete by definition, and
 * comparing eight months of payments against twelve would read as a cut every January.
 */
export function completeYears(perYear: DividendYear[], currentYear: number): DividendYear[] {
  return perYear
    .filter((y) => y.year < currentYear && y.amount > 0)
    .sort((a, b) => a.year - b.year);
}

export function countConsecutive(years: DividendYear[]): number {
  if (years.length === 0) return 0;
  let run = 1;
  for (let i = years.length - 1; i > 0; i -= 1) {
    const current = years[i];
    const previous = years[i - 1];
    if (!current || !previous || current.year - previous.year !== 1) break;
    run += 1;
  }
  return run;
}

export function countCuts(years: DividendYear[]): number {
  let cuts = 0;
  for (let i = 1; i < years.length; i += 1) {
    const current = years[i];
    const previous = years[i - 1];
    if (!current || !previous || previous.amount <= 0) continue;
    if ((current.amount - previous.amount) / previous.amount < -CUT_TOLERANCE) cuts += 1;
  }
  return cuts;
}

const INTEREST_ON_CAPITAL = /jrs|juros/i;

/**
 * Interest on capital is taxed at source for an individual while a dividend is not, so the
 * split changes what actually lands in the account.
 */
export function interestOnCapitalShare(events: DividendEvent[], since: Date): number | null {
  const recent = events.filter((e) => {
    const date = parseBrDate(e.exDate);
    return date !== null && date >= since;
  });
  if (recent.length === 0) return null;

  const total = recent.reduce((sum, e) => sum + e.amount, 0);
  if (total <= 0) return null;

  const interest = recent
    .filter((e) => INTEREST_ON_CAPITAL.test(e.kind))
    .reduce((sum, e) => sum + e.amount, 0);

  return interest / total;
}

export function nextPayment(events: DividendEvent[], today: Date): DividendEvent | null {
  const upcoming = events
    .map((e) => ({ event: e, date: e.paymentDate ? parseBrDate(e.paymentDate) : null }))
    .filter((e): e is { event: DividendEvent; date: Date } => e.date !== null && e.date > today)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return upcoming[0]?.event ?? null;
}

export function summarizeDividends(
  history: DividendHistory,
  today: Date = new Date(),
): DividendRecord {
  const years = completeYears(history.perYear, today.getFullYear());
  const last = years.at(-1) ?? null;
  const beforeLast = years.at(-2) ?? null;

  const twelveMonthsAgo = new Date(today);
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

  return {
    yearsPaid: years.length,
    consecutiveYears: countConsecutive(years),
    cuts: countCuts(years),
    variation: coefficientOfVariation(years.map((y) => y.amount)),
    lastFullYear: last,
    lastChange:
      last && beforeLast && beforeLast.amount > 0
        ? (last.amount - beforeLast.amount) / beforeLast.amount
        : null,
    nextPayment: nextPayment(history.events, today),
    interestOnCapitalShare: interestOnCapitalShare(history.events, twelveMonthsAgo),
  };
}
