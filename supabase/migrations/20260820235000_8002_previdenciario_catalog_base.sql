-- manifest: camada CarlosCostaPrev (antiga 0160, renumerada para 8002 em 13/11/2026; o timestamp nao mudou): previdenciario catalog base
-- PREV-024 / PREV-025 foundation: stable previdenciary catalog.
-- Official species codes are intentionally empty until normative review.

create table if not exists public.previdenciario_catalog_items (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null,
  kind text not null,
  display_name text not null,
  official_codes text[] not null default '{}'::text[],
  source_kind text not null default 'internal',
  source_ref text,
  source_version text,
  review_status text not null default 'needs_review',
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists previdenciario_catalog_items_stable_key_uq
  on public.previdenciario_catalog_items (stable_key);
create index if not exists previdenciario_catalog_items_kind_active_idx
  on public.previdenciario_catalog_items (kind, is_active, display_name);

alter table public.previdenciario_catalog_items
  drop constraint if exists previdenciario_catalog_items_kind_check;
alter table public.previdenciario_catalog_items
  add constraint previdenciario_catalog_items_kind_check
  check (kind in ('benefit', 'service'));

alter table public.previdenciario_catalog_items
  drop constraint if exists previdenciario_catalog_items_stable_key_check;
alter table public.previdenciario_catalog_items
  add constraint previdenciario_catalog_items_stable_key_check
  check (stable_key ~ '^[a-z][a-z0-9_]{2,119}$');

alter table public.previdenciario_catalog_items
  drop constraint if exists previdenciario_catalog_items_source_kind_check;
alter table public.previdenciario_catalog_items
  add constraint previdenciario_catalog_items_source_kind_check
  check (source_kind in ('official', 'editorial', 'legacy_import', 'internal'));

alter table public.previdenciario_catalog_items
  drop constraint if exists previdenciario_catalog_items_review_status_check;
alter table public.previdenciario_catalog_items
  add constraint previdenciario_catalog_items_review_status_check
  check (review_status in ('draft', 'needs_review', 'approved', 'rejected', 'archived'));

alter table public.previdenciario_catalog_items
  drop constraint if exists previdenciario_catalog_items_metadata_object;
alter table public.previdenciario_catalog_items
  add constraint previdenciario_catalog_items_metadata_object
  check (jsonb_typeof(metadata) = 'object');

comment on table public.previdenciario_catalog_items is
  'Catálogo global de benefícios e serviços previdenciários. stable_key é contrato interno; official_codes só entra após validação normativa.';
comment on column public.previdenciario_catalog_items.stable_key is
  'Chave interna imutável usada por processos, relações, API e IA. Não é código oficial do INSS.';
comment on column public.previdenciario_catalog_items.official_codes is
  'Códigos oficiais referenciais validados por fonte e revisão; vazio enquanto não houver validação.';

create table if not exists public.previdenciario_catalog_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  catalog_item_id uuid not null references public.previdenciario_catalog_items(id) on delete cascade,
  display_name text,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists previdenciario_catalog_overrides_org_item_uq
  on public.previdenciario_catalog_overrides (organization_id, catalog_item_id);

alter table public.previdenciario_catalog_overrides
  drop constraint if exists previdenciario_catalog_overrides_display_name_check;
alter table public.previdenciario_catalog_overrides
  add constraint previdenciario_catalog_overrides_display_name_check
  check (display_name is null or length(btrim(display_name)) between 1 and 200);

alter table public.previdenciario_catalog_overrides
  drop constraint if exists previdenciario_catalog_overrides_metadata_object;
alter table public.previdenciario_catalog_overrides
  add constraint previdenciario_catalog_overrides_metadata_object
  check (jsonb_typeof(metadata) = 'object');

comment on table public.previdenciario_catalog_overrides is
  'Personalização de nome e metadados do catálogo por organização; não altera stable_key nem fonte normativa.';

alter table public.previdenciario_catalog_items enable row level security;
alter table public.previdenciario_catalog_overrides enable row level security;

revoke all on public.previdenciario_catalog_items from public, anon, authenticated;
grant select on public.previdenciario_catalog_items to authenticated;
grant all on public.previdenciario_catalog_items to service_role;
drop policy if exists previdenciario_catalog_items_select on public.previdenciario_catalog_items;
create policy previdenciario_catalog_items_select
  on public.previdenciario_catalog_items
  for select to authenticated
  using (true);

revoke all on public.previdenciario_catalog_overrides from public, anon, authenticated;
grant select, insert, update, delete on public.previdenciario_catalog_overrides to authenticated;
grant all on public.previdenciario_catalog_overrides to service_role;
drop policy if exists previdenciario_catalog_overrides_select on public.previdenciario_catalog_overrides;
create policy previdenciario_catalog_overrides_select
  on public.previdenciario_catalog_overrides
  for select to authenticated
  using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );
