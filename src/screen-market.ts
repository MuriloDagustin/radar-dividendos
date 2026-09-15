import { analyze, type AnalyzeOptions } from './analysis';
import { openCache, type Cache } from './cache';
import { errorMessage } from './errors';
import {
  preselect,
  rank,
  screenedFrom,
  type MarketScreen,
  type ScreenEvent,
  type ScreenFailure,
  type ScreenedFund,
} from './fund-market';
import { segmentOverlaps } from './fund-screen';
import { fetchFundList, type FundListing } from './sources/fundamentus-list';
import { fetchStockList, type StockListing } from './sources/fundamentus-stock-list';
import {
  preselectStocks,
  rankStocks,
  screenedStockFrom,
  type ScreenedStock,
  type StockMarketScreen,
  type StockScreenEvent,
  type StockScreenFailure,
} from './stock-market';
import { DISCLAIMER, type Analysis } from './types';

/** Enough to finish a hundred papers in a few minutes without hammering any one site. */
export const DEFAULT_CONCURRENCY = 4;

type Analyzer = (ticker: string, options: AnalyzeOptions) => Promise<Analysis>;

interface RunOptions extends Pick<AnalyzeOptions, 'cache' | 'sharedCache'> {
  concurrency?: number;
}

export interface ScreenMarketOptions extends RunOptions {
  onEvent?: (event: ScreenEvent) => void;
  /** Injection points for tests; production fetches the list and analyses for real. */
  listings?: FundListing[];
  analyzeFund?: Analyzer;
}

export interface ScreenStocksOptions extends RunOptions {
  onEvent?: (event: StockScreenEvent) => void;
  listings?: StockListing[];
  analyzeStock?: Analyzer;
}

async function inParallel<T>(
  items: T[],
  concurrency: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      if (item !== undefined) await work(item);
    }
  });
  await Promise.all(workers);
}

interface CandidateRun<L extends { ticker: string }, S> {
  candidates: L[];
  analyzer: Analyzer;
  useCache: boolean;
  cache: Cache;
  concurrency: number;
  toScreened: (analysis: Analysis, listing: L) => S | null;
  /** What to say when the sources read the paper, but not as the kind this screen wants. */
  notRecognized: string;
  onScreened: (done: number, total: number, item: S) => void;
  onFailure: (done: number, total: number, listing: L, message: string) => void;
}

/**
 * Each candidate goes through the same `analyze` as a single ticker would, so the result per
 * paper is identical to what the card shows, and the cache is shared with it.
 */
async function analyseCandidates<L extends { ticker: string }, S>(run: CandidateRun<L, S>): Promise<S[]> {
  const screened: S[] = [];
  const total = run.candidates.length;
  let done = 0;

  await inParallel(run.candidates, run.concurrency, async (listing) => {
    try {
      const analysis = await run.analyzer(listing.ticker, { cache: run.useCache, sharedCache: run.cache });
      const item = run.toScreened(analysis, listing);
      done += 1;
      if (item) {
        screened.push(item);
        run.onScreened(done, total, item);
      } else {
        run.onFailure(done, total, listing, run.notRecognized);
      }
    } catch (error) {
      done += 1;
      run.onFailure(done, total, listing, errorMessage(error));
    }
  });

  return screened;
}

/**
 * Runs the five-filter screen over every fund on the B3 that is big enough to be worth a
 * look.
 */
export async function screenMarket(options: ScreenMarketOptions = {}): Promise<MarketScreen> {
  const useCache = options.cache ?? true;
  const cache: Cache = options.sharedCache ?? openCache({ enabled: useCache });
  const ownsCache = !options.sharedCache;
  const emit = options.onEvent ?? (() => {});

  try {
    const listings = options.listings ?? (await fetchFundList());
    const { candidates, skipped } = preselect(listings);
    emit({ type: 'universe', universe: listings.length, candidates: candidates.length, skipped: skipped.length });

    const failed: ScreenFailure[] = [];
    const screened = await analyseCandidates<FundListing, ScreenedFund>({
      candidates,
      analyzer: options.analyzeFund ?? analyze,
      useCache,
      cache,
      concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
      toScreened: screenedFrom,
      notRecognized: 'As fontes não reconheceram o papel como fundo imobiliário',
      onScreened: (done, total, fund) => emit({ type: 'fund', done, total, fund }),
      onFailure: (done, total, listing, message) => {
        const failure = { ticker: listing.ticker, segment: listing.segment, message };
        failed.push(failure);
        emit({ type: 'failure', done, total, failure });
      },
    });

    const { approved, pending, rejected } = rank(screened);
    failed.sort((a, b) => a.ticker.localeCompare(b.ticker));

    const report: MarketScreen = {
      generatedAt: new Date().toISOString(),
      universe: listings.length,
      candidates: candidates.length,
      skipped: skipped.length,
      approved,
      pending,
      rejected,
      failed,
      overlaps: segmentOverlaps(approved.map((f) => ({ ticker: f.ticker, segment: f.segment }))),
      disclaimer: DISCLAIMER,
    };

    emit({ type: 'done', report });
    return report;
  } finally {
    if (ownsCache) cache.close();
  }
}

/**
 * Runs the five-filter stock screen over every company on the B3 that trades enough to be
 * worth a look — one class per issuer.
 */
export async function screenStocks(options: ScreenStocksOptions = {}): Promise<StockMarketScreen> {
  const useCache = options.cache ?? true;
  const cache: Cache = options.sharedCache ?? openCache({ enabled: useCache });
  const ownsCache = !options.sharedCache;
  const emit = options.onEvent ?? (() => {});

  try {
    const listings = options.listings ?? (await fetchStockList());
    const { candidates, skipped } = preselectStocks(listings);
    emit({ type: 'universe', universe: listings.length, candidates: candidates.length, skipped: skipped.length });

    const failed: StockScreenFailure[] = [];
    const screened = await analyseCandidates<StockListing, ScreenedStock>({
      candidates,
      analyzer: options.analyzeStock ?? analyze,
      useCache,
      cache,
      concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
      toScreened: screenedStockFrom,
      notRecognized: 'As fontes não reconheceram o papel como ação',
      onScreened: (done, total, stock) => emit({ type: 'stock', done, total, stock }),
      onFailure: (done, total, listing, message) => {
        const failure = { ticker: listing.ticker, name: listing.name, message };
        failed.push(failure);
        emit({ type: 'failure', done, total, failure });
      },
    });

    const { approved, pending, rejected } = rankStocks(screened);
    failed.sort((a, b) => a.ticker.localeCompare(b.ticker));

    const report: StockMarketScreen = {
      generatedAt: new Date().toISOString(),
      universe: listings.length,
      candidates: candidates.length,
      skipped: skipped.length,
      approved,
      pending,
      rejected,
      failed,
      disclaimer: DISCLAIMER,
    };

    emit({ type: 'done', report });
    return report;
  } finally {
    if (ownsCache) cache.close();
  }
}
