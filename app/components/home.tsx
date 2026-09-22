'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { STATIC_SITE } from '@/app/mode';
import { analysisHref, splitTickers } from '@/app/tickers';
import { Legend } from './legend';
import { TickerSearch } from './search';
import styles from './home.module.css';

const ENTRIES = [
  {
    href: '/fiis',
    title: 'Explorar FIIs',
    lede: 'Consulte a cobertura de fundos com patrimônio acima de R$ 1 bilhão e defina seus limites numéricos.',
    action: 'consultar fundos',
  },
  {
    href: '/acoes',
    title: 'Explorar ações',
    lede: 'Toda empresa que negocia acima de R$ 5 mi por dia, uma classe por emissor, com indicadores de ROE, dívida, margem, crescimento e liquidez.',
    action: 'consultar ações',
  },
];

function LegacyRedirect() {
  const params = useSearchParams();
  const router = useRouter();

  // Links shared before the app had routes still point at `/?fiis=1` and `/?t=…`.
  useEffect(() => {
    if (params.get('fiis') === '1') router.replace('/fiis');
    else if (params.get('acoes') === '1') router.replace('/acoes');
    else {
      const tickers = splitTickers(params.get('t') ?? '');
      if (tickers.length > 0) router.replace(analysisHref(tickers, params.get('ia') === '1'));
    }
  }, [params, router]);

  return null;
}

export function Home() {

  return (
    <>
      <Suspense fallback={null}><LegacyRedirect /></Suspense>
      <section className={styles.hero}>
        <div className={`${styles.container} ${styles.heroGrid}`}>
          <div className={styles.copy}>
            <h1 className={styles.thesis}>
              Todo número aqui <em>diz de onde veio</em>.
            </h1>
            <p className={styles.sub}>
              Ações e FIIs da B3 lidos de quatro fontes, com valores publicados e a
              procedência de cada número à mostra.
            </p>

            <div className={styles.command}>
              <TickerSearch variant="hero" />
            </div>

            {STATIC_SITE ? (
              <p className={styles.staticNote}>
                <span className="tag">instantâneo</span> Versão publicada no GitHub Pages: os dados são
                um retrato diário gerado por uma GitHub Action, e só os papéis da cobertura têm consulta
                pronta. Para consultar qualquer ticker ao vivo, rode o projeto localmente.
              </p>
            ) : null}
          </div>

          <Legend />
        </div>
      </section>

      <section className={`${styles.container} ${styles.entries}`} aria-label="Triagens de mercado">
        {ENTRIES.map((entry) => (
          <Link key={entry.href} className={styles.entry} href={entry.href}>
            <span className="tag">filtros definidos por você</span>
            <h2 className={styles.entryTitle}>{entry.title}</h2>
            <p className={styles.entryLede}>{entry.lede}</p>
            <span className={styles.entryAction}>{entry.action} →</span>
          </Link>
        ))}
        <p className={styles.entryNote}>
          Escolha os ativos que deseja consultar e explore uma <Link href="/carteira">simulação</Link>
          com premissas definidas por você.
        </p>
      </section>
    </>
  );
}
