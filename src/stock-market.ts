import { resolveNetDebtToEbitda } from './diagnosis';
import { PRESELECT_MARGIN, outcomeOf, rankScreened, type ScreenOutcome } from './fund-market';
import type { StockListing } from './sources/fundamentus-stock-list';
import { LIQUIDITY_FLOOR } from './stock-screen';
import type { Analysis, Category, Criterion, FundScreen, Verdict } from './types';

/**
 * The market-wide stock screen as data: which companies get analysed and how each one is
 * filed and ranked afterwards. Nothing here touches the network or the disk, so the page can
 * import it to rank rows as they stream in; `screen-market.ts` runs it.
 */

export interface SkippedStock {
  ticker: string;
  liquidity: number | null;
  /** `sibling`: another class of the same issuer trades more and was kept instead. */
  reason: 'liquidity' | 'sibling';
  keptSibling?: string;
}

export interface StockPreselection {
  candidates: StockListing[];
  skipped: SkippedStock[];
}

/** PETR3 and PETR4 are the same company: the first four letters name the issuer. */
export function issuerOf(ticker: string): string {
  return ticker.slice(0, 4);
}

/**
 * Liquidity is the only filter the listing can answer, and it cuts a thousand rows down to
 * about a hundred and fifty. The margin covers the listing and the sheet disagreeing on the
 * window; the sheet's own figure decides in the filter. Then one class per issuer: the most
 * traded one, because the other classes would say the same about the same company.
 */
export function preselectStocks(listings: StockListing[]): StockPreselection {
  const skipped: SkippedStock[] = [];
  const byIssuer = new Map<string, StockListing>();

  for (const listing of listings) {
    if (listing.liquidity === null || listing.liquidity < LIQUIDITY_FLOOR * PRESELECT_MARGIN) {
      skipped.push({ ticker: listing.ticker, liquidity: listing.liquidity, reason: 'liquidity' });
      continue;
    }
    const issuer = issuerOf(listing.ticker);
    const kept = byIssuer.get(issuer);
    if (!kept) {
      byIssuer.set(issuer, listing);
    } else if (listing.liquidity > (kept.liquidity ?? 0)) {
      skipped.push({ ticker: kept.ticker, liquidity: kept.liquidity, reason: 'sibling', keptSibling: listing.ticker });
      byIssuer.set(issuer, listing);
    } else {
      skipped.push({ ticker: listing.ticker, liquidity: listing.liquidity, reason: 'sibling', keptSibling: kept.ticker });
    }
  }

  const candidates = [...byIssuer.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
  return { candidates, skipped };
}

export interface ScreenedStock {
  ticker: string;
  name: string | null;
  outcome: ScreenOutcome;
  /** Sector text as the source worded it, for the row; the category is what the rules used. */
  sector: string | null;
  category: Category;
  verdict: Verdict;
  screen: FundScreen;
  /** The first filter that failed, so the rejected list can say why in one line. */
  failedOn: Criterion | null;
  tiebreakersPassed: number;
  price: number | null;
  dividendYield12m: number | null;
  priceEarnings: number | null;
  priceToBook: number | null;
  roe: number | null;
  roic: number | null;
  netDebtToEbitda: number | null;
  netMargin: number | null;
  revenueCagr5y: number | null;
  /** The sheet's average daily traded value, else the listing's. */
  liquidity: number | null;
  fromCache: boolean;
}

export interface StockScreenFailure {
  ticker: string;
  name: string | null;
  message: string;
}

export interface StockMarketScreen {
  generatedAt: string;
  /** Companies on the listing. */
  universe: number;
  /** Companies that survived the liquidity pre-selection and were analysed. */
  candidates: number;
  skipped: number;
  approved: ScreenedStock[];
  pending: ScreenedStock[];
  rejected: ScreenedStock[];
  failed: StockScreenFailure[];
  disclaimer: string;
}

export type StockScreenEvent =
  | { type: 'universe'; universe: number; candidates: number; skipped: number }
  | { type: 'stock'; done: number; total: number; stock: ScreenedStock }
  | { type: 'failure'; done: number; total: number; failure: StockScreenFailure }
  | { type: 'done'; report: StockMarketScreen };

export function screenedStockFrom(analysis: Analysis, listing: StockListing): ScreenedStock | null {
  const screen = analysis.stockScreen;
  if (!screen) return null;
  const f = analysis.fundamentals;

  return {
    ticker: analysis.ticker,
    name: listing.name,
    outcome: outcomeOf(screen),
    sector: analysis.classification.rawSector,
    category: analysis.classification.category,
    verdict: analysis.diagnosis.verdict,
    screen,
    failedOn: screen.filters.find((c) => c.status === 'fail') ?? null,
    tiebreakersPassed: screen.tiebreakers.filter((c) => c.status === 'pass').length,
    price: f.price,
    dividendYield12m: f.dividendYield12m,
    priceEarnings: f.priceEarnings,
    priceToBook: f.priceToBook,
    roe: f.roe,
    roic: f.roic,
    netDebtToEbitda: resolveNetDebtToEbitda(f),
    netMargin: f.netMargin,
    revenueCagr5y: f.revenueCagr5y,
    liquidity: f.avgDailyLiquidity ?? listing.liquidity,
    fromCache: analysis.fromCache,
  };
}

/** Quality first among equals: the higher return on capital wins, and a null sorts last. */
function byRoic(a: ScreenedStock, b: ScreenedStock): number {
  if (a.roic === null && b.roic === null) return 0;
  if (a.roic === null) return 1;
  if (b.roic === null) return -1;
  return b.roic - a.roic;
}

export function rankStocks(
  stocks: ScreenedStock[],
): Pick<StockMarketScreen, 'approved' | 'pending' | 'rejected'> {
  return rankScreened(stocks, byRoic);
}
