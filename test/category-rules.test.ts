import { describe, expect, it } from 'vitest';
import {
  BANDS_ROE,
  CRITICAL_INDICATOR,
  BANDS_ROE_FINANCIAL,
  MESSAGES,
  UNRELIABLE_LIMIT,
  applyLeverageTrend,
  assessRoe,
  diagnose,
  distortedProfit,
  leverageTrend,
} from '../src/diagnosis';
import { emptyFundamentals, type Fundamentals, type Indicator } from '../src/types';

function withFundamentals(partial: Partial<Fundamentals>): Fundamentals {
  return { ...emptyFundamentals(), ...partial };
}

function pick(indicators: Indicator[], key: string): Indicator {
  const found = indicators.find((i) => i.key === key);
  if (!found) throw new Error(`indicator ${key} missing`);
  return found;
}

describe('distortedProfit', () => {
  it.each([
    ['P/E just above the ceiling', { priceEarnings: 40.01, roe: 0.2, dividendYield: 0.05 }],
    ['P/E far above it', { priceEarnings: 45.45, roe: 0.053, dividendYield: 0.066 }],
    ['dividends with negative earnings', { priceEarnings: -8, roe: 0.1, dividendYield: 0.04 }],
    ['dividends with no P/E and no ROE to vouch for the profit', { priceEarnings: null, roe: null, dividendYield: 0.04 }],
    ['dividends with no P/E and a near-zero ROE', { priceEarnings: null, roe: 0.01, dividendYield: 0.04 }],
    ['near-zero ROE against a real yield', { priceEarnings: 20, roe: 0.02, dividendYield: 0.06 }],
  ])('flags %s', (_name, input) => {
    expect(distortedProfit(input)).toBe(true);
  });

  it.each([
    ['P/E exactly at the ceiling', { priceEarnings: 40, roe: 0.2, dividendYield: 0.05 }],
    ['an ordinary company', { priceEarnings: 7.9, roe: 0.2, dividendYield: 0.081 }],
    ['no dividend and no earnings', { priceEarnings: null, roe: null, dividendYield: null }],
    ['negative earnings but no dividend', { priceEarnings: -8, roe: 0.1, dividendYield: 0 }],
    ['a missing P/E when a healthy ROE vouches for the profit', { priceEarnings: null, roe: 0.18, dividendYield: 0.09 }],
    ['low ROE with a yield below the bar', { priceEarnings: 20, roe: 0.02, dividendYield: 0.05 }],
    ['ROE exactly at the floor', { priceEarnings: 20, roe: 0.03, dividendYield: 0.09 }],
  ])('does not flag %s', (_name, input) => {
    expect(distortedProfit(input)).toBe(false);
  });
});

describe('leverageTrend', () => {
  it('two consecutive drops read as deleveraging', () => {
    expect(leverageTrend([5.2, 4.9, 4.5])).toBe('falling');
    expect(leverageTrend([3.0, 5.2, 4.9, 4.5])).toBe('falling');
  });

  it('two consecutive rises read as leveraging up', () => {
    expect(leverageTrend([2.1, 3.0, 4.5])).toBe('rising');
  });

  it('one drop after a rise is not yet a trend', () => {
    expect(leverageTrend([2.0, 4.5, 4.2])).toBe('flat');
  });

  it('fewer than three periods is unknown, not flat', () => {
    expect(leverageTrend([4.5, 4.2])).toBe('unknown');
    expect(leverageTrend([4.5])).toBe('unknown');
    expect(leverageTrend([])).toBe('unknown');
  });

  it('ignores non-finite entries rather than reading them as a move', () => {
    expect(leverageTrend([Number.NaN, 5.2, 4.9, 4.5])).toBe('falling');
  });
});

describe('applyLeverageTrend', () => {
  const highLeverage = { signal: 'bad' as const, message: 'Dívida alta demais para o lucro que a empresa gera' };

  it('softens a bad reading when the debt is coming down', () => {
    expect(applyLeverageTrend(highLeverage, 'falling')).toEqual({
      signal: 'warn',
      message: MESSAGES.deleveraging,
    });
  });

  it('keeps it bad and says so when the debt is going up', () => {
    expect(applyLeverageTrend(highLeverage, 'rising')).toEqual({
      signal: 'bad',
      message: MESSAGES.leveragingUp,
    });
  });

  it('leaves it untouched with no trend to read', () => {
    expect(applyLeverageTrend(highLeverage, 'unknown')).toEqual(highLeverage);
    expect(applyLeverageTrend(highLeverage, 'flat')).toEqual(highLeverage);
  });

  it('never touches a reading that was not bad', () => {
    const comfortable = { signal: 'ok' as const, message: 'Dívida pequena para o tamanho do lucro operacional' };
    expect(applyLeverageTrend(comfortable, 'rising')).toEqual(comfortable);
    expect(applyLeverageTrend(null, 'falling')).toBeNull();
  });
});

