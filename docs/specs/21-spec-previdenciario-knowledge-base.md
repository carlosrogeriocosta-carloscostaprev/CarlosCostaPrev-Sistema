# Spec 21 — PREV-007: base de conhecimento previdenciária

**Status:** implementação inicial publicada como `needs_review`; nenhuma linha clínica ou jurídica desta fase autoriza decisão automática.

## Objetivo

A base PREV-007 fornece uma camada de referência para apoiar a preparação de casos previdenciários. Ela separa a classificação médica CID-10/CID-11, os correlatos funcionais da CIF, o catálogo do instrumento IFBrA e a matriz de fontes legislativas. A base não diagnostica, não calcula grau de deficiência, não afirma concessão de benefício e não substitui revisão de profissional habilitado.

## Fontes e proveniência

A matriz inicial de patologias foi normalizada do commit `009b98f` do repositório privado `prevprocesso-maker/sistemaprev`, arquivo `backend/src/modules/medical-case/seed/pathologies.seed.ts`. O catálogo IFBrA foi normalizado do mesmo commit, arquivo `frontend/src/lib/ifbra-items.ts`. A matriz jurídica usa as fontes primárias registradas no OpenSpec em `LEGISLATION-CROSSWALK-MATRIX.md`, commit `7ddae92`, e mantém todas as relações como `needs_review`.

Cada registro guarda o commit de origem, o caminho, a linha quando disponível e o SHA-256 do arquivo de origem. Esse vínculo permite repetir a ingestão e detectar mudança de fonte sem transformar o código do sistema de referência em fonte de verdade.

## Modelo de dados

| Tabela | Escopo | Finalidade | Escrita |
|---|---|---|---|
| `previdenciario_pathology_knowledge` | Global | 80 patologias, CID, correlatos CIF, flags de conteúdo clínico e proveniência | Apenas administrador de plataforma |
| `previdenciario_ifbra_items` | Global | Itens de referência do IFBrA separados por domínio | Apenas administrador de plataforma |
| `previdenciario_ifbra_qualifiers` | Global | Qualificadores de 0 a 4 e faixas de referência | Apenas administrador de plataforma |
| `previdenciario_legal_sources` | Global | Fontes oficiais, URL, data de acesso e versão | Apenas administrador de plataforma |
| `previdenciario_legal_crosswalk` | Global | Relações preliminares entre benefício, dispositivo e fonte | Apenas administrador de plataforma |

A leitura exige sessão autenticada. A escrita não é exposta a usuários de organizações porque o conhecimento é uma camada curada global; a revisão profissional da fase seguinte deverá usar o papel de administrador de plataforma e registrar autor, data e nota.

## Regras de separação

**CID** identifica doença ou condição. **CIF** representa funções e estruturas do corpo, atividades e participação e fatores ambientais. **IFBrA** é um instrumento funcional de referência, com seus próprios domínios e qualificadores. Um código CID nunca é convertido automaticamente em deficiência, incapacidade, elegibilidade ou benefício.

A fonte de referência contém conteúdo clínico extenso, incluindo medicamentos, critérios diagnósticos, prognóstico e sinais de alerta. Nesta primeira ingestão, esse conteúdo não é copiado como texto normativo nem publicado como orientação clínica: os registros guardam apenas flags de disponibilidade e sugestões documentais, sempre com `needs_review`. A expansão do conteúdo educacional depende de revisão profissional explícita.

## Regras jurídicas

O cruzamento legislativo é preliminar. Cada linha guarda benefício, fonte, referência de dispositivo, tipo de relação, resumo, confiança e estado de revisão. A aplicação depende da data relevante, da vigência e das exceções do caso. Relações históricas, regras de transição, baixa renda, dependência, carência, impedimento de longo prazo e avaliação biopsicossocial não podem ser reduzidas a uma resposta binária.

> A base legislativa serve para localizar e organizar fontes; não constitui parecer jurídico nem decisão de concessão.

## Critérios de aceite

A migration 0166 deve ser idempotente, aparecer no `baseline.sql` e no `MANIFEST.md`, manter RLS, rejeitar acesso anônimo e permitir leitura autenticada. A ingestão deve resultar em 80 patologias, quatro domínios IFBrA, 138 itens IFBrA, cinco qualificadores e 20 relações legislativas preliminares. Todos os registros importados nesta fase devem permanecer em `needs_review`.

## Referências

[1]: https://github.com/prevprocesso-maker/sistemaprev/tree/009b98f "SistemaPrev — commit 009b98f"
[2]: https://github.com/prevprocesso-maker/OpenSpec/blob/7ddae92/LEGISLATION-CROSSWALK-MATRIX.md "Matriz legislativa OpenSpec — commit 7ddae92"
[3]: https://www.planalto.gov.br/ccivil_03/leis/l8213cons.htm "Lei nº 8.213/1991 — Planalto"
[4]: https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc103.htm "EC nº 103/2019 — Planalto"
[5]: https://www.planalto.gov.br/ccivil_03/decreto/d3048.htm "Decreto nº 3.048/1999 — Planalto"
[6]: https://www.planalto.gov.br/ccivil_03/leis/l8742.htm "Lei nº 8.742/1993 — LOAS — Planalto"
[7]: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm "Lei nº 13.146/2015 — Planalto"
