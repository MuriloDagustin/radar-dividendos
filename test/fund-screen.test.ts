import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  COST_CEILING,
  NET_WORTH_FLOOR,
  bookDiscount,
  describeScreen,
  isPaperFund,
  listingAge,
  lowVacancy,
  managerTier,
  mergeFundProfiles,
  netWorthScale,
  referenceManager,
  rentBackedIncome,
  resilientSegment,
  screenFund,
  segmentOverlaps,
  totalCost,
} from '../src/fund-screen';
import { payoutOverFfo } from '../src/diagnosis';
import { mergeReadings } from '../src/merge';
import { parseFundamentus } from '../src/sources/fundamentus';
import {
  extractFundProfile,
  extractManagement,
  parseFee,
  parseInvestidor10,
} from '../src/sources/investidor10';
import { parseProventos } from '../src/sources/proventos';
import { parseScaledAmount } from '../src/sources/scraping';
import { summarizeDividends } from '../src/dividends';
import {
  emptyFundProfile,
  emptyFundamentals,
  type DividendRecord,
  type FundProfile,
  type Fundamentals,
  type SourceReading,
} from '../src/types';

const here = dirname(fileURLToPath(import.meta.url));

function gz(name: string): string {
  return gunzipSync(readFileSync(join(here, 'fixtures', name))).toString('utf8');
}

const HGLG11_I10 = gz('investidor10-hglg11.html.gz');
const MXRF11_I10 = gz('investidor10-mxrf11.html.gz');
const HGLG11_FUNDAMENTUS = readFileSync(join(here, 'fixtures', 'fundamentus-hglg11.html'), 'utf8');
const MXRF11_PROVENTOS = readFileSync(join(here, 'fixtures', 'proventos-mxrf11.html'), 'latin1');

function profile(partial: Partial<FundProfile>): FundProfile {
  return { ...emptyFundProfile(), ...partial };
}

function fundamentals(partial: Partial<Fundamentals>): Fundamentals {
  return { ...emptyFundamentals(), ...partial };
}

function record(partial: Partial<DividendRecord>): DividendRecord {
  return {
    yearsPaid: 0,
    consecutiveYears: 0,
    cuts: 0,
    variation: null,
    lastFullYear: null,
    lastChange: null,
    nextPayment: null,
    interestOnCapitalShare: null,
    ...partial,
  };
}

describe('filter 1 — resilient segment', () => {
  it.each([
    ['Logístico / Indústria / Galpões', 'logística'],
    ['Shoppings', 'shoppings'],
    ['Lajes Corporativas', 'lajes corporativas'],
    ['Renda Urbana', 'renda urbana'],
  ])('%s passes as %s', (segment, name) => {
    const c = resilientSegment(profile({ segment, fundType: 'Fundo de Tijolo' }));
    expect(c.status).toBe('pass');
    expect(c.detail).toContain(name);
  });

  it('office towers pass with the AAA caveat the sources cannot confirm', () => {
    const c = resilientSegment(profile({ segment: 'Lajes Corporativas' }));
    expect(c.status).toBe('pass');
    expect(c.detail).toContain('AAA');
  });

  it.each([
    ['Hotel', 'hotel'],
    ['Hospitalar', 'hospital'],
    ['Residencial', 'residencial'],
    ['Fundo de Fundos', 'fundo de fundos'],
  ])('%s is ruled out by name', (segment, name) => {
    const c = resilientSegment(profile({ segment }));
    expect(c.status).toBe('fail');
    expect(c.detail).toContain(name);
  });

  it('a development mandate rules out even a logistics fund', () => {
    const c = resilientSegment(
      profile({ segment: 'Logístico / Indústria / Galpões', mandate: 'Desenvolvimento' }),
    );
    expect(c.status).toBe('fail');
    expect(c.detail).toContain('desenvolvimento');
  });

  it('a paper fund is outside the list, not named as excluded', () => {
    const c = resilientSegment(profile({ segment: 'Híbrido', fundType: 'Fundo de Papel' }));
    expect(c.status).toBe('fail');
    expect(c.detail).toContain('Fora da lista');
    expect(c.value).toBe('Híbrido · Fundo de Papel');
  });

  it('is unknown when no source named a segment', () => {
    expect(resilientSegment(emptyFundProfile()).status).toBe('unknown');
  });

  it('a hybrid brick fund is left to the reader, not failed', () => {
    const c = resilientSegment(profile({ segment: 'Híbrido', fundType: 'Fundo de Tijolo' }));
    expect(c.status).toBe('unknown');
    expect(c.detail).toContain('mistura de segmentos');
    expect(resilientSegment(profile({ segment: 'Híbrido', fundType: 'Fundo Misto' })).status).toBe('unknown');
    expect(resilientSegment(profile({ segment: 'Híbrido', fundType: 'Outro' })).status).toBe('unknown');
  });

  it('a hybrid fund with a development mandate still fails', () => {
    const c = resilientSegment(profile({ segment: 'Híbrido', fundType: 'Fundo de Desenvolvimento' }));
    expect(c.status).toBe('fail');
    expect(c.detail).toContain('desenvolvimento');
  });

  it('"Escritórios" does not read as a paper fund', () => {
    expect(isPaperFund(profile({ segment: 'Escritórios' }))).toBe(false);
    expect(isPaperFund(profile({ fundType: 'Fundo de Papel' }))).toBe(true);
  });
});

