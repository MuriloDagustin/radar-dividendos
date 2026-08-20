import { SourceUnavailableError } from '../errors';

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export interface FetchOptions {
  timeoutMs?: number;
  /** Older pages are latin-1; leave utf-8 for everything else. */
  charset?: 'utf-8' | 'iso-8859-1';
}

export async function fetchHtml(
  source: string,
  url: string,
  options: FetchOptions = {},
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
    });
  } catch (cause) {
    throw new SourceUnavailableError(
      source,
      cause instanceof Error ? cause.message : 'falha de rede',
    );
  }

  if (!response.ok) throw new SourceUnavailableError(source, `HTTP ${response.status}`);

  const bytes = await response.arrayBuffer();
  return new TextDecoder(options.charset ?? 'utf-8').decode(bytes);
}

const DIACRITICS = /\p{Diacritic}/gu;
const NOT_LETTER_DIGIT_SLASH = /[^\p{L}\p{N}/]/gu;

/**
 * Site labels arrive dirty: `<wbr>` splits "P/<wbr>L", there are thin spaces, accents and
 * abbreviating dots ("Dív. líquida/EBITDA"). The key throws all of that away so comparison
 * is stable within one site — each scraper still declares the aliases ITS site uses.
 */
export function labelKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(NOT_LETTER_DIGIT_SLASH, '')
    .toLowerCase();
}

/**
 * Reads a number the site wrote in pt-BR or already raw with a dot decimal.
 * `-`, `--` and empty mean "field has no data" and become null, never zero.
 */
export function parseNumber(raw: string): number | null {
  const clean = raw.replace(/\s|%|R\$|×|x/gi, '').trim();
  if (clean === '' || /^-{1,2}$/.test(clean)) return null;

  // "1.234,56" has a decimal comma; "1234.56" already comes raw from the page itself.
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
