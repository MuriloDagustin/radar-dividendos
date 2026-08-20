import { describe, expect, it } from 'vitest';
import {
  CLASSIFICATION_TABLE,
  DEFAULT_CATEGORY,
  KNOWN_HOLDINGS,
  categoryFor,
  classify,
} from '../src/classification';
import type { Category, SectorInfo } from '../src/types';

describe('CLASSIFICATION_TABLE', () => {
  it('checks holdings before anything else, so a holding is not read as a bank', () => {
    expect(CLASSIFICATION_TABLE[0]?.category).toBe('holding');
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
    expect(categoryFor('XXXX3', { sector: 'Energia Elétrica' })).toBeNull();
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
    const result = classify('TAEE11', { sector: 'Energia Elétrica' });
    expect(result.category).toBe('evergreen');
    expect(result.uncertain).toBe(true);
    expect(result.rawSector).toBe('Energia Elétrica');
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
