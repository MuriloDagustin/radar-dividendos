import * as cheerio from 'cheerio';
import { SourceUnavailableError, TickerNotFoundError, UnexpectedFormatError } from '../errors';
import {
  emptyFundamentals,
  type AssetKind,
  type FundamentalField,
  type SourceReading,
} from '../types';
import { fetchHtml, labelKey, parseNumber } from './scraping';

const URL_BASE = 'https://investidor10.com.br';
const SOURCE = 'Investidor10';

/** Percentages arrive as percentage points; multiples arrive raw. */
type Unit = 'fraction' | 'multiple';

interface FieldMapping {
  field: FundamentalField;
  labels: string[];
  unit: Unit;
}

const STOCK_MAPPING: FieldMapping[] = [
  { field: 'dividendYield12m', labels: ['Dividend Yield', 'DY'], unit: 'fraction' },
  { field: 'payout', labels: ['Payout'], unit: 'fraction' },
  { field: 'roe', labels: ['ROE'], unit: 'fraction' },
  { field: 'priceEarnings', labels: ['P/L'], unit: 'multiple' },
  { field: 'priceToBook', labels: ['P/VP'], unit: 'multiple' },
  {
    field: 'netDebtToEbitda',
    labels: ['Dívida Líquida / Ebitda', 'Divida Liquida/Ebitda'],
    unit: 'multiple',
  },
];

/**
 * The site carries the raw, unrounded value in the history button's `data-current-value` —
 * better than re-parsing the formatted string in `.indicator-card-value`.
 */
export function extractIndicators(html: string): Map<string, number> {
  const $ = cheerio.load(html);
  const values = new Map<string, number>();

  $('[data-indicator][data-current-value]').each((_, el) => {
    const key = labelKey($(el).attr('data-indicator') ?? '');
    if (!key || values.has(key)) return;
    const value = parseNumber($(el).attr('data-current-value') ?? '');
    if (value !== null) values.set(key, value);
  });

  $('article.indicator-card').each((_, el) => {
    const node = $(el);
    const key = labelKey(node.find('.indicator-card-title').first().text());
    if (!key || values.has(key)) return;
    const value = parseNumber(node.find('.indicator-card-value').first().text());
    if (value !== null) values.set(key, value);
  });

  return values;
}

/** The first chunk of the card body is the value; the rest is the day's change. */
function leadingNumber(raw: string): number | null {
  const chunk = raw.trim().split(/\s{2,}|\n/)[0] ?? raw;
  return parseNumber(chunk.replace(/\s+/g, ' ').split(' ').slice(0, 2).join(''));
}

export function extractQuote(html: string): number | null {
  const $ = cheerio.load(html);
  return leadingNumber($('div._card.cotacao ._card-body').first().text());
}

/**
 * The fund sheet does not use `indicator-card`: a fund's few indicators live in the header
 * cards, whose heading is prefixed with the ticker ("MXRF11 DY (12M)").
 */
export function extractFundCards(html: string): Map<string, number> {
  const $ = cheerio.load(html);
  const values = new Map<string, number>();

  $('div._card').each((_, el) => {
    const node = $(el);
    if ((node.attr('class') ?? '').includes('ranking')) return;

    const key = labelKey(node.find('._card-header').first().text());
    const value = leadingNumber(node.find('._card-body').first().text());
    if (value === null) return;

    if (key.includes('dy12m') && !values.has('dy')) values.set('dy', value);
    else if (key.includes('p/vp') && !values.has('p/vp')) values.set('p/vp', value);
    else if (key.includes('cotacao') && !values.has('quote')) values.set('quote', value);
  });

  return values;
}

function parseFund(html: string): SourceReading {
  const cards = extractFundCards(html);

  if (!cards.has('dy') && !cards.has('p/vp')) {
    throw new UnexpectedFormatError(SOURCE, 'ficha de FII sem DY nem P/VP nos cartões do topo');
  }

  const fundamentals = emptyFundamentals();
  fundamentals.price = cards.get('quote') ?? null;
  const dy = cards.get('dy');
  if (dy !== undefined) fundamentals.dividendYield12m = dy / 100;
  fundamentals.priceToBook = cards.get('p/vp') ?? null;

  return { source: 'investidor10', kind: 'fii', fundamentals, derived: [] };
}

export function parseInvestidor10(
  html: string,
  ticker: string,
  kind: AssetKind = 'stock',
): SourceReading {
  if (kind === 'fii') return parseFund(html);

  const $ = cheerio.load(html);

  // An unknown paper lands on a page that builds no indicator card at all.
  if ($('article.indicator-card').length === 0) {
    throw new TickerNotFoundError(ticker, SOURCE);
  }

  const indicators = extractIndicators(html);
  if (indicators.size === 0) {
    throw new UnexpectedFormatError(
      SOURCE,
      'os cartões de indicador existem mas nenhum valor foi lido',
    );
  }

  const essential = ['p/l', 'p/vp', 'roe'];
  if (!essential.some((key) => indicators.has(key))) {
    throw new UnexpectedFormatError(
      SOURCE,
      `nenhum indicador essencial encontrado (${essential.join(', ')})`,
    );
  }

  const fundamentals = emptyFundamentals();
  fundamentals.price = extractQuote(html);

  for (const { field, labels, unit } of STOCK_MAPPING) {
    for (const label of labels) {
      const value = indicators.get(labelKey(label));
      if (value === undefined) continue;
      fundamentals[field] = unit === 'fraction' ? value / 100 : value;
      break;
    }
  }

  return { source: 'investidor10', kind: 'stock', fundamentals, derived: [] };
}

function wrongRoute(error: unknown): boolean {
  return error instanceof SourceUnavailableError && /HTTP (404|410)/.test(error.message);
}

/**
 * Stocks and funds live on different routes, and the site answers 404/410 on the wrong one
 * — that is how the asset kind is discovered, with no ticker list to maintain.
 */
export async function fetchInvestidor10(ticker: string): Promise<SourceReading> {
  const slug = encodeURIComponent(ticker.toLowerCase());

  try {
    return parseInvestidor10(await fetchHtml(SOURCE, `${URL_BASE}/acoes/${slug}/`), ticker, 'stock');
  } catch (error) {
    if (!wrongRoute(error)) throw error;
  }

  try {
    return parseInvestidor10(await fetchHtml(SOURCE, `${URL_BASE}/fiis/${slug}/`), ticker, 'fii');
  } catch (error) {
    if (wrongRoute(error)) throw new TickerNotFoundError(ticker, SOURCE);
    throw error;
  }
}