describe('filter 2 — net worth', () => {
  it('passes at exactly one billion', () => {
    expect(netWorthScale(profile({ netWorth: NET_WORTH_FLOOR })).status).toBe('pass');
  });

  it('fails one real below', () => {
    const c = netWorthScale(profile({ netWorth: NET_WORTH_FLOOR - 1 }));
    expect(c.status).toBe('fail');
    expect(c.value).toBe('R$ 1.000,00 mi');
  });

  it('is unknown without a figure', () => {
    expect(netWorthScale(emptyFundProfile()).status).toBe('unknown');
  });
});

describe('filter 3 — listing age', () => {
  it('passes on five consecutive years of payments, from the dividend history', () => {
    const c = listingAge(record({ yearsPaid: 5, consecutiveYears: 5 }), emptyFundProfile());
    expect(c.status).toBe('pass');
    expect(c.value).toBe('5 anos seguidos pagando');
  });

  it('a long-listed fund with a gap in payments fails and says so', () => {
    const c = listingAge(
      record({ yearsPaid: 6, consecutiveYears: 2 }),
      profile({ listedOver5Years: true }),
    );
    expect(c.status).toBe('fail');
    expect(c.detail).toContain('houve ano sem renda');
  });

  it('a young fund fails on its short record', () => {
    const c = listingAge(record({ yearsPaid: 2, consecutiveYears: 2 }), emptyFundProfile());
    expect(c.status).toBe('fail');
    expect(c.detail).toContain('ainda não mostrou');
  });

  it('falls back to the source flag when no history could be read', () => {
    expect(listingAge(null, profile({ listedOver5Years: true })).status).toBe('pass');
    expect(listingAge(null, profile({ listedOver5Years: true })).detail).toContain('Investidor10');
    expect(listingAge(null, profile({ listedOver5Years: false })).status).toBe('fail');
  });

  it('is unknown with neither', () => {
    expect(listingAge(null, emptyFundProfile()).status).toBe('unknown');
  });
});

describe('filter 4 — cost', () => {
  it('passes at exactly 1,15%', () => {
    const c = totalCost(profile({ adminFee: COST_CEILING }));
    expect(c.status).toBe('pass');
    expect(c.value).toBe('1,15% ao ano');
  });

  it('passes a fee of 1,11%, the one basis point that used to fail KNRI11', () => {
    expect(totalCost(profile({ adminFee: 0.0111 })).status).toBe('pass');
  });

  it('fails at 1,20% and asks for the historical justification', () => {
    const c = totalCost(profile({ adminFee: 0.012 }));
    expect(c.status).toBe('fail');
    expect(c.value).toBe('1,20% ao ano');
    expect(c.detail).toContain('histórico');
  });

  it('always says the published fee may not be the whole cost', () => {
    expect(totalCost(profile({ adminFee: 0.006 })).detail).toContain('performance');
  });

  it('keeps the fee text when no percentage could be read from it', () => {
    const c = totalCost(profile({ adminFeeText: 'R$ 30 mil mensais' }));
    expect(c.status).toBe('unknown');
    expect(c.value).toBe('R$ 30 mil mensais');
  });
});

