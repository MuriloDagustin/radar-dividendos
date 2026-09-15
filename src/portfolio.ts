import { labelKey } from './sources/scraping';

export type AllocationMode = 'equal' | 'quality' | 'yield';

/**
 * What the arithmetic needs off a screened paper, fund or company alike. The segment is the
 * fund's segment or the company's sector: whatever the concentration cap should count.
 */
export interface Holding {
  ticker: string;
  segment: string | null;
  price: number | null;
  dividendYield12m: number | null;
  tiebreakersPassed: number;
}

export const MODE_NAME: Record<AllocationMode, { label: string; detail: string }> = {
  equal: {
    label: 'divisão igual',
    detail: 'O mesmo valor em cada papel selecionado. Simples e previsível.',
  },
  quality: {
    label: 'peso pela qualidade',
    detail: 'Quem passa em mais critérios de desempate leva fatia maior.',
  },
  yield: {
    label: 'maximizar renda',
    detail:
      'Mais dinheiro em quem paga mais, com teto por papel e por segmento para não concentrar no que pode ser o mais arriscado.',
  },
};

/** Concentration caps for the yield mode, as fractions of the total. */
export const MAX_PER_FUND = 0.25;
export const MAX_PER_SEGMENT = 0.4;

export interface Position {
  ticker: string;
  segment: string | null;
  price: number;
  dividendYield12m: number | null;
  /** Share of the total the mode intended for this fund. */
  targetWeight: number;
  shares: number;
  invested: number;
  /** Share of the amount actually bought, after rounding to whole shares. */
  weight: number;
  /** Twelve-month yield on what was invested, spread over twelve months. */
  monthlyIncome: number | null;
}

export interface Portfolio {
  mode: AllocationMode;
  amount: number;
  positions: Position[];
  invested: number;
  /** Cash that could not buy one more share of any position. */
  leftover: number;
  excluded: { ticker: string; reason: string }[];
  /** Sum over the positions with a known yield; `incomeComplete` says whether that is all of them. */
  monthlyIncome: number | null;
  incomeComplete: boolean;
  /** Weighted twelve-month yield of the positions with a known yield. */
  yieldOnCost: number | null;
}

export interface Weighted {
  holding: Holding;
  price: number;
  score: number;
}

const EPSILON = 1e-9;

function segmentOf(holding: Holding): string {
  return holding.segment ? labelKey(holding.segment) : `sem-segmento:${holding.ticker}`;
}

/**
 * Distributes weight in proportion to score, then pushes anything above a cap back to the
 * others. Funds pinned at a cap stop receiving; the loop ends when nothing is over, or when
 * every fund is pinned — whatever mass is left then stays as cash rather than break a cap.
 */
export function capWeights(
  items: Weighted[],
  caps: { perFund: number; perSegment: number },
): number[] {
  const weights = new Array<number>(items.length).fill(0);
  const pinned = new Array<boolean>(items.length).fill(false);

  for (let pass = 0; pass < items.length * 2 + 2; pass += 1) {
    const free = items.map((_, i) => i).filter((i) => !pinned[i]);
    if (free.length === 0) break;

    const placed = items.reduce((sum, _, i) => sum + (pinned[i] ? (weights[i] as number) : 0), 0);
    const remaining = Math.max(0, 1 - placed);
    const totalScore = free.reduce((sum, i) => sum + (items[i] as Weighted).score, 0);
    if (totalScore <= 0) break;
    for (const i of free) weights[i] = (remaining * (items[i] as Weighted).score) / totalScore;

    const overFund = free.filter((i) => (weights[i] as number) > caps.perFund + EPSILON);
    if (overFund.length > 0) {
      for (const i of overFund) {
        weights[i] = caps.perFund;
        pinned[i] = true;
      }
      continue;
    }

    let overSegment = false;
    const segments = new Map<string, number[]>();
    items.forEach((item, i) => {
      const key = segmentOf(item.holding);
      segments.set(key, [...(segments.get(key) ?? []), i]);
    });
    for (const members of segments.values()) {
      const total = members.reduce((sum, i) => sum + (weights[i] as number), 0);
      if (total <= caps.perSegment + EPSILON) continue;
      const freeMembers = members.filter((i) => !pinned[i]);
      if (freeMembers.length === 0) continue;
      const pinnedTotal = members
        .filter((i) => pinned[i])
        .reduce((sum, i) => sum + (weights[i] as number), 0);
      const room = Math.max(0, caps.perSegment - pinnedTotal);
      const freeTotal = freeMembers.reduce((sum, i) => sum + (weights[i] as number), 0);
      for (const i of freeMembers) {
        weights[i] = freeTotal > 0 ? ((weights[i] as number) / freeTotal) * room : 0;
        pinned[i] = true;
      }
      overSegment = true;
    }
    if (!overSegment) break;
  }

  return weights;
}

function scoreFor(holding: Holding, mode: AllocationMode): number | null {
  switch (mode) {
    case 'equal':
      return 1;
    // +1 so a paper passing no tiebreaker still gets a slice: it did pass the five filters.
    case 'quality':
      return holding.tiebreakersPassed + 1;
    case 'yield':
      return holding.dividendYield12m !== null && holding.dividendYield12m > 0
        ? holding.dividendYield12m
        : null;
  }
}

/**
 * A cap tighter than an even split cannot be met — three funds cannot each stay under 25% —
 * so the effective cap is never below the even share.
 */
function effectiveCaps(items: Weighted[], mode: AllocationMode): { perFund: number; perSegment: number } {
  if (mode !== 'yield') return { perFund: 1, perSegment: 1 };
  const segments = new Set(items.map((w) => segmentOf(w.holding))).size;
  return {
    perFund: Math.max(MAX_PER_FUND, 1 / items.length),
    perSegment: Math.max(MAX_PER_SEGMENT, 1 / Math.max(1, segments)),
  };
}

