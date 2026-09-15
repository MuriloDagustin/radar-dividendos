import * as cheerio from 'cheerio';
import { UnexpectedFormatError } from '../errors';
import { looksLikeTicker, parsePtBrNumber, parsePtBrPercent } from '../numbers';
import { fetchHtml } from './scraping';

const URL = 'https://www.fundamentus.com.br/resultado.php';
const SOURCE = 'Fundamentus';

/**
 * One row of the site's "todas as ações" table: every listed company in a single request,
 * which makes it the universe the stock screen starts from. Every number is the site's own
 * twelve-month figure; the per-ticker analysis decides, the list only says who to fetch.
 */
export interface StockListing {
  ticker: string;
  /** Company name as the site abbreviates it in the row's tooltip ("PETROBRAS"). */
  name: string | null;
  price: number | null;
  priceEarnings: number | null;
  priceToBook: number | null;
  dividendYield12m: number | null;
  evToEbitda: number | null;
  netMargin: number | null;
  roic: number | null;
  roe: number | null;
  /** Average daily traded value in BRL over two months. Zero means no trades. */
  liquidity: number | null;
  /** Shareholders' equity in BRL. */
  netWorth: number | null;
  netDebtToEquity: number | null;
  revenueCagr5y: number | null;
}

const COLUMNS = [
  'Papel',
  'Cotação',
  'P/L',
  'P/VP',
  'Div.Yield',
  'EV/EBITDA',
  'Mrg. Líq.',
  'ROIC',
  'ROE',
  'Liq.2meses',
  'Patrim. Líq',
  'Dív.Líq/ Patrim.',
  'Cresc. Rec.5a',
] as const;

/** Columns are located by header text, so a column the site adds or moves cannot shift a value. */
function columnIndex($: cheerio.CheerioAPI): Map<string, number> {
  const index = new Map<string, number>();
  $('#resultado thead th').each((i, th) => {
    const label = $(th).text().replace(/\s+/g, ' ').trim();
    if (label && !index.has(label)) index.set(label, i);
  });
  return index;
}

export function parseStockList(html: string): StockListing[] {
  const $ = cheerio.load(html);
  const columns = columnIndex($);

  const missing = COLUMNS.filter((c) => !columns.has(c));
  if (missing.length > 0) {
    throw new UnexpectedFormatError(SOURCE, `colunas ausentes na lista de ações (${missing.join(', ')})`);
  }

  const listings: StockListing[] = [];

  $('#resultado tbody tr').each((_, tr) => {
    const tds = $(tr).find('td').toArray();
    const cells = tds.map((td) => $(td).text().replace(/\s+/g, ' ').trim());

    const text = (column: (typeof COLUMNS)[number]): string | null => {
      const value = cells[columns.get(column) ?? -1];
      return value === undefined || value === '' ? null : value;
    };
    const asNumber = (column: (typeof COLUMNS)[number]): number | null => {
      const raw = text(column);
      return raw === null ? null : parsePtBrNumber(raw);
    };
    const asFraction = (column: (typeof COLUMNS)[number]): number | null => {
      const raw = text(column);
      return raw === null ? null : parsePtBrPercent(raw);
    };

    const ticker = text('Papel')?.toUpperCase() ?? '';
    if (!looksLikeTicker(ticker)) return;

    const tickerCell = tds[columns.get('Papel') ?? -1];
    const name = tickerCell ? ($(tickerCell).find('[title]').first().attr('title')?.trim() ?? null) : null;

    listings.push({
      ticker,
      name: name || null,
      price: asNumber('Cotação'),
      priceEarnings: asNumber('P/L'),
      priceToBook: asNumber('P/VP'),
      dividendYield12m: asFraction('Div.Yield'),
      evToEbitda: asNumber('EV/EBITDA'),
      netMargin: asFraction('Mrg. Líq.'),
      roic: asFraction('ROIC'),
      roe: asFraction('ROE'),
      liquidity: asNumber('Liq.2meses'),
      netWorth: asNumber('Patrim. Líq'),
      netDebtToEquity: asNumber('Dív.Líq/ Patrim.'),
      revenueCagr5y: asFraction('Cresc. Rec.5a'),
    });
  });

  if (listings.length === 0) {
    throw new UnexpectedFormatError(SOURCE, 'a lista de ações veio sem nenhuma linha');
  }

  return listings;
}

export async function fetchStockList(): Promise<StockListing[]> {
  const html = await fetchHtml(SOURCE, URL, { charset: 'iso-8859-1', timeoutMs: 30_000 });
  return parseStockList(html);
}
