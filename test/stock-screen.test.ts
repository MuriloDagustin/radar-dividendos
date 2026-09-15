import { describe, expect, it } from 'vitest';
import {
  COST_OF_CAPITAL,
  LEVERAGE_CEILING,
  LIQUIDITY_FLOOR,
  NET_MARGIN_FLOOR,
  ROE_FLOOR,
  cheaperThanSector,
  dailyLiquidity,
  leverage,
  netMargin,
  returnOnCapital,
  returnOnEquity,
  revenueGrowth,
  screenStock,
  sustainablePayout,
} from '../src/stock-screen';
import { emptyFundamentals, type Fundamentals } from '../src/types';

function fundamentals(partial: Partial<Fundamentals>): Fundamentals {
  return { ...emptyFundamentals(), ...partial };
}

/** A company that passes every filter, unless the caller breaks something on purpose. */
function candidate(partial: Partial<Fundamentals> = {}): Fundamentals {
  return fundamentals({
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
  });
}

describe('filter 1 — return on equity', () => {
  it('passes at the floor and fails below it', () => {
    expect(returnOnEquity(fundamentals({ roe: ROE_FLOOR }), false).status).toBe('pass');
    expect(returnOnEquity(fundamentals({ roe: 0.149 }), false)).toMatchObject({ status: 'fail', value: '14,9%' });
  });

  it('is unknown without a number, and unknown with the number shown when profit is distorted', () => {
    expect(returnOnEquity(fundamentals({}), false)).toMatchObject({ status: 'unknown', value: null });
    const distorted = returnOnEquity(fundamentals({ roe: 0.3 }), true);
    expect(distorted.status).toBe('unknown');
    expect(distorted.value).toBe('30,0%');
    expect(distorted.detail).toMatch(/distorcido/);
  });

  it('points at the ROIC tiebreaker: a high ROE can be leverage', () => {
    expect(returnOnEquity(fundamentals({ roe: 0.25 }), false).detail).toMatch(/ROIC/);
  });
});

describe('filter 2 — leverage', () => {
  it('passes under the ceiling, treats net cash as a pass, fails at the ceiling', () => {
    expect(leverage(fundamentals({ netDebtToEbitda: 2.49 }), 'evergreen').status).toBe('pass');
    expect(leverage(fundamentals({ netDebtToEbitda: -0.5 }), 'evergreen')).toMatchObject({
      status: 'pass',
      detail: expect.stringMatching(/Caixa líquido/),
    });
    expect(leverage(fundamentals({ netDebtToEbitda: LEVERAGE_CEILING }), 'evergreen').status).toBe('fail');
  });

  it('does not apply to a financial: unknown, pointing at Basileia', () => {
    const c = leverage(fundamentals({ netDebtToEbitda: 8 }), 'financial');
    expect(c.status).toBe('unknown');
    expect(c.value).toBeNull();
    expect(c.detail).toMatch(/Basileia/);
  });

  it('falls back to the derived ratio only when no source published one', () => {
    const derived = leverage(fundamentals({ netDebt: 300, ebitda: 100 }), 'evergreen');
    expect(derived).toMatchObject({ status: 'fail', value: '3,00×' });
    expect(leverage(fundamentals({ netDebt: 300 }), 'evergreen').status).toBe('unknown');
  });
});

describe('filter 3 — net margin', () => {
  it('passes at the floor, fails below, and is unknown when profit is distorted', () => {
    expect(netMargin(fundamentals({ netMargin: NET_MARGIN_FLOOR }), false).status).toBe('pass');
    expect(netMargin(fundamentals({ netMargin: 0.049 }), false).status).toBe('fail');
    expect(netMargin(fundamentals({ netMargin: 0.3 }), true).status).toBe('unknown');
    expect(netMargin(fundamentals({}), false).status).toBe('unknown');
  });
});

describe('filter 4 — revenue growth', () => {
  it('passes on a positive five-year CAGR and says the yearly series is not published', () => {
    const c = revenueGrowth(fundamentals({ revenueCagr5y: 0.03 }));
    expect(c.status).toBe('pass');
    expect(c.value).toBe('3,0% ao ano (5 anos)');
    expect(c.detail).toMatch(/ano a ano/);
  });

  it('fails on zero or shrinking revenue', () => {
    expect(revenueGrowth(fundamentals({ revenueCagr5y: 0 })).status).toBe('fail');
    expect(revenueGrowth(fundamentals({ revenueCagr5y: -0.02 })).status).toBe('fail');
    expect(revenueGrowth(fundamentals({})).status).toBe('unknown');
  });
});

