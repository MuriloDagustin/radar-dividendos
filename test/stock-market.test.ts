import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { diagnose } from '../src/diagnosis';
import { PRESELECT_MARGIN } from '../src/fund-market';
import { screenStocks } from '../src/screen-market';
import { parseStockList, type StockListing } from '../src/sources/fundamentus-stock-list';
import {
  issuerOf,
  preselectStocks,
  rankStocks,
  screenedStockFrom,
  type ScreenedStock,
} from '../src/stock-market';
import { LIQUIDITY_FLOOR, screenStock } from '../src/stock-screen';
import {
  DISCLAIMER,
  emptyFundamentals,
  emptyProvenance,
  type Analysis,
  type Category,
  type Fundamentals,
} from '../src/types';

const here = dirname(fileURLToPath(import.meta.url));
const LIST_HTML = readFileSync(join(here, 'fixtures', 'fundamentus-acoes-lista.html'), 'utf8');

function listing(partial: Partial<StockListing> & { ticker: string }): StockListing {
  return {
    name: null,
    price: null,
    priceEarnings: null,
    priceToBook: null,
    dividendYield12m: null,
    evToEbitda: null,
    netMargin: null,
    roic: null,
    roe: null,
    liquidity: null,
    netWorth: null,
    netDebtToEquity: null,
    revenueCagr5y: null,
    ...partial,
  };
}

/** A company that passes every filter, unless the caller breaks something on purpose. */
function candidate(partial: Partial<Fundamentals> = {}): Fundamentals {
  return {
    ...emptyFundamentals(),
    price: 30,
    priceEarnings: 9,
    dividendYield12m: 0.06,
    roe: 0.2,
    roic: 0.16,
    netDebtToEbitda: 1.2,
    netMargin: 0.12,
    revenueCagr5y: 0.08,
    avgDailyLiquidity: 20_000_000,
    payout: 0.45,
    ...partial,
  };
}

function fakeAnalysis(ticker: string, fundamentals: Fundamentals | null, category: Category = 'evergreen'): Analysis {
  const f = fundamentals ?? emptyFundamentals();
  return {
    ticker,
    kind: fundamentals ? 'stock' : 'fii',
    classification: { category: fundamentals ? category : 'fii', rawSector: 'Energia Elétrica', uncertain: false },
    dividends: null,
    dividendHistory: null,
    filings: null,
    fund: null,
    fundScreen: null,
    stockScreen: fundamentals ? screenStock({ fundamentals: f, category }) : null,
    notes: [],
    generatedAt: '2026-09-15T12:00:00.000Z',
    fundamentals: f,
    provenance: emptyProvenance(),
    sources: [],
    diagnosis: diagnose(f, { kind: 'stock', category, peers: {} }),
    interpretation: null,
    fromCache: false,
    disclaimer: DISCLAIMER,
  };
}

describe('parseStockList', () => {
  it('reads every company row of the Fundamentus list with its columns by header', () => {
    const listings = parseStockList(LIST_HTML);
    expect(listings).toHaveLength(12);

    const petr = listings.find((l) => l.ticker === 'PETR4');
    expect(petr).toMatchObject({
      name: 'PETROBRAS',
      price: 48.92,
      priceEarnings: 4.73,
      priceToBook: 1.31,
      evToEbitda: 2.93,
      liquidity: 1_852_220_000,
      netWorth: 480_950_000_000,
      netDebtToEquity: 0.65,
    });
    expect(petr?.dividendYield12m).toBeCloseTo(0.0745);
    expect(petr?.netMargin).toBeCloseTo(0.2439);
    expect(petr?.roic).toBeCloseTo(0.1969);
    expect(petr?.roe).toBeCloseTo(0.2773);
    expect(petr?.revenueCagr5y).toBeCloseTo(-0.0233);
  });

  it('refuses a table whose columns moved', () => {
    expect(() => parseStockList(LIST_HTML.replace('>ROE<', '>R.O.E<'))).toThrow(/colunas ausentes/);
  });
});

