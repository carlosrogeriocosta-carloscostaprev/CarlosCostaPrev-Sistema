-- manifest: camada CarlosCostaPrev (antiga 0162, renumerada para 8004 em 13/11/2026; o timestamp nao mudou): previdenciario case events insert policy
-- PREV-005 forward-fix: eventos de usuário só podem ser inseridos
-- pelo próprio ator autenticado e dentro de uma organização membro.
drop policy if exists previdenciario_case_events_user_insert on public.previdenciario_case_events;
create policy previdenciario_case_events_user_insert on public.previdenciario_case_events
for insert to authenticated
with check (
  organization_id in (select public.fn_user_org_ids())
  and actor_kind = 'user'
  and actor_user_id = auth.uid()
);
notify pgrst, 'reload schema';
-- END migration 0162: PREV-005 policy de inserção da timeline
