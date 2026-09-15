import { describe, expect, it } from 'vitest';
import {
  MESSAGES,
  assessDividendYield,
  assessNetDebtToEbitda,
  assessPayout,
  assessPriceToBook,
  assessRoe,
  computeNetDebtToEbitda,
  decideVerdict,
  diagnose,
  minimumForVerdict,
  resolveNetDebtToEbitda,
} from '../src/diagnosis';
import { emptyFundamentals, type Fundamentals } from '../src/types';

describe('assessDividendYield', () => {
  it.each([
    [0.5, 'warn', 'Rende alto demais para ser normal — entenda por quê antes de comprar'],
    [0.1301, 'warn', 'Rende alto demais para ser normal — entenda por quê antes de comprar'],
    [0.13, 'ok', 'Faixa boa'],
    [0.1, 'ok', 'Faixa boa'],
    [0.06, 'ok', 'Faixa boa'],
    [0.0599, 'warn', 'Moderado'],
    [0.045, 'warn', 'Moderado'],
    [0.03, 'warn', 'Moderado'],
    [0.0299, 'bad', 'Rende pouco para quem busca renda'],
    [0, 'bad', 'Rende pouco para quem busca renda'],
  ])('dy %s -> %s', (dy, signal, message) => {
    expect(assessDividendYield(dy)).toEqual({ signal, message });
  });

  it('returns null with no data', () => {
    expect(assessDividendYield(null)).toBeNull();
  });
});

describe('assessPayout', () => {
  it.each([
    [1.5, 'bad', 'Paga mais do que lucra — não dá para manter assim'],
    [1.0001, 'bad', 'Paga mais do que lucra — não dá para manter assim'],
    [1.0, 'ok', 'Saudável'],
    [0.7, 'ok', 'Saudável'],
    [0.4, 'ok', 'Saudável'],
    [0.3999, 'warn', 'Paga pouco e guarda o resto para reinvestir'],
    [0.3, 'warn', 'Paga pouco e guarda o resto para reinvestir'],
    [0.25, 'warn', 'Paga pouco e guarda o resto para reinvestir'],
    [0.2499, 'warn', 'Paga menos que o usual para uma empresa de dividendos'],
    [0, 'warn', 'Paga menos que o usual para uma empresa de dividendos'],
  ])('payout %s -> %s', (payout, signal, message) => {
    expect(assessPayout(payout)).toEqual({ signal, message });
  });

  it('returns null with no data', () => {
    expect(assessPayout(null)).toBeNull();
  });
});

describe('computeNetDebtToEbitda', () => {
  it('divides net debt by EBITDA', () => {
    expect(computeNetDebtToEbitda(3_000_000, 1_000_000)).toBe(3);
  });

  it('keeps the negative sign of a net cash position', () => {
    expect(computeNetDebtToEbitda(-2_000_000, 1_000_000)).toBe(-2);
  });

  it.each([
    ['debt missing', null, 1_000_000],
    ['EBITDA missing', 3_000_000, null],
    ['both missing', null, null],
  ])('returns null with %s', (_case, debt, ebitda) => {
    expect(computeNetDebtToEbitda(debt, ebitda)).toBeNull();
  });

  it.each([[0], [-500_000]])(
    'returns null with EBITDA %s rather than an unreadable multiple',
    (ebitda) => {
      expect(computeNetDebtToEbitda(3_000_000, ebitda)).toBeNull();
    },
  );
});

describe('resolveNetDebtToEbitda', () => {
  it('prefers the ratio a source published', () => {
    const f: Fundamentals = {
      ...emptyFundamentals(),
      netDebt: 10_000,
      ebitda: 1_000,
      netDebtToEbitda: 3.48,
    };
    expect(resolveNetDebtToEbitda(f)).toBe(3.48);
  });

  it('falls back to deriving only when nobody published it', () => {
    const f: Fundamentals = { ...emptyFundamentals(), netDebt: 10_000, ebitda: 1_000 };
    expect(resolveNetDebtToEbitda(f)).toBe(10);
  });

  it('stays null when neither route is possible', () => {
    expect(resolveNetDebtToEbitda(emptyFundamentals())).toBeNull();
  });
});

