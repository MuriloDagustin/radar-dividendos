'use client';

import type { ReactNode } from 'react';
import { type ScreenedFund, type Rankable, rank } from '@/src/fund-market';
import { segmentOverlaps } from '@/src/fund-screen';
import type { Holding } from '@/src/portfolio';
import { rankStocks, type ScreenedStock } from '@/src/stock-market';
import { CATEGORY_NAME, type Criterion, type ValueFormat } from '@/src/types';
import { VERDICT_LABEL, formatValue } from '@/app/format';
import { screenUrl, stockScreenUrl } from '@/app/mode';
import type { FeedEvent, Progress } from './screen-feed';
import styles from './screen.module.css';

export type ScreenKey = 'fiis' | 'acoes';

/** Everything the table reads off a row, whichever screen produced it. */
export interface ScreenedItem extends Rankable {
  failedOn: Criterion | null;
}

export interface Column<T> {
  head: string;
  /** Numeric columns are right-aligned and set in the mono face. */
  numeric?: boolean;
  cellClass?: (item: T) => string | undefined;
  cell: (item: T) => ReactNode;
}

/** Singular and plural of everything the two screens word differently. */
export interface Words {
  item: string;
  items: string;
  share: string;
  shares: string;
  group: string;
  none: string;
  noneApproved: string;
  approvedNote: string;
  pendingNote: string;
  rejectedTitle: string;
  rejectedShow: (count: number) => string;
  failedNote: string;
}

export interface ScreenSpec<T extends ScreenedItem> {
  key: ScreenKey;
  path: string;
  title: string;
  lede: ReactNode;
  url: () => string;
  /** The listing the run reads before it can say how many candidates there are. */
  loadingList: string;
  universeLine: (progress: Progress) => ReactNode;
  normalize: (raw: unknown) => FeedEvent<T>;
  rank: (items: T[]) => { approved: T[]; pending: T[]; rejected: T[] };
  columns: Column<T>[];
  /** Remarks about the approved set as a whole, not about any one row. */
  notes?: (approved: T[]) => string[];
  holding: (item: T) => Holding;
  words: Words;
}

function numberColumn<T>(head: string, pick: (item: T) => number | null, format: ValueFormat): Column<T> {
  return {
    head,
    numeric: true,
    cellClass: (item) => (pick(item) === null ? styles.numEmpty : styles.num),
    cell: (item) => formatValue(pick(item), format),
  };
}

function tiebreakColumn<T extends ScreenedItem>(): Column<T> {
  return {
    head: 'desempate',
    numeric: true,
    cellClass: () => styles.tiebreak,
    cell: (item) => (
      <span className={item.tiebreakersPassed === item.screen.tiebreakers.length ? styles.tiebreakFull : ''}>
        {item.tiebreakersPassed}/{item.screen.tiebreakers.length}
      </span>
    ),
  };
}

const FUNDS: ScreenSpec<ScreenedFund> = {
  key: 'fiis',
  path: '/fiis',
  title: 'Triagem de FIIs',
  lede: 'Todos os fundos da B3 com patrimônio acima de R$ 1 bi, passados pelos 5 filtros. O mesmo motor do cartão, fundo por fundo — clique num ticker para abrir a análise completa.',
  url: screenUrl,
  loadingList: 'lendo a lista de fundos no Fundamentus…',
  universeLine: (p) => (
    <>
      {p.universe} fundos na lista · {p.skipped} abaixo de R$ 1 bi · {p.candidates} analisados
    </>
  ),
  normalize: (raw) => {
    const event = raw as { type: string; done: number } & Record<string, unknown>;
    return event.type === 'fund'
      ? { type: 'item', done: event.done, item: event.fund as ScreenedFund }
      : (event as unknown as FeedEvent<ScreenedFund>);
  },
  rank,
  columns: [
    { head: 'segmento', cellClass: () => styles.segment, cell: (f) => f.segment ?? '—' },
    numberColumn('P/VP', (f) => f.priceToBook, 'multiple'),
    numberColumn('DY 12m', (f) => f.dividendYield12m, 'percent'),
    numberColumn('patrimônio', (f) => f.netWorth, 'currency'),
    numberColumn('vacância', (f) => f.vacancy, 'percent'),
    numberColumn('paga/FFO', (f) => f.payoutFfo, 'percent'),
    tiebreakColumn(),
  ],
  notes: (approved) => segmentOverlaps(approved.map((f) => ({ ticker: f.ticker, segment: f.segment }))),
  holding: (f) => f,
  words: {
    item: 'fundo',
    items: 'fundos',
    share: 'cota',
    shares: 'cotas',
    group: 'segmento',
    none: 'nenhum',
    noneApproved: 'nenhum fundo passou em todos os filtros hoje',
    approvedNote: 'ordenados pelo desempate, depois pelo desconto',
    pendingNote:
      'nenhum filtro reprovou, mas faltou dado nas fontes — marque para levar à carteira por sua conta',
    rejectedTitle: 'Reprovados',
    rejectedShow: (count) => `mostrar os ${count} reprovados`,
    failedNote: 'as fontes não responderam para estes',
  },
};

