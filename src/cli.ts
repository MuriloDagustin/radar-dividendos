import pc from 'picocolors';
import { loadEnv } from './env';

loadEnv();

import { analyze } from './analysis';
import { openCache } from './cache';
import { RadarError, errorMessage } from './errors';
import { screenMarket } from './screen-market';
import { segmentOverlaps } from './fund-screen';
import { renderAnalysis, renderFooter, renderMarketScreen } from './report';
import { startServer } from './server';
import { DISCLAIMER } from './types';

const HELP = `
${pc.bold('radar-dividendos')} — fundamentos da B3 com diagnóstico determinístico

  npx tsx src/cli.ts TAEE11 ITSA4        analisa um ou mais tickers
  npx tsx src/cli.ts --fiis              lista os FIIs da B3 que passam nos 5 filtros
  npx tsx src/cli.ts --serve             sobe a API + página HTML

Flags
  --json          imprime JSON em vez do relatório colorido
  --ai            acrescenta interpretação da IA (exige ANTHROPIC_API_KEY)
  --no-cache      ignora e não grava o cache SQLite (TTL padrão: 12h)
  --fiis          triagem de mercado: todos os FIIs acima de R$ 1 bi, pelos 5 filtros
  --serve         modo servidor
  --porta <n>     porta do modo servidor (padrão: 3000)
  -h, --help      esta ajuda

Env (lidas de .env automaticamente)
  BRAPI_TOKEN         token da brapi.dev; opcional, usado só para o preço intradiário
  ANTHROPIC_API_KEY   chave usada apenas com --ai
  RADAR_CACHE_PATH    arquivo do cache (padrão: ./radar-dividendos.sqlite)

${DISCLAIMER}
`;

interface Options {
  tickers: string[];
  json: boolean;
  ai: boolean;
  cache: boolean;
  serve: boolean;
  funds: boolean;
  port: number;
  help: boolean;
}

export function parseArgs(argv: string[]): Options {
  const options: Options = {
    tickers: [],
    json: false,
    ai: false,
    cache: true,
    serve: false,
    funds: false,
    port: 3000,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--json':
        options.json = true;
        break;
      case '--ai':
        options.ai = true;
        break;
      case '--no-cache':
        options.cache = false;
        break;
      case '--serve':
        options.serve = true;
        break;
      case '--fiis':
        options.funds = true;
        break;
      case '--porta': {
        const raw = argv[i + 1];
        const port = Number(raw);
        if (!raw || !Number.isInteger(port) || port < 1 || port > 65535) {
          throw new Error(`--porta espera um número entre 1 e 65535 (recebido: ${raw ?? 'nada'})`);
        }
        options.port = port;
        i += 1;
        break;
      }
      case '-h':
      case '--help':
        options.help = true;
        break;
      default:
        if (arg === undefined) break;
        if (arg.startsWith('-')) throw new Error(`Flag desconhecida: ${arg}`);
        options.tickers.push(arg);
    }
  }

  return options;
}

async function runCli(options: Options): Promise<number> {
  // One cache connection for every ticker in the run.
  const cache = openCache({ enabled: options.cache });
  let failed = false;

  try {
    const results: unknown[] = [];
    const funds: { ticker: string; segment: string | null }[] = [];

    for (const ticker of options.tickers) {
      try {
        const analysis = await analyze(ticker, {
          ai: options.ai,
          cache: options.cache,
          sharedCache: cache,
        });
        if (analysis.fund) funds.push({ ticker: analysis.ticker, segment: analysis.fund.segment });
        if (options.json) results.push(analysis);
        else console.log(renderAnalysis(analysis));
      } catch (error) {
        failed = true;
        const detail = errorMessage(error);
        const code = error instanceof RadarError ? error.code : 'ERRO_INTERNO';
        if (options.json) results.push({ ticker, erro: detail, codigo: code });
        else console.error(`\n${pc.red(pc.bold(ticker))}  ${pc.red(detail)}`);
      }
    }

    // One fund per segment is the tiebreaker no single analysis can judge.
    const overlaps = segmentOverlaps(funds);

    if (options.json) {
      console.log(
        JSON.stringify(
          { resultados: results, ...(overlaps.length > 0 ? { desempate: overlaps } : {}), aviso: DISCLAIMER },
          null,
          2,
        ),
      );
    } else {
      for (const overlap of overlaps) console.log(pc.yellow(`\n  ${overlap}`));
      console.log(renderFooter());
    }
  } finally {
    cache.close();
  }

  return failed ? 1 : 0;
}

/**
 * The progress line goes to stderr so `--json` output stays parseable, and it is rewritten
 * in place: eighty funds would otherwise scroll the terminal for nothing.
 */
async function runMarketScreen(options: Options): Promise<number> {
  const progress = (text: string) => {
    if (process.stderr.isTTY) process.stderr.write(`\r\x1b[2K  ${pc.dim(text)}`);
  };

  const report = await screenMarket({
    cache: options.cache,
    onEvent: (event) => {
      if (event.type === 'universe') {
        progress(`${event.universe} fundos na lista · analisando ${event.candidates} acima de R$ 1 bi…`);
      } else if (event.type === 'fund' || event.type === 'failure') {
        const ticker = event.type === 'fund' ? event.fund.ticker : event.failure.ticker;
        progress(`${event.done}/${event.total} · ${ticker}`);
      } else {
        progress('');
      }
    },
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderMarketScreen(report));
    console.log(renderFooter());
  }
  return 0;
}

async function main(): Promise<void> {
  let options: Options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(pc.red(errorMessage(error)));
    console.error(HELP);
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(HELP);
    return;
  }

  if (options.serve) {
    startServer({ port: options.port, ai: options.ai, cache: options.cache });
    return;
  }

  if (options.funds) {
    try {
      process.exitCode = await runMarketScreen(options);
    } catch (error) {
      console.error(pc.red(errorMessage(error)));
      process.exitCode = 1;
    }
    return;
  }

  if (options.tickers.length === 0) {
    console.error(pc.red('Informe ao menos um ticker, ou use --serve.'));
    console.error(HELP);
    process.exitCode = 2;
    return;
  }

  if (options.ai && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      pc.yellow('--ai pedido sem ANTHROPIC_API_KEY definida: seguindo sem a interpretação.'),
    );
  }

  process.exitCode = await runCli(options);
}

await main();
