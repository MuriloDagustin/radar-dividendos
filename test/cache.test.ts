import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TTL_MS, openCache, type Cache } from '../src/cache';
import { diagnose } from '../src/diagnosis';
import {
  DISCLAIMER,
  emptyFundamentals,
  emptyProvenance,
  type Analysis,
} from '../src/types';

function fakeAnalysis(ticker: string): Analysis {
  const fundamentals = {
    ...emptyFundamentals(),
    price: 10,
    dividendYield12m: 0.09,
    payout: 0.6,
    priceToBook: 1.2,
    roe: 0.18,
    netDebtToEbitda: 1.1,
  };
  return {
    ticker,
    kind: 'stock',
    classification: { category: 'evergreen', rawSector: 'Energia Elétrica', uncertain: false },
    dividends: null,
    dividendHistory: null,
    notes: [],
    generatedAt: '2026-08-20T14:00:00.000Z',
    fundamentals,
    provenance: { ...emptyProvenance(), price: { source: 'brapi' } },
    sources: [{ source: 'brapi', status: 'ok' }],
    diagnosis: diagnose(fundamentals),
    interpretation: null,
    fromCache: false,
    disclaimer: DISCLAIMER,
  };
}

describe('SQLite cache', () => {
  let dir: string;
  let cache: Cache;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'radar-cache-'));
    cache = openCache({ enabled: true, path: join(dir, 'test.sqlite') });
  });

  afterEach(() => {
    cache.close();
    vi.useRealTimers();
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null for a ticker never looked up', () => {
    expect(cache.read('TAEE11')).toBeNull();
  });

  it('writes and reads back, flagging that it came from cache', () => {
    cache.write('TAEE11', fakeAnalysis('TAEE11'));
    const stored = cache.read('TAEE11');
    expect(stored?.ticker).toBe('TAEE11');
    expect(stored?.fromCache).toBe(true);
    expect(stored?.fundamentals.dividendYield12m).toBe(0.09);
    expect(stored?.diagnosis.verdict).toBe('solid');
  });

  it('round-trips the asset kind', () => {
    cache.write('MXRF11', { ...fakeAnalysis('MXRF11'), kind: 'fii' });
    expect(cache.read('MXRF11')?.kind).toBe('fii');
  });

  it('rewriting the same ticker replaces the row', () => {
    cache.write('TAEE11', fakeAnalysis('TAEE11'));
    cache.write('TAEE11', { ...fakeAnalysis('TAEE11'), generatedAt: '2026-08-21T00:00:00.000Z' });
    expect(cache.read('TAEE11')?.generatedAt).toBe('2026-08-21T00:00:00.000Z');
  });

  it('keeps the row right up to the 12h TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T00:00:00Z'));
    cache.write('TAEE11', fakeAnalysis('TAEE11'));

    vi.setSystemTime(new Date(Date.now() + TTL_MS));
    expect(cache.read('TAEE11')).not.toBeNull();
  });

  it('drops the row past the TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T00:00:00Z'));
    cache.write('TAEE11', fakeAnalysis('TAEE11'));

    vi.setSystemTime(new Date(Date.now() + TTL_MS + 1));
    expect(cache.read('TAEE11')).toBeNull();
    // The expired read also clears the row, so the second read is null too.
    expect(cache.read('TAEE11')).toBeNull();
  });

  it('keeps tickers isolated', () => {
    cache.write('TAEE11', fakeAnalysis('TAEE11'));
    expect(cache.read('ITSA4')).toBeNull();
  });

  it('TTL is twelve hours', () => {
    expect(TTL_MS).toBe(12 * 60 * 60 * 1000);
  });
});

describe('disabled cache', () => {
  it('never stores and never returns anything', () => {
    const cache = openCache({ enabled: false });
    cache.write('TAEE11', fakeAnalysis('TAEE11'));
    expect(cache.read('TAEE11')).toBeNull();
    cache.close();
  });
});
