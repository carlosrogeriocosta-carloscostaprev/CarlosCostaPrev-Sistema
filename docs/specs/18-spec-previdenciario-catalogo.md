# Spec 18 — Catálogo previdenciário

## Objetivo

O catálogo previdenciário fornece uma fonte estável para os **9 benefícios** e **13 serviços** usados pelo domínio do CarlosCostaPrev. A chave `stable_key` é um contrato interno imutável do produto; ela não representa código oficial do INSS. Os campos `official_codes` permanecem vazios até revisão normativa e profissional.

A tabela global define a taxonomia de base. A tabela tenant-aware de overrides permite que uma organização altere o nome apresentado, acrescente metadados editoriais e oculte um item sem modificar a chave estável nem a fonte normativa.

## Endpoints

| Método | Rota | Acesso | Finalidade |
|---|---|---|---|
| GET | `/api/v1/previdenciario/catalog` | `viewer+` | Lista itens ativos com override da organização ativa |
| GET | `/api/v1/previdenciario/catalog/{stable_key}` | `viewer+` | Retorna um item efetivo por chave interna |
| PATCH | `/api/v1/previdenciario/catalog/overrides` | `manager+` | Cria ou atualiza o override da organização ativa |

As respostas usam os wrappers canônicos `ok()` e `fail()`, JSON em `snake_case` e o header `X-Request-Id`. Nenhum endpoint aceita `organization_id` no corpo: a organização é resolvida pelo cookie/sessão e pelo `requireRole()`.

## Listagem

A listagem aceita o filtro opcional `kind`, com os valores `benefit` e `service`:

```http
GET /api/v1/previdenciario/catalog?kind=benefit
```

O resultado contém `{ data: { items }, meta: { total, has_more } }`. Somente itens globais ativos são candidatos à listagem. Um override com `is_active = false` remove o item apenas da organização ativa. `display_name` do override substitui o nome base quando preenchido; `null` restaura o nome base. Metadados são combinados superficialmente, com chaves do override prevalecendo.

## Item individual

```http
GET /api/v1/previdenciario/catalog/incapacidade_temporaria
```

O item retorna os campos `stable_key`, `kind`, `display_name`, `official_codes`, `source_kind`, `source_ref`, `source_version`, `review_status`, `metadata` e `is_active`. Um item inexistente, globalmente inativo ou ocultado pelo override da organização responde `404 not_found`.

## Override

O corpo do PATCH deve conter `stable_key` e pelo menos um campo mutável:

```json
{
  "stable_key": "incapacidade_temporaria",
  "display_name": "Benefício por incapacidade — curto prazo",
  "metadata": {
    "internal_label": "incapacidade_curta"
  },
  "is_active": true
}
```

`display_name` aceita `null` para restaurar o nome global. `metadata` deve ser objeto JSON. `is_active` controla a disponibilidade do item somente na organização atual. O upsert é protegido pela chave composta `(organization_id, catalog_item_id)`, e a organização é sempre injetada pelo servidor.

A mutação gera a ação de auditoria `previdenciario.catalog_override_updated`, com o usuário, a organização, o recurso e apenas a lista de campos alterados. O conteúdo de `metadata` não é replicado no audit para evitar crescimento e exposição desnecessária.

## Segurança e invariantes

| Invariante | Implementação |
|---|---|
| Leitura autenticada | `requireRole("viewer")` antes da consulta |
| Escrita manager+ | `requireRole("manager")` antes do PATCH |
| Isolamento tenant | `organization_id` vem de `authz.org.orgId` e é filtrado na tabela de overrides |
| RLS | Itens globais têm SELECT autenticado; overrides têm SELECT tenant-scoped e escrita manager-scoped |
| Código oficial | `official_codes` é somente leitura pelos endpoints desta entrega |
| Chave interna | `stable_key` não pode ser renomeada por override |
| Entrada externa | Body, query string e path são validados com Zod |
| Auditoria | PATCH bem-sucedido emite audit append-only, sem bloquear a mutação |

O catálogo não captura credenciais do Meu INSS e não executa automação de login. O portal oficial permanece apenas como referência futura para rastreamento manual ou integração explicitamente autorizada.
