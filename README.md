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
| `RADAR_CDI_ANUAL` | não | CDI anualizado em pontos percentuais (ex.: `13.9`). Só fallback: a série do Banco Central é a fonte primária e não pede token. |
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

### O plano Gratuito da brapi: o que dá e o que não dá

| Recurso | Plano Gratuito |
|---|---|
| Preço, volume | ✅ |
| `summaryProfile` (setor/indústria) | ✅ — é o que alimenta a classificação |
| `defaultKeyStatistics`, `financialData` | ❌ plano Pro (R$ 139,99/mês) |
| `balanceSheetHistory`, `incomeStatementHistory` | ❌ plano Startup (R$ 119,99/mês) |
| Mais de 1 ativo por requisição | ❌ plano Startup |
| Taxa SELIC / inflação | ❌ plano Startup — o CDI vem do Banco Central |

O **histórico de proventos** não passa por nenhum paywall: sai do próprio Fundamentus, em
HTML renderizado. O histórico anual de indicadores (para a trajetória de alavancagem) segue
inacessível — é carregado por JS nos scrapers e é plano pago na brapi.

**Consequência prática:** a trajetória de alavancagem (que abranda `bad` para `warn` numa
cíclica) precisa dos módulos de histórico. A lógica está implementada e testada, e a busca
segue a spec — mas **no plano Gratuito não há de onde tirar a série**, então a trajetória fica
`unknown` e a alavancagem alta permanece `bad`. Avaliei raspar o endpoint interno de gráficos
do Investidor10 e descartei: API não documentada é exatamente a fonte frágil que produziria
número errado em silêncio.

### Os módulos de fundamentos

Com token do plano Gratuito a API responde `403 MODULES_NOT_AVAILABLE` e informa quais
módulos negou. O radar lê essa lista e **repete a chamada só com os permitidos** — largar
todos perderia também o setor, de que a classificação depende. A ressalva fica registrada em
`sources`, visível no relatório, no JSON e nos cartões. Os fundamentos vêm dos scrapings.

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

**Veredito**: ver a seção de análise por categoria acima. `solid` exige cobertura de pelo
menos `max(2, metade dos aplicáveis)` — 3 de 5 numa ação, 2 de 2 num FII. Sem isso sai **"Sem
dados"**, nunca "Sólida": chamar de sólido um papel sobre o qual não se sabe nada é o pior
erro que essa ferramenta pode cometer.

As faixas por categoria vivem na mesma tabela declarativa, então o ROE de banco é desenhado
na régua com os limites dele (12% e 18%), não com os gerais.

A razão dívida/EBITDA só é calculada com os dois valores presentes **e EBITDA positivo** —
com EBITDA zero ou negativo a razão não tem leitura, então volta `null`.

## Análise sensível ao tipo de empresa

A mesma régua aplicada a tudo produz diagnóstico errado. O caso que motivou isso: a Klabin
aparecia como **"payout 233% — insustentável"** e veredito frágil, quando o lucro contábil
dela está distorcido por variação cambial e ativo biológico. Não é empresa distribuindo mais
do que ganha; é denominador quebrado.

Cada empresa é classificada em uma de quatro categorias (`src/classification.ts`, tabela de
lookup explícita e testável), a partir de setor/indústria da brapi (`summaryProfile`) com
fallback pro Setor/Subsetor do Fundamentus:

| Categoria | O que muda |
|---|---|
| **financeiro** | Dívida líq./EBITDA vira `na` (alavancagem é a natureza do negócio, regulada por Basileia). ROE passa a ser o indicador central, com régua mais exigente: ≥ 18% forte, 12–18% ok, < 12% fraca. |
| **FII** | Réguas próprias de DY e P/VP, indicador de prêmio sobre o CDI, e payout/dívida-EBITDA/ROE como `na`. Detalhes abaixo. |
| **cíclica** | Payout e ROE viram `unrel` quando o lucro está distorcido. DY em faixa boa é rebaixado a alerta ("dividendo cíclico"). Dívida alta em desalavancagem por 2+ períodos vira `warn` em vez de `bad`. |
| **holding** | P/VP < 0,8 é `ok` ("desconto de holding, estrutural") em vez de alerta, com nota fixa explicando por quê. |
| **perene** | Regras gerais, sem mudança. |

