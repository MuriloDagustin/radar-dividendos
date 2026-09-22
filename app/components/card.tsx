import { provenanceLabel } from '@/src/provenance';
import { primaryDocument } from '@/src/sources/documentos';
import { ASSET_KIND_NAME, SOURCE_NAME, type Analysis } from '@/src/types';
import { formatTimestamp, formatValue } from '@/app/format';
import styles from './card.module.css';

/** Published figures and source caveats, without editorial ratings or reference bands. */
export function Card({ analysis }: { analysis: Analysis }) {
  const document = analysis.filings ? primaryDocument(analysis.filings, analysis.kind) : null;
  const indicators = analysis.diagnosis.indicators;
  const payment = analysis.dividends?.nextPayment;
  return <article className={styles.card}>
    <header className={styles.top}>
      <div className={styles.identity}><h2 className={styles.ticker}>{analysis.ticker}</h2><span className="tag">{ASSET_KIND_NAME[analysis.kind]}</span></div>
      <span className={styles.origin}>Consulta: {formatTimestamp(analysis.generatedAt)}{analysis.fromCache ? ' · cache' : ''}</span>
    </header>
    <div className={styles.body}>
      <p>A data da consulta não representa necessariamente o período contábil dos indicadores. Confira a referência na fonte.</p>
      {document ? <a href={document.url} target="_blank" rel="noopener noreferrer">Ver {document.label}</a> : null}
      {indicators.map(indicator => <div key={indicator.key} className={styles.informational}>
        <span className={styles.name}>{indicator.label}</span>
        <span className={styles.number}>{indicator.signal === 'na' ? 'Não se aplica' : formatValue(indicator.value, indicator.format)}</span>
        <span className={styles.provenance}>{provenanceLabel(analysis.provenance, indicator.key) || 'Fonte não especificada para este campo'}</span>
        {indicator.signal === 'unrel' ? <span>Dado com limitação de interpretação; confira a fonte.</span> : null}
      </div>)}
      {payment ? <p>Próximo pagamento publicado: {payment.amount.toLocaleString('pt-BR', { minimumFractionDigits: 4 })} por unidade em {payment.paymentDate} ({payment.kind}).</p> : null}
      <details><summary>Fontes e disponibilidade</summary>{analysis.sources.map(source => <p key={source.source}><strong>{SOURCE_NAME[source.source]}</strong>: {source.status === 'ok' ? 'consultada' : 'indisponível'}{source.detail ? ` — ${source.detail}` : ''}</p>)}</details>
    </div>
  </article>;
}
