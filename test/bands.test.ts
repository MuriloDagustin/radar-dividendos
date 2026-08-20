import { describe, expect, it } from 'vitest';
import {
  BANDS_DIVIDEND_YIELD,
  BANDS_NET_DEBT_TO_EBITDA,
  BANDS_PAYOUT,
  BANDS_PRICE_TO_BOOK,
  BANDS_ROE,
  bandFor,
  diagnose,
} from '../src/diagnosis';
import { emptyFundamentals, type Band } from '../src/types';

const TABLES: [string, readonly Band[]][] = [
  ['dividend yield', BANDS_DIVIDEND_YIELD],
  ['payout', BANDS_PAYOUT],
  ['net debt/EBITDA', BANDS_NET_DEBT_TO_EBITDA],
  ['price/book', BANDS_PRICE_TO_BOOK],
  ['ROE', BANDS_ROE],
];

describe.each(TABLES)('band table: %s', (_name, bands) => {
  const bounds = bands.slice(0, -1).map((b) => b.to as number);

  it('opens at -infinity and closes at +infinity', () => {
    expect(bands[0]?.from).toBeNull();
    expect(bands.at(-1)?.to).toBeNull();
  });

  it('is contiguous: one band upper bound is the next one lower bound', () => {
    for (let i = 0; i < bands.length - 1; i += 1) {
      expect(bands[i]?.to).toBe(bands[i + 1]?.from);
    }
  });

  it('is in ascending order', () => {
    expect(bounds).toEqual([...bounds].sort((a, b) => a - b));
  });

  it('covers any finite number with no gap', () => {
    const samples = [
      -1e6,
      1e6,
      ...bounds,
      ...bounds.map((b) => b - 1e-6),
      ...bounds.map((b) => b + 1e-6),
    ];
    for (const value of samples) {
      expect(bandFor(bands, value), `no band for ${value}`).not.toBeNull();
    }
  });

  it('an exact bound lands in the lower band when inclusive, otherwise the upper one', () => {
    for (let i = 0; i < bands.length - 1; i += 1) {
      const lower = bands[i];
      const upper = bands[i + 1];
      if (!lower || !upper || lower.to === null) continue;
      expect(bandFor(bands, lower.to), `bound ${lower.to}`).toBe(
        lower.toInclusive ? lower : upper,
      );
    }
  });

  it('just below and just above a bound are two distinct neighbours', () => {
    for (let i = 0; i < bands.length - 1; i += 1) {
      const bound = bands[i]?.to;
      if (bound === null || bound === undefined) continue;
      expect(bandFor(bands, bound - 1e-9)).toBe(bands[i]);
      expect(bandFor(bands, bound + 1e-9)).toBe(bands[i + 1]);
    }
  });

  it('labels are short and unique, so they fit on the ruler', () => {
    const labels = bands.map((b) => b.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label.length).toBeLessThanOrEqual(16);
  });
});

describe('bands exposed on the indicator', () => {
  it('a banded indicator carries the table that assessed it', () => {
    const d = diagnose({ ...emptyFundamentals(), dividendYield12m: 0.081 });
    expect(d.indicators.find((i) => i.key === 'dividendYield12m')?.bands).toBe(
      BANDS_DIVIDEND_YIELD,
    );
  });

  it('an informational indicator carries no band', () => {
    const d = diagnose({ ...emptyFundamentals(), price: 37.17, priceEarnings: 7.88 });
    expect(d.indicators.find((i) => i.key === 'price')?.bands).toBeNull();
    expect(d.indicators.find((i) => i.key === 'priceEarnings')?.bands).toBeNull();
  });

  it('a null field keeps its table so the empty ruler can still be drawn', () => {
    const d = diagnose(emptyFundamentals());
    const payout = d.indicators.find((i) => i.key === 'payout');
    expect(payout?.value).toBeNull();
    expect(payout?.bands).toBe(BANDS_PAYOUT);
  });

  it('the indicator signal is the one of the band the value fell into', () => {
    const d = diagnose({ ...emptyFundamentals(), roe: 0.201 });
    const roe = d.indicators.find((i) => i.key === 'roe');
    const band = bandFor(BANDS_ROE, 0.201);
    expect(roe?.signal).toBe(band?.signal);
    expect(roe?.message).toBe(band?.message);
  });
});
