# radar-dividendos

Analisa fundamentos de **ações e FIIs** da B3 e emite um diagnóstico **determinístico** (sem
IA) por indicador, com veredito geral. Quatro fontes gratuitas, procedência de cada número à
mostra, e três interfaces sobre o mesmo motor: app Next.js, CLI e uma API HTTP enxuta.

> O código (identificadores, comentários, nomes de arquivo) é em inglês; as strings de
> interface ficam em pt-BR, que é o idioma do produto.

> Ferramenta educacional — confira os dados na fonte. Não é recomendação de investimento.

## Setup

```bash
npm install
cp .env.example .env    # opcional: BRAPI_TOKEN, ANTHROPIC_API_KEY
```

O `.env` é lido automaticamente pelo app Next **e pelo CLI**.

Node 20+.

### App visual (Next.js)

```bash
npm run dev              # http://localhost:3000
npm run build && npm start
```

Digite um ou mais tickers separados por espaço. Cada indicador vem com uma **régua de
faixas**: as bandas da regra desenhadas, a banda em que o valor caiu acesa, e uma agulha na
posição exata — dá para ver quanto falta até o próximo limite. Campo que nenhuma fonte
publica aparece como régua tracejada e vazia, nunca estimado.

A análise é compartilhável por URL: `/?t=TAEE11%20ITSA4` (some `&ia=1` para pedir a leitura
por IA).

### CLI

Roda via `tsx`, sem build.

```bash
npx tsx src/cli.ts TAEE11 ITSA4        # relatório colorido no terminal
npx tsx src/cli.ts TAEE11 --json       # saída JSON
npx tsx src/cli.ts TAEE11 --ai         # + interpretação da IA
npx tsx src/cli.ts TAEE11 --no-cache   # ignora e não grava o cache
npx tsx src/cli.ts --serve             # API + página em http://localhost:3000
npx tsx src/cli.ts --serve --porta 8080
npx tsx src/cli.ts --help
```

Atalhos equivalentes: `npm run radar -- TAEE11`, `npm run serve`, `npm test`,
`npm run typecheck`.

Exemplo de saída:

```
TAEE11  FRÁGIL
  · Preço               R$ 37,17  Informativo — sem faixa de referência [Fundamentus]
  ● Dividend Yield 12m      8,1%  Faixa boa [Fundamentus]
  · Payout                     —  Sem dado na fonte
  ✖ Dívida líq./EBITDA      4,13  Alavancagem alta [Fundamentus, calculado]
  ● P/VP                    1,59  Faixa razoável [Fundamentus]
  ● ROE                    20,1%  Rentabilidade forte [Fundamentus]
  · P/L                     7,88  Informativo — sem faixa de referência [Fundamentus]
```

O rótulo entre colchetes é a procedência do número: qual fonte o entregou, e se ele foi
`derivado` (álgebra sobre dois campos publicados) ou `calculado` (a razão dívida/EBITDA).

## Variáveis de ambiente

| Variável | Obrigatória | Para quê |
|---|---|---|
| `BRAPI_TOKEN` | opcional | Token da brapi.dev, usado só para o preço intradiário. Sem ele o radar segue com as outras três fontes. Crie em <https://brapi.dev/dashboard>. |
| `ANTHROPIC_API_KEY` | só com `--ai` | Sem ela a etapa de interpretação é ignorada em silêncio. |
| `RADAR_CACHE_PATH` | não | Arquivo SQLite do cache. Padrão: `./radar-dividendos.sqlite`. |

## Rotas HTTP

Iguais nos dois servidores (Next.js e Hono):

| Rota | Resposta |
|---|---|
| `GET /` | Interface. No Next.js, o app React; no Hono, uma página HTML mínima. |
| `GET /api/analise/:ticker` | JSON da análise. `?ia=1` acrescenta a leitura por IA. |

Status de erro: `400` ticker fora do padrão da B3, `404` ticker inexistente, `502` todas as
fontes indisponíveis ou com formato inesperado.

## Fontes de dados

Todas gratuitas, consultadas **em paralelo**. A ordem abaixo é a prioridade de cada campo: a
primeira fonte que trouxer o campo ganha, as seguintes só preenchem lacuna. **Campo que não
existe em nenhuma fonte volta `null`** — nada é estimado.

| # | Fonte | O que contribui |
|---|---|---|
| 1 | **brapi.dev** (API) | Preço. É intradiário, mais fresco que o das outras. No plano Gratuito é só isso — veja abaixo. |
| 2 | **Investidor10** (scraping) | DY, P/L, P/VP, ROE, **Payout**, **Dív.Líq/EBITDA**. Fonte mais completa, e a única com payout. |
| 3 | **StatusInvest** (scraping) | DY, P/L, P/VP, ROE, Dív.Líq/EBITDA. Sem payout — o do site está marcado como BETA. |
| 4 | **Fundamentus** (scraping) | DY, P/L, P/VP, ROE, Dív. Líquida, EBITDA. Último recurso. |

