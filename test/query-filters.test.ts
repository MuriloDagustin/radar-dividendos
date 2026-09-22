import { describe, expect, it } from 'vitest';
import { matchesRange, validRange } from '../src/query-filters';

describe('user-defined numeric queries', () => {
  it('keeps all data including missing values when limits are empty', () => {
    for (const value of [null, 0, -2, 100]) expect(matchesRange(value, { min: '', max: '' })).toBe(true);
  });
  it('uses inclusive limits and accepts the decimal comma', () => {
    expect(matchesRange(8.5, { min: '8,5', max: '10' })).toBe(true);
    expect(matchesRange(10, { min: '8,5', max: '10' })).toBe(true);
    expect(matchesRange(8.4, { min: '8,5', max: '10' })).toBe(false);
  });
  it('does not mistake a missing value for zero', () => {
    expect(matchesRange(null, { min: '', max: '0' })).toBe(false);
    expect(matchesRange(0, { min: '', max: '0' })).toBe(true);
    expect(matchesRange(-1, { min: '', max: '0' })).toBe(true);
  });
  it('rejects invalid and inverted ranges instead of silently broadening the result', () => {
    for (const range of [{ min: '10', max: '5' }, { min: 'abc', max: '' }, { min: 'Infinity', max: '' }]) {
      expect(validRange(range)).toBe(false);
      expect(matchesRange(9, range)).toBe(false);
    }
  });
});
