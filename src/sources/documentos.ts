import * as cheerio from 'cheerio';
import type { AssetKind, Filing, FilingIndex } from '../types';
import { fetchHtml, labelKey } from './scraping';

const URL_BASE = 'https://www.fundamentus.com.br';
const SOURCE = 'Fundamentus';

/** Companies file quarterly results with the CVM; funds publish a monthly management report on FNET. */
const PAGE_FOR: Record<AssetKind, string> = {
  stock: 'resultados_trimestrais.php',
  fii: 'fii_relatorios.php',
};

export function documentsUrl(ticker: string, kind: AssetKind): string {
  const page = PAGE_FOR[kind];
  const suffix = kind === 'stock' ? '&tipo=1' : '';
  return `${URL_BASE}/${page}?papel=${encodeURIComponent(ticker)}${suffix}`;
}

const COLUMN_FOR: Record<string, keyof Omit<Filing, 'period'>> = {
  [labelKey('Release de Resultados')]: 'reportUrl',
  [labelKey('Relatório Gerencial')]: 'reportUrl',
  [labelKey('Demonstração Financeira')]: 'statementsUrl',
};

/** "30/06/2026" and "08/2026" both sort by year, then month, then day. */
function periodKey(period: string): number | null {
  const parts = period.split('/').map(Number);
  if (parts.some((p) => !Number.isInteger(p))) return null;
  if (parts.length === 3) {
    const [day, month, year] = parts as [number, number, number];
    return year * 10_000 + month * 100 + day;
  }
  if (parts.length === 2) {
    const [month, year] = parts as [number, number];
    return year * 10_000 + month * 100;
  }
  return null;
}

/**
 * Both pages share one table shape: a reference-period column followed by one column per
 * document, each holding a link. Columns are matched by header so the two pages, and any
 * reordering, read the same way. Returns the most recent period, or null when the page has
 * no table — which is also what Fundamentus serves for a paper it does not know.
 */
export function parseDocumentos(html: string, indexUrl: string): FilingIndex | null {
  const $ = cheerio.load(html);
  const table = $('table')
    .filter((_, t) => labelKey($(t).find('th').first().text()) === labelKey('Data Referência'))
    .first();
  if (table.length === 0) return null;

  const columns: Array<keyof Omit<Filing, 'period'> | null> = [];
  table.find('thead th').each((_, th) => {
    columns.push(COLUMN_FOR[labelKey($(th).text())] ?? null);
  });

  let latest: { key: number; filing: Filing } | null = null;
  table.find('tbody tr').each((_, tr) => {
    const cells = $(tr).find('td');
    const period = cells.first().text().trim();
    const key = periodKey(period);
    if (key === null) return;

    const filing: Filing = { period, reportUrl: null, statementsUrl: null };
    cells.each((index, td) => {
      const field = columns[index];
      const href = $(td).find('a[href]').attr('href')?.trim();
      if (field && href) filing[field] = href;
    });
    if (filing.reportUrl === null && filing.statementsUrl === null) return;

    if (!latest || key > latest.key) latest = { key, filing };
  });

  if (!latest) return null;
  return { source: 'fundamentus', indexUrl, latest: (latest as { filing: Filing }).filing };
}

/**
 * Optional by design, like the dividend history: a link to the filing helps the reader
 * check a distorted number, and its absence must never cost the analysis.
 */
export async function fetchDocumentos(
  ticker: string,
  kind: AssetKind,
): Promise<FilingIndex | null> {
  const url = documentsUrl(ticker, kind);
  try {
    const html = await fetchHtml(SOURCE, url, { charset: 'iso-8859-1' });
    return parseDocumentos(html, url);
  } catch {
    return null;
  }
}

const QUARTER_END_MONTH: Record<number, number> = { 3: 1, 6: 2, 9: 3, 12: 4 };

/**
 * The one link worth showing next to a number, worded for what the reader will open:
 * the results release for a company (falling back to the statements when the company filed
 * none), the management report for a fund. "2T26" is how the releases themselves are named.
 */
export function primaryDocument(
  index: FilingIndex,
  kind: AssetKind,
): { label: string; url: string } {
  const { period, reportUrl, statementsUrl } = index.latest;

  if (kind === 'fii') {
    return { label: `relatório gerencial de ${period}`, url: reportUrl ?? index.indexUrl };
  }

  const [, month, year] = period.split('/').map(Number);
  const quarter = month !== undefined ? QUARTER_END_MONTH[month] : undefined;
  const when =
    quarter !== undefined && year !== undefined
      ? `do ${quarter}T${String(year).slice(-2)}`
      : `de ${period}`;

  if (reportUrl) return { label: `release de resultados ${when}`, url: reportUrl };
  if (statementsUrl) return { label: `demonstrações financeiras ${when}`, url: statementsUrl };
  return { label: 'documentos de resultado', url: index.indexUrl };
}