/**
 * Whole shares only — a paper trades in units of one — so each target is rounded down and
 * the change is then spent one share at a time on whichever paper is furthest below its
 * target, until no position can afford another share.
 */
export function buildPortfolio(
  holdings: Holding[],
  amount: number,
  mode: AllocationMode,
): Portfolio {
  const excluded: Portfolio['excluded'] = [];
  const items: Weighted[] = [];

  for (const holding of holdings) {
    if (holding.price === null || holding.price <= 0) {
      excluded.push({ ticker: holding.ticker, reason: 'sem cotação na fonte' });
      continue;
    }
    const score = scoreFor(holding, mode);
    if (score === null) {
      excluded.push({ ticker: holding.ticker, reason: 'sem dividend yield para pesar' });
      continue;
    }
    items.push({ holding, price: holding.price, score });
  }

  const empty: Portfolio = {
    mode,
    amount,
    positions: [],
    invested: 0,
    leftover: amount,
    excluded,
    monthlyIncome: null,
    incomeComplete: true,
    yieldOnCost: null,
  };
  if (items.length === 0 || !(amount > 0)) return empty;

  const weights = capWeights(items, effectiveCaps(items, mode));
  const shares = items.map((item, i) => Math.floor(((weights[i] as number) * amount) / item.price));
  let leftover = amount - items.reduce((sum, item, i) => sum + (shares[i] as number) * item.price, 0);

  for (;;) {
    let pick = -1;
    let deficit = -Infinity;
    items.forEach((item, i) => {
      if (item.price > leftover + EPSILON) return;
      const gap = (weights[i] as number) * amount - (shares[i] as number) * item.price;
      if (gap > deficit) {
        deficit = gap;
        pick = i;
      }
    });
    if (pick < 0) break;
    shares[pick] = (shares[pick] as number) + 1;
    leftover -= (items[pick] as Weighted).price;
  }

  const positions: Position[] = [];
  items.forEach((item, i) => {
    const count = shares[i] as number;
    if (count === 0) {
      excluded.push({ ticker: item.holding.ticker, reason: 'a fatia não compra um papel inteiro' });
      return;
    }
    const invested = count * item.price;
    const dy = item.holding.dividendYield12m;
    positions.push({
      ticker: item.holding.ticker,
      segment: item.holding.segment,
      price: item.price,
      dividendYield12m: dy,
      targetWeight: weights[i] as number,
      shares: count,
      invested,
      weight: invested / amount,
      monthlyIncome: dy === null ? null : (invested * dy) / 12,
    });
  });

  const invested = positions.reduce((sum, p) => sum + p.invested, 0);
  const withYield = positions.filter((p) => p.dividendYield12m !== null);
  const annualIncome = withYield.reduce((sum, p) => sum + p.invested * (p.dividendYield12m as number), 0);
  const investedWithYield = withYield.reduce((sum, p) => sum + p.invested, 0);

  return {
    mode,
    amount,
    positions,
    invested,
    leftover: Math.max(0, amount - invested),
    excluded,
    monthlyIncome: withYield.length > 0 ? annualIncome / 12 : null,
    incomeComplete: withYield.length === positions.length,
    yieldOnCost: investedWithYield > 0 ? annualIncome / investedWithYield : null,
  };
}

export interface GrowthPoint {
  year: number;
  /** Every distribution buys more shares at the same yield; contributions buy shares too. */
  reinvested: number;
  /** Shares kept, contributions buy shares, distributions pile up as cash. */
  withdrawn: number;
  /** Own money put in by then: the initial amount plus every monthly contribution. */
  contributed: number;
  /** What the reinvested position pays per month by then. */
  monthlyIncome: number;
}

/**
 * A projection, not a forecast: it holds price and yield frozen at today's values and asks
 * only what compounding and a monthly contribution do to them. Month by month because a
 * fund pays monthly and the contribution lands monthly. Null when the portfolio has no
 * yield to compound.
 */
export function projectGrowth(
  portfolio: Portfolio,
  years: number,
  monthlyContribution = 0,
): GrowthPoint[] | null {
  const rate = portfolio.yieldOnCost;
  if (rate === null || portfolio.invested <= 0 || years <= 0) return null;

  const monthly = rate / 12;
  const contribution = Math.max(0, monthlyContribution);
  let reinvested = portfolio.invested;
  let principal = portfolio.invested;
  let cash = 0;

  const points: GrowthPoint[] = [
    { year: 0, reinvested, withdrawn: principal, contributed: principal, monthlyIncome: reinvested * monthly },
  ];
  for (let month = 1; month <= years * 12; month += 1) {
    reinvested = reinvested * (1 + monthly) + contribution;
    cash += principal * monthly;
    principal += contribution;
    if (month % 12 === 0) {
      points.push({
        year: month / 12,
        reinvested,
        withdrawn: principal + cash,
        contributed: principal,
        monthlyIncome: reinvested * monthly,
      });
    }
  }
  return points;
}

export interface SegmentShare {
  segment: string;
  weight: number;
  tickers: string[];
}

/** Weight per segment, largest first — the diversification the tiebreak asks about, in one glance. */
export function segmentShares(positions: Position[]): SegmentShare[] {
  const groups = new Map<string, SegmentShare>();
  for (const p of positions) {
    const name = p.segment ?? 'sem segmento';
    const key = labelKey(name);
    const group = groups.get(key) ?? { segment: name, weight: 0, tickers: [] };
    group.weight += p.weight;
    group.tickers.push(p.ticker);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.weight - a.weight);
}
