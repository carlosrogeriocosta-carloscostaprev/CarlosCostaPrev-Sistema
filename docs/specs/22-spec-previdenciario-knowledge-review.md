# Spec 22 — PREV-008: revisão profissional da base previdenciária

**Status:** desenho aprovado para implementação na branch de evolução do PREV-008.
**Pré-requisito:** PREV-007 publicado em produção no commit `a9b9d09f`.
**Escopo desta fase:** revisão editorial das patologias e das hipóteses de benefício. IFBrA, fontes legais e matriz legislativa continuam como referência autenticada e somente leitura nesta fase; a revisão editorial desses catálogos será uma extensão posterior.

## 1. Objetivo

O PREV-008 transforma a importação inicial `needs_review` em um fluxo editorial profissional, sem permitir que a base clínica ou jurídica tome decisões automáticas. O administrador de plataforma poderá revisar patologias individualmente ou em lote, escrever um resumo educacional controlado, associar hipóteses de benefícios pelos `stable_key` canônicos e consultar o histórico append-only das decisões.

> A revisão editorial confirma a qualidade e a utilidade da referência; não transforma CID em incapacidade, CIF em grau de deficiência, hipótese em direito adquirido ou fonte legislativa em parecer jurídico.

## 2. Auditoria do PREV-007 e lacunas encontradas

| Área atual | Estado confirmado | Lacuna do PREV-008 |
|---|---|---|
| Estado da patologia | `review_status`, `reviewer_user_id`, `reviewed_at` e `review_note` na linha corrente | Não existe histórico editorial consultável; a revisão anterior é sobrescrita |
| Revisão | `PATCH /knowledge/pathologies/[stableKey]/review` para uma patologia | Não existe operação em lote |
| Resumo | `clinical_content.educationalSummary` existe no contrato, mas os seeds começam nulos | Não existe editor, validação de conteúdo ou registro de autoria |
| Hipóteses de benefício | `benefit_hypotheses` existe como JSONB e usa chaves canônicas | Não existe editor, estado individual, fonte ou histórico de alteração |
| UI | Busca, filtros e detalhe existem | Não há seleção múltipla, barra de ação ou visão de histórico |
| Auditoria | `previdenciario.knowledge_reviewed` e `knowledge_imported` já existem | A operação em lote e a edição editorial precisam de vocabulário próprio |

## 3. Modelo de dados

A linha atual de `previdenciario_pathology_knowledge` permanece como **estado publicado corrente**. Não será criada uma segunda cópia de resumo ou de hipóteses em tabela paralela. O campo JSONB existente será validado pelo contrato Zod e atualizado somente pela rota administrativa.

Será criada a tabela global `previdenciario_pathology_review_history`:

| Campo | Regra |
|---|---|
| `id` | UUID gerado pelo banco |
| `pathology_knowledge_id` | FK para `previdenciario_pathology_knowledge`, `on delete cascade` |
| `previous_status` | Estado anterior da linha corrente |
| `next_status` | Estado resultante da revisão |
| `editorial_summary` | Snapshot do resumo após a decisão, nullable, máximo 20.000 caracteres |
| `benefit_hypotheses` | Snapshot validado das hipóteses após a decisão |
| `review_note` | Nota operacional da revisão, máximo 4.000 caracteres |
| `reviewer_user_id` | FK para `auth.users`, `on delete set null` |
| `request_id` | UUID de correlação quando disponível |
| `created_at` | Timestamp UTC da decisão |

A tabela é append-only para a aplicação: usuários autenticados não recebem `UPDATE` ou `DELETE`; somente administrador de plataforma recebe `INSERT` por policy. O estado corrente continua em `previdenciario_pathology_knowledge`, enquanto o histórico responde quem alterou, quando, de qual estado para qual estado e com qual conteúdo editorial.

As hipóteses permanecem referenciadas por `benefit_key` do catálogo canônico, nunca pelo nome exibido. Cada item terá `benefitKey`, `hypothesis`, `sourceRef` e `reviewStatus`, sendo permitido `draft`, `needs_review`, `approved`, `rejected` ou `archived`. Os nove `benefit_key` válidos continuam sendo os definidos em `lib/previdenciario/catalog.ts`; não serão criados códigos paralelos nem códigos oficiais inventados.

## 4. Contratos de API

### 4.1 Revisão individual

A rota existente `PATCH /api/v1/previdenciario/knowledge/pathologies/[stableKey]/review` será ampliada para aceitar, além de `reviewStatus` e `reviewNote`, os campos opcionais `editorialSummary` e `benefitHypotheses`. O handler deve:

1. exigir `requireRole('admin', { allowPlatformAdmin: true })` e confirmar `is_platform_admin`;
2. validar todo o corpo com Zod estrito;
3. carregar o estado anterior;
4. validar hipóteses contra `PREVIDENCIARIO_BENEFIT_KEYS`;
5. atualizar o estado corrente;
6. inserir um registro no histórico;
7. emitir auditoria sem bloquear a mutação principal;
8. devolver o estado serializado e a revisão mais recente.

### 4.2 Revisão em lote

Será criada `PATCH /api/v1/previdenciario/knowledge/pathologies/bulk-review` com corpo:

