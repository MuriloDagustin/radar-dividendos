import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  coefficientOfVariation,
  completeYears,
  countConsecutive,
  countCuts,
  interestOnCapitalShare,
  nextPayment,
  parseBrDate,
  summarizeDividends,
} from '../src/dividends';
import {
  extractEvents,
  extractPerYear,
  parseProventos,
  perYearFromEvents,
} from '../src/sources/proventos';
import type { DividendEvent, DividendYear } from '../src/types';

const here = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  return new TextDecoder('iso-8859-1').decode(readFileSync(join(here, 'fixtures', name)));
}

const TODAY = new Date(2026, 7, 21);

describe('parseBrDate', () => {
  it('reads the dd/mm/yyyy the page writes', () => {
    const date = parseBrDate('14/08/2026');
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(7);
    expect(date?.getDate()).toBe(14);
  });

  it.each([['2026-08-14'], ['14/8/2026'], [''], ['abc']])('rejects %s', (raw) => {
    expect(parseBrDate(raw)).toBeNull();
  });
});

describe('completeYears', () => {
  const years: DividendYear[] = [
    { year: 2023, amount: 2.9 },
    { year: 2024, amount: 3.5 },
    { year: 2025, amount: 3.2 },
    { year: 2026, amount: 2.0 },
  ];

  it('drops the running year, which is incomplete by definition', () => {
    expect(completeYears(years, 2026).map((y) => y.year)).toEqual([2023, 2024, 2025]);
  });

  it('drops a year with no payment', () => {
    expect(completeYears([...years, { year: 2022, amount: 0 }], 2026).map((y) => y.year)).toEqual([
      2023, 2024, 2025,
    ]);
  });

  it('sorts oldest first, whatever order the page used', () => {
    expect(completeYears([...years].reverse(), 2026).map((y) => y.year)).toEqual([
      2023, 2024, 2025,
    ]);
  });
});

describe('countConsecutive', () => {
  it('counts the unbroken run ending at the last year', () => {
    expect(
      countConsecutive([
        { year: 2023, amount: 1 },
        { year: 2024, amount: 1 },
        { year: 2025, amount: 1 },
      ]),
    ).toBe(3);
  });

  it('stops at a gap instead of counting through it', () => {
    expect(
      countConsecutive([
        { year: 2019, amount: 1 },
        { year: 2020, amount: 1 },
        { year: 2024, amount: 1 },
        { year: 2025, amount: 1 },
      ]),
    ).toBe(2);
  });

  it('is zero with no years at all', () => {
    expect(countConsecutive([])).toBe(0);
  });
});

describe('countCuts', () => {
  it('counts a real drop', () => {
    expect(
      countCuts([
        { year: 2023, amount: 4.0 },
        { year: 2024, amount: 2.0 },
      ]),
    ).toBe(1);
  });

  it('ignores a small wobble, which is calendar drift and not a cut', () => {
    // Eleven instalments one year and thirteen the next is not a policy change.
    expect(
      countCuts([
        { year: 2023, amount: 4.0 },
        { year: 2024, amount: 3.85 },
      ]),
    ).toBe(0);
  });

  it('counts each drop separately', () => {
    expect(
      countCuts([
        { year: 2022, amount: 5 },
        { year: 2023, amount: 3 },
        { year: 2024, amount: 4 },
        { year: 2025, amount: 2 },
      ]),
    ).toBe(2);
  });
});

describe('coefficientOfVariation', () => {
  it('is zero for a flat series', () => {
    expect(coefficientOfVariation([1, 1, 1])).toBe(0);
  });

  it('grows with dispersion', () => {
    const steady = coefficientOfVariation([1, 1.05, 0.95]) ?? 0;
    const wild = coefficientOfVariation([1, 3, 0.2]) ?? 0;
    expect(wild).toBeGreaterThan(steady);
  });

  it('needs at least two points', () => {
    expect(coefficientOfVariation([1])).toBeNull();
    expect(coefficientOfVariation([])).toBeNull();
  });
});

describe('interestOnCapitalShare', () => {
  const events: DividendEvent[] = [
    { exDate: '14/08/2026', paymentDate: null, amount: 0.6, kind: 'JRS CAP PROPRIO' },
    { exDate: '14/08/2026', paymentDate: null, amount: 0.4, kind: 'DIVIDENDO' },
    { exDate: '10/01/2020', paymentDate: null, amount: 5, kind: 'JRS CAP PROPRIO' },
  ];

  it('measures only the last twelve months', () => {
    expect(interestOnCapitalShare(events, new Date(2025, 7, 21))).toBeCloseTo(0.6, 10);
  });

  it('is zero when everything was paid as dividend', () => {
    expect(
      interestOnCapitalShare(
        [{ exDate: '14/08/2026', paymentDate: null, amount: 1, kind: 'Rendimento' }],
        new Date(2025, 7, 21),
      ),
    ).toBe(0);
  });

  it('is null with nothing in the window', () => {
    expect(interestOnCapitalShare(events, new Date(2030, 0, 1))).toBeNull();
  });
});