describe('filter 5 — manager', () => {
  it('recognises a reference manager inside a longer legal name', () => {
    expect(referenceManager('Kinea Investimentos Ltda')).toBe(true);
    expect(referenceManager('XP Vista Asset')).toBe(true);
    expect(referenceManager('Pátria Investimentos')).toBe(true);
  });

  it('an unlisted manager is left unconfirmed, never failed', () => {
    const c = managerTier(profile({ manager: 'Gestora Nova Ltda' }));
    expect(c.status).toBe('unknown');
    expect(c.value).toBe('Gestora Nova Ltda');
    expect(c.detail).toContain('não é demérito');
  });

  it('is unknown without a name', () => {
    expect(managerTier(emptyFundProfile()).status).toBe('unknown');
  });
});

describe('tiebreakers', () => {
  it('vacancy below 10% passes and points at the report for stability', () => {
    const c = lowVacancy(fundamentals({ vacancy: 0.029 }), profile({ fundType: 'Fundo de Tijolo' }));
    expect(c.status).toBe('pass');
    expect(c.detail).toContain('relatório gerencial');
  });

  it('vacancy at 10% fails', () => {
    expect(lowVacancy(fundamentals({ vacancy: 0.1 }), emptyFundProfile()).status).toBe('fail');
  });

  it('vacancy does not apply to a paper fund even when the source prints 0%', () => {
    const c = lowVacancy(fundamentals({ vacancy: 0 }), profile({ fundType: 'Fundo de Papel' }));
    expect(c.status).toBe('unknown');
    expect(c.detail).toContain('não tem imóveis');
  });

  it('price to book below 1 passes, at 1 fails', () => {
    expect(bookDiscount(fundamentals({ priceToBook: 0.99 })).status).toBe('pass');
    expect(bookDiscount(fundamentals({ priceToBook: 1 })).status).toBe('fail');
    expect(bookDiscount(emptyFundamentals()).status).toBe('unknown');
  });

  it('income covered by FFO passes, income above it fails', () => {
    expect(rentBackedIncome(fundamentals({ dividendYield12m: 0.1, ffoYield: 0.1 })).status).toBe('pass');
    expect(rentBackedIncome(fundamentals({ dividendYield12m: 0.105, ffoYield: 0.1 })).status).toBe('pass');
    const over = rentBackedIncome(fundamentals({ dividendYield12m: 0.147, ffoYield: 0.064 }));
    expect(over.status).toBe('fail');
    expect(over.detail).toContain('venda de ativo');
  });
});

describe('screenFund', () => {
  const candidate = profile({
    segment: 'Shoppings',
    fundType: 'Fundo de Tijolo',
    netWorth: 2e9,
    adminFee: 0.008,
    manager: 'XP Asset',
  });

  it('gates the tiebreakers on all five filters passing', () => {
    const screen = screenFund({
      profile: candidate,
      fundamentals: fundamentals({ priceToBook: 0.9, vacancy: 0.05 }),
      dividends: record({ yearsPaid: 8, consecutiveYears: 8 }),
    });
    expect(screen.passedAll).toBe(true);
    expect(screen.passed).toBe(5);
    expect(describeScreen(screen)).toBe('Passou nos 5 filtros');
  });

  it('counts unknowns apart from failures', () => {
    const screen = screenFund({
      profile: { ...candidate, manager: null, netWorth: 5e8 },
      fundamentals: emptyFundamentals(),
      dividends: record({ yearsPaid: 8, consecutiveYears: 8 }),
    });
    expect(screen.passedAll).toBe(false);
    expect(screen.passed).toBe(3);
    expect(screen.unknown).toBe(1);
    expect(describeScreen(screen)).toBe('Passou em 3 de 5 filtros · 1 sem dado');
  });

  it('works with no profile at all: every filter unknown, nothing invented', () => {
    const screen = screenFund({ profile: null, fundamentals: emptyFundamentals(), dividends: null });
    expect(screen.filters.every((c) => c.status === 'unknown')).toBe(true);
    expect(screen.passed).toBe(0);
  });
});

