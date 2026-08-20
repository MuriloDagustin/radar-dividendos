import { afterEach, describe, expect, it, vi } from 'vitest';
import { liquidityNote } from '../src/analysis';
import { fetchSiblingLiquidity, siblingClasses } from '../src/sources/brapi';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('siblingClasses', () => {
  it('lists the other classes of the same root', () => {
    expect(siblingClasses('KLBN3')).toEqual(['KLBN4', 'KLBN11']);
    expect(siblingClasses('KLBN4')).toEqual(['KLBN3', 'KLBN11']);
    expect(siblingClasses('KLBN11')).toEqual(['KLBN3', 'KLBN4']);
  });

  it('never lists the ticker itself', () => {
    expect(siblingClasses('ITSA4')).not.toContain('ITSA4');
  });

  it('accepts lowercase input', () => {
    expect(siblingClasses('klbn3')).toEqual(['KLBN4', 'KLBN11']);
  });

  it('returns nothing for a shape that is not a B3 ticker', () => {
    expect(siblingClasses('XPTO')).toEqual([]);
    expect(siblingClasses('')).toEqual([]);
  });
});

describe('liquidityNote', () => {
  it('names the sibling class when it trades far heavier', () => {
    expect(
      liquidityNote('KLBN3', [
        { ticker: 'KLBN3', volume: 1_000_000 },
        { ticker: 'KLBN11', volume: 6_295_400 },
      ]),
    ).toBe('KLBN11 é a classe mais líquida deste emissor');
  });

  it('stays quiet exactly at the five-times bound', () => {
    expect(
      liquidityNote('KLBN3', [
        { ticker: 'KLBN3', volume: 1_000_000 },
        { ticker: 'KLBN11', volume: 4_999_999 },
      ]),
    ).toBeNull();

    expect(
      liquidityNote('KLBN3', [
        { ticker: 'KLBN3', volume: 1_000_000 },
        { ticker: 'KLBN11', volume: 5_000_000 },
      ]),
    ).not.toBeNull();
  });

  it('stays quiet when the ticker asked for is already the most liquid', () => {
    expect(
      liquidityNote('KLBN11', [
        { ticker: 'KLBN11', volume: 6_000_000 },
        { ticker: 'KLBN3', volume: 100_000 },
      ]),
    ).toBeNull();
  });

  it('picks the heaviest sibling when several qualify', () => {
    expect(
      liquidityNote('KLBN3', [
        { ticker: 'KLBN3', volume: 100_000 },
        { ticker: 'KLBN4', volume: 900_000 },
        { ticker: 'KLBN11', volume: 6_000_000 },
      ]),
    ).toContain('KLBN11');
  });

  it('stays quiet with nothing to compare against', () => {
    expect(liquidityNote('KLBN3', [])).toBeNull();
    expect(liquidityNote('KLBN3', [{ ticker: 'KLBN3', volume: 1_000_000 }])).toBeNull();
  });

  it('stays quiet when the ticker own volume is unknown', () => {
    expect(liquidityNote('KLBN3', [{ ticker: 'KLBN11', volume: 6_000_000 }])).toBeNull();
  });
});

describe('fetchSiblingLiquidity', () => {
  function respondWith(handler: (url: URL) => Response): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | string) => handler(new URL(String(input)))),
    );
  }

  const quote = (symbol: string, volume: number) =>
    JSON.stringify({ results: [{ symbol, regularMarketVolume: volume }] });

  it('reads every class from one combined call when the plan allows it', async () => {
    respondWith(
      () =>
        new Response(
          JSON.stringify({
            results: [
              { symbol: 'KLBN3', regularMarketVolume: 100_000 },
              { symbol: 'KLBN4', regularMarketVolume: 900_000 },
              { symbol: 'KLBN11', regularMarketVolume: 6_000_000 },
            ],
          }),
          { status: 200 },
        ),
    );

    const classes = await fetchSiblingLiquidity('KLBN3', 'tok');
    expect(classes).toHaveLength(3);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  /** The Free plan caps a request at one asset, so the combined call is refused. */
  it('falls back to one call per class when the combined call is refused', async () => {
    respondWith((url) => {
      const path = decodeURIComponent(url.pathname);
      if (path.includes(',')) {
        return new Response(
          JSON.stringify({ error: true, message: 'Seu plano permite no máximo 1 ativo(s)' }),
          { status: 403 },
        );
      }
      const symbol = path.split('/').pop() ?? '';
      return new Response(quote(symbol, symbol === 'KLBN11' ? 6_000_000 : 100_000), {
        status: 200,
      });
    });

    const classes = await fetchSiblingLiquidity('KLBN3', 'tok');
    expect(classes.map((c) => c.ticker).sort()).toEqual(['KLBN11', 'KLBN3', 'KLBN4']);
    // One refused combined call plus one per class.
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(4);
  });

  it('a class that fails individually is simply left out', async () => {
    respondWith((url) => {
      const path = decodeURIComponent(url.pathname);
      if (path.includes(',') || path.endsWith('KLBN4')) {
        return new Response('{}', { status: 500 });
      }
      const symbol = path.split('/').pop() ?? '';
      return new Response(quote(symbol, 1_000_000), { status: 200 });
    });

    const classes = await fetchSiblingLiquidity('KLBN3', 'tok');
    expect(classes.map((c) => c.ticker).sort()).toEqual(['KLBN11', 'KLBN3']);
  });

  it('a dead network yields an empty list instead of throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET');
      }),
    );

    await expect(fetchSiblingLiquidity('KLBN3', 'tok')).resolves.toEqual([]);
  });

  it('does not call out at all for a ticker with no siblings', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect(await fetchSiblingLiquidity('XPTO', 'tok')).toEqual([]);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