drop policy if exists previdenciario_catalog_overrides_manager_write on public.previdenciario_catalog_overrides;
create policy previdenciario_catalog_overrides_manager_write
  on public.previdenciario_catalog_overrides
  for all to authenticated
  using (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'manager')
    )
  )
  with check (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'manager')
    )
  );

drop trigger if exists trg_previdenciario_catalog_overrides_audit on public.previdenciario_catalog_overrides;
create trigger trg_previdenciario_catalog_overrides_audit
after insert or update or delete on public.previdenciario_catalog_overrides
for each row execute function public.fn_audit_log_row();

drop trigger if exists trg_previdenciario_catalog_overrides_updated_at on public.previdenciario_catalog_overrides;
create trigger trg_previdenciario_catalog_overrides_updated_at
before update on public.previdenciario_catalog_overrides
for each row execute function public.fn_touch_updated_at();

insert into public.previdenciario_catalog_items
  (stable_key, kind, display_name, source_kind, review_status)
values
  ('aposentadoria_idade', 'benefit', 'Aposentadoria por Idade Urbana / Rural', 'internal', 'needs_review'),
  ('aposentadoria_tempo_contribuicao', 'benefit', 'Aposentadoria por Tempo de Contribuição', 'internal', 'needs_review'),
  ('aposentadoria_especial', 'benefit', 'Aposentadoria Especial', 'internal', 'needs_review'),
  ('incapacidade_permanente', 'benefit', 'Aposentadoria por Incapacidade Permanente', 'internal', 'needs_review'),
  ('incapacidade_temporaria', 'benefit', 'Auxílio por Incapacidade Temporária', 'internal', 'needs_review'),
  ('auxilio_acidente', 'benefit', 'Auxílio-Acidente', 'internal', 'needs_review'),
  ('pensao_morte', 'benefit', 'Pensão por Morte', 'internal', 'needs_review'),
  ('auxilio_reclusao', 'benefit', 'Auxílio-Reclusão', 'internal', 'needs_review'),
  ('bpc_loa_deficiencia', 'benefit', 'Benefício de Prestação Continuada — BPC/LOAS para Pessoa com Deficiência', 'internal', 'needs_review'),
  ('extrato_cnis', 'service', 'Emissão de Extrato de Contribuição (CNIS)', 'internal', 'needs_review'),
  ('atualizacao_tempo_contribuicao_cadastro', 'service', 'Atualização do Tempo de Contribuição / Cadastro', 'internal', 'needs_review'),
  ('simulacao_aposentadoria', 'service', 'Simulação de Aposentadoria', 'internal', 'needs_review'),
  ('pericia_medica', 'service', 'Perícia Médica (Agendamento / Reagendamento)', 'internal', 'needs_review'),
  ('cumprimento_exigencia', 'service', 'Cumprimento de Exigência', 'internal', 'needs_review'),
  ('copia_processo_administrativo', 'service', 'Solicitação de Cópia de Processo Administrativo', 'internal', 'needs_review'),
  ('procuracao_curatela', 'service', 'Cadastramento / Renovação de Procuração ou Curatela', 'internal', 'needs_review'),
  ('bloqueio_desbloqueio_consignado', 'service', 'Bloqueio / Desbloqueio do Benefício para Empréstimo Consignado', 'internal', 'needs_review'),
  ('alteracao_forma_local_pagamento', 'service', 'Alteração de Forma ou Local de Pagamento', 'internal', 'needs_review'),
  ('certidao_tempo_contribuicao_ctc', 'service', 'Solicitação de Certidão de Tempo de Contribuição (CTC)', 'internal', 'needs_review'),
  ('recurso_crps', 'service', 'Recurso Ordinário ou Especial (CRPS)', 'internal', 'needs_review'),
  ('reabilitacao_profissional', 'service', 'Reabilitação Profissional', 'internal', 'needs_review'),
  ('pagamento_beneficio_nao_recebido', 'service', 'Solicitação de Pagamento de Benefício Não Recebido', 'internal', 'needs_review')
on conflict (stable_key) do nothing;

notify pgrst, 'reload schema';
