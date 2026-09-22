import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { publicAnalysis, publicEvent, publicItem, publicReport } from '../src/public-data';
import { emptyFundamentals, emptyProvenance, type Analysis } from '../src/types';
import type { MarketScreen, ScreenedFund } from '../src/fund-market';
import type { ScreenedStock } from '../src/stock-market';
import { Card } from '../app/components/card';
import { Compare } from '../app/components/compare';

const screen = { filters: [{ key: 'quality', label: 'Gestora de primeira linha', status: 'pass' as const, value: 'Example', detail: 'Editorial' }], tiebreakers: [], passed: 1, unknown: 0, passedAll: true };
const analysis: Analysis = {
  ticker: 'TEST11', kind: 'fii', classification: { category: 'fii', rawSector: null, uncertain: false },
  dividends: null, dividendHistory: null, filings: null, fund: null, fundScreen: screen, stockScreen: null,
  notes: ['Editorial conclusion'], generatedAt: '2026-09-18T12:00:00Z',
  fundamentals: { ...emptyFundamentals(), price: 100 }, provenance: emptyProvenance(), sources: [],
  diagnosis: { verdict: 'solid', counts: { ok: 1, warn: 0, bad: 0, na: 0, unrel: 0 },
    coverage: { applicable: 1, present: 1, notApplicable: 0, unreliable: 0, minimumForVerdict: 1 },
    indicators: [{ key: 'price', label: 'Preço', group: 'core', value: 100, format: 'currency', signal: 'ok', bands: [], message: 'Faixa boa' }],
  },
  interpretation: { model: 'test', summary: 'Editorial AI summary', watchPoints: [] }, fromCache: true, disclaimer: '',
};
const item: ScreenedFund = {
  ticker: 'TEST11', outcome: 'approved', verdict: 'solid', screen, failedOn: null,
  tiebreakersPassed: 3, price: 100, dividendYield12m: 0.08, priceToBook: 1, netWorth: 2e9,
  vacancy: null, payoutFfo: null, consecutiveYears: null, segment: null, manager: null, fromCache: true,
};

describe('public consultation data', () => {
  it('removes editorial conclusions from cached analysis without mutating it', () => {
    const result = publicAnalysis(analysis);
    expect(result.interpretation).toBeNull();
    expect('classification' in result).toBe(false);
    expect(result.fundScreen).toBeNull();
    expect(result.notes).toEqual([]);
    expect(result.diagnosis.indicators[0]).toMatchObject({ value: 100, bands: null, signal: null, message: '' });
    expect(result.diagnosis.verdict).toBe('indeterminate');
    expect(analysis.diagnosis.verdict).toBe('solid');
    expect(analysis.fundScreen).toBe(screen);
  });
  it('includes all former groups in one alphabetical result without a quality score', () => {
    const report: MarketScreen = { generatedAt: analysis.generatedAt, universe: 2, candidates: 2, skipped: 0,
      approved: [{ ...item, ticker: 'ZZZZ11' }], rejected: [{ ...item, ticker: 'AAAA11', outcome: 'rejected' }], pending: [], failed: [], overlaps: ['Editorial'], disclaimer: '' };
    const result = publicReport(report);
    expect(result.approved).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.pending.map(i => i.ticker)).toEqual(['AAAA11', 'ZZZZ11']);
    expect(result.pending.every(i => i.tiebreakersPassed === 0 && i.screen.filters.length === 0)).toBe(true);
    expect(result.overlaps).toEqual([]);
    expect(publicEvent({ type: 'done', report })).toEqual({ type: 'done', report: result });
    expect(publicEvent({ type: 'fund', fund: item, done: 1, total: 1 })).toMatchObject({ fund: { screen: { filters: [] }, outcome: 'pending' } });
    const stock = publicItem({ ...item, category: 'evergreen' } as unknown as ScreenedStock);
    expect('category' in stock).toBe(false);
  });
  it('does not render old ratings even when receiving an old snapshot', () => {
    for (const html of [renderToStaticMarkup(createElement(Card, { analysis })), renderToStaticMarkup(createElement(Compare, { analyses: [analysis] }))]) {
      expect(html).toContain('100,00');
      for (const phrase of ['Sólida', 'Faixa boa', 'Gestora de primeira linha', 'Editorial AI summary', 'veredito']) expect(html).not.toContain(phrase);
    }
  });
});
