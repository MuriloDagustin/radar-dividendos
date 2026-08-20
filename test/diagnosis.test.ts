import { describe, expect, it } from 'vitest';
import {
  INFORMATIONAL,
  NOT_APPLICABLE,
  NO_DATA,
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
    [0.5, 'warn', 'Alto demais — investigar'],
    [0.1301, 'warn', 'Alto demais — investigar'],
    [0.13, 'ok', 'Faixa boa'],
    [0.1, 'ok', 'Faixa boa'],
    [0.06, 'ok', 'Faixa boa'],
    [0.0599, 'warn', 'Moderado'],
    [0.045, 'warn', 'Moderado'],
    [0.03, 'warn', 'Moderado'],
    [0.0299, 'bad', 'Baixo p/ carteira de renda'],
    [0, 'bad', 'Baixo p/ carteira de renda'],
  ])('dy %s -> %s', (dy, signal, message) => {
    expect(assessDividendYield(dy)).toEqual({ signal, message });
  });

  it('returns null with no data', () => {
    expect(assessDividendYield(null)).toBeNull();
  });
});

describe('assessPayout', () => {
  it.each([
    [1.5, 'bad', 'Acima de 100% — insustentável'],
    [1.0001, 'bad', 'Acima de 100% — insustentável'],
    [1.0, 'ok', 'Saudável'],
    [0.7, 'ok', 'Saudável'],
    [0.4, 'ok', 'Saudável'],
    [0.3999, 'warn', 'Baixo — reinvestindo'],
    [0.3, 'warn', 'Baixo — reinvestindo'],
    [0.25, 'warn', 'Baixo — reinvestindo'],
    [0.2499, 'warn', 'Abaixo do mínimo usual'],
    [0, 'warn', 'Abaixo do mínimo usual'],
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
    [-3, 'ok', 'Caixa líquido'],
    [-0.0001, 'ok', 'Caixa líquido'],
    [0, 'ok', 'Confortável'],
    [1, 'ok', 'Confortável'],
    [1.5, 'ok', 'Confortável'],
    [1.5001, 'ok', 'Normal'],
    [2, 'ok', 'Normal'],
    [2.5, 'ok', 'Normal'],
    [2.5001, 'warn', 'Atenção (covenants)'],
    [3, 'warn', 'Atenção (covenants)'],
    [3.5, 'warn', 'Atenção (covenants)'],
    [3.5001, 'bad', 'Alavancagem alta'],
    [8, 'bad', 'Alavancagem alta'],
  ])('ratio %s -> %s', (ratio, signal, message) => {
    expect(assessNetDebtToEbitda(ratio)).toEqual({ signal, message });
  });

  it('returns null with no data', () => {
    expect(assessNetDebtToEbitda(null)).toBeNull();
  });
});

