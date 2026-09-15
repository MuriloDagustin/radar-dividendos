'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  rankStocks,
  type ScreenedStock,
  type StockMarketScreen,
  type StockScreenEvent,
  type StockScreenFailure,
} from '@/src/stock-market';
import { CATEGORY_NAME } from '@/src/types';
import { VERDICT_LABEL } from '@/app/format';
import { STATIC_SITE, stockScreenUrl } from '@/app/mode';
import { Cell, Console, Group, readEvents, shortCriterion } from './screen';
import styles from './screen.module.css';

type StreamEvent = StockScreenEvent | { type: 'error'; message: string };

interface Progress {
  universe: number;
  candidates: number;
  skipped: number;
  done: number;
}

interface State {
  progress: Progress | null;
  stocks: ScreenedStock[];
  failed: StockScreenFailure[];
  report: StockMarketScreen | null;
  error: string | null;
  running: boolean;
}

const INITIAL: State = {
  progress: null,
  stocks: [],
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
    case 'stock':
      return {
        ...state,
        stocks: [...state.stocks, event.stock],
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

/** The snapshot is a finished report; it lands in the same state a completed stream would. */
function fromReport(report: StockMarketScreen): State {
  return {
    progress: {
      universe: report.universe,
      candidates: report.candidates,
      skipped: report.skipped,
      done: report.candidates,
    },
    stocks: [...report.approved, ...report.pending, ...report.rejected],
    failed: report.failed,
    report,
    error: null,
    running: false,
  };
}

function StockRows({
  stocks,
  numbered,
  onPick,
}: {
  stocks: ScreenedStock[];
  numbered: boolean;
  onPick: (ticker: string) => void;
}) {
  return (
    <>
      {stocks.map((stock, i) => {
        const missing = stock.screen.filters.filter((c) => c.status === 'unknown');
        const tiebreakFails = stock.screen.tiebreakers.filter((c) => c.status === 'fail');
        return (
          <tr key={stock.ticker} className={styles.row}>
            <td className={styles.index}>{numbered ? i + 1 : ''}</td>
            <td>
              <button type="button" className={styles.ticker} onClick={() => onPick(stock.ticker)} title={stock.name ?? undefined}>
                {stock.ticker}
              </button>
            </td>
            <td className={styles.segment}>
              {stock.sector ?? stock.name ?? '—'}
              <span className={styles.category}> · {CATEGORY_NAME[stock.category]}</span>
            </td>
            <Cell value={stock.roe} format="percent" />
            <Cell value={stock.netDebtToEbitda} format="multiple" />
            <Cell value={stock.netMargin} format="percent" />
            <Cell value={stock.revenueCagr5y} format="percent" />
            <Cell value={stock.liquidity} format="currency" />
            <Cell value={stock.dividendYield12m} format="percent" />
            <td className={styles.tiebreak}>
              <span className={stock.tiebreakersPassed === stock.screen.tiebreakers.length ? styles.tiebreakFull : ''}>
                {stock.tiebreakersPassed}/{stock.screen.tiebreakers.length}
              </span>
            </td>
            <td className={styles.verdict}>{VERDICT_LABEL[stock.verdict]}</td>
            <td className={styles.remark}>
              {stock.outcome === 'rejected' && stock.failedOn ? (
                <span className={styles.remarkBad}>{shortCriterion(stock.failedOn)}</span>
              ) : null}
              {missing.length > 0 ? (
                <span className={styles.remarkWarn}>sem dado: {missing.map(shortCriterion).join('; ')}</span>
              ) : null}
              {stock.outcome === 'approved' && tiebreakFails.length > 0 ? (
                <span className={styles.remarkDim}>não passa: {tiebreakFails.map(shortCriterion).join('; ')}</span>
              ) : null}
            </td>
          </tr>
        );
      })}
    </>
  );
}

const HEAD = ['', 'ação', 'setor', 'ROE', 'dív/EBITDA', 'margem líq.', 'receita 5a', 'liquidez/dia', 'DY 12m', 'desempate', 'veredito', ''];

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            {HEAD.map((h, i) => (
              <th key={i} className={i >= 3 && i <= 9 ? styles.thNum : undefined}>
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
 * Every company trading above R$ 5 mi a day through the five filters, filled in as the
 * server streams them. Ranking happens here with the same `rankStocks` the CLI uses, so the
 * order is stable while rows are still arriving and identical once they are all in.
 */
export function StockScreenView({ onPick }: { onPick: (ticker: string) => void }) {
  const [state, setState] = useState<State>(INITIAL);

  useEffect(() => {
    const controller = new AbortController();
    setState(INITIAL);

    (async () => {
      try {
        const response = await fetch(stockScreenUrl(), { signal: controller.signal });
        if (!response.ok) throw new Error(`A triagem falhou (HTTP ${response.status}).`);
        if (STATIC_SITE) {
          setState(fromReport((await response.json()) as StockMarketScreen));
          return;
        }
        await readEvents<StreamEvent>(response, (event) => setState((s) => apply(s, event)));
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

  const { approved, pending, rejected } = useMemo(() => rankStocks(state.stocks), [state.stocks]);

  const { progress } = state;
  const percent = progress && progress.candidates > 0 ? Math.round((progress.done / progress.candidates) * 100) : 0;

  return (
    <div className={styles.view} aria-live="polite">
      <header className={styles.head}>
        <h2 className={styles.title}>Triagem de ações</h2>
        <p className={styles.lede}>
          Toda ação da B3 que negocia acima de R$ 5 mi por dia, uma classe por empresa, passada pelos 5 filtros:
          ROE, dívida, margem, crescimento e liquidez. Indicador é filtro, não decisão — o que sobra é onde
          começa a leitura do release. Clique num ticker para abrir a análise completa.
        </p>
      </header>

      <Console
        status={
          progress ? (
            <>
              {progress.universe} ações na lista · {progress.skipped} fora por liquidez ou classe repetida ·{' '}
              {progress.candidates} analisadas
            </>
          ) : (
            'lendo a lista de ações no Fundamentus…'
          )
        }
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

      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}

      <Group
        title="Passaram nos 5 filtros"
        tone="ok"
        count={approved.length}
        note="ordenadas pelo desempate, depois pelo ROIC"
      >
        {approved.length > 0 ? (
          <Table>
            <StockRows stocks={approved} numbered onPick={onPick} />
          </Table>
        ) : (
          <p className={styles.empty}>{state.running ? 'aguardando…' : 'nenhuma ação passou em todos os filtros hoje'}</p>
        )}
      </Group>

      <Group
        title="Falta conferir à mão"
        tone="warn"
        count={pending.length}
        note="nenhum filtro reprovou, mas faltou dado ou o filtro não se aplica — bancos caem aqui pela dívida"
      >
        {pending.length > 0 ? (
          <Table>
            <StockRows stocks={pending} numbered onPick={onPick} />
          </Table>
        ) : (
          <p className={styles.empty}>{state.running ? 'aguardando…' : 'nenhuma'}</p>
        )}
      </Group>

      <Group title="Reprovadas" tone="bad" count={rejected.length} note="o primeiro filtro que reprovou, à direita">
        {rejected.length > 0 ? (
          <details className={styles.details}>
            <summary className={styles.summary}>mostrar as {rejected.length} reprovadas</summary>
            <Table>
              <StockRows stocks={rejected} numbered={false} onPick={onPick} />
            </Table>
          </details>
        ) : (
          <p className={styles.empty}>{state.running ? 'aguardando…' : 'nenhuma'}</p>
        )}
      </Group>

      {state.failed.length > 0 ? (
        <section className={styles.group}>
          <header className={styles.groupHead}>
            <span className={`${styles.dot} ${styles.toneUnrel}`} aria-hidden="true" />
            <span className={styles.groupTitle}>Sem análise</span>
            <span className={`mono ${styles.groupCount}`}>{state.failed.length}</span>
            <span className={styles.groupNote}>as fontes não responderam para estas</span>
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
