/**
 * The published site has no server: it reads the JSON snapshot the GitHub Action wrote.
 * Paths are relative on purpose — the page lives at the root of its base path in both
 * modes, so `api/...` and `data/...` resolve without knowing the base.
 */
export const STATIC_SITE = process.env.NEXT_PUBLIC_RADAR_STATIC === '1';

export function analysisUrl(ticker: string, ai: boolean): string {
  const slug = encodeURIComponent(ticker);
  return STATIC_SITE ? `data/analise/${slug}.json` : `api/analise/${slug}${ai ? '?ia=1' : ''}`;
}

export function screenUrl(): string {
  return STATIC_SITE ? 'data/fiis.json' : 'api/fiis';
}

export const STATIC_ONLY_SCREEN =
  'Na versão publicada só os fundos que passaram pela triagem têm análise pronta. Para consultar qualquer ticker, rode o projeto localmente.';
