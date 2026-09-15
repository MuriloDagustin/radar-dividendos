import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PRESELECT_MARGIN,
  derivedNetWorth,
  outcomeOf,
  preselect,
  rank,
  screenedFrom,
  type ScreenedFund,
} from '../src/fund-market';
import { screenMarket } from '../src/screen-market';
import { NET_WORTH_FLOOR, screenFund } from '../src/fund-screen';
import { diagnose } from '../src/diagnosis';
import { parseFundList, type FundListing } from '../src/sources/fundamentus-list';
import {
  DISCLAIMER,
  emptyFundProfile,
  emptyFundamentals,
  emptyProvenance,
  type Analysis,
  type FundProfile,
  type FundScreen,
} from '../src/types';

const here = dirname(fileURLToPath(import.meta.url));
const LIST_HTML = readFileSync(join(here, 'fixtures', 'fundamentus-fii-lista.html'), 'utf8');

function listing(partial: Partial<FundListing> & { ticker: string }): FundListing {
  return {
    segment: null,
    price: null,
    ffoYield: null,
    dividendYield12m: null,
    priceToBook: null,
    marketCap: null,
    liquidity: null,
    properties: null,
    vacancy: null,
    ...partial,
  };
}

/** A fund that passes every filter, unless the caller breaks something on purpose. */
function candidateProfile(partial: Partial<FundProfile> = {}): FundProfile {
  return {
    ...emptyFundProfile(),
    segment: 'Logístico / Indústria / Galpões',
    fundType: 'Fundo de Tijolo',
    netWorth: 7_590_000_000,
    adminFee: 0.006,
    adminFeeText: '0,60% a.a',
    manager: 'Pátria Investimentos',
    listedOver5Years: true,
    ...partial,
  };
}

function fakeAnalysis(ticker: string, profile: FundProfile | null, priceToBook = 0.9): Analysis {
  const fundamentals = { ...emptyFundamentals(), price: 100, dividendYield12m: 0.09, priceToBook, vacancy: 0.03 };
  const dividends = {
    yearsPaid: 9,
    consecutiveYears: 9,
    cuts: 0,
    variation: 0.1,
    lastFullYear: { year: 2025, amount: 10 },
    lastChange: 0.02,
    nextPayment: null,
    interestOnCapitalShare: null,
  };
  return {
    ticker,
    kind: 'fii',
    classification: { category: 'fii', rawSector: null, uncertain: false },
    dividends,
    dividendHistory: null,
    filings: null,
    fund: profile,
    fundScreen: profile ? screenFund({ profile, fundamentals, dividends }) : null,
    stockScreen: null,
    notes: [],
    generatedAt: '2026-09-14T12:00:00.000Z',
    fundamentals,
    provenance: emptyProvenance(),
    sources: [],
    diagnosis: diagnose(fundamentals, { kind: 'fii', category: 'fii', peers: {}, dividends }),
    interpretation: null,
    fromCache: false,
    disclaimer: DISCLAIMER,
  };
}

describe('parseFundList', () => {
  it('reads every fund row of the Fundamentus list with its columns by header', () => {
    const listings = parseFundList(LIST_HTML);
    expect(listings.map((l) => l.ticker)).toEqual([
      'AAZQ11',
      'ABCP11',
      'BTLG11',
      'HGLG11',
      'HSML11',
      'KNCR11',
      'MXRF11',
      'XPML11',
    ]);

    const abcp = listings.find((l) => l.ticker === 'ABCP11');
    expect(abcp).toMatchObject({
      segment: 'Shoppings',
      price: 74.5,
      priceToBook: 0.67,
      marketCap: 350_827_000,
      liquidity: 36_226,
      properties: 1,
    });
    expect(abcp?.ffoYield).toBeCloseTo(0.1022);
    expect(abcp?.dividendYield12m).toBeCloseTo(0.0952);
    expect(abcp?.vacancy).toBeCloseTo(0.015);
  });

  it('refuses a table whose columns moved', () => {
    expect(() => parseFundList(LIST_HTML.replace('>P/VP<', '>PVP<'))).toThrow(/colunas ausentes/);
  });
});

