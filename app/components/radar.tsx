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
import { segmentOverlaps } from '@/src/fund-screen';
import type { Analysis } from '@/src/types';
import { STATIC_ONLY_SCREEN, STATIC_SITE, analysisUrl } from '@/app/mode';
import { Card } from './card';
import { Legend } from './legend';
import { Mark } from './mark';
import { MarketScreenView } from './screen';
import { StockScreenView } from './stocks';
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

/** Cards for the tickers typed, or one of the market-wide screens — never two at once. */
type View = 'cards' | 'screen' | 'stocks';

function splitTickers(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,;]+/)) {
    const ticker = part.trim().toUpperCase();
    if (ticker) seen.add(ticker);
  }
  return [...seen];
}

async function analyzeTicker(ticker: string, ai: boolean): Promise<Result> {
  try {
    const response = await fetch(analysisUrl(ticker, ai));

    // A static host answers a missing fund with an HTML 404, not with our JSON error.
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

export function Radar({ aiAvailable }: { aiAvailable: boolean }) {
  const [input, setInput] = useState('');
  const [ai, setAi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  // The snapshot site has nothing to type for, so it opens on what it does have: the screen.
  const [view, setView] = useState<View>(STATIC_SITE ? 'screen' : 'cards');
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

  // `?t=TAEE11+ITSA4` makes an analysis shareable and reloadable; `?fiis=1` and `?acoes=1`
  // open the screens.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('fiis') === '1') {
      setView('screen');
      return;
    }
    if (params.get('acoes') === '1') {
      setView('stocks');
      return;
    }
    const tickers = params.get('t');
    if (!tickers) return;
    const withAi = params.get('ia') === '1';
    setInput(tickers.replace(/[,;+]+/g, ' ').trim());
    setAi(withAi);
    setView('cards');
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
    setView('cards');
    void run(raw, ai);
  }

  function openScreen(which: 'screen' | 'stocks') {
    setResults([]);
    setView(which);
    window.history.replaceState(null, '', which === 'screen' ? '?fiis=1' : '?acoes=1');
  }

  /** A ticker picked off the screen table opens its card, as if it had been typed. */
  function pickFromScreen(ticker: string) {
    setInput(ticker);
    submit(ticker);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submit(input);
  }

  function usePreset(tickers: string) {
    setInput(tickers);
    submit(tickers);
  }

  // One fund per segment is the tiebreaker that only a set of funds can answer.
  const overlaps = segmentOverlaps(
    results.flatMap((r) =>
      r.kind === 'analysis' && r.analysis.fund
        ? [{ ticker: r.analysis.ticker, segment: r.analysis.fund.segment }]
        : [],
    ),
  );

  // With nothing to show yet, the hero's right column teaches the ruler.
  const showLegend = view === 'cards' && !loading && results.length === 0;

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <div className={`${styles.container} ${styles.navInner}`}>
          <a className={styles.brand} href="./">
            <Mark className={styles.mark} />
            Radar de Dividendos
          </a>
          <span className={styles.engine}>motor determinístico · sem IA no cálculo</span>
        </div>
      </header>

      <main className={styles.main}>
        <section className={showLegend ? `${styles.hero} ${styles.heroSplit}` : styles.hero}>
          <div className={`${styles.container} ${styles.heroGrid}`}>
            <div className={styles.heroCopy}>
              <h1 className={styles.thesis}>
                Todo número aqui <em>diz de onde veio</em>.
              </h1>
              <p className={styles.sub}>
                Ações e FIIs da B3 lidos de quatro fontes, com a faixa de cada indicador desenhada
                e a procedência de cada número à mostra.
              </p>

              <form className={styles.command} onSubmit={onSubmit}>
                <input
                  ref={field}
                  className={styles.field}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={STATIC_SITE ? 'HGLG11 KNRI11 XPML11' : 'TAEE11 ITSA4 MXRF11'}
                  aria-label="Tickers da B3, separados por espaço"
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="characters"
                />
                <button className={styles.submit} type="submit" disabled={loading}>
                  {loading ? 'Analisando' : 'Analisar'}
                </button>
              </form>

              {STATIC_SITE ? (
                <p className={styles.staticNote}>
                  <span className="tag">instantâneo</span> Versão publicada no GitHub Pages: os
                  dados são um retrato diário gerado por uma GitHub Action, e só os papéis das
                  triagens têm análise pronta. Para consultar qualquer ticker ao vivo, rode o
                  projeto localmente.
                </p>
              ) : null}

              <div className={STATIC_SITE ? styles.hidden : styles.options}>
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
                  <span>
                    {aiAvailable
                      ? 'acrescentar leitura por IA'
                      : 'leitura por IA indisponível — defina ANTHROPIC_API_KEY'}
                  </span>
                </label>
              </div>

              <div className={styles.suggestions}>
                <span className={`tag ${styles.hint}`}>experimente</span>
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
                <span className={styles.divider} aria-hidden="true" />
                <button
                  type="button"
                  className={
                    view === 'screen' ? `${styles.shortcut} ${styles.shortcutActive}` : styles.shortcut
                  }
                  onClick={() => openScreen('screen')}
                  aria-pressed={view === 'screen'}
                >
                  triagem de FIIs · 5 filtros
                </button>
                <button
                  type="button"
                  className={
                    view === 'stocks' ? `${styles.shortcut} ${styles.shortcutActive}` : styles.shortcut
                  }
                  onClick={() => openScreen('stocks')}
                  aria-pressed={view === 'stocks'}
                >
                  triagem de ações · 5 filtros
                </button>
              </div>
            </div>

            {showLegend ? <Legend /> : null}
          </div>
        </section>

        {view === 'screen' ? (
          <section className={`${styles.container} ${styles.band}`}>
            <MarketScreenView onPick={pickFromScreen} />
          </section>
        ) : null}

        {view === 'stocks' ? (
          <section className={`${styles.container} ${styles.band}`}>
            <StockScreenView onPick={pickFromScreen} />
          </section>
        ) : null}

        {view === 'cards' && loading ? (
          <section className={`${styles.container} ${styles.band}`}>
            <div className={styles.loading} role="status">
              <span className={styles.pulse} aria-hidden="true" />
              consultando as quatro fontes…
            </div>
          </section>
        ) : null}

        {view === 'cards' && !loading && results.length > 0 ? (
          <section className={`${styles.container} ${styles.band}`}>
            <div className={styles.results}>
              {overlaps.map((overlap) => (
                <p key={overlap} className={styles.overlap} role="note">
                  <span className="tag">desempate</span> {overlap}
                </p>
              ))}
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
          </section>
        ) : null}
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.container} ${styles.footerInner}`}>
          <span className={styles.footerBrand}>
            <Mark className={styles.mark} />
            Radar de Dividendos
          </span>
          <p className={styles.footerText}>
            Fontes: <a href="https://brapi.dev">brapi.dev</a>,{' '}
            <a href="https://investidor10.com.br">Investidor10</a>,{' '}
            <a href="https://statusinvest.com.br">StatusInvest</a> e{' '}
            <a href="https://www.fundamentus.com.br">Fundamentus</a> · cache local de 12h
          </p>
          <p className={styles.footerText}>
            Ferramenta educacional — confira os dados na fonte. Não é recomendação de investimento.
          </p>
        </div>
      </footer>
    </div>
  );
}
