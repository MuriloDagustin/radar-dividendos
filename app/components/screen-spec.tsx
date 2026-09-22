'use client';

import type { ReactNode } from 'react';
import { type ScreenedFund, type Rankable } from '@/src/fund-market';
import type { Holding } from '@/src/portfolio';
import { type ScreenedStock } from '@/src/stock-market';
import { type Criterion, type ValueFormat } from '@/src/types';
import { formatValue } from '@/app/format';
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
  columns: Column<T>[];
  metrics: { key: string; label: string; value: (item: T) => number | null }[];
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

const FUNDS: ScreenSpec<ScreenedFund> = {
  key: 'fiis',
  path: '/fiis',
  title: 'Explorar FIIs',
  lede: 'Cobertura disponível: fundos com patrimônio acima de R$ 1 bilhão. Escolha seus limites abaixo para consultar os dados. A inclusão nesta lista não representa uma avaliação de qualidade.',
  url: screenUrl,
  loadingList: 'lendo a lista de fundos no Fundamentus…',
  universeLine: (p) => (
    <>
      {p.universe} fundos na lista · {p.skipped} abaixo de R$ 1 bi · {p.candidates} consultados
    </>
  ),
  normalize: (raw) => {
    const event = raw as { type: string; done: number } & Record<string, unknown>;
    return event.type === 'fund'
      ? { type: 'item', done: event.done, item: event.fund as ScreenedFund }
      : (event as unknown as FeedEvent<ScreenedFund>);
  },
  metrics: [
    { key: 'dy', label: 'DY 12m (%)', value: f => f.dividendYield12m === null ? null : f.dividendYield12m * 100 },
    { key: 'pvp', label: 'P/VP', value: f => f.priceToBook },
    { key: 'size', label: 'Patrimônio (R$)', value: f => f.netWorth },
    { key: 'vacancy', label: 'Vacância (%)', value: f => f.vacancy === null ? null : f.vacancy * 100 },
  ],
  columns: [
    { head: 'segmento', cellClass: () => styles.segment, cell: (f) => f.segment ?? '—' },
    numberColumn('P/VP', (f) => f.priceToBook, 'multiple'),
    numberColumn('DY 12m', (f) => f.dividendYield12m, 'percent'),
    numberColumn('patrimônio', (f) => f.netWorth, 'currency'),
    numberColumn('vacância', (f) => f.vacancy, 'percent'),
    numberColumn('paga/FFO', (f) => f.payoutFfo, 'percent'),
  ],
  holding: (f) => f,
  words: {
    item: 'fundo',
    items: 'fundos',
    share: 'cota',
    shares: 'cotas',
    group: 'segmento',
    failedNote: 'as fontes não responderam para estes',
  },
};

const STOCKS: ScreenSpec<ScreenedStock> = {
  key: 'acoes',
  path: '/acoes',
  title: 'Explorar ações',
  lede: 'Cobertura disponível: ações com liquidez acima de R$ 5 milhões por dia, uma classe por empresa. Escolha seus filtros. A cobertura não representa uma seleção recomendada.',
  url: stockScreenUrl,
  loadingList: 'lendo a lista de ações no Fundamentus…',
  universeLine: (p) => (
    <>
      {p.universe} ações na lista · {p.skipped} fora por liquidez ou classe repetida · {p.candidates}{' '}
      consultadas
    </>
  ),
  normalize: (raw) => {
    const event = raw as { type: string; done: number } & Record<string, unknown>;
    return event.type === 'stock'
      ? { type: 'item', done: event.done, item: event.stock as ScreenedStock }
      : (event as unknown as FeedEvent<ScreenedStock>);
  },
  metrics: [
    { key: 'dy', label: 'DY 12m (%)', value: s => s.dividendYield12m === null ? null : s.dividendYield12m * 100 },
    { key: 'roe', label: 'ROE (%)', value: s => s.roe === null ? null : s.roe * 100 },
    { key: 'debt', label: 'Dívida líquida / EBITDA', value: s => s.netDebtToEbitda },
    { key: 'margin', label: 'Margem líquida (%)', value: s => s.netMargin === null ? null : s.netMargin * 100 },
    { key: 'growth', label: 'Receita 5a (%)', value: s => s.revenueCagr5y === null ? null : s.revenueCagr5y * 100 },
    { key: 'liquidity', label: 'Liquidez diária (R$)', value: s => s.liquidity },
  ],
  columns: [
    {
      head: 'setor',
      cellClass: () => styles.segment,
      cell: (s) => (
        <>
          {s.sector ?? s.name ?? '—'}
        </>
      ),
    },
    numberColumn('ROE', (s) => s.roe, 'percent'),
    numberColumn('dív/EBITDA', (s) => s.netDebtToEbitda, 'multiple'),
    numberColumn('margem líq.', (s) => s.netMargin, 'percent'),
    numberColumn('receita 5a', (s) => s.revenueCagr5y, 'percent'),
    numberColumn('liquidez/dia', (s) => s.liquidity, 'currency'),
    numberColumn('DY 12m', (s) => s.dividendYield12m, 'percent'),
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
    failedNote: 'as fontes não responderam para estas',
  },
};

export const SCREENS = { fiis: FUNDS, acoes: STOCKS };
