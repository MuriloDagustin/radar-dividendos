'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mark } from './mark';
import { TickerSearch } from './search';
import styles from './shell.module.css';

const NAV = [
  { href: '/analise', label: 'Análise' },
  { href: '/fiis', label: 'FIIs' },
  { href: '/acoes', label: 'Ações' },
  { href: '/carteira', label: 'Carteira' },
];

/** The frame every route shares: brand, the four destinations, the search, the disclaimer. */
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const home = pathname === '/';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={`${styles.container} ${styles.headerInner}`}>
          <Link className={styles.brand} href="/">
            <Mark className={styles.mark} />
            Radar de Dividendos
          </Link>

          <nav className={styles.nav} aria-label="Seções">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  className={active ? `${styles.link} ${styles.linkActive}` : styles.link}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* On the home page the hero carries the search; two of them would be one too many. */}
          {home ? null : (
            <div className={styles.search}>
              <TickerSearch variant="header" />
            </div>
          )}
        </div>
      </header>

      <main className={styles.main}>{children}</main>

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
