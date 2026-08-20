import type {
  Assessment,
  AssetKind,
  Band,
  Diagnosis,
  Fundamentals,
  Indicator,
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

export function assessRoe(roe: number | null): Assessment | null {
  return assessWith(BANDS_ROE, roe);
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

/**
 * How many indicators must be filled in for the verdict to stand: half of those that
 * apply, floored at two — a single indicator sustains no conclusion at all.
 */
export function minimumForVerdict(applicable: number): number {
  return Math.max(2, Math.ceil(applicable / 2));
}

/**
 * `bad` and `warn` are affirmative findings and stand on their own. `solid` is a positive
 * claim and demands coverage: without enough indicators the verdict is `indeterminate`,
 * never `solid` — calling a paper solid when nothing is known about it is the worst error
 * this tool can make.
 */
export function decideVerdict(signals: (Signal | null)[], applicable: number): Verdict {
  const present = signals.filter((s): s is Signal => s !== null);
  if (present.includes('bad')) return 'fragile';
  if (present.filter((s) => s === 'warn').length >= 2) return 'attention';
  if (present.length >= minimumForVerdict(applicable)) return 'solid';
  return 'indeterminate';
}

export const NO_DATA = 'Sem dado na fonte';
export const INFORMATIONAL = 'Informativo — sem faixa de referência';
export const NOT_APPLICABLE = 'Não se aplica a FII';

/** Banded indicators that make no sense for a real estate fund. */
const NOT_APPLICABLE_TO_FII = new Set(['payout', 'netDebtToEbitda', 'roe']);

function indicator(
  key: string,
  label: string,
  value: number | null,
  format: Indicator['format'],
  bands: readonly Band[] | null,
  kind: AssetKind,
): Indicator {
  const applicable = !(kind === 'fii' && NOT_APPLICABLE_TO_FII.has(key));
  const assessment = bands && applicable ? assessWith(bands, value) : null;

  const message = assessment
    ? assessment.message
    : !applicable
      ? NOT_APPLICABLE
      : value === null
        ? NO_DATA
        : INFORMATIONAL;

  return {
    key,
    label,
    value: applicable ? value : null,
    format,
    bands: bands ?? null,
    applicable,
    signal: assessment?.signal ?? null,
    message,
  };
}

export function diagnose(f: Fundamentals, kind: AssetKind = 'stock'): Diagnosis {
  const netDebtToEbitda = resolveNetDebtToEbitda(f);

  const indicators: Indicator[] = [
    indicator('price', 'Preço', f.price, 'currency', null, kind),
    indicator('dividendYield12m', 'Dividend Yield 12m', f.dividendYield12m, 'percent', BANDS_DIVIDEND_YIELD, kind),
    indicator('payout', 'Payout', f.payout, 'percent', BANDS_PAYOUT, kind),
    indicator('netDebtToEbitda', 'Dívida líq./EBITDA', netDebtToEbitda, 'multiple', BANDS_NET_DEBT_TO_EBITDA, kind),
    indicator('priceToBook', 'P/VP', f.priceToBook, 'multiple', BANDS_PRICE_TO_BOOK, kind),
    indicator('roe', 'ROE', f.roe, 'percent', BANDS_ROE, kind),
    indicator('priceEarnings', 'P/L', f.priceEarnings, 'multiple', null, kind),
  ];

  const counts: Record<Signal, number> = { ok: 0, warn: 0, bad: 0 };
  for (const i of indicators) {
    if (i.signal) counts[i.signal] += 1;
  }

  const banded = indicators.filter((i) => i.bands !== null);
  const applicable = banded.filter((i) => i.applicable).length;
  const present = banded.filter((i) => i.signal !== null).length;

  return {
    indicators,
    counts,
    verdict: decideVerdict(
      indicators.map((i) => i.signal),
      applicable,
    ),
    coverage: { applicable, present, minimumForVerdict: minimumForVerdict(applicable) },
  };
}
