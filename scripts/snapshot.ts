import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from '../src/env';

loadEnv();

import { analyze } from '../src/analysis';
import { openCache } from '../src/cache';
import { screenMarket } from '../src/screen-market';

/**
 * Writes what the static site reads: the market screen and one analysis per fund it
 * touched. Every analysis comes straight from the cache the screen just filled, so the
 * snapshot is exactly what the screen saw — nothing is fetched twice.
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

    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(join(OUT, 'analise'), { recursive: true });
    writeFileSync(join(OUT, 'fiis.json'), JSON.stringify(report));

    const tickers = [...report.approved, ...report.pending, ...report.rejected].map((f) => f.ticker);
    for (const ticker of tickers) {
      const analysis = await analyze(ticker, { sharedCache: cache });
      writeFileSync(join(OUT, 'analise', `${ticker}.json`), JSON.stringify(analysis));
    }

    console.log(
      `instantâneo em ${OUT}: ${report.approved.length} aprovados, ${report.pending.length} a conferir, ${report.rejected.length} reprovados, ${report.failed.length} sem análise · ${tickers.length} análises gravadas`,
    );
  } finally {
    cache.close();
  }
}

await main();
