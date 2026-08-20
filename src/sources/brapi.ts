import { z } from 'zod';
import { SourceUnavailableError, TickerNotFoundError, UnexpectedFormatError } from '../errors';
import { finiteNumber } from '../numbers';
import {
  emptyFundamentals,
  type FundamentalField,
  type SectorInfo,
  type SourceReading,
} from '../types';

const URL_BASE = 'https://brapi.dev/api/quote';
const SOURCE = 'brapi.dev';
const TIMEOUT_MS = 15_000;
/** `summaryProfile` is the only one the Free plan serves; the others need Pro. */
const MODULES = ['summaryProfile', 'defaultKeyStatistics', 'financialData'] as const;

/** brapi returns some multiples as strings; accept either and convert. */
const flexibleNumber = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (typeof v === 'number') return finiteNumber(v);
    if (typeof v === 'string') {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  });

const SummaryProfileSchema = z
  .looseObject({
    sector: z.string().nullish(),
    industry: z.string().nullish(),
    sectorDisp: z.string().nullish(),
    industryDisp: z.string().nullish(),
  })
  .partial();

const KeyStatsSchema = z
  .looseObject({
    priceToBook: flexibleNumber,
    payoutRatio: flexibleNumber,
    enterpriseValue: flexibleNumber,
    forwardPE: flexibleNumber,
  })
  .partial();

const FinancialDataSchema = z
  .looseObject({
    returnOnEquity: flexibleNumber,
    ebitda: flexibleNumber,
    totalDebt: flexibleNumber,
    totalCash: flexibleNumber,
  })
  .partial();

const ResultSchema = z.looseObject({
  symbol: z.string(),
  regularMarketPrice: flexibleNumber,
  priceEarnings: flexibleNumber,
  dividendYield: flexibleNumber,
  defaultKeyStatistics: KeyStatsSchema.nullish(),
  financialData: FinancialDataSchema.nullish(),
  summaryProfile: SummaryProfileSchema.nullish(),
  regularMarketVolume: flexibleNumber,
});

const ResponseSchema = z.looseObject({
  results: z.array(ResultSchema).nullish(),
  error: z.unknown().optional(),
  message: z.string().optional(),
  code: z.string().optional(),
});

const DeniedModulesSchema = z.looseObject({
  details: z.looseObject({ deniedModules: z.array(z.string()).nullish() }).nullish(),
});

/**
 * brapi publishes dividendYield in percentage points and returnOnEquity/payoutRatio as
 * fractions. If either convention flips, the guards below blow up and the parser fails
 * instead of returning a number that is off by 100x.
 */
function dyAsFraction(raw: number | null): number | null {
  if (raw === null) return null;
  if (raw < 0 || raw > 100) {
    throw new UnexpectedFormatError(
      SOURCE,
      `dividendYield=${raw} fora da faixa de pontos percentuais esperada (0–100)`,
    );
  }
  return raw / 100;
}

function alreadyAFraction(field: string, raw: number | null): number | null {
  if (raw === null) return null;
  if (Math.abs(raw) > 10) {
    throw new UnexpectedFormatError(
      SOURCE,
      `${field}=${raw} não parece uma fração (esperado |v| <= 10)`,
    );
  }
  return raw;
}

interface RawResponse {
  status: number;
  body: string;
}

async function request(
  tickers: string,
  token: string | undefined,
  modules: readonly string[],
): Promise<RawResponse> {
  const url = new URL(`${URL_BASE}/${encodeURIComponent(tickers)}`);
  if (modules.length > 0) url.searchParams.set('modules', modules.join(','));
  url.searchParams.set('fundamental', 'true');
  if (token) url.searchParams.set('token', token);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: response.status, body: await response.text() };
  } catch (cause) {
    throw new SourceUnavailableError(
      SOURCE,
      cause instanceof Error ? cause.message : 'falha de rede',
    );
  }
}

function errorBody(body: string): { code?: string; message?: string } {
  try {
    const json: unknown = JSON.parse(body);
    if (typeof json !== 'object' || json === null) return {};
    const { code, message } = json as { code?: unknown; message?: unknown };
    return {
      ...(typeof code === 'string' ? { code } : {}),
      ...(typeof message === 'string' ? { message } : {}),
    };
  } catch {
    return {};
  }
}

export const FREE_PLAN_NOTE =
  'plano Gratuito: a brapi entregou preço e setor — os módulos de fundamentos são do plano Pro';

