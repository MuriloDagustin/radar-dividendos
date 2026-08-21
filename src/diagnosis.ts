import type {
  Assessment,
  AssetKind,
  Band,
  Category,
  Diagnosis,
  DividendRecord,
  Fundamentals,
  Indicator,
  IndicatorGroup,
  LeverageTrend,
  PeerContext,
  PeerMap,
  Signal,
  Verdict,
} from './types';

/**
 * The band tables are the single source of truth for the rules: the engine evaluates from
 * them and the interface ruler is drawn from them, so a bound cannot drift from its drawing.
 *
 * On every exact bound the value falls into the more favourable band — which is why
 * `toInclusive` appears only where the upper bound is still the better reading
 * (DY 0.13, payout 1.0, net debt/EBITDA 3.5, P/B 2.5).
 */

export const BANDS_DIVIDEND_YIELD: readonly Band[] = [
  { from: null, to: 0.03, signal: 'bad', label: 'baixo', message: 'Baixo p/ carteira de renda' },
  { from: 0.03, to: 0.06, signal: 'warn', label: 'moderado', message: 'Moderado' },
  { from: 0.06, to: 0.13, toInclusive: true, signal: 'ok', label: 'faixa boa', message: 'Faixa boa' },
  { from: 0.13, to: null, signal: 'warn', label: 'alto demais', message: 'Alto demais — investigar' },
];

export const BANDS_PAYOUT: readonly Band[] = [
  { from: null, to: 0.25, signal: 'warn', label: 'abaixo do usual', message: 'Abaixo do mínimo usual' },
  { from: 0.25, to: 0.4, signal: 'warn', label: 'reinvestindo', message: 'Baixo — reinvestindo' },
  { from: 0.4, to: 1, toInclusive: true, signal: 'ok', label: 'saudável', message: 'Saudável' },
  { from: 1, to: null, signal: 'bad', label: 'insustentável', message: 'Acima de 100% — insustentável' },
];

export const BANDS_NET_DEBT_TO_EBITDA: readonly Band[] = [
  { from: null, to: 0, signal: 'ok', label: 'caixa líquido', message: 'Caixa líquido' },
  { from: 0, to: 1.5, toInclusive: true, signal: 'ok', label: 'confortável', message: 'Confortável' },
  { from: 1.5, to: 2.5, toInclusive: true, signal: 'ok', label: 'normal', message: 'Normal' },
  { from: 2.5, to: 3.5, toInclusive: true, signal: 'warn', label: 'atenção', message: 'Atenção (covenants)' },
  { from: 3.5, to: null, signal: 'bad', label: 'alavancada', message: 'Alavancagem alta' },
];

export const BANDS_PRICE_TO_BOOK: readonly Band[] = [
  { from: null, to: 0.8, signal: 'warn', label: 'descontada', message: 'Descontada — entender por quê' },
  { from: 0.8, to: 2.5, toInclusive: true, signal: 'ok', label: 'razoável', message: 'Faixa razoável' },
  { from: 2.5, to: null, signal: 'warn', label: 'esticada', message: 'Preço esticado' },
];

export const BANDS_ROE: readonly Band[] = [
  { from: null, to: 0.08, signal: 'warn', label: 'fraca', message: 'Rentabilidade fraca' },
  { from: 0.08, to: 0.15, signal: 'ok', label: 'ok', message: 'Rentabilidade ok' },
  { from: 0.15, to: null, signal: 'ok', label: 'forte', message: 'Rentabilidade forte' },
];

/**
 * A fund's yield sits on a different scale from a company's: 6% is thin for a FII and 15%
 * is ordinary, where the same numbers would read as good and suspicious on a stock.
 */
export const BANDS_DIVIDEND_YIELD_FII: readonly Band[] = [
  { from: null, to: 0.06, signal: 'warn', label: 'baixo', message: 'Baixo p/ FII' },
  { from: 0.06, to: 0.16, toInclusive: true, signal: 'ok', label: 'faixa normal', message: 'Faixa normal p/ FII' },
  {
    from: 0.16,
    to: null,
    signal: 'warn',
    label: 'acima do mercado',
    message: 'Muito acima do mercado — risco de crédito ou distribuição não recorrente',
  },
];

