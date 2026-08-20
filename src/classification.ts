import type { Category, Classification, SectorInfo } from './types';

/**
 * Explicit lookup table, ordered by precedence. A company is matched by comparing its
 * sector / industry / subsector text against these fragments — the sources word the same
 * business differently ("Papel e Celulose" vs "Materiais Básicos"), so several fragments
 * per category is the point, not redundancy.
 */
export interface CategoryRule {
  category: Category;
  fragments: string[];
}

/**
 * Holdings are checked before everything else: Itaúsa's sector reads "Financeiro", and
 * judging it as a bank would apply the wrong ROE ruler to what is really a portfolio.
 */
export const CLASSIFICATION_TABLE: readonly CategoryRule[] = [
  {
    category: 'holding',
    fragments: [
      'holdingsdiversificadas',
      'holdingdiversificada',
      'participacoes',
      'holding',
      'conglomerado',
    ],
  },
  {
    category: 'financial',
    fragments: [
      'bancos',
      'banco',
      'seguradoras',
      'seguros',
      'segurosresseguros',
      'servicosfinanceiros',
      'intermediariosfinanceiros',
      'previdencia',
      'financeiroseoutros',
      'financeiro',
      'exploracaodeimoveis',
      'gestaoderecursos',
    ],
  },
  {
    category: 'cyclical',
    fragments: [
      'papelecelulose',
      'madeiraepapel',
      'mineracao',
      'minerais',
      'siderurgia',
      'metalurgia',
      'siderurgiaemetalurgia',
      'petroleo',
      'gas',
      'combustiveis',
      'petroleogasebiocombustiveis',
      'quimica',
      'quimicos',
      'petroquimicos',
      'fertilizantes',
      'agronegocio',
      'agropecuaria',
      'agricultura',
      'frigorificos',
      'carnesederivados',
      'acucarealcool',
      'materiaisbasicos',
      'acoeoutrosmetais',
    ],
  },
];

/** Tickers whose holding nature the sector text does not reveal. */
export const KNOWN_HOLDINGS: ReadonlySet<string> = new Set([
  'ITSA3',
  'ITSA4',
  'BRAP3',
  'BRAP4',
  'SIMH3',
  'BPAN4',
  'MOAR3',
  'CSAB3',
  'CSAB4',
  'IGTI3',
  'IGTI11',
  'PSSA3',
]);

export const DEFAULT_CATEGORY: Category = 'evergreen';

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();
}

/** Ordered so the most specific field wins when the sources disagree. */
function candidateTexts(sector: SectorInfo | null): string[] {
  if (!sector) return [];
  return [sector.subsector, sector.industry, sector.sector].filter(
    (t): t is string => typeof t === 'string' && t.trim() !== '',
  );
}

export function categoryFor(ticker: string, sector: SectorInfo | null): Category | null {
  if (KNOWN_HOLDINGS.has(ticker.toUpperCase())) return 'holding';

  const texts = candidateTexts(sector).map(normalize);
  if (texts.length === 0) return null;

  for (const rule of CLASSIFICATION_TABLE) {
    for (const text of texts) {
      if (rule.fragments.some((fragment) => text.includes(fragment))) return rule.category;
    }
  }

  return null;
}

/**
 * A company nobody could classify falls back to `evergreen` and is flagged uncertain — the
 * distortion detector still runs, so a misclassification does not produce a false diagnosis
 * on its own.
 */
export function classify(ticker: string, sector: SectorInfo | null): Classification {
  const matched = categoryFor(ticker, sector);
  const raw = candidateTexts(sector);

  // Two sources often word the same thing identically; showing it twice reads like noise.
  const distinct = [...new Set(raw)];

  return {
    category: matched ?? DEFAULT_CATEGORY,
    rawSector: distinct.length > 0 ? distinct.join(' · ') : null,
    uncertain: matched === null,
  };
}
