import { describe, expect, it } from 'vitest';
import {
  BANDS_DIVIDEND_YIELD,
  BANDS_DIVIDEND_YIELD_FII,
  BANDS_NET_DEBT_TO_EBITDA,
  BANDS_PRICE_TO_BOOK_FII,
  BANDS_ROE,
} from '../src/diagnosis';
import { bandIndex, positionInBand } from '../app/components/ruler';
import { formatBound, formatValue } from '../app/format';

const DY_EXTENT = { below: 0, above: 0.25 };
const DEBT_EXTENT = { below: -2, above: 7 };

describe('bandIndex', () => {
  it('points at the band the value fell into', () => {
    expect(bandIndex(BANDS_DIVIDEND_YIELD, 0.081)).toBe(2);
    expect(bandIndex(BANDS_DIVIDEND_YIELD, 0.02)).toBe(0);
    expect(bandIndex(BANDS_DIVIDEND_YIELD, 0.2)).toBe(3);
  });

  it('respeita o bound favorável, igual ao motor', () => {
    expect(bandIndex(BANDS_DIVIDEND_YIELD, 0.13)).toBe(2);
    expect(bandIndex(BANDS_DIVIDEND_YIELD, 0.1301)).toBe(3);
    expect(bandIndex(BANDS_ROE, 0.15)).toBe(2);
  });
});

describe('positionInBand', () => {
  const goodBand = BANDS_DIVIDEND_YIELD[2];
  const highBand = BANDS_DIVIDEND_YIELD[3];
  const netCashBand = BANDS_NET_DEBT_TO_EBITDA[0];

  it('interpolates inside a closed band', () => {
    if (!goodBand) throw new Error('band missing');
    // 0.095 sits in the middle of 0.06-0.13.
    expect(positionInBand(goodBand, 0.095, DY_EXTENT)).toBeCloseTo(0.5, 6);
  });

  it('uses the visual extent on the open upper band', () => {
    if (!highBand) throw new Error('band missing');
    // 0.19 entre o bound 0.13 e a extensão 0.25.
    expect(positionInBand(highBand, 0.19, DY_EXTENT)).toBeCloseTo(0.5, 6);
  });

  it('uses the visual extent on the open lower band', () => {
    if (!netCashBand) throw new Error('band missing');
    // -1 entre a extensão -2 e o bound 0.
    expect(positionInBand(netCashBand, -1, DEBT_EXTENT)).toBeCloseTo(0.5, 6);
  });

  it('never touches the edge, so the needle is not read as the neighbouring band', () => {
    if (!goodBand || !highBand) throw new Error('band missing');
    expect(positionInBand(goodBand, 0.06, DY_EXTENT)).toBe(0.08);
    expect(positionInBand(goodBand, 0.13, DY_EXTENT)).toBe(0.92);
    // Far past the visual extent it stays pinned to the edge, never leaving the band.
    expect(positionInBand(highBand, 5, DY_EXTENT)).toBe(0.92);
  });

  it('grows together with the value inside the band', () => {
    if (!goodBand) throw new Error('band missing');
    const positions = [0.07, 0.09, 0.11, 0.125].map((v) =>
      positionInBand(goodBand, v, DY_EXTENT),
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('returns the middle when the band has no width', () => {
    expect(
      positionInBand({ from: 1, to: 1, signal: 'ok', label: 'x', message: 'x' }, 1, DY_EXTENT),
    ).toBe(0.5);
  });
});

describe('formatValue', () => {
  it.each([
    [0.081, 'percent', '8,1%'],
    [-0.0598, 'percent', '-6,0%'],
    [4.126, 'multiple', '4,13×'],
    [37.17, 'currency', 'R$ 37,17'],
    [10_413_700_000, 'currency', 'R$ 10,41 bi'],
    [2_500_000, 'currency', 'R$ 2,50 mi'],
  ] as const)('%s as %s -> %s', (value, format, expected) => {
    expect(formatValue(value, format)).toBe(expected);
  });

  it('an absent field becomes an em dash', () => {
    expect(formatValue(null, 'percent')).toBe('—');
  });
});

describe('formatBound', () => {
  it.each([
    [0.13, 'percent', '13%'],
    [0.035, 'percent', '3,5%'],
    [1.5, 'multiple', '1,5'],
    [0, 'multiple', '0'],
  ] as const)('%s as %s -> %s', (bound, format, expected) => {
    expect(formatBound(bound, format)).toBe(expected);
  });

  it('an open band prints no bound', () => {
    expect(formatBound(null, 'multiple')).toBe('');
  });
});

describe('formatBound precision', () => {
  it('keeps the fund P/B bounds distinguishable', () => {
    // One decimal printed 1.05 and 1.10 as the same "1,1".
    const bounds = [0.85, 1.05, 1.1].map((b) => formatBound(b, 'multiple'));
    expect(bounds).toEqual(['0,85', '1,05', '1,1']);
    expect(new Set(bounds).size).toBe(3);
  });

  it('still prints the stock bounds without noise', () => {
    expect([0, 1.5, 2.5, 3.5].map((b) => formatBound(b, 'multiple'))).toEqual([
      '0',
      '1,5',
      '2,5',
      '3,5',
    ]);
  });

  it('every bound of every table renders as its own text', () => {
    for (const [name, bands] of [
      ['DY fii', BANDS_DIVIDEND_YIELD_FII],
      ['P/B fii', BANDS_PRICE_TO_BOOK_FII],
    ] as const) {
      const printed = bands
        .slice(0, -1)
        .map((b) => formatBound(b.to, b === bands[0] && name.startsWith('DY') ? 'percent' : 'multiple'));
      expect(new Set(printed).size, name).toBe(printed.length);
    }
  });
});
