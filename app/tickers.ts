/** "taee11, itsa4; mxrf11" is all one list of papers, however the reader typed it. */
export function splitTickers(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,;+]+/)) {
    const ticker = part.trim().toUpperCase();
    if (ticker) seen.add(ticker);
  }
  return [...seen];
}

export function analysisHref(tickers: string[], ai = false): string {
  const params = new URLSearchParams({ t: tickers.join(' ') });
  if (ai) params.set('ia', '1');
  return `/analise?${params.toString()}`;
}
