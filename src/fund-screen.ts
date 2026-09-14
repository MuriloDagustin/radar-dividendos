import { payoutOverFfo } from './diagnosis';
import { formatCurrency, formatMultiple, formatPercent } from './numbers';
import { labelKey } from './sources/scraping';
import {
  emptyFundProfile,
  type Criterion,
  type CriterionStatus,
  type DividendRecord,
  type FundProfile,
  type FundScreen,
  type Fundamentals,
  type SourceReading,
} from './types';

/**
 * The five filters and the tiebreakers, as thresholds. Filters eliminate; tiebreakers only
 * rank what survived. The bounds are the ones the screen was specified with — 1 billion,
 * five years — except the vacancy ceiling, which is ours, and the cost ceiling, raised from
 * 1.1% to 1.15% so a fee of 1,11% (KNRI11) does not fail a fund by one basis point.
 */
export const NET_WORTH_FLOOR = 1_000_000_000;
export const LISTING_YEARS = 5;
export const COST_CEILING = 0.0115;
export const VACANCY_CEILING = 0.1;
/** Same bound as the "coberta" band of payout over FFO: past it, the distribution outruns rent. */
export const COVERED_PAYOUT_FFO = 1.05;

interface SegmentRule {
  fragments: string[];
  name: string;
  /** What the sources cannot confirm and the reader still has to check. */
  caveat?: string;
}

/** Segments that kept paying through 2020 and through the high-rate cycle. */
export const RESILIENT_SEGMENTS: readonly SegmentRule[] = [
  { fragments: ['logistic', 'logistico', 'galpoes', 'galpao', 'industria'], name: 'logística' },
  { fragments: ['shopping'], name: 'shoppings' },
  {
    fragments: ['lajescorporativas', 'lajecorporativa', 'lajes', 'escritorios'],
    name: 'lajes corporativas',
    caveat: 'confira no relatório gerencial se os imóveis são de padrão AAA — a régua só vale para eles',
  },
  { fragments: ['rendaurbana', 'varejo'], name: 'renda urbana' },
];

/** Segments the screen rules out by name, whatever the numbers say. */
export const EXCLUDED_SEGMENTS: readonly SegmentRule[] = [
  { fragments: ['hotel', 'hoteis', 'hotelaria'], name: 'hotel' },
  { fragments: ['hospital', 'hospitalar'], name: 'hospital' },
  { fragments: ['residencial', 'residenciais'], name: 'residencial' },
  { fragments: ['desenvolvimento', 'incorporacao'], name: 'desenvolvimento' },
  { fragments: ['fundodefundos', 'fundosdefundos', 'fof'], name: 'fundo de fundos' },
];

/**
 * Managers with a long public record running listed real estate funds. This list is ours
 * and is the only way to make "first-tier manager" a deterministic check; a manager not on
 * it is left unconfirmed, never failed — absence from a list is not evidence.
 */
export const REFERENCE_MANAGERS: readonly string[] = [
  'Kinea',
  'XP',
  'BTG Pactual',
  'Pátria',
  'Credit Suisse Hedging-Griffo',
  'CSHG',
  'Rio Bravo',
  'RBR',
  'Vinci',
  'Hedge',
  'HSI',
  'VBI',
  'TRX',
  'Genial',
  'Iridium',
  'JGP',
  'Capitânia',
  'Valora',
  'Mauá',
  'Suno',
  'Guardian',
  'Bresco',
  'Tellus',
  'Itaú',
  'Bradesco',
  'Santander',
  'Safra',
  'BB Asset',
  'Caixa',
];

function matchRule(texts: string[], rules: readonly SegmentRule[]): SegmentRule | null {
  const keys = texts.map(labelKey).filter((k) => k.length > 0);
  for (const rule of rules) {
    if (keys.some((key) => rule.fragments.some((fragment) => key.includes(fragment)))) {
      return rule;
    }
  }
  return null;
}

/**
 * The source files any fund spanning more than one segment as "Híbrido", which hides a
 * logistics-plus-offices fund behind the same word as a land or multi-strategy one. The
 * screen cannot tell them apart, so it leaves the answer to the reader instead of failing.
 */