describe('assessPriceToBook', () => {
  it.each([
    [0.3, 'warn', 'Descontada — entender por quê'],
    [0.7999, 'warn', 'Descontada — entender por quê'],
    [0.8, 'ok', 'Faixa razoável'],
    [1.6, 'ok', 'Faixa razoável'],
    [2.5, 'ok', 'Faixa razoável'],
    [2.5001, 'warn', 'Preço esticado'],
    [10, 'warn', 'Preço esticado'],
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

describe('decideVerdict', () => {
  const FIVE = 5;

  it('a single bad already drops it to fragile', () => {
    expect(decideVerdict(['ok', 'ok', 'ok', 'bad'], FIVE)).toBe('fragile');
  });

  it('bad outranks the warn count', () => {
    expect(decideVerdict(['warn', 'warn', 'warn', 'bad'], FIVE)).toBe('fragile');
  });

  it('two warns become attention', () => {
    expect(decideVerdict(['ok', 'warn', 'warn'], FIVE)).toBe('attention');
  });

  it('an affirmative finding stands even without coverage', () => {
    expect(decideVerdict(['bad', null, null, null, null], FIVE)).toBe('fragile');
    expect(decideVerdict(['warn', 'warn', null, null, null], FIVE)).toBe('attention');
  });

  it('a lone warn with enough coverage is still solid', () => {
    expect(decideVerdict(['ok', 'ok', 'warn'], FIVE)).toBe('solid');
  });

  it('only ok, with coverage, is solid', () => {
    expect(decideVerdict(['ok', 'ok', 'ok'], FIVE)).toBe('solid');
  });

  it('null never counts as a warn', () => {
    expect(decideVerdict(['ok', 'ok', 'ok', null, null], FIVE)).toBe('solid');
  });

  /** The bug this guards: an analysis with no data must never read as approval. */
  it('no indicator at all is indeterminate, never solid', () => {
    expect(decideVerdict([null, null, null, null, null], FIVE)).toBe('indeterminate');
  });

  it('below the minimum is indeterminate even with every present signal ok', () => {
    expect(decideVerdict(['ok', 'ok', null, null, null], FIVE)).toBe('indeterminate');
    expect(decideVerdict(['ok', null, null, null, null], FIVE)).toBe('indeterminate');
  });

  it('a FII needs both of its two applicable indicators', () => {
    expect(decideVerdict(['ok', 'ok'], 2)).toBe('solid');
    expect(decideVerdict(['ok', null], 2)).toBe('indeterminate');
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
  it('builds the seven indicators in the expected order', () => {
    const d = diagnose(emptyFundamentals());
    expect(d.indicators.map((i) => i.key)).toEqual([
      'price',
      'dividendYield12m',
      'payout',
      'netDebtToEbitda',
      'priceToBook',
      'roe',
      'priceEarnings',
    ]);
  });

  it('price and P/E are shown but carry no signal and no weight', () => {
    const d = diagnose(withFundamentals({ ...HEALTHY_STOCK, priceToBook: 0.5 }));
    expect(d.indicators.find((i) => i.key === 'price')).toMatchObject({
      value: 37.17,
      signal: null,
      message: INFORMATIONAL,
    });
    expect(d.indicators.find((i) => i.key === 'priceEarnings')).toMatchObject({
      value: 7.88,
      signal: null,
      message: INFORMATIONAL,
    });
  });

  it('labels an absent field as having no data', () => {
    const d = diagnose(emptyFundamentals());
    for (const indicator of d.indicators) {
      expect(indicator.value).toBeNull();
      expect(indicator.signal).toBeNull();
      expect(indicator.message).toBe(NO_DATA);
    }
  });

  it('an empty analysis is indeterminate, not solid', () => {
    const d = diagnose(emptyFundamentals());
    expect(d.verdict).toBe('indeterminate');
    expect(d.coverage).toEqual({ applicable: 5, present: 0, minimumForVerdict: 3 });
  });

  it('uses the published ratio when there is one', () => {
    const d = diagnose(withFundamentals({ netDebt: 10_413_700_000, netDebtToEbitda: 3.48 }));
    const ratio = d.indicators.find((i) => i.key === 'netDebtToEbitda');
    expect(ratio?.value).toBe(3.48);
    expect(ratio).toMatchObject({ signal: 'warn', message: 'Atenção (covenants)' });
  });

  it('derives the ratio only in the absence of a published one', () => {
    const d = diagnose(withFundamentals({ netDebt: 10_413_700_000, ebitda: 2_523_782_608 }));
    const ratio = d.indicators.find((i) => i.key === 'netDebtToEbitda');
    expect(ratio?.value).toBeCloseTo(4.126, 3);
    expect(ratio).toMatchObject({ signal: 'bad', message: 'Alavancagem alta' });
    expect(d.verdict).toBe('fragile');
  });

  it('a healthy company closes as solid', () => {
    const d = diagnose(withFundamentals(HEALTHY_STOCK));
    expect(d.counts).toEqual({ ok: 5, warn: 0, bad: 0 });
    expect(d.coverage).toMatchObject({ applicable: 5, present: 5 });
    expect(d.verdict).toBe('solid');
  });

  it('two warnings with no bad and enough coverage close as attention', () => {
    const d = diagnose(
      withFundamentals({ ...HEALTHY_STOCK, dividendYield12m: 0.04, priceToBook: 0.5 }),
    );
    expect(d.counts).toEqual({ ok: 3, warn: 2, bad: 0 });
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
    const d = diagnose(withFundamentals(FUND), 'fii');
    for (const key of ['payout', 'netDebtToEbitda', 'roe']) {
      const indicator = d.indicators.find((i) => i.key === key);
      expect(indicator?.applicable, key).toBe(false);
      expect(indicator?.message, key).toBe(NOT_APPLICABLE);
      expect(indicator?.signal, key).toBeNull();
    }
  });

  it('keeps dividend yield and P/B applicable', () => {
    const d = diagnose(withFundamentals(FUND), 'fii');
    expect(d.indicators.find((i) => i.key === 'dividendYield12m')).toMatchObject({
      applicable: true,
      signal: 'ok',
    });
    expect(d.indicators.find((i) => i.key === 'priceToBook')).toMatchObject({
      applicable: true,
      signal: 'ok',
    });
  });

  it('counts coverage over the two indicators that apply', () => {
    const d = diagnose(withFundamentals(FUND), 'fii');
    expect(d.coverage).toEqual({ applicable: 2, present: 2, minimumForVerdict: 2 });
    expect(d.verdict).toBe('solid');
  });

  it('drops the value of an inapplicable indicator even if a source supplied it', () => {
    const d = diagnose(withFundamentals({ ...FUND, roe: 0.2, payout: 0.9 }), 'fii');
    expect(d.indicators.find((i) => i.key === 'roe')?.value).toBeNull();
    expect(d.indicators.find((i) => i.key === 'payout')?.value).toBeNull();
  });

  it('a fund with only one of the two is indeterminate', () => {
    const d = diagnose(withFundamentals({ dividendYield12m: 0.1292 }), 'fii');
    expect(d.coverage).toMatchObject({ applicable: 2, present: 1 });
    expect(d.verdict).toBe('indeterminate');
  });

  it('a fund with no data at all is indeterminate', () => {
    expect(diagnose(emptyFundamentals(), 'fii').verdict).toBe('indeterminate');
  });
});
