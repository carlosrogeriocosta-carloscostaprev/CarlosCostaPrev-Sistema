-- manifest: policies de ESCRITA do módulo previdenciário passam a usar fn_is_platform_admin_full() (support_readonly não escreve), e a LEITURA que dependia da policy "for all" ganha policy de select própria — fecha o invariante #2115 da matriz
--
-- Contexto: a matriz (migration 0508, issue #2115) decidiu que policy de ESCRITA não
-- aceita `fn_is_platform_admin()` (que ignora o `scope`): um super-admin
-- `support_readonly` escreveria em qualquer organização. A leitura continua com a função
-- pura. As nossas policies do módulo previdenciário (8002, 8003, 8008, 8009) são
-- anteriores a essa decisão e usavam a função pura em `for all`/`for insert` — 12 policies
-- de escrita, apanhadas por `tests/invariants/platform-admin-full-so-escreve.test.ts`
-- ("CONTA GLOBAL: nenhuma policy de escrita em public cita a função pura").
--
-- Conserto, no mesmo desenho do "par" da matriz:
--   * escrita  -> `fn_is_platform_admin_full()`;
--   * leitura  -> policy de select própria, com `fn_is_platform_admin()` (puro): quem era
--     lido pelo "for all" (e portanto o support_readonly, que só lê) continua lendo.
--     As tabelas cujo select já cobria o platform admin (catalog_overrides) ou é aberto a
--     todo autenticado (conhecimento, histórico) não precisam de policy nova.
--
-- Idempotente: `drop policy if exists` + `create policy`. Não mexe em grants nem em dados.

-- ---- casos: escrita (full) e leitura (select com a função pura) ------------------------

drop policy if exists previdenciario_case_stages_select on public.previdenciario_case_stages;
create policy previdenciario_case_stages_select on public.previdenciario_case_stages
for select to authenticated
using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());

drop policy if exists previdenciario_case_stages_manager_write on public.previdenciario_case_stages;
create policy previdenciario_case_stages_manager_write on public.previdenciario_case_stages
for all to authenticated
using (public.fn_is_platform_admin_full() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'manager')))
with check (public.fn_is_platform_admin_full() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'manager')));

drop policy if exists previdenciario_cases_select on public.previdenciario_cases;
create policy previdenciario_cases_select on public.previdenciario_cases
for select to authenticated
using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());

drop policy if exists previdenciario_cases_agent_write on public.previdenciario_cases;
create policy previdenciario_cases_agent_write on public.previdenciario_cases
for all to authenticated
using (public.fn_is_platform_admin_full() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'agent')))
with check (public.fn_is_platform_admin_full() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'agent')));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'previdenciario_case_pendencies',
    'previdenciario_case_deadlines',
    'previdenciario_case_documents'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'previdenciario_' || table_name || '_select', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())', 'previdenciario_' || table_name || '_select', table_name);
    execute format('drop policy if exists %I on public.%I', 'previdenciario_' || table_name || '_agent_write', table_name);
    execute format('create policy %I on public.%I for all to authenticated using (public.fn_is_platform_admin_full() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, ''agent''))) with check (public.fn_is_platform_admin_full() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, ''agent'')))', 'previdenciario_' || table_name || '_agent_write', table_name);
  end loop;
end $$;

-- ---- sobrescritas do catálogo: select já inclui a função pura; só a escrita muda --------

drop policy if exists previdenciario_catalog_overrides_manager_write on public.previdenciario_catalog_overrides;
create policy previdenciario_catalog_overrides_manager_write
  on public.previdenciario_catalog_overrides
  for all to authenticated
  using (
    public.fn_is_platform_admin_full()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'manager')
    )
  )
  with check (
    public.fn_is_platform_admin_full()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'manager')
    )
  );

-- ---- base de conhecimento (select aberto a todo autenticado): só a escrita muda ----------

drop policy if exists previdenciario_pathology_knowledge_platform_admin_write on public.previdenciario_pathology_knowledge;
create policy previdenciario_pathology_knowledge_platform_admin_write on public.previdenciario_pathology_knowledge for all to authenticated using (public.fn_is_platform_admin_full()) with check (public.fn_is_platform_admin_full());

drop policy if exists previdenciario_ifbra_items_platform_admin_write on public.previdenciario_ifbra_items;
create policy previdenciario_ifbra_items_platform_admin_write on public.previdenciario_ifbra_items for all to authenticated using (public.fn_is_platform_admin_full()) with check (public.fn_is_platform_admin_full());

drop policy if exists previdenciario_ifbra_qualifiers_platform_admin_write on public.previdenciario_ifbra_qualifiers;
create policy previdenciario_ifbra_qualifiers_platform_admin_write on public.previdenciario_ifbra_qualifiers for all to authenticated using (public.fn_is_platform_admin_full()) with check (public.fn_is_platform_admin_full());

drop policy if exists previdenciario_legal_sources_platform_admin_write on public.previdenciario_legal_sources;
create policy previdenciario_legal_sources_platform_admin_write on public.previdenciario_legal_sources for all to authenticated using (public.fn_is_platform_admin_full()) with check (public.fn_is_platform_admin_full());

drop policy if exists previdenciario_legal_crosswalk_platform_admin_write on public.previdenciario_legal_crosswalk;
create policy previdenciario_legal_crosswalk_platform_admin_write on public.previdenciario_legal_crosswalk for all to authenticated using (public.fn_is_platform_admin_full()) with check (public.fn_is_platform_admin_full());

drop policy if exists previdenciario_pathology_review_history_platform_admin_insert on public.previdenciario_pathology_review_history;
create policy previdenciario_pathology_review_history_platform_admin_insert
  on public.previdenciario_pathology_review_history
  for insert to authenticated
  with check (public.fn_is_platform_admin_full());

-- ---- grants literais (régua de 9037: toda tabela do apêndice tem `grant ... on public.<tabela>` próprio) ----
-- As três tabelas dependentes eram criadas e liberadas dentro de um laço com `format`, que a
-- régua (leitura do TEXTO do baseline) não enxerga. O efeito é o mesmo de antes: leitura e
-- escrita operacional para authenticated (a RLS decide), tudo para o servidor.
grant select, insert, update on public.previdenciario_case_pendencies to authenticated;
grant all on public.previdenciario_case_pendencies to service_role;
grant select, insert, update on public.previdenciario_case_deadlines to authenticated;
grant all on public.previdenciario_case_deadlines to service_role;
grant select, insert, update on public.previdenciario_case_documents to authenticated;
grant all on public.previdenciario_case_documents to service_role;

-- ---- travas do modo somente leitura do suporte, DEPOIS das nossas tabelas ----
-- A varredura de `fn_aplicar_travas_de_suporte()` percorre `pg_class` quando roda. Nossas tabelas
-- de caso nascem no fim do apêndice, DEPOIS da última chamada da matriz: sem esta, uma
-- instalação nova ficava sem `support_write_insert/update/delete` nelas, e só a atualização (que
-- reaplica o arquivo) as ganhava. Em banco que ainda não tem a função, não há o que travar.
do $f$
begin
  if to_regprocedure('public.fn_aplicar_travas_de_suporte()') is not null then
    perform public.fn_aplicar_travas_de_suporte();
  end if;
end $f$;

notify pgrst, 'reload schema';