describe('financial category', () => {
  const BANK: Partial<Fundamentals> = {
    price: 33.5,
    dividendYield12m: 0.072,
    payout: 0.55,
    priceToBook: 1.9,
    roe: 0.196,
    priceEarnings: 9.4,
    netDebt: 500_000_000_000,
    ebitda: 90_000_000_000,
  };

  it('marks net debt/EBITDA not applicable, with the Basel reason', () => {
    const d = diagnose(withFundamentals(BANK), { category: 'financial' });
    const leverage = pick(d.indicators, 'netDebtToEbitda');
    expect(leverage.signal).toBe('na');
    expect(leverage.message).toBe(MESSAGES.notApplicableFinancial);
    expect(leverage.value).toBeNull();
  });

  it('computes the verdict without the inapplicable indicator', () => {
    const d = diagnose(withFundamentals(BANK), { category: 'financial' });
    expect(d.coverage.applicable).toBe(6);
    expect(d.coverage.notApplicable).toBe(1);
    expect(d.coverage.present).toBe(4);
    expect(d.verdict).toBe('solid');
  });

  it('a bank is not inconclusive just because leverage does not apply', () => {
    expect(diagnose(withFundamentals(BANK), { category: 'financial' }).verdict).not.toBe(
      'inconclusive',
    );
  });

  it.each([
    [0.25, 'ok', 'Rentabilidade forte'],
    [0.18, 'ok', 'Rentabilidade forte'],
    [0.1799, 'ok', 'Rentabilidade ok'],
    [0.12, 'ok', 'Rentabilidade ok'],
    [0.1199, 'warn', 'Rentabilidade fraca'],
    [0.05, 'warn', 'Rentabilidade fraca'],
  ])('ROE %s reads %s on the stricter ruler', (roe, signal, message) => {
    expect(assessRoe(roe, 'financial')).toEqual({ signal, message });
  });

  it('the stricter ruler differs from the general one exactly between 0.12 and 0.18', () => {
    // A 0.15 ROE is "forte" for an ordinary company and merely "ok" for a bank.
    expect(assessRoe(0.15, 'evergreen')?.message).toBe('Rentabilidade forte');
    expect(assessRoe(0.15, 'financial')?.message).toBe('Rentabilidade ok');
  });

  it('the indicator carries the financial band table, so the ruler is drawn from it', () => {
    const d = diagnose(withFundamentals(BANK), { category: 'financial' });
    expect(pick(d.indicators, 'roe').bands).toBe(BANDS_ROE_FINANCIAL);
    expect(pick(d.indicators, 'roe').bands).not.toBe(BANDS_ROE);
  });
});

