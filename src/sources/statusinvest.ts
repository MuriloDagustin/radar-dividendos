import * as cheerio from 'cheerio';
import { SourceUnavailableError, TickerNotFoundError, UnexpectedFormatError } from '../errors';
import {
  emptyFundamentals,
  type AssetKind,
  type FundamentalField,
  type SourceReading,
} from '../types';
import { fetchHtml, labelKey, parseNumber } from './scraping';

const URL_BASE = 'https://statusinvest.com.br';
const SOURCE = 'StatusInvest';

const PATH_FOR: Record<AssetKind, string> = {
  stock: 'acoes',
  fii: 'fundos-imobiliarios',
};

type Unit = 'fraction' | 'multiple';

interface FieldMapping {
  field: FundamentalField;
  labels: string[];
  unit: Unit;
}

/** The site's payout is flagged BETA with no firm value, so it stays out. */
const MAPPING: FieldMapping[] = [
  { field: 'price', labels: ['Valor atual'], unit: 'multiple' },
  { field: 'dividendYield12m', labels: ['D.Y', 'Dividend Yield'], unit: 'fraction' },
  { field: 'roe', labels: ['ROE'], unit: 'fraction' },
  { field: 'priceEarnings', labels: ['P/L'], unit: 'multiple' },
  { field: 'priceToBook', labels: ['P/VP'], unit: 'multiple' },
  {
    field: 'netDebtToEbitda',
    labels: ['Dív. líquida/EBITDA', 'Dívida líquida/EBITDA'],
    unit: 'multiple',
  },
];

/**
 * The page repeats every indicator in a comparison block filled with "-". The first
 * occurrence carrying a number is the paper's; the rest are discarded.
 */
export function extractIndicators(html: string): Map<string, number> {
  const $ = cheerio.load(html);
  const values = new Map<string, number>();

  $('div.info, div[class*="item"]').each((_, el) => {
    const node = $(el);
    // The help bubble lives inside the title and would glue its explanation to the label.
    const title = node.find('h3.title, h3, span.title, .title').first().clone();
    title.find('.help, [class*="popover"], [class*="tooltip"], svg, i').remove();

    const key = labelKey(title.text());
    if (!key || values.has(key)) return;

    const value = parseNumber(node.find('strong.value, .value').first().text());
    if (value !== null) values.set(key, value);
  });

  return values;
}

export function parseStatusInvest(
  html: string,
  ticker: string,
  kind: AssetKind = 'stock',
): SourceReading {
  const indicators = extractIndicators(html);

  if (indicators.size === 0) throw new TickerNotFoundError(ticker, SOURCE);

  const essential = kind === 'fii' ? ['p/vp', 'dividendyield'] : ['p/l', 'p/vp', 'roe'];
  if (!essential.some((key) => indicators.has(key))) {
    throw new UnexpectedFormatError(
      SOURCE,
      `nenhum indicador essencial encontrado (${essential.join(', ')})`,
    );
  }

  const fundamentals = emptyFundamentals();

  for (const { field, labels, unit } of MAPPING) {
    for (const label of labels) {
      const value = indicators.get(labelKey(label));
      if (value === undefined) continue;
      fundamentals[field] = unit === 'fraction' ? value / 100 : value;
      break;
    }
  }

  return { source: 'statusinvest', kind, fundamentals, derived: [] };
}

/** The wrong route answers 404, and that is how the asset kind is discovered. */
export async function fetchStatusInvest(ticker: string): Promise<SourceReading> {
  const slug = encodeURIComponent(ticker.toLowerCase());

  try {
    const html = await fetchHtml(SOURCE, `${URL_BASE}/${PATH_FOR.stock}/${slug}`);
    return parseStatusInvest(html, ticker, 'stock');
  } catch (error) {
    const mayBeFund =
      (error instanceof SourceUnavailableError && /HTTP (404|410)/.test(error.message)) ||
      error instanceof TickerNotFoundError ||
      error instanceof UnexpectedFormatError;
    if (!mayBeFund) throw error;
  }

  const html = await fetchHtml(SOURCE, `${URL_BASE}/${PATH_FOR.fii}/${slug}`);
  return parseStatusInvest(html, ticker, 'fii');
}
