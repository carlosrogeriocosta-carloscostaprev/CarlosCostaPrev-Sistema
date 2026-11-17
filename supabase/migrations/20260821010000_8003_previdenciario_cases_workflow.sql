-- manifest: camada CarlosCostaPrev (antiga 0161, renumerada para 8003 em 13/11/2026; o timestamp nao mudou): previdenciario cases workflow
-- PREV-005: casos previdenciários, Kanban, pendências, prazos, documentos e timeline.
-- stable_key do catálogo permanece a fonte de domínio; o caso guarda FKs para os itens.

create table if not exists public.previdenciario_case_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stable_key text not null,
  name text not null,
  description text,
  position numeric not null default 1000,
  color text,
  is_terminal boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint previdenciario_case_stages_name_check check (length(btrim(name)) between 1 and 160),
  constraint previdenciario_case_stages_key_check check (stable_key ~ '^[a-z][a-z0-9_]{1,79}$'),
  constraint previdenciario_case_stages_color_check check (color is null or color ~ '^#[0-9a-fA-F]{6}$')
);

create unique index if not exists previdenciario_case_stages_org_key_uq
  on public.previdenciario_case_stages (organization_id, stable_key);
create index if not exists previdenciario_case_stages_org_position_idx
  on public.previdenciario_case_stages (organization_id, is_active, position, name);

create table if not exists public.previdenciario_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  lead_id uuid references public.crm_leads(id) on delete set null,
  benefit_catalog_item_id uuid references public.previdenciario_catalog_items(id) on delete restrict,
  service_catalog_item_id uuid references public.previdenciario_catalog_items(id) on delete restrict,
  stage_id uuid not null references public.previdenciario_case_stages(id) on delete restrict,
  status text not null default 'open',
  title text not null,
  protocol_number text,
  source text not null default 'manual',
  responsible_user_id uuid references auth.users(id) on delete set null,
  opened_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id) on delete set null,
  constraint previdenciario_cases_status_check check (status in ('open', 'completed', 'archived')),
  constraint previdenciario_cases_title_check check (length(btrim(title)) between 1 and 240),
  constraint previdenciario_cases_protocol_check check (protocol_number is null or length(btrim(protocol_number)) between 1 and 160),
  constraint previdenciario_cases_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint previdenciario_cases_catalog_kind_check check (
    (benefit_catalog_item_id is null or service_catalog_item_id is null)
  ),
  constraint previdenciario_cases_completed_at_check check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed')
  ),
  constraint previdenciario_cases_archived_at_check check (
    (status = 'archived' and archived_at is not null)
    or (status <> 'archived')
  )
);

create index if not exists previdenciario_cases_org_stage_idx
  on public.previdenciario_cases (organization_id, stage_id, status, updated_at desc);
create index if not exists previdenciario_cases_org_contact_idx
  on public.previdenciario_cases (organization_id, contact_id, updated_at desc);
create index if not exists previdenciario_cases_org_responsible_idx
  on public.previdenciario_cases (organization_id, responsible_user_id, status, updated_at desc);
create index if not exists previdenciario_cases_org_benefit_idx
  on public.previdenciario_cases (organization_id, benefit_catalog_item_id, status);
create index if not exists previdenciario_cases_org_service_idx
  on public.previdenciario_cases (organization_id, service_catalog_item_id, status);

create table if not exists public.previdenciario_case_pendencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.previdenciario_cases(id) on delete cascade,
  kind text not null,
  title text not null,
  description text,
  action text not null default 'other',
  status text not null default 'open',
  due_at timestamptz,
  source text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  constraint previdenciario_case_pendencies_kind_check check (kind in ('registration', 'protocol', 'document', 'responsible', 'requirement', 'deadline', 'other')),
  constraint previdenciario_case_pendencies_status_check check (status in ('open', 'resolved', 'dismissed')),
  constraint previdenciario_case_pendencies_title_check check (length(btrim(title)) between 1 and 240),
  constraint previdenciario_case_pendencies_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint previdenciario_case_pendencies_resolved_check check (
    (status = 'open' and resolved_at is null)
    or (status <> 'open' and resolved_at is not null)
  )
);