describe('cyclical category', () => {
  const SOUND_CYCLICAL: Partial<Fundamentals> = {
    price: 20,
    dividendYield12m: 0.08,
    payout: 0.5,
    priceToBook: 1.4,
    roe: 0.19,
    priceEarnings: 8,
    netDebtToEbitda: 1.2,
  };

  it('a good yield is downgraded to a warning about the cycle', () => {
    const d = diagnose(withFundamentals(SOUND_CYCLICAL), { category: 'cyclical' });
    const dy = pick(d.indicators, 'dividendYield12m');
    expect(dy.signal).toBe('warn');
    expect(dy.message).toBe(MESSAGES.cyclicalYield);
    // The number itself is untouched — only its reading changed.
    expect(dy.value).toBe(0.08);
  });

  it('a yield that was already bad or warn keeps its own reading', () => {
    const low = diagnose(withFundamentals({ ...SOUND_CYCLICAL, dividendYield12m: 0.01 }), {
      category: 'cyclical',
    });
    expect(pick(low.indicators, 'dividendYield12m')).toMatchObject({
      signal: 'bad',
      message: 'Rende pouco para quem busca renda',
    });

    const moderate = diagnose(withFundamentals({ ...SOUND_CYCLICAL, dividendYield12m: 0.04 }), {
      category: 'cyclical',
    });
    expect(pick(moderate.indicators, 'dividendYield12m').message).toBe('Moderado');
  });

  it('an evergreen company keeps the plain good-band reading', () => {
    const d = diagnose(withFundamentals(SOUND_CYCLICAL), { category: 'evergreen' });
    expect(pick(d.indicators, 'dividendYield12m')).toMatchObject({
      signal: 'ok',
      message: 'Faixa boa',
    });
  });

  it('high leverage coming down for two periods is a warning, not a critical', () => {
    const d = diagnose(withFundamentals({ ...SOUND_CYCLICAL, netDebtToEbitda: 4.5 }), {
      category: 'cyclical',
      leverageHistory: [5.4, 4.9, 4.5],
    });
    const leverage = pick(d.indicators, 'netDebtToEbitda');
    expect(leverage.signal).toBe('warn');
    expect(leverage.message).toBe(MESSAGES.deleveraging);
  });

  it('high leverage still climbing stays critical and says so', () => {
    const d = diagnose(withFundamentals({ ...SOUND_CYCLICAL, netDebtToEbitda: 4.5 }), {
      category: 'cyclical',
      leverageHistory: [3.1, 3.8, 4.5],
    });
    expect(pick(d.indicators, 'netDebtToEbitda')).toMatchObject({
      signal: 'bad',
      message: MESSAGES.leveragingUp,
    });
  });

  it('with no history the leverage reading is the plain band result', () => {
    const d = diagnose(withFundamentals({ ...SOUND_CYCLICAL, netDebtToEbitda: 4.5 }), {
      category: 'cyclical',
    });
    expect(pick(d.indicators, 'netDebtToEbitda')).toMatchObject({
      signal: 'bad',
      message: 'Dívida alta demais para o lucro que a empresa gera',
    });
  });

  it('the trend never rescues a reading that was not critical', () => {
    const d = diagnose(withFundamentals({ ...SOUND_CYCLICAL, netDebtToEbitda: 3.0 }), {
      category: 'cyclical',
      leverageHistory: [5.4, 4.9, 3.0],
    });
    expect(pick(d.indicators, 'netDebtToEbitda')).toMatchObject({
      signal: 'warn',
      message: 'Dívida alta — nesse nível os contratos de empréstimo começam a apertar',
    });
  });

  it('a distorted bottom line makes payout and ROE unreadable, with the cyclical reason', () => {
    const d = diagnose(withFundamentals({ ...SOUND_CYCLICAL, priceEarnings: 45, payout: 2.3 }), {
      category: 'cyclical',
    });
    expect(pick(d.indicators, 'payout')).toMatchObject({
      signal: 'unrel',
      message: MESSAGES.unreliableCyclicalPayout,
    });
    // Same cause, but the ROE row must not talk about the payout.
    expect(pick(d.indicators, 'roe')).toMatchObject({
      signal: 'unrel',
      message: MESSAGES.unreliableCyclicalRoe,
    });
  });
});

describe('holding category', () => {
  const HOLDING: Partial<Fundamentals> = {
    price: 10,
    dividendYield12m: 0.09,
    payout: 0.6,
    priceToBook: 0.62,
    roe: 0.18,
    priceEarnings: 7.5,
    netDebtToEbitda: 0.4,
  };

  it('a below-book price is structural, not a warning', () => {
    const d = diagnose(withFundamentals(HOLDING), { category: 'holding' });
    const pb = pick(d.indicators, 'priceToBook');
    expect(pb.signal).toBe('ok');
    expect(pb.message).toBe(MESSAGES.holdingDiscount);
  });

  it('the same P/B would warn on an ordinary company', () => {
    const d = diagnose(withFundamentals(HOLDING), { category: 'evergreen' });
    expect(pick(d.indicators, 'priceToBook')).toMatchObject({
      signal: 'warn',
      message: 'Custa menos que o patrimônio — vale entender por quê',
    });
  });

  it('the discount rule does not touch a P/B at or above the bound', () => {
    const d = diagnose(withFundamentals({ ...HOLDING, priceToBook: 0.8 }), {
      category: 'holding',
    });
    expect(pick(d.indicators, 'priceToBook')).toMatchObject({
      signal: 'ok',
      message: 'Preço razoável em relação ao patrimônio',
    });
  });

  it('a stretched holding is still called stretched', () => {
    const d = diagnose(withFundamentals({ ...HOLDING, priceToBook: 3.1 }), {
      category: 'holding',
    });
    expect(pick(d.indicators, 'priceToBook')).toMatchObject({
      signal: 'warn',
      message: 'Custa bem mais que o patrimônio',
    });
  });

  it('the discount does not drag the verdict down', () => {
    expect(diagnose(withFundamentals(HOLDING), { category: 'holding' }).verdict).toBe('solid');
  });
});

