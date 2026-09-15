/**
 * The published site has no server: it reads the JSON snapshot the GitHub Action wrote.
 * Paths are absolute and carry the base path, because the app has sub-routes — a relative
 * `data/…` would resolve against `/fiis` instead of the site root.
 */
export const STATIC_SITE = process.env.NEXT_PUBLIC_RADAR_STATIC === '1';

const BASE = process.env.NEXT_PUBLIC_RADAR_BASE_PATH ?? '';

export function analysisUrl(ticker: string, ai: boolean): string {
  const slug = encodeURIComponent(ticker);
  return STATIC_SITE
    ? `${BASE}/data/analise/${slug}.json`
    : `/api/analise/${slug}${ai ? '?ia=1' : ''}`;
}

export function screenUrl(): string {
  return STATIC_SITE ? `${BASE}/data/fiis.json` : '/api/fiis';
}

export function stockScreenUrl(): string {
  return STATIC_SITE ? `${BASE}/data/acoes.json` : '/api/acoes';
}

export const STATIC_ONLY_SCREEN =
  'Na versão publicada só os papéis que passaram pelas triagens têm análise pronta. Para consultar qualquer ticker, rode o projeto localmente.';
