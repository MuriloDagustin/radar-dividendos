import pc from 'picocolors';
import { formatCurrency, formatMultiple, formatPercent } from './numbers';
import { MESSAGES } from './diagnosis';
import { provenanceLabel } from './provenance';
import {
  ASSET_KIND_NAME,
  CATEGORY_NAME,
  SOURCE_NAME,
  type Analysis,
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

/** The sector median, so a good number can be told apart from a good sector. */
function peerMark(indicator: Indicator): string {
  const peer = indicator.peers?.subsector ?? indicator.peers?.sector;
  if (peer === undefined) return '';
  return pc.dim(` (setor ${formatIndicatorValue({ ...indicator, value: peer })})`);
}

function provenanceMark(analysis: Analysis, key: string): string {
  const label = provenanceLabel(analysis.provenance, key);
  return label ? pc.dim(` [${label}]`) : '';
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

export function renderFooter(): string {
  return [
    '',
    pc.dim('─'.repeat(78)),
    pc.dim('Ferramenta educacional — confira os dados na fonte. Não é recomendação de investimento.'),
  ].join('\n');
}
