'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import personal from './personal.module.css';
import { updateLocal } from './local-store';
import { matchesRange, validRange, type NumericRange } from '@/src/query-filters';
import { formatTimestamp } from '@/app/format';
import { STATIC_SITE } from '@/app/mode';
import { analysisHref } from '@/app/tickers';
import { refreshFeed, useScreenFeed, type FeedFailure, type FeedState } from './screen-feed';
import { SCREENS, type ScreenKey, type ScreenSpec, type ScreenedItem } from './screen-spec';
import { selectedFrom, useSelection } from './selection';
import styles from './screen.module.css';

/** The run's status line and progress bar, in the terminal-like console both screens share. */
export function Console({
  status,
  counter,
  finishedAt,
  running,
  percent,
}: {
  status: React.ReactNode;
  counter: React.ReactNode;
  finishedAt: string | null;
  running: boolean;
  percent: number;
}) {
  return (
    <div className={styles.console}>
      <div className={styles.status}>
        <span>{status}</span>
        {running && counter ? <span className={styles.counter}>{counter}</span> : null}
        {finishedAt ? (
          <span className={styles.counter}>
            {STATIC_SITE ? 'instantâneo de' : 'concluída ·'} {formatTimestamp(finishedAt)}
          </span>
        ) : null}
      </div>
      {running ? (
        <div className={styles.bar} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <span className={styles.barFill} style={{ width: `${percent}%` }} />
        </div>
      ) : null}
    </div>
  );
}

/** The console of a run, wired to a feed: the screen and the portfolio both report progress. */
export function ScreenConsole<T extends ScreenedItem>({
  spec,
  state,
}: {
  spec: ScreenSpec<T>;
  state: FeedState<T>;
}) {
  const { progress } = state;
  const percent =
    progress && progress.candidates > 0 ? Math.round((progress.done / progress.candidates) * 100) : 0;

  return (
    <Console
      status={progress ? spec.universeLine(progress) : spec.loadingList}
      counter={
        progress ? (
          <>
            {progress.done}/{progress.candidates}
            {progress.done === 0 ? ' · a primeira vez leva alguns minutos; depois vem do cache' : ''}
          </>
        ) : null
      }
      finishedAt={state.report?.generatedAt ?? null}
      running={state.running}
      percent={percent}
    />
  );
}

export function TickerLink({ ticker, title }: { ticker: string; title?: string }) {
  return (
    <Link className={styles.ticker} href={analysisHref([ticker])} title={title}>
      {ticker}
    </Link>
  );
}

interface Picker {
  isSelected: (ticker: string) => boolean;
  toggle: (ticker: string) => void;
}

function Rows<T extends ScreenedItem>({
  items,
  spec,
  numbered,
  picker,
}: {
  items: T[];
  spec: ScreenSpec<T>;
  numbered: boolean;
  picker?: Picker;
}) {
  return (
    <>
      {items.map((item, i) => {
        return (
          <tr key={item.ticker} className={styles.row}>
            {picker ? (
              <td className={styles.pick}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={picker.isSelected(item.ticker)}
                  onChange={() => picker.toggle(item.ticker)}
                  aria-label={`Selecionar ${item.ticker} para simulação`}
                />
              </td>
            ) : null}
            <td className={styles.index}>{numbered ? i + 1 : ''}</td>
            <td>
              <TickerLink ticker={item.ticker} />
            </td>
            {spec.columns.map((column) => (
              <td key={column.head} className={column.cellClass?.(item)}>
                {column.cell(item)}
              </td>
            ))}

          </tr>
        );
      })}
    </>
  );
}

