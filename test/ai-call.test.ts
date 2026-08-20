import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diagnose } from '../src/diagnosis';
import { interpret } from '../src/ai';
import { emptyFundamentals } from '../src/types';

const DIAGNOSIS = diagnose({
  ...emptyFundamentals(),
  dividendYield12m: 0.081,
  netDebt: 10_413_700_000,
  ebitda: 2_523_782_608,
});

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

function apiResponse(content: unknown) {
  return {
    id: 'msg_teste',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content: [{ type: 'text', text: JSON.stringify(content) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-teste';
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
});

describe('interpret against a mocked API', () => {
  it('calls the requested model and returns summary and watch points', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify(
              apiResponse({
                resumo: 'Dividendo consistente com alavancagem elevada. ',
                pontos_de_atencao: [' Dívida líquida acima de 4x EBITDA ', 'Payout desconhecido'],
              }),
            ),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );

    const interpretation = await interpret('TAEE11', DIAGNOSIS, { enabled: true });

    expect(interpretation).toEqual({
      summary: 'Dividendo consistente com alavancagem elevada.',
      watchPoints: ['Dívida líquida acima de 4x EBITDA', 'Payout desconhecido'],
      model: 'claude-sonnet-4-6',
    });
  });

  it('sends the model, the system prompt and the already-computed numbers', async () => {
    const spy = vi.fn(
      async (_url: unknown, _init?: { body?: unknown }) =>
        new Response(
          JSON.stringify(apiResponse({ resumo: 'ok', pontos_de_atencao: [] })),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', spy);

    await interpret('TAEE11', DIAGNOSIS, { enabled: true });

    const body = JSON.parse(String(spy.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe('claude-sonnet-4-6');
    expect(body.system).toMatch(/NUNCA fornece, corrige, completa ou estima números/);
    expect(body.messages[0].content).toContain('Dívida líq./EBITDA: 4,13 — Alavancagem alta');
    expect(body.output_config.format).toBeDefined();
  });

  it('caps the watch-point list at three', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify(
              apiResponse({
                resumo: 'ok',
                pontos_de_atencao: ['um', 'dois', 'três', 'quatro', 'cinco'],
              }),
            ),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );

    const interpretation = await interpret('TAEE11', DIAGNOSIS, { enabled: true });
    expect(interpretation?.watchPoints).toEqual(['um', 'dois', 'três']);
  });
});
