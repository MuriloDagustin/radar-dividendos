import { distortedProfit, resolveNetDebtToEbitda } from './diagnosis';
import { formatCurrency, formatMultiple, formatPercent } from './numbers';
import type {
  Category,
  Criterion,
  CriterionStatus,
  FundScreen,
  Fundamentals,
  PeerMap,
} from './types';

/**
 * The five filters for a company and the tiebreakers, as thresholds. An indicator is a
 * filter, not a decision: it removes what is clearly weak fast, and reading the results
 * release is what comes after. The bounds are the ones the screen was specified with —
 * ROE above 15%, net debt under 2.5× EBITDA, net margin above 5%, revenue growing, more than
 * R$ 5 mi traded a day — plus the cost of capital in Brazil for the ROIC tiebreaker and the
 * usual payout range for a company that still has somewhere to invest.
 */
export const ROE_FLOOR = 0.15;
export const LEVERAGE_CEILING = 2.5;
export const NET_MARGIN_FLOOR = 0.05;
export const LIQUIDITY_FLOOR = 5_000_000;
export const COST_OF_CAPITAL = 0.15;
export const PAYOUT_RANGE = { from: 0.3, to: 0.6 } as const;

function criterion(
  key: string,
  label: string,
  status: CriterionStatus,
  value: string | null,
  detail: string,
): Criterion {
  return { key, label, status, value, detail };
}

const DISTORTED =
  'O lucro deste período está distorcido (P/L, ROE e dividendo não fecham entre si), então tudo que divide por ele perde a leitura. Veja no release qual é o lucro recorrente';

export function returnOnEquity(f: Fundamentals, distorted: boolean): Criterion {
  const label = 'ROE acima de 15%';
  if (f.roe === null) {
    return criterion('roe', label, 'unknown', null, 'Nenhuma fonte informou o ROE');
  }
  const shown = formatPercent(f.roe);
  if (distorted) return criterion('roe', label, 'unknown', shown, DISTORTED);
  if (f.roe >= ROE_FLOOR) {
    return criterion(
      'roe',
      label,
      'pass',
      shown,
      'Rende acima do custo de capital no Brasil. ROE alto com dívida alta é alavancagem, não qualidade — o ROIC no desempate é o que não se deixa enganar por dívida',
    );
  }
  return criterion(
    'roe',
    label,
    'fail',
    shown,
    'Rende menos que o custo de capital: o patrimônio dos sócios cresce devagar, ou encolhe em termos reais',
  );
}

export function leverage(f: Fundamentals, category: Category): Criterion {
  const label = 'Dívida líq./EBITDA abaixo de 2,5×';
  if (category === 'financial') {
    return criterion(
      'leverage',
      label,
      'unknown',
      null,
      'Não se aplica a banco e seguradora: alavancagem é a natureza do negócio. O que vale aí é o índice de Basileia e a inadimplência (estágio 3) — confira no release',
    );
  }
  const ratio = resolveNetDebtToEbitda(f);
  if (ratio === null) {
    return criterion(
      'leverage',
      label,
      'unknown',
      null,
      'Nenhuma fonte publicou a razão nem os dois insumos (dívida líquida e EBITDA positivo)',
    );
  }
  const shown = `${formatMultiple(ratio)}×`;
  if (ratio < 0) {
    return criterion('leverage', label, 'pass', shown, 'Caixa líquido: tem mais dinheiro em caixa do que dívida');
  }
  if (ratio < LEVERAGE_CEILING) {
    return criterion(
      'leverage',
      label,
      'pass',
      shown,
      'Sobrevive a um ano ruim sem renegociar. Dívida em dólar sem receita em dólar é outra história — confira o perfil da dívida no release',
    );
  }
  return criterion(
    'leverage',
    label,
    'fail',
    shown,
    'Acima do limite, cada ano ruim vira renegociação. Precisa de um motivo — receita contratada e previsível — e ele tem de estar no release',
  );
}

export function netMargin(f: Fundamentals, distorted: boolean): Criterion {
  const label = 'Margem líquida acima de 5%';
  if (f.netMargin === null) {
    return criterion('margin', label, 'unknown', null, 'Nenhuma fonte informou a margem líquida');
  }
  const shown = formatPercent(f.netMargin);
  if (distorted) return criterion('margin', label, 'unknown', shown, DISTORTED);
  if (f.netMargin >= NET_MARGIN_FLOOR) {
    return criterion(
      'margin',
      label,
      'pass',
      shown,
      'Sobra dinheiro depois de tudo. Se a margem segura em ano ruim, só a série mostra — e compare dentro do setor: 8% é ótimo em varejo e péssimo em software',
    );
  }
  return criterion(
    'margin',
    label,
    'fail',
    shown,
    'Margem fina: qualquer aumento de custo ou queda de preço leva o lucro junto',
  );
}

export function revenueGrowth(f: Fundamentals): Criterion {
  const label = 'Receita crescendo';
  if (f.revenueCagr5y === null) {
    return criterion('growth', label, 'unknown', null, 'Nenhuma fonte informou o crescimento da receita');
  }
  const shown = `${formatPercent(f.revenueCagr5y)} ao ano (5 anos)`;
  if (f.revenueCagr5y > 0) {
    return criterion(
      'growth',
      label,
      'pass',
      shown,
      'Crescimento composto de cinco anos positivo. A fonte não publica a série ano a ano: se cresceu três anos seguidos, e se foi com caixa próprio ou com dívida e emissão, só a DFP diz',
    );
  }
  return criterion(
    'growth',
    label,
    'fail',
    shown,
    'Receita encolhendo na média de cinco anos: sem crescimento, o dividendo de hoje é o teto',
  );
}

