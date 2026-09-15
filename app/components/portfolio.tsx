'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import {
  MAX_PER_FUND,
  MAX_PER_SEGMENT,
  MODE_NAME,
  buildPortfolio,
  projectGrowth,
  segmentShares,
  type AllocationMode,
  type GrowthPoint,
  type Holding,
} from '@/src/portfolio';
import { formatValue } from '@/app/format';
import { AllocationDonut, GrowthChart } from './charts';
import { TickerLink } from './screen-view';
import type { Words } from './screen-spec';
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
 * they have. Pure arithmetic on numbers the screen already fetched — nothing new is
 * requested, so it works on the static snapshot too.
 */
export function PortfolioBuilder({
  holdings,
  pending,
  words,
  backHref,
}: {
  /** The papers the reader ticked on the screening table, approved or pending. */
  holdings: Holding[];
  /** Of those, the ones no filter rejected but whose data was incomplete. */
  pending: ReadonlySet<string>;
  words: Words;
  backHref: string;
}) {
  const [amountText, setAmountText] = useState(DEFAULT_AMOUNT);
  const [contributionText, setContributionText] = useState('');
  const [mode, setMode] = useState<AllocationMode>('equal');
  const [horizon, setHorizon] = useState(10);
  const amountId = useId();
  const contributionId = useId();

  const amount = parseAmount(amountText);
  const contribution = parseAmount(contributionText);
  const portfolio = useMemo(() => buildPortfolio(holdings, amount, mode), [holdings, amount, mode]);
  const segments = useMemo(() => segmentShares(portfolio.positions), [portfolio]);
  const growth = useMemo(
    () => projectGrowth(portfolio, horizon, contribution),
    [portfolio, horizon, contribution],
  );

  // Today's totals answer "what do I buy"; the curve answers "and then what". Reading the
  // curve moves the two totals that grow with it, so the row is never a year behind the chart.
  const [hovered, setHovered] = useState<GrowthPoint | null>(null);
  const projected = hovered && growth?.includes(hovered) && hovered.year > 0 ? hovered : null;
  const bought = portfolio.positions.length > 0;
  // With nothing bought there is no "today" worth four totals, so the row opens at the end of
  // the horizon — the only number a portfolio started from zero actually has.
  const timeline = projected ?? (bought ? null : (growth?.[growth.length - 1] ?? null));
  const horizonLabel = timeline ? `em ${timeline.year} ano${timeline.year > 1 ? 's' : ''}` : null;
  const yieldShown = portfolio.yieldOnCost ?? portfolio.plannedYield;

  return (
    <section className={screen.group} aria-label="Montar carteira com os papéis selecionados">
      <header className={screen.groupHead}>
        <span className={`${screen.dot} ${styles.dot}`} aria-hidden="true" />
        <span className={screen.groupTitle}>Seleção</span>
        <span className={`mono ${screen.groupCount}`}>{holdings.length}</span>
        <span className={screen.groupNote}>
          {words.share} inteira, sem fração ·{' '}
          <Link className={styles.textButton} href={backHref}>
            mudar a seleção na triagem
          </Link>
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
              ? ` Tetos: ${percent(MAX_PER_FUND)} por ${words.item}, ${percent(MAX_PER_SEGMENT)} por ${words.group}.`
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

      {bought ? null : amount > 0 ? (
        <p className={screen.empty}>
          {money(amount)} não compra uma {words.share} de nenhum {words.item} selecionado com essa
          divisão
        </p>
      ) : contribution > 0 ? (
        <p className={screen.empty}>
          sem valor inicial: a carteira começa vazia e cresce só com o aporte, seguindo a divisão
          escolhida acima
        </p>
      ) : (
        <p className={screen.empty}>
          informe um valor a investir, um aporte mensal, ou os dois — dá para começar do zero
        </p>
      )}

      {bought ? (
        <>
          <div className={screen.scroll}>
            <table className={screen.table}>
              <thead>
                <tr>
                  <th>{words.item}</th>
                  <th>{words.group}</th>
                  <th className={screen.thNum}>{words.shares}</th>
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
                      <TickerLink ticker={p.ticker} />
                      {pending.has(p.ticker) ? (
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

        </>
      ) : null}

      {bought || growth ? (
        <dl className={styles.totals}>
          <div className={styles.total}>
            <dt className="tag">{timeline ? `patrimônio ${horizonLabel}` : 'aplicado'}</dt>
            <dd className={`mono ${styles.totalValue}`}>
              {money(timeline ? timeline.reinvested : portfolio.invested)}
              {/* Both projected totals read the main curve; the other one is the cash kept. */}
              {timeline ? <span className={styles.qualifier}> reinvestindo</span> : null}
            </dd>
          </div>
          {bought ? (
            <div className={styles.total}>
              <dt className="tag">troco</dt>
              <dd className={`mono ${styles.totalValue}`}>{money(portfolio.leftover)}</dd>
            </div>
          ) : null}
          <div className={styles.total}>
            <dt className="tag">{timeline ? `renda/mês ${horizonLabel}` : 'renda estimada/mês'}</dt>
            <dd className={`mono ${styles.totalValue} ${styles.totalIncome}`}>
              {timeline
                ? money(timeline.monthlyIncome)
                : portfolio.monthlyIncome === null
                  ? '—'
                  : money(portfolio.monthlyIncome)}
              {timeline ? (
                <span className={styles.qualifier}> reinvestindo</span>
              ) : portfolio.incomeComplete ? (
                ''
              ) : (
                <span className={styles.partial}> parcial</span>
              )}
            </dd>
          </div>
          <div className={styles.total}>
            <dt className="tag">{bought ? 'DY da carteira' : 'DY previsto'}</dt>
            <dd className={`mono ${styles.totalValue}`}>
              {yieldShown === null ? '—' : percent(yieldShown)}
            </dd>
          </div>
        </dl>
      ) : null}

      {bought || growth ? (
        <div className={styles.charts}>
          {bought ? (
            <AllocationDonut positions={portfolio.positions} segments={segments} words={words} />
          ) : null}
          {growth ? (
            <GrowthChart
              points={growth}
              invested={portfolio.invested}
              contribution={contribution}
              words={words}
              onHover={setHovered}
            />
          ) : (
            <p className={screen.empty}>sem DY na carteira, não há o que projetar</p>
          )}
        </div>
      ) : null}

      {portfolio.excluded.length > 0 ? (
        <p className={styles.excluded}>
          <span className="tag">fora</span>{' '}
          {portfolio.excluded.map((e) => `${e.ticker} (${e.reason})`).join(' · ')}
        </p>
      ) : null}

      <p className={styles.caveat}>
        A renda é o DY dos últimos 12 meses aplicado ao valor comprado, dividido por 12 — o que o{' '}
        {words.item} pagou, não o que vai pagar. A projeção congela cotação e DY nos valores de hoje e
        só mostra o efeito de reinvestir ou não, e do aporte mensal: não prevê preço, inflação nem
        corte de rendimento. Passe o cursor pela curva — ou toque nela — para ler o patrimônio e a renda de cada ano.
        O aporte entra na projeção, não na lista de compras acima. A cotação é a da última leitura
        das fontes, e o preço de compra na bolsa será outro.
      </p>
    </section>
  );
}
