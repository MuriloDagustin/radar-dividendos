'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  rank,
  type MarketScreen,
  type ScreenEvent,
  type ScreenFailure,
  type ScreenedFund,
} from '@/src/fund-market';
import { segmentOverlaps } from '@/src/fund-screen';
import type { Criterion } from '@/src/types';
import { formatTimestamp, formatValue } from '@/app/format';
import { STATIC_SITE, screenUrl } from '@/app/mode';
import styles from './screen.module.css';

type StreamEvent = ScreenEvent | { type: 'error'; message: string };

interface Progress {
  universe: number;
  candidates: number;
  skipped: number;
  done: number;
}

interface State {
  progress: Progress | null;
  funds: ScreenedFund[];
  failed: ScreenFailure[];
  report: MarketScreen | null;
  error: string | null;
  running: boolean;
}

const INITIAL: State = {
  progress: null,
  funds: [],
  failed: [],
  report: null,
  error: null,
  running: true,
};

function apply(state: State, event: StreamEvent): State {
  switch (event.type) {
    case 'universe':
      return {
        ...state,
        progress: { universe: event.universe, candidates: event.candidates, skipped: event.skipped, done: 0 },
      };
    case 'fund':
      return {
        ...state,
        funds: [...state.funds, event.fund],
        progress: state.progress ? { ...state.progress, done: event.done } : null,
      };
    case 'failure':
      return {
        ...state,
        failed: [...state.failed, event.failure],
        progress: state.progress ? { ...state.progress, done: event.done } : null,
      };
    case 'done':
      return { ...state, report: event.report, running: false };
    case 'error':
      return { ...state, error: event.message, running: false };
  }
}

/** The route answers one JSON object per line; a line is complete only once its newline arrives. */
async function readEvents(response: Response, onEvent: (event: StreamEvent) => void): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('A resposta veio sem corpo.');
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line) as StreamEvent);
      newline = buffer.indexOf('\n');
    }
  }
}

/** The snapshot is a finished report; it lands in the same state a completed stream would. */
function fromReport(report: MarketScreen): State {
  return {
    progress: {
      universe: report.universe,
      candidates: report.candidates,
      skipped: report.skipped,
      done: report.candidates,
    },
    funds: [...report.approved, ...report.pending, ...report.rejected],
    failed: report.failed,
    report,
    error: null,
    running: false,
  };
}

function shortCriterion(criterion: Criterion): string {
  return criterion.value ? `${criterion.label} (${criterion.value})` : criterion.label;
}

function Cell({ value, format }: { value: number | null; format: 'percent' | 'multiple' | 'currency' }) {
  return <td className={value === null ? styles.numEmpty : styles.num}>{formatValue(value, format)}</td>;
}