/**
 * A fund is a portfolio marked to its own book value, so it trades near 1.00 by nature. The
 * 1.05–1.10 band closes a gap the spec left open, taking the more favourable reading.
 */
export const BANDS_PRICE_TO_BOOK_FII: readonly Band[] = [
  {
    from: null,
    to: 0.85,
    signal: 'warn',
    label: 'descontada',
    message: 'Descontada — mercado precificando risco, investigar relatório gerencial',
  },
  { from: 0.85, to: 1.05, toInclusive: true, signal: 'ok', label: 'em linha', message: 'Em linha com patrimônio' },
  { from: 1.05, to: 1.1, toInclusive: true, signal: 'ok', label: 'leve ágio', message: 'Leve ágio sobre patrimônio' },
  { from: 1.1, to: null, signal: 'warn', label: 'ágio', message: 'Ágio sobre patrimônio' },
];

/** A bank's return on equity is the core reading, so the ruler is stricter than the general one. */
export const BANDS_ROE_FINANCIAL: readonly Band[] = [
  { from: null, to: 0.12, signal: 'warn', label: 'fraca', message: 'Rentabilidade fraca' },
  { from: 0.12, to: 0.18, signal: 'ok', label: 'ok', message: 'Rentabilidade ok' },
  { from: 0.18, to: null, signal: 'ok', label: 'forte', message: 'Rentabilidade forte' },
];

/**
 * Consecutive complete years with a payment. Five years is the usual bar for calling an
 * income stream established; below three there is not enough record to judge. These bounds
 * are ours, not something a source publishes.
 */
export const BANDS_DIVIDEND_STREAK: readonly Band[] = [
  { from: null, to: 3, signal: 'warn', label: 'curto', message: 'Histórico curto — menos de 3 anos completos' },
  { from: 3, to: 5, signal: 'ok', label: 'regular', message: 'Pagamento regular' },
  { from: 5, to: null, signal: 'ok', label: 'estabelecido', message: 'Pagamento estabelecido' },
];

/** Zero is the only bound here: a shrinking bottom line cannot fund a growing dividend. */
export const BANDS_PROFIT_CAGR: readonly Band[] = [
  { from: null, to: 0, signal: 'warn', label: 'encolhendo', message: 'Lucro encolhendo em 5 anos' },
  { from: 0, to: null, signal: 'ok', label: 'crescendo', message: 'Lucro crescendo em 5 anos' },
];

/** A fund's real payout, measured against FFO because it reports no accounting profit. */
export const BANDS_PAYOUT_FFO: readonly Band[] = [
  { from: null, to: 0.85, signal: 'ok', label: 'retendo', message: 'Retendo parte do resultado' },
  { from: 0.85, to: 1.05, toInclusive: true, signal: 'ok', label: 'coberta', message: 'Distribuição coberta pelo FFO' },
  {
    from: 1.05,
    to: 1.5,
    toInclusive: true,
    signal: 'warn',
    label: 'acima do FFO',
    message: 'Distribuindo acima do FFO — consumindo reserva ou ganho de capital',
  },
  /**
   * Beyond half again the operating result the distribution is not a period effect. Leaving
   * this at a warning let a fund paying out more than twice its FFO be headlined solid, and
   * a verdict that contradicts its own panel is the worst failure this tool has.
   */
  {
    from: 1.5,
    to: null,
    signal: 'bad',
    label: 'muito acima',
    message: 'Distribuição muito acima do FFO — não sustentada pelo resultado recorrente',
  },
];

export function bandFor(bands: readonly Band[], value: number): Band | null {
  return (
    bands.find(
      (b) =>
        (b.from === null || value >= b.from) &&
        (b.to === null || (b.toInclusive ? value <= b.to : value < b.to)),
    ) ?? null
  );
}

function assessWith(bands: readonly Band[], value: number | null): Assessment | null {
  if (value === null) return null;
  const band = bandFor(bands, value);
  return band ? { signal: band.signal, message: band.message } : null;
}

