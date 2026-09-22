import type { Metadata } from 'next';

export const SITE_NAME = 'Caderno de Ativos';

export const PAGES = {
  '/': {
    title: 'Dividendos, ações e FIIs da B3',
    description: 'Consulte ações e FIIs da B3 com dividend yield, indicadores fundamentalistas e filtros configuráveis. Compare os dados e confira a fonte de cada número.',
    index: true,
  },
  '/acoes': {
    title: 'Consulta de ações da B3',
    description: 'Consulte ações da B3 com filtros numéricos definidos por você. Confira dividend yield, indicadores e a procedência dos dados.',
    index: true,
  },
  '/fiis': {
    title: 'Consulta de fundos imobiliários (FIIs)',
    description: 'Explore FIIs da B3 acima de R$ 1 bilhão de patrimônio. Defina seus filtros de dividend yield e P/VP, com a fonte de cada indicador.',
    index: true,
  },
  '/analise': {
    title: 'Consulta de ações e FIIs',
    description: 'Consulte tickers da B3 e compare fundamentos, histórico de proventos e valores por indicador, com dados de quatro fontes.',
    index: false,
  },
  '/carteira': {
    title: 'Simulação aritmética com ativos escolhidos',
    description: 'Calcule quantas cotas caberiam num valor informado por você, aplicando o dividend yield passado e premissas próprias. Não é previsão nem recomendação.',
    index: false,
  },
  '/termos': {
    title: 'Escopo e termos de uso',
    description: 'O que o Caderno de Ativos faz e não faz: consulta de dados publicados, sem recomendação, análise ou avaliação de adequação.',
    index: true,
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