```json
{
  "stableKeys": ["depressao_major", "epilepsia"],
  "reviewStatus": "approved",
  "reviewNote": "Conferido o escopo editorial e a proveniência.",
  "editorialSummary": null
}
```

A lista terá entre 1 e 100 chaves únicas. A operação será atômica no sentido da requisição: se a validação ou a leitura dos registros falhar, nenhuma atualização será aplicada. O retorno conterá `updated_count`, `items` serializados e os `stable_keys` não encontrados, quando houver. Uma ação de auditoria de lote registrará a quantidade, estado anterior por item e estado novo, sem incluir conteúdo clínico extenso no log.

### 4.3 Histórico

A rota de detalhe `GET /api/v1/previdenciario/knowledge/pathologies/[stableKey]` passará a retornar uma coleção limitada de histórico, ordenada do mais recente para o mais antigo. O histórico exibirá autor resolvido quando permitido, data, transição de estado, nota e existência de resumo/hipóteses, mas não exporá dados desnecessários de outras organizações.

## 5. Regras editoriais e de segurança

O resumo editorial é educacional e deve ser apresentado na UI com a instrução de não diagnosticar, não prescrever, não calcular deficiência e não decidir benefício. O backend limita tamanho, remove espaços externos e rejeita objeto com chaves desconhecidas; não tentará avaliar semanticamente a medicina por heurística frágil.

A revisão de uma patologia é global e não pertence a uma organização. Por isso, nenhuma rota aceita `organization_id` do corpo para decidir escopo. A autorização vem da sessão validada e do papel de administrador de plataforma. As queries administrativas devem usar a tabela global e, quando o cliente Supabase administrativo for utilizado, filtrar explicitamente pelas chaves recebidas pelo próprio servidor.

O histórico não será editável pela UI. Auditoria e histórico têm propósitos distintos: o histórico guarda o snapshot editorial necessário para reconstrução; `api_audit_log` registra a intenção, ator, recurso, request id e resumo seguro da operação.

## 6. Interface e fluxo humano

A aba **Patologias** receberá seleção por checkbox, seleção visível e uma barra de ações em lote baseada no padrão existente de `BulkActionBar`. O administrador poderá escolher o novo estado, escrever uma nota e confirmar a ação. A seleção será limpa após sucesso e pelo teclado `Escape`; estados de carregamento, erro parcial e lista vazia serão visíveis.

O detalhe da patologia receberá um editor de resumo educacional e uma seção para adicionar, editar, remover e revisar hipóteses de benefício. Cada hipótese exibirá o nome derivado do catálogo, mas persistirá somente a chave canônica. O histórico recente será exibido no próprio detalhe como linha do tempo editorial.

Usuários sem privilégio de plataforma continuarão podendo consultar o conhecimento aprovado conforme a regra vigente, mas não verão controles de mutação. A porta da tela continuará sendo `/app/previdenciario/conhecimento`, registrada no menu Previdenciário.

## 7. Sistema vivo

| Pergunta | Resposta concreta |
|---|---|
| Quem alimenta? | A base PREV-007 e o administrador de plataforma que confere as fontes e registra a revisão |
| Quem alimenta? | O estado corrente da patologia alimenta a UI de casos e, futuramente, o RAG somente com conteúdo aprovado |
| Que log emite? | `previdenciario.knowledge_reviewed`, `previdenciario.knowledge_batch_reviewed` e `previdenciario.knowledge_editorial_updated`, além do histórico append-only |
| Onde aparece? | No detalhe da patologia, na lista filtrável e no histórico editorial da própria tela |
| Qual a porta? | `lib/navigation/registry.ts` → `/app/previdenciario/conhecimento` |
| Mecanismo anti-morte | Itens `needs_review` permanecem visíveis e priorizados até decisão humana; falha de revisão não publica conteúdo silenciosamente |
| Onde configura? | A própria área administrativa mostra estado, editor, filtros e falhas de salvamento |
| Laço de retorno | Conteúdo rejeitado ou corrigido gera histórico; o futuro RAG consulta apenas itens aprovados, portanto a revisão altera o conjunto efetivamente consumido |
| Mapa vivo | Adicionar o fluxo editorial ao mapa de arquitetura com entrada da base, decisão humana, estado corrente e consumidor aprovado |

## 8. Critérios de aceite

A migration deve aparecer em `supabase/migrations/`, no apêndice idempotente de `supabase/baseline.sql` e no `MANIFEST.md`. A tabela de histórico deve bloquear acesso anônimo, permitir somente inserção administrativa, manter FK para a patologia e passar nos invariantes de isolamento e grants.

Os testes devem cobrir validação Zod das hipóteses, revisão individual com histórico, revisão em lote, rejeição por usuário sem privilégio, auditoria segura, seleção/limpeza da UI, filtros por estado e consulta do histórico. O gate final precisa incluir typecheck, lint, testes unitários, `test:db` para RLS e migração e prova visual autenticada da tela conforme a doutrina de QA.

A fase não deve conectar automaticamente a base a decisões de concessão, cálculo de deficiência, diagnóstico, prescrição ou rastreamento do Meu INSS. Esses são escopos posteriores e exigem controles próprios.