export function assessDividendYield(dy: number | null): Assessment | null {
  return assessWith(BANDS_DIVIDEND_YIELD, dy);
}

export function assessPayout(payout: number | null): Assessment | null {
  return assessWith(BANDS_PAYOUT, payout);
}

export function assessNetDebtToEbitda(ratio: number | null): Assessment | null {
  return assessWith(BANDS_NET_DEBT_TO_EBITDA, ratio);
}

export function assessPriceToBook(pb: number | null): Assessment | null {
  return assessWith(BANDS_PRICE_TO_BOOK, pb);
}

export function assessRoe(roe: number | null, category: Category = 'evergreen'): Assessment | null {
  return assessWith(category === 'financial' ? BANDS_ROE_FINANCIAL : BANDS_ROE, roe);
}

export function dividendYieldBands(isFund: boolean): readonly Band[] {
  return isFund ? BANDS_DIVIDEND_YIELD_FII : BANDS_DIVIDEND_YIELD;
}

export function priceToBookBands(isFund: boolean): readonly Band[] {
  return isFund ? BANDS_PRICE_TO_BOOK_FII : BANDS_PRICE_TO_BOOK;
}

/** Positive means the fund pays more than the risk-free rate; negative means it pays less. */
export function cdiSpread(dividendYield: number | null, cdiAnnual: number | null): number | null {
  if (dividendYield === null || cdiAnnual === null) return null;
  return dividendYield - cdiAnnual;
}

/**
 * With EBITDA at zero or below the ratio has no reading — returns null instead of a
 * multiple with an inverted sign.
 */
export function computeNetDebtToEbitda(
  netDebt: number | null,
  ebitda: number | null,
): number | null {
  if (netDebt === null || ebitda === null) return null;
  if (ebitda <= 0) return null;
  return netDebt / ebitda;
}

/**
 * A published ratio beats a derived one: the sources use different EBITDA windows, and
 * dividing one place's debt by another place's EBITDA invents a number nobody published.
 */
export function resolveNetDebtToEbitda(f: Fundamentals): number | null {
  return f.netDebtToEbitda ?? computeNetDebtToEbitda(f.netDebt, f.ebitda);
}

export const MESSAGES = {
  noData: 'Sem dado na fonte',
  informational: 'Informativo — sem faixa de referência',
  notApplicableFii: 'Não se aplica a FII',
  notApplicableFinancial:
    'EBITDA e dívida não se aplicam a banco/seguradora — alavancagem é a natureza do negócio, regulada por Basileia',
  unreliableCyclicalPayout:
    'lucro contábil deprimido/distorcido — payout sobre lucro não é confiável; verificar política de dividendos da empresa, geralmente baseada em EBITDA ou FCL',
  unreliableCyclicalRoe:
    'lucro contábil deprimido/distorcido no fundo do ciclo — ROE sobre esse lucro não mede a rentabilidade do negócio',
  unreliableNonRecurring:
    'lucro do período possivelmente afetado por evento não recorrente — conferir release de resultados',
  cyclicalYield:
    'dividendo cíclico — varia com preço da commodity, não projetar como renda estável',
  deleveraging: 'Alavancagem alta, em desalavancagem',
  leveragingUp: 'Alavancagem alta e subindo',
  holdingDiscount: 'Desconto de holding (estrutural)',
  holdingNote:
    'Holding — cotação costuma embutir desconto sobre o valor das participações; P/VP baixo aqui é estrutural, não necessariamente barganha',
  fiiNote:
    'FII distribui ≥95% do resultado por obrigação legal — conferir no relatório gerencial a composição da distribuição (juros vs ganho de capital) e inadimplência da carteira',
  cdiSpread: 'Compare o prêmio sobre o CDI, não o yield absoluto',
  cdiMissing: 'Sem taxa CDI para comparar',
  noHistory: 'Sem histórico de proventos na fonte',
  variation: 'Dispersão do provento anual — quanto maior, menos previsível a renda',
  interestOnCapital: 'Fatia paga como JCP nos últimos 12 meses, que é tributada na fonte',
  nextPayment: 'Próximo pagamento já declarado',
  perShare: 'Provento por ação no último ano completo',
  rangePosition: 'Posição do preço na faixa de 52 semanas',
  inconclusive:
    'dados insuficientes ou distorcidos para diagnóstico automático — análise manual necessária',
} as const;

