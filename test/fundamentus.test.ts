import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { UnexpectedFormatError, TickerNotFoundError } from '../src/errors';
import { extractCells, parseFundamentus } from '../src/sources/fundamentus';

const here = dirname(fileURLToPath(import.meta.url));

function loadFixture(nome: string): string {
  return new TextDecoder('iso-8859-1').decode(readFileSync(join(here, 'fixtures', nome)));
}

const TAEE11_HTML = loadFixture('fundamentus-taee11.html');
const UNKNOWN_HTML = loadFixture('fundamentus-inexistente.html');

describe('extractCells', () => {
  it('decodes latin-1 accents in the labels', () => {
    const celulas = extractCells(TAEE11_HTML);
    expect(celulas.get('Cotação')).toBe('37,17');
    expect(celulas.get('Dív. Líquida')).toBe('10.413.700.000');
  });

  it('keeps the first occurrence of a duplicated label (the 12-month column)', () => {
    const celulas = extractCells(TAEE11_HTML);
    expect(celulas.get('Receita Líquida')).toBe('4.484.400.000');
    expect(celulas.get('EBIT')).toBe('2.438.660.000');
  });

  it('extracts nothing from the unknown-paper page', () => {
    expect(extractCells(UNKNOWN_HTML).size).toBe(0);
  });
});

describe('parseFundamentus', () => {
  it('reads the fundamentals off the real sheet', () => {
    const leitura = parseFundamentus(TAEE11_HTML, 'TAEE11');
    expect(leitura.source).toBe('fundamentus');
    expect(leitura.fundamentals.price).toBe(37.17);
    expect(leitura.fundamentals.priceEarnings).toBe(7.88);
    expect(leitura.fundamentals.priceToBook).toBe(1.59);
    expect(leitura.fundamentals.netDebt).toBe(10_413_700_000);
  });

  it('converts a pt-BR percentage into a fraction', () => {
    const { fundamentals } = parseFundamentus(TAEE11_HTML, 'TAEE11');
    expect(fundamentals.dividendYield12m).toBeCloseTo(0.081, 10);
    expect(fundamentals.roe).toBeCloseTo(0.201, 10);
  });

  it('reads the two-month average daily volume in BRL', () => {
    expect(parseFundamentus(TAEE11_HTML, 'TAEE11').fundamentals.avgDailyLiquidity).toBe(77_893_500);
  });

  it('leaves payout null because the sheet does not publish it', () => {
    expect(parseFundamentus(TAEE11_HTML, 'TAEE11').fundamentals.payout).toBeNull();
  });

  it('derives EBITDA from enterprise value / (EV / EBITDA) and marks it derived', () => {
    const leitura = parseFundamentus(TAEE11_HTML, 'TAEE11');
    expect(leitura.fundamentals.ebitda).toBeCloseTo(23_218_800_000 / 9.2, 2);
    expect(leitura.derived).toEqual(['ebitda']);
  });

  it('accepts a lowercase ticker in the query', () => {
    expect(() => parseFundamentus(TAEE11_HTML, 'taee11')).not.toThrow();
  });

  it('fails as ticker-not-found when the page has no data cell', () => {
    expect(() => parseFundamentus(UNKNOWN_HTML, 'XXXX99')).toThrow(TickerNotFoundError);
  });

  it('fails explicitly when an expected label vanishes from the HTML', () => {
    const mutilado = TAEE11_HTML.replaceAll('>P/VP<', '>Preco sobre VP<');
    expect(() => parseFundamentus(mutilado, 'TAEE11')).toThrow(UnexpectedFormatError);
    expect(() => parseFundamentus(mutilado, 'TAEE11')).toThrow(/rótulos ausentes.*P\/VP/);
  });

  it('fails when the page answers with a different paper', () => {
    const trocado = TAEE11_HTML.replace(
      '<td class="data w35"><span class="txt">TAEE11</span></td>',
      '<td class="data w35"><span class="txt">ITSA4</span></td>',
    );
    expect(() => parseFundamentus(trocado, 'TAEE11')).toThrow(UnexpectedFormatError);
    expect(() => parseFundamentus(trocado, 'TAEE11')).toThrow(/respondeu com o papel "ITSA4"/);
  });

  it('invents no EBITDA when both inputs disappear', () => {
    const semEv = TAEE11_HTML.replaceAll('>EV / EBITDA<', '>EV sobre EBITDA<');
    const leitura = parseFundamentus(semEv, 'TAEE11');
    expect(leitura.fundamentals.ebitda).toBeNull();
    expect(leitura.derived).toEqual([]);
  });
});
