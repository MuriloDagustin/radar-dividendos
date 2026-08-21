import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parseInvestidor10, extractPeers } from './src/sources/investidor10';
import { parseStatusInvest } from './src/sources/statusinvest';
import { parseFundamentus } from './src/sources/fundamentus';
const D='/tmp/claude-1000/-home-murilo-plantae-Projects-pessoais-radar-dividendos/57caca18-9048-4f45-966e-fbc01b7be6ba/scratchpad';
const i10 = gunzipSync(readFileSync('test/fixtures/investidor10-taee11.html.gz')).toString('utf8');
const si  = gunzipSync(readFileSync('test/fixtures/statusinvest-taee11.html.gz')).toString('utf8');
const fu  = new TextDecoder('iso-8859-1').decode(readFileSync('test/fixtures/fundamentus-taee11.html'));
const novos = ['roic','grossMargin','ebitdaMargin','netMargin','currentRatio','netDebtToEquity','revenueCagr5y','profitCagr5y','low52w','high52w'] as const;
for (const [n, r] of [['i10', parseInvestidor10(i10,'TAEE11')], ['si', parseStatusInvest(si,'TAEE11')], ['fund', parseFundamentus(fu,'TAEE11')]] as const) {
  console.log(`\n${n}:`, novos.map(k=>`${k}=${r.fundamentals[k]}`).join(' '));
}
console.log('\npares:', JSON.stringify(extractPeers(i10)));
