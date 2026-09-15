import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { analyze } from './analysis';
import { openCache } from './cache';
import { RadarError, errorMessage } from './errors';
import { screenMarket, screenStocks } from './screen-market';
import { DISCLAIMER } from './types';

const STATUS_BY_CODE: Record<string, 400 | 404 | 502> = {
  TICKER_INVALIDO: 400,
  TICKER_NAO_ENCONTRADO: 404,
  FONTE_INDISPONIVEL: 502,
  FORMATO_INESPERADO: 502,
  SEM_DADOS: 502,
};

export interface ServerOptions {
  port: number;
  ai: boolean;
  cache: boolean;
}

export function createApp(options: Pick<ServerOptions, 'ai' | 'cache'>): Hono {
  // One SQLite connection for every request — better-sqlite3 is synchronous, and reopening
  // the database per request just wastes handles.
  const cache = openCache({ enabled: options.cache });
  const app = new Hono();

  // The interface is the Next app: a second one written by hand here only ever lagged behind it.
  app.get('/', (c) =>
    c.json({
      nome: 'Radar de Dividendos',
      interface: 'npm run dev — o app Next.js serve a interface e estas mesmas rotas',
      rotas: {
        'GET /api/analise/:ticker': 'Análise de um papel, em JSON',
        'GET /api/fiis': 'Triagem de todos os FIIs acima de R$ 1 bi pelos 5 filtros',
        'GET /api/acoes': 'Triagem de toda ação acima de R$ 5 mi por dia pelos 5 filtros',
      },
      aviso: DISCLAIMER,
    }),
  );

  app.get('/api/analise/:ticker', async (c) => {
    const ticker = c.req.param('ticker');
    try {
      const analysis = await analyze(ticker, {
        ai: options.ai,
        cache: options.cache,
        sharedCache: cache,
      });
      return c.json(analysis);
    } catch (error) {
      const code = error instanceof RadarError ? error.code : 'ERRO_INTERNO';
      return c.json(
        { erro: errorMessage(error), codigo: code, aviso: DISCLAIMER },
        STATUS_BY_CODE[code] ?? 500,
      );
    }
  });

  // Every fund above R$ 1 bi through the five filters. Minutes on a cold cache, so the
  // client that cares about progress is the Next route; this one answers when it is done.
  app.get('/api/fiis', async (c) => {
    try {
      return c.json(await screenMarket({ cache: options.cache, sharedCache: cache }));
    } catch (error) {
      const code = error instanceof RadarError ? error.code : 'ERRO_INTERNO';
      return c.json(
        { erro: errorMessage(error), codigo: code, aviso: DISCLAIMER },
        STATUS_BY_CODE[code] ?? 500,
      );
    }
  });

  app.get('/api/acoes', async (c) => {
    try {
      return c.json(await screenStocks({ cache: options.cache, sharedCache: cache }));
    } catch (error) {
      const code = error instanceof RadarError ? error.code : 'ERRO_INTERNO';
      return c.json(
        { erro: errorMessage(error), codigo: code, aviso: DISCLAIMER },
        STATUS_BY_CODE[code] ?? 500,
      );
    }
  });

  app.notFound((c) => c.json({ erro: 'Rota não encontrada.', aviso: DISCLAIMER }, 404));

  return app;
}

export function startServer(options: ServerOptions): void {
  const app = createApp(options);
  serve({ fetch: app.fetch, port: options.port }, (info) => {
    console.log(`Radar de Dividendos em http://localhost:${info.port}`);
    console.log(`  GET /                     índice das rotas (JSON)`);
    console.log(`  GET /api/analise/:ticker  JSON`);
    console.log(`  GET /api/fiis             triagem de FIIs pelos 5 filtros (JSON)`);
    console.log(`  GET /api/acoes            triagem de ações pelos 5 filtros (JSON)`);
    console.log(
      `  cache: ${options.cache ? 'ligado (TTL 12h)' : 'desligado'} · IA: ${options.ai ? 'ligada' : 'desligada'}`,
    );
    console.log(DISCLAIMER);
  });
}
