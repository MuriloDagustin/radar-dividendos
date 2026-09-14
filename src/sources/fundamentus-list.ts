import * as cheerio from 'cheerio';
import { UnexpectedFormatError } from '../errors';
import { looksLikeTicker, parsePtBrNumber, parsePtBrPercent } from '../numbers';
import { fetchHtml } from './scraping';

const URL = 'https://www.fundamentus.com.br/fii_resultado.php';
const SOURCE = 'Fundamentus';

/**
 * One row of the site's "todos os FIIs" table. It is the only free listing of every fund on
 * the B3 in a single request, which makes it the universe the market screen starts from.
 */
export interface FundListing {
  ticker: string;
  /** The site's coarse segment ("Multicategoria" for a logistics fund) — display only. */
  segment: string | null;
  price: number | null;
  ffoYield: number | null;
  dividendYield12m: number | null;
  priceToBook: number | null;
  /** Market value in BRL. */
  marketCap: number | null;
  /** Average daily traded volume in BRL, as the site computes it. Zero means no trades. */
  liquidity: number | null;
  properties: number | null;
  vacancy: number | null;
}

const COLUMNS = [
  'Papel',
  'Segmento',
  'Cotação',
  'FFO Yield',
  'Dividend Yield',
  'P/VP',
  'Valor de Mercado',
  'Liquidez',
  'Qtd de imóveis',
  'Preço do m2',
  'Aluguel por m2',
  'Cap Rate',
  'Vacância Média',
] as const;

/** Columns are located by header text, so a column the site adds or moves cannot shift a value. */
function columnIndex($: cheerio.CheerioAPI): Map<string, number> {
  const index = new Map<string, number>();
  $('#tabelaResultado thead th').each((i, th) => {
    const label = $(th).text().replace(/\s+/g, ' ').trim();
    if (label && !index.has(label)) index.set(label, i);
  });
  return index;
}

export function parseFundList(html: string): FundListing[] {
  const $ = cheerio.load(html);
  const columns = columnIndex($);

  const missing = COLUMNS.filter((c) => !columns.has(c));
  if (missing.length > 0) {
    throw new UnexpectedFormatError(SOURCE, `colunas ausentes na lista de FIIs (${missing.join(', ')})`);
  }

  const listings: FundListing[] = [];

  $('#tabelaResultado tbody tr').each((_, tr) => {
    const cells = $(tr)
      .find('td')
      .toArray()
      .map((td) => $(td).text().replace(/\s+/g, ' ').trim());

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

    listings.push({
      ticker,
      segment: text('Segmento'),
      price: asNumber('Cotação'),
      ffoYield: asFraction('FFO Yield'),
      dividendYield12m: asFraction('Dividend Yield'),
      priceToBook: asNumber('P/VP'),
      marketCap: asNumber('Valor de Mercado'),
      liquidity: asNumber('Liquidez'),
      properties: asNumber('Qtd de imóveis'),
      vacancy: asFraction('Vacância Média'),
    });
  });

  if (listings.length === 0) {
    throw new UnexpectedFormatError(SOURCE, 'a lista de FIIs veio sem nenhuma linha');
  }

  return listings;
}

export async function fetchFundList(): Promise<FundListing[]> {
  const html = await fetchHtml(SOURCE, URL, { charset: 'iso-8859-1', timeoutMs: 30_000 });
  return parseFundList(html);
}
