# Escopo da interface pública

A interface oferece consulta a números publicados, organização pessoal e cálculos que o
usuário escolhe executar. Os filtros locais começam vazios. Não há avaliação da adequação
de um ativo ao usuário, nota geral, ranking de qualidade ou geração de alocação por rendimento.

## Mudanças de comportamento

- Lista única, alfabética por padrão, incluindo ativos anteriormente separados como aprovados,
  pendentes ou reprovados. O usuário preenche mínimos e máximos, com limites inclusivos.
- Comparação e ficha exibem valores e fontes, sem faixas editoriais ou vereditos.
- Favoritos mostram mudanças numéricas, não mudanças de diagnóstico.
- O simulador exige confirmação da hipótese de divisão igual. Cenários anteriores preservam
  os dados de entrada, mas não reativam os modos por qualidade ou maximização de renda.
- API Next, API Hono e geração de snapshots removem avaliações, critérios e interpretação por IA.
  O motor e o CLI legado permanecem locais. Não publique suas saídas como substituto da API.

## Limites preservados

A cobertura de coleta continua restrita a FIIs acima de R$ 1 bilhão e ações acima de R$ 5 milhões
de liquidez diária, uma classe por empresa. Esses limites são informados nas páginas e não
representam uma recomendação. A consulta não amplia o universo baixado pelas fontes.

O período contábil de cada indicador pode diferir da data da consulta. Simulações não preveem
pagamentos; o calendário apresenta apenas o próximo evento disponível na última consulta.

## Publicação e pontos externos

Atualizar o código local não altera uma publicação existente. O deploy deve regenerar os JSONs
com `npm run snapshot`, usando a nova projeção pública. Não reutilize arquivos antigos de dados.

As mudanças não certificam conformidade jurídica. Permanecem necessários o exame dos termos
ou licenças das fontes e a avaliação jurídica do serviço, de sua divulgação e monetização.
Não foi efetuada auditoria contratual das fontes nesta alteração, nem se afirma autorização
para scraping ou redistribuição. O armazenamento local tampouco avalia os logs do provedor de
hospedagem ou ferramentas de analytics adicionadas fora do repositório.
