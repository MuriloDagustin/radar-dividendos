import { z } from 'zod';
import { SourceUnavailableError, TickerNotFoundError, UnexpectedFormatError } from '../errors';
import { finiteNumber } from '../numbers';
import { emptyFundamentals, type FundamentalField, type SourceReading } from '../types';

const URL_BASE = 'https://brapi.dev/api/quote';
const SOURCE = 'brapi.dev';
const TIMEOUT_MS = 15_000;
const MODULES = 'defaultKeyStatistics,financialData';

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
});

const ResponseSchema = z.looseObject({
  results: z.array(ResultSchema).nullish(),
  error: z.unknown().optional(),
  message: z.string().optional(),
  code: z.string().optional(),
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
  ticker: string,
  token: string | undefined,
  withModules: boolean,
): Promise<RawResponse> {
  const url = new URL(`${URL_BASE}/${encodeURIComponent(ticker)}`);
  if (withModules) url.searchParams.set('modules', MODULES);
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
  'plano Gratuito: a brapi entregou só o preço — os módulos de fundamentos são do plano Pro';

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
  let response = await request(ticker, token, true);
  let note: string | undefined;

  // The fundamentals modules belong to the Pro plan. Rather than lose the source entirely,
  // retry without them: brapi's intraday price is still fresher than the others'.
  if (response.status === 403 && errorBody(response.body).code === 'MODULES_NOT_AVAILABLE') {
    response = await request(ticker, token, false);
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

  // brapi does not tell stocks from funds apart, so it has no opinion on the asset kind.
  return { source: 'brapi', fundamentals, derived, ...(note ? { note } : {}) };
}
