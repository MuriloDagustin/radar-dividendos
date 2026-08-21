import type { CSSProperties } from 'react';
import type { Band, PeerContext, Signal, ValueFormat } from '@/src/types';
import { formatBound } from '@/app/format';
import styles from './ruler.module.css';

/**
 * `wash` is the fill of inactive bands: it shows where the rule's good and bad zones are
 * without turning into a traffic light that competes with the band the value landed in.
 */
const COLOR: Record<Signal, { strong: string; wash: string }> = {
  ok: { strong: 'var(--ok)', wash: 'var(--ok-wash)' },
  warn: { strong: 'var(--warn)', wash: 'var(--warn-wash)' },
  bad: { strong: 'var(--bad)', wash: 'var(--bad-wash)' },
  unrel: { strong: 'var(--unrel)', wash: 'var(--unrel-wash)' },
  na: { strong: 'var(--ink-faint)', wash: 'var(--rule)' },
};

/** Signals with a band position on the ruler; the rest render the empty state. */
const PLACEABLE: ReadonlySet<Signal> = new Set<Signal>(['ok', 'warn', 'bad']);

/**
 * How much scale to give the open band at each end, per indicator. Without this a 14% and a
 * 40% dividend yield would land on the same pixel, and the ruler would stop telling you
 * *how far* out the value is.
 */
const OPEN_EXTENT: Record<string, { below: number; above: number }> = {
  dividendYield12m: { below: 0, above: 0.25 },
  payout: { below: 0, above: 2 },
  netDebtToEbitda: { below: -2, above: 7 },
  priceToBook: { below: 0, above: 6 },
  roe: { below: -0.1, above: 0.35 },
};

export function positionInBand(
  band: Band,
  value: number,
  extent: { below: number; above: number },
): number {
  const from = band.from ?? extent.below;
  const to = band.to ?? extent.above;
  if (to === from) return 0.5;
  const raw = (value - from) / (to - from);
  // Never touch the edge: a needle on the boundary reads as if it were in the next band.
  return Math.min(0.92, Math.max(0.08, raw));
}

/**
 * Which peer median to show. Broad sector first on purpose: a subsector can hold two or
 * three companies, and Investidor10 publishes a 23% dividend-yield "median" for Klabin's —
 * that is noise, not context.
 */
export function peerValueFor(peers: PeerContext | undefined): number | null {
  return peers?.sector ?? peers?.subsector ?? null;
}

export function bandIndex(bands: readonly Band[], value: number): number {
  return bands.findIndex(
    (b) =>
      (b.from === null || value >= b.from) &&
      (b.to === null || (b.toInclusive ? value <= b.to : value < b.to)),
  );
}

interface Props {
  indicatorKey: string;
  bands: readonly Band[];
  value: number | null;
  format: ValueFormat;
  signal: Signal | null;
  emptyLabel?: string;
  peers?: PeerContext;
}

/** Absolute position of a value across the whole ruler, in equal-width band space. */
function positionOnRuler(
  bands: readonly Band[],
  value: number,
  extent: { below: number; above: number },
): number | null {
  const index = bandIndex(bands, value);
  const band = bands[index];
  if (!band) return null;
  return (index + positionInBand(band, value, extent)) / bands.length;
}

/**
 * Decorative for screen readers: the card already announces value, band and message as text.
 */
export function Ruler({ indicatorKey, bands, value, format, signal, emptyLabel, peers }: Props) {
  if (value === null || signal === null || !PLACEABLE.has(signal)) {
    return (
      <div className={styles.empty} aria-hidden="true">
        {emptyLabel ?? 'sem régua — dado ausente'}
      </div>
    );
  }

  const extent = OPEN_EXTENT[indicatorKey] ?? { below: 0, above: 1 };
  const activeIndex = bandIndex(bands, value);
  const active = bands[activeIndex];

  const root = {
    '--band-color': COLOR[signal].strong,
    '--count': bands.length,
  } as CSSProperties;

  const peerValue = peerValueFor(peers);
  const peerPosition = peerValue === null ? null : positionOnRuler(bands, peerValue, extent);

  return (
    <div className={styles.ruler} style={root} aria-hidden="true">
      <div className={styles.track}>
        {peerPosition !== null ? (
          <span
            className={styles.peer}
            style={{ '--position': `${peerPosition * 100}%` } as CSSProperties}
            title={`mediana do setor: ${formatBound(peerValue, format)}`}
          />
        ) : null}
        {bands.map((band, i) => {
          const isActive = i === activeIndex;
          return (
            <div
              key={band.label}
              className={isActive ? `${styles.band} ${styles.bandActive}` : styles.band}
              style={
                {
                  '--order': i,
                  ...(isActive ? {} : { '--band-bg': COLOR[band.signal].wash }),
                } as CSSProperties
              }
            >
              {isActive && active ? (
                <span
                  className={styles.needle}
                  style={
                    {
                      '--position': `${positionInBand(active, value, extent) * 100}%`,
                    } as CSSProperties
                  }
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className={styles.bandNames}>
        {bands.map((band, i) => (
          <span
            key={band.label}
            className={i === activeIndex ? `${styles.label} ${styles.labelActive}` : styles.label}
          >
            {band.label}
          </span>
        ))}
      </div>

      <div className={styles.bounds}>
        {bands.map((band) => (
          <span key={band.label} className={styles.bound}>
            <span>{formatBound(band.to, format)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
