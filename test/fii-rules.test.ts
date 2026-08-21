import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BANDS_DIVIDEND_YIELD,
  BANDS_DIVIDEND_YIELD_FII,
  BANDS_PRICE_TO_BOOK,
  BANDS_PRICE_TO_BOOK_FII,
  MESSAGES,
  bandFor,
  categoryNotes,
  cdiSpread,
  diagnose,
  dividendYieldBands,
  priceToBookBands,
} from '../src/diagnosis';
import { classify } from '../src/classification';
import { cdiFromEnv, fetchCdi } from '../src/sources/bcb';
import { emptyFundamentals, type Fundamentals, type Indicator } from '../src/types';

function withFundamentals(partial: Partial<Fundamentals>): Fundamentals {
  return { ...emptyFundamentals(), ...partial };
}

function pick(indicators: Indicator[], key: string): Indicator {
  const found = indicators.find((i) => i.key === key);
  if (!found) throw new Error(`indicator ${key} missing`);
  return found;
}

describe('BANDS_DIVIDEND_YIELD_FII', () => {
  it.each([
    [0.02, 'warn', 'Baixo p/ FII'],
    [0.0599, 'warn', 'Baixo p/ FII'],
    [0.06, 'ok', 'Faixa normal p/ FII'],
    [0.1, 'ok', 'Faixa normal p/ FII'],
    [0.148, 'ok', 'Faixa normal p/ FII'],
    [0.16, 'ok', 'Faixa normal p/ FII'],
    [0.1601, 'warn', 'Muito acima do mercado — risco de crédito ou distribuição não recorrente'],
    [0.3, 'warn', 'Muito acima do mercado — risco de crédito ou distribuição não recorrente'],
  ])('dy %s -> %s', (dy, signal, message) => {
    expect(bandFor(BANDS_DIVIDEND_YIELD_FII, dy)).toMatchObject({ signal, message });
  });

  it('reads the same number differently from the stock ruler', () => {
    // 14.8% is ordinary for a fund and "too high, investigate" for a company.
    expect(bandFor(BANDS_DIVIDEND_YIELD_FII, 0.148)?.signal).toBe('ok');
    expect(bandFor(BANDS_DIVIDEND_YIELD, 0.148)?.signal).toBe('warn');
    // And 7% is good on a stock but merely normal on a fund.
    expect(bandFor(BANDS_DIVIDEND_YIELD, 0.07)?.message).toBe('Faixa boa');
    expect(bandFor(BANDS_DIVIDEND_YIELD_FII, 0.07)?.message).toBe('Faixa normal p/ FII');
  });

  it('a thin fund yield warns instead of being called critical', () => {
    expect(bandFor(BANDS_DIVIDEND_YIELD_FII, 0.02)?.signal).toBe('warn');
    expect(bandFor(BANDS_DIVIDEND_YIELD, 0.02)?.signal).toBe('bad');
  });
});

describe('BANDS_PRICE_TO_BOOK_FII', () => {
  it.each([
    [0.5, 'warn', 'descontada'],
    [0.8499, 'warn', 'descontada'],
    [0.85, 'ok', 'em linha'],
    [1.0, 'ok', 'em linha'],
    [1.05, 'ok', 'em linha'],
    [1.0501, 'ok', 'leve ágio'],
    [1.1, 'ok', 'leve ágio'],
    [1.1001, 'warn', 'ágio'],
    [1.6, 'warn', 'ágio'],
  ])('P/B %s -> %s (%s)', (pb, signal, label) => {
    expect(bandFor(BANDS_PRICE_TO_BOOK_FII, pb)).toMatchObject({ signal, label });
  });

  it('the discount message points at the report to read', () => {
    expect(bandFor(BANDS_PRICE_TO_BOOK_FII, 0.8)?.message).toContain('relatório gerencial');
  });

  it('is stricter than the stock ruler on both sides', () => {
    // 0.9 is a discount on a stock but in line for a fund.
    expect(bandFor(BANDS_PRICE_TO_BOOK, 0.9)?.signal).toBe('ok');
    expect(bandFor(BANDS_PRICE_TO_BOOK_FII, 0.9)?.signal).toBe('ok');
    // 1.6 is still reasonable on a stock and already a premium on a fund.
    expect(bandFor(BANDS_PRICE_TO_BOOK, 1.6)?.signal).toBe('ok');
    expect(bandFor(BANDS_PRICE_TO_BOOK_FII, 1.6)?.signal).toBe('warn');
  });

  it('closes the 1.05 to 1.10 gap rather than leaving a hole', () => {
    for (const pb of [1.06, 1.08, 1.099, 1.1]) {
      expect(bandFor(BANDS_PRICE_TO_BOOK_FII, pb), `${pb}`).not.toBeNull();
    }
  });
});

