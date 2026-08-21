import { z } from 'zod';

/**
 * Series 4389 is the CDI annualized on a 252-business-day basis — the number the Brazilian
 * market means when it says "o CDI". It is a forward-looking annual rate, not a trailing
 * twelve-month accumulation, which is why the interface labels it as annualized rather than
 * pretending it lines up period for period with a trailing dividend yield.
 */
const SERIES_CDI_ANNUAL = 4389;
const URL_BASE = 'https://api.bcb.gov.br/dados/serie';
const TIMEOUT_MS = 8_000;

const SeriesSchema = z.array(
  z.looseObject({ data: z.string().optional(), valor: z.string() }),
);

export interface CdiRate {
  /** Annual rate as a fraction: 0.139 = 13.9%. */
  annual: number;
  source: 'bcb' | 'env';
  /** Reference date the series reported, when it came from the Central Bank. */
  date?: string;
}

/** Percentage points, as people quote the rate: `RADAR_CDI_ANUAL=13.9`. */
export function cdiFromEnv(raw: string | undefined): CdiRate | null {
  if (!raw || raw.trim() === '') return null;
  const points = Number(raw.replace(',', '.'));
  if (!Number.isFinite(points) || points < 0 || points > 100) return null;
  return { annual: points / 100, source: 'env' };
}

/**
 * The Central Bank's SGS API is public and needs no token, so the CDI is one of the few
 * things here that does not sit behind a paid plan. Any failure falls back to the env
 * constant, and a missing rate only drops the comparison — never the analysis.
 */
export async function fetchCdi(): Promise<CdiRate | null> {
  const fromEnv = cdiFromEnv(process.env.RADAR_CDI_ANUAL);

  try {
    const response = await fetch(
      `${URL_BASE}/bcdata.sgs.${SERIES_CDI_ANNUAL}/dados/ultimos/1?formato=json`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!response.ok) return fromEnv;

    const parsed = SeriesSchema.safeParse(await response.json());
    if (!parsed.success) return fromEnv;

    const entry = parsed.data.at(-1);
    if (!entry) return fromEnv;

    const points = Number(entry.valor.replace(',', '.'));
    if (!Number.isFinite(points) || points <= 0 || points > 100) return fromEnv;

    return {
      annual: points / 100,
      source: 'bcb',
      ...(entry.data ? { date: entry.data } : {}),
    };
  } catch {
    return fromEnv;
  }
}
