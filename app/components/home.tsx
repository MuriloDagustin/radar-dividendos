'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { STATIC_SITE } from '@/app/mode';
import { analysisHref, splitTickers } from '@/app/tickers';
import { Legend } from './legend';
import { TickerSearch } from './search';
import styles from './home.module.css';

const PRESETS: { label: string; tickers: string[] }[] = [
  { label: 'transmissão', tickers: ['TAEE11', 'TRPL4'] },
  { label: 'bancos', tickers: ['BBAS3', 'ITSA4'] },
  { label: 'FIIs', tickers: ['MXRF11', 'HGLG11'] },
];

const ENTRIES = [
  {
    href: '/fiis',
    title: 'Triagem de FIIs',
    lede: 'Todos os fundos da B3 acima de R$ 1 bi de patrimônio pelos cinco filtros, do segmento resiliente ao custo total.',
    action: 'ver os fundos aprovados',
  },
  {
    href: '/acoes',
    title: 'Triagem de ações',
    lede: 'Toda empresa que negocia acima de R$ 5 mi por dia, uma classe por emissor, por ROE, dívida, margem, crescimento e liquidez.',
    action: 'ver as ações aprovadas',
  },
];

export function Home({ aiAvailable }: { aiAvailable: boolean }) {
  const [ai, setAi] = useState(false);
  const aiId = useId();
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

  return (
    <>
      <section className={styles.hero}>
        <div className={`${styles.container} ${styles.heroGrid}`}>
          <div className={styles.copy}>
            <h1 className={styles.thesis}>
              Todo número aqui <em>diz de onde veio</em>.
            </h1>
            <p className={styles.sub}>
              Ações e FIIs da B3 lidos de quatro fontes, com a faixa de cada indicador desenhada e a
              procedência de cada número à mostra.
            </p>

            <div className={styles.command}>
              <TickerSearch variant="hero" ai={ai && aiAvailable} />
            </div>

            {STATIC_SITE ? (
              <p className={styles.staticNote}>
                <span className="tag">instantâneo</span> Versão publicada no GitHub Pages: os dados são
                um retrato diário gerado por uma GitHub Action, e só os papéis das triagens têm análise
                pronta. Para consultar qualquer ticker ao vivo, rode o projeto localmente.
              </p>
            ) : (
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
            )}

            <div className={styles.presets}>
              <span className={`tag ${styles.hint}`}>experimente</span>
              {PRESETS.map((preset) => (
                <Link
                  key={preset.label}
                  className={styles.preset}
                  href={analysisHref(preset.tickers, ai && aiAvailable)}
                >
                  {preset.label}
                </Link>
              ))}
            </div>
          </div>

          <Legend />
        </div>
      </section>

      <section className={`${styles.container} ${styles.entries}`} aria-label="Triagens de mercado">
        {ENTRIES.map((entry) => (
          <Link key={entry.href} className={styles.entry} href={entry.href}>
            <span className="tag">5 filtros</span>
            <h2 className={styles.entryTitle}>{entry.title}</h2>
            <p className={styles.entryLede}>{entry.lede}</p>
            <span className={styles.entryAction}>{entry.action} →</span>
          </Link>
        ))}
        <p className={styles.entryNote}>
          Dos aprovados em qualquer das duas triagens sai a <Link href="/carteira">carteira</Link>:
          quantas cotas de cada um, quanto de renda por mês, e o efeito de reinvestir.
        </p>
      </section>
    </>
  );
}