/**
 * A profit figure that cannot be trusted as a denominator. Any of: an earnings multiple so
 * high the profit is clearly depressed, negative earnings behind a dividend, or near-zero
 * return on equity alongside a real dividend — each points at a bottom line distorted by
 * something that is not the operation.
 *
 * A *missing* earnings multiple is treated as evidence only when nothing else vouches for
 * the profit. Sources do omit P/L when earnings are negative, but they also just omit it;
 * reading absence as distortion would mark a healthy 18% ROE company unreliable, and
 * absence is never a value here.
 */
export function distortedProfit(input: {
  priceEarnings: number | null;
  roe: number | null;
  dividendYield: number | null;
}): boolean {
  const { priceEarnings, roe, dividendYield } = input;
  const paysDividend = dividendYield !== null && dividendYield > 0;
  const profitVouchedFor = roe !== null && roe > 0.03;

  if (priceEarnings !== null && priceEarnings > 40) return true;
  if (priceEarnings !== null && priceEarnings < 0 && paysDividend) return true;
  if (priceEarnings === null && paysDividend && !profitVouchedFor) return true;
  if (roe !== null && roe < 0.03 && dividendYield !== null && dividendYield > 0.05) return true;

  return false;
}

/**
 * Reads the direction of a leverage series ordered oldest to newest. Two consecutive drops
 * are the threshold for calling it deleveraging — one period is noise.
 */
export function leverageTrend(series: readonly number[]): LeverageTrend {
  const clean = series.filter((v) => Number.isFinite(v));
  if (clean.length < 3) return 'unknown';

  const steps: number[] = [];
  for (let i = 1; i < clean.length; i += 1) {
    steps.push((clean[i] as number) - (clean[i - 1] as number));
  }

  const lastTwo = steps.slice(-2);
  if (lastTwo.length < 2) return 'unknown';
  if (lastTwo.every((s) => s < 0)) return 'falling';
  if (lastTwo.every((s) => s > 0)) return 'rising';
  return 'flat';
}

/**
 * A cyclical that is highly leveraged but paying the debt down for two periods is a
 * different story from one still piling it on, so the trend can soften `bad` to `warn`.
 */
export function applyLeverageTrend(
  assessment: Assessment | null,
  trend: LeverageTrend,
): Assessment | null {
  if (!assessment || assessment.signal !== 'bad') return assessment;
  if (trend === 'falling') return { signal: 'warn', message: MESSAGES.deleveraging };
  if (trend === 'rising') return { signal: 'bad', message: MESSAGES.leveragingUp };
  return assessment;
}

export function minimumForVerdict(applicable: number): number {
  return Math.max(2, Math.ceil(applicable / 2));
}

/** How many distorted readings alone tip the whole panel into inconclusive. */
export const UNRELIABLE_LIMIT = 3;

/**
 * The one indicator a category cannot be judged without. A bank read without its return on
 * equity is not a mild gap: it is the whole thesis missing, so no positive verdict follows.
 */
export const CRITICAL_INDICATOR: Partial<Record<Category, string>> = {
  financial: 'roe',
};

/**
 * Precedence: a confirmed `bad` or a pair of `warn` are affirmative findings and stand even
 * on thin coverage. After those, distortion is what makes a panel inconclusive — either
 * enough distorted readings on their own, or any distortion on a panel that no longer has
 * the coverage to conclude. `na` is deliberately not counted: it is structural and expected
 * (a FII has no ROE), and counting it would make every fund inconclusive.
 *
 * `solid` still demands coverage, because calling a paper solid when nothing is known about
 * it is the worst error this tool can make.
 */
