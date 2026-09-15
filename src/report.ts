import pc from 'picocolors';
import { formatCurrency, formatMultiple, formatPercent } from './numbers';
import { MESSAGES } from './diagnosis';
import type { MarketScreen, ScreenedFund } from './fund-market';
import type { ScreenedStock, StockMarketScreen } from './stock-market';
import { describeScreen } from './fund-screen';
import { provenanceLabel } from './provenance';
import { primaryDocument } from './sources/documentos';
import {
  ASSET_KIND_NAME,
  CATEGORY_NAME,
  SOURCE_NAME,
  type Analysis,
  type Criterion,
  type CriterionStatus,
  type FundScreen,
  type Indicator,
  type Signal,
  type Verdict,
} from './types';

const MARK: Record<Signal, string> = {
  ok: '●',
  warn: '▲',
  bad: '✖',
  na: '·',
  unrel: '⚠',
};

function paint(signal: Signal | null, text: string): string {
  switch (signal) {
    case 'ok':
      return pc.green(text);
    case 'warn':
      return pc.yellow(text);
    case 'bad':
      return pc.red(text);
    // A distorted reading needs to catch the eye without claiming a verdict.
    case 'unrel':
      return pc.magenta(text);
    case 'na':
    case null:
      return pc.dim(text);
  }
}

const VERDICTS: Record<Verdict, { label: string; paint: (t: string) => string }> = {
  solid: { label: 'SÓLIDA', paint: pc.green },
  attention: { label: 'ATENÇÃO', paint: pc.yellow },
  fragile: { label: 'FRÁGIL', paint: pc.red },
  indeterminate: { label: 'SEM DADOS', paint: pc.dim },
  inconclusive: { label: 'INCONCLUSIVO', paint: pc.magenta },
};

export function formatIndicatorValue(indicator: Indicator): string {
  if (indicator.value === null) return '—';
  switch (indicator.format) {
    case 'percent':
      return formatPercent(indicator.value);
    case 'currency':
      return formatCurrency(indicator.value);
    case 'multiple':
      return formatMultiple(indicator.value);
    case 'count':
      return String(indicator.value);
  }
}

const ANSI_SEQUENCE = new RegExp('\\[[0-9;]*m', 'g');

/** Visible width: picocolors already inserted the ANSI sequences before alignment. */
function width(text: string): number {
  return text.replace(ANSI_SEQUENCE, '').length;
}

function pad(text: string, target: number, side: 'left' | 'right' = 'left'): string {
  const missing = Math.max(0, target - width(text));
  return side === 'left' ? text + ' '.repeat(missing) : ' '.repeat(missing) + text;
}

/**
 * The sector median, so a good number can be told apart from a good sector. Broad sector
 * first: a subsector median over two or three companies is noise, and the label has to name
 * the scope it actually used.
 */
function peerMark(indicator: Indicator): string {
  const peer = indicator.peers?.sector ?? indicator.peers?.subsector;
  if (peer === undefined) return '';
  return pc.dim(` (setor ${formatIndicatorValue({ ...indicator, value: peer })})`);
}

function provenanceMark(analysis: Analysis, key: string): string {
  const label = provenanceLabel(analysis.provenance, key);
  return label ? pc.dim(` [${label}]`) : '';
}

const CRITERION: Record<CriterionStatus, { mark: string; paint: (t: string) => string }> = {
  pass: { mark: '✓', paint: pc.green },
  fail: { mark: '✕', paint: pc.red },
  unknown: { mark: '?', paint: pc.dim },
};

function criterionLine(criterion: Criterion, index?: number): string {
  const { mark, paint } = CRITERION[criterion.status];
  const head = [index !== undefined ? `${index}.` : ' ', criterion.label].join(' ');
  const value = criterion.value ? pc.dim(`  ${criterion.value}`) : '';
  return `    ${paint(mark)} ${paint(pc.bold(head))}${value}\n      ${pc.dim(criterion.detail)}`;
}

