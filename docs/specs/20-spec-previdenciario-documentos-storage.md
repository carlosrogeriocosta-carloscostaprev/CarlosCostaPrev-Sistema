# Spec 20 — Upload seguro de documentos previdenciários

> **Status:** implementação PREV-006 concluída no backend e na interface, com migration 0163 e forward-fix 0164 aplicados ao Supabase de produção.

## 1. Objetivo

O PREV-006 conecta a área de documentos do caso previdenciário ao Supabase Storage privado. O navegador envia o arquivo para a rota autenticada; o backend valida o escopo do caso, o tipo do conteúdo e o tamanho, calcula SHA-256, grava o objeto com caminho gerado pelo servidor e registra somente metadados na tabela `previdenciario_case_documents`.

## 2. Contrato REST

| Método | Rota | Permissão | Responsabilidade |
|---|---|---|---|
| `POST` | `/api/v1/previdenciario/cases/[id]/documentos` | `agent` | Recebe `multipart/form-data` com `file`, `kind`, `source` opcional e `metadata` JSON opcional; valida, faz upload, registra metadados, emite evento e audit. |
| `GET` | `/api/v1/previdenciario/cases/[id]/documentos/[documentId]/download` | `viewer` | Confirma organização, caso e bucket; retorna URL assinada com validade curta, sem expor o objeto publicamente. |
| `PATCH` | `/api/v1/previdenciario/cases/[id]/documentos/[documentId]` | `agent` | Atualiza o estado de revisão profissional e mantém o histórico do documento. |

A rota de upload não aceita `organization_id`, `storage_bucket`, `storage_path` ou `sha256` enviados pelo cliente. O prefixo de organização e caso, o bucket e o hash são definidos pelo backend.

## 3. Controles de arquivo

O bucket `previdenciario-documents` é privado, tem limite de **25 MB** e aceita apenas `application/pdf`, `image/jpeg`, `image/png` e `image/webp`. O backend também verifica a assinatura binária mínima para PDF, JPEG, PNG e WebP antes de persistir o objeto.

O nome original é sanitizado somente para exibição. O caminho do Storage usa o formato `<organization_id>/<case_id>/<uuid>.<extensão>`, impedindo enumeração previsível e reduzindo risco de colisão. O conteúdo não é armazenado no Postgres; a tabela guarda bucket, caminho, nome, MIME/tamanho em metadata e hash SHA-256.

## 4. Falha e compensação

O upload acontece antes da inserção dos metadados. Se a inserção falhar, o backend remove o objeto recém-criado. Conflitos de `(case_id, sha256, version)` retornam `409`. Se a emissão do evento falhar depois da inserção, a resposta preserva o comportamento atual do workflow: a mutação é reportada como falha e o registro permanece para investigação, sem apagar um objeto já referenciado por uma linha persistida.

## 5. Isolamento e LGPD

A organização é resolvida pelo guard de autenticação, e o caso é carregado com `organization_id` confiável antes do upload. A URL de download só é emitida quando o documento pertence simultaneamente à organização, ao caso e ao bucket esperado. A URL é assinada por 10 minutos; não há URL pública nem caminho em query string.

O audit registra o identificador do documento, a operação, o MIME e o tamanho, mas não registra bytes, hash completo, conteúdo textual ou dados pessoais do arquivo. A área de Storage continua disponível para os fluxos existentes mediante grants compatíveis e policies próprias; a migration 0164 corrige o revoke global acidental da 0163.

## 6. Critérios de aceite

A implementação é considerada integrada quando o usuário com papel `agent` consegue selecionar um PDF ou imagem na tela do caso, receber o documento em estado `needs_review`, abrir o arquivo por URL assinada e atualizar o estado de revisão. Arquivo fora da allowlist, maior que 25 MB, vazio ou com assinatura incompatível deve ser recusado. O caso de outra organização não pode gerar upload nem URL.
