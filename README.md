# radar-dividendos

Analisa fundamentos de **ações e FIIs** da B3 e emite um diagnóstico **determinístico** (sem
IA) por indicador, com veredito geral. Quatro fontes gratuitas, procedência de cada número à
mostra, e duas interfaces sobre o mesmo motor — app Next.js e CLI — mais uma API HTTP enxuta.

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

O app tem as seguintes telas, na barra do topo:

| Rota | O que é |
|---|---|
| `/` | A tese, a busca e as duas triagens. |
| `/analise?t=TAEE11+ITSA4` | Os cartões dos tickers pedidos. Some `&ia=1` para a leitura por IA. |
| `/fiis` | **Todos os FIIs da B3 acima de R$ 1 bi** pelos cinco filtros, preenchida conforme o servidor termina cada fundo — veja [Triagem de mercado](#triagem-de-mercado-todos-os-fiis-pelos-5-filtros). |
| `/acoes` | **Toda ação que negocia acima de R$ 5 mi por dia**, uma classe por empresa — veja [Ações: os 5 filtros](#ações-os-5-filtros-e-o-desempate). |
| `/carteira?papel=fiis&t=HGLG11,BTLG11` | Simulador com cenários salvos e meta de renda. |
| `/meu-radar` | Favoritos, mudanças, carteira pessoal, calendário e revisões locais. |

A busca fica no cabeçalho em todas as rotas: digite um ou mais tickers separados por espaço.
Cada indicador vem com uma **régua de faixas**: as bandas da regra desenhadas, a banda em que
o valor caiu acesa, e uma agulha na posição exata — dá para ver quanto falta até o próximo
limite. Campo que nenhuma fonte publica aparece como régua tracejada e vazia, nunca estimado.

Toda tela é um link compartilhável, e o botão voltar funciona. Os endereços antigos
(`/?t=…`, `/?fiis=1`, `/?acoes=1`) redirecionam para as rotas novas.

Nas duas triagens, a caixa de seleção de cada linha leva o papel para a carteira: a barra no
rodapé mostra quantos estão marcados e abre `/carteira` com eles. A seleção é explícita, começa vazia e fica salva neste navegador. Clicar num ticker abre a análise completa.


### Dados pessoais locais

Sem backend de contas: favoritos, posições, anotações, até 20 observações por ticker e
cenários usam `localStorage` (`radar-personal-v1`), com validação de formato. As seleções
usam chaves `radar-selection-fiis` e `radar-selection-acoes`. Não há sincronização entre
navegadores. Meu radar permite exportar/importar JSON; a importação preserva registros
locais quando as identidades coincidem.

- **Busca:** sugestões iniciais por nome/ticker, ampliadas pelas ações carregadas nas triagens.
- **Triagens:** filtros por ticker/nome, segmento, critérios atendidos e ordenação por DY/preço.
- **Análise:** resultados progressivos, nova tentativa individual, resumo por regras, favoritos e notas.
- **Simulador:** rascunho automático, cenários nomeados, meta de renda, multiplicador hipotético de
  dividendos e inflação aplicada à meta. Os preços são os da consulta, não ficam congelados ao salvar.
- **Meu radar:** carteira real independente da aprovação na triagem, custo e concentração por setor.
  O histórico compara consultas distintas (reabrir dados do mesmo cache não cria outra observação).
  O calendário reúne o próximo pagamento publicado na última consulta de cada ativo acompanhado,
  por unidade, sem presumir elegibilidade da posição atual na data-base.

As consultas continuam usando as fontes existentes. Histórico e calendário só mudam quando
os ativos são consultados; não existem notificações ou atualização em segundo plano.

### CLI

Roda via `tsx`, sem build.

```bash
npx tsx src/cli.ts TAEE11 ITSA4        # relatório colorido no terminal
npx tsx src/cli.ts TAEE11 --json       # saída JSON
npx tsx src/cli.ts TAEE11 --ai         # + interpretação da IA
npx tsx src/cli.ts TAEE11 --no-cache   # ignora e não grava o cache
npx tsx src/cli.ts --fiis              # todos os FIIs acima de R$ 1 bi pelos 5 filtros
npx tsx src/cli.ts --fiis --json       # a mesma triagem em JSON
npx tsx src/cli.ts --acoes             # toda ação acima de R$ 5 mi/dia pelos 5 filtros
npx tsx src/cli.ts --acoes --json
npx tsx src/cli.ts --serve             # API HTTP em http://localhost:3000
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

### SEO e indexação

Cada rota tem título, descrição e metadados Open Graph/Twitter. A home mantém seu
conteúdo no HTML inicial, mesmo na exportação estática. Há dados estruturados `WebSite`,
`sitemap.xml` e `robots.txt` gerados no build.

Defina `RADAR_SITE_URL` com a URL pública completa (incluindo o subdiretório, se houver)
antes de executar o build. O workflow do GitHub Pages obtém essa URL automaticamente
da configuração do Pages. Sem a variável, canonical e URLs do sitemap são omitidos
para não publicar endereços fictícios ou de localhost.

O sitemap inclui a home e as duas triagens. Análise e carteira usam `noindex, follow`,
pois dependem de seleções nos parâmetros da URL e carregam os resultados no cliente.
As tabelas das triagens também continuam carregando os dados no cliente; seus títulos
e textos introdutórios ficam no HTML inicial.

Em hospedagem por subdiretório, como `usuario.github.io/repositorio`, o `robots.txt`
exportado fica nesse subdiretório; rastreadores consultam apenas o arquivo na raiz do
domínio. Nesse caso, envie a URL completa de `sitemap.xml` ao Google Search Console.
O `noindex` das páginas funciona independentemente do arquivo robots.

| Variável | Obrigatória | Para quê |
|---|---|---|
| `BRAPI_TOKEN` | opcional | Token da brapi.dev, usado só para o preço intradiário. Sem ele o radar segue com as outras três fontes. Crie em <https://brapi.dev/dashboard>. |
| `ANTHROPIC_API_KEY` | só com `--ai` | Sem ela a etapa de interpretação é ignorada em silêncio. |
| `RADAR_CDI_ANUAL` | não | CDI anualizado em pontos percentuais (ex.: `13.9`). Só fallback: a série do Banco Central é a fonte primária e não pede token. |
| `RADAR_CACHE_PATH` | não | Arquivo SQLite do cache. Padrão: `./radar-dividendos.sqlite`. |

## Rotas HTTP

Iguais nos dois servidores (Next.js e Hono), com uma diferença: a interface é o app Next.
O Hono serve só a API — uma segunda interface escrita à mão aqui só ficava para trás do app.

| Rota | Resposta |
|---|---|
| `GET /` | No Next.js, o app React (com as rotas `/analise`, `/fiis`, `/acoes` e `/carteira`); no Hono, o índice das rotas em JSON. |
| `GET /api/analise/:ticker` | JSON da análise. `?ia=1` acrescenta a leitura por IA. |
| `GET /api/fiis` | Triagem de todos os FIIs acima de R$ 1 bi pelos 5 filtros. No Next.js, **NDJSON em streaming** (um evento por linha: `universe`, `fund`/`failure` por fundo, `done` com o relatório); no Hono, o relatório JSON de uma vez, quando termina. |
| `GET /api/acoes` | Triagem de toda ação acima de R$ 5 mi/dia pelos 5 filtros de ação. Mesmo desenho: NDJSON no Next.js (`universe`, `stock`/`failure`, `done`), JSON de uma vez no Hono. |

Status de erro: `400` ticker fora do padrão da B3, `404` ticker inexistente, `502` todas as
fontes indisponíveis ou com formato inesperado.

## Fontes de dados

Todas gratuitas, consultadas **em paralelo**. A ordem abaixo é a prioridade de cada campo: a
primeira fonte que trouxer o campo ganha, as seguintes só preenchem lacuna. **Campo que não
existe em nenhuma fonte volta `null`** — nada é estimado.

| # | Fonte | O que contribui |
|---|---|---|
| 1 | **brapi.dev** (API) | Preço. É intradiário, mais fresco que o das outras. No plano Gratuito é só isso — veja abaixo. |
| 2 | **Investidor10** (scraping) | DY, P/L, P/VP, ROE, **Payout**, **Dív.Líq/EBITDA**, liquidez média diária. Fonte mais completa, e a única com payout. |
| 3 | **StatusInvest** (scraping) | DY, P/L, P/VP, ROE, Dív.Líq/EBITDA. Sem payout — o do site está marcado como BETA. |
| 4 | **Fundamentus** (scraping) | DY, P/L, P/VP, ROE, Dív. Líquida, EBITDA, volume médio de 2 meses. Último recurso. |

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
- **`unrel`** (não confiável): o número existe mas está distorcido. Exibido em verde-água, com o
  valor à vista e a régua vazia — dá para ver o 233,9% e ao mesmo tempo saber que ele não
  sustenta leitura.

Nenhum dos dois conta no veredito.

### Detector de lucro distorcido

`distortedProfit` roda **independente da categoria**, então protege mesmo quando a
classificação setorial falha. Dispara com P/L > 40, ou dividendo pago sem lucro positivo, ou
ROE < 3% junto com DY > 5%. Quando dispara, payout e ROE viram `unrel`.

### Link para o documento de resultado

Todo card traz no cabeçalho o documento de resultado mais recente — **"ver release de
resultados do 2T26"** —, e a mensagem do `unrel`, que manda o leitor conferir o relatório da
empresa, repete o link ao lado dela e no aviso de inconclusivo. Vem de `resultados_trimestrais.php` (ação: release e demonstrações
financeiras, por trimestre) e `fii_relatorios.php` (FII: relatório gerencial, por mês) do
Fundamentus — mesma fonte, mesma latin-1, e os links apontam para os documentos oficiais
(`rad.cvm.gov.br` para empresa, FNET da B3 para fundo). Só o período mais recente entra na
análise; a página inteira fica como link de fallback quando ele não tem documento.

O portal de dados abertos da CVM (`dados.cvm.gov.br`) foi avaliado como fonte direta e
**descartado para consulta ao vivo**: o cadastro de documentos (IPE) é um CSV anual de
~14 MB com o mercado inteiro, indexado por CNPJ e código CVM — que nenhuma das fontes atuais
entrega para o ticker —, e não cobre o relatório gerencial de FII. Serviu para conferir que o
link do Fundamentus é o mesmo protocolo que a CVM lista para "Release de Resultados 2T26" da
Klabin. Falha nessa busca nunca derruba a análise; o card só fica sem o link.

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

**Vacância entra na conta.** Ela é o quinto indicador aplicável de um fundo de tijolo, então
o mínimo para haver veredito sobe de 2 para 3 leituras (`max(2, ⌈aplicáveis/2⌉)`). Um fundo
com só DY e P/VP lidos passa a sair como **sem veredito** em vez de sólido — o que é a
resposta honesta para duas leituras em cinco. Fundo de papel não muda: a vacância dele é `na`.

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

### O cartão em camadas

O cartão imprimia trinta blocos com o mesmo peso e ~2.500px: o veredito era uma pílula no meio
do cabeçalho, e a justificativa das oito regras (cinco filtros e três desempates) era
reimpressa a cada leitura, ~1.000 caracteres por cartão. Agora a ordem é a da pergunta:

1. **Sempre visível** — ticker, preço, o veredito em corpo grande com a frase que o explica ao
   lado, a procedência e o link do documento de resultado.
2. **Aberto** — as cinco regras em uma linha cada (marca, nome, número) e as réguas que têm
   dado.
3. **Fechado** — o parágrafo que argumenta cada regra (`▸ por que este filtro`), o desempate
   inteiro, e as ressalvas de fonte.

Regra sem dado é exceção: aí o parágrafo *é* a resposta ("Nenhuma fonte informou a vacância"),
e fica visível.

**Indicador que não se aplica não é régua vazia.** As três réguas "não se aplica" de um FII
viram uma linha — *Payout · Dívida líq./EBITDA · ROE — Não se aplica a fundo imobiliário* —
agrupada por motivo, então um fundo de papel ganha a sua própria linha para a vacância e um
banco, para a dívida. O diagnóstico continua produzindo os `na`: eles são o que o `coverage`
conta para decidir se há veredito, e o CLI imprime a linha. O que mudou é o cartão.

### Comparar dois papéis

Dois ou mais tickers abrem numa tabela alinhada — indicador nas linhas, papel nas colunas,
valor e nome da faixa em cada célula — em vez de cartões independentes cujas linhas não se
correspondem. A régua fica no cartão; o que compara é o nome da faixa. O botão *cartões*
volta ao cartão por papel.

### Painel de contexto

ROIC, margens, liquidez corrente, dívida/patrimônio, CAGR de receita, posição na faixa de 52
semanas e liquidez média diária entram num grid compacto **sem régua e sem peso no veredito**. Dar a eles o mesmo
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
| **Vacância** | `< 5%` cheio (ok) · `5–10%` normal (ok) · `10–20%` alta (warn) · `> 20%` crítica (bad). Escala invertida: menos é melhor. O corte de 10% é o mesmo do filtro de vacância — a régua e o painel dos 5 filtros ficam no mesmo cartão e não podem discordar do mesmo fundo |
| **DY − CDI** | informativo, sem faixa: o prêmio sobre a taxa livre de risco |
| Payout, Dívida líq./EBITDA, ROE | `na` — não se aplicam |
| **Vacância**, em fundo de papel | `na` — um fundo sem imóveis não tem área para ficar vazia |

Um FII não reporta lucro contábil, então o payout dele é medido contra o **FFO**. A conta é
`DY ÷ FFO Yield`, e ela é feita **dentro do parser do Fundamentus**, a única fonte que publica
o FFO Yield — os dois números saem da mesma ficha e da mesma janela, e o campo chega marcado
`derivado`. Fazer a divisão depois da mescla pareceria igual e não é: o DY que vence a mescla
é o do Investidor10, com outra janela, e para o HGLG11 isso imprimia **137%** onde a ficha diz
**111%**. O motor só cai na divisão entre campos mesclados se nenhuma fonte trouxe a razão pronta. E ela achou coisa séria: **CPTS11 distribui 228% do FFO** (DY de 14,7% contra FFO
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

## FIIs: os 5 filtros e o desempate

A régua de indicadores diz se os números de um fundo estão saudáveis. Ela não diz se o fundo
é **candidato** a uma carteira de renda — isso é uma triagem, com critérios que não são
indicadores: segmento, tamanho, idade, custo e quem gere. Para FII o cartão ganha um bloco
próprio, **acima dos indicadores**, com cinco filtros eliminatórios e três critérios de
desempate. Ele fica ao lado do veredito, não dentro dele: um fundo pode ser SÓLIDA nos
números e reprovar no segmento, e as duas coisas têm de ficar visíveis ao mesmo tempo.

| # | Filtro | Passa quando | Fonte |
|---|---|---|---|
| 1 | **Segmento resiliente** | Logística, shoppings, lajes corporativas ou renda urbana. Reprova por nome: hotel, hospital, residencial, desenvolvimento (segmento *ou mandato*) e fundo de fundos. **Híbrido de tijolo sai como `sem dado`**: a fonte usa a palavra para qualquer mistura, e o KNRI11 (lajes + logística) não pode reprovar pelo mesmo motivo que um fundo de terras. Híbrido de papel, papel puro e agências reprovam como "fora da lista". | Investidor10 (`SEGMENTO`, `TIPO DE FUNDO`, `MANDATO`) |
| 2 | **Patrimônio acima de R$ 1 bilhão** | PL ≥ R$ 1 bi. | Investidor10 (`VALOR PATRIMONIAL`), Fundamentus (`Patrim Líquido`, exato) |
| 3 | **Mais de 5 anos de bolsa** | 5+ anos completos seguidos pagando, pelo histórico de proventos. Sem histórico, vale a marca "listado há mais de 5 anos" do Investidor10, com a ressalva dita. | Fundamentus (`fii_proventos.php`), Investidor10 (checklist) |
| 4 | **Custo total até 1,15% ao ano** | Taxa ≤ 1,15%. A regra original dizia 1,1%; o teto subiu meio ponto-base depois que o KNRI11 reprovou por 1,11%. | Investidor10 (`TAXA DE ADMINISTRAÇÃO`) |
| 5 | **Gestora de primeira linha** | A gestora está numa lista de referência. | Investidor10 (texto "Sobre") |

Cada critério sai como `passou`, `não passou` ou `sem dado`, com o valor que sustentou a
leitura e uma linha em português dizendo o que ele implica. O resumo do bloco conta os dois
separadamente: *"Passou em 4 de 5 filtros · 1 sem dado"*.

**Desempate — só depois de passar pelos 5 filtros.** Os três critérios são calculados sempre,
mas o bloco fica esmaecido e rotulado *"só vale depois de passar pelos 5 filtros"* enquanto
algum filtro não passou:

- **Vacância baixa e estável**: abaixo de 10%. "Estável" nenhuma fonte publica — a linha manda
  olhar o histórico no relatório gerencial. Em fundo de papel o critério não se aplica, e o
  `0,00%` que a fonte imprime **não vira nota máxima**.
- **P/VP abaixo de 1**: comprar o imóvel com desconto sobre o laudo.
- **Dividendo sustentado pelo aluguel**: distribuição até 105% do FFO, o mesmo limite da faixa
  "coberta" de *Paga vs. arrecada*. Acima disso a diferença vem de venda de ativo ou do caixa.
- **Um fundo por segmento**: é uma regra sobre a carteira, não sobre um fundo, então é
  avaliada sobre o conjunto analisado junto. Se `HGLG11 XPLG11` entram na mesma consulta, a
  página e o CLI avisam que os dois são de logística.

### O que as fontes não dão, e como isso aparece

- **Custo total.** A fonte publica só a taxa de administração; em muitos fundos ela inclui a
  gestão, em outros não, e performance é sempre à parte. A linha do filtro diz isso
  explicitamente e manda ao regulamento. Taxa escrita sem percentual legível (`R$ 30 mil
  mensais`) sai como `sem dado` com o texto original à vista.
- **Gestora.** O Investidor10 não tem um campo; o nome é lido da prosa ("gerido pela Pátria
  Investimentos e administrado pelo Banco Genial", "conta com gestão da XP Asset Management").
  O nome precisa começar com maiúscula, senão "gestão de imóveis logísticos" viraria gestora.
- **Lista de gestoras.** É minha e está em `REFERENCE_MANAGERS`: casas com histórico público
  longo em FIIs listados. Gestora **fora da lista não reprova** — sai como `sem dado` com o
  nome e a instrução de conferir histórico, relatórios e governança. Ausência numa lista não
  é evidência de nada.
- **Segmento do Fundamentus.** A ficha arquiva o HGLG11 como "Multicategoria". Um rótulo
  grosso desses reprovaria o fundo pelo motivo errado, então dela só se lê o patrimônio.
- **Lajes AAA.** Nenhuma fonte diz o padrão dos imóveis. Lajes corporativas passam com a
  ressalva de conferir no relatório se são AAA.

### O que a triagem achou nos fundos reais (03/09/2026)

- **HGLG11** passa nos 5 filtros (logística, R$ 7,59 bi, 9 anos seguidos pagando, 0,60%,
  Pátria). No desempate, vacância 2,9% e P/VP 0,89 passam — e a distribuição **não** passa:
  paga mais do que o FFO.
- **MXRF11** passa em 4 de 5: reprova só no segmento, por ser fundo de papel. Vacância "não se
  aplica", em vez do 0% enganoso.
- **XPLG11** passa em 4 de 5 com a gestora lida da prosa (XP Asset Management) e, junto com
  HGLG11, dispara o aviso de segmento repetido.

## Triagem de mercado: todos os FIIs pelos 5 filtros

Os cinco filtros julgam um fundo por vez. Para escolher onde investir a pergunta é a inversa:
**quais** fundos da B3 passam hoje? A triagem de mercado responde isso com o mesmo motor,
sem critério novo.

1. **Universo.** A lista "todos os FIIs" do Fundamentus (`fii_resultado.php`) é a única fonte
   gratuita com todos os fundos numa requisição só: ~550 fundos com segmento, cotação, DY,
   P/VP, valor de mercado, liquidez e vacância. As colunas são achadas pelo cabeçalho, não
   pela posição, e a página lança `FORMATO_INESPERADO` se alguma sumir.
2. **Pré-seleção pelo tamanho.** O patrimônio não está na lista, mas *valor de mercado ÷ P/VP*
   é o patrimônio por definição do múltiplo — álgebra, não estimativa. Só fundos com esse
   valor **≥ R$ 950 mi** seguem: a margem de 5% cobre o arredondamento do P/VP em duas casas, e
   quem decide é o patrimônio exato da ficha, no filtro 2. Isso corta ~550 fundos para ~85
   consultas. Fundo sem valor de mercado ou sem P/VP na lista fica de fora — na prática, não
   negocia.
3. **Análise completa de cada candidato.** Cada um passa pelo mesmo `analyze` de um ticker
   digitado, quatro por vez, **compartilhando o cache**: o resultado por fundo é idêntico ao
   do cartão, e a triagem seguinte (ou um clique no ticker) sai do SQLite. A primeira rodada
   leva uns 3–4 minutos; as próximas, segundos, até o TTL de 12h vencer.
4. **Três grupos, e a ordem de cada um.**
   - **Passaram nos 5 filtros** — ordenados por quantos critérios de desempate passam, depois
     pelo P/VP (mais desconto primeiro), depois pelo ticker. O aviso de *um fundo por
     segmento* é calculado sobre este grupo.
   - **Falta conferir à mão** — nenhum filtro reprovou, mas algum ficou `sem dado`. Ordenados
     por quanto falta. É onde caem fundos cuja gestora a fonte não nomeou, ou cuja ficha veio
     incompleta; a tabela diz exatamente o que conferir.
   - **Reprovados** — com o primeiro filtro que reprovou ao lado. Recolhidos por padrão na
     página; no CLI, uma linha por fundo.
   - **Sem análise** — fundos para os quais nenhuma fonte respondeu, com o erro.

O CLI mostra o progresso numa linha só em `stderr` (a saída `--json` continua limpa). Na
página, a rota responde em **streaming NDJSON**: cada fundo chega quando termina, a tabela é
reordenada no cliente com a mesma função `rank` do servidor, e a barra de progresso é o que
impede uma conexão de minutos de parecer travada.

### Montar carteira

A rota `/carteira` transforma a seleção de qualquer das duas triagens numa lista de compras:
um valor a investir e três formas de dividir. É conta pura sobre os números que a triagem já
buscou — nada novo é requisitado, e funciona igual no instantâneo do GitHub Pages.

**Seleção.** Cada linha dos aprovados e dos *falta conferir* tem uma caixa. Aprovados entram
marcados; os de conferência manual entram desmarcados e, quando marcados, aparecem na
carteira com a etiqueta **conferir** — é o leitor assumindo a checagem que a fonte não fez.
Reprovados não têm caixa. Cada um dos dois grupos tem *marcar todos* e *desmarcar todos* no
cabeçalho. O estado guarda só os desvios do padrão (aprovado desmarcado, pendente marcado),
o que mantém o padrão certo enquanto as linhas ainda chegam pelo stream. A barra fixa no
rodapé da triagem diz quantos estão marcados e leva para `/carteira?papel=…&t=…`, com os
tickers no endereço: a carteira é tão compartilhável quanto uma análise.

Os rótulos acompanham o papel — *fundo* e *cota* nos FIIs, *ação* nas ações — e o teto de
concentração conta por **segmento** num caso e por **setor** no outro.

- **Divisão igual** — o mesmo valor em cada papel selecionado.
- **Peso pela qualidade** — proporcional a *desempates passados + 1*, para quem passou em
  0/3 ainda ter fatia: passou nos cinco filtros.
- **Maximizar renda** — proporcional ao DY 12m, com **teto de 25% por fundo e 40% por
  segmento**. Sem teto, o modo concentra tudo no maior DY, que costuma ser o fundo que pagou
  algo não recorrente ou o mais arriscado. O excesso de quem bate no teto é redistribuído
  entre os outros; com poucos fundos ou poucos segmentos o teto relaxa até a fatia igual, já
  que três fundos não cabem em 25% cada. Fundo sem DY não tem como ser pesado e fica de fora.

**Começar do zero.** Sem valor a investir, mas com aporte mensal, não há lista de compras —
não há o que comprar hoje — e a carteira mostra só a projeção, sobre o **DY previsto**: o
rendimento que a divisão escolhida teria, calculado antes do arredondamento em cotas. É o caso
de quem ainda não tem patrimônio e quer saber onde dez anos de R$ 500 por mês chegam. Sem valor
e sem aporte, a página pede um dos dois.

**Cota inteira.** FII não tem fração. Cada alvo é arredondado para baixo, e o troco é gasto
uma cota por vez no fundo mais abaixo do alvo, até nenhum caber. O que sobra aparece como
troco. Fundo cuja fatia não compra uma cota (R$ 1.000 em doze fundos a R$ 100+) é listado
como fora, com o motivo.

**Renda estimada.** DY 12m × valor aplicado ÷ 12, por fundo e no total, com a ressalva
explícita de que é o que o fundo pagou, não o que vai pagar. Fundo sem DY entra na carteira
mas não na renda, e o total é marcado como *parcial*.

**Dois gráficos, SVG na mão, sem biblioteca.** A **rosca de distribuição** tem uma fatia por
fundo e a **cor por segmento** — a pergunta que o desempate faz é "quanto está em
logística?", e a cor responde de longe enquanto o rótulo e o tooltip respondem o fundo. As
cores são a paleta categórica de referência da skill de dataviz, validada pelo script dela
contra as duas superfícies do app (claro `#faf9f5`, escuro `#181715`): passa em separação
para daltonismo e em contraste no escuro; no claro três tons ficam abaixo de 3:1 e a
mitigação é a tabela ao lado, que sempre existe. A **curva de crescimento** projeta o
patrimônio a 5, 10, 20 ou 30 anos, com um **aporte mensal** opcional, em dois traços:
reinvestindo os rendimentos (cada mês o saldo rende e recebe o aporte, na cor da série) e
sacando (o aporte compra cotas, o rendimento do principal acumula em caixa, em cinza
tracejado, como contexto). O aporte entra só na projeção, não na lista de compras — a lista é
o que comprar hoje.
Crosshair que gruda no ano mais próximo, tooltip com as duas linhas e a renda mensal que a
posição reinvestida pagaria até lá. É projeção, não previsão: congela cotação e DY nos
valores de hoje e mostra só o efeito de reinvestir ou não — o texto ao lado diz isso.

### O que a triagem achou (14/09/2026)

553 fundos na lista, 84 acima de R$ 1 bi, 469 pequenos demais. **12 passaram** nos cinco
filtros: HSLG11 e LVBI11 com 3/3 no desempate (logística, P/VP 0,74 e 0,81, distribuição
coberta pelo FFO); PVBI11 e HGRE11 (lajes, com a ressalva AAA); VILG11, XPLG11, HGLG11,
BTLG11 e BRCO11 (logística); HGBS11, XPML11 e GSFI11 (shoppings). Dos 12, **oito não passam
no desempate da distribuição** — pagam entre 115% e 162% do FFO — e a página avisa que sete
são do mesmo segmento.

**16 em *falta conferir***: sete híbridos de tijolo que a fonte não desdobra (JSRE11 e BRCR11
com desconto de 40–50% no laudo, KNRI11, HGRU11, TRXF11, GARE11, ALZR11), quatro pela gestora
(Tivio, Zagros, ou nenhuma nomeada na prosa) e cinco por fichas incompletas no Investidor10.

**56 reprovados**: 44 no segmento (papel, FoFs, agências, Fiagros — e RBVA11, cujo mandato é
"Desenvolvimento para renda"), 6 na idade, 4 no patrimônio exato (GALG11 R$ 572 mi, IBBP11
R$ 998 mi), 3 no custo (HSML11 1,30%, VISC11 1,35%, RZTR11 1,25%). Nenhum falhou. O KNRI11
reprovava no custo por 1,11% ao ano, um ponto-base acima do teto original de 1,1%; o teto
subiu para 1,15% e ele passou a *falta conferir*, pelo híbrido.

Dois ajustes vieram desta rodada. A fonte escreve "a gestão é conduzida pelo BTG Pactual Asset
Management" e o leitor da prosa só conhecia "gerido pela" e "conta com gestão da"; a frase
entrou, e BTLG11, XPML11 e VILG11 passaram. E "Híbrido" reprovava 19 fundos de tijolo pelo
mesmo motivo que um fundo de terras — KNRI11, HGRU11 e TRXF11 entre eles; agora sai como
`sem dado`, e quem decide a mistura é o relatório gerencial.

## Ações: os 5 filtros e o desempate

Indicador é filtro, não decisão. Ele elimina porcaria rápido; não acha empresa boa sozinho —
e o que é "bom" muda por setor: o mesmo P/VP de 2,2× significa coisas opostas na Klabin e no
Itaú. A régua de indicadores diz se os números de uma empresa estão saudáveis; o bloco de
filtros, **acima dos indicadores** no cartão de toda ação, diz se ela sobrevive ao corte
inicial. O que sobra é onde começa o trabalho de verdade, que é ler o release — e o cartão
já traz o link dele.

| # | Filtro | Passa quando | Fonte |
|---|---|---|---|
| 1 | **ROE acima de 15%** | ROE ≥ 15%, o custo de capital no Brasil hoje. Com lucro distorcido (ver o detector), sai como `sem dado` com o número à vista — o 233% da Klabin não sustenta leitura. | Investidor10, StatusInvest, Fundamentus, brapi |
| 2 | **Dívida líq./EBITDA abaixo de 2,5×** | Razão < 2,5×; caixa líquido passa. **Banco e seguradora saem como `sem dado`**: alavancagem é a natureza do negócio, e o que vale lá é Basileia e inadimplência, que nenhuma fonte gratuita publica. A razão publicada vence a derivada, como no resto do radar. | Investidor10, StatusInvest, Fundamentus (derivada) |
| 3 | **Margem líquida acima de 5%** | Margem ≥ 5%. Também vira `sem dado` com lucro distorcido — margem líquida divide pelo mesmo lucro. | Investidor10, StatusInvest, Fundamentus |
| 4 | **Receita crescendo** | CAGR de receita em 5 anos > 0. A regra original pedia *três anos seguidos* crescendo; nenhuma fonte gratuita publica a série ano a ano (é carregada por JS nos scrapers e paga na brapi), então o que dá para checar é a média composta, e a linha diz isso. Se cresceu com caixa próprio ou com dívida e emissão, só a DFP mostra. | Investidor10, StatusInvest, Fundamentus |
| 5 | **Liquidez diária acima de R$ 5 mi** | Volume médio diário ≥ R$ 5 mi. | Investidor10 (`Liquidez Média Diária`), Fundamentus (`Vol $ méd (2m)`) |

Cada critério sai como `passou`, `não passou` ou `sem dado`, com o valor e uma linha em
português dizendo o que ele implica — inclusive a armadilha: ROE alto com dívida alta é
alavancagem, não qualidade, e a linha do ROE manda olhar o ROIC.

**Desempate — só depois de passar pelos 5 filtros.** Três critérios, calculados sempre e
esmaecidos até o papel passar:

- **ROIC acima do custo de capital**: ≥ 15%. Retorno sobre todo o capital, dívida incluída —
  não se deixa enganar por alavancagem.
- **Payout entre 30% e 60%**: paga e ainda reinveste. Acima de 100% é empresa sem onde
  investir ou mascarando problema; 60–100% reprova com a ressalva de que é normal em
  transmissão de energia; abaixo de 30% paga pouco para uma carteira de renda.
- **P/L abaixo da mediana do setor**: valuation só depois de tudo acima, e sempre contra
  pares — a mediana é a do setor amplo que o Investidor10 publica, pelo mesmo motivo da régua.
  Múltiplo baixo isolado não diz nada, e a linha diz que costuma haver um motivo.

O detector de lucro distorcido roda dentro do próprio filtro, independente do veredito, então
uma cíclica em ano de lucro contábil quebrado cai em *falta conferir*, não em *reprovada*.

## Triagem de mercado: ações pelos 5 filtros

1. **Universo.** A lista "todas as ações" do Fundamentus (`resultado.php`): ~1.000 papéis
   com cotação, P/L, P/VP, DY, margens, ROIC, ROE, liquidez de 2 meses, patrimônio e
   crescimento de receita, numa requisição só. Colunas achadas pelo cabeçalho, como na lista
   de FIIs.
2. **Pré-seleção pela liquidez.** É o único filtro que a lista responde, e o que mais corta:
   de ~1.000 papéis para ~155 com volume ≥ R$ 4,75 mi/dia (a margem de 5% cobre a janela
   diferente entre lista e ficha; quem decide é a ficha, no filtro 5). Depois, **uma classe
   por emissor** — PETR3 e PETR4 são a mesma empresa, e a mais negociada fica. Sobram ~145
   empresas.
3. **Análise completa de cada candidata.** O mesmo `analyze` de um ticker digitado, quatro por
   vez, compartilhando o cache. A primeira rodada leva uns 8–10 minutos; as próximas, segundos.
4. **Três grupos.** *Passaram nos 5 filtros* ordenadas pelo desempate e depois pelo ROIC —
   qualidade antes de preço. *Falta conferir à mão* quando nenhum filtro reprovou mas algum
   ficou `sem dado`: é onde caem os bancos, pela dívida, e as cíclicas com lucro distorcido.
   *Reprovadas* com o primeiro filtro que reprovou. A tabela mostra os cinco números que os
   filtros leram, o DY e o veredito da régua, lado a lado — um papel pode passar nos cinco
   filtros e estar em ATENÇÃO nos indicadores, e as duas coisas ficam visíveis.

Uma linha do cache anterior a esta versão não tem o bloco de filtros de ação, então o cache
descarta e busca de novo qualquer análise gravada sem ele — em vez de listar a empresa como
"não reconhecida como ação".

### O que a triagem achou (15/09/2026)

987 ações na lista, 144 empresas analisadas (155 papéis acima de R$ 5 mi/dia, menos a classe
repetida de 11 emissores). **37 passaram** nos cinco filtros; **8 em *falta conferir***; **97
reprovadas** — 77 no ROE, 13 na dívida, 6 na margem, 1 no crescimento. O corte fez o que
filtro faz: de 987 para 37 em dez minutos, sem ler um release.

O desempate separa as 37. Só a **CPFE3** passa nos três (ROIC 17,4%, payout na faixa, P/L
abaixo do setor). Sete passam em dois, todas reprovando no valuation contra pares — LEVE3
(ROE 72%, ROIC 28%), CMIN3, PLPL3, MILS3, MULT3 e PETR4 —, o que é o esperado: empresa boa
raramente está mais barata que a mediana do setor. O grupo de um só desempate concentra quem
distribui acima de 60% (TGMA3, DIRR3, ITSA4, CMIG4) e quem tem ROE alto com ROIC abaixo do
custo de capital — POMO4, PSSA3, CMIG4, INTB3 —, a armadilha que o filtro 1 avisa. E dez
passam nos cinco filtros com **zero** desempates: SBSP3 com ROIC de 7,9%, TOTS3 com 9,8%,
GRND3 com 8,2%; passar nos filtros não é o mesmo que ser candidata, e a tabela mostra as duas
coisas.

O veredito da régua vai junto na tabela, e discorda várias vezes: CURY3, RIAA3, TIMS3, ALPA4,
VTRU3 e outras dez passam nos cinco filtros e saem **FRÁGIL** nos indicadores — quase sempre
pelo payout acima de 100% ou pelo DY alto demais (RIAA3 46%, GRND3 40%, VULC3 25%), que é o
"dividendo grande ou preço despencando?" do filtro 7. É por isso que os dois blocos ficam lado
a lado.

Nos *falta conferir*: PINE4 e BPAC11 pela dívida, que não se aplica a banco; AURA33, BRAV3,
TFCO4, DESK3, MGLU3 e SAUD3 pelo lucro distorcido, que esvazia ROE e margem — a cíclica em
ano ruim cai aqui, não em reprovada. A ITSA4 passou como holding, com "margem líquida" de
214%, um número que para holding não significa nada e que o filtro 3 aceita: o setor muda o
que é bom, e essa adaptação por setor é o que ainda não está escrito em regra.

Dois papéis saíram como *sem análise* nessa rodada — ITUB4 e TAEE11 — por estarem no cache
com o formato anterior, sem o bloco de filtros. Daí a regra de descartar linha gravada sem
ele; na rodada seguinte os dois entram normalmente.

## Publicação no GitHub Pages

O GitHub Pages só serve arquivo estático, e o app precisa de servidor: o scraping não roda no
navegador (CORS) e o cache é SQLite. O que fica publicado é um **instantâneo diário**, com a
mesma interface:

1. `npm run snapshot` (`scripts/snapshot.ts`) roda as duas triagens de mercado ao vivo e
   grava `public/data/fiis.json`, `public/data/acoes.json` e `public/data/analise/<TICKER>.json`
   para cada um dos ~85 fundos e ~145 empresas analisados — tudo lido do cache que as próprias
   triagens acabaram de preencher, nada é buscado duas vezes.
2. `RADAR_STATIC=1 next build` (`npm run build:static`) faz o export estático em `out/`, com
   `basePath` no nome do repositório. As rotas de API são removidas antes do build, porque
   export estático não as carrega e o snapshot as substitui.
3. A página lê `data/…` em vez de `api/…` (`app/mode.ts`; caminhos absolutos com o base path,
   porque o app tem sub-rotas e um caminho relativo resolveria contra `/fiis`). A home avisa
   que os dados são um retrato diário e que só os papéis das triagens têm análise pronta —
   ticker fora delas cai numa mensagem, não num erro de rede.

O workflow `.github/workflows/pages.yml` faz os três passos a cada push em `main`, todo dia
útil às 08:00 de Brasília, e sob demanda (*Run workflow*). `BRAPI_TOKEN` é opcional, como
secret do repositório. Se uma fonte bloquear o IP do runner, o fundo sai como `sem dado` ou
`sem análise` — o retrato publicado diz o que conseguiu ler, nunca inventa.

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

O payload é gravado com um `SCHEMA_VERSION`. Quando a `Analysis` muda de forma — um indicador
novo, um bloco novo — a constante sobe e as linhas antigas são descartadas na leitura, em vez
de serem servidas com um pedaço faltando.

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

696 testes. Cobrem todas as faixas do motor de diagnóstico **e cada limite exato**
(`0.13`, `0.06`, `0.03`, `1.0`, `0.40`, `0.25`, `0`, `1.5`, `2.5`, `3.5`, `0.8`, `0.15`,
`0.08`), os campos `null`, as invariantes da tabela de faixas (contígua, sem lacuna, cada
limite numa faixa só), a matemática da agulha da régua, o parser do Fundamentus contra HTML
real capturado em `test/fixtures/` (as fixtures grandes vão gzipadas), os parsers do
Investidor10 e do StatusInvest, a degradação da brapi para o plano Gratuito, as guardas de
unidade, a mescla com procedência, as etiquetas de procedência, o TTL do cache, o `render` da
página Hono, os cinco filtros e o desempate de FII em cada limite exato (R$ 1 bi, 5 anos,
1,15%, vacância 10%, P/VP 1, 105% do FFO) e contra as fichas reais de HGLG11 e MXRF11
(`test/fixtures/investidor10-*.html.gz`), a triagem de mercado (parser da lista do
Fundamentus contra HTML real recortado, pré-seleção na margem exata, os três grupos e a
ordem de cada um, o streaming de eventos com fontes injetadas), e — o mais importante — que
**análise sem dado nunca vira "Sólida"**.

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
usa zero, que não é escolha. Na triagem de FII: o teto de vacância de 10%, a lista de
segmentos resilientes e excluídos (`RESILIENT_SEGMENTS`, `EXCLUDED_SEGMENTS`) e a lista de
gestoras de referência (`REFERENCE_MANAGERS`), e o teto de custo em 1,15% — a regra dizia
1,1%, e subiu para não reprovar por um ponto-base. Os limites de R$ 1 bi e 5 anos são os da
regra, não meus.