describe('preselect', () => {
  it('derives the net worth from market value and P/VP', () => {
    expect(derivedNetWorth(listing({ ticker: 'AAAA11', marketCap: 900_000_000, priceToBook: 0.9 }))).toBeCloseTo(
      1_000_000_000,
    );
    expect(derivedNetWorth(listing({ ticker: 'AAAA11', marketCap: 900_000_000, priceToBook: 0 }))).toBeNull();
    expect(derivedNetWorth(listing({ ticker: 'AAAA11', marketCap: null, priceToBook: 0.9 }))).toBeNull();
  });

  it('keeps funds at the floor, keeps the rounding margin, and skips the rest', () => {
    const exact = listing({ ticker: 'EXAT11', marketCap: NET_WORTH_FLOOR, priceToBook: 1 });
    const margin = listing({
      ticker: 'MARG11',
      marketCap: NET_WORTH_FLOOR * PRESELECT_MARGIN,
      priceToBook: 1,
    });
    const small = listing({ ticker: 'PEQU11', marketCap: NET_WORTH_FLOOR * 0.9, priceToBook: 1 });
    const unknown = listing({ ticker: 'SEMP11', marketCap: NET_WORTH_FLOOR * 3, priceToBook: 0 });

    const { candidates, skipped } = preselect([exact, margin, small, unknown]);
    expect(candidates.map((c) => c.ticker)).toEqual(['EXAT11', 'MARG11']);
    expect(skipped).toEqual([
      { ticker: 'PEQU11', segment: null, netWorth: NET_WORTH_FLOOR * 0.9 },
      { ticker: 'SEMP11', segment: null, netWorth: null },
    ]);
  });

  it('cuts the real list down to the funds worth fetching', () => {
    const { candidates } = preselect(parseFundList(LIST_HTML));
    expect(candidates.map((c) => c.ticker)).toEqual(['BTLG11', 'HGLG11', 'HSML11', 'KNCR11', 'MXRF11', 'XPML11']);
  });
});

describe('outcomeOf', () => {
  const screen = (statuses: ('pass' | 'fail' | 'unknown')[]): FundScreen => ({
    filters: statuses.map((status, i) => ({ key: `f${i}`, label: '', status, value: null, detail: '' })),
    tiebreakers: [],
    passed: statuses.filter((s) => s === 'pass').length,
    unknown: statuses.filter((s) => s === 'unknown').length,
    passedAll: statuses.every((s) => s === 'pass'),
  });

  it('separates approved, pending and rejected', () => {
    expect(outcomeOf(screen(['pass', 'pass']))).toBe('approved');
    expect(outcomeOf(screen(['pass', 'unknown']))).toBe('pending');
    expect(outcomeOf(screen(['pass', 'fail', 'unknown']))).toBe('rejected');
  });
});

describe('screenedFrom', () => {
  it('prefers the sheet segment and falls back to the listing label', () => {
    const own = screenedFrom(fakeAnalysis('HGLG11', candidateProfile()), listing({ ticker: 'HGLG11', segment: 'Multicategoria' }));
    expect(own?.segment).toBe('Logístico / Indústria / Galpões');

    const fallback = screenedFrom(
      fakeAnalysis('HGLG11', candidateProfile({ segment: null, fundType: null })),
      listing({ ticker: 'HGLG11', segment: 'Multicategoria' }),
    );
    expect(fallback?.segment).toBe('Multicategoria');
  });

  it('names the first failing filter and counts the tiebreakers', () => {
    const fund = screenedFrom(
      fakeAnalysis('HTMX11', candidateProfile({ segment: 'Hotel', netWorth: 100 })),
      listing({ ticker: 'HTMX11' }),
    );
    expect(fund?.outcome).toBe('rejected');
    expect(fund?.failedOn?.key).toBe('segment');
    expect(fund?.tiebreakersPassed).toBe(2);
  });

  it('is null for a paper the sources did not read as a fund', () => {
    expect(screenedFrom(fakeAnalysis('PETR4', null), listing({ ticker: 'PETR4' }))).toBeNull();
  });
});

