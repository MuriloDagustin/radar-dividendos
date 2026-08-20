import type { Diagnosis } from '@/src/types';
import { VERDICT_EXPLANATION, VERDICT_LABEL } from '@/app/format';
import styles from './badge.module.css';

const CLASS = {
  solid: styles.solid,
  attention: styles.attention,
  fragile: styles.fragile,
  indeterminate: styles.indeterminate,
  inconclusive: styles.inconclusive,
} as const;

export function Badge({ diagnosis }: { diagnosis: Diagnosis }) {
  const { verdict, counts, coverage } = diagnosis;

  /** The badge shows where the verdict came from, not just its name. */
  const parts =
    verdict === 'indeterminate'
      ? [`${coverage.present}/${coverage.applicable} indicadores`]
      : verdict === 'inconclusive'
        ? [`${coverage.unreliable} sem leitura`]
        : [
            counts.bad > 0 ? `${counts.bad} crítico${counts.bad > 1 ? 's' : ''}` : null,
            counts.warn > 0 ? `${counts.warn} alerta${counts.warn > 1 ? 's' : ''}` : null,
          ].filter((p): p is string => p !== null);

  return (
    <span className={`${styles.badge} ${CLASS[verdict]}`} title={VERDICT_EXPLANATION[verdict]}>
      {VERDICT_LABEL[verdict]}
      {parts.length > 0 ? <span className={styles.counts}>{parts.join(' · ')}</span> : null}
    </span>
  );
}
