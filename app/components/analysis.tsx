'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Analysis } from '@/src/types';
import { publicAnalysis } from '@/src/public-data';
import { STATIC_ONLY_SCREEN, STATIC_SITE, analysisUrl } from '@/app/mode';
import { splitTickers } from '@/app/tickers';
import { Card } from './card';
import { Compare } from './compare';
import { Legend } from './legend';
import { AnalysisTools } from './analysis-tools';
import { observeAnalysis } from './local-store';
import styles from './analysis.module.css';

interface Failure {
  ticker: string;
  message: string;
}

type Result = { kind: 'analysis'; analysis: Analysis } | { kind: 'failure'; failure: Failure };

async function analyzeTicker(ticker: string): Promise<Result> {
  try {
    const response = await fetch(analysisUrl(ticker, false));

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

    return { kind: 'analysis', analysis: publicAnalysis(body as Analysis) };
  } catch {
    return {
      kind: 'failure',
      failure: { ticker, message: 'Não foi possível falar com o servidor. Verifique a conexão.' },
    };
  }
}

/** The cards for the tickers in the URL — which is what makes an analysis shareable. */
export function AnalysisView() {
  const params = useSearchParams();
  const query = params.get('t') ?? '';
  const tickers = useMemo(() => splitTickers(query), [query]);
  const key = tickers.join(' ');

  const generation = useRef(0);
  const [retrying, setRetrying] = useState<string[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(tickers.length > 0);
  /** Null until the reader chooses: more than one paper opens compared, one opens as a card. */
  const [chosenMode, setChosenMode] = useState<'compare' | 'cards' | null>(null);

  useEffect(() => {
    generation.current += 1;
    setRetrying([]);
    if (tickers.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }

    let current = true;
    setLoading(true);
    setResults([]);
    let remaining = tickers.length;
    for (const ticker of tickers) {
      void analyzeTicker(ticker).then(result => {
        if (!current) return;
        if (result.kind === 'analysis') observeAnalysis(result.analysis);
        setResults(previous => [...previous, result].sort((a, b) => tickers.indexOf(a.kind === 'analysis' ? a.analysis.ticker : a.failure.ticker) - tickers.indexOf(b.kind === 'analysis' ? b.analysis.ticker : b.failure.ticker)));
        remaining -= 1;
        if (remaining === 0) setLoading(false);
      });
    }

    return () => {
      current = false;
      generation.current += 1;
    };
    // `key` is the ticker list; `tickers` is a fresh array on every render.
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const analyses = results.flatMap((r) => (r.kind === 'analysis' ? [r.analysis] : []));
  const failures = results.flatMap((r) => (r.kind === 'failure' ? [r.failure] : []));
  const mode = chosenMode ?? (analyses.length > 1 ? 'compare' : 'cards');

  if (tickers.length === 0) {
    return (
      <section className={`${styles.container} ${styles.band}`}>
        <header className={styles.head}>
          <h1 className={styles.title}>Consultar indicadores</h1>
          <p className={styles.lede}>
            Digite um ou mais tickers da B3 na busca acima. Veja os valores publicados e a procedência dos dados.
          </p>
        </header>
        <div className={styles.emptyGrid}>
          <Legend />
          <p className={styles.emptyNote}>
            Sem um papel em mente? Comece pela <Link href="/fiis">consulta de FIIs</Link> ou pela{' '}
            <Link href="/acoes">consulta de ações</Link> e escolha um ticker.
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

        </div>
      </header>

      {loading ? (
        <div className={styles.loading} role="status">
          <span className={styles.pulse} aria-hidden="true" />
          consultando as quatro fontes…
        </div>
      ) : null}
        <div className={styles.results}>
          {failures.map((failure) => (
            <p key={failure.ticker} className={styles.error} role="alert">
              <span className={styles.errorTicker}>{failure.ticker}</span>
              {failure.message}
              <button type="button" disabled={retrying.includes(failure.ticker)} onClick={async () => {
                const version = generation.current;
                setRetrying(previous => [...previous, failure.ticker]);
                const result = await analyzeTicker(failure.ticker);
                if (generation.current !== version) return;
                setRetrying(previous => previous.filter(t => t !== failure.ticker));
                if (result.kind === 'analysis') observeAnalysis(result.analysis);
                setResults(previous => [...previous.filter(r => r.kind !== 'failure' || r.failure.ticker !== failure.ticker), result]);
              }}>{retrying.includes(failure.ticker) ? 'Consultando…' : 'Tentar novamente'}</button>
            </p>
          ))}
          {mode === 'compare' ? (
            <div className={styles.compare}>
              <Compare analyses={analyses} />
              {analyses.map(analysis => <AnalysisTools key={analysis.ticker} analysis={analysis} />)}
            </div>
          ) : (
            analyses.map((analysis, i) => (
              <div key={analysis.ticker} style={{ '--card-order': i } as CSSProperties}>
                <AnalysisTools analysis={analysis} />
                <Card analysis={analysis} />
              </div>
            ))
          )}
        </div>
    </section>
  );
}
