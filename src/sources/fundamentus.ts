import * as cheerio from 'cheerio';
import { SourceUnavailableError, TickerNotFoundError, UnexpectedFormatError } from '../errors';
import { parsePtBrNumber, parsePtBrPercent } from '../numbers';
import {
  emptyFundamentals,
  type AssetKind,
  type FundamentalField,
  type SectorInfo,
  type SourceReading,
} from '../types';

const URL_BASE = 'https://www.fundamentus.com.br/detalhes.php';
const SOURCE = 'Fundamentus';
const TIMEOUT_MS = 20_000;

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * Labels repeated on the page (EBIT, Lucro Líquido, Receita Líquida) show up first in the
 * 12-month column and then in the 3-month one — which is why the first occurrence wins.
 */
export function extractCells(html: string): Map<string, string> {
  const $ = cheerio.load(html);
  const cells = new Map<string, string>();

  $('td.label').each((_, el) => {
    const label = $(el).find('span.txt').first().text().trim();
    if (!label) return;
    const data = $(el).nextAll('td').first();
    if (!data.length || !/\bdata\b/.test(data.attr('class') ?? '')) return;
    if (cells.has(label)) return;
    cells.set(label, data.text().replace(/\s+/g, ' ').trim());
  });

  return cells;
}

/** Labels without which the page is not a recognizable sheet, per asset kind. */
const REQUIRED_LABELS: Record<AssetKind, readonly string[]> = {
  stock: ['Papel', 'Cotação', 'P/L', 'P/VP'],
  fii: ['FII', 'Cotação', 'P/VP'],
};

/** The fund sheet swaps the identity label from "Papel" to "FII". */
function kindOfPage(cells: Map<string, string>): AssetKind {
  return cells.has('FII') ? 'fii' : 'stock';
}

/** The sheet labels the broad sector and the narrower subsector separately. */
export function sectorFromCells(cells: Map<string, string>): SectorInfo | null {
  const sector = cells.get('Setor')?.trim();
  const subsector = cells.get('Subsetor')?.trim();
  if (!sector && !subsector) return null;
  return {
    ...(sector ? { sector } : {}),
    ...(subsector ? { subsector } : {}),
  };
}

export function parseFundamentus(html: string, ticker: string): SourceReading {
  const cells = extractCells(html);

  if (cells.size === 0) {
    // An unknown paper returns HTTP 200 with the search page and no data cell at all.
    throw new TickerNotFoundError(ticker, SOURCE);
  }

  const kind = kindOfPage(cells);

  const missing = REQUIRED_LABELS[kind].filter((label) => !cells.has(label));
  if (missing.length > 0) {
    throw new UnexpectedFormatError(
      SOURCE,
      `rótulos ausentes na ficha de ${kind === 'fii' ? 'FII' : 'ação'} (${missing.join(', ')})`,
    );
  }

  const paper = cells.get(kind === 'fii' ? 'FII' : 'Papel')?.toUpperCase();
  if (paper && paper !== ticker.toUpperCase()) {
    throw new UnexpectedFormatError(
      SOURCE,
      `a página respondeu com o papel "${paper}" para a consulta de "${ticker}"`,
    );
  }

  const text = (label: string): string | null => cells.get(label) ?? null;
  const asNumber = (label: string): number | null => {
    const raw = text(label);
    return raw === null ? null : parsePtBrNumber(raw);
  };
  const asFraction = (label: string): number | null => {
    const raw = text(label);
    return raw === null ? null : parsePtBrPercent(raw);
  };

  const fundamentals = emptyFundamentals();
  fundamentals.price = asNumber('Cotação');
  fundamentals.dividendYield12m = asFraction('Div. Yield');
  fundamentals.priceEarnings = asNumber('P/L');
  fundamentals.priceToBook = asNumber('P/VP');
  fundamentals.roe = asFraction('ROE');
  fundamentals.netDebt = asNumber('Dív. Líquida');
  fundamentals.payout = asFraction('Payout');

  const derived: FundamentalField[] = [];

  const directEbitda = asNumber('EBITDA');
  if (directEbitda !== null) {
    fundamentals.ebitda = directEbitda;
  } else {
    // The sheet has no EBITDA, only "Valor da firma" and "EV / EBITDA". The division is
    // exact but inherits the multiple's 2-decimal rounding, hence the derived mark.
    const enterpriseValue = asNumber('Valor da firma');
    const evToEbitda = asNumber('EV / EBITDA');
    if (enterpriseValue !== null && evToEbitda !== null && evToEbitda !== 0) {
      fundamentals.ebitda = enterpriseValue / evToEbitda;
      derived.push('ebitda');
    }
  }

  const sector = sectorFromCells(cells);

  return { source: 'fundamentus', kind, fundamentals, derived, ...(sector ? { sector } : {}) };
}

export async function fetchFundamentus(ticker: string): Promise<SourceReading> {
  const url = `${URL_BASE}?papel=${encodeURIComponent(ticker)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    throw new SourceUnavailableError(
      SOURCE,
      cause instanceof Error ? cause.message : 'falha de rede',
    );
  }

  if (!response.ok) throw new SourceUnavailableError(SOURCE, `HTTP ${response.status}`);

  // The page is served as ISO-8859-1; decoding it as UTF-8 corrupts "Dív. Líquida".
  const html = new TextDecoder('iso-8859-1').decode(await response.arrayBuffer());

  return parseFundamentus(html, ticker);
}