create index if not exists previdenciario_case_pendencies_open_idx
  on public.previdenciario_case_pendencies (organization_id, case_id, status, due_at);

create table if not exists public.previdenciario_case_deadlines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.previdenciario_cases(id) on delete cascade,
  kind text not null,
  title text not null,
  reference_at timestamptz,
  due_at timestamptz not null,
  timezone text not null default 'America/Sao_Paulo',
  responsible_user_id uuid references auth.users(id) on delete set null,
  source text not null default 'manual',
  rule_key text not null default 'manual',
  rule_version text not null default '1',
  status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by_user_id uuid references auth.users(id) on delete set null,
  constraint previdenciario_case_deadlines_kind_check check (kind in ('external', 'internal', 'reminder')),
  constraint previdenciario_case_deadlines_status_check check (status in ('open', 'completed', 'cancelled')),
  constraint previdenciario_case_deadlines_title_check check (length(btrim(title)) between 1 and 240),
  constraint previdenciario_case_deadlines_timezone_check check (length(btrim(timezone)) between 1 and 80),
  constraint previdenciario_case_deadlines_rule_check check (length(btrim(rule_key)) between 1 and 160 and length(btrim(rule_version)) between 1 and 80),
  constraint previdenciario_case_deadlines_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint previdenciario_case_deadlines_completed_check check (
    (status = 'open' and completed_at is null)
    or (status <> 'open' and completed_at is not null)
  )
);

create unique index if not exists previdenciario_case_deadlines_case_rule_uq
  on public.previdenciario_case_deadlines (case_id, rule_key, rule_version);
create index if not exists previdenciario_case_deadlines_due_idx
  on public.previdenciario_case_deadlines (organization_id, status, due_at, responsible_user_id);

create table if not exists public.previdenciario_case_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.previdenciario_cases(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  kind text not null,
  file_name text not null,
  storage_bucket text not null,
  storage_path text not null,
  sha256 text not null,
  version integer not null default 1,
  source text not null default 'manual',
  review_status text not null default 'needs_review',
  metadata jsonb not null default '{}'::jsonb,
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint previdenciario_case_documents_file_name_check check (length(btrim(file_name)) between 1 and 255),
  constraint previdenciario_case_documents_bucket_check check (length(btrim(storage_bucket)) between 1 and 120),
  constraint previdenciario_case_documents_path_check check (length(btrim(storage_path)) between 1 and 1024),
  constraint previdenciario_case_documents_sha256_check check (sha256 ~ '^[0-9a-fA-F]{64}$'),
  constraint previdenciario_case_documents_version_check check (version > 0),
  constraint previdenciario_case_documents_review_status_check check (review_status in ('draft', 'needs_review', 'approved', 'rejected')),
  constraint previdenciario_case_documents_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists previdenciario_case_documents_case_hash_version_uq
  on public.previdenciario_case_documents (case_id, sha256, version);
create index if not exists previdenciario_case_documents_org_review_idx
  on public.previdenciario_case_documents (organization_id, case_id, review_status, uploaded_at desc);

create table if not exists public.previdenciario_case_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.previdenciario_cases(id) on delete cascade,
  kind text not null,
  actor_kind text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  source text not null default 'api',
  from_stage_id uuid references public.previdenciario_case_stages(id) on delete set null,
  to_stage_id uuid references public.previdenciario_case_stages(id) on delete set null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint previdenciario_case_events_actor_kind_check check (actor_kind in ('user', 'system', 'agent', 'client', 'integration')),
  constraint previdenciario_case_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists previdenciario_case_events_case_created_idx
  on public.previdenciario_case_events (organization_id, case_id, created_at desc);

-- Stage seed: defaults operacionais editáveis por organização.
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

-- Updated-at triggers.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'previdenciario_case_stages',
    'previdenciario_cases',
    'previdenciario_case_pendencies',
    'previdenciario_case_deadlines',
    'previdenciario_case_documents'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || table_name || '_updated_at', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.fn_touch_updated_at()', 'trg_' || table_name || '_updated_at', table_name);
  end loop;
end $$;

-- Audit mutable tenant tables. Timeline events are append-only business records.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'previdenciario_case_stages',
    'previdenciario_cases',
    'previdenciario_case_pendencies',
    'previdenciario_case_deadlines',
    'previdenciario_case_documents'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || table_name || '_audit', table_name);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.fn_audit_log_row()', 'trg_' || table_name || '_audit', table_name);
  end loop;
