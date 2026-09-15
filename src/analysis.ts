import { openCache, type Cache } from './cache';
import { classify } from './classification';
import { categoryNotes, diagnose } from './diagnosis';
import {
  InvalidTickerError,
  NoDataError,
  RadarError,
  TickerNotFoundError,
  errorMessage,
} from './errors';
import { interpret } from './ai';
import { isPaperFund, listInPortuguese, mergeFundProfiles, screenFund } from './fund-screen';
import { screenStock } from './stock-screen';
import { mergeReadings } from './merge';
import { looksLikeTicker, normalizeTicker } from './numbers';
import { summarizeDividends } from './dividends';
import { fetchCdi } from './sources/bcb';
import { fetchProventos } from './sources/proventos';
import { fetchDocumentos } from './sources/documentos';
import {
  fetchBrapi,
  fetchLeverageHistory,
  fetchSiblingLiquidity,
  type ClassLiquidity,
} from './sources/brapi';
import { fetchFundamentus } from './sources/fundamentus';
import { fetchInvestidor10 } from './sources/investidor10';
import { fetchStatusInvest } from './sources/statusinvest';
import {
  DISCLAIMER,
  SOURCE_NAME,
  type Analysis,
  type AssetKind,
  type PeerMap,
  type SectorInfo,
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

/** Sources that recognize the kind agree in practice; the first opinion settles it. */
function resolveKind(readings: SourceReading[]): AssetKind {
  return readings.find((r) => r.kind !== undefined)?.kind ?? 'stock';
}

/**
 * Sector text from every source that published one, merged field by field: brapi gives
 * sector and industry, Fundamentus gives sector and subsector, and the lookup wants the
 * most specific of the three.
 */
function resolveSector(readings: SourceReading[]): SectorInfo | null {
  const merged: SectorInfo = {};
  for (const reading of readings) {
    if (!reading.sector) continue;
    if (!merged.subsector && reading.sector.subsector) merged.subsector = reading.sector.subsector;
    if (!merged.industry && reading.sector.industry) merged.industry = reading.sector.industry;
    if (!merged.sector && reading.sector.sector) merged.sector = reading.sector.sector;
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

/** Sector medians a source publishes; the first source carrying a key wins. */
function resolvePeers(readings: SourceReading[]): PeerMap {
  const merged: PeerMap = {};
  for (const reading of readings) {
    for (const [key, context] of Object.entries(reading.peers ?? {})) {
      if (!merged[key]) merged[key] = context;
    }
  }
  return merged;
}

/** Below this ratio the difference in liquidity is not worth mentioning. */
const LIQUIDITY_FACTOR = 5;

export function liquidityNote(ticker: string, classes: ClassLiquidity[]): string | null {
  const own = classes.find((c) => c.ticker.toUpperCase() === ticker.toUpperCase());
  if (!own || own.volume <= 0) return null;

  const best = classes
    .filter((c) => c.ticker.toUpperCase() !== ticker.toUpperCase())
    .sort((a, b) => b.volume - a.volume)[0];
  if (!best || best.volume < own.volume * LIQUIDITY_FACTOR) return null;

  return `${best.ticker} é a classe mais líquida deste emissor`;
}

/** Only ordinary and preferred classes have a unit sibling worth comparing. */
function hasSiblingClasses(ticker: string): boolean {
  return /^[A-Z]{4}[34]$/.test(ticker);
}

export async function analyze(rawTicker: string, options: AnalyzeOptions = {}): Promise<Analysis> {
  const ticker = normalizeTicker(rawTicker);
  if (!looksLikeTicker(ticker)) throw new InvalidTickerError(ticker);

  const useCache = options.cache ?? true;
  const cache = options.sharedCache ?? openCache({ enabled: useCache });
  const ownsCache = !options.sharedCache;
  const token = process.env.BRAPI_TOKEN;

  try {
    if (useCache) {
      const stored = cache.read(ticker);
      if (stored) return stored;
    }

    const planned = attempts(ticker);

    // Independent sources: one that is slow or down must not hold up the others. The
    // liquidity lookup rides along because it is optional and never gates the result.
    const [settled, liquidity] = await Promise.all([
      Promise.allSettled(planned.map((a) => a.run())),
      hasSiblingClasses(ticker)
        ? fetchSiblingLiquidity(ticker, token).catch((): ClassLiquidity[] => [])
        : Promise.resolve<ClassLiquidity[]>([]),
    ]);

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
    const classification = classify(ticker, resolveSector(readings), kind);
    const { fundamentals, provenance } = mergeReadings(readings);
    const isFund = kind === 'fii' || classification.category === 'fii';

    // Each extra lookup serves one purpose and none of them can gate the analysis.
    const [leverageHistory, cdi, dividendHistory, filings] = await Promise.all([
      classification.category === 'cyclical'
        ? fetchLeverageHistory(ticker, token).catch(() => null)
        : Promise.resolve(null),
      isFund ? fetchCdi().catch(() => null) : Promise.resolve(null),
      fetchProventos(ticker, kind).catch(() => null),
      fetchDocumentos(ticker, kind).catch(() => null),
    ]);

    const dividends = dividendHistory ? summarizeDividends(dividendHistory) : null;

    // The five-filter screen sits beside the verdict, not inside it: the verdict reads the
    // fund's numbers, the screen decides whether the fund is even a candidate.
    const fund = isFund ? mergeFundProfiles(readings) : null;
    const fundScreen = isFund ? screenFund({ profile: fund, fundamentals, dividends }) : null;
    const peers = resolvePeers(readings);
    const stockScreen = isFund ? null : screenStock({ fundamentals, category: classification.category, peers });

    const diagnosis = diagnose(fundamentals, {
      kind,
      category: classification.category,
      peers,
      dividends,
      ...(leverageHistory ? { leverageHistory } : {}),
      ...(cdi ? { cdiAnnual: cdi.annual } : {}),
      ...(fund && isPaperFund(fund) ? { paperFund: true } : {}),
    });

    const notes = [
      ...categoryNotes(classification.category),
      ...(cdi
        ? [
            `CDI anualizado ${(cdi.annual * 100).toLocaleString('pt-BR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}% — ${cdi.source === 'bcb' ? `Banco Central${cdi.date ? `, ${cdi.date}` : ''}` : 'RADAR_CDI_ANUAL'}`,
          ]
        : []),
      ...(classification.uncertain
        ? ['Setor não reconhecido — avaliado com as faixas gerais; confira a classificação']
        : []),
      ...(liquidityNote(ticker, liquidity) ? [liquidityNote(ticker, liquidity) as string] : []),
    ];

    const interpretation = await interpret(ticker, diagnosis, { enabled: options.ai ?? false });

    const analysis: Analysis = {
      ticker,
      kind,
      classification,
      dividends,
      dividendHistory,
      filings,
      fund,
      fundScreen,
      stockScreen,
      notes,
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
