import { describe, expect, it } from 'vitest';
import {
  parsePtBrNumber,
  parsePtBrPercent,
  looksLikeTicker,
  normalizeTicker,
} from '../src/numbers';

describe('parsePtBrNumber', () => {
  it.each([
    ['37,17', 37.17],
    ['10.413.700.000', 10_413_700_000],
    ['-1,10', -1.1],
    ['8,1%', 0.081 * 100],
    ['\n          11,1%', 11.1],
    ['0', 0],
  ])('%s → %s', (bruto, esperado) => {
    expect(parsePtBrNumber(bruto)).toBeCloseTo(esperado, 8);
  });

  it.each([['-'], ['--'], [''], ['   '], ['N/A'], ['R$ 1,00']])(
    'returns null for %s rather than risking a guess',
    (bruto) => {
      expect(parsePtBrNumber(bruto)).toBeNull();
    },
  );
});

describe('parsePtBrPercent', () => {
  it('divides by 100', () => {
    expect(parsePtBrPercent('20,1%')).toBeCloseTo(0.201, 10);
  });

  it('keeps the negative sign', () => {
    expect(parsePtBrPercent('-5,98%')).toBeCloseTo(-0.0598, 10);
  });

  it('returns null for an empty field', () => {
    expect(parsePtBrPercent('-')).toBeNull();
  });
});

describe('looksLikeTicker', () => {
  it.each([['TAEE11'], ['ITSA4'], ['PETR4'], ['BBAS3']])('accepts %s', (t) => {
    expect(looksLikeTicker(t)).toBe(true);
  });

  it.each([['taee11'], ['TAEE'], ['TAEE111'], ['TA11'], ['TAEE-11'], ['']])(
    'rejects %s',
    (t) => {
      expect(looksLikeTicker(t)).toBe(false);
    },
  );

  it('normalizeTicker gets user input ready for validation', () => {
    expect(looksLikeTicker(normalizeTicker('  taee11 '))).toBe(true);
  });
});