Holdings são checadas primeiro: o setor da Itaúsa diz "Financeiro", e julgá-la como banco
aplicaria a régua de ROE errada. Além do subsetor, há uma lista manual de tickers.

**Especificidade vence amplitude.** O subsetor decide antes da indústria, que decide antes do
setor. Isso não é detalhe: a B3 arquiva shopping como *"Financeiro e Outros / Exploração de
Imóveis"*, e casar o setor amplo primeiro entregaria a Iguatemi e a Multiplan à régua de ROE
de banco. O texto mais estreito que casar com alguma regra é o que vale.

Os setores perenes estão **nomeados na tabela**, não só no default. Sem isso toda elétrica,
telecom e saneamento sairia marcada como "setor não reconhecido", e o aviso perderia sentido.

Classificação que falha cai em `perene` e é sinalizada (`uncertain: true`), com nota no
resultado. Ela não é o único guarda-corpo — veja o detector abaixo.

### Dois status novos

- **`na`** (não aplicável): o indicador não tem sentido para a categoria. Exibido esmaecido,
  com o motivo, e a régua não é desenhada.
- **`unrel`** (não confiável): o número existe mas está distorcido. Exibido em roxo, com o
  valor à vista e a régua vazia — dá para ver o 233,9% e ao mesmo tempo saber que ele não
  sustenta leitura.

Nenhum dos dois conta no veredito.

### Detector de lucro distorcido

`distortedProfit` roda **independente da categoria**, então protege mesmo quando a
classificação setorial falha. Dispara com P/L > 40, ou dividendo pago sem lucro positivo, ou
ROE < 3% junto com DY > 5%. Quando dispara, payout e ROE viram `unrel`.

### Veredito

`fragile` (1+ `bad`) · `attention` (2+ `warn`) · `inconclusive` · `solid` · `indeterminate`.

`bad` e `warn` são achados afirmativos e valem sozinhos. Depois deles vem a usabilidade do
painel: `inconclusive` quando há distorção e o resto não dá cobertura, ou quando o indicador
crítico da categoria (o ROE de um banco) é ilegível. `solid` continua exigindo cobertura.

**Desvio da spec, deliberado:** contar `na` na conta de "3+ inconclusivo" tornaria **todo
FII inconclusivo**, porque um FII tem sempre 3 indicadores estruturalmente inaplicáveis. Por
isso `na` (estrutural, esperado) e `unrel` (deveria ser legível e não é) são contados
separados, e só o segundo pesa. Em troca, um banco com ROE ilegível vira `inconclusive` pela
regra do indicador crítico — que a própria spec justifica ao chamar o ROE de central.

### Aviso de classe mais líquida

Ticker terminado em 3 ou 4 tem as classes irmãs consultadas na brapi; se outra tiver volume
5x maior, entra a nota (`KLBN11 é a classe mais líquida deste emissor`). A spec pedia uma
única chamada `/quote/T1,T2,T3`, mas o plano Gratuito aceita **1 ativo por requisição** —
então tenta a combinada e cai para uma chamada por classe. Falha aí nunca quebra a análise.

## Histórico, contexto e pares

O radar não era só um painel curto — era uma **foto sem filme**. Para carteira de renda o que
decide não é o yield de hoje, é a consistência, e nada disso estava visível.

### Histórico de proventos

Vem da página `proventos.php` / `fii_proventos.php` do Fundamentus — mesma fonte que já
raspo, HTML renderizado, com tabela ano→valor e os eventos individuais (data-com, data de
pagamento e **tipo**). Daí sai:

| Indicador | Por que decide compra |
|---|---|
| **Anos seguidos pagos** (com faixa) | A única medida direta de consistência da renda |
| **Provento/ação no último ano** | O que você de fato planeja receber, em reais |
| **Variação do provento** | Dispersão. TAEE11 tem 50,7% contra 19% do MXRF11 — mesma "renda", previsibilidade oposta |
| **Fatia em JCP** | JCP é tributado na fonte e dividendo não; muda o que chega na conta |
| **Próximo pagamento** | Data e valor já declarados |

### O ponto cego que isso fechou

TAEE11 era **SÓLIDA**. Com o `CAGR de lucro 5a = −6,9%` no painel, virou **ATENÇÃO**. Lucro
encolhendo 7% ao ano com payout de 76% é uma conta que não fecha, e antes nada mostrava.