describe('rank', () => {
  const fund = (ticker: string, partial: Partial<ScreenedFund>): ScreenedFund => {
    const base = screenedFrom(fakeAnalysis(ticker, candidateProfile()), listing({ ticker }));
    if (!base) throw new Error('fixture fund did not screen');
    return { ...base, ...partial };
  };

  it('orders approved by tiebreakers, then discount, then ticker', () => {
    const { approved } = rank([
      fund('CCCC11', { tiebreakersPassed: 2, priceToBook: 0.95 }),
      fund('BBBB11', { tiebreakersPassed: 3, priceToBook: 0.95 }),
      fund('AAAA11', { tiebreakersPassed: 2, priceToBook: 0.8 }),
      fund('DDDD11', { tiebreakersPassed: 2, priceToBook: null }),
      fund('EEEE11', { tiebreakersPassed: 2, priceToBook: 0.95 }),
    ]);
    expect(approved.map((f) => f.ticker)).toEqual(['BBBB11', 'AAAA11', 'CCCC11', 'EEEE11', 'DDDD11']);
  });

  it('orders pending by how little is missing and rejected by how far they got', () => {
    const pendingTwo = fund('PPPP11', { outcome: 'pending', screen: { ...fund('PPPP11', {}).screen, unknown: 2 } });
    const pendingOne = fund('QQQQ11', { outcome: 'pending', screen: { ...fund('QQQQ11', {}).screen, unknown: 1 } });
    const rejectedFour = fund('RRRR11', { outcome: 'rejected', screen: { ...fund('RRRR11', {}).screen, passed: 4 } });
    const rejectedOne = fund('SSSS11', { outcome: 'rejected', screen: { ...fund('SSSS11', {}).screen, passed: 1 } });

    const { pending, rejected } = rank([pendingTwo, rejectedOne, pendingOne, rejectedFour]);
    expect(pending.map((f) => f.ticker)).toEqual(['QQQQ11', 'PPPP11']);
    expect(rejected.map((f) => f.ticker)).toEqual(['RRRR11', 'SSSS11']);
  });
});

describe('screenMarket', () => {
  const listings = [
    listing({ ticker: 'HGLG11', segment: 'Multicategoria', marketCap: 6_680_000_000, priceToBook: 0.88 }),
    listing({ ticker: 'XPLG11', segment: 'Logística', marketCap: 4_700_000_000, priceToBook: 0.87 }),
    listing({ ticker: 'MXRF11', segment: 'Logística', marketCap: 4_200_000_000, priceToBook: 0.98 }),
    listing({ ticker: 'BTLG11', segment: 'Multicategoria', marketCap: 7_190_000_000, priceToBook: 0.95 }),
    listing({ ticker: 'FALH11', segment: 'Outros', marketCap: 2_000_000_000, priceToBook: 1 }),
    listing({ ticker: 'PEQU11', segment: 'Outros', marketCap: 100_000_000, priceToBook: 1 }),
  ];

  const profiles: Record<string, FundProfile> = {
    HGLG11: candidateProfile(),
    XPLG11: candidateProfile({ manager: 'XP Asset Management' }),
    MXRF11: candidateProfile({ segment: 'Títulos e Val. Mob.', fundType: 'Fundo de Papel' }),
    BTLG11: candidateProfile({ manager: null }),
  };

  const analyzeFund = async (ticker: string): Promise<Analysis> => {
    if (ticker === 'FALH11') throw new Error('Fonte Investidor10 indisponível: HTTP 503');
    const profile = profiles[ticker];
    if (!profile) throw new Error(`unexpected ticker ${ticker}`);
    return fakeAnalysis(ticker, profile, ticker === 'XPLG11' ? 0.87 : 0.9);
  };

  it('analyses only the pre-selected funds and files each one where it belongs', async () => {
    const events: string[] = [];
    const report = await screenMarket({
      cache: false,
      listings,
      analyzeFund,
      concurrency: 2,
      onEvent: (event) => events.push(event.type),
    });

    expect(report.universe).toBe(6);
    expect(report.candidates).toBe(5);
    expect(report.skipped).toBe(1);

    expect(report.approved.map((f) => f.ticker)).toEqual(['XPLG11', 'HGLG11']);
    expect(report.pending.map((f) => f.ticker)).toEqual(['BTLG11']);
    expect(report.rejected.map((f) => f.ticker)).toEqual(['MXRF11']);
    expect(report.rejected[0]?.failedOn?.key).toBe('segment');
    expect(report.failed).toEqual([
      { ticker: 'FALH11', segment: 'Outros', message: 'Fonte Investidor10 indisponível: HTTP 503' },
    ]);

    expect(report.overlaps).toHaveLength(1);
    expect(report.overlaps[0]).toMatch(/XPLG11 e HGLG11/);

    expect(events[0]).toBe('universe');
    expect(events.at(-1)).toBe('done');
    expect(events.filter((e) => e === 'fund')).toHaveLength(4);
    expect(events.filter((e) => e === 'failure')).toHaveLength(1);
  });

  it('shares one cache handle across every analysis', async () => {
    const seen: unknown[] = [];
    const shared = { read: () => null, write: () => {}, close: () => {} };
    await screenMarket({
      listings: listings.slice(0, 2),
      sharedCache: shared,
      analyzeFund: async (ticker, options) => {
        seen.push(options.sharedCache);
        return analyzeFund(ticker);
      },
    });
    expect(seen).toEqual([shared, shared]);
  });
});