/** Filters first, tiebreakers after — dimmed until every filter has passed. */
export function renderScreen(screen: FundScreen, paper: 'fundos' | 'ações' = 'fundos'): string[] {
  const lines = [
    '',
    `  ${pc.bold('5 filtros')}  ${screen.passedAll ? pc.green(describeScreen(screen)) : pc.dim(describeScreen(screen))}`,
    ...screen.filters.map((c, i) => criterionLine(c, i + 1)),
    '',
    `  ${pc.bold('Desempate')}  ${pc.dim(
      screen.passedAll ? `entre ${paper} que passaram nos 5 filtros` : 'só vale depois de passar pelos 5 filtros',
    )}`,
    ...screen.tiebreakers.map((c) => criterionLine(c)),
  ];
  return lines;
}

export function renderAnalysis(analysis: Analysis): string {
  const lines: string[] = [];
  const verdict = VERDICTS[analysis.diagnosis.verdict];

  lines.push('');
  const category = analysis.classification.category;
  const kindLabel =
    analysis.kind === 'fii' || category === 'fii'
      ? ASSET_KIND_NAME.fii
      : `${ASSET_KIND_NAME.stock} · ${CATEGORY_NAME[category]}`;

  lines.push(
    `${pc.bold(pc.cyan(analysis.ticker))}  ${verdict.paint(pc.bold(verdict.label))}  ${pc.dim(
      kindLabel,
    )}`,
  );

  for (const note of analysis.notes) {
    lines.push(pc.dim(`  ${note}`));
  }

  if (analysis.filings) {
    const document = primaryDocument(analysis.filings, analysis.kind);
    lines.push(pc.dim(`  ${document.label}: ${pc.underline(document.url)}`));
  }

  const screen = analysis.fundScreen ?? analysis.stockScreen;
  if (screen) lines.push(...renderScreen(screen, analysis.fundScreen ? 'fundos' : 'ações'), '');

  const core = analysis.diagnosis.indicators.filter((i) => i.group === 'core');
  const context = analysis.diagnosis.indicators.filter(
    (i) => i.group === 'context' && i.value !== null,
  );

  const labelWidth = Math.max(...core.map((i) => i.label.length));
  const values = core.map(formatIndicatorValue);
  const valueWidth = Math.max(...values.map((v) => v.length));

  core.forEach((indicator, index) => {
    const mark = indicator.signal ? MARK[indicator.signal] : '·';
    const value = values[index] ?? '—';
    lines.push(
      [
        '  ',
        paint(indicator.signal, mark),
        ' ',
        pad(pc.bold(indicator.label), labelWidth),
        '  ',
        pad(value, valueWidth, 'right'),
        '  ',
        paint(indicator.signal, indicator.message),
        peerMark(indicator),
        provenanceMark(analysis, indicator.key),
      ].join(''),
    );
  });

  if (context.length > 0) {
    lines.push('');
    // Two columns of supporting numbers: informative, never part of the verdict.
    const cells = context.map((i) => `${i.label} ${formatIndicatorValue(i)}`);
    for (let i = 0; i < cells.length; i += 2) {
      const left = cells[i] ?? '';
      const right = cells[i + 1] ?? '';
      lines.push(pc.dim(`    ${left.padEnd(38)}${right}`));
    }
  }

  const next = analysis.dividends?.nextPayment;
  if (next) {
    lines.push(
      pc.dim(
        `    próximo pagamento ${next.amount.toFixed(4)} por ação em ${next.paymentDate} (${next.kind.toLowerCase()})`,
      ),
    );
  }

  const { coverage, verdict: outcome } = analysis.diagnosis;
  if (outcome === 'indeterminate') {
    lines.push(
      pc.yellow(
        `    Sem veredito: ${coverage.present} de ${coverage.applicable} indicadores preenchidos, mínimo ${coverage.minimumForVerdict}.`,
      ),
    );
  }
  if (outcome === 'inconclusive') {
    lines.push(
      pc.magenta(
        `    ${coverage.unreliable} indicadores sem leitura confiável — ${MESSAGES.inconclusive}`,
      ),
    );
  }

  for (const source of analysis.sources) {
    if (!source.detail) continue;
    const prefix = source.status === 'failed' ? 'não usada' : 'ressalva';
    lines.push(pc.dim(`    ${SOURCE_NAME[source.source]} ${prefix} — ${source.detail}`));
  }

  if (analysis.interpretation) {
    lines.push('');
    lines.push(`  ${pc.bold('Leitura por IA')} ${pc.dim(`(${analysis.interpretation.model})`)}`);
    lines.push(`  ${analysis.interpretation.summary}`);
    for (const point of analysis.interpretation.watchPoints) {
      lines.push(pc.yellow(`  · ${point}`));
    }
  }

  lines.push(
    pc.dim(
      `  ${analysis.fromCache ? 'do cache' : 'consulta ao vivo'} · ${new Date(
        analysis.generatedAt,
      ).toLocaleString('pt-BR')}`,
    ),
  );

  return lines.join('\n');
}