function Table<T extends ScreenedItem>({
  spec,
  selectable = false,
  children,
}: {
  spec: ScreenSpec<T>;
  selectable?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            {selectable ? <th aria-label="Selecionar para simulação" /> : null}
            <th />
            <th>{spec.words.item}</th>
            {spec.columns.map((column) => (
              <th key={column.head} className={column.numeric ? styles.thNum : undefined}>
                {column.head}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Failures({ failed, note }: { failed: FeedFailure[]; note: string }) {
  if (failed.length === 0) return null;
  return (
    <section className={styles.group}>
      <header className={styles.groupHead}>
        <span className={`${styles.dot} ${styles.toneUnrel}`} aria-hidden="true" />
        <span className={styles.groupTitle}>Dados indisponíveis</span>
        <span className={`mono ${styles.groupCount}`}>{failed.length}</span>
        <span className={styles.groupNote}>{note}</span>
      </header>
      <ul className={styles.failures}>
        {failed.map((failure) => (
          <li key={failure.ticker}>
            <TickerLink ticker={failure.ticker} />
            <span className={styles.failureMessage}>{failure.message.split('\n')[0]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Filter the full available coverage using only the numeric bounds chosen by the user. */
function Screen<T extends ScreenedItem>({ spec }: { spec: ScreenSpec<T> }) {
  const state = useScreenFeed(spec);
  useEffect(() => {
    if (!state.report || state.running) return;
    const catalog = state.items.map(item => ({ ticker: item.ticker, name: 'name' in item && typeof item.name === 'string' ? item.name : null }));
    updateLocal(d => ({ ...d, catalog: [...d.catalog.filter(c => !catalog.some(v => v.ticker === c.ticker)), ...catalog] }));
  }, [state.report, state.running, state.items]);
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState('');
  const [sort, setSort] = useState('ticker');
  const [ranges, setRanges] = useState<Record<string, NumericRange>>({});
  const segments = [...new Set(state.items.map(item => spec.holding(item).segment).filter((s): s is string => !!s))].sort();
  const invalid = Object.values(ranges).some(range => !validRange(range));
  const items = state.items.filter(item =>
    `${item.ticker} ${'name' in item ? item.name : ''}`.toUpperCase().includes(query.toUpperCase().trim()) &&
    (!segment || spec.holding(item).segment === segment) &&
    spec.metrics.every(metric => matchesRange(metric.value(item), ranges[metric.key] ?? { min: '', max: '' }))
  ).sort((a, b) => {
    if (sort === 'yield') return (spec.holding(b).dividendYield12m ?? -Infinity) - (spec.holding(a).dividendYield12m ?? -Infinity) || a.ticker.localeCompare(b.ticker);
    if (sort === 'price') return (spec.holding(a).price ?? Infinity) - (spec.holding(b).price ?? Infinity) || a.ticker.localeCompare(b.ticker);
    return a.ticker.localeCompare(b.ticker);
  });
  const { selection, ...picks } = useSelection(spec.key);
  const selected = selectedFrom(selection, state.items, []);
  const { words } = spec;

  return (
    <div className={styles.view} aria-live="polite">
      <header className={styles.head}>
        <div className={styles.headLine}>
          <h1 className={styles.title}>{spec.title}</h1>
          {STATIC_SITE || state.running ? null : (
            <button type="button" className={styles.refresh} onClick={() => refreshFeed(spec)}>
              rodar de novo
            </button>
          )}
        </div>
        <p className={styles.lede}>{spec.lede}</p>
      </header>

      <ScreenConsole spec={spec} state={state} />

      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}

      <div className={personal.toolbar}>
        <label>Buscar ticker ou nome<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Ex.: HGLG11" /></label>
        <label>Setor / segmento<select value={segment} onChange={e => setSegment(e.target.value)}><option value="">Todos</option>{segments.map(s => <option key={s}>{s}</option>)}</select></label>
        <label>Ordenar por<select value={sort} onChange={e => setSort(e.target.value)}><option value="ticker">Ticker (A–Z)</option><option value="yield">DY (decrescente)</option><option value="price">Preço (crescente)</option></select></label>
        <button onClick={() => { setQuery(''); setSegment(''); setRanges({}); setSort('ticker'); }}>Limpar filtros</button>
      </div>
      <section className={personal.panel} aria-label="Seus filtros numéricos">
        <h2>Seus filtros</h2>
        <p>Todos os limites começam vazios. Preencha apenas os critérios que deseja consultar; percentuais são informados em pontos percentuais (ex.: 8 para 8%).</p>
        <div className={personal.grid}>{spec.metrics.map(metric => {
          const range = ranges[metric.key] ?? { min: '', max: '' };
          return <fieldset key={metric.key}><legend>{metric.label}</legend><div className={personal.toolbar}>
            {(['min', 'max'] as const).map(bound => <label key={bound}>{bound === 'min' ? 'Mínimo' : 'Máximo'}<input inputMode="decimal" aria-label={`${metric.label}: ${bound === 'min' ? 'mínimo' : 'máximo'}`} value={range[bound]} aria-invalid={!validRange(range)} placeholder="Sem limite" onChange={e => setRanges(previous => ({ ...previous, [metric.key]: { ...range, [bound]: e.target.value } }))} /></label>)}
          </div></fieldset>;
        })}</div>
        <p>Quando um limite está preenchido, ativos sem esse dado não aparecem no resultado. A ordem é apenas a ordenação escolhida, sem classificação de qualidade.</p>
        {invalid ? <p role="alert">Use números válidos e um mínimo menor ou igual ao máximo.</p> : null}
      </section>
      <p className={personal.muted}>{items.length} de {state.items.length} ativos correspondem aos filtros preenchidos. A seleção permanece ao filtrar.</p>
      <section className={styles.group}>
        <h2>Resultados da consulta</h2>
        <div className={personal.toolbar}>
          <button onClick={() => picks.allApproved(items.map(item => item.ticker))}>Selecionar os resultados visíveis</button>
          <button onClick={() => picks.noApproved(items.map(item => item.ticker))}>Desmarcar os resultados visíveis</button>
        </div>
        {items.length ? <Table spec={spec} selectable><Rows items={items} spec={spec} numbered={false} picker={{ isSelected: picks.isApprovedIn, toggle: picks.toggleApproved }} /></Table> : <p className={styles.empty}>{state.running ? 'Carregando dados…' : 'Nenhum resultado. Ajuste ou limpe os filtros.'}</p>}
      </section>

      <Failures failed={state.failed} note={words.failedNote} />

      {/* The selection follows the reader to the portfolio; the bar is what says so. */}
      {selected.length > 0 ? (
        <div className={styles.pickBar}>
          <span className={styles.pickCount}>
            <span className={`mono ${styles.pickNumber}`}>{selected.length}</span>{' '}
            {selected.length === 1 ? words.item : words.items} {selected.length === 1 ? 'selecionado' : 'selecionados'}
          </span>
          <Link
            className={styles.pickAction}
            href={`/carteira?papel=${spec.key}&t=${selected.map((item) => item.ticker).join(',')}`}
          >
            simular com a seleção →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/** The route passes a key, not a spec: a server component cannot hand functions to the client. */
export function ScreenPage({ kind }: { kind: ScreenKey }) {
  return kind === 'fiis' ? <Screen spec={SCREENS.fiis} /> : <Screen spec={SCREENS.acoes} />;
}
