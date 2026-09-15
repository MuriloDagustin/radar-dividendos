'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { analysisHref, splitTickers } from '@/app/tickers';
import { STATIC_SITE } from '@/app/mode';
import styles from './search.module.css';

const PLACEHOLDER = STATIC_SITE ? 'HGLG11 KNRI11 XPML11' : 'TAEE11 ITSA4 MXRF11';

/**
 * The one way into an analysis, in the header on every route and again, larger, on the home
 * hero. Submitting navigates: the tickers live in the URL, so the result is shareable and
 * the back button works.
 */
export function TickerSearch({
  variant,
  ai = false,
  initial = '',
}: {
  variant: 'header' | 'hero';
  /** Carried into the URL so the analysis page knows to ask for the AI reading. */
  ai?: boolean;
  initial?: string;
}) {
  const [input, setInput] = useState(initial);
  const router = useRouter();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const tickers = splitTickers(input);
    if (tickers.length === 0) return;
    router.push(analysisHref(tickers, ai));
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
        onChange={(e) => setInput(e.target.value)}
        placeholder={PLACEHOLDER}
        aria-label="Tickers da B3, separados por espaço"
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="characters"
      />
      <button className={styles.submit} type="submit">
        Analisar
      </button>
    </form>
  );
}
