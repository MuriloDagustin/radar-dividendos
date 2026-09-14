import { BANDS_DIVIDEND_YIELD } from '@/src/diagnosis';
import { Ruler } from './ruler';
import styles from './legend.module.css';

const SAMPLE_DY = 0.081;

/**
 * Opens the page with the ruler itself instead of describing it: a first-time visitor learns
 * bands, needle and missing data before typing a ticker.
 */
export function Legend() {
  return (
    <section className={styles.legend} aria-label="Como ler a régua">
      <span className="tag">como ler a régua</span>
      <div className={styles.title}>
        <h2 className={styles.heading}>Dividend yield 12m</h2>
        <span className={styles.sample}>8,1%</span>
      </div>

      <Ruler
        indicatorKey="dividendYield12m"
        bands={BANDS_DIVIDEND_YIELD}
        value={SAMPLE_DY}
        format="percent"
        signal="ok"
      />

      <div className={styles.notes}>
        <p className={styles.note}>
          <span className={`${styles.swatch} ${styles.swatchBand}`} aria-hidden="true" />
          <span>
            A banda acesa é a faixa da regra em que o valor caiu. As apagadas mostram as outras
            faixas, com o limite de cada uma embaixo.
          </span>
        </p>
        <p className={styles.note}>
          <span className={`${styles.swatch} ${styles.swatchNeedle}`} aria-hidden="true" />
          <span>
            A agulha marca a posição dentro da faixa — é ela que diz o quanto falta para o
            próximo limite.
          </span>
        </p>
        <p className={styles.note}>
          <span className={`${styles.swatch} ${styles.swatchEmpty}`} aria-hidden="true" />
          <span>
            Régua tracejada é dado que nenhuma fonte publica. Fica vazia de propósito, nunca
            estimada.
          </span>
        </p>
      </div>
    </section>
  );
}
