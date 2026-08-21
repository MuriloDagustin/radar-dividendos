import type { AssetKind, Category, Classification, SectorInfo } from './types';

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
    category: 'fii',
    fragments: [
      'fundosimobiliarios',
      'fundoimobiliario',
      'fundodeinvestimentoimobiliario',
      'fiis',
    ],
  },
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
      'gestaoderecursos',
      'bolsadevalores',
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
  /**
   * Listed last and matched only after the others miss. Naming these explicitly is what
   * keeps the "sector not recognized" warning meaningful: without them every utility and
   * telecom would be flagged uncertain, and the flag would stop meaning anything.
   */
  {
    category: 'evergreen',
    fragments: [
      'energiaeletrica',
      'energia',
      'utilidadepublica',
      'aguaesaneamento',
      'saneamento',
      'agua',
      'telecomunicacoes',
      'telefonia',
      'exploracaodeimoveis',
      'shoppingcenters',
      'shoppings',
      'saude',
      'medicamentos',
      'comercio',
      'consumociclico',
      'consumonaociclico',
      'alimentos',
      'bebidas',
      'transporte',
      'educacao',
      'seguridade',
      'tecnologiadainformacao',
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

/**
 * Company units also end in 11, so the suffix alone cannot mean "fund". These are the ones
 * that would otherwise be misread — a unit is a bundle of ordinary and preferred shares of
 * an operating company, never a real estate fund.
 */
export const COMPANY_UNITS: ReadonlySet<string> = new Set([
  'TAEE11',
  'KLBN11',
  'SAPR11',
  'SANB11',
  'BPAC11',
  'ALUP11',
  'ENGI11',
  'IGTI11',
  'SULA11',
  'RNEW11',
  'TIET11',
  'PPLA11',
  'MODL11',
  'BIDI11',
  'AZUL11',
  'ENGI11',
]);

export const DEFAULT_CATEGORY: Category = 'evergreen';

/** Only a paper ending in 11 can be a fund; every FII on the B3 is quoted that way. */
export function looksLikeFundTicker(ticker: string): boolean {
  return /^[A-Z]{4}11$/.test(ticker.toUpperCase());
}

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

/**
 * `kind` is the strongest signal available: it comes from which route the scrapers had to
 * use, so the site itself said whether the paper is a fund. The ticker-plus-sector heuristic
 * below only runs when no source could tell.
 */
export function categoryFor(
  ticker: string,
  sector: SectorInfo | null,
  kind?: AssetKind,
): Category | null {
  const upper = ticker.toUpperCase();

  if (KNOWN_HOLDINGS.has(upper)) return 'holding';
  if (kind === 'fii') return 'fii';

  const texts = candidateTexts(sector).map(normalize);
  if (texts.length === 0) return null;

  // Specificity outranks the rule order: a shopping operator files under "Financeiro e
  // Outros / Exploração de Imóveis", and matching the broad sector first would hand it the
  // bank ROE ruler. So the narrowest text that matches anything decides.
  for (const text of texts) {
    for (const rule of CLASSIFICATION_TABLE) {
      // A fund needs the ticker shape too, and a company unit is never one.
      if (rule.category === 'fii' && (!looksLikeFundTicker(upper) || COMPANY_UNITS.has(upper))) {
        continue;
      }
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
export function classify(
  ticker: string,
  sector: SectorInfo | null,
  kind?: AssetKind,
): Classification {
  const matched = categoryFor(ticker, sector, kind);
  const raw = candidateTexts(sector);

  // Two sources often word the same thing identically; showing it twice reads like noise.
  const distinct = [...new Set(raw)];

  return {
    category: matched ?? DEFAULT_CATEGORY,
    rawSector: distinct.length > 0 ? distinct.join(' · ') : null,
    uncertain: matched === null,
  };
}