function shortCriterion(criterion: Criterion): string {
  return criterion.value ? `${criterion.label} (${criterion.value})` : criterion.label;
}

/** One line per fund: the numbers a buyer compares first, then what the screen still owes. */
function fundLine(fund: ScreenedFund, index: number): string {
  const numbers = [
    fund.priceToBook !== null ? `P/VP ${formatMultiple(fund.priceToBook)}` : null,
    fund.dividendYield12m !== null ? `DY ${formatPercent(fund.dividendYield12m)}` : null,
    fund.netWorth !== null ? formatCurrency(fund.netWorth) : null,
    fund.vacancy !== null ? `vacância ${formatPercent(fund.vacancy)}` : null,
    fund.payoutFfo !== null ? `${formatPercent(fund.payoutFfo)} do FFO` : null,
  ].filter((n): n is string => n !== null);

  const head = `  ${pad(`${index}.`, 3)} ${pc.bold(pc.cyan(pad(fund.ticker, 7)))} ${pad(fund.segment ?? '—', 34)}`;
  const tiebreak = pc.dim(`desempate ${fund.tiebreakersPassed}/${fund.screen.tiebreakers.length}`);
  const lines = [`${head} ${tiebreak}`, pc.dim(`       ${numbers.join(' · ')}`)];

  const missing = fund.screen.filters.filter((c) => c.status === 'unknown');
  if (missing.length > 0) {
    lines.push(pc.yellow(`       sem dado: ${missing.map(shortCriterion).join('; ')}`));
  }
  const tiebreakFails = fund.screen.tiebreakers.filter((c) => c.status === 'fail');
  if (fund.outcome === 'approved' && tiebreakFails.length > 0) {
    lines.push(pc.dim(`       não passa: ${tiebreakFails.map(shortCriterion).join('; ')}`));
  }
  return lines.join('\n');
}

export function renderMarketScreen(report: MarketScreen): string {
  const lines: string[] = [''];

  lines.push(
    `${pc.bold('Triagem de FIIs')}  ${pc.dim(
      `${report.universe} fundos listados · ${report.candidates} acima de R$ 1 bi analisados · ${report.skipped} pequenos demais`,
    )}`,
  );

  lines.push('', `  ${pc.green(pc.bold(`Passaram nos 5 filtros`))}  ${pc.dim(`${report.approved.length}`)}`);
  if (report.approved.length === 0) lines.push(pc.dim('    nenhum fundo passou em todos os filtros hoje'));
  report.approved.forEach((fund, i) => lines.push(fundLine(fund, i + 1)));
  for (const overlap of report.overlaps) lines.push(pc.yellow(`\n  ${overlap}`));

  lines.push(
    '',
    `  ${pc.yellow(pc.bold('Falta conferir à mão'))}  ${pc.dim(
      `${report.pending.length} · nenhum filtro reprovou, mas faltou dado`,
    )}`,
  );
  report.pending.forEach((fund, i) => lines.push(fundLine(fund, i + 1)));

  lines.push('', `  ${pc.red(pc.bold('Reprovados'))}  ${pc.dim(`${report.rejected.length}`)}`);
  for (const fund of report.rejected) {
    const reason = fund.failedOn ? shortCriterion(fund.failedOn) : 'reprovado';
    lines.push(pc.dim(`    ${pad(fund.ticker, 7)} ${pad(fund.segment ?? '—', 34)} ${reason}`));
  }

  if (report.failed.length > 0) {
    lines.push('', `  ${pc.magenta(pc.bold('Sem análise'))}  ${pc.dim(`${report.failed.length}`)}`);
    for (const failure of report.failed) {
      lines.push(pc.dim(`    ${pad(failure.ticker, 7)} ${failure.message.split('\n')[0]}`));
    }
  }

  lines.push(pc.dim(`\n  gerado em ${new Date(report.generatedAt).toLocaleString('pt-BR')}`));
  return lines.join('\n');
}

