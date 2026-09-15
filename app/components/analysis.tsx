'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { segmentOverlaps } from '@/src/fund-screen';
import type { Analysis } from '@/src/types';
import { STATIC_ONLY_SCREEN, STATIC_SITE, analysisUrl } from '@/app/mode';
import { analysisHref, splitTickers } from '@/app/tickers';
import { Card } from './card';
import { Compare } from './compare';
import { Legend } from './legend';
import styles from './analysis.module.css';

interface Failure {
  ticker: string;
  message: string;
}

type Result = { kind: 'analysis'; analysis: Analysis } | { kind: 'failure'; failure: Failure };

async function analyzeTicker(ticker: string, ai: boolean): Promise<Result> {
  try {
    const response = await fetch(analysisUrl(ticker, ai));

    // A static host answers a missing paper with an HTML 404, not with our JSON error.
    if (STATIC_SITE && !response.ok) {
      return { kind: 'failure', failure: { ticker, message: STATIC_ONLY_SCREEN } };
    }

    const body: unknown = await response.json();

    if (!response.ok) {
      const message =
        typeof body === 'object' && body !== null && 'erro' in body
          ? String((body as { erro: unknown }).erro)
          : `A consulta falhou (HTTP ${response.status}).`;
      return { kind: 'failure', failure: { ticker, message } };
    }

    return { kind: 'analysis', analysis: body as Analysis };
  } catch {
    return {
      kind: 'failure',
      failure: { ticker, message: 'Não foi possível falar com o servidor. Verifique a conexão.' },
    };
  }
}

/** The cards for the tickers in the URL — which is what makes an analysis shareable. */
export function AnalysisView({ aiAvailable }: { aiAvailable: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const query = params.get('t') ?? '';
  const ai = params.get('ia') === '1' && aiAvailable;
  const tickers = useMemo(() => splitTickers(query), [query]);
  const key = tickers.join(' ');

  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(tickers.length > 0);
  /** Null until the reader chooses: more than one paper opens compared, one opens as a card. */
  const [chosenMode, setChosenMode] = useState<'compare' | 'cards' | null>(null);

  useEffect(() => {
    if (tickers.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }

    let current = true;
    setLoading(true);
    // One request per ticker, in parallel: a slow source must not hold up other papers.
    void Promise.all(tickers.map((t) => analyzeTicker(t, ai))).then((next) => {
      if (!current) return;
      setResults(next);
      setLoading(false);
    });

    return () => {
      current = false;
    };
    // `key` is the ticker list; `tickers` is a fresh array on every render.
  }, [key, ai]); // eslint-disable-line react-hooks/exhaustive-deps

  const analyses = results.flatMap((r) => (r.kind === 'analysis' ? [r.analysis] : []));
  const failures = results.flatMap((r) => (r.kind === 'failure' ? [r.failure] : []));
  const mode = chosenMode ?? (analyses.length > 1 ? 'compare' : 'cards');

  // One fund per segment is the tiebreaker that only a set of funds can answer.
  const overlaps = segmentOverlaps(
    results.flatMap((r) =>
      r.kind === 'analysis' && r.analysis.fund
        ? [{ ticker: r.analysis.ticker, segment: r.analysis.fund.segment }]
        : [],
    ),
  );

  if (tickers.length === 0) {
    return (
      <section className={`${styles.container} ${styles.band}`}>
        <header className={styles.head}>
          <h1 className={styles.title}>Análise</h1>
          <p className={styles.lede}>
            Digite um ou mais tickers da B3 na busca acima. Cada indicador vem com a faixa da regra
            desenhada, a banda em que o valor caiu acesa e a procedência do número ao lado.
          </p>
        </header>
        <div className={styles.emptyGrid}>
          <Legend />
          <p className={styles.emptyNote}>
            Sem um papel em mente? Comece pela <Link href="/fiis">triagem de FIIs</Link> ou pela{' '}
            <Link href="/acoes">triagem de ações</Link> e clique num ticker aprovado.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={`${styles.container} ${styles.band}`}>
      <header className={styles.head}>
        <h1 className={styles.title}>{tickers.join(' · ')}</h1>
        <div className={styles.toolbar}>
          <span className={styles.count}>
            {tickers.length} {tickers.length === 1 ? 'papel' : 'papéis'}
          </span>
          {analyses.length > 1 ? (
            <div className={styles.modes} role="group" aria-label="Como mostrar">
              <button
                type="button"
                className={mode === 'compare' ? `${styles.mode} ${styles.modeActive}` : styles.mode}
                aria-pressed={mode === 'compare'}
                onClick={() => setChosenMode('compare')}
              >
                comparar
              </button>
              <button
                type="button"
                className={mode === 'cards' ? `${styles.mode} ${styles.modeActive}` : styles.mode}
                aria-pressed={mode === 'cards'}
                onClick={() => setChosenMode('cards')}
              >
                cartões
              </button>
            </div>
          ) : null}
          {STATIC_SITE ? null : (
            <label className={aiAvailable ? styles.option : `${styles.option} ${styles.optionOff}`}>
              <input
                type="checkbox"
                checked={ai}
                disabled={!aiAvailable}
                onChange={(e) => router.replace(analysisHref(tickers, e.target.checked))}
              />
              <span>
                {aiAvailable ? 'leitura por IA' : 'leitura por IA indisponível — defina ANTHROPIC_API_KEY'}
              </span>
            </label>
          )}
        </div>
      </header>

      {loading ? (
        <div className={styles.loading} role="status">
          <span className={styles.pulse} aria-hidden="true" />
          consultando as quatro fontes…
        </div>
      ) : (
        <div className={styles.results}>
          {overlaps.map((overlap) => (
            <p key={overlap} className={styles.overlap} role="note">
              <span className="tag">desempate</span> {overlap}
            </p>
          ))}
          {failures.map((failure) => (
            <p key={failure.ticker} className={styles.error} role="alert">
              <span className={styles.errorTicker}>{failure.ticker}</span>
              {failure.message}
            </p>
          ))}
          {mode === 'compare' ? (
            <div className={styles.compare}>
              <Compare analyses={analyses} />
            </div>
          ) : (
            analyses.map((analysis, i) => (
              <div key={analysis.ticker} style={{ '--card-order': i } as CSSProperties}>
                <Card analysis={analysis} />
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
