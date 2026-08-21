import { describe, expect, it } from 'vitest';
import { MESSAGES, diagnose } from '../src/diagnosis';
import { classify } from '../src/classification';
import { emptyFundamentals, type Fundamentals, type Indicator } from '../src/types';

/**
 * The numbers Investidor10 published for KLBN11 on 2026-08-20, which is the case that
 * motivated category-aware analysis: a P/E of 45 and a payout of 234% are not a company
 * paying out more than it earns, they are a bottom line distorted by currency swings and
 * biological-asset revaluation.
 */
const KLABIN: Fundamentals = {
  ...emptyFundamentals(),
  price: 18.28,
  dividendYield12m: 0.066,
  priceEarnings: 45.45,
  priceToBook: 2.41,
  roe: 0.053,
  netDebtToEbitda: 4.52,
  payout: 2.3386025886118,
  netDebt: null,
  ebitda: null,
};

const PAPER_AND_PULP = { sector: 'Materiais Básicos', industry: 'Papel e Celulose' };

function pick(indicators: Indicator[], key: string): Indicator {
  const found = indicators.find((i) => i.key === key);
  if (!found) throw new Error(`indicator ${key} missing`);
  return found;
}

describe('KLBN11 classification', () => {
  it('is read as cyclical from its industry', () => {
    expect(classify('KLBN11', PAPER_AND_PULP)).toMatchObject({
      category: 'cyclical',
      uncertain: false,
    });
  });

  it('the sibling class classifies the same way', () => {
    expect(classify('KLBN3', PAPER_AND_PULP).category).toBe('cyclical');
    expect(classify('KLBN4', PAPER_AND_PULP).category).toBe('cyclical');
  });

  it('is still cyclical from the broad sector alone', () => {
    expect(classify('KLBN11', { sector: 'Materiais Básicos' }).category).toBe('cyclical');
  });
});

describe('KLBN11 regression: a 234% payout must not read as insustentável', () => {
  const diagnosis = diagnose(KLABIN, { category: 'cyclical' });
  const payout = pick(diagnosis.indicators, 'payout');

  it('payout comes out unreliable, not critical', () => {
    expect(payout.signal).toBe('unrel');
    expect(payout.signal).not.toBe('bad');
  });

  it('payout explains why the number cannot be read', () => {
    expect(payout.message).toBe(MESSAGES.unreliableCyclicalPayout);
    expect(payout.message).not.toContain('insustentável');
  });

  it('ROE is unreliable for the same reason', () => {
    expect(pick(diagnosis.indicators, 'roe').signal).toBe('unrel');
  });

  it('the distorted payout contributes nothing to the counts', () => {
    expect(diagnosis.counts.unrel).toBe(2);
    expect(diagnosis.coverage.unreliable).toBe(2);
  });

  it('the same numbers under the old category-blind rules would have been critical', () => {
    // Proof the fix is the category rule and not a change to the payout bands.
    const blind = diagnose({ ...KLABIN, priceEarnings: 8 }, { category: 'evergreen' });
    expect(pick(blind.indicators, 'payout')).toMatchObject({
      signal: 'bad',
      message: 'Paga mais do que lucra — não dá para manter assim',
    });
  });
});

describe('KLBN11 regression: the verdict is not fragile because of the payout', () => {
  it('with leverage deleveraging, nothing critical remains', () => {
    const diagnosis = diagnose(KLABIN, {
      category: 'cyclical',
      leverageHistory: [5.4, 4.9, 4.52],
    });

    expect(diagnosis.counts.bad).toBe(0);
    expect(diagnosis.verdict).not.toBe('fragile');
  });

  it('4.52x coming down for two periods reads warn, not bad', () => {
    const diagnosis = diagnose(KLABIN, {
      category: 'cyclical',
      leverageHistory: [5.4, 4.9, 4.52],
    });
    const leverage = pick(diagnosis.indicators, 'netDebtToEbitda');

    expect(leverage.signal).toBe('warn');
    expect(leverage.message).toBe(MESSAGES.deleveraging);
    expect(leverage.value).toBe(4.52);
  });

  it('4.52x still climbing stays critical — the softening is earned, not automatic', () => {
    const diagnosis = diagnose(KLABIN, {
      category: 'cyclical',
      leverageHistory: [3.2, 3.9, 4.52],
    });
    expect(pick(diagnosis.indicators, 'netDebtToEbitda').signal).toBe('bad');
    expect(diagnosis.verdict).toBe('fragile');
  });

  it('without a history the leverage alone is what makes it fragile', () => {
    const diagnosis = diagnose(KLABIN, { category: 'cyclical' });
    expect(pick(diagnosis.indicators, 'netDebtToEbitda').signal).toBe('bad');
    expect(diagnosis.verdict).toBe('fragile');
    // And the reason is the debt, never the payout.
    expect(pick(diagnosis.indicators, 'payout').signal).toBe('unrel');
  });

  it('the cyclical yield is flagged as cycle-dependent rather than stable income', () => {
    const diagnosis = diagnose(KLABIN, { category: 'cyclical' });
    expect(pick(diagnosis.indicators, 'dividendYield12m')).toMatchObject({
      signal: 'warn',
      message: MESSAGES.cyclicalYield,
    });
  });

  it('deleveraging plus the cyclical yield lands on attention, which is the honest read', () => {
    const diagnosis = diagnose(KLABIN, {
      category: 'cyclical',
      leverageHistory: [5.4, 4.9, 4.52],
    });
    // Two warnings: the cycle-dependent dividend and the still-high leverage.
    expect(diagnosis.counts.warn).toBe(2);
    expect(diagnosis.verdict).toBe('attention');
  });
});

