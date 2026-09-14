import type { CSSProperties } from 'react';
import { describeScreen } from '@/src/fund-screen';
import { provenanceLabel } from '@/src/provenance';
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
} from '@/src/types';
import { formatTimestamp, formatValue } from '@/app/format';
import { Ruler } from './ruler';
import { Badge } from './badge';
import styles from './card.module.css';

const NUMBER_CLASS: Record<Signal, string | undefined> = {
  ok: styles.numberOk,
  warn: styles.numberWarn,
  bad: styles.numberBad,
  unrel: styles.numberUnrel,
  na: styles.numberNone,
};

/** The empty ruler explains why there is nothing to place on it. */
const EMPTY_RULER_LABEL: Partial<Record<Signal, string>> = {
  na: 'não se aplica',
  unrel: 'número distorcido — sem leitura',
};

function IndicatorRow({
  indicator,
  analysis,
  order,
}: {
  indicator: Indicator;
  analysis: Analysis;
  order: number;
}) {
  const value = formatValue(indicator.value, indicator.format);
  const provenance = provenanceLabel(analysis.provenance, indicator.key);
  const numberClass = indicator.signal ? NUMBER_CLASS[indicator.signal] : styles.numberNone;

  if (indicator.bands === null) {
    return (
      <div className={styles.informational}>
        <span className={styles.name}>{indicator.label}</span>
        <span className={`${styles.number} ${styles.numberNone}`}>{value}</span>
        <span className={`tag ${styles.provenance}`}>{provenance}</span>
      </div>
    );
  }

  return (
    <div className={styles.indicator} style={{ '--row-order': order } as CSSProperties}>
      <div className={styles.indicatorHead}>
        <span className={styles.name}>{indicator.label}</span>
        <span className={`${styles.number} ${numberClass}`}>{value}</span>
      </div>

      <Ruler
        indicatorKey={indicator.key}
        bands={indicator.bands}
        value={indicator.value}
        format={indicator.format}
        signal={indicator.signal}
        {...(indicator.peers ? { peers: indicator.peers } : {})}
        {...(indicator.signal && EMPTY_RULER_LABEL[indicator.signal]
          ? { emptyLabel: EMPTY_RULER_LABEL[indicator.signal] as string }
          : {})}
      />

      <div className={styles.indicatorFoot}>
        <span className={styles.message}>{indicator.message}</span>
        {provenance ? <span className={`tag ${styles.provenance}`}>{provenance}</span> : null}
      </div>
    </div>
  );
}