export function dailyLiquidity(f: Fundamentals): Criterion {
  const label = 'Liquidez diária acima de R$ 5 mi';
  if (f.avgDailyLiquidity === null) {
    return criterion('liquidity', label, 'unknown', null, 'Nenhuma fonte informou o volume médio negociado por dia');
  }
  const shown = `${formatCurrency(f.avgDailyLiquidity)} por dia`;
  if (f.avgDailyLiquidity >= LIQUIDITY_FLOOR) {
    return criterion('liquidity', label, 'pass', shown, 'Dá para montar e desmontar a posição sem mover o preço');
  }
  return criterion(
    'liquidity',
    label,
    'fail',
    shown,
    'Negocia pouco: entrar e sair custa spread, e a cotação reage a qualquer ordem maior',
  );
}

export function returnOnCapital(f: Fundamentals): Criterion {
  const label = 'ROIC acima do custo de capital';
  if (f.roic === null) {
    return criterion('roic', label, 'unknown', null, 'Nenhuma fonte informou o ROIC');
  }
  const shown = formatPercent(f.roic);
  if (f.roic >= COST_OF_CAPITAL) {
    return criterion(
      'roic',
      label,
      'pass',
      shown,
      'Retorno sobre todo o capital, dívida incluída, acima do custo de capital — é qualidade, não alavancagem',
    );
  }
  return criterion(
    'roic',
    label,
    'fail',
    shown,
    'Contando o capital de terceiros, o retorno fica abaixo do custo de capital: se o ROE é alto, é a dívida que o infla',
  );
}

export function sustainablePayout(f: Fundamentals, distorted: boolean): Criterion {
  const label = 'Payout entre 30% e 60%';
  if (f.payout === null) {
    return criterion('payout', label, 'unknown', null, 'Nenhuma fonte informou o payout');
  }
  const shown = formatPercent(f.payout);
  if (distorted) return criterion('payout', label, 'unknown', shown, DISTORTED);
  if (f.payout > 1) {
    return criterion(
      'payout',
      label,
      'fail',
      shown,
      'Distribui mais do que ganha: ou não tem onde investir, ou está mascarando problema',
    );
  }
  if (f.payout > PAYOUT_RANGE.to) {
    return criterion(
      'payout',
      label,
      'fail',
      shown,
      'Distribui quase tudo e reinveste pouco — normal em transmissão de energia, suspeito em quem ainda precisa crescer',
    );
  }
  if (f.payout >= PAYOUT_RANGE.from) {
    return criterion('payout', label, 'pass', shown, 'Paga e ainda reinveste: a renda de hoje não come o crescimento de amanhã');
  }
  return criterion(
    'payout',
    label,
    'fail',
    shown,
    'Retém quase todo o lucro: pode ser bom para a empresa, mas paga pouco para uma carteira de renda',
  );
}

export function cheaperThanSector(f: Fundamentals, peers: PeerMap): Criterion {
  const label = 'P/L abaixo da mediana do setor';
  const median = peers.priceEarnings?.sector;
  if (f.priceEarnings === null || median === undefined) {
    return criterion(
      'valuation',
      label,
      'unknown',
      f.priceEarnings === null ? null : `${formatMultiple(f.priceEarnings)}×`,
      'A fonte não publicou a mediana do setor para comparar',
    );
  }
  const shown = `${formatMultiple(f.priceEarnings)}× vs. ${formatMultiple(median)}× do setor`;
  if (f.priceEarnings <= 0) {
    return criterion('valuation', label, 'unknown', shown, 'P/L negativo: a empresa não teve lucro, então o múltiplo não tem leitura');
  }
  if (f.priceEarnings < median) {
    return criterion(
      'valuation',
      label,
      'pass',
      shown,
      'Paga menos pelo lucro que a mediana do setor. Múltiplo baixo isolado não diz nada — costuma estar barato por um motivo, e ele tem de estar no release',
    );
  }
  return criterion('valuation', label, 'fail', shown, 'Paga mais pelo lucro que a mediana do setor: o mercado já precificou a qualidade');
}

export interface StockScreenInput {
  fundamentals: Fundamentals;
  category: Category;
  /** Sector medians a source published, for the valuation tiebreaker. */
  peers?: PeerMap;
}

/**
 * Filters first, tiebreakers after. A distorted bottom line poisons ROE, margin and payout
 * at once, so it is detected here too — the screen cannot depend on the verdict having run.
 */
export function screenStock(input: StockScreenInput): FundScreen {
  const f = input.fundamentals;
  const distorted = distortedProfit({
    priceEarnings: f.priceEarnings,
    roe: f.roe,
    dividendYield: f.dividendYield12m,
  });

  const filters = [
    returnOnEquity(f, distorted),
    leverage(f, input.category),
    netMargin(f, distorted),
    revenueGrowth(f),
    dailyLiquidity(f),
  ];

  const tiebreakers = [
    returnOnCapital(f),
    sustainablePayout(f, distorted),
    cheaperThanSector(f, input.peers ?? {}),
  ];

  const passed = filters.filter((c) => c.status === 'pass').length;
  const unknown = filters.filter((c) => c.status === 'unknown').length;

  return { filters, tiebreakers, passed, unknown, passedAll: passed === filters.length };
}
