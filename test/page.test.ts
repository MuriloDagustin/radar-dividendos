import { describe, expect, it } from 'vitest';
import { diagnose } from '../src/diagnosis';
import { PAGE_HTML } from '../src/page';
import {
  DISCLAIMER,
  emptyFundamentals,
  type Analysis,
  type ProvenanceMap,
} from '../src/types';

interface FakeElement {
  innerHTML: string;
  value: string;
  disabled: boolean;
  addEventListener: () => void;
  querySelector: () => FakeElement;
}

function fakeElement(): FakeElement {
  const el: FakeElement = {
    innerHTML: '',
    value: '',
    disabled: false,
    addEventListener: () => {},
    querySelector: () => el,
  };
  return el;
}

/**
 * The page ships as one string, so the test pulls out the `<script type="module">` and runs
 * it against a minimal DOM — enough to exercise `render` for real.
 */
function loadPageScript(): { output: FakeElement; render: (a: unknown) => void } {
  const source = /<script type="module">([\s\S]*?)<\/script>/.exec(PAGE_HTML)?.[1];
  if (!source) throw new Error('page script not found');

  const elements = new Map<string, FakeElement>([
    ['form', fakeElement()],
    ['ticker', fakeElement()],
    ['saida', fakeElement()],
  ]);

  const fakeDocument = {
    getElementById: (id: string) => elements.get(id) ?? fakeElement(),
  };

  const factory = new Function('document', `${source}\nreturn { render };`) as (
    doc: unknown,
  ) => { render: (a: unknown) => void };

  const output = elements.get('saida');
  if (!output) throw new Error('output element not registered');
  return { output, render: factory(fakeDocument).render };
}

function emptyProvenance(): ProvenanceMap {
  return {
    price: null,
    dividendYield12m: null,
    priceEarnings: null,
    priceToBook: null,
    roe: null,
    netDebt: null,
    ebitda: null,
    netDebtToEbitda: null,
    payout: null,
  };
}

function fakeAnalysis(): Analysis {
  const fundamentals = {
    ...emptyFundamentals(),
    price: 37.17,
    dividendYield12m: 0.081,
    priceToBook: 1.59,
    roe: 0.201,
    netDebt: 10_413_700_000,
    ebitda: 2_523_782_608,
  };

  return {
    ticker: 'TAEE11',
    kind: 'stock',
    classification: { category: 'evergreen', rawSector: 'Energia Elétrica', uncertain: false },
    notes: [],
    generatedAt: '2026-08-20T14:00:00.000Z',
    fundamentals,
    provenance: {
      ...emptyProvenance(),
      price: { source: 'fundamentus' },
      dividendYield12m: { source: 'brapi' },
      priceToBook: { source: 'brapi' },
      roe: { source: 'brapi' },
      netDebt: { source: 'brapi', derived: true },
      ebitda: { source: 'fundamentus', derived: true },
    },
    sources: [
      { source: 'brapi', status: 'ok' },
      { source: 'fundamentus', status: 'failed', detail: 'HTTP 503' },
    ],
    diagnosis: diagnose(fundamentals),
    interpretation: null,
    fromCache: false,
    disclaimer: DISCLAIMER,
  };
}

describe('PAGE_HTML', () => {
  it('carries the educational disclaimer in the footer', () => {
    expect(PAGE_HTML).toContain(DISCLAIMER);
  });

  it('consumes the API route', () => {
    expect(PAGE_HTML).toContain('/api/analise/');
  });
});

describe('page render', () => {
  it('writes the ticker, the verdict badge and the indicators', () => {
    const { output, render } = loadPageScript();
    render(fakeAnalysis());

    expect(output.innerHTML).toContain('TAEE11');
    expect(output.innerHTML).toContain('class="badge fragile"');
    expect(output.innerHTML).toContain('Frágil');
    expect(output.innerHTML).toContain('Dividend Yield 12m');
    expect(output.innerHTML).toContain('8,1%');
    expect(output.innerHTML).toContain('R$ 37,17');
    expect(output.innerHTML).toContain('Alavancagem alta');
  });

  it('shows every field provenance, derived and computed included', () => {
    const { output, render } = loadPageScript();
    render(fakeAnalysis());

    expect(output.innerHTML).toContain('[brapi.dev]');
    expect(output.innerHTML).toContain('[Fundamentus]');
    expect(output.innerHTML).toContain('[brapi.dev + Fundamentus, calculado]');
  });

  it('names the source when the ratio was published rather than computed', () => {
    const { output, render } = loadPageScript();
    const analysis = fakeAnalysis();
    render({
      ...analysis,
      provenance: { ...analysis.provenance, netDebtToEbitda: { source: 'investidor10' } },
    });

    expect(output.innerHTML).toContain('[Investidor10]');
    expect(output.innerHTML).not.toContain('Investidor10, calculado');
  });

  it('marks a field with no data using an em dash', () => {
    const { output, render } = loadPageScript();
    render(fakeAnalysis());

    expect(output.innerHTML).toContain('—');
  });

  it('lists the source that failed', () => {
    const { output, render } = loadPageScript();
    render(fakeAnalysis());

    expect(output.innerHTML).toContain('Fundamentus fora');
    expect(output.innerHTML).toContain('HTTP 503');
  });

  it('renders the AI interpretation when there is one', () => {
    const { output, render } = loadPageScript();
    render({
      ...fakeAnalysis(),
      interpretation: {
        summary: 'Resumo de teste.',
        watchPoints: ['Alavancagem elevada', 'Payout desconhecido'],
        model: 'claude-sonnet-4-6',
      },
    });

    expect(output.innerHTML).toContain('Leitura por IA');
    expect(output.innerHTML).toContain('Resumo de teste.');
    expect(output.innerHTML).toContain('<li>Alavancagem elevada</li>');
  });

  it('escapes HTML coming from the API', () => {
    const { output, render } = loadPageScript();
    render({ ...fakeAnalysis(), ticker: '<img src=x onerror=alert(1)>' });

    expect(output.innerHTML).not.toContain('<img');
    expect(output.innerHTML).toContain('&lt;img');
  });

  it('labels an analysis with no data as having no verdict', () => {
    const { output, render } = loadPageScript();
    const empty = emptyFundamentals();
    render({
      ...fakeAnalysis(),
      fundamentals: empty,
      provenance: emptyProvenance(),
      diagnosis: diagnose(empty),
    });

    expect(output.innerHTML).toContain('Sem dados');
    expect(output.innerHTML).not.toContain('Sólida');
  });
});