### Comparação com pares

O Investidor10 publica a mediana de setor, subsetor e segmento ao lado de cada indicador. Ela
entra na régua como um **tique vazado**, deliberadamente mais discreto que a agulha: responde
"o papel é bom ou o setor todo é assim?". O DY da TAEE11 é 8,0% contra 3,0% do setor; o ROE é
20,1% contra 11,9%.

### A mediana é a do setor amplo, de propósito

O Investidor10 publica três escopos: setor, subsetor e segmento. O radar mostra o **setor**,
mesmo tendo os mais específicos. Motivo concreto: para a Klabin o site publica DY "mediano"
de **23,06% no subsetor e 34,25% no segmento** — agregados de duas ou três empresas viram
ruído, não contexto. O setor diz 2,66%, que é crível. O rótulo sempre nomeia o escopo usado.

### Painel de contexto

ROIC, margens, liquidez corrente, dívida/patrimônio, CAGR de receita e posição na faixa de 52
semanas entram num grid compacto **sem régua e sem peso no veredito**. Dar a eles o mesmo
espaço visual dos indicadores com faixa afogaria o veredito.

## FIIs: régua própria

Um FII não é uma empresa com poucos indicadores — é outra classe de ativo, em outra escala.
Um DY de 15% é ordinário num fundo e suspeito numa ação; um P/VP de 0,90 é desconto numa ação
e está em linha num fundo.

| Indicador | Faixas de FII |
|---|---|
| **DY 12m** | `< 6%` baixo p/ FII (warn) · `6–16%` faixa normal (ok) · `> 16%` muito acima do mercado — risco de crédito ou distribuição não recorrente (warn) |
| **P/VP** | `< 0,85` descontada, investigar relatório gerencial (warn) · `0,85–1,05` em linha com patrimônio (ok) · `1,05–1,10` leve ágio (ok) · `> 1,10` ágio (warn) |
| **Payout s/ FFO** | `< 0,85` retendo (ok) · `0,85–1,05` coberta (ok) · `1,05–1,50` acima do FFO (warn) · `> 1,50` muito acima, não sustentada pelo resultado recorrente (bad) |
| **DY − CDI** | informativo, sem faixa: o prêmio sobre a taxa livre de risco |
| Payout, Dívida líq./EBITDA, ROE | `na` — não se aplicam |

Um FII não reporta lucro contábil, então o payout dele é medido contra o **FFO**. A conta é
`DY ÷ FFO Yield`, os dois da mesma ficha e do mesmo período — exata, não um palpite entre
fontes. E ela achou coisa séria: **CPTS11 distribui 228% do FFO** (DY de 14,7% contra FFO
Yield de 6,4%). A distribuição não vem do resultado recorrente, e o yield absoluto esconde
isso por completo.

**Faixa 1,05–1,10 é minha, não sua.** A spec deu `0,85–1,05` para "em linha" e `> 1,1` para
ágio, deixando 1,05–1,10 sem regra. Fechei o buraco com uma faixa própria de leve ágio, `ok`,
que respeita os dois números que você escreveu. As invariantes de contiguidade da tabela
travam isso por teste.

### Prêmio sobre o CDI

Yield absoluto de FII engana. MXRF11 rende 13,0% ao ano, o que soa ótimo — e o CDI está em
13,90%, então o **prêmio é negativo**. É esse número que o indicador mostra.

O CDI vem da **série 4389 do Banco Central** (API SGS, pública, sem token), com fallback para
`RADAR_CDI_ANUAL`. A brapi também tem taxa SELIC, mas é plano Startup. A série 4389 é o CDI
**anualizado**, não o acumulado dos últimos 12 meses — a interface rotula assim de propósito,
porque comparar um DY trailing com uma taxa forward é uma aproximação, e ela fica à vista com
data e fonte na nota do cartão.

### Unit não é FII

Todo FII termina em 11, mas nem todo 11 é FII: TAEE11, KLBN11, SAPR11, SANB11, BPAC11 e
outros são *units* de empresa operacional. A detecção exige as três coisas juntas — ticker
terminado em 11, setor imobiliário, e ausência da lista de exceções — e é precedida por um
sinal mais forte: se algum scraper teve de usar a rota de fundo (`/fiis/`,
`/fundos-imobiliarios/`), o próprio site já disse que é FII, e a heurística nem roda.

