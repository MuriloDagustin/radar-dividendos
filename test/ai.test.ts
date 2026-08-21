import { afterEach, describe, expect, it, vi } from 'vitest';
import { diagnose } from '../src/diagnosis';
import { interpret, buildPrompt } from '../src/ai';
import { emptyFundamentals } from '../src/types';

const DIAGNOSIS = diagnose({
  ...emptyFundamentals(),
  price: 37.17,
  dividendYield12m: 0.081,
  priceToBook: 1.59,
  roe: 0.201,
  netDebt: 10_413_700_000,
  ebitda: 2_523_782_608,
});

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
});

describe('buildPrompt', () => {
  const prompt = buildPrompt('TAEE11', DIAGNOSIS);

  it('entrega o ticker e o verdict já calculado', () => {
    expect(prompt).toContain('Ticker: TAEE11');
    expect(prompt).toContain('Veredito do motor determinístico: fragil');
  });

  it('hands over value and diagnosis for every indicator', () => {
    expect(prompt).toContain('Dividend Yield 12m: 8,1% — Faixa boa (ok)');
    expect(prompt).toContain('Dívida líq./EBITDA: 4,13 — Dívida alta demais');
    expect(prompt).toContain('P/VP: 1,59 — Preço razoável em relação ao patrimônio (ok)');
  });

  it('marks an absent field as no-data instead of dropping the line', () => {
    expect(prompt).toContain('Payout: sem dado');
  });

  it('asks the AI for interpretation, never for a new number', () => {
    expect(prompt).toContain('resumo de 2 a 3 frases');
    expect(prompt).toContain('até 3 pontos de atenção');
    expect(prompt).toContain('ancorado em um indicador acima');
  });
});

describe('interpret', () => {
  it('does not call the API when the step is disabled', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-teste';
    vi.stubGlobal('fetch', vi.fn());

    expect(await interpret('TAEE11', DIAGNOSIS, { enabled: false })).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('does not call the API without a key, even with the flag on', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.stubGlobal('fetch', vi.fn());

    expect(await interpret('TAEE11', DIAGNOSIS, { enabled: true })).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
