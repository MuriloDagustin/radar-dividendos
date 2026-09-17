'use client';
import { useState } from 'react';
import Link from 'next/link';
import { analysisHref } from '@/app/tickers';
import { provenanceLabel } from '@/src/provenance';
import { bandFor } from '@/src/diagnosis';
import { describeScreen } from '@/src/fund-screen';
import type { Analysis, Indicator, Signal } from '@/src/types';
import { VERDICT_LABEL, formatValue } from '@/app/format';
import styles from './compare.module.css';

const VALUE_CLASS: Record<Signal, string | undefined> = {
  ok: styles.ok,
  warn: styles.warn,
  bad: styles.bad,
  unrel: styles.unrel,
  na: styles.none,
};

/** Every banded indicator any of the papers has, in the order the first one lists them. */
function rowKeys(analyses: Analysis[]): { key: string; label: string }[] {
  const rows: { key: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const analysis of analyses) {
    for (const indicator of analysis.diagnosis.indicators) {
      if (indicator.group !== 'core' || indicator.bands === null) continue;
      if (seen.has(indicator.key)) continue;
      seen.add(indicator.key);
      rows.push({ key: indicator.key, label: indicator.label });
    }
  }
  return rows;
}

function Cell({ indicator, analysis }: { indicator: Indicator | undefined; analysis: Analysis }) {
  if (!indicator) return <td className={styles.cell}>—</td>;

  if (indicator.signal === 'na') {
    return (
      <td className={styles.cell}>
        <span className={styles.none}>não se aplica</span>
      </td>
    );
  }

  const band =
    indicator.bands && indicator.value !== null ? bandFor(indicator.bands, indicator.value) : null;

  return (
    <td className={styles.cell}>
      <span className={`${styles.value} ${indicator.signal ? VALUE_CLASS[indicator.signal] : styles.none}`}>
        {formatValue(indicator.value, indicator.format)}
      </span>
      {band ? <span className={styles.band}>{band.label}</span> : null}
      <span className={styles.band}>{provenanceLabel(analysis.provenance, indicator.key)}</span>
    </td>
  );
}

/**
 * Two papers side by side, aligned on the indicator. Cards answer "how is this one"; a
 * column per paper answers "which of these", which is the only reason to type two tickers.
 * The ruler stays on the card: here the band name is what compares.
 */
export function Compare({ analyses }: { analyses: Analysis[] }) {
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const rows = rowKeys(analyses).filter(row => !onlyDifferences || new Set(analyses.map(a => { const i = a.diagnosis.indicators.find(i => i.key === row.key); return JSON.stringify([i?.value, i?.signal]); })).size > 1);
  const screens = analyses.map((a) => a.fundScreen ?? a.stockScreen ?? null);
  const anyScreen = screens.some((s) => s !== null);

  return (
    <div className={styles.scroll}>
      <label><input type="checkbox" checked={onlyDifferences} onChange={e => setOnlyDifferences(e.target.checked)} /> Mostrar apenas indicadores diferentes</label>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.corner} />
            {analyses.map((analysis) => {
              const price = analysis.diagnosis.indicators.find((i) => i.key === 'price');
              return (
                <th key={analysis.ticker} className={styles.head} scope="col">
                  <Link className={styles.ticker} href={analysisHref([analysis.ticker])}>{analysis.ticker}</Link>
                  {price?.value !== null && price !== undefined ? (
                    <span className={styles.price}>{formatValue(price.value, price.format)}</span>
                  ) : null}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          <tr className={styles.row}>
            <th className={styles.label} scope="row">
              veredito
            </th>
            {analyses.map((analysis) => (
              <td key={analysis.ticker} className={styles.cell}>
                <span className={styles.value}>{VERDICT_LABEL[analysis.diagnosis.verdict]}</span>
              </td>
            ))}
          </tr>

          {anyScreen ? (
            <tr className={styles.row}>
              <th className={styles.label} scope="row">
                5 filtros
              </th>
              {analyses.map((analysis, i) => {
                const screen = screens[i];
                return (
                  <td key={analysis.ticker} className={styles.cell}>
                    {screen ? (
                      <>
                        <span className={screen.passedAll ? `${styles.value} ${styles.ok}` : styles.value}>
                          {screen.passed}/{screen.filters.length}
                        </span>
                        <span className={styles.band}>{describeScreen(screen)}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                );
              })}
            </tr>
          ) : null}

          {rows.map((row) => (
            <tr key={row.key} className={styles.row}>
              <th className={styles.label} scope="row">
                {row.label}
              </th>
              {analyses.map((analysis) => (
                <Cell
                  key={analysis.ticker}
                  analysis={analysis}
                  indicator={analysis.diagnosis.indicators.find((i) => i.key === row.key)}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
