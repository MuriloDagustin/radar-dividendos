import { publicAnalysis, publicReport } from '../src/public-data';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from '../src/env';

loadEnv();

import { analyze } from '../src/analysis';
import { openCache } from '../src/cache';
import { screenMarket, screenStocks } from '../src/screen-market';

/**
 * Writes what the static site reads: both market screens and one analysis per paper they
 * touched. Every analysis comes straight from the cache the screens just filled, so the
 * snapshot is exactly what the screens saw — nothing is fetched twice.
 */
const OUT = process.argv[2] ?? join('public', 'data');

async function main(): Promise<void> {
  const cache = openCache({ enabled: true });
  try {
    const report = await screenMarket({
      sharedCache: cache,
      onEvent: (event) => {
        if (event.type === 'universe') {
          console.log(`${event.universe} fundos na lista · analisando ${event.candidates}`);
        } else if (event.type === 'fund' || event.type === 'failure') {
          const ticker = event.type === 'fund' ? event.fund.ticker : event.failure.ticker;
          console.log(`${event.done}/${event.total} ${ticker}`);
        }
      },
    });

    const stocks = await screenStocks({
      sharedCache: cache,
      onEvent: (event) => {
        if (event.type === 'universe') {
          console.log(`${event.universe} ações na lista · analisando ${event.candidates}`);
        } else if (event.type === 'stock' || event.type === 'failure') {
          const ticker = event.type === 'stock' ? event.stock.ticker : event.failure.ticker;
          console.log(`${event.done}/${event.total} ${ticker}`);
        }
      },
    });

    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(join(OUT, 'analise'), { recursive: true });
    writeFileSync(join(OUT, 'fiis.json'), JSON.stringify(publicReport(report)));
    writeFileSync(join(OUT, 'acoes.json'), JSON.stringify(publicReport(stocks)));

    const tickers = [
      ...report.approved,
      ...report.pending,
      ...report.rejected,
      ...stocks.approved,
      ...stocks.pending,
      ...stocks.rejected,
    ].map((f) => f.ticker);
    for (const ticker of tickers) {
      const analysis = await analyze(ticker, { sharedCache: cache });
      writeFileSync(join(OUT, 'analise', `${ticker}.json`), JSON.stringify(publicAnalysis(analysis)));
    }

    const summary = (r: { approved: unknown[]; pending: unknown[]; rejected: unknown[]; failed: unknown[] }) =>
      `${r.approved.length + r.pending.length + r.rejected.length} ativos consultados, ${r.failed.length} sem dados`;
    console.log(
      `instantâneo em ${OUT}: FIIs ${summary(report)} · ações ${summary(stocks)} · ${tickers.length} análises gravadas`,
    );
  } finally {
    cache.close();
  }
}

await main();
