import { NET_WORTH_FLOOR } from './fund-screen';
import type { FundListing } from './sources/fundamentus-list';
import type { Analysis, Criterion, FundScreen, Verdict } from './types';

/**
 * The market-wide screen as data: what the listing says, which funds get analysed, and how
 * each one is filed and ranked afterwards. Nothing here touches the network or the disk, so
 * the page can import it to rank funds as they stream in; `screen-market.ts` runs it.
 */

/**
 * The listing's P/VP has two decimals, so the net worth derived from it can be off by up to
 * one percent. A fund that lands just under the floor here is still analysed, and the exact
 * figure on its own sheet decides.
 */
export const PRESELECT_MARGIN = 0.95;

/** Market value over P/VP is the net worth, by the definition of the multiple. */
export function derivedNetWorth(listing: FundListing): number | null {
  if (listing.marketCap === null || listing.priceToBook === null || listing.priceToBook <= 0) {
    return null;
  }
  return listing.marketCap / listing.priceToBook;
}

export interface SkippedFund {
  ticker: string;
  segment: string | null;
  netWorth: number | null;
}

export interface Preselection {
  candidates: FundListing[];
  /** Funds the size filter rules out before any sheet is fetched. */
  skipped: SkippedFund[];
}

/**
 * The size filter is the only one the listing can answer, and it is the one that cuts the
 * most: it turns five hundred funds into fewer than a hundred fetches. A fund whose net worth
 * cannot be derived is skipped too — it has no market value or no P/VP on the list, which in
 * practice means it does not trade.
 */
export function preselect(listings: FundListing[]): Preselection {
  const candidates: FundListing[] = [];
  const skipped: SkippedFund[] = [];

  for (const listing of listings) {
    const netWorth = derivedNetWorth(listing);
    if (netWorth !== null && netWorth >= NET_WORTH_FLOOR * PRESELECT_MARGIN) {
      candidates.push(listing);
    } else {
      skipped.push({ ticker: listing.ticker, segment: listing.segment, netWorth });
    }
  }

  return { candidates, skipped };
}

/**
 * `approved`: every filter passed. `rejected`: at least one filter failed. `pending`: no
 * filter failed, but some had no data — the reader has to finish the screen by hand.
 */
export type ScreenOutcome = 'approved' | 'pending' | 'rejected';

export interface ScreenedFund {
  ticker: string;
  outcome: ScreenOutcome;
  /** The fund sheet's segment when a source gave one, else the listing's coarse label. */
  segment: string | null;
  manager: string | null;
  verdict: Verdict;
  screen: FundScreen;
  /** The first filter that failed, so the rejected list can say why in one line. */
  failedOn: Criterion | null;
  tiebreakersPassed: number;
  price: number | null;
  dividendYield12m: number | null;
  priceToBook: number | null;
  netWorth: number | null;
  vacancy: number | null;
  payoutFfo: number | null;
  consecutiveYears: number | null;
  fromCache: boolean;
}

export interface ScreenFailure {
  ticker: string;
  segment: string | null;
  message: string;
}

export interface MarketScreen {
  generatedAt: string;
  /** Funds on the listing. */
  universe: number;
  /** Funds that survived the size pre-selection and were analysed. */
  candidates: number;
  skipped: number;
  approved: ScreenedFund[];
  pending: ScreenedFund[];
  rejected: ScreenedFund[];
  failed: ScreenFailure[];
  /** Same-segment warnings among the approved funds. */
  overlaps: string[];
  disclaimer: string;
}

export type ScreenEvent =
  | { type: 'universe'; universe: number; candidates: number; skipped: number }
  | { type: 'fund'; done: number; total: number; fund: ScreenedFund }
  | { type: 'failure'; done: number; total: number; failure: ScreenFailure }
  | { type: 'done'; report: MarketScreen };

export function outcomeOf(screen: FundScreen): ScreenOutcome {
  if (screen.passedAll) return 'approved';
  if (screen.filters.some((c) => c.status === 'fail')) return 'rejected';
  return 'pending';
}

export function screenedFrom(analysis: Analysis, listing: FundListing): ScreenedFund | null {
  const screen = analysis.fundScreen;
  if (!screen) return null;

  return {
    ticker: analysis.ticker,
    outcome: outcomeOf(screen),
    segment: analysis.fund?.segment ?? listing.segment,
    manager: analysis.fund?.manager ?? null,
    verdict: analysis.diagnosis.verdict,
    screen,
    failedOn: screen.filters.find((c) => c.status === 'fail') ?? null,
    tiebreakersPassed: screen.tiebreakers.filter((c) => c.status === 'pass').length,
    price: analysis.fundamentals.price,
    dividendYield12m: analysis.fundamentals.dividendYield12m,
    priceToBook: analysis.fundamentals.priceToBook,
    netWorth: analysis.fund?.netWorth ?? null,
    vacancy: analysis.fundamentals.vacancy,
    payoutFfo: analysis.fundamentals.payoutFfo,
    consecutiveYears: analysis.dividends?.consecutiveYears ?? null,
    fromCache: analysis.fromCache,
  };
}

function byTicker(a: { ticker: string }, b: { ticker: string }): number {
  return a.ticker.localeCompare(b.ticker);
}

/** Cheapest first among equals: a null P/VP sorts last, not as zero. */
function byPriceToBook(a: ScreenedFund, b: ScreenedFund): number {
  if (a.priceToBook === null && b.priceToBook === null) return 0;
  if (a.priceToBook === null) return 1;
  if (b.priceToBook === null) return -1;
  return a.priceToBook - b.priceToBook;
}

/** What the ranking reads off a screened paper, whatever else it carries. */
export interface Rankable {
  ticker: string;
  outcome: ScreenOutcome;
  screen: FundScreen;
  tiebreakersPassed: number;
}

/**
 * Approved papers rank by how many tiebreakers they pass, then by `approvedTie` (the
 * screen's own idea of "better among equals"), then by ticker. Pending papers rank by how
 * little is missing. Rejected papers rank by how close they got.
 */
export function rankScreened<T extends Rankable>(
  items: T[],
  approvedTie: (a: T, b: T) => number,
): { approved: T[]; pending: T[]; rejected: T[] } {
  const approved = items
    .filter((f) => f.outcome === 'approved')
    .sort((a, b) => b.tiebreakersPassed - a.tiebreakersPassed || approvedTie(a, b) || byTicker(a, b));
  const pending = items
    .filter((f) => f.outcome === 'pending')
    .sort(
      (a, b) =>
        a.screen.unknown - b.screen.unknown ||
        b.tiebreakersPassed - a.tiebreakersPassed ||
        byTicker(a, b),
    );
  const rejected = items
    .filter((f) => f.outcome === 'rejected')
    .sort((a, b) => b.screen.passed - a.screen.passed || byTicker(a, b));

  return { approved, pending, rejected };
}

/** Funds: among equals, the deeper discount to book value comes first. */
export function rank(funds: ScreenedFund[]): Pick<MarketScreen, 'approved' | 'pending' | 'rejected'> {
  return rankScreened(funds, byPriceToBook);
}