export function decideVerdict(
  signals: (Signal | null)[],
  coverage: { applicable: number; present: number; unreliable: number },
  criticalUnreadable = false,
): Verdict {
  const present = signals.filter((s): s is Signal => s !== null);
  if (present.includes('bad')) return 'fragile';
  if (present.filter((s) => s === 'warn').length >= 2) return 'attention';

  const minimum = minimumForVerdict(coverage.applicable);
  if (coverage.unreliable >= UNRELIABLE_LIMIT) return 'inconclusive';
  if (criticalUnreadable) return 'inconclusive';
  if (coverage.unreliable > 0 && coverage.present < minimum) return 'inconclusive';
  if (coverage.present >= minimum) return 'solid';
  return 'indeterminate';
}

interface IndicatorInput {
  key: string;
  label: string;
  value: number | null;
  format: Indicator['format'];
  bands: readonly Band[] | null;
  group?: IndicatorGroup;
  peers?: PeerContext;
  /** Replaces the generic "no data" line when absence has a specific reason. */
  emptyMessage?: string;
  /** Set to bypass the bands entirely with a fixed reading (na / unrel). */
  override?: Assessment;
  /** Applied after the bands, to soften or reword a band result. */
  adjust?: (a: Assessment | null) => Assessment | null;
}

function buildIndicator(input: IndicatorInput): Indicator {
  const { key, label, value, format, bands, override, adjust, group, peers, emptyMessage } = input;

  const fromBands = bands ? assessWith(bands, value) : null;
  const assessment = override ?? (adjust ? adjust(fromBands) : fromBands);

  const message = assessment
    ? assessment.message
    : value === null
      ? (emptyMessage ?? MESSAGES.noData)
      : MESSAGES.informational;

  return {
    key,
    label,
    group: group ?? 'core',
    // A reading with no meaning must not show a number that invites reading it anyway.
    value: assessment?.signal === 'na' ? null : value,
    format,
    bands: bands ?? null,
    signal: assessment?.signal ?? null,
    message,
    ...(peers ? { peers } : {}),
  };
}

/** Reads like the banded rows but carries no signal: shown, never weighed. */
function contextRow(
  key: string,
  label: string,
  value: number | null,
  format: Indicator['format'],
  message: string,
  emptyMessage?: string,
): Indicator {
  return {
    key,
    label,
    group: 'context',
    value,
    format,
    bands: null,
    signal: null,
    message: value === null ? (emptyMessage ?? MESSAGES.noData) : message,
  };
}

export interface DiagnoseOptions {
  kind?: AssetKind;
  category?: Category;
  /** Leverage series, oldest to newest, when a history could be read. */
  leverageHistory?: readonly number[];
  /** Annualized CDI as a fraction, for the fund's premium over the risk-free rate. */
  cdiAnnual?: number;
  /** What the dividend history says, when one could be read. */
  dividends?: DividendRecord | null;
  /** Sector medians per indicator key. */
  peers?: PeerMap;
}

/**
 * A fund's payout measured against FFO instead of profit. Both come from the same sheet and
 * the same period, so the ratio is exact rather than a cross-source guess.
 */
export function payoutOverFfo(f: Fundamentals): number | null {
  if (f.dividendYield12m === null || f.ffoYield === null || f.ffoYield <= 0) return null;
  return f.dividendYield12m / f.ffoYield;
}

/** Where the price sits between the 52-week low and high, as a fraction. */
export function positionIn52Weeks(f: Fundamentals): number | null {
  const { price, low52w, high52w } = f;
  if (price === null || low52w === null || high52w === null) return null;
  if (high52w <= low52w) return null;
  return (price - low52w) / (high52w - low52w);
}

/** Indicators that carry no meaning inside a real estate fund. */
const NOT_APPLICABLE_TO_FII = new Set(['payout', 'netDebtToEbitda', 'roe']);