export function isHybridFund(profile: FundProfile): boolean {
  return matchRule([profile.segment ?? '', profile.fundType ?? '', profile.mandate ?? ''], [
    { fragments: ['hibrido', 'hibridos', 'misto', 'mistos'], name: 'híbrido' },
  ]) !== null;
}

/** A fund with no buildings has no vacancy to read. */
export function isPaperFund(profile: FundProfile): boolean {
  return matchRule([profile.fundType ?? '', profile.segment ?? ''], [
    { fragments: ['papel', 'titulos', 'recebiveis', 'fundodefundos', 'fof'], name: 'papel' },
  ]) !== null;
}

function criterion(
  key: string,
  label: string,
  status: CriterionStatus,
  value: string | null,
  detail: string,
): Criterion {
  return { key, label, status, value, detail };
}

function describeSegment(profile: FundProfile): string | null {
  const parts = [profile.segment, profile.fundType].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function resilientSegment(profile: FundProfile): Criterion {
  const label = 'Segmento resiliente';
  const texts = [profile.segment ?? '', profile.fundType ?? '', profile.mandate ?? ''];
  const shown = describeSegment(profile);

  if (texts.every((t) => t.trim() === '')) {
    return criterion('segment', label, 'unknown', null, 'Nenhuma fonte informou o segmento do fundo');
  }

  // Exclusions first: a logistics fund with a development mandate is still development.
  const excluded = matchRule(texts, EXCLUDED_SEGMENTS);
  if (excluded) {
    return criterion(
      'segment',
      label,
      'fail',
      shown,
      `Segmento de ${excluded.name} fica fora da régua: a renda dele oscila mais e depende de ciclo, obra ou operador`,
    );
  }

  const resilient = matchRule(texts, RESILIENT_SEGMENTS);
  if (resilient) {
    return criterion(
      'segment',
      label,
      'pass',
      shown,
      `Segmento de ${resilient.name}, um dos que seguraram a renda em 2020 e no ciclo de juros altos${
        resilient.caveat ? ` — ${resilient.caveat}` : ''
      }`,
    );
  }

  // A paper fund is out whatever else it is called; a brick fund called hybrid is unknown.
  if (isHybridFund(profile) && !isPaperFund(profile)) {
    return criterion(
      'segment',
      label,
      'unknown',
      shown,
      'Fundo híbrido: as fontes não dizem a mistura de segmentos. Confira no relatório gerencial se os imóveis são de logística, shoppings, lajes ou renda urbana',
    );
  }

  return criterion(
    'segment',
    label,
    'fail',
    shown,
    'Fora da lista de segmentos resilientes (logística, shoppings, lajes corporativas AAA e renda urbana)',
  );
}

export function netWorthScale(profile: FundProfile): Criterion {
  const label = 'Patrimônio acima de R$ 1 bilhão';
  if (profile.netWorth === null) {
    return criterion('netWorth', label, 'unknown', null, 'Nenhuma fonte informou o patrimônio do fundo');
  }
  const shown = formatCurrency(profile.netWorth);
  if (profile.netWorth >= NET_WORTH_FLOOR) {
    return criterion(
      'netWorth',
      label,
      'pass',
      shown,
      'Tamanho que dilui a dependência de um imóvel só e dá liquidez à cota',
    );
  }
  return criterion(
    'netWorth',
    label,
    'fail',
    shown,
    'Fundo pequeno: um imóvel vazio pesa demais no resultado, e a cota negocia pouco',
  );
}

function years(count: number): string {
  return `${count} ${count === 1 ? 'ano' : 'anos'}`;
}

export function listingAge(record: DividendRecord | null, profile: FundProfile): Criterion {
  const label = 'Mais de 5 anos de bolsa';

  if (record && record.consecutiveYears >= LISTING_YEARS) {
    return criterion(
      'listing',
      label,
      'pass',
      `${years(record.consecutiveYears)} seguidos pagando`,
      'Atravessou 2020 e o ciclo de juros altos distribuindo renda todos os anos',
    );
  }

  if (record && record.yearsPaid > 0) {
    const detail =
      profile.listedOver5Years === true
        ? `Listado há mais de 5 anos, mas só ${years(record.consecutiveYears)} seguidos pagando — houve ano sem renda pelo caminho`
        : `Só ${years(record.consecutiveYears)} completos pagando: ainda não mostrou como se comporta numa crise`;
    return criterion('listing', label, 'fail', `${years(record.consecutiveYears)} seguidos pagando`, detail);
  }

  if (profile.listedOver5Years === true) {
    return criterion(
      'listing',
      label,
      'pass',
      'mais de 5 anos listado',
      'Segundo o Investidor10. O histórico de pagamentos não pôde ser lido, então a regularidade da renda fica por conferir',
    );
  }
  if (profile.listedOver5Years === false) {
    return criterion(
      'listing',
      label,
      'fail',
      'menos de 5 anos listado',
      'Ainda não passou por uma crise nem por um ciclo completo de juros distribuindo renda',
    );
  }

  return criterion('listing', label, 'unknown', null, 'Sem histórico de pagamentos nem data de listagem nas fontes');
}

/** Two decimals: 1,15% and 1,20% sit on opposite sides of the ceiling. */
function formatFee(fee: number): string {
  return `${(fee * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}% ao ano`;
}

export function totalCost(profile: FundProfile): Criterion {
  const label = 'Custo total até 1,15% ao ano';
  const published = 'A fonte publica só a taxa de administração; gestão e performance podem ser cobradas à parte — confira o regulamento';

  if (profile.adminFee === null) {
    return criterion(
      'cost',
      label,
      'unknown',
      profile.adminFeeText,
      profile.adminFeeText
        ? 'Taxa publicada sem um percentual ao ano legível'
        : 'Nenhuma fonte informou a taxa do fundo',
    );
  }

  const shown = formatFee(profile.adminFee);
  if (profile.adminFee <= COST_CEILING) {
    return criterion('cost', label, 'pass', shown, `Taxa dentro do limite. ${published}`);
  }
  return criterion(
    'cost',
    label,
    'fail',
    shown,
    `Taxa alta come a renda: acima de 1,15% ao ano só se justifica com histórico de resultado. ${published}`,
  );
}

export function referenceManager(name: string | null): boolean {
  if (!name) return false;
  const key = labelKey(name);
  return REFERENCE_MANAGERS.some((m) => key.includes(labelKey(m)));
}

export function managerTier(profile: FundProfile): Criterion {
  const label = 'Gestora de primeira linha';
  if (!profile.manager) {
    return criterion(
      'manager',
      label,
      'unknown',
      null,
      'Nenhuma fonte nomeou a gestora — procure no relatório gerencial quem gere o fundo e há quanto tempo',
    );
  }
  if (referenceManager(profile.manager)) {
    return criterion(
      'manager',
      label,
      'pass',
      profile.manager,
      'Gestora com histórico público longo em fundos imobiliários listados',
    );
  }
  return criterion(
    'manager',
    label,
    'unknown',
    profile.manager,
    'Gestora fora da lista de referência do radar. Isso não é demérito: confira o histórico dela em outros fundos, a clareza dos relatórios e a governança',
  );
}

export function lowVacancy(f: Fundamentals, profile: FundProfile): Criterion {
  const label = 'Vacância baixa e estável';
  if (isPaperFund(profile)) {
    return criterion('vacancy', label, 'unknown', null, 'Não se aplica: o fundo não tem imóveis para ficarem vazios');
  }
  if (f.vacancy === null) {
    return criterion('vacancy', label, 'unknown', null, 'Nenhuma fonte informou a vacância');
  }
  const shown = formatPercent(f.vacancy);
  if (f.vacancy < VACANCY_CEILING) {
    return criterion(
      'vacancy',
      label,
      'pass',
      shown,
      'Pouca área sem inquilino. Se ela é estável, só o histórico do relatório gerencial mostra',
    );
  }
  return criterion(
    'vacancy',
    label,
    'fail',
    shown,
    'Área demais sem inquilino — aluguel que não entra e condomínio que o fundo paga sozinho',
  );
}

export function bookDiscount(f: Fundamentals): Criterion {
  const label = 'P/VP abaixo de 1';
  if (f.priceToBook === null) {
    return criterion('discount', label, 'unknown', null, 'Nenhuma fonte informou o P/VP');
  }
  const shown = `${formatMultiple(f.priceToBook)}×`;
  if (f.priceToBook < 1) {
    return criterion('discount', label, 'pass', shown, 'Compra o imóvel por menos do que ele vale no laudo');
  }
  return criterion('discount', label, 'fail', shown, 'Paga o imóvel pelo valor do laudo ou acima dele — sem desconto na entrada');
}

export function rentBackedIncome(f: Fundamentals): Criterion {
  const label = 'Dividendo sustentado pelo aluguel';
  const ratio = payoutOverFfo(f);
  if (ratio === null) {
    return criterion('rentBacked', label, 'unknown', null, 'Sem FFO na fonte para comparar com o que o fundo paga');
  }
  const shown = `${formatPercent(ratio)} do FFO`;
  if (ratio <= COVERED_PAYOUT_FFO) {
    return criterion('rentBacked', label, 'pass', shown, 'O que paga cabe no que arrecada de aluguel e juros — não depende de vender imóvel');
  }
  return criterion(
    'rentBacked',
    label,
    'fail',
    shown,
    'Paga mais do que arrecada de aluguel e juros: a diferença vem de venda de ativo ou do caixa, e isso não se repete',
  );
}

export interface ScreenInput {
  profile: FundProfile | null;
  fundamentals: Fundamentals;
  dividends: DividendRecord | null;
}

export function screenFund(input: ScreenInput): FundScreen {
  const profile = input.profile ?? emptyFundProfile();

  const filters = [
    resilientSegment(profile),
    netWorthScale(profile),
    listingAge(input.dividends, profile),
    totalCost(profile),
    managerTier(profile),
  ];

  const tiebreakers = [
    lowVacancy(input.fundamentals, profile),
    bookDiscount(input.fundamentals),
    rentBackedIncome(input.fundamentals),
  ];

  const passed = filters.filter((c) => c.status === 'pass').length;
  const unknown = filters.filter((c) => c.status === 'unknown').length;

  return { filters, tiebreakers, passed, unknown, passedAll: passed === filters.length };
}

/** One line for the badge: how far through the filters the fund got. */
export function describeScreen(screen: FundScreen): string {
  if (screen.passedAll) return `Passou nos ${screen.filters.length} filtros`;
  const base = `Passou em ${screen.passed} de ${screen.filters.length} filtros`;
  return screen.unknown > 0 ? `${base} · ${screen.unknown} sem dado` : base;
}

/** The first source carrying a fact wins, like the fundamentals merge. Nothing is estimated. */
export function mergeFundProfiles(readings: SourceReading[]): FundProfile | null {
  const merged = emptyFundProfile();
  let any = false;

  for (const reading of readings) {
    if (!reading.fund) continue;
    for (const key of Object.keys(merged) as (keyof FundProfile)[]) {
      if (merged[key] !== null) continue;
      const value = reading.fund[key];
      if (value === undefined || value === null) continue;
      (merged as Record<keyof FundProfile, unknown>)[key] = value;
      any = true;
    }
  }

  return any ? merged : null;
}

/**
 * The tiebreaker that no single fund can answer: two funds in the same segment duplicate
 * risk instead of spreading it. Evaluated over whatever set was analysed together.
 */
export function segmentOverlaps(items: { ticker: string; segment: string | null }[]): string[] {
  const groups = new Map<string, { name: string; tickers: string[] }>();

  for (const item of items) {
    if (!item.segment) continue;
    const key = labelKey(item.segment);
    const group = groups.get(key) ?? { name: item.segment, tickers: [] };
    group.tickers.push(item.ticker);
    groups.set(key, group);
  }

  return [...groups.values()]
    .filter((g) => g.tickers.length > 1)
    .map(
      (g) =>
        `${listInPortuguese(g.tickers)} são do mesmo segmento (${g.name}) — o desempate pede um fundo por segmento, para diversificar`,
    );
}

/** "a, b e c" — the sentence reads wrong with an "e" between every pair. */
export function listInPortuguese(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}