/** Which modules the plan refused, so the retry keeps the ones it does allow. */
function deniedModules(body: string): string[] {
  try {
    const parsed = DeniedModulesSchema.safeParse(JSON.parse(body));
    return parsed.success ? (parsed.data.details?.deniedModules ?? []) : [];
  } catch {
    return [];
  }
}

export function sectorFrom(profile: {
  sector?: string | null | undefined;
  industry?: string | null | undefined;
  sectorDisp?: string | null | undefined;
  industryDisp?: string | null | undefined;
}): SectorInfo | null {
  const sector = profile.sectorDisp ?? profile.sector ?? undefined;
  const industry = profile.industryDisp ?? profile.industry ?? undefined;
  if (!sector && !industry) return null;
  return { ...(sector ? { sector } : {}), ...(industry ? { industry } : {}) };
}

function explainFailure(status: number, body: string, ticker: string): never {
  const { code, message } = errorBody(body);

  if (status === 404 || code === 'NOT_FOUND') throw new TickerNotFoundError(ticker, SOURCE);

  if (code === 'MISSING_TOKEN') {
    throw new SourceUnavailableError(
      SOURCE,
      'sem token. Defina BRAPI_TOKEN (https://brapi.dev/dashboard).',
    );
  }
  if (code === 'INVALID_TOKEN') {
    throw new SourceUnavailableError(
      SOURCE,
      'BRAPI_TOKEN inválido ou revogado — confira em https://brapi.dev/dashboard.',
    );
  }
  throw new SourceUnavailableError(
    SOURCE,
    `HTTP ${status}${message ? ` — ${message}` : ` ${body.slice(0, 160)}`}`,
  );
}

export async function fetchBrapi(ticker: string, token?: string): Promise<SourceReading> {
  let response = await request(ticker, token, MODULES);
  let note: string | undefined;

  // The fundamentals modules belong to the Pro plan. Rather than lose the source entirely,
  // retry with only the modules the plan allows — dropping them all would also lose the
  // sector, which is what the classification depends on.
  if (response.status === 403 && errorBody(response.body).code === 'MODULES_NOT_AVAILABLE') {
    const denied = new Set(deniedModules(response.body));
    const allowed = MODULES.filter((m) => !denied.has(m));
    response = await request(ticker, token, allowed);
    note = FREE_PLAN_NOTE;
  }

  if (response.status !== 200) explainFailure(response.status, response.body, ticker);

  let json: unknown;
  try {
    json = JSON.parse(response.body);
  } catch {
    throw new UnexpectedFormatError(SOURCE, 'resposta não é JSON válido');
  }

  const parsed = ResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new UnexpectedFormatError(SOURCE, parsed.error.issues[0]?.message ?? 'schema divergente');
  }

  const result = parsed.data.results?.[0];
  if (!result) throw new TickerNotFoundError(ticker, SOURCE);

  const stats = result.defaultKeyStatistics ?? {};
  const financials = result.financialData ?? {};

  const fundamentals = emptyFundamentals();
  fundamentals.price = result.regularMarketPrice ?? null;
  fundamentals.dividendYield12m = dyAsFraction(result.dividendYield ?? null);
  fundamentals.priceEarnings = result.priceEarnings ?? null;
  fundamentals.priceToBook = stats.priceToBook ?? null;
  fundamentals.roe = alreadyAFraction('returnOnEquity', financials.returnOnEquity ?? null);
  fundamentals.payout = alreadyAFraction('payoutRatio', stats.payoutRatio ?? null);
  fundamentals.ebitda = financials.ebitda ?? null;

  const derived: FundamentalField[] = [];

  // Net debt = gross debt - cash. brapi does not publish the field ready-made.
  const grossDebt = financials.totalDebt ?? null;
  const cash = financials.totalCash ?? null;
  if (grossDebt !== null && cash !== null) {
    fundamentals.netDebt = grossDebt - cash;
    derived.push('netDebt');
  }

  const sector = result.summaryProfile ? sectorFrom(result.summaryProfile) : null;

  // brapi does not tell stocks from funds apart, so it has no opinion on the asset kind.
  return {
    source: 'brapi',
    fundamentals,
    derived,
    ...(sector ? { sector } : {}),
    ...(note ? { note } : {}),
  };
}

const HISTORY_MODULES = ['balanceSheetHistory', 'incomeStatementHistory'] as const;

