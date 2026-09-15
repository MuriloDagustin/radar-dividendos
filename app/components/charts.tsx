'use client';

import { useEffect, useId, useState, type PointerEvent } from 'react';
import type { GrowthPoint, Position, SegmentShare } from '@/src/portfolio';
import styles from './charts.module.css';

/** A fund holds cotas in segments, a company holds ações in sectors; the chart says which. */
export interface ChartWords {
  item: string;
  items: string;
  shares: string;
  group: string;
}

/** Categorical slots are assigned to segments in a fixed order, largest segment first, never cycled. */
const SERIES_SLOTS = 8;

function money(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Axis ticks read at a glance: "R$ 12 mil", "R$ 1,2 mi". */
function compact(value: number): string {
  const abs = Math.abs(value);
  const nf = (max: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: max });
  if (abs >= 1e6) return `R$ ${(value / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1e3) return `R$ ${(value / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return `R$ ${nf(0)}`;
}

function percent(value: number): string {
  return `${(value * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function arcPath(cx: number, cy: number, outer: number, inner: number, start: number, end: number): string {
  const [ox1, oy1] = polar(cx, cy, outer, start);
  const [ox2, oy2] = polar(cx, cy, outer, end);
  const [ix1, iy1] = polar(cx, cy, inner, end);
  const [ix2, iy2] = polar(cx, cy, inner, start);
  const large = end - start > Math.PI ? 1 : 0;
  return [
    `M ${ox1} ${oy1}`,
    `A ${outer} ${outer} 0 ${large} 1 ${ox2} ${oy2}`,
    `L ${ix1} ${iy1}`,
    `A ${inner} ${inner} 0 ${large} 0 ${ix2} ${iy2}`,
    'Z',
  ].join(' ');
}

interface Slice {
  position: Position;
  slot: number;
  start: number;
  end: number;
}

/**
 * One slice per fund, coloured by segment so the diversification question — how much is in
 * logistics? — is answered by colour while the fund is answered by the label and the tooltip.
 * A 2px gap of surface between slices keeps neighbours of one colour apart.
 */
export function AllocationDonut({
  positions,
  segments,
  words,
}: {
  positions: Position[];
  segments: SegmentShare[];
  words: ChartWords;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const titleId = useId();

  const size = 300;
  const cx = size / 2;
  const cy = size / 2;
  const outer = 122;
  const inner = 78;
  const total = positions.reduce((sum, p) => sum + p.weight, 0);
  if (total <= 0) return null;

  const slotOf = new Map(segments.map((s, i) => [s.segment, Math.min(i, SERIES_SLOTS - 1)]));
  const ordered = segments.flatMap((s) =>
    positions
      .filter((p) => s.tickers.includes(p.ticker))
      .sort((a, b) => b.weight - a.weight)
      .map((p) => ({ position: p, slot: slotOf.get(s.segment) ?? SERIES_SLOTS - 1 })),
  );

  const gap = (2 / outer) * 1.2;
  let angle = -Math.PI / 2;
  const slices: Slice[] = ordered.map(({ position, slot }) => {
    const span = (position.weight / total) * Math.PI * 2;
    const slice = { position, slot, start: angle + gap / 2, end: angle + span - gap / 2 };
    angle += span;
    return slice;
  });

  const active = slices.find((s) => s.position.ticker === hovered) ?? null;

  return (
    <figure className={styles.figure} aria-labelledby={titleId}>
      <figcaption id={titleId} className={styles.caption}>
        <span className="tag">distribuição</span>
        <span className={styles.captionNote}>
          cor por {words.group}, fatia por {words.item}
        </span>
      </figcaption>

      <div className={styles.donutRow}>
        <div className={styles.donutWrap}>
          <svg viewBox={`0 0 ${size} ${size}`} className={styles.donut} role="img" aria-label={`Distribuição da carteira por ${words.item}`}>
            {slices.map((s) => {
              const mid = (s.start + s.end) / 2;
              const wide = s.end - s.start > 0.25;
              const [lx, ly] = polar(cx, cy, (outer + inner) / 2, mid);
              const isActive = hovered === s.position.ticker;
              return (
                <g
                  key={s.position.ticker}
                  className={isActive ? `${styles.slice} ${styles.sliceActive}` : styles.slice}
                  onPointerEnter={() => setHovered(s.position.ticker)}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={() => setHovered(s.position.ticker)}
                  onBlur={() => setHovered(null)}
                  tabIndex={0}
                  aria-label={`${s.position.ticker}: ${percent(s.position.weight)}`}
                >
                  <path
                    d={arcPath(cx, cy, outer, inner, s.start, s.end)}
                    style={{ fill: `var(--series-${s.slot + 1})` }}
                  />
                  {wide ? (
                    <text x={lx} y={ly} className={styles.sliceLabel} textAnchor="middle" dominantBaseline="central">
                      {s.position.ticker}
                    </text>
                  ) : null}
                </g>
              );
            })}
            <text x={cx} y={cy - 8} className={styles.centerValue} textAnchor="middle">
              {active ? percent(active.position.weight) : `${positions.length}`}
            </text>
            <text x={cx} y={cy + 14} className={styles.centerLabel} textAnchor="middle">
              {active ? active.position.ticker : positions.length === 1 ? words.item : words.items}
            </text>
          </svg>

          {active ? (
            <div className={styles.tooltip} role="status">
              <strong className={styles.tooltipValue}>{money(active.position.invested)}</strong>
              <span className={styles.tooltipRow}>
                <i className={styles.key} style={{ background: `var(--series-${active.slot + 1})` }} />
                {active.position.ticker} · {active.position.shares} {words.shares} ·{' '}
                {percent(active.position.weight)}
              </span>
              <span className={styles.tooltipMuted}>{active.position.segment ?? `sem ${words.group}`}</span>
            </div>
          ) : null}
        </div>

        <ul className={styles.legend}>
          {segments.map((s, i) => (
            <li key={s.segment} className={styles.legendItem}>
              <i className={styles.swatch} style={{ background: `var(--series-${Math.min(i, SERIES_SLOTS - 1) + 1})` }} />
              <span className={styles.legendName}>{s.segment}</span>
              <span className={`mono ${styles.legendValue}`}>{percent(s.weight)}</span>
              <span className={styles.legendTickers}>{s.tickers.join(' · ')}</span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

const NICE_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/** The round number just above the value, fine enough that the curve fills most of the plot. */
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const ratio = value / magnitude;
  const step = NICE_STEPS.find((n) => n >= ratio - 1e-9) ?? 10;
  return step * magnitude;
}

/**
 * Two lines: reinvesting is the story, so it takes the series colour; keeping the cash is
 * context and sits in gray. The crosshair snaps to the nearest year and the tooltip reads
 * both lines at once, plus what the reinvested position would pay per month by then.
 */
export function GrowthChart({
  points,
  invested,
  contribution = 0,
  words,
  onHover,
}: {
  points: GrowthPoint[];
  invested: number;
  contribution?: number;
  words: ChartWords;
  /** The year under the cursor, so the totals above the chart can follow it. */
  onHover?: (point: GrowthPoint | null) => void;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  // A finger has no hover: a tap pins the year so the reading survives lifting it.
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const titleId = useId();

  const activeIndex = pinnedIndex ?? hoverIndex;
  const active = activeIndex === null ? null : (points[activeIndex] ?? null);

  useEffect(() => {
    onHover?.(active);
  }, [active, onHover]);

  // A new horizon or a new split is a new curve, and a pin on the old one means nothing.
  useEffect(() => {
    setPinnedIndex(null);
    setHoverIndex(null);
  }, [points]);

  const width = 640;
  const height = 300;
  const margin = { top: 16, right: 96, bottom: 36, left: 72 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const last = points[points.length - 1];
  if (!last) return null;
  const yMax = niceCeiling(last.reinvested);
  const x = (year: number) => margin.left + (year / last.year) * plotW;
  const y = (value: number) => margin.top + plotH - (value / yMax) * plotH;

  const line = (pick: (p: GrowthPoint) => number) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.year)} ${y(pick(p))}`).join(' ');

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const xStep = last.year <= 10 ? 1 : last.year <= 20 ? 2 : 5;
  const xTicks = points.filter((p) => p.year % xStep === 0).map((p) => p.year);

  const indexAt = (event: PointerEvent<SVGRectElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * plotW;
    const year = Math.round((px / plotW) * last.year);
    return Math.max(0, Math.min(points.length - 1, year));
  };

  const onMove = (event: PointerEvent<SVGRectElement>) => {
    if (pinnedIndex !== null) return;
    setHoverIndex(indexAt(event));
  };

  /** Tap or click pins the year under the pointer; the same one again lets it go. */
  const onDown = (event: PointerEvent<SVGRectElement>) => {
    const index = indexAt(event);
    setPinnedIndex(index === pinnedIndex ? null : index);
    setHoverIndex(index);
  };

  // End labels sit beside their line ends; if the two would overlap, the lower one is pushed down.
  const endReinvested = y(last.reinvested);
  let endWithdrawn = y(last.withdrawn);
  if (Math.abs(endWithdrawn - endReinvested) < 16) endWithdrawn = endReinvested + 16;

  return (
    <figure className={styles.figure} aria-labelledby={titleId}>
      <figcaption id={titleId} className={styles.caption}>
        <span className="tag">crescimento projetado</span>
        <span className={styles.captionNote}>
          {invested > 0
            ? `${money(invested)} hoje${contribution > 0 ? ` + ${money(contribution)} por mês` : ''}`
            : `${money(contribution)} por mês, começando do zero`}
          , cotação e DY congelados nos valores atuais
        </span>
      </figcaption>

      <div className={styles.growthWrap}>
        <svg viewBox={`0 0 ${width} ${height}`} className={styles.growth} role="img" aria-label="Patrimônio projetado ao longo dos anos">
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={margin.left} x2={margin.left + plotW} y1={y(t)} y2={y(t)} className={styles.grid} />
              <text x={margin.left - 8} y={y(t)} className={styles.axis} textAnchor="end" dominantBaseline="central">
                {compact(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={height - 12} className={styles.axis} textAnchor="middle">
              {t === 0 ? 'hoje' : `${t}a`}
            </text>
          ))}

          <path d={line((p) => p.withdrawn)} className={styles.lineContext} />
          <path d={line((p) => p.reinvested)} className={styles.lineMain} />

          <text x={x(last.year) + 8} y={endReinvested} className={styles.endLabel} dominantBaseline="central">
            {compact(last.reinvested)}
          </text>
          <text x={x(last.year) + 8} y={endWithdrawn} className={styles.endLabelMuted} dominantBaseline="central">
            {compact(last.withdrawn)}
          </text>

          {active ? (
            <g>
              <line
                x1={x(active.year)}
                x2={x(active.year)}
                y1={margin.top}
                y2={margin.top + plotH}
                className={pinnedIndex === null ? styles.crosshair : `${styles.crosshair} ${styles.crosshairPinned}`}
              />
              <circle cx={x(active.year)} cy={y(active.reinvested)} r={5} className={styles.dotMain} />
              <circle cx={x(active.year)} cy={y(active.withdrawn)} r={5} className={styles.dotContext} />
            </g>
          ) : null}

          <rect
            x={margin.left}
            y={margin.top}
            width={plotW}
            height={plotH}
            fill="transparent"
            className={styles.hitArea}
            onPointerMove={onMove}
            onPointerDown={onDown}
            onPointerLeave={() => {
              if (pinnedIndex === null) setHoverIndex(null);
            }}
          />
        </svg>

        {active ? (
          <div
            className={styles.tooltip}
            role="status"
            style={{ left: `${((x(active.year) + 12) / width) * 100}%`, top: '8%' }}
          >
            <strong className={styles.tooltipValue}>{active.year === 0 ? 'hoje' : `em ${active.year} anos`}</strong>
            <span className={styles.tooltipRow}>
              <i className={`${styles.lineKey} ${styles.lineKeyMain}`} />
              <b>{money(active.reinvested)}</b> reinvestindo
            </span>
            <span className={styles.tooltipRow}>
              <i className={`${styles.lineKey} ${styles.lineKeyContext}`} />
              <b>{money(active.withdrawn)}</b> sacando
            </span>
            {contribution > 0 ? (
              <span className={styles.tooltipMuted}>{money(active.contributed)} do próprio bolso até lá</span>
            ) : null}
            <span className={styles.tooltipMuted}>renda de {money(active.monthlyIncome)}/mês se reinvestido até lá</span>
          </div>
        ) : null}
      </div>

      <ul className={styles.legend}>
        <li className={styles.legendItem}>
          <i className={`${styles.lineKey} ${styles.lineKeyMain}`} />
          <span className={styles.legendName}>reinvestindo os rendimentos</span>
          <span className={styles.legendTickers}>cada pagamento compra mais {words.shares}</span>
        </li>
        <li className={styles.legendItem}>
          <i className={`${styles.lineKey} ${styles.lineKeyContext}`} />
          <span className={styles.legendName}>sacando os rendimentos</span>
          <span className={styles.legendTickers}>
            {words.shares} paradas, rendimento acumulado em caixa
          </span>
        </li>
      </ul>
    </figure>
  );
}
