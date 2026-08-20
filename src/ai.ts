import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { formatCurrency, formatMultiple, formatPercent } from './numbers';
import type { Diagnosis, Interpretation } from './types';

const MODEL = 'claude-sonnet-4-6';

const InterpretationSchema = z.object({
  resumo: z.string(),
  pontos_de_atencao: z.array(z.string()),
});

const SYSTEM = [
  'Você interpreta indicadores fundamentalistas de ações brasileiras para fins educacionais.',
  'Você NUNCA fornece, corrige, completa ou estima números: use exclusivamente os valores e',
  'diagnósticos recebidos. Indicador marcado como "sem dado" deve ser tratado como desconhecido,',
  'nunca preenchido. Não faça recomendação de compra ou venda, não projete preço nem dividendo',
  'futuro. Responda em português do Brasil, tom sóbrio e direto.',
].join(' ');

function formatValue(indicator: Diagnosis['indicators'][number]): string {
  if (indicator.value === null) return 'sem dado';
  switch (indicator.format) {
    case 'percent':
      return formatPercent(indicator.value);
    case 'currency':
      return formatCurrency(indicator.value);
    case 'multiple':
      return formatMultiple(indicator.value);
  }
}

export function buildPrompt(ticker: string, diagnosis: Diagnosis): string {
  const lines = diagnosis.indicators.map(
    (i) => `- ${i.label}: ${formatValue(i)} — ${i.message}${i.signal ? ` (${i.signal})` : ''}`,
  );

  return [
    `Ticker: ${ticker}`,
    `Veredito do motor determinístico: ${diagnosis.verdict}`,
    '',
    'Indicadores já calculados pelo pipeline:',
    ...lines,
    '',
    'Escreva um resumo de 2 a 3 frases sobre o que esse conjunto de números indica e liste',
    'até 3 pontos de atenção objetivos, cada um ancorado em um indicador acima.',
  ].join('\n');
}

/** Returns null quietly when the step was not enabled or the key is absent. */
export async function interpret(
  ticker: string,
  diagnosis: Diagnosis,
  options: { enabled: boolean },
): Promise<Interpretation | null> {
  if (!options.enabled || !process.env.ANTHROPIC_API_KEY) return null;

  const client = new Anthropic();

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM,
    messages: [{ role: 'user', content: buildPrompt(ticker, diagnosis) }],
    output_config: { format: zodOutputFormat(InterpretationSchema) },
  });

  const content = response.parsed_output;
  if (!content) return null;

  return {
    summary: content.resumo.trim(),
    watchPoints: content.pontos_de_atencao.slice(0, 3).map((p) => p.trim()),
    model: MODEL,
  };
}
