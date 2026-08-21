import { describe, expect, it } from 'vitest';
import {
  CLASSIFICATION_TABLE,
  COMPANY_UNITS,
  DEFAULT_CATEGORY,
  KNOWN_HOLDINGS,
  categoryFor,
  classify,
  looksLikeFundTicker,
} from '../src/classification';
import type { Category, SectorInfo } from '../src/types';

describe('CLASSIFICATION_TABLE', () => {
  it('checks holdings before financial, so a holding is not read as a bank', () => {
    const order = CLASSIFICATION_TABLE.map((r) => r.category);
    expect(order.indexOf('holding')).toBeLessThan(order.indexOf('financial'));
  });

  it('lists each category exactly once', () => {
    const order = CLASSIFICATION_TABLE.map((r) => r.category);
    expect(new Set(order).size).toBe(order.length);
  });

  it('carries no empty fragment, which would match every sector', () => {
    for (const rule of CLASSIFICATION_TABLE) {
      expect(rule.fragments.length).toBeGreaterThan(0);
      for (const fragment of rule.fragments) expect(fragment.trim()).not.toBe('');
    }
  });

  it('has no fragment shared between two categories', () => {
    const seen = new Map<string, Category>();
    for (const rule of CLASSIFICATION_TABLE) {
      for (const fragment of rule.fragments) {
        expect(seen.get(fragment), `${fragment} duplicado`).toBeUndefined();
        seen.set(fragment, rule.category);
      }
    }
  });

  it('never defaults to anything but evergreen', () => {
    expect(DEFAULT_CATEGORY).toBe('evergreen');
  });
});

describe('categoryFor', () => {
  const cases: [string, SectorInfo, Category][] = [
    ['banco', { sector: 'Financeiro', subsector: 'Bancos' }, 'financial'],
    ['seguradora', { sector: 'Financeiro', subsector: 'Seguros' }, 'financial'],
    ['serviços financeiros', { subsector: 'Serviços Financeiros Diversos' }, 'financial'],
    ['papel e celulose', { sector: 'Materiais Básicos', industry: 'Papel e Celulose' }, 'cyclical'],
    ['mineração', { sector: 'Materiais Básicos', subsector: 'Mineração' }, 'cyclical'],
    ['siderurgia', { subsector: 'Siderurgia e Metalurgia' }, 'cyclical'],
    ['petróleo', { sector: 'Petróleo, Gás e Biocombustíveis' }, 'cyclical'],
    ['química', { subsector: 'Químicos' }, 'cyclical'],
    ['frigorífico', { subsector: 'Carnes e Derivados' }, 'cyclical'],
    ['holding por subsetor', { subsector: 'Holdings Diversificadas' }, 'holding'],
    ['participações', { subsector: 'Participações' }, 'holding'],
  ];

  it.each(cases)('classifies %s', (_name, sector, expected) => {
    expect(categoryFor('XXXX3', sector)).toBe(expected);
  });

  it('returns null when no sector text was published', () => {
    expect(categoryFor('XXXX3', null)).toBeNull();
    expect(categoryFor('XXXX3', {})).toBeNull();
  });

  it('returns null for a sector the table does not cover', () => {
    expect(categoryFor('XXXX3', { sector: 'Setor Inexistente' })).toBeNull();
  });

  it('reads the subsector before the broader sector', () => {
    // Itaúsa's sector says Financeiro, but the subsector is what it actually is.
    expect(
      categoryFor('XXXX3', { sector: 'Financeiro', subsector: 'Holdings Diversificadas' }),
    ).toBe('holding');
  });

  it('a known holding ticker wins over whatever the sector says', () => {
    expect(categoryFor('ITSA4', { sector: 'Financeiro', subsector: 'Bancos' })).toBe('holding');
  });

  it('the known-holding list is uppercase, matching normalized tickers', () => {
    for (const ticker of KNOWN_HOLDINGS) expect(ticker).toBe(ticker.toUpperCase());
  });

  it('matches a known holding regardless of the case typed', () => {
    expect(categoryFor('itsa4', null)).toBe('holding');
  });

  it('ignores accents and punctuation when matching', () => {
    expect(categoryFor('XXXX3', { subsector: 'Petróleo, Gás' })).toBe('cyclical');
    expect(categoryFor('XXXX3', { subsector: 'PETROLEO E GAS' })).toBe('cyclical');
  });
});

describe('classify', () => {
  it('keeps the sector text as published, for auditing', () => {
    const result = classify('KLBN11', {
      sector: 'Materiais Básicos',
      industry: 'Papel e Celulose',
    });
    expect(result.category).toBe('cyclical');
    expect(result.rawSector).toContain('Papel e Celulose');
    expect(result.rawSector).toContain('Materiais Básicos');
    expect(result.uncertain).toBe(false);
  });

  it('falls back to evergreen and flags the failure', () => {
    const result = classify('XXXX3', { sector: 'Setor Inexistente' });
    expect(result.category).toBe('evergreen');
    expect(result.uncertain).toBe(true);
    expect(result.rawSector).toBe('Setor Inexistente');
  });

  it('with no sector at all, still yields a usable default', () => {
    expect(classify('XXXX3', null)).toEqual({
      category: 'evergreen',
      rawSector: null,
      uncertain: true,
    });
  });
});

describe('rawSector wording', () => {
  it('does not repeat a text two sources worded identically', () => {
    const result = classify('KLBN11', {
      sector: 'Materiais Básicos',
      industry: 'Papel e Celulose',
      subsector: 'Papel e Celulose',
    });
    expect(result.rawSector).toBe('Papel e Celulose · Materiais Básicos');
  });

  it('keeps genuinely different texts, most specific first', () => {
    expect(
      classify('XXXX3', { sector: 'Financeiro', subsector: 'Bancos' }).rawSector,
    ).toBe('Bancos · Financeiro');
  });
});