describe('mergeFundProfiles', () => {
  const reading = (source: SourceReading['source'], fund: Partial<FundProfile>): SourceReading => ({
    source,
    fundamentals: emptyFundamentals(),
    derived: [],
    fund,
  });

  it('first source wins per field, later ones fill gaps', () => {
    const merged = mergeFundProfiles([
      reading('investidor10', { netWorth: 7.59e9, segment: 'Logístico' }),
      reading('fundamentus', { netWorth: 7.57e9, manager: null }),
    ]);
    expect(merged?.netWorth).toBe(7.59e9);
    expect(merged?.segment).toBe('Logístico');
  });

  it('is null when no source had a fund sheet', () => {
    expect(mergeFundProfiles([{ source: 'brapi', fundamentals: emptyFundamentals(), derived: [] }])).toBeNull();
  });
});

describe('segmentOverlaps', () => {
  it('names the funds that share a segment', () => {
    const notes = segmentOverlaps([
      { ticker: 'HGLG11', segment: 'Logístico / Indústria / Galpões' },
      { ticker: 'XPLG11', segment: 'Logístico / Indústria / Galpões' },
      { ticker: 'MXRF11', segment: 'Híbrido' },
    ]);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('HGLG11 e XPLG11');
    expect(notes[0]).toContain('um fundo por segmento');
  });

  it('enumerates three or more funds as a sentence', () => {
    const notes = segmentOverlaps([
      { ticker: 'HGLG11', segment: 'Logístico' },
      { ticker: 'XPLG11', segment: 'Logístico' },
      { ticker: 'BRCO11', segment: 'Logístico' },
    ]);
    expect(notes[0]).toContain('HGLG11, XPLG11 e BRCO11 são');
  });

  it('is silent for a single fund or for different segments', () => {
    expect(segmentOverlaps([{ ticker: 'HGLG11', segment: 'Logístico' }])).toEqual([]);
    expect(segmentOverlaps([{ ticker: 'A', segment: null }, { ticker: 'B', segment: null }])).toEqual([]);
  });
});

describe('parsers', () => {
  it.each([
    ['R$ 7,59 Bilhões', 7_590_000_000],
    ['R$ 323,15 Milhões', 323_150_000],
    ['R$ 60 mil', 60_000],
    ['1.234.567', 1_234_567],
  ])('parseScaledAmount %s', (raw, expected) => {
    expect(parseScaledAmount(raw)).toBeCloseTo(expected, 0);
  });

  it.each([
    ['0,60% a.a', 0.006],
    ['0,90% a.a (mínimo de R$ 60 mil mensais)', 0.009],
    ['1.1% ao ano', 0.011],
  ])('parseFee %s', (raw, expected) => {
    expect(parseFee(raw)).toBeCloseTo(expected, 6);
  });

  it('parseFee is null when the text has no percentage', () => {
    expect(parseFee('R$ 30 mil mensais')).toBeNull();
  });

  it('extractManagement reads both clause orders', () => {
    expect(
      extractManagement('Criado em 2010, o fundo é atualmente gerido pela Pátria Investimentos e administrado pelo Banco Genial.'),
    ).toEqual({ manager: 'Pátria Investimentos', administrator: 'Banco Genial' });
    expect(
      extractManagement('O fundo é administrado pelo BTG Pactual e gerido pela XP Vista Asset, com gestão ativa.'),
    ).toEqual({ manager: 'XP Vista Asset', administrator: 'BTG Pactual' });
    expect(
      extractManagement(
        'O XPLG11 é administrado pela Vórtx Distribuidora de Títulos e Valores Mobiliários S.A. e conta com gestão da XP Asset Management. Estratégia e composição',
      ),
    ).toEqual({
      manager: 'XP Asset Management',
      // The closing dot of "S.A." doubles as the clause end, so it is not kept — cosmetic.
      administrator: 'Vórtx Distribuidora de Títulos e Valores Mobiliários S.A',
    });
    expect(
      extractManagement(
        'A administração é realizada pela BTG Pactual Serviços Financeiros, enquanto a gestão é conduzida pelo BTG Pactual Asset Management. Estratégia e composição',
      ),
    ).toEqual({ manager: 'BTG Pactual Asset Management', administrator: 'BTG Pactual Serviços Financeiros' });
    expect(
      extractManagement(
        'A administração é realizada pela Vórtx Distribuidora de Títulos e Valores Mobiliários, e a gestão é conduzida pela XP Asset Management. Estratégia',
      ),
    ).toEqual({ manager: 'XP Asset Management', administrator: 'Vórtx Distribuidora de Títulos e Valores Mobiliários' });
    expect(extractManagement('Nada aqui.')).toEqual({ manager: null, administrator: null });
  });
});

