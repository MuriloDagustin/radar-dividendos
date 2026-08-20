import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SourceUnavailableError,
  UnexpectedFormatError,
  TickerNotFoundError,
} from '../src/errors';
import { fetchBrapi } from '../src/sources/brapi';

function respondWith(corpo: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status }),
    ),
  );
}

const FULL_RESULT = {
  results: [
    {
      symbol: 'TAEE11',
      regularMarketPrice: 37.17,
      priceEarnings: 7.88,
      dividendYield: 8.1,
      defaultKeyStatistics: { priceToBook: 1.59, payoutRatio: 0.92 },
      financialData: {
        returnOnEquity: 0.201,
        ebitda: 2_500_000_000,
        totalDebt: 10_957_900_000,
        totalCash: 544_160_000,
      },
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchBrapi', () => {
  it('reads the fields and normalizes the units', async () => {
    respondWith(FULL_RESULT);
    const { fundamentals } = await fetchBrapi('TAEE11', 'tok');
    expect(fundamentals.price).toBe(37.17);
    expect(fundamentals.dividendYield12m).toBeCloseTo(0.081, 10);
    expect(fundamentals.priceEarnings).toBe(7.88);
    expect(fundamentals.priceToBook).toBe(1.59);
    expect(fundamentals.roe).toBe(0.201);
    expect(fundamentals.payout).toBe(0.92);
    expect(fundamentals.ebitda).toBe(2_500_000_000);
  });

  it('derives net debt from totalDebt - totalCash and marks it', async () => {
    respondWith(FULL_RESULT);
    const leitura = await fetchBrapi('TAEE11', 'tok');
    expect(leitura.fundamentals.netDebt).toBe(10_957_900_000 - 544_160_000);
    expect(leitura.derived).toEqual(['netDebt']);
  });

  it('does not derive net debt without both inputs', async () => {
    respondWith({
      results: [{ symbol: 'X', financialData: { totalDebt: 100 } }],
    });
    const leitura = await fetchBrapi('TAEE11', 'tok');
    expect(leitura.fundamentals.netDebt).toBeNull();
    expect(leitura.derived).toEqual([]);
  });

  it('accepts a multiple arriving as a string', async () => {
    respondWith({ results: [{ symbol: 'X', priceEarnings: '7.88' }] });
    expect((await fetchBrapi('TAEE11')).fundamentals.priceEarnings).toBe(7.88);
  });

  it('a missing module becomes null, not an error', async () => {
    respondWith({ results: [{ symbol: 'X' }] });
    const { fundamentals } = await fetchBrapi('TAEE11');
    expect(fundamentals.roe).toBeNull();
    expect(fundamentals.priceToBook).toBeNull();
    expect(fundamentals.payout).toBeNull();
  });

  it('includes the token in the query when there is one', async () => {
    respondWith(FULL_RESULT);
    await fetchBrapi('TAEE11', 'segredo');
    const call = vi.mocked(fetch).mock.calls[0]?.[0] as URL;
    expect(call.searchParams.get('token')).toBe('segredo');
    expect(call.searchParams.get('fundamental')).toBe('true');
    expect(call.searchParams.get('modules')).toBe('defaultKeyStatistics,financialData');
  });

  it('omits the token when no env var is set', async () => {
    respondWith(FULL_RESULT);
    await fetchBrapi('TAEE11');
    const call = vi.mocked(fetch).mock.calls[0]?.[0] as URL;
    expect(call.searchParams.has('token')).toBe(false);
  });

  it('a missing token says to set the env var', async () => {
    respondWith(
      { error: true, message: 'Token de autenticação não fornecido', code: 'MISSING_TOKEN' },
      401,
    );
    await expect(fetchBrapi('TAEE11')).rejects.toThrow(SourceUnavailableError);
    await expect(fetchBrapi('TAEE11')).rejects.toThrow(/sem token.*BRAPI_TOKEN/);
  });

  it('an invalid token does not tell you to set what is already set', async () => {
    respondWith(
      { error: true, message: 'Token de autenticação inválido', code: 'INVALID_TOKEN' },
      401,
    );
    await expect(fetchBrapi('TAEE11', 'errado')).rejects.toThrow(/inválido ou revogado/);
    await expect(fetchBrapi('TAEE11', 'errado')).rejects.not.toThrow(/sem token/);
  });

  it('404 becomes ticker not found', async () => {
    respondWith({ error: true }, 404);
    await expect(fetchBrapi('XXXX99', 'tok')).rejects.toThrow(TickerNotFoundError);
  });

  it('an empty results list becomes ticker not found', async () => {
    respondWith({ results: [] });
    await expect(fetchBrapi('XXXX99', 'tok')).rejects.toThrow(TickerNotFoundError);
  });

  it('a non-JSON response fails explicitly', async () => {
    respondWith('<html>manutenção</html>');
    await expect(fetchBrapi('TAEE11', 'tok')).rejects.toThrow(UnexpectedFormatError);
  });

  it('a dead network becomes source unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('getaddrinfo ENOTFOUND brapi.dev');
      }),
    );
    await expect(fetchBrapi('TAEE11', 'tok')).rejects.toThrow(SourceUnavailableError);
  });

  it('a dividendYield off the percent scale fails instead of becoming wrong data', async () => {
    respondWith({ results: [{ symbol: 'X', dividendYield: 812 }] });
    await expect(fetchBrapi('TAEE11', 'tok')).rejects.toThrow(UnexpectedFormatError);
    await expect(fetchBrapi('TAEE11', 'tok')).rejects.toThrow(/dividendYield=812/);
  });

  it('a ROE off the fraction scale fails instead of becoming wrong data', async () => {
    respondWith({ results: [{ symbol: 'X', financialData: { returnOnEquity: 20.1 } }] });
    await expect(fetchBrapi('TAEE11', 'tok')).rejects.toThrow(/returnOnEquity=20.1/);
  });

  it('a payout off the fraction scale fails instead of becoming wrong data', async () => {
    respondWith({ results: [{ symbol: 'X', defaultKeyStatistics: { payoutRatio: 92 } }] });
    await expect(fetchBrapi('TAEE11', 'tok')).rejects.toThrow(/payoutRatio=92/);
  });

  it('a required schema field missing fails explicitly', async () => {
    respondWith({ results: [{ regularMarketPrice: 10 }] });
    await expect(fetchBrapi('TAEE11', 'tok')).rejects.toThrow(UnexpectedFormatError);
  });
});