describe('band selection', () => {
  it('picks the fund tables only for a fund', () => {
    expect(dividendYieldBands(true)).toBe(BANDS_DIVIDEND_YIELD_FII);
    expect(dividendYieldBands(false)).toBe(BANDS_DIVIDEND_YIELD);
    expect(priceToBookBands(true)).toBe(BANDS_PRICE_TO_BOOK_FII);
    expect(priceToBookBands(false)).toBe(BANDS_PRICE_TO_BOOK);
  });

  it('the indicator carries the fund table, so the ruler is drawn from it', () => {
    const d = diagnose(withFundamentals({ dividendYield12m: 0.1 }), { category: 'fii' });
    expect(pick(d.indicators, 'dividendYield12m').bands).toBe(BANDS_DIVIDEND_YIELD_FII);
  });
});

describe('cdiSpread', () => {
  it('is the difference between the yield and the rate', () => {
    expect(cdiSpread(0.148, 0.139)).toBeCloseTo(0.009, 10);
  });

  it('goes negative when the fund pays less than the risk-free rate', () => {
    expect(cdiSpread(0.11, 0.139)).toBeCloseTo(-0.029, 10);
  });

  it('is null when either side is missing', () => {
    expect(cdiSpread(null, 0.139)).toBeNull();
    expect(cdiSpread(0.148, null)).toBeNull();
    expect(cdiSpread(null, null)).toBeNull();
  });
});

describe('the DY vs CDI indicator', () => {
  const FUND: Partial<Fundamentals> = { dividendYield12m: 0.148, priceToBook: 0.84 };

  it('appears for a fund with the premium and the instruction to read it', () => {
    const d = diagnose(withFundamentals(FUND), { category: 'fii', cdiAnnual: 0.139 });
    const spread = pick(d.indicators, 'dyVsCdi');
    expect(spread.value).toBeCloseTo(0.009, 10);
    expect(spread.message).toBe(MESSAGES.cdiSpread);
    expect(spread.label).toBe('DY − CDI');
  });

  it('never carries a signal, so it cannot move the verdict', () => {
    const d = diagnose(withFundamentals(FUND), { category: 'fii', cdiAnnual: 0.139 });
    expect(pick(d.indicators, 'dyVsCdi').signal).toBeNull();
    expect(pick(d.indicators, 'dyVsCdi').bands).toBeNull();
  });

  it('is left out of the coverage tally', () => {
    const withRate = diagnose(withFundamentals(FUND), { category: 'fii', cdiAnnual: 0.139 });
    const withoutRate = diagnose(withFundamentals(FUND), { category: 'fii' });
    expect(withRate.coverage).toEqual(withoutRate.coverage);
  });

  it('says the rate is missing rather than hiding the row', () => {
    const d = diagnose(withFundamentals(FUND), { category: 'fii' });
    const spread = pick(d.indicators, 'dyVsCdi');
    expect(spread.value).toBeNull();
    expect(spread.message).toBe(MESSAGES.cdiMissing);
  });

  it('does not appear for a company', () => {
    const d = diagnose(withFundamentals(FUND), { category: 'evergreen', cdiAnnual: 0.139 });
    expect(d.indicators.find((i) => i.key === 'dyVsCdi')).toBeUndefined();
  });

  it('appears when the sources confirmed the kind even without the category', () => {
    const d = diagnose(withFundamentals(FUND), { kind: 'fii', cdiAnnual: 0.139 });
    expect(pick(d.indicators, 'dyVsCdi').value).toBeCloseTo(0.009, 10);
  });
});

describe('the fixed fund note', () => {
  it('explains the legal distribution floor and what to check', () => {
    const notes = categoryNotes('fii');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('≥95%');
    expect(notes[0]).toContain('relatório gerencial');
    expect(notes[0]).toContain('inadimplência');
  });

  it('is not attached to any other category', () => {
    for (const category of ['financial', 'cyclical', 'evergreen'] as const) {
      expect(categoryNotes(category)).not.toContain(MESSAGES.fiiNote);
    }
  });
});

describe('cdiFromEnv', () => {
  it.each([
    ['13.9', 0.139],
    ['13,9', 0.139],
    ['10', 0.1],
    ['0', 0],
  ])('reads %s as percentage points', (raw, expected) => {
    expect(cdiFromEnv(raw)?.annual).toBeCloseTo(expected, 10);
  });

  it('marks the value as coming from the env', () => {
    expect(cdiFromEnv('13.9')?.source).toBe('env');
  });

  it.each([[undefined], [''], ['   '], ['abc'], ['-1'], ['101']])(
    'rejects %s instead of guessing',
    (raw) => {
      expect(cdiFromEnv(raw)).toBeNull();
    },
  );
});