export function diagnose(f: Fundamentals, options: DiagnoseOptions = {}): Diagnosis {
  const kind = options.kind ?? 'stock';
  const category = options.category ?? 'evergreen';
  // Either signal is enough: the sources may confirm the kind, or the sector may say fund.
  const isFund = kind === 'fii' || category === 'fii';
  const ratio = resolveNetDebtToEbitda(f);

  const trend = options.leverageHistory
    ? leverageTrend(options.leverageHistory)
    : ('unknown' as LeverageTrend);

  const distorted = distortedProfit({
    priceEarnings: f.priceEarnings,
    roe: f.roe,
    dividendYield: f.dividendYield12m,
  });

  /**
   * Same cause, worded for the indicator being read: saying "payout is unreliable" on the
   * ROE row would name the wrong number.
   */
  function distortionReason(key: string): string {
    if (category !== 'cyclical') return MESSAGES.unreliableNonRecurring;
    return key === 'roe' ? MESSAGES.unreliableCyclicalRoe : MESSAGES.unreliableCyclicalPayout;
  }

  const naFii: Assessment = { signal: 'na', message: MESSAGES.notApplicableFii };
  const naFinancial: Assessment = { signal: 'na', message: MESSAGES.notApplicableFinancial };

  function overrideFor(key: string): Assessment | undefined {
    if (isFund && NOT_APPLICABLE_TO_FII.has(key)) return naFii;
    if (category === 'financial' && key === 'netDebtToEbitda') return naFinancial;
    // A distorted bottom line poisons anything divided by profit, whatever the sector.
    if (distorted && (key === 'payout' || key === 'roe')) {
      return { signal: 'unrel', message: distortionReason(key) };
    }
    return undefined;
  }

  const peers = options.peers ?? {};

  function withOverride(input: IndicatorInput): Indicator {
    const override = overrideFor(input.key);
    const peer = peers[input.key];
    return buildIndicator({
      ...input,
      ...(override ? { override } : {}),
      ...(peer ? { peers: peer } : {}),
    });
  }

  const indicators: Indicator[] = [
    buildIndicator({ key: 'price', label: 'Preço', value: f.price, format: 'currency', bands: null }),

    withOverride({
      key: 'dividendYield12m',
      label: 'Dividend Yield 12m',
      value: f.dividendYield12m,
      format: 'percent',
      bands: dividendYieldBands(isFund),
      // A commodity-driven payout is not the stable income the band implies.
      ...(category === 'cyclical'
        ? {
            adjust: (a: Assessment | null) =>
              a?.signal === 'ok' ? { signal: 'warn' as Signal, message: MESSAGES.cyclicalYield } : a,
          }
        : {}),
    }),

    withOverride({
      key: 'payout',
      label: 'Payout',
      value: f.payout,
      format: 'percent',
      bands: BANDS_PAYOUT,
    }),

    withOverride({
      key: 'netDebtToEbitda',
      label: 'Dívida líq./EBITDA',
      value: ratio,
      format: 'multiple',
      bands: BANDS_NET_DEBT_TO_EBITDA,
      ...(category === 'cyclical'
        ? { adjust: (a: Assessment | null) => applyLeverageTrend(a, trend) }
        : {}),
    }),

    withOverride({
      key: 'priceToBook',
      label: 'P/VP',
      value: f.priceToBook,
      format: 'multiple',
      bands: priceToBookBands(isFund),
      // A holding trades below book by construction, so the discount is not a red flag.
      ...(category === 'holding'
        ? {
            adjust: (a: Assessment | null) =>
              f.priceToBook !== null && f.priceToBook < 0.8
                ? { signal: 'ok' as Signal, message: MESSAGES.holdingDiscount }
                : a,
          }
        : {}),
    }),

    withOverride({
      key: 'roe',
      label: 'ROE',
      value: f.roe,
      format: 'percent',
      bands: category === 'financial' ? BANDS_ROE_FINANCIAL : BANDS_ROE,
    }),

    buildIndicator({
      key: 'priceEarnings',
      label: 'P/L',
      value: f.priceEarnings,
      format: 'multiple',
      bands: null,
    }),
  ];

  const record = options.dividends ?? null;

  // Consistency is the thing a snapshot cannot show, and the thing income depends on.
  indicators.push(
    buildIndicator({
      key: 'dividendStreak',
      label: 'Anos seguidos pagos',
      value: record?.consecutiveYears ?? null,
      format: 'count',
      bands: BANDS_DIVIDEND_STREAK,
      emptyMessage: MESSAGES.noHistory,
    }),
  );

  // A fund reports no accounting profit, so its payout is measured against FFO.
  if (isFund) {
    indicators.push(
      buildIndicator({
        key: 'payoutFfo',
        label: 'Payout s/ FFO',
        value: payoutOverFfo(f),
        format: 'percent',
        bands: BANDS_PAYOUT_FFO,
      }),
    );
  } else {
    indicators.push(
      withOverride({
        key: 'profitCagr5y',
        label: 'CAGR lucro 5a',
        value: f.profitCagr5y,
        format: 'percent',
        bands: BANDS_PROFIT_CAGR,
      }),
    );
  }

  // The premium over the risk-free rate is what makes a fund's yield comparable at all.
  if (isFund) {
    const spread = cdiSpread(f.dividendYield12m, options.cdiAnnual ?? null);
    indicators.push(
      contextRow('dyVsCdi', 'DY − CDI', spread, 'percent', MESSAGES.cdiSpread, MESSAGES.cdiMissing),
    );
  }

  indicators.push(
    contextRow(
      'dividendPerShare',
      'Provento/ação (últ. ano)',
      record?.lastFullYear?.amount ?? null,
      'currency',
      MESSAGES.perShare,
    ),
    contextRow(
      'dividendVariation',
      'Variação do provento',
      record?.variation ?? null,
      'percent',
      MESSAGES.variation,
    ),
    contextRow(
      'interestOnCapitalShare',
      'Fatia em JCP',
      record?.interestOnCapitalShare ?? null,
      'percent',
      MESSAGES.interestOnCapital,
    ),
    contextRow('roic', 'ROIC', f.roic, 'percent', MESSAGES.informational),
    contextRow('netMargin', 'Margem líquida', f.netMargin, 'percent', MESSAGES.informational),
    contextRow('ebitdaMargin', 'Margem EBITDA', f.ebitdaMargin, 'percent', MESSAGES.informational),
    contextRow('currentRatio', 'Liquidez corrente', f.currentRatio, 'multiple', MESSAGES.informational),
    contextRow('netDebtToEquity', 'Dív. líq./Patrimônio', f.netDebtToEquity, 'multiple', MESSAGES.informational),
    contextRow('revenueCagr5y', 'CAGR receita 5a', f.revenueCagr5y, 'percent', MESSAGES.informational),
    contextRow('range52w', 'Posição na faixa 52s', positionIn52Weeks(f), 'percent', MESSAGES.rangePosition),
  );

  if (isFund) {
    indicators.push(
      contextRow('vacancy', 'Vacância', f.vacancy, 'percent', MESSAGES.informational),
      contextRow('ffoYield', 'FFO Yield', f.ffoYield, 'percent', MESSAGES.informational),
    );
  }

  const counts: Record<Signal, number> = { ok: 0, warn: 0, bad: 0, na: 0, unrel: 0 };
  for (const i of indicators) {
    if (i.signal) counts[i.signal] += 1;
  }

  const banded = indicators.filter((i) => i.bands !== null && i.group === 'core');
  const applicable = banded.filter((i) => i.signal !== 'na').length;
  const present = banded.filter(
    (i) => i.signal === 'ok' || i.signal === 'warn' || i.signal === 'bad',
  ).length;
  const notApplicable = banded.filter((i) => i.signal === 'na').length;
  const unreliable = banded.filter((i) => i.signal === 'unrel').length;

  const coverage = {
    applicable,
    present,
    notApplicable,
    unreliable,
    minimumForVerdict: minimumForVerdict(applicable),
  };

  const criticalKey = CRITICAL_INDICATOR[category];
  const critical = criticalKey ? indicators.find((i) => i.key === criticalKey) : undefined;
  const criticalUnreadable =
    critical !== undefined && critical.signal !== null && critical.signal === 'unrel';

  return {
    indicators,
    counts,
    verdict: decideVerdict(
      indicators.map((i) => i.signal),
      coverage,
      criticalUnreadable,
    ),
    coverage,
  };
}

/** Remarks about the company itself, shown above the indicators. */
export function categoryNotes(category: Category): string[] {
  if (category === 'holding') return [MESSAGES.holdingNote];
  if (category === 'fii') return [MESSAGES.fiiNote];
  return [];
}
