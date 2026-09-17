import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Analysis } from '../src/types';

let storage: Map<string, string>;
beforeEach(() => {
  vi.resetModules(); storage = new Map();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());

describe('local personal data', () => {
  it('restores saved positions and scenarios after module reload', async () => {
    const store = await import('../app/components/local-store');
    expect(store.updateLocal(d => ({ ...d, favorites: ['TAEE11'], positions: [{ ticker: 'TAEE11', quantity: 10, cost: 30, kind: 'stock', segment: 'Energia' }] }))).toBe(true);
    vi.resetModules();
    const restored = await import('../app/components/local-store');
    expect(restored.readLocalData().positions[0]?.quantity).toBe(10);
    expect(restored.readLocalData().favorites).toEqual(['TAEE11']);
  });
  it('does not overwrite a corrupt backup or claim an unsuccessful write was saved', async () => {
    storage.set('radar-personal-v1', '{broken');
    const store = await import('../app/components/local-store');
    expect(store.updateLocal(d => ({ ...d, favorites: ['TAEE11'] }))).toBe(false);
    expect(storage.get('radar-personal-v1')).toBe('{broken');
    vi.resetModules(); storage.clear();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('quota'); } });
    const blocked = await import('../app/components/local-store');
    expect(blocked.updateLocal(d => ({ ...d, favorites: ['TAEE11'] }))).toBe(false);
    expect(blocked.readLocalData().favorites).toEqual([]);
  });
  it('deduplicates cached observations, orders dates and bounds history', async () => {
    const store = await import('../app/components/local-store');
    const analysis = (day: number) => ({ ticker: 'TAEE11', generatedAt: `2026-08-${String(day).padStart(2, '0')}T12:00:00Z`, diagnosis: { verdict: 'solid', indicators: [{ key: 'roe', label: 'ROE', value: day / 100, signal: 'ok', group: 'core', format: 'percent' }] }, dividends: null }) as Analysis;
    for (let day = 25; day >= 1; day--) store.observeAnalysis(analysis(day));
    store.observeAnalysis(analysis(25));
    const history = store.readLocalData().observations.TAEE11!;
    expect(history).toHaveLength(20);
    expect(history.at(-1)?.at).toContain('08-25');
    expect(history[0]?.at).toContain('08-06');
  });
});


describe('backup and explicit selection', () => {
  it('merges a backup without replacing an existing position and rejects external scenario links', async () => {
    const store = await import('../app/components/local-store');
    store.updateLocal(d => ({ ...d, positions: [{ ticker: 'TAEE11', quantity: 10, cost: 30, kind: 'stock', segment: '' }] }));
    store.importLocalBackup(JSON.stringify({ favorites: ['HGLG11'], positions: [{ ticker: 'TAEE11', quantity: 90, cost: 50, kind: 'stock', segment: '' }] }));
    expect(store.readLocalData().positions[0]?.quantity).toBe(10);
    expect(store.readLocalData().favorites).toContain('HGLG11');
    expect(() => store.importLocalBackup(JSON.stringify({ simulations: [{ id: 'bad', name: 'bad', href: 'https://example.com', amount: '10', contribution: '0', mode: 'equal', horizon: 10 }] }))).toThrow();
  });
  it('keeps approved papers out until explicitly selected', async () => {
    const selection = await import('../app/components/selection');
    const approved = [{ ticker: 'HGLG11' }], pending = [{ ticker: 'MXRF11' }];
    expect(selection.selectedFrom(selection.selectionOf('fiis'), approved, pending)).toEqual([]);
    selection.setSelection('fiis', { unticked: new Set(), ticked: new Set(['HGLG11']) });
    expect(selection.selectedFrom(selection.selectionOf('fiis'), approved, pending)).toEqual(approved);
    expect(JSON.parse(storage.get('radar-selection-fiis')!)).toEqual(['HGLG11']);
  });
});
