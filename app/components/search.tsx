'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { analysisHref, splitTickers } from '@/app/tickers';
import { STATIC_SITE } from '@/app/mode';
import styles from './search.module.css';
import { useLocalData } from './local-store';

const PLACEHOLDER = STATIC_SITE ? 'HGLG11 KNRI11 XPML11' : 'TAEE11 ITSA4 MXRF11';

/**
 * The one way into an analysis, in the header on every route and again, larger, on the home
 * hero. Submitting navigates: the tickers live in the URL, so the result is shareable and
 * the back button works.
 */
export function TickerSearch({
  variant,
  initial = '',
}: {
  variant: 'header' | 'hero';
  initial?: string;
}) {
  const listId = useId();
  const { data } = useLocalData();
  const known = data.catalog.map(item => [item.ticker, item.name ?? item.ticker] as [string, string]);
  const [error, setError] = useState('');
  const [input, setInput] = useState(initial);
  const router = useRouter();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const match = known.find(([, name]) => name.toLocaleLowerCase('pt-BR') === input.trim().toLocaleLowerCase('pt-BR'));
    const tickers = match ? [match[0]] : splitTickers(input);
    if (tickers.length === 0) return;
    if (tickers.some(t => !/^[A-Z]{4}\d{1,2}$/.test(t))) { setError('Escolha uma sugestão ou informe tickers válidos, separados por espaço.'); return; }
    setError('');
    router.push(analysisHref(tickers));
  }

  return (
    <form
      className={variant === 'hero' ? `${styles.form} ${styles.hero}` : styles.form}
      onSubmit={onSubmit}
      role="search"
    >
      <input
        className={styles.field}
        value={input}
        onChange={(e) => { setInput(e.target.value); setError(''); }}
        placeholder={variant === 'hero' ? 'Ticker ou nome · ex.: Taesa' : PLACEHOLDER}
        list={listId}
        aria-label="Ticker ou nome do ativo, tickers separados por espaço"
        aria-invalid={!!error}
        aria-describedby={error ? `${listId}-error` : undefined}
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="characters"
      />
      <datalist id={listId}>{known.map(([ticker, name]) => <option key={ticker} value={ticker}>{name}</option>)}{[...new Set([...data.favorites, ...Object.keys(data.observations)])].filter(t => !known.some(([ticker]) => ticker === t)).map(t => <option key={t} value={t} />)}</datalist>
      <button className={styles.submit} type="submit">
        Consultar
      </button>
      {error ? <p id={`${listId}-error`} role="alert">{error}</p> : null}
    </form>
  );
}