const STOCKS: ScreenSpec<ScreenedStock> = {
  key: 'acoes',
  path: '/acoes',
  title: 'Triagem de ações',
  lede: 'Toda ação da B3 que negocia acima de R$ 5 mi por dia, uma classe por empresa, passada pelos 5 filtros: ROE, dívida, margem, crescimento e liquidez. Indicador é filtro, não decisão — o que sobra é onde começa a leitura do release. Clique num ticker para abrir a análise completa.',
  url: stockScreenUrl,
  loadingList: 'lendo a lista de ações no Fundamentus…',
  universeLine: (p) => (
    <>
      {p.universe} ações na lista · {p.skipped} fora por liquidez ou classe repetida · {p.candidates}{' '}
      analisadas
    </>
  ),
  normalize: (raw) => {
    const event = raw as { type: string; done: number } & Record<string, unknown>;
    return event.type === 'stock'
      ? { type: 'item', done: event.done, item: event.stock as ScreenedStock }
      : (event as unknown as FeedEvent<ScreenedStock>);
  },
  rank: rankStocks,
  columns: [
    {
      head: 'setor',
      cellClass: () => styles.segment,
      cell: (s) => (
        <>
          {s.sector ?? s.name ?? '—'}
          <span className={styles.category}> · {CATEGORY_NAME[s.category]}</span>
        </>
      ),
    },
    numberColumn('ROE', (s) => s.roe, 'percent'),
    numberColumn('dív/EBITDA', (s) => s.netDebtToEbitda, 'multiple'),
    numberColumn('margem líq.', (s) => s.netMargin, 'percent'),
    numberColumn('receita 5a', (s) => s.revenueCagr5y, 'percent'),
    numberColumn('liquidez/dia', (s) => s.liquidity, 'currency'),
    numberColumn('DY 12m', (s) => s.dividendYield12m, 'percent'),
    tiebreakColumn(),
    { head: 'veredito', cellClass: () => styles.verdict, cell: (s) => VERDICT_LABEL[s.verdict] },
  ],
  holding: (s) => ({
    ticker: s.ticker,
    segment: s.sector,
    price: s.price,
    dividendYield12m: s.dividendYield12m,
    tiebreakersPassed: s.tiebreakersPassed,
  }),
  words: {
    item: 'ação',
    items: 'ações',
    share: 'ação',
    shares: 'ações',
    group: 'setor',
    none: 'nenhuma',
    noneApproved: 'nenhuma ação passou em todos os filtros hoje',
    approvedNote: 'ordenadas pelo desempate, depois pelo ROIC',
    pendingNote:
      'nenhum filtro reprovou, mas faltou dado ou o filtro não se aplica — bancos caem aqui pela dívida',
    rejectedTitle: 'Reprovadas',
    rejectedShow: (count) => `mostrar as ${count} reprovadas`,
    failedNote: 'as fontes não responderam para estas',
  },
};

export const SCREENS = { fiis: FUNDS, acoes: STOCKS };
