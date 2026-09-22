import { publicAnalysis, publicReport } from './public-data';
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
      nome: 'Caderno de Ativos',
      interface: 'npm run dev — o app Next.js serve a interface e estas mesmas rotas',
      rotas: {
        'GET /api/analise/:ticker': 'Consulta dos indicadores publicados de um ativo, em JSON',
        'GET /api/fiis': 'Cobertura de FIIs acima de R$ 1 bi com indicadores publicados',
        'GET /api/acoes': 'Cobertura de ações acima de R$ 5 mi por dia com indicadores publicados',
      },
      aviso: DISCLAIMER,
    }),
  );

  app.get('/api/analise/:ticker', async (c) => {
    const ticker = c.req.param('ticker');
    try {
      const analysis = await analyze(ticker, {
        ai: false,
        cache: options.cache,
        sharedCache: cache,
      });
      return c.json(publicAnalysis(analysis));
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
      return c.json(publicReport(await screenMarket({ cache: options.cache, sharedCache: cache })));
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
      return c.json(publicReport(await screenStocks({ cache: options.cache, sharedCache: cache })));
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
    console.log(`Caderno de Ativos em http://localhost:${info.port}`);
    console.log(`  GET /                     índice das rotas (JSON)`);
    console.log(`  GET /api/analise/:ticker  JSON`);
    console.log(`  GET /api/fiis             cobertura de FIIs com indicadores publicados (JSON)`);
    console.log(`  GET /api/acoes            cobertura de ações com indicadores publicados (JSON)`);
    console.log(
      `  cache: ${options.cache ? 'ligado (TTL 12h)' : 'desligado'} · IA: desativada na API pública`,
    );
    console.log(DISCLAIMER);
  });
}