describe('assessNetDebtToEbitda', () => {
  it.each([
    [-3, 'ok', 'Tem mais dinheiro em caixa do que dívida'],
    [-0.0001, 'ok', 'Tem mais dinheiro em caixa do que dívida'],
    [0, 'ok', 'Dívida pequena para o tamanho do lucro operacional'],
    [1, 'ok', 'Dívida pequena para o tamanho do lucro operacional'],
    [1.5, 'ok', 'Dívida pequena para o tamanho do lucro operacional'],
    [1.5001, 'ok', 'Dívida dentro do usual para o tamanho do lucro operacional'],
    [2, 'ok', 'Dívida dentro do usual para o tamanho do lucro operacional'],
    [2.5, 'ok', 'Dívida dentro do usual para o tamanho do lucro operacional'],
    [2.5001, 'warn', 'Dívida alta — nesse nível os contratos de empréstimo começam a apertar'],
    [3, 'warn', 'Dívida alta — nesse nível os contratos de empréstimo começam a apertar'],
    [3.5, 'warn', 'Dívida alta — nesse nível os contratos de empréstimo começam a apertar'],
    [3.5001, 'bad', 'Dívida alta demais para o lucro que a empresa gera'],
    [8, 'bad', 'Dívida alta demais para o lucro que a empresa gera'],
  ])('ratio %s -> %s', (ratio, signal, message) => {
    expect(assessNetDebtToEbitda(ratio)).toEqual({ signal, message });
  });

  it('returns null with no data', () => {
    expect(assessNetDebtToEbitda(null)).toBeNull();
  });
});

describe('assessPriceToBook', () => {
  it.each([
    [0.3, 'warn', 'Custa menos que o patrimônio — vale entender por quê'],
    [0.7999, 'warn', 'Custa menos que o patrimônio — vale entender por quê'],
    [0.8, 'ok', 'Preço razoável em relação ao patrimônio'],
    [1.6, 'ok', 'Preço razoável em relação ao patrimônio'],
    [2.5, 'ok', 'Preço razoável em relação ao patrimônio'],
    [2.5001, 'warn', 'Custa bem mais que o patrimônio'],
    [10, 'warn', 'Custa bem mais que o patrimônio'],
  ])('P/B %s -> %s', (pb, signal, message) => {
    expect(assessPriceToBook(pb)).toEqual({ signal, message });
  });

  it('returns null with no data', () => {
    expect(assessPriceToBook(null)).toBeNull();
  });
});

describe('assessRoe', () => {
  it.each([
    [0.4, 'ok', 'Rentabilidade forte'],
    [0.15, 'ok', 'Rentabilidade forte'],
    [0.1499, 'ok', 'Rentabilidade ok'],
    [0.12, 'ok', 'Rentabilidade ok'],
    [0.08, 'ok', 'Rentabilidade ok'],
    [0.0799, 'warn', 'Rentabilidade fraca'],
    [0, 'warn', 'Rentabilidade fraca'],
    [-0.05, 'warn', 'Rentabilidade fraca'],
  ])('ROE %s -> %s', (roe, signal, message) => {
    expect(assessRoe(roe)).toEqual({ signal, message });
  });

  it('returns null with no data', () => {
    expect(assessRoe(null)).toBeNull();
  });
});

describe('minimumForVerdict', () => {
  it.each([
    [5, 3],
    [4, 2],
    [3, 2],
    [2, 2],
    [1, 2],
    [0, 2],
  ])('%s applicable -> minimum %s', (applicable, minimum) => {
    expect(minimumForVerdict(applicable)).toBe(minimum);
  });
});

/** Derives the coverage the engine would compute from a signal list. */
function cov(applicable: number, signals: (import('../src/types').Signal | null)[]) {
  const present = signals.filter((s) => s === 'ok' || s === 'warn' || s === 'bad').length;
  const unreliable = signals.filter((s) => s === 'unrel').length;
  return { applicable, present, unreliable };
}

