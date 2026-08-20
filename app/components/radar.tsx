'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import type { Analysis } from '@/src/types';
import { Card } from './card';
import { Legend } from './legend';
import styles from './radar.module.css';

const PRESETS: { label: string; tickers: string }[] = [
  { label: 'transmissão', tickers: 'TAEE11 TRPL4' },
  { label: 'bancos', tickers: 'BBAS3 ITSA4' },
  { label: 'FIIs', tickers: 'MXRF11 HGLG11' },
];

interface Failure {
  ticker: string;
  message: string;
}

type Result = { kind: 'analysis'; analysis: Analysis } | { kind: 'failure'; failure: Failure };

function splitTickers(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,;]+/)) {
    const ticker = part.trim().toUpperCase();
    if (ticker) seen.add(ticker);
  }
  return [...seen];
}

async function analyzeTicker(ticker: string, ai: boolean): Promise<Result> {
  const url = `/api/analise/${encodeURIComponent(ticker)}${ai ? '?ia=1' : ''}`;
  try {
    const response = await fetch(url);
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

export function Radar({ aiAvailable }: { aiAvailable: boolean }) {
  const [input, setInput] = useState('');
  const [ai, setAi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const field = useRef<HTMLInputElement>(null);
  const aiId = useId();

  const run = useCallback(
    async (raw: string, withAi: boolean) => {
      const tickers = splitTickers(raw);
      if (tickers.length === 0) {
        field.current?.focus();
        return;
      }

      setLoading(true);
      // One request per ticker, in parallel: a slow source must not hold up other papers.
      const next = await Promise.all(tickers.map((t) => analyzeTicker(t, withAi && aiAvailable)));
      setResults(next);
      setLoading(false);
    },
    [aiAvailable],
  );

  // `?t=TAEE11+ITSA4` makes an analysis shareable and reloadable.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tickers = params.get('t');
    if (!tickers) return;
    const withAi = params.get('ia') === '1';
    setInput(tickers.replace(/[,;+]+/g, ' ').trim());
    setAi(withAi);
    void run(tickers, withAi);
  }, [run]);

  function recordInUrl(tickers: string[], withAi: boolean) {
    const params = new URLSearchParams({ t: tickers.join(' ') });
    if (withAi) params.set('ia', '1');
    window.history.replaceState(null, '', `?${params.toString()}`);
  }

  function submit(raw: string) {
    const tickers = splitTickers(raw);
    if (tickers.length > 0) recordInUrl(tickers, ai && aiAvailable);
    void run(raw, ai);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submit(input);
  }

  function usePreset(tickers: string) {
    setInput(tickers);
    submit(tickers);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brand}>Radar de Dividendos</span>
        <span className={`tag ${styles.engine}`}>motor determinístico · sem IA no cálculo</span>
      </header>

      <h1 className={styles.thesis}>
        Todo número aqui <em>diz de onde veio</em>.
      </h1>
      <p className={styles.sub}>
        Ações e FIIs da B3 lidos de quatro fontes, com a faixa de cada indicador desenhada e a
        procedência de cada número à mostra.
      </p>

      <form className={styles.command} onSubmit={onSubmit}>
        <div className={styles.fieldWrap}>
          <span className={styles.caret} aria-hidden="true">
            &gt;
          </span>
          <input
            ref={field}
            className={styles.field}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="TAEE11 ITSA4 MXRF11"
            aria-label="Tickers da B3, separados por espaço"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="characters"
          />
        </div>
        <button className={styles.submit} type="submit" disabled={loading}>
          {loading ? 'Analisando' : 'Analisar'}
        </button>
      </form>

      <div className={styles.options}>
        <label
          className={aiAvailable ? styles.option : `${styles.option} ${styles.optionOff}`}
          htmlFor={aiId}
        >
          <input
            id={aiId}
            type="checkbox"
            checked={ai && aiAvailable}
            disabled={!aiAvailable}
            onChange={(e) => setAi(e.target.checked)}
          />
          <span className="tag">
            {aiAvailable
              ? 'acrescentar leitura por IA'
              : 'leitura por IA indisponível — defina ANTHROPIC_API_KEY'}
          </span>
        </label>
      </div>

      <div className={styles.suggestions}>
        <span className="tag">experimente</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={styles.shortcut}
            onClick={() => usePreset(preset.tickers)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.results}>
          <div className={`${styles.loading} tag`}>consultando as quatro fontes…</div>
        </div>
      ) : null}

      {!loading && results.length === 0 ? <Legend /> : null}

      {!loading && results.length > 0 ? (
        <div className={styles.results}>
          {results.map((result, i) =>
            result.kind === 'analysis' ? (
              <div key={result.analysis.ticker} style={{ '--card-order': i } as CSSProperties}>
                <Card analysis={result.analysis} />
              </div>
            ) : (
              <p key={result.failure.ticker} className={styles.error} role="alert">
                <span className={styles.errorTicker}>{result.failure.ticker}</span>
                {result.failure.message}
              </p>
            ),
          )}
        </div>
      ) : null}

      <footer className={`tag ${styles.footer}`}>
        <span>
          Fontes: <a href="https://brapi.dev">brapi.dev</a>,{' '}
          <a href="https://investidor10.com.br">Investidor10</a>,{' '}
          <a href="https://statusinvest.com.br">StatusInvest</a> e{' '}
          <a href="https://www.fundamentus.com.br">Fundamentus</a> · cache local de 12h
        </span>
        <span>
          Ferramenta educacional — confira os dados na fonte. Não é recomendação de investimento.
        </span>
      </footer>
    </div>
  );
}
