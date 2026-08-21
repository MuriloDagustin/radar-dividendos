export const FUNDAMENTAL_FIELDS = [
  'price',
  'dividendYield12m',
  'priceEarnings',
  'priceToBook',
  'roe',
  'netDebt',
  'ebitda',
  'netDebtToEbitda',
  'payout',
] as const;

export type FundamentalField = (typeof FUNDAMENTAL_FIELDS)[number];

/** Percentages are always fractions: 0.085 = 8.5%. Money is in BRL. */
export type Fundamentals = Record<FundamentalField, number | null>;

export type Source = 'brapi' | 'investidor10' | 'statusinvest' | 'fundamentus';

export const SOURCE_NAME: Record<Source, string> = {
  brapi: 'brapi.dev',
  investidor10: 'Investidor10',
  statusinvest: 'StatusInvest',
  fundamentus: 'Fundamentus',
};

/** `derived` marks a value obtained by algebra over two figures the source published. */
export type Provenance = { source: Source; derived?: true } | null;

export type ProvenanceMap = Record<FundamentalField, Provenance>;

export type AssetKind = 'stock' | 'fii';

export const ASSET_KIND_NAME: Record<AssetKind, string> = {
  stock: 'ação',
  fii: 'FII',
};

export interface SourceReading {
  source: Source;
  /** Sector text this source published, for the classification lookup. */
  sector?: SectorInfo;
  /** What the source recognized the paper to be. Absent when it cannot tell. */
  kind?: AssetKind;
  fundamentals: Fundamentals;
  /** Fields the source flagged as derived rather than read directly. */
  derived: FundamentalField[];
  /** Caveat for a reading that succeeded but delivered less than asked. */
  note?: string;
}

/**
 * `na`: the indicator has no meaning for this kind of company (a bank's net debt/EBITDA).
 * `unrel`: the number exists but is distorted, so reading it would mislead.
 * Neither ever counts toward the verdict.
 */
export type Signal = 'ok' | 'warn' | 'bad' | 'na' | 'unrel';

/** Signals that carry a usable reading; the others are excluded from every count. */
export const CONCLUSIVE_SIGNALS = ['ok', 'warn', 'bad'] as const;

/**
 * `indeterminate`: the sources did not have the numbers.
 * `inconclusive`: the numbers are there but too many are inapplicable or distorted.
 */
export type Verdict = 'solid' | 'attention' | 'fragile' | 'indeterminate' | 'inconclusive';

export type Category = 'financial' | 'cyclical' | 'holding' | 'fii' | 'evergreen';

export const CATEGORY_NAME: Record<Category, string> = {
  financial: 'financeiro',
  cyclical: 'cíclica',
  holding: 'holding',
  fii: 'FII',
  evergreen: 'perene',
};

export interface SectorInfo {
  sector?: string;
  industry?: string;
  subsector?: string;
}

export interface Classification {
  category: Category;
  /** The sector text as the source worded it, kept for auditing the classification. */
  rawSector: string | null;
  uncertain: boolean;
}

/** Where leverage is heading over the last periods, when a history could be read. */
export type LeverageTrend = 'falling' | 'rising' | 'flat' | 'unknown';

export interface Assessment {
  signal: Signal;
  message: string;
}

export interface Band {
  /** Lower bound, always inclusive. `null` means unbounded. */
  from: number | null;
  /** Upper bound, exclusive unless `toInclusive`. `null` means unbounded. */
  to: number | null;
  toInclusive?: true;
  signal: Signal;
  /** Short band name, used on the interface ruler. */
  label: string;
  message: string;
}

export type ValueFormat = 'percent' | 'multiple' | 'currency';

export interface Indicator {
  key: string;
  label: string;
  value: number | null;
  format: ValueFormat;
  /** `null` on an informational indicator: no bands, no weight on the verdict. */
  bands: readonly Band[] | null;
  signal: Signal | null;
  message: string;
}

export interface Diagnosis {
  indicators: Indicator[];
  counts: Record<Signal, number>;
  verdict: Verdict;
  /**
   * `applicable` excludes `na`; `present` counts only conclusive readings, so a distorted
   * number raises neither. The two tallies are kept apart on purpose: `notApplicable` is
   * structural and expected (a FII has no ROE), while `unreliable` means a number that
   * should have been readable was not — only the latter can make a verdict inconclusive.
   */
  coverage: {
    applicable: number;
    present: number;
    notApplicable: number;
    unreliable: number;
    minimumForVerdict: number;
  };
}

export interface Interpretation {
  summary: string;
  watchPoints: string[];
  model: string;
}

export interface SourceStatus {
  source: Source;
  status: 'ok' | 'failed';
  detail?: string;
}

export interface Analysis {
  ticker: string;
  kind: AssetKind;
  classification: Classification;
  /** Structural remarks about the company that are not tied to one indicator. */
  notes: string[];
  generatedAt: string;
  fundamentals: Fundamentals;
  provenance: ProvenanceMap;
  sources: SourceStatus[];
  diagnosis: Diagnosis;
  interpretation: Interpretation | null;
  fromCache: boolean;
  disclaimer: string;
}

export const DISCLAIMER =
  'Ferramenta educacional — confira os dados na fonte. Não é recomendação de investimento.';

export function emptyFundamentals(): Fundamentals {
  return {
    price: null,
    dividendYield12m: null,
    priceEarnings: null,
    priceToBook: null,
    roe: null,
    netDebt: null,
    ebitda: null,
    netDebtToEbitda: null,
    payout: null,
  };
}
