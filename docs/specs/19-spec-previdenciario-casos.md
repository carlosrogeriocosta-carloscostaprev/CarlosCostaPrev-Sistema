# Spec 19 — Casos previdenciários, Kanban, pendências, prazos e documentos

> **Status:** PREV-005 implementado; o upload binário de documentos foi detalhado e implementado no PREV-006, conforme a Spec 20. Requisitos funcionais derivados do OpenSpec e do PRD previdenciário; estados e seeds de etapa marcados como defaults operacionais editáveis, não como regra jurídica.

## 1. Escopo

O PREV-005 cria uma entidade própria para o caso previdenciário, sem substituir `crm_leads`, `agent_cases`, `demandas` ou `conversations`. O caso relaciona um contato, opcionalmente um benefício e/ou serviço do catálogo estável, um responsável, uma etapa de Kanban, protocolo, pendências, prazos, documentos e uma linha do tempo append-only.

A chave de negócio do catálogo é sempre `stable_key`. O nome exibido e os códigos oficiais permanecem dados resolvidos do catálogo e de seus overrides; nunca são copiados para virar fonte de verdade no caso.

## 2. Decisões de modelagem

| Decisão | Tratamento |
|---|---|
| Multi-tenancy | Todas as tabelas do vertical têm `organization_id` obrigatório, FK para `organizations` com `on delete cascade`, RLS por `fn_user_org_ids()` e filtro explícito nas rotas. |
| Cliente | `contact_id` é FK obrigatório para `contacts`; não duplicar nome, CPF, telefone ou e-mail no caso. |
| Benefício/serviço | `benefit_key` e `service_key` são stable keys opcionais. O caso pode ser aberto incompleto para registrar pendências antes da classificação. |
| Kanban | `previdenciario_case_stages` é configurável por organização. As etapas seed são defaults operacionais editáveis e não representam fases legais obrigatórias. |
| Status | `open`, `completed` e `archived`; a etapa representa a posição operacional. Fechamento e reabertura geram eventos. |
| Completeness | Não há coluna duplicada `is_complete`; a API calcula a completude por responsável, classificação, protocolo e pendências abertas. |
| Prazos | `case_deadlines` distingue `external`, `internal` e `reminder`, conserva referência, fuso, fonte, regra e responsável. Atraso é derivado de `due_at` e status, não gravado como verdade duplicada. |
| Documentos | O banco guarda metadados e ponteiro de Storage, nunca bytes. Hash SHA-256 e revisão humana são campos obrigatórios para rastreabilidade. |
| Histórico | `case_events` é append-only, sem UPDATE/DELETE para usuários. Mutação de negócio também emite `api_audit_log`. |
| Idempotência | Eventos de transição aceitam `Idempotency-Key`; a chave é persistida por caso e organização para impedir duplicação do mesmo comando. |

## 3. Vocabulários iniciais

### 3.1 Etapas default editáveis

`intake`, `triage`, `documents`, `in_progress`, `awaiting_client`, `awaiting_external`, `review`, `completed`, `archived`.

Essas etapas são somente uma configuração inicial para cada organização. A organização poderá renomear, ordenar, colorir, arquivar e criar etapas sem alterar `stable_key` de benefício/serviço.

### 3.2 Pendências

Tipos iniciais: `registration`, `protocol`, `document`, `responsible`, `requirement`, `deadline`, `other`. A ação sugerida é um vocabulário aberto controlado por TypeScript: `request_upload`, `attach_document`, `assign_responsible`, `add_protocol`, `review`, `other`.

### 3.3 Eventos

Eventos de negócio iniciais: `created`, `stage_changed`, `status_changed`, `pending_added`, `pending_resolved`, `deadline_created`, `deadline_completed`, `document_attached`, `document_reviewed`, `requirement_received`, `communication`, `ai_analysis`, `reviewed`, `completed`, `reopened`, `note`.

## 4. Contrato REST inicial

| Método | Rota | Permissão | Responsabilidade |
|---|---|---|---|
| `GET` | `/api/v1/previdenciario/cases` | `viewer` | Lista paginável por organização, com filtros de etapa/status/benefício/serviço/responsável e resumo de pendências. |
| `POST` | `/api/v1/previdenciario/cases` | `agent` | Cria caso incompleto ou classificado; aceita `Idempotency-Key`, cria evento e pendências explícitas. |
| `GET` | `/api/v1/previdenciario/cases/[id]` | `viewer` | Retorna caso, etapa, catálogo resolvido, pendências, prazos, documentos e timeline da mesma organização. |
| `PATCH` | `/api/v1/previdenciario/cases/[id]` | `agent` | Atualiza classificação, responsável, protocolo, título e status; registra evento. |
| `POST` | `/api/v1/previdenciario/cases/[id]/transition` | `agent` | Move etapa, preserva origem/destino, usa idempotência e registra `stage_changed`. |
| `GET` | `/api/v1/previdenciario/case-stages` | `viewer` | Lista etapas editáveis da organização. |
| `POST` | `/api/v1/previdenciario/cases/[id]/pendencias` | `agent` | Adiciona pendência acionável. |
| `PATCH` | `/api/v1/previdenciario/cases/[id]/pendencias/[pendencyId]` | `agent` | Resolve ou descarta pendência com ator e data. |
| `POST` | `/api/v1/previdenciario/cases/[id]/prazos` | `agent` | Cria prazo com origem, referência, fuso, regra e responsável. |
| `PATCH` | `/api/v1/previdenciario/cases/[id]/prazos/[deadlineId]` | `agent` | Conclui ou cancela prazo. |
| `POST` | `/api/v1/previdenciario/cases/[id]/documentos` | `agent` | Recebe multipart, valida e coloca o arquivo no Storage privado e registra seus metadados; documentos já existentes seguem documentados na Spec 20. |
| `PATCH` | `/api/v1/previdenciario/cases/[id]/documentos/[documentId]` | `agent` | Confirma, rejeita ou revisa documento. |

As respostas são JSON snake_case com `ok()`/`fail()`, `X-Request-Id`, validação Zod e queries filtradas por `organization_id` resolvido pelo guard. O POST deve rejeitar `Idempotency-Key` inválido e não aceita `organization_id` no corpo.

## 5. Pendências automáticas do primeiro vertical slice

Na criação ou atualização do caso, a API poderá registrar pendências explícitas para ausência de responsável, ausência de benefício/serviço e ausência de protocolo quando a política do caso exigir. A regra de documentos obrigatórios por benefício/serviço ficará para a curadoria de requisitos; o PREV-005 não inventará listas jurídicas de documentos.

## 6. Segurança e LGPD

O caso nunca recebe CPF, telefone ou e-mail duplicado. Documentos apontam para Storage privado e a rota que registra metadados não autoriza acesso cross-tenant. O conteúdo de documento, observações e metadata deve evitar dados sensíveis em logs; o audit registra somente tipo, ID, transição e contagens necessárias.

RLS de leitura e escrita segue `organization_id in (select * from public.fn_user_org_ids())`. Rotas de leitura usam `viewer`; criação, transição e revisão usam `agent`. Configuração de etapas exige `manager`.

## 7. Critérios de aceite do vertical slice

O bloco é aceito quando: um caso pode ser criado para um contato existente; a API lista os casos da organização; uma transição registra histórico idempotente; pendência, prazo e documento têm ciclo de revisão; consultas por ID cross-tenant não revelam existência; todas as mutações emitem audit; migration, baseline e MANIFEST ficam sincronizados; typecheck, lint e testes unitários ficam verdes; invariantes de RLS devem ser executadas quando o Docker local estiver disponível.