describe('preselectStocks', () => {
  it('names the issuer by the first four letters', () => {
    expect(issuerOf('PETR4')).toBe('PETR');
    expect(issuerOf('TAEE11')).toBe('TAEE');
  });

  it('keeps the liquidity floor with its margin and skips the rest', () => {
    const exact = listing({ ticker: 'EXAT3', liquidity: LIQUIDITY_FLOOR });
    const margin = listing({ ticker: 'MARG3', liquidity: LIQUIDITY_FLOOR * PRESELECT_MARGIN });
    const thin = listing({ ticker: 'FINO3', liquidity: LIQUIDITY_FLOOR * 0.9 });
    const unknown = listing({ ticker: 'SEMD3' });

    const { candidates, skipped } = preselectStocks([exact, margin, thin, unknown]);
    expect(candidates.map((c) => c.ticker)).toEqual(['EXAT3', 'MARG3']);
    expect(skipped).toEqual([
      { ticker: 'FINO3', liquidity: LIQUIDITY_FLOOR * 0.9, reason: 'liquidity' },
      { ticker: 'SEMD3', liquidity: null, reason: 'liquidity' },
    ]);
  });

  it('keeps one class per issuer: the most traded one, whichever comes first', () => {
    const { candidates, skipped } = preselectStocks([
      listing({ ticker: 'PETR3', liquidity: 500_000_000 }),
      listing({ ticker: 'PETR4', liquidity: 1_800_000_000 }),
      listing({ ticker: 'ITSA4', liquidity: 280_000_000 }),
      listing({ ticker: 'ITSA3', liquidity: 6_000_000 }),
    ]);
    expect(candidates.map((c) => c.ticker)).toEqual(['ITSA4', 'PETR4']);
    expect(skipped).toEqual([
      { ticker: 'PETR3', liquidity: 500_000_000, reason: 'sibling', keptSibling: 'PETR4' },
      { ticker: 'ITSA3', liquidity: 6_000_000, reason: 'sibling', keptSibling: 'ITSA4' },
    ]);
  });

  it('cuts the real list down to the companies worth fetching', () => {
    const { candidates, skipped } = preselectStocks(parseStockList(LIST_HTML));
    expect(candidates.map((c) => c.ticker)).toEqual([
      'BBAS3',
      'CMIG4',
      'CVCB3',
      'EGIE3',
      'ITSA4',
      'KLBN11',
      'PETR4',
      'TAEE11',
      'VALE3',
      'WEGE3',
    ]);
    expect(skipped.map((s) => `${s.ticker}:${s.reason}`)).toEqual(['SOND5:liquidity', 'PETR3:sibling']);
  });
});

describe('screenedStockFrom', () => {
  it('carries the numbers the filters read, the sheet liquidity first', () => {
    const stock = screenedStockFrom(fakeAnalysis('EGIE3', candidate()), listing({ ticker: 'EGIE3', name: 'ENGIE BRASIL', liquidity: 1 }));
    expect(stock).toMatchObject({
      ticker: 'EGIE3',
      name: 'ENGIE BRASIL',
      outcome: 'approved',
      sector: 'Energia Elétrica',
      category: 'evergreen',
      liquidity: 20_000_000,
      netDebtToEbitda: 1.2,
      tiebreakersPassed: 2,
      failedOn: null,
    });
  });

  it('falls back to the listing liquidity and names the first failing filter', () => {
    const stock = screenedStockFrom(
      fakeAnalysis('CVCB3', candidate({ roe: 0.08, netMargin: 0.02, avgDailyLiquidity: null })),
      listing({ ticker: 'CVCB3', liquidity: 23_401_500 }),
    );
    expect(stock?.outcome).toBe('rejected');
    expect(stock?.failedOn?.key).toBe('roe');
    expect(stock?.liquidity).toBe(23_401_500);
  });

  it('is null for a paper the sources did not read as a company', () => {
    expect(screenedStockFrom(fakeAnalysis('HGLG11', null), listing({ ticker: 'HGLG11' }))).toBeNull();
  });
});