describe('nextPayment', () => {
  const events: DividendEvent[] = [
    { exDate: '14/08/2026', paymentDate: '26/11/2026', amount: 0.36, kind: 'JRS CAP PROPRIO' },
    { exDate: '11/05/2026', paymentDate: '26/08/2026', amount: 0.56, kind: 'JRS CAP PROPRIO' },
    { exDate: '29/04/2026', paymentDate: '27/05/2026', amount: 0.76, kind: 'DIVIDENDO' },
  ];

  it('picks the nearest date still ahead', () => {
    expect(nextPayment(events, TODAY)?.paymentDate).toBe('26/08/2026');
  });

  it('is null when every payment is behind', () => {
    expect(nextPayment(events, new Date(2027, 0, 1))).toBeNull();
  });

  it('ignores an event with no payment date', () => {
    expect(
      nextPayment([{ exDate: '14/08/2026', paymentDate: null, amount: 1, kind: 'X' }], TODAY),
    ).toBeNull();
  });
});

describe('extractPerYear', () => {
  it('reads the year/amount rows and skips the header', () => {
    expect(
      extractPerYear([
        ['Ano', 'Valor'],
        ['2025', '3,229'],
        ['2024', '3,532'],
      ]),
    ).toEqual([
      { year: 2024, amount: 3.532 },
      { year: 2025, amount: 3.229 },
    ]);
  });

  it('ignores a row whose first cell is not a year', () => {
    expect(extractPerYear([['Total', '10,00']])).toEqual([]);
  });
});

describe('extractEvents', () => {
  it('finds the columns by shape, not by position', () => {
    // The fund page puts the amount last; the stock page puts it second.
    const stock = extractEvents([['14/08/2026', '0,3595', 'JRS CAP PROPRIO', '26/11/2026', '1']]);
    const fund = extractEvents([['30/06/2026', 'Rendimento', '14/07/2026', '0,10']]);

    expect(stock[0]).toMatchObject({ exDate: '14/08/2026', paymentDate: '26/11/2026', amount: 0.3595 });
    expect(fund[0]).toMatchObject({ exDate: '30/06/2026', paymentDate: '14/07/2026', amount: 0.1 });
  });

  it('keeps the kind, because interest on capital is taxed and a dividend is not', () => {
    const events = extractEvents([['14/08/2026', '0,3595', 'JRS CAP PROPRIO', '26/11/2026', '1']]);
    expect(events[0]?.kind).toBe('JRS CAP PROPRIO');
  });

  it('skips a row with no date', () => {
    expect(extractEvents([['Total', '10,00']])).toEqual([]);
  });
});

describe('perYearFromEvents', () => {
  it('sums the monthly events by year, for the page with no yearly table', () => {
    expect(
      perYearFromEvents([
        { exDate: '30/06/2025', paymentDate: null, amount: 0.1, kind: 'Rendimento' },
        { exDate: '31/07/2025', paymentDate: null, amount: 0.11, kind: 'Rendimento' },
        { exDate: '31/07/2024', paymentDate: null, amount: 0.09, kind: 'Rendimento' },
      ]),
    ).toEqual([
      { year: 2024, amount: 0.09 },
      { year: 2025, amount: 0.21000000000000002 },
    ]);
  });
});

describe('parseProventos against the real pages', () => {
  const stock = parseProventos(loadFixture('proventos-taee11.html'));
  const fund = parseProventos(loadFixture('proventos-mxrf11.html'));

  it('reads the yearly table off the stock page', () => {
    expect(stock?.perYear.find((y) => y.year === 2025)?.amount).toBeCloseTo(3.229, 3);
    expect(stock?.perYear.find((y) => y.year === 2024)?.amount).toBeCloseTo(3.532, 3);
  });

  it('reads the individual events with their kind', () => {
    expect(stock?.events.length).toBeGreaterThan(50);
    expect(stock?.events.some((e) => /JRS/i.test(e.kind))).toBe(true);
    expect(stock?.events.some((e) => /DIVIDENDO/i.test(e.kind))).toBe(true);
  });

  it('builds the fund yearly totals from its monthly events', () => {
    expect(fund?.perYear.find((y) => y.year === 2025)?.amount).toBeCloseTo(1.27, 2);
  });

  it('returns null for a page with nothing to read', () => {
    expect(parseProventos('<html><body>nada</body></html>')).toBeNull();
  });
});

describe('summarizeDividends against the real pages', () => {
  const stock = parseProventos(loadFixture('proventos-taee11.html'));
  const fund = parseProventos(loadFixture('proventos-mxrf11.html'));

  it('TAEE11 has a long record with real cuts along the way', () => {
    const record = summarizeDividends(stock!, TODAY);
    expect(record.consecutiveYears).toBeGreaterThanOrEqual(10);
    expect(record.cuts).toBeGreaterThan(0);
    expect(record.lastFullYear).toEqual({ year: 2025, amount: 3.229 });
  });

  it('TAEE11 pays a large share as interest on capital, which is taxed', () => {
    const record = summarizeDividends(stock!, TODAY);
    expect(record.interestOnCapitalShare).toBeGreaterThan(0.2);
  });

  it('the fund distribution is far steadier than the stock one', () => {
    const stockRecord = summarizeDividends(stock!, TODAY);
    const fundRecord = summarizeDividends(fund!, TODAY);
    // This contrast is the whole point of measuring dispersion.
    expect(fundRecord.variation).toBeLessThan(stockRecord.variation ?? 1);
  });

  it('reports the change from the year before last', () => {
    const record = summarizeDividends(stock!, TODAY);
    expect(record.lastChange).toBeLessThan(0);
  });
});