/** One line per company: the five numbers the filters read, then what the screen still owes. */
function stockLine(stock: ScreenedStock, index: number): string {
  const numbers = [
    stock.roe !== null ? `ROE ${formatPercent(stock.roe)}` : null,
    stock.netDebtToEbitda !== null ? `dív/EBITDA ${formatMultiple(stock.netDebtToEbitda)}` : null,
    stock.netMargin !== null ? `margem ${formatPercent(stock.netMargin)}` : null,
    stock.revenueCagr5y !== null ? `receita ${formatPercent(stock.revenueCagr5y)}/ano` : null,
    stock.liquidity !== null ? `${formatCurrency(stock.liquidity)}/dia` : null,
    stock.dividendYield12m !== null ? `DY ${formatPercent(stock.dividendYield12m)}` : null,
  ].filter((n): n is string => n !== null);

  const label = stock.sector ?? stock.name ?? '—';
  const head = `  ${pad(`${index}.`, 3)} ${pc.bold(pc.cyan(pad(stock.ticker, 7)))} ${pad(label.slice(0, 34), 34)}`;
  const tiebreak = pc.dim(`desempate ${stock.tiebreakersPassed}/${stock.screen.tiebreakers.length}`);
  const lines = [`${head} ${tiebreak}`, pc.dim(`       ${numbers.join(' · ')}`)];

  const missing = stock.screen.filters.filter((c) => c.status === 'unknown');
  if (missing.length > 0) {
    lines.push(pc.yellow(`       sem dado: ${missing.map(shortCriterion).join('; ')}`));
  }
  const tiebreakFails = stock.screen.tiebreakers.filter((c) => c.status === 'fail');
  if (stock.outcome === 'approved' && tiebreakFails.length > 0) {
    lines.push(pc.dim(`       não passa: ${tiebreakFails.map(shortCriterion).join('; ')}`));
  }
  return lines.join('\n');
}

export function renderStockScreen(report: StockMarketScreen): string {
  const lines: string[] = [''];

  lines.push(
    `${pc.bold('Triagem de ações')}  ${pc.dim(
      `${report.universe} ações listadas · ${report.candidates} acima de R$ 5 mi/dia analisadas · ${report.skipped} fora por liquidez ou classe repetida`,
    )}`,
  );

  lines.push('', `  ${pc.green(pc.bold('Passaram nos 5 filtros'))}  ${pc.dim(`${report.approved.length}`)}`);
  if (report.approved.length === 0) lines.push(pc.dim('    nenhuma ação passou em todos os filtros hoje'));
  report.approved.forEach((stock, i) => lines.push(stockLine(stock, i + 1)));
  lines.push(
    pc.dim('\n  Indicador é filtro, não decisão: o que sobrou aqui é onde começa a leitura do release.'),
  );

  lines.push(
    '',
    `  ${pc.yellow(pc.bold('Falta conferir à mão'))}  ${pc.dim(
      `${report.pending.length} · nenhum filtro reprovou, mas faltou dado ou o filtro não se aplica`,
    )}`,
  );
  report.pending.forEach((stock, i) => lines.push(stockLine(stock, i + 1)));

  lines.push('', `  ${pc.red(pc.bold('Reprovados'))}  ${pc.dim(`${report.rejected.length}`)}`);
  for (const stock of report.rejected) {
    const reason = stock.failedOn ? shortCriterion(stock.failedOn) : 'reprovado';
    lines.push(pc.dim(`    ${pad(stock.ticker, 7)} ${pad((stock.sector ?? stock.name ?? '—').slice(0, 34), 34)} ${reason}`));
  }

  if (report.failed.length > 0) {
    lines.push('', `  ${pc.magenta(pc.bold('Sem análise'))}  ${pc.dim(`${report.failed.length}`)}`);
    for (const failure of report.failed) {
      lines.push(pc.dim(`    ${pad(failure.ticker, 7)} ${failure.message.split('\n')[0]}`));
    }
  }

  lines.push(pc.dim(`\n  gerado em ${new Date(report.generatedAt).toLocaleString('pt-BR')}`));
  return lines.join('\n');
}

export function renderFooter(): string {
  return [
    '',
    pc.dim('─'.repeat(78)),
    pc.dim('Ferramenta educacional — confira os dados na fonte. Não é recomendação de investimento.'),
  ].join('\n');
}