describe('decideVerdict', () => {
  const FIVE = 5;

  it('a single bad already drops it to fragile', () => {
    expect(decideVerdict(['ok', 'ok', 'ok', 'bad'], cov(FIVE, ['ok', 'ok', 'ok', 'bad']))).toBe('fragile');
  });

  it('bad outranks the warn count', () => {
    expect(decideVerdict(['warn', 'warn', 'warn', 'bad'], cov(FIVE, ['warn', 'warn', 'warn', 'bad']))).toBe('fragile');
  });

  it('two warns become attention', () => {
    expect(decideVerdict(['ok', 'warn', 'warn'], cov(FIVE, ['ok', 'warn', 'warn']))).toBe('attention');
  });

  it('an affirmative finding stands even without coverage', () => {
    expect(decideVerdict(['bad', null, null, null, null], cov(FIVE, ['bad', null, null, null, null]))).toBe('fragile');
    expect(decideVerdict(['warn', 'warn', null, null, null], cov(FIVE, ['warn', 'warn', null, null, null]))).toBe('attention');
  });

  it('a lone warn with enough coverage is still solid', () => {
    expect(decideVerdict(['ok', 'ok', 'warn'], cov(FIVE, ['ok', 'ok', 'warn']))).toBe('solid');
  });

  it('only ok, with coverage, is solid', () => {
    expect(decideVerdict(['ok', 'ok', 'ok'], cov(FIVE, ['ok', 'ok', 'ok']))).toBe('solid');
  });

  it('null never counts as a warn', () => {
    expect(decideVerdict(['ok', 'ok', 'ok', null, null], cov(FIVE, ['ok', 'ok', 'ok', null, null]))).toBe('solid');
  });

  /** The bug this guards: an analysis with no data must never read as approval. */
  it('no indicator at all is indeterminate, never solid', () => {
    expect(decideVerdict([null, null, null, null, null], cov(FIVE, [null, null, null, null, null]))).toBe('indeterminate');
  });

  it('below the minimum is indeterminate even with every present signal ok', () => {
    expect(decideVerdict(['ok', 'ok', null, null, null], cov(FIVE, ['ok', 'ok', null, null, null]))).toBe('indeterminate');
    expect(decideVerdict(['ok', null, null, null, null], cov(FIVE, ['ok', null, null, null, null]))).toBe('indeterminate');
  });

  it('a FII needs both of its two applicable indicators', () => {
    expect(decideVerdict(['ok', 'ok'], cov(2, ['ok', 'ok']))).toBe('solid');
    expect(decideVerdict(['ok', null], cov(2, ['ok', null]))).toBe('indeterminate');
  });
});

function withFundamentals(partial: Partial<Fundamentals>): Fundamentals {
  return { ...emptyFundamentals(), ...partial };
}

const HEALTHY_STOCK: Partial<Fundamentals> = {
  price: 37.17,
  dividendYield12m: 0.081,
  payout: 0.75,
  netDebtToEbitda: 1,
  priceToBook: 1.59,
  roe: 0.201,
  priceEarnings: 7.88,
};

describe('diagnose', () => {
  it('builds the core indicators in the expected order', () => {
    const d = diagnose(emptyFundamentals());
    expect(d.indicators.filter((i) => i.group === 'core').map((i) => i.key)).toEqual([
      'price',
      'dividendYield12m',
      'payout',
      'netDebtToEbitda',
      'priceToBook',
      'roe',
      'priceEarnings',
      'dividendStreak',
      'profitCagr5y',
    ]);
  });

  it('keeps the supporting rows out of the core panel', () => {
    const d = diagnose(emptyFundamentals());
    const context = d.indicators.filter((i) => i.group === 'context').map((i) => i.key);
    expect(context).toContain('roic');
    expect(context).toContain('dividendVariation');
    expect(context.every((k) => !['dividendYield12m', 'payout'].includes(k))).toBe(true);
  });

  it('price and P/E are shown but carry no signal and no weight', () => {
    const d = diagnose(withFundamentals({ ...HEALTHY_STOCK, priceToBook: 0.5 }));
    expect(d.indicators.find((i) => i.key === 'price')).toMatchObject({
      value: 37.17,
      signal: null,
      message: MESSAGES.informational,
    });
    expect(d.indicators.find((i) => i.key === 'priceEarnings')).toMatchObject({
      value: 7.88,
      signal: null,
      message: MESSAGES.informational,
    });
  });

  it('labels an absent field as having no data', () => {
    const d = diagnose(emptyFundamentals());
    for (const indicator of d.indicators) {
      expect(indicator.value, indicator.key).toBeNull();
      expect(indicator.signal, indicator.key).toBeNull();
    }
    // The dividend streak says why it is empty rather than repeating the generic line.
    expect(d.indicators.find((i) => i.key === 'dividendStreak')?.message).toBe(
      MESSAGES.noHistory,
    );
    expect(d.indicators.find((i) => i.key === 'payout')?.message).toBe(MESSAGES.noData);
  });

  it('an empty analysis is indeterminate, not solid', () => {
    const d = diagnose(emptyFundamentals());
    expect(d.verdict).toBe('indeterminate');
    expect(d.coverage).toEqual({
      applicable: 7,
      present: 0,
      notApplicable: 0,
      unreliable: 0,
      minimumForVerdict: 4,
    });
  });

  it('uses the published ratio when there is one', () => {
    const d = diagnose(withFundamentals({ netDebt: 10_413_700_000, netDebtToEbitda: 3.48 }));
    const ratio = d.indicators.find((i) => i.key === 'netDebtToEbitda');
    expect(ratio?.value).toBe(3.48);
    expect(ratio).toMatchObject({ signal: 'warn', message: 'Dívida alta — nesse nível os contratos de empréstimo começam a apertar' });
  });

  it('derives the ratio only in the absence of a published one', () => {
    const d = diagnose(withFundamentals({ netDebt: 10_413_700_000, ebitda: 2_523_782_608 }));
    const ratio = d.indicators.find((i) => i.key === 'netDebtToEbitda');
    expect(ratio?.value).toBeCloseTo(4.126, 3);
    expect(ratio).toMatchObject({ signal: 'bad', message: 'Dívida alta demais para o lucro que a empresa gera' });
    expect(d.verdict).toBe('fragile');
  });

  it('a healthy company closes as solid', () => {
    const d = diagnose(withFundamentals(HEALTHY_STOCK));
    expect(d.counts).toMatchObject({ ok: 5, warn: 0, bad: 0 });
    expect(d.coverage).toMatchObject({ applicable: 7, present: 5 });
    expect(d.verdict).toBe('solid');
  });

  it('two warnings with no bad and enough coverage close as attention', () => {
    const d = diagnose(
      withFundamentals({ ...HEALTHY_STOCK, dividendYield12m: 0.04, priceToBook: 0.5 }),
    );
    expect(d.counts).toMatchObject({ ok: 3, warn: 2, bad: 0 });
    expect(d.verdict).toBe('attention');
  });

  it('negative EBITDA erases the ratio instead of flipping its sign', () => {
    const d = diagnose(withFundamentals({ netDebt: 5_000_000_000, ebitda: -1_000_000_000 }));
    const ratio = d.indicators.find((i) => i.key === 'netDebtToEbitda');
    expect(ratio?.value).toBeNull();
    expect(ratio?.signal).toBeNull();
  });
});

