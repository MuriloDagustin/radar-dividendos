import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyze } from '../src/analysis';
import { NoDataError, InvalidTickerError, TickerNotFoundError } from '../src/errors';

const here = dirname(fileURLToPath(import.meta.url));
/** `Uint8Array.from` pins the buffer to ArrayBuffer, which is what `Response` accepts as a body. */
function fixtureBytes(nome: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(readFileSync(join(here, 'fixtures', nome)));
}

function gzFixtureBytes(nome: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(gunzipSync(readFileSync(join(here, 'fixtures', nome))));
}

const FUNDAMENTUS_BYTES = fixtureBytes('fundamentus-taee11.html');
const UNKNOWN_BYTES = fixtureBytes('fundamentus-inexistente.html');
const INVESTIDOR10_BYTES = gzFixtureBytes('investidor10-taee11.html.gz');
const STATUSINVEST_BYTES = gzFixtureBytes('statusinvest-taee11.html.gz');

const BRAPI_COMPLETA = {
  results: [
    {
      symbol: 'TAEE11',
      regularMarketPrice: 37.2,
      priceEarnings: 7.9,
      dividendYield: 8.4,
      defaultKeyStatistics: { priceToBook: 1.6, payoutRatio: 0.92 },
      financialData: {
        returnOnEquity: 0.2,
        ebitda: 2_500_000_000,
        totalDebt: 10_957_900_000,
        totalCash: 544_160_000,
      },
    },
  ],
};

type Resposta =
  | { json: unknown; status?: number }
  | { html: Uint8Array<ArrayBuffer>; status?: number }
  | { erro: string };

type Routes = Partial<
  Record<'brapi' | 'investidor10' | 'statusinvest' | 'fundamentus' | 'proventos', Resposta>
>;

const OFFLINE: Resposta = { erro: 'ECONNREFUSED' };

/** Routes fetch by host so each source can be simulated independently. */
function route(rotas: Routes): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: URL | string) => {
      const url = String(entrada);
      // The dividend history is a separate Fundamentus page, so it gets its own route.
      const chave = url.includes('brapi.dev')
        ? 'brapi'
        : url.includes('investidor10')
          ? 'investidor10'
          : url.includes('statusinvest')
            ? 'statusinvest'
            : url.includes('proventos.php')
              ? 'proventos'
              : 'fundamentus';

      const alvo = rotas[chave] ?? OFFLINE;
      if ('erro' in alvo) throw new Error(alvo.erro);
      const corpo = 'html' in alvo ? alvo.html : JSON.stringify(alvo.json);
      return new Response(corpo, { status: alvo.status ?? 200 });
    }),
  );
}

/** All four sources answering with the real fixtures. */
function allUp(): Routes {
  return {
    brapi: { json: BRAPI_COMPLETA },
    investidor10: { html: INVESTIDOR10_BYTES },
    statusinvest: { html: STATUSINVEST_BYTES },
    fundamentus: { html: FUNDAMENTUS_BYTES },
  };
}

const NO_CACHE = { cache: false } as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The user's real scenario: valid token, Free plan, brapi with price only. */
function freePlan(): Routes {
  return {
    brapi: { json: { results: [{ symbol: 'TAEE11', regularMarketPrice: 37.31 }] } },
    investidor10: { html: INVESTIDOR10_BYTES },
    statusinvest: { html: STATUSINVEST_BYTES },
    fundamentus: { html: FUNDAMENTUS_BYTES },
  };
}