### O plano Gratuito da brapi não tem fundamentos

`modules=defaultKeyStatistics,financialData` exige o **plano Pro (R$ 139,99/mês)**. Com token
do plano Gratuito a API responde `403 MODULES_NOT_AVAILABLE`, e o que sobra é preço.

O radar trata isso sem perder a fonte: ao ver esse 403 ele **repete a chamada sem os
módulos** e usa o preço, registrando a ressalva em `fontesConsultadas` — visível no
relatório, no JSON e nos cartões. Os fundamentos vêm dos três scrapings.

Erros de token são distinguidos: `MISSING_TOKEN` diz para definir a env, `INVALID_TOKEN` diz
que a chave é inválida — não manda definir o que já está definido.

### Detalhes de cada scraping

**Investidor10** — `investidor10.com.br/acoes/{ticker}/`. Os valores são lidos do atributo
`data-current-value`, que carrega o número **cru, sem o arredondamento da tela** (payout
`75.976515021007` em vez de `75,98%`).

**StatusInvest** — `statusinvest.com.br/acoes/{ticker}`. A página repete cada indicador num
bloco de comparação preenchido com `-`; vale a primeira ocorrência com número.

**Fundamentus** — `fundamentus.com.br/detalhes.php?papel={ticker}`. Servida em
**ISO-8859-1** (decodificar como UTF-8 corrompe `Dív. Líquida`), e rótulos duplicados
aparecem primeiro na coluna de 12 meses — é ela que vale. Não publica payout. O EBITDA sai
de `Valor da firma ÷ (EV / EBITDA)`, marcado como **derivado**.

`dadosdemercado.com.br` foi avaliado e **descartado**: os valores que devolve não batem com
o ticker pedido, e dado errado é o único resultado inaceitável aqui.

### Dívida líquida / EBITDA: publicada vence derivada

As fontes usam janelas de EBITDA diferentes e **discordam** — para TAEE11, no mesmo dia:
Investidor10 `3,48`, StatusInvest `4,08`, e `4,13` derivando do Fundamentus. Isso muda o
veredito (atenção vs. alavancagem alta), então:

- Se alguma fonte publica a razão pronta, ela é usada e a etiqueta mostra qual fonte.
- Só na falta de todas ela é calculada de `dívida líquida ÷ EBITDA`, e a etiqueta diz
  `calculado`, nomeando as fontes dos dois insumos.

Dividir a dívida de um lugar pelo EBITDA de outro inventaria um número que ninguém publicou.

## Motor de diagnóstico

`src/diagnostico.ts` é puro e testável. Percentuais como fração (`0.085` = 8,5%).

As faixas são uma **tabela declarativa** (`FAIXAS_DIVIDEND_YIELD`, `FAIXAS_PAYOUT`, …), e ela
é a única fonte de verdade: o motor avalia lendo a tabela e a régua da interface desenha
lendo a mesma tabela. Mudar um limite muda regra e desenho de uma vez — não existe onde
divergir.

**Em todo limite exato o valor cai na faixa mais favorável** — `0.13` de DY é "Faixa boa",
payout `1.0` é "Saudável", dívida/EBITDA `3.5` é "Atenção", P/VP `2.5` é "Faixa razoável".
É por isso que só algumas faixas levam `ateInclusivo` na tabela.

| Indicador | Faixas |
|---|---|
| **Dividend Yield 12m** | `> 0.13` Alto demais — investigar (warn) · `0.06–0.13` Faixa boa (ok) · `0.03–0.06` Moderado (warn) · `< 0.03` Baixo p/ carteira de renda (bad) |
| **Payout** | `> 1.0` Acima de 100% — insustentável (bad) · `0.40–1.0` Saudável (ok) · `0.25–0.40` Baixo — reinvestindo (warn) · `< 0.25` Abaixo do mínimo usual (warn) |
| **Dívida líq./EBITDA** | `< 0` Caixa líquido (ok) · `0–1.5` Confortável (ok) · `1.5–2.5` Normal (ok) · `2.5–3.5` Atenção (covenants) (warn) · `> 3.5` Alavancagem alta (bad) |
| **P/VP** | `< 0.8` Descontada — entender por quê (warn) · `0.8–2.5` Faixa razoável (ok) · `> 2.5` Preço esticado (warn) |
| **ROE** | `≥ 0.15` Rentabilidade forte (ok) · `0.08–0.15` Rentabilidade ok (ok) · `< 0.08` Rentabilidade fraca (warn) |
| **Preço, P/L** | exibidos como informativos, sem faixa e sem peso no veredito |