end $$;

-- RLS: leitura de membro; mutação de caso/itens por agent; etapas por manager.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'previdenciario_case_stages',
    'previdenciario_cases',
    'previdenciario_case_pendencies',
    'previdenciario_case_deadlines',
    'previdenciario_case_documents',
    'previdenciario_case_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end $$;

drop policy if exists previdenciario_case_stages_select on public.previdenciario_case_stages;
create policy previdenciario_case_stages_select on public.previdenciario_case_stages
for select to authenticated
using (organization_id in (select public.fn_user_org_ids()));
revoke insert, update, delete on public.previdenciario_case_stages from authenticated;
grant insert, update on public.previdenciario_case_stages to authenticated;
drop policy if exists previdenciario_case_stages_manager_write on public.previdenciario_case_stages;
create policy previdenciario_case_stages_manager_write on public.previdenciario_case_stages
for all to authenticated
using (public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'manager')))
with check (public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'manager')));

drop policy if exists previdenciario_cases_select on public.previdenciario_cases;
create policy previdenciario_cases_select on public.previdenciario_cases
for select to authenticated
using (organization_id in (select public.fn_user_org_ids()));
grant insert, update on public.previdenciario_cases to authenticated;
drop policy if exists previdenciario_cases_agent_write on public.previdenciario_cases;
create policy previdenciario_cases_agent_write on public.previdenciario_cases
for all to authenticated
using (public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'agent')))
with check (public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'agent')));

-- Itens dependentes: leitura por membro e escrita operacional por agent.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'previdenciario_case_pendencies',
    'previdenciario_case_deadlines',
    'previdenciario_case_documents'
  ] loop
    execute format('grant insert, update on public.%I to authenticated', table_name);
    execute format('drop policy if exists %I on public.%I', 'previdenciario_' || table_name || '_select', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (organization_id in (select public.fn_user_org_ids()))', 'previdenciario_' || table_name || '_select', table_name);
    execute format('drop policy if exists %I on public.%I', 'previdenciario_' || table_name || '_agent_write', table_name);
    execute format('create policy %I on public.%I for all to authenticated using (public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, ''agent''))) with check (public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, ''agent'')))', 'previdenciario_' || table_name || '_agent_write', table_name);
  end loop;
end $$;

drop policy if exists previdenciario_case_events_select on public.previdenciario_case_events;
create policy previdenciario_case_events_select on public.previdenciario_case_events
for select to authenticated
using (organization_id in (select public.fn_user_org_ids()));

revoke all on public.previdenciario_case_events from public, anon, authenticated;
grant select on public.previdenciario_case_events to authenticated;
grant all on public.previdenciario_case_events to service_role;

comment on table public.previdenciario_cases is 'Caso previdenciário tenant-aware; stable keys são resolvidos pelas FKs do catálogo e a completude é derivada pela API.';
comment on table public.previdenciario_case_events is 'Timeline append-only do caso previdenciário; alterações de negócio também geram api_audit_log.';
comment on table public.previdenciario_case_documents is 'Metadados e ponteiro de Storage; bytes não são armazenados no banco.';

notify pgrst, 'reload schema';