describe('fund detection', () => {
  const FUND_SECTOR = { sector: 'Fundos Imobiliários', industry: 'Logística' };

  it('a ticker ending in 11 with a real-estate sector is a fund', () => {
    expect(categoryFor('MXRF11', FUND_SECTOR)).toBe('fii');
    expect(categoryFor('CPTS11', { sector: 'Fundos Imobiliários', industry: 'Outros' })).toBe('fii');
  });

  it('a kind confirmed by the sources settles it with no sector at all', () => {
    // The scrapers had to use the fund route, which is stronger than any heuristic.
    expect(categoryFor('MXRF11', null, 'fii')).toBe('fii');
    expect(categoryFor('XXXX11', null, 'fii')).toBe('fii');
  });

  it.each([...COMPANY_UNITS])('%s is a company unit, never a fund', (unit) => {
    expect(categoryFor(unit, FUND_SECTOR)).not.toBe('fii');
  });

  it('a unit keeps the category its own sector implies', () => {
    expect(categoryFor('KLBN11', { sector: 'Materiais Básicos' })).toBe('cyclical');
    expect(categoryFor('SANB11', { sector: 'Financeiro', subsector: 'Bancos' })).toBe('financial');
  });

  it('TAEE11 is a unit of an operating company, so it never lands in fii', () => {
    expect(categoryFor('TAEE11', { sector: 'Energia', industry: 'Energia Elétrica' })).not.toBe(
      'fii',
    );
    expect(classify('TAEE11', { sector: 'Energia', industry: 'Energia Elétrica' }).category).toBe(
      'evergreen',
    );
  });

  it('a real-estate sector on a ticker that is not an 11 is not enough', () => {
    expect(categoryFor('XXXX4', FUND_SECTOR)).toBeNull();
    expect(categoryFor('XXXX3', FUND_SECTOR)).toBeNull();
  });

  it('an 11 ticker with no sector is not assumed to be a fund', () => {
    expect(categoryFor('SAPR11', null)).toBeNull();
    expect(classify('SAPR11', null).category).toBe('evergreen');
    expect(classify('SAPR11', null).uncertain).toBe(true);
  });

  it('the unit exception outranks a fund sector even for an unknown unit', () => {
    // A source mislabelling a unit's sector must not flip it into the fund rules.
    expect(categoryFor('ALUP11', FUND_SECTOR)).not.toBe('fii');
  });

  it('a holding that happens to end in 11 stays a holding', () => {
    expect(categoryFor('IGTI11', FUND_SECTOR)).toBe('holding');
  });

  it('looksLikeFundTicker only accepts four letters and 11', () => {
    expect(looksLikeFundTicker('MXRF11')).toBe(true);
    expect(looksLikeFundTicker('mxrf11')).toBe(true);
    expect(looksLikeFundTicker('MXRF3')).toBe(false);
    expect(looksLikeFundTicker('MXRF4')).toBe(false);
    expect(looksLikeFundTicker('MXR11')).toBe(false);
    expect(looksLikeFundTicker('MXRF111')).toBe(false);
  });

  it('every listed unit has the shape the exception is meant to guard', () => {
    for (const unit of COMPANY_UNITS) expect(looksLikeFundTicker(unit)).toBe(true);
  });
});

describe('evergreen is named, not just a fallback', () => {
  it.each([
    ['energia elétrica', { sector: 'Energia', industry: 'Energia Elétrica' }],
    ['saneamento', { subsector: 'Água e Saneamento' }],
    ['telecom', { subsector: 'Telecomunicações' }],
    ['saúde', { sector: 'Saúde' }],
    ['transporte', { subsector: 'Transporte' }],
  ])('recognizes %s without flagging uncertainty', (_name, sector) => {
    const result = classify('XXXX3', sector);
    expect(result.category).toBe('evergreen');
    expect(result.uncertain).toBe(false);
  });

  it('a shopping operator is evergreen, not financial', () => {
    // B3 files shoppings under "Financeiro e Outros / Exploração de Imóveis", but the bank
    // ROE ruler would judge them unfairly.
    expect(
      categoryFor('XXXX3', { sector: 'Financeiro e Outros', subsector: 'Exploração de Imóveis' }),
    ).toBe('evergreen');
  });

  it('a real bank is still financial', () => {
    expect(categoryFor('XXXX4', { sector: 'Financeiro e Outros', subsector: 'Bancos' })).toBe(
      'financial',
    );
  });

  it('still flags a sector nobody listed', () => {
    const result = classify('XXXX3', { sector: 'Setor Que Não Existe' });
    expect(result.category).toBe('evergreen');
    expect(result.uncertain).toBe(true);
  });

  it('evergreen sits last in the table, so it never shadows a specific rule', () => {
    const order = CLASSIFICATION_TABLE.map((r) => r.category);
    expect(order.at(-1)).toBe('evergreen');
    // Same text, two rules: the specific one wins because it comes first.
    expect(categoryFor('XXXX3', { sector: 'Materiais Básicos' })).toBe('cyclical');
  });

  it('the narrowest text that matches decides, not the broadest', () => {
    // Mining inside a sector the table also lists as evergreen: the subsector wins.
    expect(categoryFor('XXXX3', { sector: 'Energia', subsector: 'Mineração' })).toBe('cyclical');
  });
});