describe('fetchCdi', () => {
  const ORIGINAL = process.env.RADAR_CDI_ANUAL;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (ORIGINAL === undefined) delete process.env.RADAR_CDI_ANUAL;
    else process.env.RADAR_CDI_ANUAL = ORIGINAL;
  });

  it('reads the Central Bank series', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify([{ data: '20/08/2026', valor: '13.90' }]), { status: 200 }),
      ),
    );

    const cdi = await fetchCdi();
    expect(cdi?.annual).toBeCloseTo(0.139, 10);
    expect(cdi?.source).toBe('bcb');
    expect(cdi?.date).toBe('20/08/2026');
  });

  it('falls back to the env constant when the API fails', async () => {
    process.env.RADAR_CDI_ANUAL = '12.5';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));

    const cdi = await fetchCdi();
    expect(cdi?.annual).toBeCloseTo(0.125, 10);
    expect(cdi?.source).toBe('env');
  });

  it('falls back when the network is down', async () => {
    process.env.RADAR_CDI_ANUAL = '12.5';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET');
      }),
    );

    expect((await fetchCdi())?.source).toBe('env');
  });

  it('yields null when neither the API nor the env has a rate', async () => {
    delete process.env.RADAR_CDI_ANUAL;
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));

    expect(await fetchCdi()).toBeNull();
  });

  it('rejects a nonsense rate from the API rather than trusting it', async () => {
    delete process.env.RADAR_CDI_ANUAL;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([{ valor: '9999' }]), { status: 200 })),
    );

    expect(await fetchCdi()).toBeNull();
  });
});

describe('CPTS11 regression', () => {
  /** CPTS11 as the sources reported it: a paper-heavy fund yielding well above the CDI. */
  const CPTS: Fundamentals = {
    ...emptyFundamentals(),
    price: 7.4,
    dividendYield12m: 0.148,
    priceToBook: 0.84,
  };

  const FUND_SECTOR = { sector: 'Fundos Imobiliários', industry: 'Outros' };

  it('is classified as a fund', () => {
    expect(classify('CPTS11', FUND_SECTOR)).toMatchObject({ category: 'fii', uncertain: false });
  });

  const diagnosis = diagnose(CPTS, { category: 'fii', cdiAnnual: 0.139 });

  it('a 14.8% yield is normal for a fund, not "too high"', () => {
    const dy = pick(diagnosis.indicators, 'dividendYield12m');
    expect(dy.signal).toBe('ok');
    expect(dy.message).toBe('Faixa normal p/ FII');
  });

  it('the stock ruler would have called the same yield too high', () => {
    const asStock = diagnose(CPTS, { category: 'evergreen' });
    expect(pick(asStock.indicators, 'dividendYield12m')).toMatchObject({
      signal: 'warn',
      message: 'Alto demais — investigar',
    });
  });

  it('a 0.84 price to book is the fund discount warning', () => {
    const pb = pick(diagnosis.indicators, 'priceToBook');
    expect(pb.signal).toBe('warn');
    expect(pb.message).toContain('Descontada');
    expect(pb.message).toContain('relatório gerencial');
  });

  it('the stock ruler would have called the same P/B reasonable', () => {
    const asStock = diagnose(CPTS, { category: 'evergreen' });
    expect(pick(asStock.indicators, 'priceToBook')).toMatchObject({
      signal: 'ok',
      message: 'Faixa razoável',
    });
  });

  it('shows the premium over the CDI', () => {
    expect(pick(diagnosis.indicators, 'dyVsCdi').value).toBeCloseTo(0.009, 10);
  });

  it('payout, leverage and ROE do not apply', () => {
    for (const key of ['payout', 'netDebtToEbitda', 'roe']) {
      expect(pick(diagnosis.indicators, key).signal, key).toBe('na');
    }
  });

  it('the verdict rests on the two indicators that apply', () => {
    expect(diagnosis.coverage).toMatchObject({ applicable: 2, present: 2, notApplicable: 3 });
    // One warning out of two readings is not two warnings, so it is not "attention".
    expect(diagnosis.verdict).toBe('solid');
  });
});

describe('TAEE11 must never be treated as a fund', () => {
  const TAESA: Fundamentals = {
    ...emptyFundamentals(),
    price: 37.32,
    dividendYield12m: 0.081,
    payout: 0.76,
    priceToBook: 1.59,
    roe: 0.201,
    priceEarnings: 7.91,
    netDebtToEbitda: 3.48,
  };

  const TAESA_SECTOR = { sector: 'Energia', industry: 'Energia Elétrica' };

  it('is not classified as a fund', () => {
    expect(classify('TAEE11', TAESA_SECTOR).category).not.toBe('fii');
  });

  it('stays out of fii even if a source mislabels its sector as a fund', () => {
    expect(classify('TAEE11', { sector: 'Fundos Imobiliários' }).category).not.toBe('fii');
  });

  const diagnosis = diagnose(TAESA, { category: classify('TAEE11', TAESA_SECTOR).category });

  it('keeps payout, leverage and ROE as real readings', () => {
    for (const key of ['payout', 'netDebtToEbitda', 'roe']) {
      expect(pick(diagnosis.indicators, key).signal, key).not.toBe('na');
      expect(pick(diagnosis.indicators, key).value, key).not.toBeNull();
    }
  });

  it('is judged on the stock yield ruler', () => {
    expect(pick(diagnosis.indicators, 'dividendYield12m').bands).toBe(BANDS_DIVIDEND_YIELD);
    expect(pick(diagnosis.indicators, 'dividendYield12m').message).toBe('Faixa boa');
  });

  it('gets no CDI comparison row', () => {
    expect(diagnosis.indicators.find((i) => i.key === 'dyVsCdi')).toBeUndefined();
  });

  it('gets no fund note', () => {
    expect(categoryNotes(classify('TAEE11', TAESA_SECTOR).category)).toEqual([]);
  });
});