const HistoryEntrySchema = z.looseObject({
  endDate: z.string().nullish(),
  totalDebt: flexibleNumber,
  cash: flexibleNumber,
  shortLongTermDebt: flexibleNumber,
  longTermDebt: flexibleNumber,
  ebitda: flexibleNumber,
  ebit: flexibleNumber,
});

const HistoryResultSchema = z.looseObject({
  balanceSheetHistory: z.looseObject({ balanceSheetStatements: z.array(HistoryEntrySchema).nullish() }).nullish(),
  incomeStatementHistory: z.looseObject({ incomeStatementHistory: z.array(HistoryEntrySchema).nullish() }).nullish(),
});

const HistoryResponseSchema = z.looseObject({
  results: z.array(HistoryResultSchema).nullish(),
});

const HISTORY_PERIODS = 4;

/**
 * Leverage series, oldest to newest, for reading the trend. These modules sit behind a paid
 * brapi plan, so every failure returns null and the caller simply goes without a trend —
 * this must never break the main analysis.
 */
export async function fetchLeverageHistory(
  ticker: string,
  token?: string,
): Promise<number[] | null> {
  let response: RawResponse;
  try {
    response = await request(ticker, token, HISTORY_MODULES);
  } catch {
    return null;
  }
  if (response.status !== 200) return null;

  let parsed;
  try {
    parsed = HistoryResponseSchema.safeParse(JSON.parse(response.body));
  } catch {
    return null;
  }
  if (!parsed.success) return null;

  const result = parsed.data.results?.[0];
  const balance = result?.balanceSheetHistory?.balanceSheetStatements ?? [];
  const income = result?.incomeStatementHistory?.incomeStatementHistory ?? [];
  if (balance.length === 0 || income.length === 0) return null;

  // brapi returns newest first; the trend reads oldest to newest.
  const periods = Math.min(balance.length, income.length, HISTORY_PERIODS);
  const series: number[] = [];

  for (let i = periods - 1; i >= 0; i -= 1) {
    const sheet = balance[i];
    const statement = income[i];
    if (!sheet || !statement) continue;

    const gross =
      sheet.totalDebt ??
      ((sheet.shortLongTermDebt ?? 0) + (sheet.longTermDebt ?? 0) || null);
    const ebitda = statement.ebitda ?? null;
    if (gross === null || ebitda === null || ebitda <= 0) continue;

    series.push((gross - (sheet.cash ?? 0)) / ebitda);
  }

  return series.length >= 3 ? series : null;
}

export interface ClassLiquidity {
  ticker: string;
  volume: number;
}

/** The share classes an issuer may list under the same four-letter root. */
export function siblingClasses(ticker: string): string[] {
  const match = /^([A-Z]{4})(\d{1,2})$/.exec(ticker.toUpperCase());
  if (!match) return [];
  const [, root, suffix] = match;
  if (!root || !suffix) return [];
  return ['3', '4', '11'].map((s) => `${root}${s}`).filter((t) => t !== ticker.toUpperCase());
}

function volumesFrom(body: string): ClassLiquidity[] {
  let parsed;
  try {
    parsed = ResponseSchema.safeParse(JSON.parse(body));
  } catch {
    return [];
  }
  if (!parsed.success) return [];

  return (parsed.data.results ?? [])
    .map((r) => ({ ticker: r.symbol, volume: r.regularMarketVolume ?? 0 }))
    .filter((c) => c.volume > 0);
}

/**
 * Average daily volume for the sibling classes. Tries one combined call first; the Free
 * plan caps a request at a single asset, so it falls back to one call per class. Any
 * failure yields an empty list — the note is a nicety, never a reason to fail.
 */
export async function fetchSiblingLiquidity(
  ticker: string,
  token?: string,
): Promise<ClassLiquidity[]> {
  const siblings = siblingClasses(ticker);
  if (siblings.length === 0) return [];

  const all = [ticker.toUpperCase(), ...siblings];

  try {
    const combined = await request(all.join(','), token, []);
    if (combined.status === 200) {
      const volumes = volumesFrom(combined.body);
      if (volumes.length > 0) return volumes;
    }
  } catch {
    // Falls through to the per-ticker path below.
  }

  const settled = await Promise.allSettled(all.map((t) => request(t, token, [])));
  return settled.flatMap((outcome) =>
    outcome.status === 'fulfilled' && outcome.value.status === 200
      ? volumesFrom(outcome.value.body)
      : [],
  );
}
