import * as cheerio from 'cheerio';
import { parsePtBrNumber } from '../numbers';
import type { AssetKind, DividendEvent, DividendHistory, DividendYear } from '../types';
import { fetchHtml } from './scraping';

const URL_BASE = 'https://www.fundamentus.com.br';
const SOURCE = 'Fundamentus';

/** Stocks and funds have separate pages, with different column orders. */
const PAGE_FOR: Record<AssetKind, string> = {
  stock: 'proventos.php',
  fii: 'fii_proventos.php',
};

const BR_DATE = /^\d{2}\/\d{2}\/\d{4}$/;

type Rows = string[][];

function rowsOf($: cheerio.CheerioAPI, table: cheerio.Cheerio<never>): Rows {
  const rows: Rows = [];
  table.find('tr').each((_, tr) => {
    const cells: string[] = [];
    $(tr)
      .find('td,th')
      .each((__, cell) => {
        cells.push($(cell).text().replace(/\s+/g, ' ').trim());
      });
    if (cells.length >= 2) rows.push(cells);
  });
  return rows;
}

/**
 * The stock page carries a ready-made year/amount table; the fund page does not, so the
 * fund's yearly totals are summed from its monthly events instead of being invented.
 */
export function extractPerYear(rows: string[][]): DividendYear[] {
  const years: DividendYear[] = [];

  for (const row of rows) {
    const [first, second] = row;
    if (!first || !second) continue;
    if (!/^(19|20)\d{2}$/.test(first)) continue;
    const amount = parsePtBrNumber(second);
    if (amount === null) continue;
    years.push({ year: Number(first), amount });
  }

  return years.sort((a, b) => a.year - b.year);
}

/**
 * Column order differs between the two pages, so the columns are found by shape rather than
 * by position: the first date is the ex-date, the last date is the payment, and the only
 * decimal left is the amount.
 */
export function extractEvents(rows: string[][]): DividendEvent[] {
  const events: DividendEvent[] = [];

  for (const row of rows) {
    const dates = row.filter((cell) => BR_DATE.test(cell));
    if (dates.length === 0) continue;

    const exDate = dates[0];
    if (!exDate) continue;

    const amounts = row
      .filter((cell) => !BR_DATE.test(cell))
      .map((cell) => ({ cell, value: parsePtBrNumber(cell) }))
      .filter((c) => c.value !== null && c.value > 0 && /[,.]/.test(c.cell));
    const amount = amounts[0]?.value;
    if (amount === undefined || amount === null) continue;

    const kind =
      row.find((cell) => /[A-Za-z]{4}/.test(cell) && !BR_DATE.test(cell)) ?? 'PROVENTO';

    events.push({
      exDate,
      paymentDate: dates.length > 1 ? (dates.at(-1) ?? null) : null,
      amount,
      kind,
    });
  }

  return events;
}

/** Yearly totals summed from the events, for the page that has no yearly table. */
export function perYearFromEvents(events: DividendEvent[]): DividendYear[] {
  const totals = new Map<number, number>();

  for (const event of events) {
    const year = Number(event.exDate.slice(6, 10));
    if (!Number.isFinite(year)) continue;
    totals.set(year, (totals.get(year) ?? 0) + event.amount);
  }

  return [...totals.entries()]
    .map(([year, amount]) => ({ year, amount }))
    .sort((a, b) => a.year - b.year);
}

export function parseProventos(html: string): DividendHistory | null {
  const $ = cheerio.load(html);
  let events: DividendEvent[] = [];
  let perYear: DividendYear[] = [];

  for (const table of $('table').toArray()) {
    const rows = rowsOf($, $(table) as unknown as cheerio.Cheerio<never>);
    if (rows.length < 2) continue;

    const asYears = extractPerYear(rows);
    if (asYears.length >= 2 && perYear.length === 0) {
      perYear = asYears;
      continue;
    }

    const asEvents = extractEvents(rows);
    if (asEvents.length > events.length) events = asEvents;
  }

  if (events.length === 0 && perYear.length === 0) return null;
  if (perYear.length === 0) perYear = perYearFromEvents(events);

  return { source: 'fundamentus', perYear, events };
}

/**
 * Optional by design: the dividend record enriches the analysis and never gates it, so any
 * failure returns null and the rest of the report carries on.
 */
export async function fetchProventos(
  ticker: string,
  kind: AssetKind,
): Promise<DividendHistory | null> {
  try {
    const html = await fetchHtml(
      SOURCE,
      `${URL_BASE}/${PAGE_FOR[kind]}?papel=${encodeURIComponent(ticker)}&tipo=2`,
      { charset: 'iso-8859-1' },
    );
    return parseProventos(html);
  } catch {
    return null;
  }
}