SAPR11 é o caso que mostra por que a lista importa: a brapi não devolve setor para ele, então
"termina em 11" sozinho seria um chute.

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

## Linguagem das mensagens

As mensagens dizem **o que o número significa e o que ele implica**, não o nome contábil do
conceito. O rótulo curto da banda carrega o atalho (fica na régua, tem pouco espaço); a linha
completa explica.

Antes e depois:

| Antes | Depois |
|---|---|
| `Distribuição muito acima do FFO — não sustentada pelo resultado recorrente` | `Paga muito mais do que arrecada de aluguel e juros — a diferença vem de venda de imóvel ou do caixa, e esse nível de pagamento não se mantém` |
| `alavancagem é a natureza do negócio, regulada por Basileia` | `Banco e seguradora vivem de captar e emprestar dinheiro, então dívida grande é o normal do negócio — quem controla esse limite é o Banco Central` |
| `Atenção (covenants)` | `Dívida alta — nesse nível os contratos de empréstimo começam a apertar` |
| `Caixa líquido` | `Tem mais dinheiro em caixa do que dívida` |
| `payout sobre lucro não é confiável; verificar política de dividendos, geralmente baseada em EBITDA ou FCL` | `dividir o dividendo por ele não diz nada. Veja no relatório da empresa qual base ela usa para pagar — normalmente a geração de caixa` |

Termos que ficaram: os **nomes dos indicadores** (P/VP, DY, ROE, payout) são como o mercado
brasileiro os chama e trocá-los atrapalharia mais que ajudaria. JCP aparece, mas com a
consequência dita na mesma linha: *"já sai com 15% de imposto retido"*.

## Testes

```bash
npm test
```

587 testes. Cobrem todas as faixas do motor de diagnóstico **e cada limite exato**
(`0.13`, `0.06`, `0.03`, `1.0`, `0.40`, `0.25`, `0`, `1.5`, `2.5`, `3.5`, `0.8`, `0.15`,
`0.08`), os campos `null`, as invariantes da tabela de faixas (contígua, sem lacuna, cada
limite numa faixa só), a matemática da agulha da régua, o parser do Fundamentus contra HTML
real capturado em `test/fixtures/` (as fixtures grandes vão gzipadas), os parsers do
Investidor10 e do StatusInvest, a degradação da brapi para o plano Gratuito, as guardas de
unidade, a mescla com procedência, as etiquetas de procedência, o TTL do cache, o `render` da
página Hono, e — o mais importante — que **análise sem dado nunca vira "Sólida"**.

Regressões travadas por teste, com os números reais de 20/08/2026:

- **KLBN11** (cíclica, P/L 45,45): payout de 233,9% sai `unrel` e nunca `bad`; o veredito não
  é frágil por causa do payout; 4,52x em desalavancagem sai `warn`, e **subindo continua
  `bad`** — o abrandamento é conquistado, não automático.
- **ITUB4** (banco): dívida/EBITDA `na`, veredito calculado sobre os 4 restantes, e o teste
  prova que a regra antiga o chamava de frágil.
- **ITSA4** (holding): P/VP de 0,68 não penaliza.
- **Perene com lucro distorcido**: o detector dispara mesmo sem a categoria ajudar.
- **CPTS11** (FII, DY 14,8%, P/VP 0,84): DY sai "faixa normal p/ FII" — a régua de ação o
  chamaria de "alto demais"; P/VP sai warn de desconto — a régua de ação o chamaria de
  razoável. Os dois contrastes estão travados por teste.
- **TAEE11**: não cai em `fii` nem quando uma fonte rotula o setor dele como fundo.
- **Histórico real** (fixtures de `proventos.php`): TAEE11 com 16 anos seguidos e cortes pelo
  caminho, MXRF11 com dispersão muito menor — o contraste é o que justifica medir dispersão.

### Limiares que são meus, não da especificação

Estes não vêm de fonte nenhuma; são escolhas minhas, e estão aqui para você contestar:
`anos seguidos pagos` (3 e 5), `payout sobre FFO` (0,85 / 1,05 / 1,50), P/VP de FII em
1,05–1,10, e a tolerância de 5% que separa corte de ruído de calendário. O `CAGR de lucro`
usa zero, que não é escolha.
