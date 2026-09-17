'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import personal from './personal.module.css';
import { updateLocal } from './local-store';
import type { Criterion } from '@/src/types';
import { formatTimestamp } from '@/app/format';
import { STATIC_SITE } from '@/app/mode';
import { analysisHref } from '@/app/tickers';
import { refreshFeed, useScreenFeed, type FeedFailure, type FeedState } from './screen-feed';
import { SCREENS, type ScreenKey, type ScreenSpec, type ScreenedItem } from './screen-spec';
import { selectedFrom, useSelection } from './selection';
import styles from './screen.module.css';

export function shortCriterion(criterion: Criterion): string {
  return criterion.value ? `${criterion.label} (${criterion.value})` : criterion.label;
}

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

export function Group({
  title,
  tone,
  count,
  note,
  selection,
  children,
}: {
  title: string;
  tone: 'ok' | 'warn' | 'bad' | 'unrel';
  count: number;
  note: string;
  /** Mark or unmark the whole group for the portfolio. */
  selection?: { selectAll: () => void; clearAll: () => void };
  children: React.ReactNode;
}) {
  const toneClass = {
    ok: styles.toneOk,
    warn: styles.toneWarn,
    bad: styles.toneBad,
    unrel: styles.toneUnrel,
  }[tone];
  return (
    <section className={styles.group}>
      <header className={styles.groupHead}>
        <span className={`${styles.dot} ${toneClass}`} aria-hidden="true" />
        <span className={styles.groupTitle}>{title}</span>
        <span className={`mono ${styles.groupCount}`}>{count}</span>
        <span className={styles.groupNote}>{note}</span>
        {selection && count > 0 ? (
          <span className={styles.groupActions}>
            <span className="tag">carteira</span>
            <button type="button" className={styles.groupAction} onClick={selection.selectAll}>
              marcar todos
            </button>
            <button type="button" className={styles.groupAction} onClick={selection.clearAll}>
              desmarcar todos
            </button>
          </span>
        ) : null}
      </header>
      {children}
    </section>
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
        const missing = item.screen.filters.filter((c) => c.status === 'unknown');
        const tiebreakFails = item.screen.tiebreakers.filter((c) => c.status === 'fail');
        return (
          <tr key={item.ticker} className={styles.row}>
            {picker ? (
              <td className={styles.pick}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={picker.isSelected(item.ticker)}
                  onChange={() => picker.toggle(item.ticker)}
                  aria-label={`Incluir ${item.ticker} na carteira`}
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
            <td className={styles.remark}>
              {item.outcome === 'rejected' && item.failedOn ? (
                <span className={styles.remarkBad}>{shortCriterion(item.failedOn)}</span>
              ) : null}
              {missing.length > 0 ? (
                <span className={styles.remarkWarn}>sem dado: {missing.map(shortCriterion).join('; ')}</span>
              ) : null}
              {item.outcome === 'approved' && tiebreakFails.length > 0 ? (
                <span className={styles.remarkDim}>não passa: {tiebreakFails.map(shortCriterion).join('; ')}</span>
              ) : null}
            </td>
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
            {selectable ? <th aria-label="Incluir na carteira" /> : null}
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
        <span className={styles.groupTitle}>Sem análise</span>
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

/**
 * Every paper the screen covers, filled in as the server streams it. Ranking happens here
 * with the same function the CLI uses, so the order is stable while rows are still arriving
 * and identical once they are all in.
 */
function Screen<T extends ScreenedItem>({ spec }: { spec: ScreenSpec<T> }) {
  const state = useScreenFeed(spec);
  useEffect(() => {
    if (!state.report || state.running) return;
    const catalog = state.items.map(item => ({ ticker: item.ticker, name: 'name' in item && typeof item.name === 'string' ? item.name : null }));
    updateLocal(d => ({ ...d, catalog: [...d.catalog.filter(c => !catalog.some(v => v.ticker === c.ticker)), ...catalog] }));
  }, [state.report, state.running, state.items]);
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState('');
  const [sort, setSort] = useState('rank');
  const [minimum, setMinimum] = useState(0);
  const all = useMemo(() => spec.rank(state.items), [spec, state.items]);
  const segments = [...new Set(state.items.map(item => spec.holding(item).segment).filter((s): s is string => !!s))].sort();
  const filter = (items: T[]) => items.filter(item => `${item.ticker} ${'name' in item ? item.name : ''}`.toUpperCase().includes(query.toUpperCase().trim()) && (!segment || spec.holding(item).segment === segment) && item.screen.passed >= minimum).sort((a, b) => {
    if (sort === 'ticker') return a.ticker.localeCompare(b.ticker);
    if (sort === 'yield') return (spec.holding(b).dividendYield12m ?? -Infinity) - (spec.holding(a).dividendYield12m ?? -Infinity);
    if (sort === 'price') return (spec.holding(a).price ?? Infinity) - (spec.holding(b).price ?? Infinity);
    return 0;
  });
  const approved = filter(all.approved), pending = filter(all.pending), rejected = filter(all.rejected);
  const { selection, ...picks } = useSelection(spec.key);
  const selected = selectedFrom(selection, all.approved, all.pending);
  const notes = useMemo(() => spec.notes?.(approved) ?? [], [spec, approved]);
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
        <label>Critérios atendidos<select value={minimum} onChange={e => setMinimum(Number(e.target.value))}>{[0, 1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n === 0 ? 'Todos' : `Pelo menos ${n}`}</option>)}</select></label>
        <label>Ordenar por<select value={sort} onChange={e => setSort(e.target.value)}><option value="rank">Classificação original</option><option value="ticker">Ticker</option><option value="yield">Maior DY</option><option value="price">Menor preço</option></select></label>
        <button onClick={() => { setQuery(''); setSegment(''); setMinimum(0); setSort('rank'); }}>Limpar filtros</button>
      </div>
      <p className={personal.muted}>{approved.length + pending.length + rejected.length} de {state.items.length} ativos exibidos. A seleção permanece ao filtrar.</p>
      <Group
        title="Passaram nos 5 filtros"
        tone="ok"
        count={approved.length}
        note={words.approvedNote}
        selection={{
          selectAll: () => picks.allApproved(approved.map(item => item.ticker)),
          clearAll: () => picks.noApproved(approved.map((item) => item.ticker)),
        }}
      >
        {approved.length > 0 ? (
          <Table spec={spec} selectable>
            <Rows
              items={approved}
              spec={spec}
              numbered
              picker={{ isSelected: picks.isApprovedIn, toggle: picks.toggleApproved }}
            />
          </Table>
        ) : (
          <p className={styles.empty}>{state.running ? 'aguardando…' : words.noneApproved}</p>
        )}
        {notes.map((note) => (
          <p key={note} className={styles.overlap} role="note">
            <span className="tag">desempate</span> {note}
          </p>
        ))}
      </Group>

      <Group
        title="Falta conferir à mão"
        tone="warn"
        count={pending.length}
        note={words.pendingNote}
        selection={{
          selectAll: () => picks.allPending(pending.map((item) => item.ticker)),
          clearAll: () => picks.noPending(pending.map(item => item.ticker)),
        }}
      >
        {pending.length > 0 ? (
          <Table spec={spec} selectable>
            <Rows
              items={pending}
              spec={spec}
              numbered
              picker={{ isSelected: picks.isPendingIn, toggle: picks.togglePending }}
            />
          </Table>
        ) : (
          <p className={styles.empty}>{state.running ? 'aguardando…' : words.none}</p>
        )}
      </Group>

      <Group title={words.rejectedTitle} tone="bad" count={rejected.length} note="o primeiro filtro que reprovou, à direita">
        {rejected.length > 0 ? (
          <details className={styles.details}>
            <summary className={styles.summary}>{words.rejectedShow(rejected.length)}</summary>
            <Table spec={spec}>
              <Rows items={rejected} spec={spec} numbered={false} />
            </Table>
          </details>
        ) : (
          <p className={styles.empty}>{state.running ? 'aguardando…' : words.none}</p>
        )}
      </Group>

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
            montar carteira →
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
