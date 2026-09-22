'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { readLocalData, updateLocal } from './local-store';
import { SavedSimulations } from './saved-simulations';
import personal from './personal.module.css';
import { useEffect, useId, useMemo, useState } from 'react';
import {
  buildPortfolio,
  projectGrowth,
  segmentShares,
  type AllocationMode,
  type GrowthPoint,
  type Holding,
} from '@/src/portfolio';
import { formatValue } from '@/app/format';
import { splitTickers } from '@/app/tickers';
import { AllocationDonut, GrowthChart } from './charts';
import { TickerLink } from './screen-view';
import type { Words } from './screen-spec';
import screen from './screen.module.css';
import styles from './portfolio.module.css';

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
  const mode: AllocationMode = 'equal';
  const [allocationConfirmed, setAllocationConfirmed] = useState(false);
  const [horizon, setHorizon] = useState(10);
  const params = useSearchParams();
  const scenarioId = params.get('cenario');
  const [ready, setReady] = useState(false);
  const [yieldFactor, setYieldFactor] = useState(1);
  useEffect(() => {
    const stored = readLocalData();
    const scenario = stored?.simulations?.find(s => s.id === scenarioId) ?? stored?.draft;
    if (scenario && ['equal', 'quality', 'yield'].includes(scenario.mode) && Number.isFinite(scenario.horizon)) {
      setAmountText(scenario.amount); setContributionText(scenario.contribution); setAllocationConfirmed(false); setHorizon(scenario.horizon); setYieldFactor(scenario.yieldFactor);
    }
    setReady(true);
  }, [scenarioId]);
  useEffect(() => {
    if (ready) updateLocal(d => ({ ...d, draft: { amount: amountText, contribution: contributionText, mode, horizon, yieldFactor } }));
  }, [ready, amountText, contributionText, mode, horizon, yieldFactor]);
  const amountId = useId();
  const contributionId = useId();

  const amount = parseAmount(amountText);
  const contribution = parseAmount(contributionText);
  const portfolio = useMemo(() => buildPortfolio((allocationConfirmed ? holdings : []).map(h => ({ ...h, dividendYield12m: h.dividendYield12m === null ? null : h.dividendYield12m * yieldFactor })), amount, mode), [holdings, amount, mode, yieldFactor, allocationConfirmed]);
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

  const totals =
    bought || growth ? (
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
          <dt className="tag">{timeline ? `renda/mês ${horizonLabel}` : 'renda/mês no cálculo'}</dt>
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
          <dt className="tag">{yieldFactor !== 1 ? 'DY do cenário' : bought ? 'DY da simulação' : 'DY da divisão'}</dt>
          <dd className={`mono ${styles.totalValue}`}>
            {yieldShown === null ? '—' : percent(yieldShown)}
          </dd>
        </div>
      </dl>
    ) : null;

  const charts =
    bought || growth ? (
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
          <p className={screen.empty}>sem DY nos ativos simulados, não há o que projetar</p>
        )}
      </div>
    ) : null;

  return (
    <section className={screen.group} aria-label="Simular quantidades dos ativos escolhidos">
      <header className={screen.groupHead}>
        <span className={`${screen.dot} ${styles.dot}`} aria-hidden="true" />
        <span className={screen.groupTitle}>Seleção</span>
        <span className={`mono ${screen.groupCount}`}>{holdings.length}</span>
        <span className={screen.groupNote}>
          {words.share} inteira, sem fração ·{' '}
          <Link className={styles.textButton} href={backHref}>
            mudar a seleção na consulta
          </Link>
        </span>
      </header>

      <SavedSimulations restore={scenario => { setAmountText(scenario.amount); setContributionText(scenario.contribution); setAllocationConfirmed(false); setHorizon(scenario.horizon); setYieldFactor(scenario.yieldFactor); }} current={{ href: `/carteira?papel=${backHref === '/acoes' ? 'acoes' : 'fiis'}&t=${splitTickers(params.get('t') ?? '').filter(t => /^[A-Z]{4}\d{1,2}$/.test(t)).join(',')}`, amount: amountText, contribution: contributionText, mode, horizon, yieldFactor }} />
      <div className={personal.panel}><h3>Premissa de dividendos</h3><div className={personal.toolbar}>
        <label>Dividendos em relação aos últimos 12 meses<select value={yieldFactor} onChange={e => setYieldFactor(Number(e.target.value))}><option value={0.75}>75%</option><option value={1}>100%</option><option value={1.25}>125%</option></select></label>
      </div><p>Hipótese aritmética escolhida por você, mantida constante em todo o horizonte. Não é uma estimativa de pagamentos futuros.</p></div>
      <div className={styles.controls}>
        <label className={styles.amount} htmlFor={amountId}>
          <span className="tag">valor da simulação</span>
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

        <div className={styles.modes}>
          <label><input type="checkbox" checked={allocationConfirmed} onChange={e => setAllocationConfirmed(e.target.checked)} /> Aplicar divisão igual entre os ativos que selecionei</label>
          <p className={styles.modeDetail}>Esta é uma hipótese aritmética escolhida por você. Não há pesos por qualidade, classificação de ativos ou otimização de renda. Confirme novamente ao abrir um cenário salvo.</p>
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

      {!allocationConfirmed ? <p className={screen.empty}>Escolha a hipótese de divisão acima para calcular a simulação.</p> : bought ? null : amount > 0 ? (
        <p className={screen.empty}>
          {money(amount)} não compra uma {words.share} de nenhum {words.item} selecionado com essa
          divisão
        </p>
      ) : contribution > 0 ? (
        <p className={screen.empty}>
          sem valor inicial: a simulação começa vazia e cresce só com o aporte, seguindo a divisão
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
                  <th className={screen.thNum}>{yieldFactor === 1 ? 'DY 12m' : 'DY do cenário'}</th>
                  <th className={screen.thNum}>renda/mês</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.positions.map((p) => (
                  <tr key={p.ticker} className={screen.row}>
                    <td className={styles.fundCell}>
                      <TickerLink ticker={p.ticker} />
                      {pending.has(p.ticker) ? (
                        <span className={styles.pendingTag} title="Dado indisponível">
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

      {/* Bought, the totals are a row under the list. Not bought, they are a column beside the
          curve — the only thing left on the page — instead of a strip in a half-empty band. */}
      {bought ? (
        <>
          {totals}
          {charts}
        </>
      ) : growth ? (
        <div className={styles.projection}>
          {totals}
          {charts}
        </div>
      ) : null}

      {portfolio.excluded.length > 0 ? (
        <p className={styles.excluded}>
          <span className="tag">fora</span>{' '}
          {portfolio.excluded.map((e) => `${e.ticker} (${e.reason})`).join(' · ')}
        </p>
      ) : null}

      <p className={styles.caveat}>
        A renda usa o DY dos últimos 12 meses, ajustado pelo cenário de dividendos escolhido,
        aplicado ao valor comprado e dividido por 12. A projeção mantém cotação e DY do cenário constantes e
        só mostra o efeito de reinvestir ou não, e do aporte mensal: não prevê preços nem pagamentos. Passe o cursor pela curva — ou toque nela — para ler o patrimônio e a renda de cada ano.
        O aporte entra na projeção, não na simulação de quantidades acima. A cotação é a da última leitura
        das fontes, e o preço de compra na bolsa será outro. O resultado é aritmética sobre dados passados e premissas suas; não indica que algum ativo ou divisão seja adequado.
      </p>
    </section>
  );
}
