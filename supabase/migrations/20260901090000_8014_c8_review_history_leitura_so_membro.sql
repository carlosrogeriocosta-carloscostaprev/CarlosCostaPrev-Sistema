-- manifest: camada CarlosCostaPrev (antiga 0172, renumerada para 8014 em 13/11/2026; o timestamp nao mudou): c8 review history leitura so membro
-- 0172 — Auditoria B2 Ponto 4, gate C8: metadado editorial leak cross-tenant.
--
-- `previdenciario_pathology_review_history` nasceu (0167) com policy
-- `USING (true)` para leitura: qualquer usuário autenticado de qualquer org
-- lia reviewer_user_id, nota editorial e trilha de mudança de status da base
-- de conhecimento editorial. A rota que consome exige só `viewer` (qualquer
-- membro autenticado) — mas a TABELA não pode continuar aberta: histórico
-- editorial é telemetria interna, não conteúdo do cliente.
--
-- Por que NÃO filtrar por organization_id: a tabela não tem a coluna (a base
-- de conhecimento é global, `source_repo = 'sistemaprev'`, single-source). O
-- filtro por org exigiria inventar uma coluna que significa nada aqui — em vez
-- disso a política exige ser MEMBRO de alguma organização (o usuário autenticado
-- anônimo-de-fato sai do jogo), e a escrita continua só do platform admin.
--
-- Invariante garantido: tests/invariants/knowledge-review-history-rbac.test.ts
drop policy if exists previdenciario_pathology_review_history_read_authenticated
  on public.previdenciario_pathology_review_history;
drop policy if exists previdenciario_pathology_review_history_read_member on public.previdenciario_pathology_review_history;

create policy previdenciario_pathology_review_history_read_member
  on public.previdenciario_pathology_review_history
  for select to authenticated
  using (
    public.fn_is_platform_admin()
    or exists (
      select 1
      from public.user_organizations om
      where om.user_id = auth.uid()
    )
  );

-- Escrita já era platform_admin (0167). Reafirmado aqui para a leitura do
-- arquivo contar a história toda: o `drop/create` acima é o único delta.
