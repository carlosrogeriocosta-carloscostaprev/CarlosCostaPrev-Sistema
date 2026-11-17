-- manifest: camada CarlosCostaPrev (antiga 0170, renumerada para 8012 em 13/11/2026; o timestamp nao mudou): team invites lifecycle
-- =============================================================================
-- Migration 0170 — ciclo de vida persistente dos convites de equipe
-- =============================================================================
-- O token continua sendo HMAC e nunca é armazenado em claro. A tabela guarda
-- apenas o SHA-256 do token, o que permite revogar, reenviar e auditar convites
-- sem transformar o banco em uma coleção de links portadores de acesso.

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invited_email text not null,
  role text not null,
  invited_by uuid references auth.users(id) on delete set null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  email_dispatched boolean not null default false,
  delivery_error text,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  declined_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_invites_role_check check (role = any (array['viewer', 'agent', 'manager', 'admin']::text[])),
  constraint team_invites_email_check check (length(trim(invited_email)) between 3 and 320),
  constraint team_invites_terminal_states_check check (
    (accepted_at is null or declined_at is null)
    and (accepted_at is null or revoked_at is null)
    and (declined_at is null or revoked_at is null)
  )
);

create index if not exists idx_team_invites_org_created
  on public.team_invites (organization_id, created_at desc);

create index if not exists idx_team_invites_org_pending
  on public.team_invites (organization_id, expires_at)
  where accepted_at is null and declined_at is null and revoked_at is null;

create unique index if not exists uq_team_invites_active_email
  on public.team_invites (organization_id, lower(invited_email))
  where accepted_at is null and declined_at is null and revoked_at is null;

create or replace trigger trg_team_invites_touch_updated_at
before update on public.team_invites
for each row execute function public.fn_touch_updated_at();

alter table public.team_invites enable row level security;
revoke all on public.team_invites from public, anon, authenticated;
grant all on public.team_invites to service_role;

comment on table public.team_invites is
  'Convites de equipe com ciclo de vida persistente; token HMAC nunca é armazenado em claro.';
comment on column public.team_invites.token_hash is
  'SHA-256 do token HMAC emitido; usado para invalidar e localizar convites sem persistir o bearer token.';
comment on column public.team_invites.delivery_error is
  'Código operacional redigido da última tentativa de entrega; nunca armazena payload ou segredo.';

notify pgrst, 'reload schema';
-- END migration 0170: ciclo de vida persistente dos convites de equipe