function FundRows({
  funds,
  numbered,
  onPick,
}: {
  funds: ScreenedFund[];
  numbered: boolean;
  onPick: (ticker: string) => void;
}) {
  return (
    <>
      {funds.map((fund, i) => {
        const missing = fund.screen.filters.filter((c) => c.status === 'unknown');
        const tiebreakFails = fund.screen.tiebreakers.filter((c) => c.status === 'fail');
        return (
          <tr key={fund.ticker} className={styles.row}>
            <td className={styles.index}>{numbered ? i + 1 : ''}</td>
            <td>
              <button type="button" className={styles.ticker} onClick={() => onPick(fund.ticker)}>
                {fund.ticker}
              </button>
            </td>
            <td className={styles.segment}>{fund.segment ?? '—'}</td>
            <Cell value={fund.priceToBook} format="multiple" />
            <Cell value={fund.dividendYield12m} format="percent" />
            <Cell value={fund.netWorth} format="currency" />
            <Cell value={fund.vacancy} format="percent" />
            <Cell value={fund.payoutFfo} format="percent" />
            <td className={styles.tiebreak}>
              <span className={fund.tiebreakersPassed === fund.screen.tiebreakers.length ? styles.tiebreakFull : ''}>
                {fund.tiebreakersPassed}/{fund.screen.tiebreakers.length}
              </span>
            </td>
            <td className={styles.remark}>
              {fund.outcome === 'rejected' && fund.failedOn ? (
                <span className={styles.remarkBad}>{shortCriterion(fund.failedOn)}</span>
              ) : null}
              {missing.length > 0 ? (
                <span className={styles.remarkWarn}>sem dado: {missing.map(shortCriterion).join('; ')}</span>
              ) : null}
              {fund.outcome === 'approved' && tiebreakFails.length > 0 ? (
                <span className={styles.remarkDim}>não passa: {tiebreakFails.map(shortCriterion).join('; ')}</span>
              ) : null}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function Group({
  title,
  tone,
  count,
  note,
  children,
}: {
  title: string;
  tone: 'ok' | 'warn' | 'bad';
  count: number;
  note: string;
  children: React.ReactNode;
}) {
  const toneClass = { ok: styles.toneOk, warn: styles.toneWarn, bad: styles.toneBad }[tone];
  return (
    <section className={styles.group}>
      <header className={styles.groupHead}>
        <span className={`${styles.dot} ${toneClass}`} aria-hidden="true" />
        <span className={styles.groupTitle}>{title}</span>
        <span className={`mono ${styles.groupCount}`}>{count}</span>
        <span className={styles.groupNote}>{note}</span>
      </header>
      {children}
    </section>
  );
}

const HEAD = ['', 'fundo', 'segmento', 'P/VP', 'DY 12m', 'patrimônio', 'vacância', 'paga/FFO', 'desempate', ''];

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            {HEAD.map((h, i) => (
              <th key={i} className={i >= 3 && i <= 8 ? styles.thNum : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/**
 * Every fund above R$ 1 bi through the five filters, filled in as the server streams them.
 * Ranking happens here with the same `rank` the CLI uses, so the order is stable while rows
 * are still arriving and identical once they are all in.
 */
export function MarketScreenView({ onPick }: { onPick: (ticker: string) => void }) {
  const [state, setState] = useState<State>(INITIAL);

  useEffect(() => {
    const controller = new AbortController();
    setState(INITIAL);

    (async () => {
      try {
        const response = await fetch(screenUrl(), { signal: controller.signal });
        if (!response.ok) throw new Error(`A triagem falhou (HTTP ${response.status}).`);
        if (STATIC_SITE) {
          setState(fromReport((await response.json()) as MarketScreen));
          return;
        }
        await readEvents(response, (event) => setState((s) => apply(s, event)));
        // A stream that ends without its closing event was cut short: say so instead of looking done.
        setState((s) =>
          s.report || s.error ? s : { ...s, running: false, error: 'A conexão caiu antes do fim da triagem.' },
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        setState((s) => ({
          ...s,
          running: false,
          error: error instanceof Error ? error.message : 'Não foi possível falar com o servidor.',
        }));
      }
    })();

    return () => controller.abort();
  }, []);

  const { approved, pending, rejected } = useMemo(() => rank(state.funds), [state.funds]);
  const overlaps = useMemo(
    () => segmentOverlaps(approved.map((f) => ({ ticker: f.ticker, segment: f.segment }))),
    [approved],
  );

  const { progress } = state;
  const percent = progress && progress.candidates > 0 ? Math.round((progress.done / progress.candidates) * 100) : 0;

  return (
    <div className={styles.view} aria-live="polite">
      <header className={styles.head}>
        <h2 className={styles.title}>Triagem de FIIs</h2>
        <p className={styles.lede}>
          Todos os fundos da B3 com patrimônio acima de R$ 1 bi, passados pelos 5 filtros. O mesmo motor do
          cartão, fundo por fundo — clique num ticker para abrir a análise completa.
        </p>
      </header>

      <div className={styles.console}>
        <div className={styles.status}>
          {progress ? (
            <span>
              {progress.universe} fundos na lista · {progress.skipped} abaixo de R$ 1 bi · {progress.candidates}{' '}
              analisados
            </span>
          ) : (
            <span>lendo a lista de fundos no Fundamentus…</span>
          )}
          {state.running && progress ? (
            <span className={styles.counter}>
              {progress.done}/{progress.candidates}
              {progress.done === 0 ? ' · a primeira vez leva alguns minutos; depois vem do cache' : ''}
            </span>
          ) : null}
          {state.report ? (
            <span className={styles.counter}>
              {STATIC_SITE ? 'instantâneo de' : 'concluída ·'} {formatTimestamp(state.report.generatedAt)}
            </span>
          ) : null}
        </div>
        {state.running ? (
          <div className={styles.bar} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <span className={styles.barFill} style={{ width: `${percent}%` }} />
          </div>
        ) : null}
      </div>

      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}

      <Group title="Passaram nos 5 filtros" tone="ok" count={approved.length} note="ordenados pelo desempate, depois pelo desconto">
        {approved.length > 0 ? (
          <Table>
            <FundRows funds={approved} numbered onPick={onPick} />
          </Table>
        ) : (
          <p className={styles.empty}>{state.running ? 'aguardando…' : 'nenhum fundo passou em todos os filtros hoje'}</p>
        )}
        {overlaps.map((overlap) => (
          <p key={overlap} className={styles.overlap} role="note">
            <span className="tag">desempate</span> {overlap}
          </p>
        ))}
      </Group>

      <Group title="Falta conferir à mão" tone="warn" count={pending.length} note="nenhum filtro reprovou, mas faltou dado nas fontes">
        {pending.length > 0 ? (
          <Table>
            <FundRows funds={pending} numbered onPick={onPick} />
          </Table>
        ) : (
          <p className={styles.empty}>{state.running ? 'aguardando…' : 'nenhum'}</p>
        )}
      </Group>

      <Group title="Reprovados" tone="bad" count={rejected.length} note="o primeiro filtro que reprovou, à direita">
        {rejected.length > 0 ? (
          <details className={styles.details}>
            <summary className={styles.summary}>mostrar os {rejected.length} reprovados</summary>
            <Table>
              <FundRows funds={rejected} numbered={false} onPick={onPick} />
            </Table>
          </details>
        ) : (
          <p className={styles.empty}>{state.running ? 'aguardando…' : 'nenhum'}</p>
        )}
      </Group>

      {state.failed.length > 0 ? (
        <section className={styles.group}>
          <header className={styles.groupHead}>
            <span className={`${styles.dot} ${styles.toneUnrel}`} aria-hidden="true" />
            <span className={styles.groupTitle}>Sem análise</span>
            <span className={`mono ${styles.groupCount}`}>{state.failed.length}</span>
            <span className={styles.groupNote}>as fontes não responderam para estes</span>
          </header>
          <ul className={styles.failures}>
            {state.failed.map((failure) => (
              <li key={failure.ticker}>
                <button type="button" className={styles.ticker} onClick={() => onPick(failure.ticker)}>
                  {failure.ticker}
                </button>
                <span className={styles.failureMessage}>{failure.message.split('\n')[0]}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
