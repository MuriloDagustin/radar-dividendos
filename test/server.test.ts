import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server';
import { DISCLAIMER } from '../src/types';

const app = createApp({ ai: false, cache: false });

describe('Hono server', () => {
  it('answers the root with the route index, not with an interface of its own', async () => {
    const response = await app.request('/');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');

    const body = (await response.json()) as { rotas: Record<string, string>; aviso: string };
    expect(Object.keys(body.rotas)).toEqual([
      'GET /api/analise/:ticker',
      'GET /api/fiis',
      'GET /api/acoes',
    ]);
    expect(body.aviso).toBe(DISCLAIMER);
  });

  it('rejects a ticker outside the B3 pattern with 400', async () => {
    const response = await app.request('/api/analise/não-é-ticker');
    expect(response.status).toBe(400);
    expect((await response.json()) as { codigo: string }).toMatchObject({
      codigo: 'TICKER_INVALIDO',
    });
  });

  it('answers an unknown route with JSON, never with HTML', async () => {
    const response = await app.request('/qualquer-coisa');
    expect(response.status).toBe(404);
    expect((await response.json()) as { erro: string }).toMatchObject({
      erro: 'Rota não encontrada.',
    });
  });
});