describe('ITUB4 regression: a bank is judged without leverage', () => {
  const ITAU: Fundamentals = {
    ...emptyFundamentals(),
    price: 33.4,
    dividendYield12m: 0.071,
    priceEarnings: 9.1,
    priceToBook: 1.85,
    roe: 0.203,
    payout: 0.62,
    netDebt: 700_000_000_000,
    ebitda: 80_000_000_000,
  };

  const diagnosis = diagnose(ITAU, { category: 'financial' });

  it('is classified financial from its subsector', () => {
    expect(classify('ITUB4', { sector: 'Financeiro', subsector: 'Bancos' }).category).toBe(
      'financial',
    );
  });

  it('net debt/EBITDA is not applicable and carries the reason', () => {
    const leverage = pick(diagnosis.indicators, 'netDebtToEbitda');
    expect(leverage.signal).toBe('na');
    expect(leverage.message).toContain('Banco Central');
    expect(leverage.value).toBeNull();
  });

  it('the verdict is computed over the four indicators that remain', () => {
    expect(diagnosis.coverage.applicable).toBe(6);
    expect(diagnosis.coverage.present).toBe(4);
    expect(diagnosis.coverage.notApplicable).toBe(1);
  });

  it('the inapplicable leverage does not count as a finding', () => {
    expect(diagnosis.counts.bad).toBe(0);
    expect(diagnosis.counts.warn).toBe(0);
    expect(diagnosis.verdict).toBe('solid');
  });

  it('would have been called leveraged under the category-blind rules', () => {
    const blind = diagnose(ITAU, { category: 'evergreen' });
    expect(pick(blind.indicators, 'netDebtToEbitda').signal).toBe('bad');
    expect(blind.verdict).toBe('fragile');
  });

  it('a 20.3% ROE is strong even on the stricter bank ruler', () => {
    expect(pick(diagnosis.indicators, 'roe')).toMatchObject({
      signal: 'ok',
      message: 'Rentabilidade forte',
    });
  });
});

describe('ITSA4 regression: a holding is not penalised for its discount', () => {
  const ITAUSA: Fundamentals = {
    ...emptyFundamentals(),
    price: 12.15,
    dividendYield12m: 0.092,
    priceEarnings: 7.5,
    priceToBook: 0.68,
    roe: 0.194,
    payout: 0.688,
    netDebtToEbitda: 0.2,
  };

  const diagnosis = diagnose(ITAUSA, { category: 'holding' });

  it('is recognised as a holding by ticker, whatever the sector says', () => {
    expect(classify('ITSA4', { sector: 'Financeiro', subsector: 'Bancos' }).category).toBe(
      'holding',
    );
  });

  it('the low P/B reads as a structural discount', () => {
    expect(pick(diagnosis.indicators, 'priceToBook')).toMatchObject({
      signal: 'ok',
      message: MESSAGES.holdingDiscount,
    });
  });

  it('the discount raises no warning at all', () => {
    expect(diagnosis.counts.warn).toBe(0);
    expect(diagnosis.verdict).toBe('solid');
  });

  it('would have warned under the category-blind rules', () => {
    const blind = diagnose(ITAUSA, { category: 'evergreen' });
    expect(pick(blind.indicators, 'priceToBook').signal).toBe('warn');
  });
});

describe('KLBN11 wording', () => {
  const diagnosis = diagnose(KLABIN, { category: 'cyclical' });

  it('the ROE row explains ROE, not the payout', () => {
    const roe = pick(diagnosis.indicators, 'roe');
    expect(roe.message).toBe(MESSAGES.unreliableCyclicalRoe);
    expect(roe.message).not.toContain('payout');
  });

  it('the payout row names the alternative basis to check', () => {
    expect(pick(diagnosis.indicators, 'payout').message).toContain('geração de caixa');
  });
});
