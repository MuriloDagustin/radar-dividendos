import type { ValueFormat, Verdict } from '@/src/types';

function nf(min: number, max: number): Intl.NumberFormat {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
}

export function formatValue(value: number | null, format: ValueFormat): string {
  if (value === null) return '—';
  switch (format) {
    case 'percent':
      return `${nf(1, 1).format(value * 100)}%`;
    case 'multiple':
      return `${nf(2, 2).format(value)}×`;
    case 'currency': {
      const abs = Math.abs(value);
      if (abs >= 1e9) return `R$ ${nf(2, 2).format(value / 1e9)} bi`;
      if (abs >= 1e6) return `R$ ${nf(2, 2).format(value / 1e6)} mi`;
      return `R$ ${nf(2, 2).format(value)}`;
    }
  }
}

/** Band bound: lean, no decimals that add nothing, empty when the band is unbounded. */
export function formatBound(bound: number | null, format: ValueFormat): string {
  if (bound === null) return '';
  if (format === 'percent') return `${nf(0, 1).format(bound * 100)}%`;
  return nf(0, 1).format(bound);
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  solid: 'Sólida',
  attention: 'Atenção',
  fragile: 'Frágil',
  indeterminate: 'Sem dados',
  inconclusive: 'Inconclusivo',
};

export const VERDICT_EXPLANATION: Record<Verdict, string> = {
  solid: 'Nenhum indicador crítico e no máximo um alerta.',
  attention: 'Dois ou mais alertas, nenhum indicador crítico.',
  fragile: 'Pelo menos um indicador em faixa crítica.',
  indeterminate: 'Indicadores insuficientes para afirmar qualquer coisa.',
  inconclusive: 'Indicadores demais não aplicáveis ou distorcidos para diagnóstico automático.',
};

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
