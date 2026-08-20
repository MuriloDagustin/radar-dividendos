import { openCache, type Cache } from './cache';
import { diagnose } from './diagnosis';
import { NoDataError, InvalidTickerError, RadarError, TickerNotFoundError, errorMessage } from './errors';
import { interpret } from './ai';
import { mergeReadings } from './merge';
import { looksLikeTicker, normalizeTicker } from './numbers';
import { fetchBrapi } from './sources/brapi';
import { fetchFundamentus } from './sources/fundamentus';
import { fetchInvestidor10 } from './sources/investidor10';
import { fetchStatusInvest } from './sources/statusinvest';
import {
  DISCLAIMER,
  SOURCE_NAME,
  type Analysis,
  type AssetKind,
  type Source,
  type SourceReading,
  type SourceStatus,
} from './types';

export interface AnalyzeOptions {
  ai?: boolean;
  cache?: boolean;
  sharedCache?: Cache;
}

/**
 * The order is each field's priority. brapi comes first because on the Free plan it only
 * delivers a price, and that price is intraday — fresher than the others'. Investidor10
 * comes next for publishing raw values and being the only source with payout.
 */
function attempts(ticker: string): { source: Source; run: () => Promise<SourceReading> }[] {
  return [
    { source: 'brapi', run: () => fetchBrapi(ticker, process.env.BRAPI_TOKEN) },
    { source: 'investidor10', run: () => fetchInvestidor10(ticker) },
    { source: 'statusinvest', run: () => fetchStatusInvest(ticker) },
    { source: 'fundamentus', run: () => fetchFundamentus(ticker) },
  ];
}

/** "a, b e c" — pt-BR enumeration, so the error message reads like a sentence. */
function listInPortuguese(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}

/** Sources that recognize the kind agree in practice; the first opinion settles it. */
function resolveKind(readings: SourceReading[]): AssetKind {
  return readings.find((r) => r.kind !== undefined)?.kind ?? 'stock';
}

export async function analyze(rawTicker: string, options: AnalyzeOptions = {}): Promise<Analysis> {
  const ticker = normalizeTicker(rawTicker);
  if (!looksLikeTicker(ticker)) throw new InvalidTickerError(ticker);

  const useCache = options.cache ?? true;
  const cache = options.sharedCache ?? openCache({ enabled: useCache });
  const ownsCache = !options.sharedCache;

  try {
    if (useCache) {
      const stored = cache.read(ticker);
      if (stored) return stored;
    }

    const planned = attempts(ticker);

    // Independent sources: one that is slow or down must not hold up the others.
    const settled = await Promise.allSettled(planned.map((a) => a.run()));

    const readings: SourceReading[] = [];
    const sources: SourceStatus[] = [];
    const deniedBy: Source[] = [];

    for (const [index, outcome] of settled.entries()) {
      const source = planned[index]?.source;
      if (!source) continue;

      if (outcome.status === 'fulfilled') {
        readings.push(outcome.value);
        sources.push({
          source,
          status: 'ok',
          ...(outcome.value.note ? { detail: outcome.value.note } : {}),
        });
        continue;
      }

      if (outcome.reason instanceof TickerNotFoundError) deniedBy.push(source);
      sources.push({ source, status: 'failed', detail: errorMessage(outcome.reason) });
    }

    if (readings.length === 0) {
      const reason = (s: SourceStatus) => `${SOURCE_NAME[s.source]}: ${s.detail ?? 'sem detalhe'}`;
      // A source denying the paper outright is a stronger signal than the others failing.
      throw deniedBy.length > 0
        ? new TickerNotFoundError(
            ticker,
            listInPortuguese(deniedBy.map((s) => SOURCE_NAME[s])),
            sources.filter((s) => !deniedBy.includes(s.source)).map(reason),
          )
        : new NoDataError(ticker, sources.map(reason));
    }

    const kind = resolveKind(readings);
    const { fundamentals, provenance } = mergeReadings(readings);
    const diagnosis = diagnose(fundamentals, kind);
    const interpretation = await interpret(ticker, diagnosis, { enabled: options.ai ?? false });

    const analysis: Analysis = {
      ticker,
      kind,
      generatedAt: new Date().toISOString(),
      fundamentals,
      provenance,
      sources,
      diagnosis,
      interpretation,
      fromCache: false,
      disclaimer: DISCLAIMER,
    };

    // The AI reading stays out of the cache: it depends on a per-run flag.
    if (useCache) cache.write(ticker, { ...analysis, interpretation: null });

    return analysis;
  } finally {
    if (ownsCache) cache.close();
  }
}

export function isKnownError(error: unknown): error is RadarError {
  return error instanceof RadarError;
}