describe('diagnose for a FII', () => {
  const FUND: Partial<Fundamentals> = {
    price: 9.22,
    dividendYield12m: 0.1292,
    priceToBook: 1,
  };

  it('marks payout, leverage and ROE as not applicable', () => {
    const d = diagnose(withFundamentals(FUND), { kind: 'fii' });
    for (const key of ['payout', 'netDebtToEbitda', 'roe']) {
      const indicator = d.indicators.find((i) => i.key === key);
      expect(indicator?.signal, key).toBe('na');
      expect(indicator?.message, key).toBe(MESSAGES.notApplicableFii);
    }
  });

  it('keeps dividend yield and P/B applicable', () => {
    const d = diagnose(withFundamentals(FUND), { kind: 'fii' });
    expect(d.indicators.find((i) => i.key === 'dividendYield12m')).toMatchObject({
      signal: 'ok',
    });
    expect(d.indicators.find((i) => i.key === 'priceToBook')).toMatchObject({
      signal: 'ok',
    });
  });

  it('counts coverage over every indicator that applies to a fund', () => {
    const d = diagnose(withFundamentals(FUND), { kind: 'fii' });
    expect(d.coverage).toEqual({
      applicable: 5,
      present: 2,
      notApplicable: 3,
      unreliable: 0,
      minimumForVerdict: 3,
    });
    // Yield and P/B alone are two readings out of five: not enough to headline a fund.
    expect(d.verdict).toBe('indeterminate');
  });

  it('a fund with its vacancy read has enough to judge', () => {
    const d = diagnose(withFundamentals({ ...FUND, vacancy: 0.03 }), { kind: 'fii' });
    expect(d.coverage).toMatchObject({ applicable: 5, present: 3, minimumForVerdict: 3 });
    expect(d.verdict).toBe('solid');
  });

  it('a fund of paper has no vacancy to read, and is not judged on it', () => {
    const d = diagnose(withFundamentals(FUND), { kind: 'fii', paperFund: true });
    expect(d.indicators.find((i) => i.key === 'vacancy')).toMatchObject({
      signal: 'na',
      value: null,
      message: MESSAGES.notApplicablePaperFund,
    });
    expect(d.coverage).toMatchObject({ applicable: 4, minimumForVerdict: 2 });
    expect(d.verdict).toBe('solid');
  });

  it('drops the value of an inapplicable indicator even if a source supplied it', () => {
    const d = diagnose(withFundamentals({ ...FUND, roe: 0.2, payout: 0.9 }), { kind: 'fii' });
    expect(d.indicators.find((i) => i.key === 'roe')?.value).toBeNull();
    expect(d.indicators.find((i) => i.key === 'payout')?.value).toBeNull();
  });

  it('a fund with only one reading is indeterminate', () => {
    const d = diagnose(withFundamentals({ dividendYield12m: 0.1292 }), { kind: 'fii' });
    expect(d.coverage).toMatchObject({ applicable: 5, present: 1 });
    expect(d.verdict).toBe('indeterminate');
  });

  it('a fund with no data at all is indeterminate', () => {
    expect(diagnose(emptyFundamentals(), { kind: 'fii' }).verdict).toBe('indeterminate');
  });
});
