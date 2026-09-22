import type { Analysis, FundScreen } from './types';
import type { ScreenedFund, MarketScreen, ScreenEvent } from './fund-market';
import type { ScreenedStock, StockMarketScreen, StockScreenEvent } from './stock-market';

/** Compatibility envelopes contain no editorial scores, bands or recommendations. */
const emptyScreen = (): FundScreen => ({ filters: [], tiebreakers: [], passed: 0, unknown: 0, passedAll: false });

export function publicAnalysis(analysis: Analysis): Analysis {
  const { classification: _classification, ...published } = analysis;
  return {
    ...published,
    interpretation: null,
    notes: [],
    fundScreen: null,
    stockScreen: null,
    diagnosis: {
      ...analysis.diagnosis,
      verdict: 'indeterminate',
      counts: { ok: 0, warn: 0, bad: 0, na: 0, unrel: 0 },
      coverage: {
        applicable: 0,
        present: 0,
        notApplicable: 0,
        unreliable: 0,
        minimumForVerdict: 0,
      },
      indicators: analysis.diagnosis.indicators.map(indicator => ({
        ...indicator,
        bands: null,
        signal: indicator.signal === 'na' || indicator.signal === 'unrel' ? indicator.signal : null,
        message: indicator.signal === 'na' ? 'Não se aplica a este indicador.'
          : indicator.signal === 'unrel' ? 'Dado com limitação de interpretação; confira a fonte.'
          : indicator.value === null ? 'Dado indisponível nas fontes consultadas.' : '',
      })),
    },
  } as unknown as Analysis;
}

export function publicItem<T extends ScreenedFund | ScreenedStock>(item: T): T {
  const published = { ...item } as T & { category?: unknown };
  // Stock categories are internal editorial labels, not source data.
  delete published.category;
  return { ...published, outcome: 'pending', verdict: 'indeterminate', screen: emptyScreen(), failedOn: null, tiebreakersPassed: 0 };
}

export function publicReport<T extends MarketScreen | StockMarketScreen>(report: T): T {
  const items = [...report.approved, ...report.pending, ...report.rejected]
    .map(item => publicItem(item)).sort((a, b) => a.ticker.localeCompare(b.ticker));
  // Old feed readers use these buckets. All entries now occupy a single unclassified bucket.
  return { ...report, approved: [], pending: items, rejected: [], overlaps: [] } as T;
}

export function publicEvent(event: ScreenEvent | StockScreenEvent | { type: 'error'; message: string }) {
  if (event.type === 'fund') return { ...event, fund: publicItem(event.fund) };
  if (event.type === 'stock') return { ...event, stock: publicItem(event.stock) };
  if (event.type === 'done') return { ...event, report: publicReport(event.report) };
  return event;
}