/** The supporting panel: shown compactly, never with a ruler, never weighed. */
function ContextPanel({ indicators }: { indicators: Indicator[] }) {
  const filled = indicators.filter((i) => i.value !== null);
  if (filled.length === 0) return null;

  return (
    <div className={styles.context}>
      <span className="tag">contexto</span>
      <dl className={styles.contextGrid}>
        {filled.map((indicator) => (
          <div key={indicator.key} className={styles.contextItem} title={indicator.message}>
            <dt className={styles.contextLabel}>{indicator.label}</dt>
            <dd className={styles.contextValue}>
              {formatValue(indicator.value, indicator.format)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const CRITERION_MARK: Record<CriterionStatus, { glyph: string; className: string | undefined; title: string }> = {
  pass: { glyph: '✓', className: styles.markPass, title: 'passou' },
  fail: { glyph: '✕', className: styles.markFail, title: 'não passou' },
  unknown: { glyph: '?', className: styles.markUnknown, title: 'sem dado para julgar' },
};

function CriterionRow({ criterion, index }: { criterion: Criterion; index?: number }) {
  const mark = CRITERION_MARK[criterion.status];
  return (
    <li className={styles.criterion}>
      <span className={`${styles.mark} ${mark.className ?? ''}`} title={mark.title} aria-label={mark.title}>
        {mark.glyph}
      </span>
      <div className={styles.criterionBody}>
        <div className={styles.criterionHead}>
          {index !== undefined ? <span className={styles.criterionIndex}>{index}</span> : null}
          <span className={styles.criterionLabel}>{criterion.label}</span>
          {criterion.value ? <span className={styles.criterionValue}>{criterion.value}</span> : null}
        </div>
        <p className={styles.criterionDetail}>{criterion.detail}</p>
      </div>
    </li>
  );
}

/**
 * The five-filter screen: eliminatory filters, then the tiebreakers that only count once
 * every filter passed. Shown above the indicators because, for a fund, whether it is a
 * candidate at all comes before how its numbers read.
 */
function FundScreenPanel({ screen }: { screen: FundScreen }) {
  return (
    <section className={styles.screen} aria-label="Cinco filtros para fundo imobiliário">
      <div className={styles.screenHead}>
        <span className="tag">5 filtros</span>
        <span className={screen.passedAll ? styles.screenSummaryPass : styles.screenSummary}>
          {describeScreen(screen)}
        </span>
      </div>
      <ol className={styles.criteria}>
        {screen.filters.map((c, i) => (
          <CriterionRow key={c.key} criterion={c} index={i + 1} />
        ))}
      </ol>

      <div className={screen.passedAll ? styles.tiebreak : `${styles.tiebreak} ${styles.tiebreakLocked}`}>
        <div className={styles.screenHead}>
          <span className="tag">desempate</span>
          <span className={styles.screenSummary}>
            {screen.passedAll
              ? 'Entre fundos que passaram nos 5 filtros'
              : 'Só vale depois de passar pelos 5 filtros'}
          </span>
        </div>
        <ul className={styles.criteria}>
          {screen.tiebreakers.map((c) => (
            <CriterionRow key={c.key} criterion={c} />
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Card({ analysis }: { analysis: Analysis }) {
  const price = analysis.diagnosis.indicators.find((i) => i.key === 'price');
  const rest = analysis.diagnosis.indicators.filter(
    (i) => i.key !== 'price' && i.group === 'core',
  );
  const context = analysis.diagnosis.indicators.filter((i) => i.group === 'context');
  const notes = analysis.sources.filter((s) => s.detail);
  const { coverage, verdict } = analysis.diagnosis;

  return (
    <article className={styles.card}>
      <header className={styles.top}>
        <div className={styles.identity}>
          <h2 className={styles.ticker}>{analysis.ticker}</h2>
          {price?.value !== null && price !== undefined ? (
            <span className={styles.price}>{formatValue(price.value, price.format)}</span>
          ) : null}
        </div>
        <div className={styles.meta}>
          <Badge diagnosis={analysis.diagnosis} />
          <span className="tag" title={analysis.classification.rawSector ?? undefined}>
            {analysis.kind === 'fii' || analysis.classification.category === 'fii'
              ? ASSET_KIND_NAME.fii
              : `${ASSET_KIND_NAME.stock} · ${CATEGORY_NAME[analysis.classification.category]}`}
          </span>
        </div>
        <span className={styles.origin}>
          {analysis.fromCache ? 'do cache' : 'consulta ao vivo'}
          <br />
          {formatTimestamp(analysis.generatedAt)}
        </span>
      </header>

      {analysis.notes.length > 0 ? (
        <div className={styles.notes}>
          {analysis.notes.map((note) => (
            <p key={note} className={styles.note}>
              {note}
            </p>
          ))}
        </div>
      ) : null}

      {analysis.fundScreen ? <FundScreenPanel screen={analysis.fundScreen} /> : null}

      <div className={styles.body}>
        {rest.map((indicator, i) => (
          <IndicatorRow key={indicator.key} indicator={indicator} analysis={analysis} order={i} />
        ))}
      </div>

      <ContextPanel indicators={context} />

      {analysis.dividends?.nextPayment ? (
        <p className={styles.nextPayment}>
          <span className={`tag ${styles.paymentTag}`}>próximo pagamento</span> {analysis.dividends.nextPayment.amount
            .toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}{' '}
          por ação em {analysis.dividends.nextPayment.paymentDate} (
          {analysis.dividends.nextPayment.kind.toLowerCase()})
        </p>
      ) : null}

      {verdict === 'indeterminate' ? (
        <div className={styles.notices}>
          <p className={`${styles.notice} ${styles.noticeFailure}`}>
            Sem veredito — {coverage.present} de {coverage.applicable} indicadores preenchidos, e o
            mínimo é {coverage.minimumForVerdict}.
          </p>
        </div>
      ) : null}

      {verdict === 'inconclusive' ? (
        <div className={styles.notices}>
          <p className={`${styles.notice} ${styles.noticeUnrel}`}>
            {coverage.unreliable} indicadores sem leitura — dados insuficientes ou distorcidos para
            diagnóstico automático. Análise manual necessária.
          </p>
        </div>
      ) : null}

      {notes.length > 0 ? (
        <div className={styles.notices}>
          {notes.map((source) => (
            <p
              key={source.source}
              className={
                source.status === 'failed'
                  ? `${styles.notice} ${styles.noticeFailure}`
                  : styles.notice
              }
            >
              <strong>{SOURCE_NAME[source.source]}</strong>{' '}
              {source.status === 'failed' ? 'fora' : 'ressalva'} — {source.detail}
            </p>
          ))}
        </div>
      ) : null}

      {analysis.interpretation ? (
        <div className={styles.ai}>
          <span className={`tag ${styles.aiTag}`}>Leitura por IA · {analysis.interpretation.model}</span>
          <p className={styles.aiText}>{analysis.interpretation.summary}</p>
          {analysis.interpretation.watchPoints.length > 0 ? (
            <ul className={styles.points}>
              {analysis.interpretation.watchPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