describe('analyze', () => {
  it('rejects a ticker outside the B3 pattern before touching the network', async () => {
    route(allUp());
    await expect(analyze('XPTO', NO_CACHE)).rejects.toThrow(InvalidTickerError);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('normalizes a lowercase ticker', async () => {
    route(allUp());
    expect((await analyze('  taee11 ', NO_CACHE)).ticker).toBe('TAEE11');
  });

  it('queries all four sources in parallel', async () => {
    route(allUp());
    const analysis = await analyze('TAEE11', NO_CACHE);

    // Four sources plus the optional dividend history page.
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(5);
    expect(analysis.sources.map((f) => f.source)).toEqual([
      'brapi',
      'investidor10',
      'statusinvest',
      'fundamentus',
    ]);
    expect(analysis.sources.every((f) => f.status === 'ok')).toBe(true);
  });

  it('source order decides which one wins each field', async () => {
    route(allUp());
    const analysis = await analyze('TAEE11', NO_CACHE);

    // brapi delivers a price and comes first.
    expect(analysis.fundamentals.price).toBe(37.2);
    expect(analysis.provenance.price).toEqual({ source: 'brapi' });
  });

  it('on the Free plan brapi only delivers the price and Investidor10 takes the rest', async () => {
    route(freePlan());
    const analysis = await analyze('TAEE11', NO_CACHE);

    expect(analysis.fundamentals.price).toBe(37.31);
    expect(analysis.provenance.price).toEqual({ source: 'brapi' });
    expect(analysis.provenance.dividendYield12m).toEqual({ source: 'investidor10' });
    expect(analysis.provenance.roe).toEqual({ source: 'investidor10' });
  });

  it('Investidor10 supplies the payout every other source lacks', async () => {
    route(freePlan());
    const analysis = await analyze('TAEE11', NO_CACHE);

    expect(analysis.fundamentals.payout).toBeCloseTo(0.7598, 4);
    expect(analysis.provenance.payout).toEqual({ source: 'investidor10' });

    const payout = analysis.diagnosis.indicators.find((i) => i.key === 'payout');
    expect(payout).toMatchObject({ signal: 'ok', message: 'Saudável' });
  });

  it('uses the published net debt/EBITDA ratio instead of deriving it from both ends', async () => {
    route(freePlan());
    const analysis = await analyze('TAEE11', NO_CACHE);

    expect(analysis.fundamentals.netDebtToEbitda).toBe(3.48);
    expect(analysis.provenance.netDebtToEbitda).toEqual({ source: 'investidor10' });

    const ratio = analysis.diagnosis.indicators.find((i) => i.key === 'netDebtToEbitda');
    expect(ratio?.value).toBe(3.48);
    expect(ratio).toMatchObject({ signal: 'warn', message: 'Atenção (covenants)' });
  });

  it('a source that is down does not take the others with it', async () => {
    route({
      ...freePlan(),
      brapi: {
        json: { error: true, code: 'MODULES_NOT_AVAILABLE', message: 'plano' },
        status: 403,
      },
    });
    const analysis = await analyze('TAEE11', NO_CACHE);

    // The route answers 403 every time, retry included, so brapi goes down here.
    expect(analysis.sources[0]).toMatchObject({ source: 'brapi', status: 'failed' });
    // And the radar stays up on the other three.
    expect(analysis.fundamentals.roe).not.toBeNull();
  });

  it('one source being down does not bring the others down', async () => {
    route({ investidor10: { html: INVESTIDOR10_BYTES } });
    const analysis = await analyze('TAEE11', NO_CACHE);

    expect(analysis.fundamentals.roe).toBeCloseTo(0.2014, 4);
    expect(analysis.sources.filter((f) => f.status === 'failed')).toHaveLength(3);
    expect(analysis.sources.filter((f) => f.status === 'ok')).toHaveLength(1);
  });

  it('Fundamentus alone still yields a diagnosis, with a null payout', async () => {
    route({ fundamentus: { html: FUNDAMENTUS_BYTES } });
    const analysis = await analyze('TAEE11', NO_CACHE);

    expect(analysis.provenance.dividendYield12m).toEqual({ source: 'fundamentus' });
    expect(analysis.fundamentals.payout).toBeNull();
    expect(analysis.provenance.payout).toBeNull();
  });

  it('every source denying the paper becomes ticker not found', async () => {
    route({
      brapi: { json: { error: true, code: 'NOT_FOUND' }, status: 404 },
      fundamentus: { html: UNKNOWN_BYTES },
    });
    await expect(analyze('XXXX99', NO_CACHE)).rejects.toThrow(TickerNotFoundError);
  });

  it('one source denying and the rest down is still ticker not found', async () => {
    route({ fundamentus: { html: UNKNOWN_BYTES } });
    await expect(analyze('XXXX99', NO_CACHE)).rejects.toThrow(/não existe em Fundamentus/);
  });

  it('every source down becomes NoDataError listing all four', async () => {
    route({});
    await expect(analyze('TAEE11', NO_CACHE)).rejects.toThrow(NoDataError);

    const error = await analyze('TAEE11', NO_CACHE).catch((e: unknown) => e);
    const message = error instanceof Error ? error.message : '';
    for (const name of ['brapi.dev', 'Investidor10', 'StatusInvest', 'Fundamentus']) {
      expect(message).toContain(name);
    }
  });

  it('fills in the verdict, the disclaimer and the timestamp', async () => {
    route(allUp());
    const analysis = await analyze('TAEE11', NO_CACHE);

    expect(['solid', 'attention', 'fragile']).toContain(analysis.diagnosis.verdict);
    expect(analysis.disclaimer).toMatch(/Não é recomendação de investimento/);
    expect(Number.isNaN(Date.parse(analysis.generatedAt))).toBe(false);
    expect(analysis.fromCache).toBe(false);
  });

  it('does not call the AI without the flag', async () => {
    route(allUp());
    expect((await analyze('TAEE11', NO_CACHE)).interpretation).toBeNull();
  });
});

describe('error message wording', () => {
  it('enumerates the denying sources as a pt-BR list', async () => {
    route({
      brapi: { json: { error: true, code: 'NOT_FOUND' }, status: 404 },
      fundamentus: { html: UNKNOWN_BYTES },
    });

    const error = await analyze('XXXX99', NO_CACHE).catch((e: unknown) => e);
    const message = error instanceof Error ? error.message : '';
    expect(message).toContain('brapi.dev e Fundamentus');
    expect(message).not.toContain(' e Fundamentus e ');
  });
});
