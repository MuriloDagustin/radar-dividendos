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
  /** What the source recognized the paper to be. Absent when it cannot tell. */
  kind?: AssetKind;
  fundamentals: Fundamentals;
  /** Fields the source flagged as derived rather than read directly. */
  derived: FundamentalField[];
  /** Caveat for a reading that succeeded but delivered less than asked. */
  note?: string;
}

export type Signal = 'ok' | 'warn' | 'bad';

/** `indeterminate`: too few indicators to claim anything — not the same as "fine". */
export type Verdict = 'solid' | 'attention' | 'fragile' | 'indeterminate';

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
  /** `false` when the indicator is meaningless for the asset kind (a FII's ROE). */
  applicable: boolean;
  signal: Signal | null;
  message: string;
}

export interface Diagnosis {
  indicators: Indicator[];
  counts: Record<Signal, number>;
  verdict: Verdict;
  /** How many banded indicators apply to this kind, and how many came filled in. */
  coverage: { applicable: number; present: number; minimumForVerdict: number };
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
