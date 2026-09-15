'use client';

import { useId, useMemo, useState } from 'react';
import type { ScreenedFund } from '@/src/fund-market';
import {
  MAX_PER_FUND,
  MAX_PER_SEGMENT,
  MODE_NAME,
  buildPortfolio,
  projectGrowth,
  segmentShares,
  type AllocationMode,
} from '@/src/portfolio';
import { formatValue } from '@/app/format';
import { AllocationDonut, GrowthChart } from './charts';
import screen from './screen.module.css';
import styles from './portfolio.module.css';

const MODES: AllocationMode[] = ['equal', 'quality', 'yield'];
const HORIZONS = [5, 10, 20, 30];
const DEFAULT_AMOUNT = '10000';

/** "10.000", "10000,50" and "R$ 10 mil" are all what a person types for money. */
function parseAmount(text: string): number {
  const cleaned = text.replace(/[^\d,.-]/g, '');
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/\.(?=\d{3}(\D|$))/g, '');
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function money(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function percent(value: number): string {
  return `${(value * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/**
 * Turns the reader's selection into a shopping list: how many shares of each, for the amount
 * they have. Pure arithmetic on numbers already on the page — nothing new is fetched, so it
 * works on the static snapshot too.
 */
export function PortfolioBuilder({
  funds,
  onPick,
  onReset,
  onClear,
}: {
  /** The funds the reader ticked, approved or pending. */
  funds: ScreenedFund[];
  onPick: (ticker: string) => void;
  /** Back to the default selection: every approved fund. */
  onReset: () => void;
  onClear: () => void;
}) {
  const [amountText, setAmountText] = useState(DEFAULT_AMOUNT);
  const [contributionText, setContributionText] = useState('');
  const [mode, setMode] = useState<AllocationMode>('equal');
  const [horizon, setHorizon] = useState(10);
  const amountId = useId();
  const contributionId = useId();

  const amount = parseAmount(amountText);
  const contribution = parseAmount(contributionText);
  const portfolio = useMemo(() => buildPortfolio(funds, amount, mode), [funds, amount, mode]);
  const segments = useMemo(() => segmentShares(portfolio.positions), [portfolio]);
  const growth = useMemo(
    () => projectGrowth(portfolio, horizon, contribution),
    [portfolio, horizon, contribution],
  );
  const pendingTickers = useMemo(
    () => new Set(funds.filter((f) => f.outcome === 'pending').map((f) => f.ticker)),
    [funds],
  );

  return (
    <section className={screen.group} aria-label="Montar carteira com os fundos selecionados">
      <header className={screen.groupHead}>
        <span className={`${screen.dot} ${styles.dot}`} aria-hidden="true" />
        <span className={screen.groupTitle}>Montar carteira</span>
        <span className={`mono ${screen.groupCount}`}>{funds.length} selecionados</span>
        <span className={screen.groupNote}>
          marque os fundos nas tabelas acima; cota inteira, sem fração ·{' '}
          <button type="button" className={styles.textButton} onClick={onReset}>
            só os aprovados
          </button>{' '}
          ·{' '}
          <button type="button" className={styles.textButton} onClick={onClear}>
            nenhum
          </button>
        </span>
      </header>

      <div className={styles.controls}>
        <label className={styles.amount} htmlFor={amountId}>
          <span className="tag">valor a investir</span>
          <span className={styles.amountField}>
            <span className={styles.currency}>R$</span>
            <input
              id={amountId}
              className={styles.input}
              inputMode="decimal"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              aria-label="Valor a investir, em reais"
            />
          </span>
        </label>

        <label className={styles.amount} htmlFor={contributionId}>
          <span className="tag">aporte mensal</span>
          <span className={styles.amountField}>
            <span className={styles.currency}>R$</span>
            <input
              id={contributionId}
              className={styles.input}
              inputMode="decimal"
              value={contributionText}
              onChange={(e) => setContributionText(e.target.value)}
              placeholder="0"
              aria-label="Aporte mensal, em reais, só para a projeção"
            />
          </span>
        </label>

        <div className={styles.modes} role="radiogroup" aria-label="Como dividir">
          <span className="tag">como dividir</span>
          <div className={styles.modeRow}>
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                className={mode === m ? `${styles.mode} ${styles.modeActive}` : styles.mode}
                onClick={() => setMode(m)}
              >
                {MODE_NAME[m].label}
              </button>
            ))}
          </div>
          <p className={styles.modeDetail}>
            {MODE_NAME[mode].detail}
            {mode === 'yield'
              ? ` Tetos: ${percent(MAX_PER_FUND)} por fundo, ${percent(MAX_PER_SEGMENT)} por segmento.`
              : ''}
          </p>
        </div>

        <div className={styles.modes} role="radiogroup" aria-label="Horizonte da projeção">
          <span className="tag">horizonte</span>
          <div className={styles.modeRow}>
            {HORIZONS.map((h) => (
              <button
                key={h}
                type="button"
                role="radio"
                aria-checked={horizon === h}
                className={horizon === h ? `${styles.mode} ${styles.modeActive}` : styles.mode}
                onClick={() => setHorizon(h)}
              >
                {h} anos
              </button>
            ))}
          </div>
        </div>
      </div>

      {funds.length === 0 ? (
        <p className={screen.empty}>nenhum fundo selecionado — marque nas tabelas acima</p>
      ) : amount <= 0 ? (
        <p className={screen.empty}>informe um valor para ver a carteira</p>
      ) : portfolio.positions.length === 0 ? (
        <p className={screen.empty}>
          {money(amount)} não compra uma cota de nenhum fundo selecionado com essa divisão
        </p>
      ) : (
        <>
          <div className={screen.scroll}>
            <table className={screen.table}>
              <thead>
                <tr>
                  <th>fundo</th>
                  <th>segmento</th>
                  <th className={screen.thNum}>cotas</th>
                  <th className={screen.thNum}>cotação</th>
                  <th className={screen.thNum}>aplicado</th>
                  <th className={screen.thNum}>peso</th>
                  <th className={screen.thNum}>DY 12m</th>
                  <th className={screen.thNum}>renda/mês</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.positions.map((p) => (
                  <tr key={p.ticker} className={screen.row}>
                    <td className={styles.fundCell}>
                      <button type="button" className={screen.ticker} onClick={() => onPick(p.ticker)}>
                        {p.ticker}
                      </button>
                      {pendingTickers.has(p.ticker) ? (
                        <span className={styles.pendingTag} title="Nenhum filtro reprovou, mas faltou dado nas fontes">
                          conferir
                        </span>
                      ) : null}
                    </td>
                    <td className={screen.segment}>{p.segment ?? '—'}</td>
                    <td className={`${screen.num} ${styles.shares}`}>{p.shares}</td>
                    <td className={screen.num}>{money(p.price)}</td>
                    <td className={screen.num}>{money(p.invested)}</td>
                    <td className={screen.num} title={`alvo ${percent(p.targetWeight)}`}>
                      {percent(p.weight)}
                    </td>
                    <td className={p.dividendYield12m === null ? screen.numEmpty : screen.num}>
                      {formatValue(p.dividendYield12m, 'percent')}
                    </td>
                    <td className={p.monthlyIncome === null ? screen.numEmpty : screen.num}>
                      {p.monthlyIncome === null ? '—' : money(p.monthlyIncome)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className={styles.totals}>
            <div className={styles.total}>
              <dt className="tag">aplicado</dt>
              <dd className={`mono ${styles.totalValue}`}>{money(portfolio.invested)}</dd>
            </div>
            <div className={styles.total}>
              <dt className="tag">troco</dt>
              <dd className={`mono ${styles.totalValue}`}>{money(portfolio.leftover)}</dd>
            </div>
            <div className={styles.total}>
              <dt className="tag">renda estimada/mês</dt>
              <dd className={`mono ${styles.totalValue} ${styles.totalIncome}`}>
                {portfolio.monthlyIncome === null ? '—' : money(portfolio.monthlyIncome)}
                {portfolio.incomeComplete ? '' : <span className={styles.partial}> parcial</span>}
              </dd>
            </div>
            <div className={styles.total}>
              <dt className="tag">DY da carteira</dt>
              <dd className={`mono ${styles.totalValue}`}>
                {portfolio.yieldOnCost === null ? '—' : percent(portfolio.yieldOnCost)}
              </dd>
            </div>
          </dl>

          <div className={styles.charts}>
            <AllocationDonut positions={portfolio.positions} segments={segments} />
            {growth ? (
              <GrowthChart points={growth} invested={portfolio.invested} contribution={contribution} />
            ) : (
              <p className={screen.empty}>sem DY na carteira, não há o que projetar</p>
            )}
          </div>
        </>
      )}

      {portfolio.excluded.length > 0 ? (
        <p className={styles.excluded}>
          <span className="tag">fora</span>{' '}
          {portfolio.excluded.map((e) => `${e.ticker} (${e.reason})`).join(' · ')}
        </p>
      ) : null}

      <p className={styles.caveat}>
        A renda é o DY dos últimos 12 meses aplicado ao valor comprado, dividido por 12 — o que o fundo pagou,
        não o que vai pagar. A projeção congela cotação e DY nos valores de hoje e só mostra o efeito de reinvestir
        ou não, e do aporte mensal: não prevê preço, inflação nem corte de rendimento. O aporte entra na
        projeção, não na lista de compras acima. A cotação é a da última leitura das fontes, e o
        preço de compra na bolsa será outro.
      </p>
    </section>
  );
}
