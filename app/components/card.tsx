import { describeScreen } from '@/src/fund-screen';
import { provenanceLabel } from '@/src/provenance';
import { primaryDocument } from '@/src/sources/documentos';
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
import { VERDICT_EXPLANATION, formatTimestamp, formatValue } from '@/app/format';
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

/**
 * The latest results document, shown on every card and repeated next to a distorted number,
 * whose message sends the reader to exactly this report. Old cache payloads predate the field.
 */
function DocumentLink({ analysis }: { analysis: Analysis }) {
  if (!analysis.filings) return null;
  const document = primaryDocument(analysis.filings, analysis.kind);
  return (
    <a className={styles.documentLink} href={document.url} target="_blank" rel="noopener noreferrer">
      ver {document.label}
    </a>
  );
}

function IndicatorRow({ indicator, analysis }: { indicator: Indicator; analysis: Analysis }) {
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
    <div className={styles.indicator}>
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
        {...(indicator.signal === 'unrel' ? { emptyLabel: 'número distorcido — sem leitura' } : {})}
      />

      <div className={styles.indicatorFoot}>
        <span className={styles.message}>
          {indicator.message}
          {indicator.signal === 'unrel' ? (
            <>
              {'. '}
              <DocumentLink analysis={analysis} />
            </>
          ) : null}
        </span>
        {provenance ? <span className={`tag ${styles.provenance}`}>{provenance}</span> : null}
      </div>
    </div>
  );
}

/**
 * An indicator that does not apply is not a reading with a hole in it — a FII has no ROE to
 * miss. One line naming them beats three empty rulers, and the reason is what varies, so
 * indicators that share a reason share a line.
 */
function InapplicableNote({ indicators }: { indicators: Indicator[] }) {
  if (indicators.length === 0) return null;

  const byReason = new Map<string, string[]>();
  for (const indicator of indicators) {
    byReason.set(indicator.message, [...(byReason.get(indicator.message) ?? []), indicator.label]);
  }

  return (
    <>
      {[...byReason].map(([reason, labels]) => (
        <p key={reason} className={styles.inapplicable}>
          <span className="tag">não se aplica</span>
          <span>
            <strong className={styles.inapplicableList}>{labels.join(' · ')}</strong> — {reason}
          </span>
        </p>
      ))}
    </>
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

/**
 * The rule, its answer and the number behind it. The paragraph that argues the rule is the
 * same on every card, so it waits behind a disclosure — except when no source answered, and
 * then the paragraph *is* the answer.
 */
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
        {criterion.status === 'unknown' ? (
          <p className={styles.criterionDetail}>{criterion.detail}</p>
        ) : (
          <details className={styles.criterionWhy}>
            <summary className={styles.criterionWhySummary}>por que este filtro</summary>
            <p className={styles.criterionDetail}>{criterion.detail}</p>
          </details>
        )}
      </div>
    </li>
  );
}

/**
 * The five-filter screen: eliminatory filters, then the tiebreakers that only count once
 * every filter passed. Shown above the indicators because, for a fund, whether it is a
 * candidate at all comes before how its numbers read.
 */
function FundScreenPanel({ screen, paper }: { screen: FundScreen; paper: 'fundos' | 'ações' }) {
  const passedTiebreakers = screen.tiebreakers.filter((c) => c.status === 'pass').length;

  return (
    <section
      className={styles.screen}
      aria-label={paper === 'fundos' ? 'Cinco filtros para fundo imobiliário' : 'Cinco filtros para ação'}
    >
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

      <details className={screen.passedAll ? styles.tiebreak : `${styles.tiebreak} ${styles.tiebreakLocked}`}>
        <summary className={styles.tiebreakSummary}>
          <span className="tag">desempate</span>
          <span className={styles.screenSummary}>
            {screen.passedAll
              ? `${passedTiebreakers}/${screen.tiebreakers.length} entre ${paper} que passaram nos 5 filtros`
              : 'Só vale depois de passar pelos 5 filtros'}
          </span>
        </summary>
        <ul className={styles.criteria}>
          {screen.tiebreakers.map((c) => (
            <CriterionRow key={c.key} criterion={c} />
          ))}
        </ul>
      </details>
    </section>
  );
}

export function Card({ analysis }: { analysis: Analysis }) {
  const price = analysis.diagnosis.indicators.find((i) => i.key === 'price');
  const core = analysis.diagnosis.indicators.filter(
    (i) => i.key !== 'price' && i.group === 'core',
  );
  // A rule that does not apply says so once, at the end; an informational row with no number
  // says nothing at all.
  const inapplicable = core.filter((i) => i.signal === 'na');
  const readable = core.filter(
    (i) => i.signal !== 'na' && (i.bands !== null || i.value !== null),
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

      <div className={styles.verdict}>
        <Badge diagnosis={analysis.diagnosis} size="lg" />
        <p className={styles.why}>
          {verdict === 'indeterminate'
            ? `Sem veredito — ${coverage.present} de ${coverage.applicable} indicadores preenchidos, e o mínimo é ${coverage.minimumForVerdict}.`
            : verdict === 'inconclusive'
              ? `${coverage.unreliable} indicadores sem leitura — dados insuficientes ou distorcidos para diagnóstico automático.`
              : VERDICT_EXPLANATION[verdict]}
        </p>
        <DocumentLink analysis={analysis} />
      </div>

      {analysis.notes.length > 0 ? (
        <div className={styles.notes}>
          {analysis.notes.map((note) => (
            <p key={note} className={styles.note}>
              {note}
            </p>
          ))}
        </div>
      ) : null}

      {analysis.fundScreen ? <FundScreenPanel screen={analysis.fundScreen} paper="fundos" /> : null}
      {analysis.stockScreen ? <FundScreenPanel screen={analysis.stockScreen} paper="ações" /> : null}

      <div className={styles.body}>
        {readable.map((indicator) => (
          <IndicatorRow key={indicator.key} indicator={indicator} analysis={analysis} />
        ))}
      </div>

      <InapplicableNote indicators={inapplicable} />

      <ContextPanel indicators={context} />

      {analysis.dividends?.nextPayment ? (
        <p className={styles.nextPayment}>
          <span className={`tag ${styles.paymentTag}`}>próximo pagamento</span> {analysis.dividends.nextPayment.amount
            .toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}{' '}
          por ação em {analysis.dividends.nextPayment.paymentDate} (
          {analysis.dividends.nextPayment.kind.toLowerCase()})
        </p>
      ) : null}

      {verdict === 'inconclusive' ? (
        <div className={styles.notices}>
          <p className={`${styles.notice} ${styles.noticeUnrel}`}>
            Análise manual necessária. <DocumentLink analysis={analysis} />
          </p>
        </div>
      ) : null}

      {notes.length > 0 ? (
        <details className={styles.notices}>
          <summary className={styles.noticesSummary}>
            {notes.length === 1 ? '1 ressalva de fonte' : `${notes.length} ressalvas de fonte`}
          </summary>
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
        </details>
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
