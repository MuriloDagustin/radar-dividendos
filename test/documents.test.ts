import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  documentsUrl,
  parseDocumentos,
  primaryDocument,
} from '../src/sources/documentos';
import type { FilingIndex } from '../src/types';

const here = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  return new TextDecoder('iso-8859-1').decode(readFileSync(join(here, 'fixtures', name)));
}

const KLBN3_URL = documentsUrl('KLBN3', 'stock');
const HGLG11_URL = documentsUrl('HGLG11', 'fii');

describe('documentsUrl', () => {
  it('points a company at the quarterly results page and a fund at the management reports', () => {
    expect(KLBN3_URL).toBe('https://www.fundamentus.com.br/resultados_trimestrais.php?papel=KLBN3&tipo=1');
    expect(HGLG11_URL).toBe('https://www.fundamentus.com.br/fii_relatorios.php?papel=HGLG11');
  });
});

describe('parseDocumentos on the real KLBN3 page', () => {
  const index = parseDocumentos(loadFixture('documentos-klbn3.html'), KLBN3_URL);

  it('reads the latest quarter with both documents', () => {
    expect(index).not.toBeNull();
    expect(index?.source).toBe('fundamentus');
    expect(index?.indexUrl).toBe(KLBN3_URL);
    expect(index?.latest.period).toBe('30/06/2026');
  });

  it('the release is the CVM press-release protocol, the statements the CVM viewer page', () => {
    // Same protocol number the CVM open-data portal lists for "Release de Resultados 2T26".
    expect(index?.latest.reportUrl).toContain('numProtocolo=1552243');
    expect(index?.latest.reportUrl).toContain('rad.cvm.gov.br');
    expect(index?.latest.statementsUrl).toContain('NumeroSequencialDocumento=160160');
  });
});

describe('parseDocumentos on the real HGLG11 page', () => {
  const index = parseDocumentos(loadFixture('documentos-hglg11.html'), HGLG11_URL);

  it('reads the latest month with the FNET report and no statements', () => {
    expect(index?.latest.period).toBe('08/2026');
    expect(index?.latest.reportUrl).toContain('fnet.bmfbovespa.com.br');
    expect(index?.latest.statementsUrl).toBeNull();
  });
});

describe('parseDocumentos on synthetic tables', () => {
  const table = (rows: string) => `<table><thead><tr>
      <th>Data Referência</th><th>Demonstração Financeira</th><th>Release de Resultados</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  const row = (period: string, statements: string | null, release: string | null) =>
    `<tr><td>${period}</td><td>${statements ? `<a href="${statements}">Exibir</a>` : ''}</td><td>${
      release ? `<a href="${release}">Download</a>` : ''
    }</td></tr>`;

  it('picks the most recent period even when the rows are out of order', () => {
    const html = table(
      row('31/03/2026', 'https://x/1', 'https://x/r1') +
        row('31/12/2026', 'https://x/4', 'https://x/r4') +
        row('30/09/2026', 'https://x/3', 'https://x/r3'),
    );
    expect(parseDocumentos(html, 'idx')?.latest.period).toBe('31/12/2026');
  });

  it('skips a row with a period but no document at all', () => {
    const html = table(row('30/09/2026', null, null) + row('30/06/2026', 'https://x/2', null));
    const index = parseDocumentos(html, 'idx');
    expect(index?.latest.period).toBe('30/06/2026');
    expect(index?.latest.reportUrl).toBeNull();
    expect(index?.latest.statementsUrl).toBe('https://x/2');
  });

  it('returns null when the table has no usable row', () => {
    expect(parseDocumentos(table(row('sem data', 'https://x/1', null)), 'idx')).toBeNull();
    expect(parseDocumentos(table(''), 'idx')).toBeNull();
  });

  it('returns null for a page without the documents table', () => {
    expect(parseDocumentos(loadFixture('fundamentus-inexistente.html'), 'idx')).toBeNull();
    expect(parseDocumentos(loadFixture('fundamentus-taee11.html'), 'idx')).toBeNull();
  });
});

describe('primaryDocument', () => {
  const company = (period: string, reportUrl: string | null, statementsUrl: string | null): FilingIndex => ({
    source: 'fundamentus',
    indexUrl: 'https://idx',
    latest: { period, reportUrl, statementsUrl },
  });

  it('names the release by the quarter the releases themselves use', () => {
    expect(primaryDocument(company('30/06/2026', 'https://r', 'https://s'), 'stock')).toEqual({
      label: 'release de resultados do 2T26',
      url: 'https://r',
    });
    expect(primaryDocument(company('31/12/2025', 'https://r', null), 'stock').label).toBe(
      'release de resultados do 4T25',
    );
  });

  it('falls back to the statements, then to the index page', () => {
    expect(primaryDocument(company('31/03/2026', null, 'https://s'), 'stock')).toEqual({
      label: 'demonstrações financeiras do 1T26',
      url: 'https://s',
    });
    expect(primaryDocument(company('31/03/2026', null, null), 'stock')).toEqual({
      label: 'documentos de resultado',
      url: 'https://idx',
    });
  });

  it('keeps the raw period when it is not a quarter end', () => {
    expect(primaryDocument(company('31/05/2026', 'https://r', null), 'stock').label).toBe(
      'release de resultados de 31/05/2026',
    );
  });

  it('calls the fund document a management report for its month', () => {
    expect(primaryDocument(company('08/2026', 'https://f', null), 'fii')).toEqual({
      label: 'relatório gerencial de 08/2026',
      url: 'https://f',
    });
    expect(primaryDocument(company('08/2026', null, null), 'fii').url).toBe('https://idx');
  });
});