describe('rankStocks', () => {
  const stock = (ticker: string, partial: Partial<ScreenedStock>): ScreenedStock => {
    const base = screenedStockFrom(fakeAnalysis(ticker, candidate()), listing({ ticker }));
    if (!base) throw new Error('fixture stock did not screen');
    return { ...base, ...partial };
  };

  it('orders approved by tiebreakers, then return on capital, then ticker', () => {
    const { approved } = rankStocks([
      stock('CCCC3', { tiebreakersPassed: 2, roic: 0.18 }),
      stock('BBBB3', { tiebreakersPassed: 3, roic: 0.1 }),
      stock('AAAA3', { tiebreakersPassed: 2, roic: 0.25 }),
      stock('DDDD3', { tiebreakersPassed: 2, roic: null }),
      stock('EEEE3', { tiebreakersPassed: 2, roic: 0.18 }),
    ]);
    expect(approved.map((s) => s.ticker)).toEqual(['BBBB3', 'AAAA3', 'CCCC3', 'EEEE3', 'DDDD3']);
  });
});

describe('screenStocks', () => {
  const listings = [
    listing({ ticker: 'EGIE3', name: 'ENGIE BRASIL', liquidity: 130_000_000 }),
    listing({ ticker: 'ITSA4', name: 'ITAUSA', liquidity: 280_000_000 }),
    listing({ ticker: 'ITSA3', name: 'ITAUSA', liquidity: 6_000_000 }),
    listing({ ticker: 'CVCB3', name: 'CVC BRASIL', liquidity: 23_000_000 }),
    listing({ ticker: 'FALH3', name: 'FALHA', liquidity: 9_000_000 }),
    listing({ ticker: 'FINO3', name: 'ILIQUIDA', liquidity: 100_000 }),
  ];

  const sheets: Record<string, { fundamentals: Fundamentals; category: Category }> = {
    EGIE3: { fundamentals: candidate(), category: 'evergreen' },
    ITSA4: { fundamentals: candidate({ netDebtToEbitda: 7 }), category: 'financial' },
    CVCB3: { fundamentals: candidate({ roe: 0.08 }), category: 'evergreen' },
  };

  const analyzeStock = async (ticker: string): Promise<Analysis> => {
    if (ticker === 'FALH3') throw new Error('Fonte Investidor10 indisponível: HTTP 503');
    const sheet = sheets[ticker];
    if (!sheet) throw new Error(`unexpected ticker ${ticker}`);
    return fakeAnalysis(ticker, sheet.fundamentals, sheet.category);
  };

  it('analyses only the pre-selected companies and files each one where it belongs', async () => {
    const events: string[] = [];
    const report = await screenStocks({
      cache: false,
      listings,
      analyzeStock,
      concurrency: 2,
      onEvent: (event) => events.push(event.type),
    });

    expect(report.universe).toBe(6);
    expect(report.candidates).toBe(4);
    expect(report.skipped).toBe(2);

    expect(report.approved.map((s) => s.ticker)).toEqual(['EGIE3']);
    expect(report.pending.map((s) => s.ticker)).toEqual(['ITSA4']);
    expect(report.rejected.map((s) => s.ticker)).toEqual(['CVCB3']);
    expect(report.rejected[0]?.failedOn?.key).toBe('roe');
    expect(report.failed).toEqual([
      { ticker: 'FALH3', name: 'FALHA', message: 'Fonte Investidor10 indisponível: HTTP 503' },
    ]);

    expect(events[0]).toBe('universe');
    expect(events.at(-1)).toBe('done');
    expect(events.filter((e) => e === 'stock')).toHaveLength(3);
    expect(events.filter((e) => e === 'failure')).toHaveLength(1);
  });

  it('shares one cache handle across every analysis', async () => {
    const seen: unknown[] = [];
    const shared = { read: () => null, write: () => {}, close: () => {} };
    await screenStocks({
      listings: listings.slice(0, 2),
      sharedCache: shared,
      analyzeStock: async (ticker, options) => {
        seen.push(options.sharedCache);
        return analyzeStock(ticker);
      },
    });
    expect(seen).toEqual([shared, shared]);
  });
});
