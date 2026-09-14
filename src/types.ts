export const FUNDAMENTAL_FIELDS = [
  'price',
  'dividendYield12m',
  'priceEarnings',
  'priceToBook',
  'roe',
  'roic',
  'netDebt',
  'ebitda',
  'netDebtToEbitda',
  'netDebtToEquity',
  'currentRatio',
  'grossMargin',
  'ebitdaMargin',
  'netMargin',
  'revenueCagr5y',
  'profitCagr5y',
  'low52w',
  'high52w',
  'payout',
  /** FII only: operating result yield, the fund's answer to an earnings yield. */
  'ffoYield',
  /** FII only: distribution over FFO, derived on the sheet that publishes both, never across sources. */
  'payoutFfo',
  'ffoPerShare',
  'distributedIncome',
  'vacancy',
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
  /** Sector medians for the indicators this source compares. */
  peers?: PeerMap;
  /** Fund sheet facts (segment, size, fee, manager) a source published. */
  fund?: Partial<FundProfile>;
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

/**
 * What a fund sheet says about the fund itself, as opposed to its price. These are the
 * inputs of the five-filter screen; none of them is an indicator with a ruler.
 */
export interface FundProfile {
  /** "Logístico / Indústria / Galpões", "Shoppings", "Híbrido"… as the source words it. */
  segment: string | null;
  /** "Fundo de Tijolo", "Fundo de Papel", "Fundo de Fundos". */
  fundType: string | null;
  /** "Renda", "Desenvolvimento", "Híbridos"… */
  mandate: string | null;
  /** Net worth in BRL. */
  netWorth: number | null;
  /** Administration fee as a fraction per year (0.006 = 0,60% a.a.). */
  adminFee: number | null;
  /** The fee as written, kept because minimums and tiers do not fit in one number. */
  adminFeeText: string | null;
  manager: string | null;
  administrator: string | null;
  shareholders: number | null;
  /** The source's own "listed for more than five years" flag, when it publishes one. */
  listedOver5Years: boolean | null;
}

export type CriterionStatus = 'pass' | 'fail' | 'unknown';

export interface Criterion {
  key: string;
  label: string;
  status: CriterionStatus;
  /** The number or text the judgement rests on, formatted for display. */
  value: string | null;
  detail: string;
}

/**
 * The five-filter screen for real estate funds. Filters are eliminatory; tiebreakers only
 * rank funds that passed every filter, which is why `passedAll` gates them.
 */
export interface FundScreen {
  filters: Criterion[];
  tiebreakers: Criterion[];
  passed: number;
  unknown: number;
  passedAll: boolean;
}

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

export interface DividendYear {
  year: number;
  /** Currency per share, as the source published it. */
  amount: number;
}

export interface DividendEvent {
  /** Ex-dividend date, dd/mm/yyyy as published. */
  exDate: string;
  paymentDate: string | null;
  amount: number;
  /** "DIVIDENDO", "JRS CAP PROPRIO", "Rendimento" — taxation differs between them. */
  kind: string;
}

export interface DividendHistory {
  source: Source;
  perYear: DividendYear[];
  events: DividendEvent[];
}

/**
 * What the history says about the income stream itself, which no snapshot can show: a yield
 * paid every year for a decade is a different asset from the same yield paid once.
 */
export interface DividendRecord {
  yearsPaid: number;
  /** Complete years in a row with a payment, counting back from the last complete year. */
  consecutiveYears: number;
  /** Years where the amount fell more than a token amount against the year before. */
  cuts: number;
  /** Coefficient of variation over the complete years — dispersion of the payment. */
  variation: number | null;
  lastFullYear: DividendYear | null;
  /** Change from the year before last to the last complete year, as a fraction. */
  lastChange: number | null;
  /** Payment already declared with a date still ahead. */
  nextPayment: DividendEvent | null;
  /** Share of the last twelve months paid as interest on capital, which is taxed. */
  interestOnCapitalShare: number | null;
}

/** Sector medians a source publishes next to an indicator, for context on the ruler. */
export interface PeerContext {
  sector?: number;
  subsector?: number;
  segment?: number;
}

export type PeerMap = Record<string, PeerContext>;

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

export type ValueFormat = 'percent' | 'multiple' | 'currency' | 'count';

/**
 * `core` carries the verdict and gets a ruler; `context` is the supporting panel, shown
 * compactly. Splitting them is what keeps the card readable as indicators pile up.
 */
export type IndicatorGroup = 'core' | 'context';

export interface Indicator {
  key: string;
  label: string;
  group: IndicatorGroup;
  value: number | null;
  format: ValueFormat;
  /** Sector median for this indicator, when a source published one. */
  peers?: PeerContext;
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
  dividends: DividendRecord | null;
  dividendHistory: DividendHistory | null;
  /** Fund sheet facts, merged across sources. Null for a company. */
  fund: FundProfile | null;
  /** The five-filter screen. Null for a company. */
  fundScreen: FundScreen | null;
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

/** Built from the field list so a new field cannot be forgotten in one of the two places. */
export function emptyFundamentals(): Fundamentals {
  return Object.fromEntries(FUNDAMENTAL_FIELDS.map((f) => [f, null])) as Fundamentals;
}

export function emptyProvenance(): ProvenanceMap {
  return Object.fromEntries(FUNDAMENTAL_FIELDS.map((f) => [f, null])) as ProvenanceMap;
}

export function emptyFundProfile(): FundProfile {
  return {
    segment: null,
    fundType: null,
    mandate: null,
    netWorth: null,
    adminFee: null,
    adminFeeText: null,
    manager: null,
    administrator: null,
    shareholders: null,
    listedOver5Years: null,
  };
}