describe('filter 5 — daily liquidity', () => {
  it('passes at the floor and fails below it', () => {
    expect(dailyLiquidity(fundamentals({ avgDailyLiquidity: LIQUIDITY_FLOOR }))).toMatchObject({
      status: 'pass',
      value: 'R$ 5,00 mi por dia',
    });
    expect(dailyLiquidity(fundamentals({ avgDailyLiquidity: 4_999_999 })).status).toBe('fail');
    expect(dailyLiquidity(fundamentals({})).status).toBe('unknown');
  });
});

describe('tiebreakers', () => {
  it('ROIC passes at the cost of capital', () => {
    expect(returnOnCapital(fundamentals({ roic: COST_OF_CAPITAL })).status).toBe('pass');
    expect(returnOnCapital(fundamentals({ roic: 0.1 })).status).toBe('fail');
    expect(returnOnCapital(fundamentals({})).status).toBe('unknown');
  });

  it('payout passes only inside 30–60%, and says why outside', () => {
    expect(sustainablePayout(fundamentals({ payout: 0.3 }), false).status).toBe('pass');
    expect(sustainablePayout(fundamentals({ payout: 0.6 }), false).status).toBe('pass');
    expect(sustainablePayout(fundamentals({ payout: 0.29 }), false).detail).toMatch(/Retém/);
    expect(sustainablePayout(fundamentals({ payout: 0.76 }), false).detail).toMatch(/quase tudo/);
    expect(sustainablePayout(fundamentals({ payout: 1.2 }), false).detail).toMatch(/mais do que ganha/);
    expect(sustainablePayout(fundamentals({ payout: 2.3 }), true).status).toBe('unknown');
  });

  it('valuation compares P/E with the sector median the source published', () => {
    const peers = { priceEarnings: { sector: 8.65 } };
    expect(cheaperThanSector(fundamentals({ priceEarnings: 7.89 }), peers)).toMatchObject({
      status: 'pass',
      value: '7,89× vs. 8,65× do setor',
    });
    expect(cheaperThanSector(fundamentals({ priceEarnings: 9 }), peers).status).toBe('fail');
    expect(cheaperThanSector(fundamentals({ priceEarnings: -3 }), peers).status).toBe('unknown');
    expect(cheaperThanSector(fundamentals({ priceEarnings: 7 }), {})).toMatchObject({ status: 'unknown', value: '7,00×' });
  });
});

describe('screenStock', () => {
  it('passes a healthy company through the five filters and counts the tiebreakers', () => {
    const screen = screenStock({ fundamentals: candidate(), category: 'evergreen', peers: { priceEarnings: { sector: 12 } } });
    expect(screen.filters.map((c) => c.key)).toEqual(['roe', 'leverage', 'margin', 'growth', 'liquidity']);
    expect(screen.passedAll).toBe(true);
    expect(screen.tiebreakers.map((c) => c.status)).toEqual(['pass', 'pass', 'pass']);
  });

  it('detects a distorted profit on its own and empties ROE, margin and payout', () => {
    // P/E above 40 is the distortion signal; nothing else about the company changed.
    const screen = screenStock({ fundamentals: candidate({ priceEarnings: 55 }), category: 'evergreen' });
    expect(screen.filters.find((c) => c.key === 'roe')?.status).toBe('unknown');
    expect(screen.filters.find((c) => c.key === 'margin')?.status).toBe('unknown');
    expect(screen.tiebreakers.find((c) => c.key === 'payout')?.status).toBe('unknown');
    expect(screen.passedAll).toBe(false);
    expect(screen.unknown).toBe(2);
  });

  it('leaves a bank pending on leverage rather than failing or passing it', () => {
    const screen = screenStock({ fundamentals: candidate({ netDebtToEbitda: 9 }), category: 'financial' });
    expect(screen.filters.some((c) => c.status === 'fail')).toBe(false);
    expect(screen.passed).toBe(4);
    expect(screen.unknown).toBe(1);
  });
});