**Veredito**: qualquer `bad` → `fragile`; 2 ou mais `warn` → `attention`; senão, **se houver
cobertura**, `solid`; sem cobertura, `indeterminate`.

`bad` e `warn` são achados afirmativos e valem sozinhos. `solid` é afirmação positiva e exige
cobertura: pelo menos `max(2, metade dos indicadores aplicáveis)` preenchidos — 3 de 5 numa
ação, 2 de 2 num FII. Sem isso o veredito é **"Sem dados"**, nunca "Sólida". Chamar de sólido
um papel sobre o qual não se sabe nada é o pior erro que essa ferramenta pode cometer.

A razão dívida/EBITDA só é calculada com os dois valores presentes **e EBITDA positivo** —
com EBITDA zero ou negativo a razão não tem leitura, então volta `null`.

## Ações e FIIs

O tipo do papel é descoberto pelas fontes, sem lista de tickers: Investidor10 e StatusInvest
respondem `404`/`410` na rota errada (`/acoes/` vs `/fiis/`), e o Fundamentus serve os dois na
mesma URL trocando o rótulo de identidade de `Papel` para `FII`. Isso resolve o caso que
sufixo nenhum resolve: TAEE11 é *unit* de ação e MXRF11 é FII, ambos terminando em 11.

Num FII, **payout, dívida líq./EBITDA e ROE aparecem como "Não se aplica a FII"** — não como
"sem dado". A distinção importa: "sem dado" é a fonte que não publicou; "não se aplica" é a
métrica que não tem sentido para a classe do ativo. Sobram DY e P/VP, que são justamente os
dois indicadores que a regra existente já mede bem, e a cobertura passa a exigir os dois.

As faixas usadas num FII são as mesmas das ações. É uma escolha consciente: inventar faixas
de FII que você não especificou seria pior que reusar faixas cujos limites estão à vista na
régua.

## Camada de IA (opcional)

Com `--ai` **e** `ANTHROPIC_API_KEY` definida, o pipeline chama a API da Anthropic
(`@anthropic-ai/sdk`, modelo `claude-sonnet-4-6`) passando **somente** os números já
coletados e os diagnósticos já calculados, e pede resumo de 2–3 frases + até 3 pontos de
atenção em pt-BR. A IA nunca fornece número — só interpreta o que o pipeline entregou. Sem
a flag ou sem a chave, a etapa é ignorada em silêncio, e a interpretação nunca vai para o
cache.

## Cache

SQLite via `better-sqlite3`, TTL de **12h por ticker**. Registro expirado é apagado na
leitura. `--no-cache` desliga leitura e gravação.

## Tratamento de erro

Falha explícita em vez de dado errado. Códigos no JSON e nas mensagens:

| Código | Quando |
|---|---|
| `TICKER_INVALIDO` | Fora do padrão da B3 (4 letras + 1–2 dígitos). Falha antes de tocar na rede. |
| `TICKER_NAO_ENCONTRADO` | Alguma fonte negou o papel afirmativamente. A mensagem diz qual, e lista o que aconteceu nas outras. |
| `FONTE_INDISPONIVEL` | HTTP de erro, timeout ou falha de rede. |
| `FORMATO_INESPERADO` | O HTML do Fundamentus perdeu um rótulo esperado, respondeu com outro papel, ou a brapi mudou o schema/a unidade de um campo. |
| `SEM_DADOS` | Nenhuma fonte respondeu, e nenhuma negou o papel. Lista os dois motivos. |

Uma fonte falhar não aborta a análise: a outra é usada e a falha fica registrada em
`fontesConsultadas`, visível no relatório, no JSON e na página.

## Testes

```bash
npm test
```

300 testes. Cobrem todas as faixas do motor de diagnóstico **e cada limite exato**
(`0.13`, `0.06`, `0.03`, `1.0`, `0.40`, `0.25`, `0`, `1.5`, `2.5`, `3.5`, `0.8`, `0.15`,
`0.08`), os campos `null`, as invariantes da tabela de faixas (contígua, sem lacuna, cada
limite numa faixa só), a matemática da agulha da régua, o parser do Fundamentus contra HTML
real capturado em `test/fixtures/` (as fixtures grandes vão gzipadas), os parsers do
Investidor10 e do StatusInvest, a degradação da brapi para o plano Gratuito, as guardas de
unidade, a mescla com procedência, as etiquetas de procedência, o TTL do cache, o `render` da
página Hono, e — o mais importante — que **análise sem dado nunca vira "Sólida"**.
