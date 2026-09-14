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
import { DISCLAIMER, type Analysis } from './types';

/** Enough to finish eighty funds in a few minutes without hammering any one site. */
export const DEFAULT_CONCURRENCY = 4;

export interface ScreenMarketOptions extends Pick<AnalyzeOptions, 'cache' | 'sharedCache'> {
  concurrency?: number;
  onEvent?: (event: ScreenEvent) => void;
  /** Injection points for tests; production fetches the list and analyses for real. */
  listings?: FundListing[];
  analyzeFund?: (ticker: string, options: AnalyzeOptions) => Promise<Analysis>;
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

/**
 * Runs the five-filter screen over every fund on the B3 that is big enough to be worth a
 * look. Each candidate goes through the same `analyze` as a single ticker would, so the
 * result per fund is identical to what the card shows, and the cache is shared with it.
 */
export async function screenMarket(options: ScreenMarketOptions = {}): Promise<MarketScreen> {
  const useCache = options.cache ?? true;
  const cache: Cache = options.sharedCache ?? openCache({ enabled: useCache });
  const ownsCache = !options.sharedCache;
  const analyzeFund = options.analyzeFund ?? analyze;
  const emit = options.onEvent ?? (() => {});

  try {
    const listings = options.listings ?? (await fetchFundList());
    const { candidates, skipped } = preselect(listings);
    emit({ type: 'universe', universe: listings.length, candidates: candidates.length, skipped: skipped.length });

    const screened: ScreenedFund[] = [];
    const failed: ScreenFailure[] = [];
    let done = 0;

    await inParallel(candidates, options.concurrency ?? DEFAULT_CONCURRENCY, async (listing) => {
      try {
        const analysis = await analyzeFund(listing.ticker, { cache: useCache, sharedCache: cache });
        const fund = screenedFrom(analysis, listing);
        done += 1;
        if (fund) {
          screened.push(fund);
          emit({ type: 'fund', done, total: candidates.length, fund });
        } else {
          const failure = {
            ticker: listing.ticker,
            segment: listing.segment,
            message: 'As fontes não reconheceram o papel como fundo imobiliário',
          };
          failed.push(failure);
          emit({ type: 'failure', done, total: candidates.length, failure });
        }
      } catch (error) {
        done += 1;
        const failure = { ticker: listing.ticker, segment: listing.segment, message: errorMessage(error) };
        failed.push(failure);
        emit({ type: 'failure', done, total: candidates.length, failure });
      }
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