describe('the Free plan', () => {
  const PLAN_ERROR = {
    error: true,
    code: 'MODULES_NOT_AVAILABLE',
    message: 'Os módulos defaultKeyStatistics, financialData não estão no plano Gratuito.',
  };

  /** First call (with modules) refused; second (without modules) accepted. */
  function respondByModules(withoutModules: unknown): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (entrada: URL | string) => {
        const url = new URL(String(entrada));
        if (url.searchParams.has('modules')) {
          return new Response(JSON.stringify(PLAN_ERROR), { status: 403 });
        }
        return new Response(JSON.stringify(withoutModules), { status: 200 });
      }),
    );
  }

  const PRICE_ONLY = {
    results: [{ symbol: 'TAEE11', regularMarketPrice: 37.31, priceEarnings: null }],
  };

  it('retries without the paid modules instead of losing the source', async () => {
    respondByModules(PRICE_ONLY);
    const leitura = await fetchBrapi('TAEE11', 'tok');

    expect(leitura.fundamentals.price).toBe(37.31);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it('records the plan caveat on the reading', async () => {
    respondByModules(PRICE_ONLY);
    const leitura = await fetchBrapi('TAEE11', 'tok');
    expect(leitura.note).toMatch(/plano Gratuito/);
  });

  it('invents no fundamental the plan does not deliver', async () => {
    respondByModules(PRICE_ONLY);
    const { fundamentals } = await fetchBrapi('TAEE11', 'tok');

    expect(fundamentals.dividendYield12m).toBeNull();
    expect(fundamentals.roe).toBeNull();
    expect(fundamentals.payout).toBeNull();
    expect(fundamentals.netDebt).toBeNull();
    expect(fundamentals.ebitda).toBeNull();
  });

  it('a 403 for any other reason stays a source failure', async () => {
    respondWith({ error: true, code: 'RATE_LIMIT', message: 'Limite excedido' }, 403);
    await expect(fetchBrapi('TAEE11', 'tok')).rejects.toThrow(SourceUnavailableError);
    await expect(fetchBrapi('TAEE11', 'tok')).rejects.toThrow(/Limite excedido/);
  });

  it('no caveat on the reading when the modules do arrive', async () => {
    respondWith(FULL_RESULT);
    expect((await fetchBrapi('TAEE11', 'tok')).note).toBeUndefined();
  });
});