describe('evergreen with a distorted bottom line', () => {
  const UTILITY: Partial<Fundamentals> = {
    price: 30,
    dividendYield12m: 0.07,
    payout: 1.8,
    priceToBook: 1.5,
    roe: 0.02,
    priceEarnings: 60,
    netDebtToEbitda: 2.0,
  };

  it('the detector fires even though the sector rules did not', () => {
    const d = diagnose(withFundamentals(UTILITY), { category: 'evergreen' });
    for (const key of ['payout', 'roe']) {
      expect(pick(d.indicators, key).signal, key).toBe('unrel');
      expect(pick(d.indicators, key).message, key).toBe(MESSAGES.unreliableNonRecurring);
    }
  });

  it('a payout above 100% is no longer called insustentável on distorted profit', () => {
    const d = diagnose(withFundamentals(UTILITY), { category: 'evergreen' });
    expect(pick(d.indicators, 'payout').message).not.toContain('insustentável');
    expect(d.counts.bad).toBe(0);
  });

  it('the reason wording differs from the cyclical one', () => {
    expect(MESSAGES.unreliableNonRecurring).not.toBe(MESSAGES.unreliableCyclicalPayout);
  });

  it('protects the verdict even when the classification was wrong', () => {
    // Same numbers, unclassified company: the distortion guard still applies.
    expect(diagnose(withFundamentals(UTILITY)).counts.unrel).toBe(2);
  });
});

describe('inconclusive verdict', () => {
  it('distortion on a panel with almost nothing else readable is inconclusive', () => {
    const d = diagnose(
      withFundamentals({
        dividendYield12m: 0.07,
        payout: 1.8,
        roe: 0.02,
        priceEarnings: 60,
      }),
      { category: 'evergreen' },
    );
    // payout and ROE are distorted; leverage and P/B have no data at all.
    expect(d.coverage.unreliable).toBe(2);
    expect(d.coverage.present).toBe(1);
    expect(d.verdict).toBe('inconclusive');
  });

  it('distortion plus thin coverage is inconclusive, not merely indeterminate', () => {
    const d = diagnose(withFundamentals({ payout: 1.8, roe: 0.02, dividendYield12m: 0.07, priceEarnings: 60 }));
    expect(d.verdict).toBe('inconclusive');
  });

  it('distortion with full coverage on the rest still concludes', () => {
    const d = diagnose(
      withFundamentals({
        dividendYield12m: 0.08,
        payout: 1.8,
        roe: 0.02,
        priceEarnings: 60,
        priceToBook: 1.4,
        netDebtToEbitda: 1.0,
        profitCagr5y: 0.05,
      }),
    );
    expect(d.coverage.unreliable).toBe(2);
    expect(d.coverage.present).toBe(4);
    expect(d.verdict).toBe('solid');
  });

  it('a confirmed critical outranks the distortion', () => {
    const d = diagnose(
      withFundamentals({
        dividendYield12m: 0.01,
        payout: 1.8,
        roe: 0.02,
        priceEarnings: 60,
      }),
    );
    expect(d.verdict).toBe('fragile');
  });

  it('the threshold is three distorted readings', () => {
    expect(UNRELIABLE_LIMIT).toBe(3);
  });
});

describe('a category-critical indicator that cannot be read', () => {
  const DISTORTED_BANK: Partial<Fundamentals> = {
    price: 20,
    dividendYield12m: 0.08,
    payout: 1.9,
    priceToBook: 1.4,
    roe: 0.02,
    priceEarnings: 55,
  };

  it('a bank whose ROE is distorted is never called solid', () => {
    const d = diagnose(withFundamentals(DISTORTED_BANK), { category: 'financial' });
    expect(pick(d.indicators, 'roe').signal).toBe('unrel');
    expect(d.verdict).toBe('inconclusive');
  });

  it('the same numbers on an evergreen company still conclude from the rest', () => {
    const d = diagnose(
      withFundamentals({ ...DISTORTED_BANK, netDebtToEbitda: 1.2, profitCagr5y: 0.04 }),
      { category: 'evergreen' },
    );
    expect(d.verdict).toBe('solid');
  });

  it('ROE is the declared critical indicator only for the financial category', () => {
    expect(CRITICAL_INDICATOR.financial).toBe('roe');
    expect(CRITICAL_INDICATOR.cyclical).toBeUndefined();
    expect(CRITICAL_INDICATOR.evergreen).toBeUndefined();
  });

  it('a bank with a readable ROE concludes normally', () => {
    const d = diagnose(
      withFundamentals({ ...DISTORTED_BANK, roe: 0.19, priceEarnings: 9, payout: 0.6 }),
      { category: 'financial' },
    );
    expect(d.verdict).toBe('solid');
  });
});
