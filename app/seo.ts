import type { Metadata } from 'next';

export const SITE_NAME = 'Radar de Dividendos';

export const PAGES = {
  '/': {
    title: 'Dividendos, ações e FIIs da B3',
    description: 'Analise ações e FIIs da B3 com dividend yield, indicadores fundamentalistas e filtros de qualidade. Compare os dados e confira a fonte de cada número.',
    index: true,
  },
  '/acoes': {
    title: 'Triagem de ações da B3',
    description: 'Compare ações da B3 pelos filtros de ROE, dívida, margem, crescimento e liquidez. Confira dividend yield, indicadores e a procedência dos dados.',
    index: true,
  },
  '/fiis': {
    title: 'Triagem de fundos imobiliários (FIIs)',
    description: 'Explore FIIs da B3 acima de R$ 1 bilhão de patrimônio. Confira cinco filtros de qualidade, dividend yield e P/VP, com a fonte de cada indicador.',
    index: true,
  },
  '/analise': {
    title: 'Análise de ações e FIIs',
    description: 'Consulte tickers da B3 e compare fundamentos, histórico de proventos e diagnóstico por indicador, com dados de quatro fontes.',
    index: false,
  },
  '/carteira': {
    title: 'Simulador de carteira de dividendos',
    description: 'Simule uma carteira de ações ou FIIs: quantidade de cotas, renda mensal estimada e efeito do reinvestimento dos dividendos.',
    index: false,
  },
} as const;

/** Full public URL, including a deployment subdirectory, with no localhost canonical. */
export function siteUrl(): URL | undefined {
  const value = process.env.RADAR_SITE_URL?.trim();
  if (!value) return undefined;
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.search || url.hash || url.username || url.password) {
    throw new Error('RADAR_SITE_URL deve ser uma URL HTTP(S) pública, sem credenciais, query ou fragmento.');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url;
}

export function publicUrl(path: string): string | undefined {
  const base = siteUrl();
  return base ? new URL(path.replace(/^\/+/, ''), base).href : undefined;
}

export function pageMetadata(path: keyof typeof PAGES): Metadata {
  const page = PAGES[path];
  const url = publicUrl(path);
  const title = `${page.title} — ${SITE_NAME}`;
  return {
    title: page.title,
    description: page.description,
    alternates: url ? { canonical: url } : undefined,
    robots: { index: page.index, follow: true },
    openGraph: {
      type: 'website', locale: 'pt_BR', siteName: SITE_NAME,
      title, description: page.description, ...(url ? { url } : {}),
    },
    twitter: { card: 'summary', title, description: page.description },
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: publicUrl('/'),
    inLanguage: 'pt-BR',
    description: PAGES['/'].description,
  };
}
