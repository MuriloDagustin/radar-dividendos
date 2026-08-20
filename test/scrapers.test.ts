import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { UnexpectedFormatError, TickerNotFoundError } from '../src/errors';
import { parseInvestidor10, extractIndicators as indInvestidor10 } from '../src/sources/investidor10';
import { parseStatusInvest, extractIndicators as indStatusInvest } from '../src/sources/statusinvest';
import { labelKey, parseNumber } from '../src/sources/scraping';

const here = dirname(fileURLToPath(import.meta.url));

function loadGzFixture(nome: string): string {
  return gunzipSync(readFileSync(join(here, 'fixtures', nome))).toString('utf8');
}

const INVESTIDOR10_HTML = loadGzFixture('investidor10-taee11.html.gz');
const STATUSINVEST_HTML = loadGzFixture('statusinvest-taee11.html.gz');

describe('parseNumber', () => {
  it.each([
    ['8,09%', 8.09],
    ['75.976515021007', 75.976515021007],
    ['1.234,56', 1234.56],
    ['R$ 37,33', 37.33],
    ['-0,65', -0.65],
    ['3,48', 3.48],
    ['0', 0],
  ])('%s → %s', (bruto, esperado) => {
    expect(parseNumber(bruto)).toBeCloseTo(esperado, 8);
  });

  it.each([['-'], ['--'], [''], ['  '], ['N/D'], ['R$']])('null para %s', (bruto) => {
    expect(parseNumber(bruto)).toBeNull();
  });
});

describe('labelKey', () => {
  it('unifies the spellings of one indicator within a site', () => {
    expect(labelKey('Dívida Líquida / Ebitda')).toBe(labelKey('Divida Liquida/Ebitda'));
    expect(labelKey('  ROE ')).toBe('roe');
  });

  it('keeps the slash, which tells P/E from P/B apart', () => {
    expect(labelKey('P/L')).toBe('p/l');
    expect(labelKey('P/VP')).toBe('p/vp');
    expect(labelKey('P/L')).not.toBe(labelKey('P/VP'));
  });

  it('drops the abbreviating dot', () => {
    expect(labelKey('Dív. líquida/EBITDA')).toBe('divliquida/ebitda');
  });
});

describe('Investidor10', () => {
  it('reads the raw attribute value, without the on-screen rounding', () => {
    const leitura = parseInvestidor10(INVESTIDOR10_HTML, 'TAEE11');
    // The screen shows 75.98%; the attribute carries full precision.
    expect(leitura.fundamentals.payout).toBeCloseTo(0.75976515021007, 12);
  });

  it('brings the payout Fundamentus does not publish', () => {
    expect(parseInvestidor10(INVESTIDOR10_HTML, 'TAEE11').fundamentals.payout).not.toBeNull();
  });

  it('brings the net debt/EBITDA ratio ready-made, with no deriving', () => {
    const { fundamentals, derived } = parseInvestidor10(INVESTIDOR10_HTML, 'TAEE11');
    expect(fundamentals.netDebtToEbitda).toBe(3.48);
    expect(derived).toEqual([]);
  });

  it('converts percentages to fractions and leaves multiples raw', () => {
    const { fundamentals } = parseInvestidor10(INVESTIDOR10_HTML, 'TAEE11');
    expect(fundamentals.dividendYield12m).toBeCloseTo(0.0809, 6);
    expect(fundamentals.roe).toBeCloseTo(0.2014, 6);
    expect(fundamentals.priceEarnings).toBe(7.89);
    expect(fundamentals.priceToBook).toBe(1.59);
  });

  it('reads the quote from the header card', () => {
    expect(parseInvestidor10(INVESTIDOR10_HTML, 'TAEE11').fundamentals.price).toBe(37.33);
  });

  it('a page with no indicator card is ticker-not-found', () => {
    expect(() => parseInvestidor10('<html><body>nada</body></html>', 'XXXX99')).toThrow(
      TickerNotFoundError,
    );
  });

  it('a card present but with no known indicator fails explicitly', () => {
    const html = '<article class="indicator-card"><div class="indicator-card-title">Zzz</div></article>';
    expect(() => parseInvestidor10(html, 'TAEE11')).toThrow(UnexpectedFormatError);
  });

  it('does not confuse P/E with P/B', () => {
    const ind = indInvestidor10(INVESTIDOR10_HTML);
    expect(ind.get('p/l')).toBe(7.89);
    expect(ind.get('p/vp')).toBe(1.59);
  });
});

describe('StatusInvest', () => {
  it('reads the indicators off the sheet', () => {
    const { fundamentals } = parseStatusInvest(STATUSINVEST_HTML, 'TAEE11');
    expect(fundamentals.price).toBe(37.29);
    expect(fundamentals.dividendYield12m).toBeCloseTo(0.0805, 6);
    expect(fundamentals.roe).toBeCloseTo(0.2014, 6);
    expect(fundamentals.priceEarnings).toBe(7.91);
    expect(fundamentals.priceToBook).toBe(1.59);
    expect(fundamentals.netDebtToEbitda).toBe(4.08);
  });

  it('leaves payout null: the site marks it BETA with no firm value', () => {
    expect(parseStatusInvest(STATUSINVEST_HTML, 'TAEE11').fundamentals.payout).toBeNull();
  });

  it('ignores the comparison block filled with dashes', () => {
    // The page repeats P/E several times; the first one with a number is the one that counts.
    expect(indStatusInvest(STATUSINVEST_HTML).get('p/l')).toBe(7.91);
  });

  it('an empty page is ticker-not-found', () => {
    expect(() => parseStatusInvest('<html><body></body></html>', 'XXXX99')).toThrow(
      TickerNotFoundError,
    );
  });

  it('a sheet with no essential indicator fails explicitly', () => {
    const html = '<div class="info"><h3 class="title">Zzz</h3><strong class="value">1,00</strong></div>';
    expect(() => parseStatusInvest(html, 'TAEE11')).toThrow(UnexpectedFormatError);
  });
});

describe('the fundamentals sources disagree on net debt/EBITDA', () => {
  it('each publishes its own number, which is why provenance is shown', () => {
    const i10 = parseInvestidor10(INVESTIDOR10_HTML, 'TAEE11').fundamentals.netDebtToEbitda;
    const si = parseStatusInvest(STATUSINVEST_HTML, 'TAEE11').fundamentals.netDebtToEbitda;

    expect(i10).toBe(3.48);
    expect(si).toBe(4.08);
    expect(i10).not.toBe(si);
  });
});
