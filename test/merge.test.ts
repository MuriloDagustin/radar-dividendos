import { describe, expect, it } from 'vitest';
import { mergeReadings } from '../src/merge';
import { emptyFundamentals, type Fundamentals, type SourceReading } from '../src/types';

function reading(
  source: SourceReading['source'],
  partial: Partial<Fundamentals>,
  derived: SourceReading['derived'] = [],
): SourceReading {
  return { source, fundamentals: { ...emptyFundamentals(), ...partial }, derived };
}

describe('mergeReadings', () => {
  it('the first reading in the list is the primary one', () => {
    const { fundamentals, provenance } = mergeReadings([
      reading('brapi', { price: 37.2 }),
      reading('fundamentus', { price: 37.17 }),
    ]);
    expect(fundamentals.price).toBe(37.2);
    expect(provenance.price).toEqual({ source: 'brapi' });
  });

  it('the next source only fills a gap', () => {
    const { fundamentals, provenance } = mergeReadings([
      reading('brapi', { price: 37.2, roe: null }),
      reading('investidor10', { price: 37.17, roe: 0.201, payout: null }),
    ]);
    expect(fundamentals.roe).toBe(0.201);
    expect(provenance.roe).toEqual({ source: 'investidor10' });
    expect(fundamentals.payout).toBeNull();
    expect(provenance.payout).toBeNull();
  });

  it('carries the derived mark along with the source', () => {
    const { provenance } = mergeReadings([
      reading('brapi', { netDebt: 10_000 }, ['netDebt']),
      reading('fundamentus', { ebitda: 2_500 }, ['ebitda']),
    ]);
    expect(provenance.netDebt).toEqual({ source: 'brapi', derived: true });
    expect(provenance.ebitda).toEqual({ source: 'fundamentus', derived: true });
  });

  it('a field absent from every source stays null with no provenance', () => {
    const { fundamentals, provenance } = mergeReadings([
      reading('brapi', {}),
      reading('fundamentus', {}),
    ]);
    expect(Object.values(fundamentals).every((v) => v === null)).toBe(true);
    expect(Object.values(provenance).every((p) => p === null)).toBe(true);
  });

  it('zero is valid data and is not treated as a gap', () => {
    const { fundamentals, provenance } = mergeReadings([
      reading('brapi', { payout: 0 }),
      reading('investidor10', { payout: 0.75 }),
    ]);
    expect(fundamentals.payout).toBe(0);
    expect(provenance.payout).toEqual({ source: 'brapi' });
  });

  it('a published ratio and the raw inputs coexist, each with its own provenance', () => {
    const { fundamentals, provenance } = mergeReadings([
      reading('investidor10', { netDebtToEbitda: 3.48 }),
      reading('fundamentus', { netDebt: 10_413_700_000, ebitda: 2_523_782_608 }, ['ebitda']),
    ]);
    expect(fundamentals.netDebtToEbitda).toBe(3.48);
    expect(provenance.netDebtToEbitda).toEqual({ source: 'investidor10' });
    expect(provenance.netDebt).toEqual({ source: 'fundamentus' });
  });

  it('an empty list yields all nulls', () => {
    expect(mergeReadings([]).fundamentals).toEqual(emptyFundamentals());
  });
});
