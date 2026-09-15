import { describe, expect, it } from 'vitest';
import type { ScreenedFund } from '../src/fund-market';
import {
  MAX_PER_FUND,
  MAX_PER_SEGMENT,
  buildPortfolio,
  capWeights,
  projectGrowth,
  segmentShares,
} from '../src/portfolio';
import type { FundScreen } from '../src/types';

const EMPTY_SCREEN: FundScreen = { filters: [], tiebreakers: [], passed: 5, unknown: 0, passedAll: true };

function fund(
  ticker: string,
  over: Partial<Pick<ScreenedFund, 'price' | 'dividendYield12m' | 'segment' | 'tiebreakersPassed'>> = {},
): ScreenedFund {
  return {
    ticker,
    outcome: 'approved',
    segment: 'Logístico',
    manager: null,
    verdict: 'solid',
    screen: EMPTY_SCREEN,
    failedOn: null,
    tiebreakersPassed: 2,
    price: 100,
    dividendYield12m: 0.1,
    priceToBook: 0.9,
    netWorth: 2e9,
    vacancy: 0.03,
    payoutFfo: 0.95,
    consecutiveYears: 8,
    fromCache: true,
    ...over,
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('capWeights', () => {
  const weighted = (score: number, segment = 'A', ticker = `T${score}`) => ({
    fund: fund(ticker, { segment }),
    price: 100,
    score,
  });

  it('is proportional to score when nothing hits a cap', () => {
    const w = capWeights([weighted(1), weighted(3)], { perFund: 1, perSegment: 1 });
    expect(w[0]).toBeCloseTo(0.25);
    expect(w[1]).toBeCloseTo(0.75);
  });

  it('pins a fund at the cap and hands the excess to the others', () => {
    const w = capWeights([weighted(8, 'A', 'X'), weighted(1, 'B', 'Y'), weighted(1, 'C', 'Z')], {
      perFund: 0.5,
      perSegment: 1,
    });
    expect(w[0]).toBeCloseTo(0.5);
    expect(w[1]).toBeCloseTo(0.25);
    expect(w[2]).toBeCloseTo(0.25);
    expect(sum(w)).toBeCloseTo(1);
  });

  it('caps a segment as a whole, scaling its members and moving the rest elsewhere', () => {
    const w = capWeights(
      [weighted(3, 'Log', 'A'), weighted(3, 'Log', 'B'), weighted(1, 'Shop', 'C')],
      { perFund: 1, perSegment: 0.5 },
    );
    expect((w[0] as number) + (w[1] as number)).toBeCloseTo(0.5);
    expect(w[0]).toBeCloseTo(w[1] as number);
    expect(w[2]).toBeCloseTo(0.5);
  });

  it('leaves mass unplaced instead of breaking a cap nothing can absorb', () => {
    const w = capWeights([weighted(1, 'A', 'X'), weighted(1, 'B', 'Y')], { perFund: 0.3, perSegment: 1 });
    expect(w[0]).toBeCloseTo(0.3);
    expect(w[1]).toBeCloseTo(0.3);
  });
});

describe('buildPortfolio: equal split', () => {
  it('buys whole shares, spends the change on the most underweight fund, and keeps the rest', () => {
    const p = buildPortfolio([fund('A', { price: 100 }), fund('B', { price: 130 })], 1000, 'equal');
    // 500 each: A floor 5 (500), B floor 3 (390); change 110 buys one more A (gap 0 vs B gap 110 → B is
    // more underweight but costs 130 > 110), leaving 10.
    const a = p.positions.find((x) => x.ticker === 'A');
    const b = p.positions.find((x) => x.ticker === 'B');
    expect(a?.shares).toBe(6);
    expect(b?.shares).toBe(3);
    expect(p.invested).toBe(990);
    expect(p.leftover).toBe(10);
    expect(p.leftover).toBeLessThan(100);
  });

  it('reports the yield and the monthly income on what was invested', () => {
    const p = buildPortfolio([fund('A', { dividendYield12m: 0.12 })], 1200, 'equal');
    expect(p.positions[0]?.shares).toBe(12);
    expect(p.monthlyIncome).toBeCloseTo(12);
    expect(p.yieldOnCost).toBeCloseTo(0.12);
    expect(p.incomeComplete).toBe(true);
  });

  it('sums income only over funds with a yield and says the total is incomplete', () => {
    const p = buildPortfolio(
      [fund('A', { dividendYield12m: 0.12 }), fund('B', { dividendYield12m: null })],
      2000,
      'equal',
    );
    expect(p.monthlyIncome).toBeCloseTo(10);
    expect(p.incomeComplete).toBe(false);
    expect(p.yieldOnCost).toBeCloseTo(0.12);
  });

  it('excludes a fund without a price, and one whose slice does not buy a share', () => {
    const p = buildPortfolio(
      [fund('A', { price: null }), fund('B', { price: 100 }), fund('C', { price: 900 })],
      1000,
      'equal',
    );
    expect(p.excluded).toEqual([
      { ticker: 'A', reason: 'sem cotação na fonte' },
      { ticker: 'C', reason: 'a fatia não compra uma cota' },
    ]);
    expect(p.positions.map((x) => x.ticker)).toEqual(['B']);
    expect(p.positions[0]?.shares).toBe(10);
  });

  it('is empty for a zero amount or no eligible fund', () => {
    expect(buildPortfolio([fund('A')], 0, 'equal').positions).toEqual([]);
    expect(buildPortfolio([], 1000, 'equal').leftover).toBe(1000);
    expect(buildPortfolio([fund('A', { price: null })], 1000, 'equal').excluded).toHaveLength(1);
  });
});

describe('buildPortfolio: quality weights', () => {
  it('weights by tiebreakers passed plus one, so a 0/3 fund still gets a slice', () => {
    const p = buildPortfolio(
      [fund('A', { tiebreakersPassed: 3 }), fund('B', { tiebreakersPassed: 0 })],
      5000,
      'quality',
    );
    const a = p.positions.find((x) => x.ticker === 'A');
    const b = p.positions.find((x) => x.ticker === 'B');
    expect(a?.targetWeight).toBeCloseTo(0.8);
    expect(b?.targetWeight).toBeCloseTo(0.2);
    expect(a?.shares).toBe(40);
    expect(b?.shares).toBe(10);
  });
});

describe('buildPortfolio: maximise yield', () => {
  const many = [
    fund('A', { dividendYield12m: 0.2, segment: 'Logístico' }),
    fund('B', { dividendYield12m: 0.1, segment: 'Logístico' }),
    fund('C', { dividendYield12m: 0.1, segment: 'Shoppings' }),
    fund('D', { dividendYield12m: 0.1, segment: 'Lajes' }),
    fund('E', { dividendYield12m: 0.1, segment: 'Híbrido' }),
  ];

  it('caps the top payer at the per-fund limit', () => {
    const p = buildPortfolio(many, 100_000, 'yield');
    const a = p.positions.find((x) => x.ticker === 'A');
    expect(a?.targetWeight).toBeCloseTo(MAX_PER_FUND);
    expect(sum(p.positions.map((x) => x.targetWeight))).toBeCloseTo(1);
  });

  it('caps a segment at its limit', () => {
    const p = buildPortfolio(many, 100_000, 'yield');
    const logistics = p.positions.filter((x) => x.segment === 'Logístico');
    expect(sum(logistics.map((x) => x.targetWeight))).toBeLessThanOrEqual(MAX_PER_SEGMENT + 1e-9);
  });

  it('relaxes the caps to the even share when there are too few funds or segments', () => {
    const p = buildPortfolio(
      [fund('A', { dividendYield12m: 0.2 }), fund('B', { dividendYield12m: 0.1 })],
      10_000,
      'yield',
    );
    expect(sum(p.positions.map((x) => x.targetWeight))).toBeCloseTo(1);
    expect(p.positions.find((x) => x.ticker === 'A')?.targetWeight).toBeCloseTo(0.5);
  });

  it('cannot weigh a fund without a yield, and says so', () => {
    const p = buildPortfolio([fund('A'), fund('B', { dividendYield12m: null })], 10_000, 'yield');
    expect(p.excluded).toEqual([{ ticker: 'B', reason: 'sem dividend yield para pesar' }]);
    expect(p.positions.map((x) => x.ticker)).toEqual(['A']);
  });
});

describe('projectGrowth', () => {
  const portfolio = buildPortfolio([fund('A', { dividendYield12m: 0.12 })], 1200, 'equal');

  it('starts at what was invested and compounds monthly when reinvesting', () => {
    const points = projectGrowth(portfolio, 10);
    expect(points).not.toBeNull();
    expect(points?.[0]).toMatchObject({ year: 0, reinvested: 1200, withdrawn: 1200 });
    expect(points?.[1]?.reinvested).toBeCloseTo(1200 * 1.01 ** 12);
    expect(points?.[10]?.reinvested).toBeCloseTo(1200 * 1.01 ** 120);
    expect(points).toHaveLength(11);
  });

  it('grows linearly without reinvesting, and reports the monthly income at each year', () => {
    const points = projectGrowth(portfolio, 5);
    expect(points?.[5]?.withdrawn).toBeCloseTo(1200 * 1.6);
    expect(points?.[0]?.monthlyIncome).toBeCloseTo(12);
    expect(points?.[5]?.monthlyIncome).toBeCloseTo((1200 * 1.01 ** 60) / 100);
  });

  it('adds a monthly contribution to both lines and counts it as own money', () => {
    const points = projectGrowth(portfolio, 1, 100);
    const year1 = points?.[1];
    expect(year1?.contributed).toBeCloseTo(1200 + 1200);
    // Reinvested: annuity-due style compounding of 12 contributions on top of the initial amount.
    let expected = 1200;
    for (let m = 0; m < 12; m += 1) expected = expected * 1.01 + 100;
    expect(year1?.reinvested).toBeCloseTo(expected);
    // Withdrawn: shares bought with contributions, plus 1% a month on the principal held so far.
    let cash = 0;
    let principal = 1200;
    for (let m = 0; m < 12; m += 1) {
      cash += principal * 0.01;
      principal += 100;
    }
    expect(year1?.withdrawn).toBeCloseTo(principal + cash);
    expect(year1?.withdrawn).toBeLessThan(year1?.reinvested as number);
  });

  it('with no contribution matches the closed formulas', () => {
    const points = projectGrowth(portfolio, 3, 0);
    expect(points?.[3]?.reinvested).toBeCloseTo(1200 * 1.01 ** 36);
    expect(points?.[3]?.withdrawn).toBeCloseTo(1200 * 1.36);
    expect(points?.[3]?.contributed).toBe(1200);
  });

  it('is null without a yield or without an investment', () => {
    expect(projectGrowth(buildPortfolio([fund('A', { dividendYield12m: null })], 1000, 'equal'), 10)).toBeNull();
    expect(projectGrowth(buildPortfolio([], 1000, 'equal'), 10)).toBeNull();
    expect(projectGrowth(portfolio, 0)).toBeNull();
  });
});

describe('segmentShares', () => {
  it('groups weights by segment, largest first, ignoring accents and case in the name', () => {
    const p = buildPortfolio(
      [
        fund('A', { segment: 'Logístico' }),
        fund('B', { segment: 'logistico' }),
        fund('C', { segment: 'Shoppings' }),
        fund('D', { segment: null }),
      ],
      4000,
      'equal',
    );
    const shares = segmentShares(p.positions);
    expect(shares.map((s) => [s.segment, s.tickers])).toEqual([
      ['Logístico', ['A', 'B']],
      ['Shoppings', ['C']],
      ['sem segmento', ['D']],
    ]);
    expect(shares[0]?.weight).toBeCloseTo(0.5);
    expect(sum(shares.map((s) => s.weight))).toBeCloseTo(1);
  });
});
