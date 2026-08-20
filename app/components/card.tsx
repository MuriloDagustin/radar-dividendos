import type { CSSProperties } from 'react';
import { provenanceLabel } from '@/src/provenance';
import { ASSET_KIND_NAME, SOURCE_NAME, type Analysis, type Indicator } from '@/src/types';
import { formatTimestamp, formatValue } from '@/app/format';
import { Ruler } from './ruler';
import { Badge } from './badge';
import styles from './card.module.css';

const NUMBER_CLASS = {
  ok: styles.numberOk,
  warn: styles.numberWarn,
  bad: styles.numberBad,
} as const;

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
        {...(indicator.applicable ? {} : { emptyLabel: 'não se aplica a FII' })}
      />

      <div className={styles.indicatorFoot}>
        <span className={styles.message}>{indicator.message}</span>
        {provenance ? <span className={`tag ${styles.provenance}`}>{provenance}</span> : null}
      </div>
    </div>
  );
}

export function Card({ analysis }: { analysis: Analysis }) {
  const price = analysis.diagnosis.indicators.find((i) => i.key === 'price');
  const rest = analysis.diagnosis.indicators.filter((i) => i.key !== 'price');
  const notes = analysis.sources.filter((s) => s.detail);
  const { coverage, verdict } = analysis.diagnosis;

  return (
    <article className={styles.card}>
      <header className={styles.top}>
        <h2 className={styles.ticker}>{analysis.ticker}</h2>
        {price?.value !== null && price !== undefined ? (
          <span className={styles.price}>{formatValue(price.value, price.format)}</span>
        ) : null}
        <Badge diagnosis={analysis.diagnosis} />
        <span className="tag">{ASSET_KIND_NAME[analysis.kind]}</span>
        <span className={styles.spacer} />
        <span className={`tag ${styles.origin}`}>
          {analysis.fromCache ? 'do cache' : 'consulta ao vivo'}
          <br />
          {formatTimestamp(analysis.generatedAt)}
        </span>
      </header>

      <div className={styles.body}>
        {rest.map((indicator, i) => (
          <IndicatorRow key={indicator.key} indicator={indicator} analysis={analysis} order={i} />
        ))}
      </div>

      {verdict === 'indeterminate' ? (
        <div className={styles.notices}>
          <p className={`${styles.notice} ${styles.noticeFailure}`}>
            Sem veredito — {coverage.present} de {coverage.applicable} indicadores preenchidos, e o
            mínimo é {coverage.minimumForVerdict}.
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
          <span className="tag">Leitura por IA · {analysis.interpretation.model}</span>
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