describe('HGLG11 on the real fund sheets', () => {
  const i10 = parseInvestidor10(HGLG11_I10, 'HGLG11', 'fii');
  const fundamentus = parseFundamentus(HGLG11_FUNDAMENTUS, 'HGLG11');

  it('Investidor10 gives segment, type, mandate, size, fee, vacancy and who runs it', () => {
    expect(i10.fund).toMatchObject({
      segment: 'Logístico / Indústria / Galpões',
      fundType: 'Fundo de Tijolo',
      mandate: 'Renda',
      netWorth: 7_590_000_000,
      adminFee: 0.006,
      adminFeeText: '0,60% a.a',
      shareholders: 608_340,
      listedOver5Years: true,
      manager: 'Pátria Investimentos',
      administrator: 'Banco Genial',
    });
    expect(i10.fundamentals.vacancy).toBeCloseTo(0.029, 6);
  });

  it('Fundamentus gives the exact net worth and nothing it words coarsely', () => {
    expect(fundamentus.fund).toEqual({ netWorth: 7_570_060_000 });
    expect(fundamentus.fundamentals.ffoYield).toBeCloseTo(0.0658, 6);
  });

  it('the payout over FFO is derived on the Fundamentus sheet, not across sources', () => {
    // 7,3% ÷ 6,58% on the sheet. Investidor10 says the yield is 9,04%, and pairing that
    // with the Fundamentus FFO yield would have printed 137%.
    expect(fundamentus.fundamentals.payoutFfo).toBeCloseTo(0.073 / 0.0658, 6);
    expect(fundamentus.derived).toContain('payoutFfo');

    const merged = mergeReadings([i10, fundamentus]);
    expect(merged.fundamentals.dividendYield12m).toBeCloseTo(0.0904, 6);
    expect(payoutOverFfo(merged.fundamentals)).toBeCloseTo(1.109, 2);
    expect(merged.provenance.payoutFfo).toEqual({ source: 'fundamentus', derived: true });
  });

  it('passes the five filters', () => {
    const merged = mergeFundProfiles([i10, fundamentus]);
    const screen = screenFund({
      profile: merged,
      fundamentals: mergeReadings([i10, fundamentus]).fundamentals,
      dividends: record({ yearsPaid: 10, consecutiveYears: 10 }),
    });
    expect(screen.passedAll).toBe(true);
    expect(screen.tiebreakers.map((c) => [c.key, c.status])).toEqual([
      ['vacancy', 'pass'],
      ['discount', 'pass'],
      // DY 7,3% against FFO yield 6,58%, both from the Fundamentus sheet: 11% above the FFO.
      ['rentBacked', 'fail'],
    ]);
  });

  it('extractFundProfile on a page without the table yields nulls, not throws', () => {
    const { profile: empty, vacancy } = extractFundProfile('<html><body></body></html>');
    expect(empty.segment).toBeNull();
    expect(empty.listedOver5Years).toBeNull();
    expect(vacancy).toBeNull();
  });
});

describe('MXRF11 on the real fund sheet', () => {
  const i10 = parseInvestidor10(MXRF11_I10, 'MXRF11', 'fii');
  const history = parseProventos(MXRF11_PROVENTOS);

  it('is a paper fund with a 0,90% fee and XP as manager', () => {
    expect(i10.fund).toMatchObject({
      segment: 'Híbrido',
      fundType: 'Fundo de Papel',
      adminFee: 0.009,
      manager: 'XP Vista Asset',
      administrator: 'BTG Pactual',
    });
  });

  it('fails only the segment filter: paper is outside the brick-fund rule', () => {
    const dividends = history ? summarizeDividends(history, new Date(2026, 8, 3)) : null;
    const screen = screenFund({
      profile: mergeFundProfiles([i10]),
      fundamentals: i10.fundamentals,
      dividends,
    });
    expect(screen.filters.map((c) => [c.key, c.status])).toEqual([
      ['segment', 'fail'],
      ['netWorth', 'pass'],
      ['listing', 'pass'],
      ['cost', 'pass'],
      ['manager', 'pass'],
    ]);
    expect(screen.passedAll).toBe(false);
    // Its 0% vacancy is a paper fund's non-answer, not a perfect score.
    expect(screen.tiebreakers.find((c) => c.key === 'vacancy')?.status).toBe('unknown');
  });
});
