import { describe, expect, it } from 'vitest';
import { provenanceLabel } from '../src/provenance';
import type { ProvenanceMap } from '../src/types';

function map(parcial: Partial<ProvenanceMap> = {}): ProvenanceMap {
  return {
    price: null,
    dividendYield12m: null,
    priceEarnings: null,
    priceToBook: null,
    roe: null,
    netDebt: null,
    ebitda: null,
    netDebtToEbitda: null,
    payout: null,
    ...parcial,
  };
}

describe('provenanceLabel', () => {
  it('names the source of a plain field', () => {
    expect(provenanceLabel(map({ roe: { source: 'investidor10' } }), 'roe')).toBe('Investidor10');
  });

  it('marks a derived field', () => {
    expect(
      provenanceLabel(map({ ebitda: { source: 'fundamentus', derived: true } }), 'ebitda'),
    ).toBe('Fundamentus, derivado');
  });

  it('a published ratio shows only the source, with no "calculado"', () => {
    const rotulo = provenanceLabel(
      map({ netDebtToEbitda: { source: 'statusinvest' } }),
      'netDebtToEbitda',
    );
    expect(rotulo).toBe('StatusInvest');
    expect(rotulo).not.toContain('calculado');
  });

  it('a ratio derived from two sources says it was computed and names both', () => {
    expect(
      provenanceLabel(
        map({
          netDebt: { source: 'brapi', derived: true },
          ebitda: { source: 'fundamentus', derived: true },
        }),
        'netDebtToEbitda',
      ),
    ).toBe('brapi.dev + Fundamentus, calculado');
  });

  it('a ratio computed within one source does not repeat its name', () => {
    expect(
      provenanceLabel(
        map({
          netDebt: { source: 'fundamentus' },
          ebitda: { source: 'fundamentus', derived: true },
        }),
        'netDebtToEbitda',
      ),
    ).toBe('Fundamentus, calculado');
  });

  it('the published ratio takes priority over the two inputs', () => {
    expect(
      provenanceLabel(
        map({
          netDebtToEbitda: { source: 'investidor10' },
          netDebt: { source: 'fundamentus' },
          ebitda: { source: 'fundamentus', derived: true },
        }),
        'netDebtToEbitda',
      ),
    ).toBe('Investidor10');
  });

  it('a field with no provenance produces no label', () => {
    expect(provenanceLabel(map(), 'payout')).toBe('');
    expect(provenanceLabel(map(), 'netDebtToEbitda')).toBe('');
  });
});
