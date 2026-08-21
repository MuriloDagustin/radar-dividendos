import * as cheerio from 'cheerio';
import { SourceUnavailableError, TickerNotFoundError, UnexpectedFormatError } from '../errors';
import {
  emptyFundamentals,
  type AssetKind,
  type FundamentalField,
  type PeerContext,
  type PeerMap,
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
  { field: 'roic', labels: ['ROIC'], unit: 'fraction' },
  { field: 'grossMargin', labels: ['Margem Bruta'], unit: 'fraction' },
  { field: 'ebitdaMargin', labels: ['Margem Ebitda', 'Margem Ebtida'], unit: 'fraction' },
  { field: 'netMargin', labels: ['Margem Líquida'], unit: 'fraction' },
  { field: 'currentRatio', labels: ['Liquidez Corrente'], unit: 'multiple' },
  {
    field: 'netDebtToEquity',
    labels: ['Divida Liquida/Patrimônio', 'Dívida Líquida / Patrimônio'],
    unit: 'multiple',
  },
  { field: 'revenueCagr5y', labels: ['CAGR Receitas 5 anos'], unit: 'fraction' },
  { field: 'profitCagr5y', labels: ['CAGR Lucros 5 anos'], unit: 'fraction' },
];

/** Which sector medians the site publishes, keyed by our indicator name. */
const PEER_LABELS: Record<string, string[]> = {
  dividendYield12m: ['Dividend Yield', 'DY'],
  payout: ['Payout'],
  roe: ['ROE'],
  priceEarnings: ['P/L'],
  priceToBook: ['P/VP'],
  netDebtToEbitda: ['Dívida Líquida / Ebitda', 'Divida Liquida/Ebitda'],
};

/**
 * Each card carries the sector, subsector and segment median next to the company's own
 * value. Reading them costs nothing and answers the question a single number cannot: is the
 * paper good, or is the whole sector like this?
 */
export function extractPeers(html: string): PeerMap {
  const $ = cheerio.load(html);
  const byLabel = new Map<string, PeerContext>();

  $('article.indicator-card').each((_, el) => {
    const node = $(el);
    const key = labelKey(node.find('.indicator-card-title').first().text());
    if (!key || byLabel.has(key)) return;

    const context: PeerContext = {};
    node.find('.indicator-card-comparison-row').each((__, row) => {
      const scope = labelKey($(row).find('.indicator-card-comparison-label').first().text());
      const value = parseNumber($(row).find('strong').first().text());
      if (value === null) return;
      if (scope === 'setor') context.sector = value;
      else if (scope === 'subsetor') context.subsector = value;
      else if (scope === 'segmento') context.segment = value;
    });

    if (Object.keys(context).length > 0) byLabel.set(key, context);
  });

  const peers: PeerMap = {};
  for (const [field, labels] of Object.entries(PEER_LABELS)) {
    for (const label of labels) {
      const found = byLabel.get(labelKey(label));
      if (!found) continue;
      // Percent indicators are published in points, same as the values themselves.
      const scale = PERCENT_PEERS.has(field) ? 0.01 : 1;
      peers[field] = {
        ...(found.sector !== undefined ? { sector: found.sector * scale } : {}),
        ...(found.subsector !== undefined ? { subsector: found.subsector * scale } : {}),
        ...(found.segment !== undefined ? { segment: found.segment * scale } : {}),
      };
      break;
    }
  }
  return peers;
}

const PERCENT_PEERS = new Set(['dividendYield12m', 'payout', 'roe']);

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

  const peers = extractPeers(html);

  return {
    source: 'investidor10',
    kind: 'stock',
    fundamentals,
    derived: [],
    ...(Object.keys(peers).length > 0 ? { peers } : {}),
  };
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
