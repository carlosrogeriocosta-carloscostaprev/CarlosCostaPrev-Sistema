-- manifest: camada CarlosCostaPrev: as etapas do quadro previdenciario nascem com a organizacao (gatilho em organizations); antes so existiam para organizacoes que ja existiam quando o baseline era aplicado, e uma instalacao nova ficava com o quadro de casos vazio
-- =============================================================================
-- 8021 — etapas do quadro previdenciário na criação da organização
-- =============================================================================
-- O seed das 9 etapas (migration 8003) rodava uma vez, para as organizações que JÁ existiam no
-- momento do baseline. Numa instalação nova o baseline roda primeiro e a organização nasce depois
-- (bootstrap-owner), então ela ficava sem etapa nenhuma: o quadro de Casos dizia "nenhuma etapa
-- configurada" e `POST /cases` recusava (não há etapa ativa). Medido na tela, no sistema local.
--
-- O gatilho semeia as etapas padrão sempre que uma organização nasce. `security definer` porque quem
-- cria a organização (service role, função do instalador) não é sempre quem tem INSERT na tabela de
-- etapas (a RLS e os grants dela são de escrita só do manager e do platform admin full).

create or replace function public.fn_previdenciario_semear_etapas()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  insert into public.previdenciario_case_stages
    (organization_id, stable_key, name, position, color, is_terminal)
  values
    (new.id, 'intake', 'Entrada', 100::numeric, '#64748B', false),
    (new.id, 'triage', 'Triagem', 200::numeric, '#2563EB', false),
    (new.id, 'documents', 'Documentos', 300::numeric, '#7C3AED', false),
    (new.id, 'in_progress', 'Em andamento', 400::numeric, '#0891B2', false),
    (new.id, 'awaiting_client', 'Aguardando cliente', 500::numeric, '#D97706', false),
    (new.id, 'awaiting_external', 'Aguardando órgão externo', 600::numeric, '#EA580C', false),
    (new.id, 'review', 'Revisão profissional', 700::numeric, '#DB2777', false),
    (new.id, 'completed', 'Concluído', 800::numeric, '#16A34A', true),
    (new.id, 'archived', 'Arquivado', 900::numeric, '#475569', true)
  on conflict (organization_id, stable_key) do nothing;
  return new;
end;
$$;

revoke execute on function public.fn_previdenciario_semear_etapas() from public, anon, authenticated;

drop trigger if exists trg_organizations_previdenciario_etapas on public.organizations;
create trigger trg_organizations_previdenciario_etapas
  after insert on public.organizations
  for each row execute function public.fn_previdenciario_semear_etapas();

-- Organizações que já existem sem etapa (instalação feita antes deste conserto): mesmo seed, idempotente.
insert into public.previdenciario_case_stages
  (organization_id, stable_key, name, position, color, is_terminal)
select o.id, s.stable_key, s.name, s.position, s.color, s.is_terminal
from public.organizations o
cross join (values
  ('intake', 'Entrada', 100::numeric, '#64748B', false),
  ('triage', 'Triagem', 200::numeric, '#2563EB', false),
  ('documents', 'Documentos', 300::numeric, '#7C3AED', false),
  ('in_progress', 'Em andamento', 400::numeric, '#0891B2', false),
  ('awaiting_client', 'Aguardando cliente', 500::numeric, '#D97706', false),
  ('awaiting_external', 'Aguardando órgão externo', 600::numeric, '#EA580C', false),
  ('review', 'Revisão profissional', 700::numeric, '#DB2777', false),
  ('completed', 'Concluído', 800::numeric, '#16A34A', true),
  ('archived', 'Arquivado', 900::numeric, '#475569', true)
) as s(stable_key, name, position, color, is_terminal)
on conflict (organization_id, stable_key) do nothing;
