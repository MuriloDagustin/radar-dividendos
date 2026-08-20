import { analyze } from '@/src/analysis';
import { openCache } from '@/src/cache';
import { RadarError, errorMessage } from '@/src/errors';
import { DISCLAIMER } from '@/src/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS_BY_CODE: Record<string, number> = {
  TICKER_INVALIDO: 400,
  TICKER_NAO_ENCONTRADO: 404,
  FONTE_INDISPONIVEL: 502,
  FORMATO_INESPERADO: 502,
  SEM_DADOS: 502,
};

// better-sqlite3 is synchronous: one connection per process, not one per request.
const cache = openCache({ enabled: true });

export async function GET(request: Request, context: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await context.params;
  const ai = new URL(request.url).searchParams.get('ia') === '1';

  try {
    const analysis = await analyze(ticker, { ai, cache: true, sharedCache: cache });
    return Response.json(analysis);
  } catch (error) {
    const code = error instanceof RadarError ? error.code : 'ERRO_INTERNO';
    return Response.json(
      { erro: errorMessage(error), codigo: code, aviso: DISCLAIMER },
      { status: STATUS_BY_CODE[code] ?? 500 },
    );
  }
}
