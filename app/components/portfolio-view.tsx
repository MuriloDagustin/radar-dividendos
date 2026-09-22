'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { splitTickers } from '@/app/tickers';
import { PortfolioBuilder } from './portfolio';
import { useScreenFeed } from './screen-feed';
import { SCREENS, type ScreenKey, type ScreenSpec, type ScreenedItem } from './screen-spec';
import { ScreenConsole } from './screen-view';
import styles from './screen.module.css';
import { SavedSimulations } from './saved-simulations';

function Wallet<T extends ScreenedItem>({ spec, tickers }: { spec: ScreenSpec<T>; tickers: string[] }) {
  const state = useScreenFeed(spec);
  const key = tickers.join(',');

  const { chosen, pending } = useMemo(() => {
    const wanted = new Set(tickers);
    const chosen = state.items.filter(item => wanted.has(item.ticker)).sort((a, b) => a.ticker.localeCompare(b.ticker));
    const pending = new Set<string>();
    return { chosen, pending };
    // `key` stands for the ticker list; `tickers` is a fresh array on every render.
  }, [spec, state.items, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const holdings = useMemo(() => chosen.map(spec.holding), [spec, chosen]);

  return (
    <div className={styles.view}>
      <header className={styles.head}>
        <h1 className={styles.title}>Simulação aritmética</h1>
        <p className={styles.lede}>
          Os {spec.words.items} que você marcou na <Link href={spec.path}>{spec.title}</Link>, com o valor
          e as premissas que você informar: quantas {spec.words.shares} de cada caberiam, o DY passado
          aplicado a elas e o efeito de reinvestir.
        </p>
      </header>

      {state.running || state.error ? <ScreenConsole spec={spec} state={state} /> : null}

      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : chosen.length === 0 ? (
        <p className={styles.empty}>
          {state.running
            ? `esperando a consulta carregar os ${spec.words.items} selecionados…`
            : `nenhum dos ${spec.words.items} selecionados está nesta consulta`}
        </p>
      ) : (
        <PortfolioBuilder
          holdings={holdings}
          pending={pending}
          words={spec.words}
          backHref={spec.path}
        />
      )}
    </div>
  );
}

function Empty() {
  return (
    <div className={styles.view}>
      <header className={styles.head}>
        <h1 className={styles.title}>Simulação aritmética</h1>
        <p className={styles.lede}>
          Marque os papéis numa das consultas e clique em <strong>simular com a seleção</strong>: aqui eles
          entram em um cálculo hipotético com premissas suas — quantas cotas caberiam, o DY passado
          aplicado a elas e o efeito de reinvestir.
        </p>
      </header>
      <SavedSimulations />
      <p className={styles.empty}>
        nada selecionado ainda — comece pela <Link href="/fiis">consulta de FIIs</Link> ou pela{' '}
        <Link href="/acoes">consulta de ações</Link>
      </p>
    </div>
  );
}

/** The selection travels in the URL, so a simulation is as shareable as an analysis. */
export function PortfolioPage() {
  const params = useSearchParams();
  const kind: ScreenKey = params.get('papel') === 'acoes' ? 'acoes' : 'fiis';
  const tickers = splitTickers(params.get('t') ?? '');

  if (tickers.length === 0) return <Empty />;
  return kind === 'fiis' ? (
    <Wallet spec={SCREENS.fiis} tickers={tickers} />
  ) : (
    <Wallet spec={SCREENS.acoes} tickers={tickers} />
  );
}
