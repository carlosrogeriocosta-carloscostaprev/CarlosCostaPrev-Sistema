-- manifest: camada CarlosCostaPrev (antiga 0167, renumerada para 8009 em 13/11/2026; o timestamp nao mudou): previdenciario knowledge review history
-- PREV-008: histórico append-only das revisões profissionais da base previdenciária.
-- O estado corrente continua em previdenciario_pathology_knowledge; esta tabela guarda
-- snapshots suficientes para reconstruir a decisão editorial sem permitir UPDATE/DELETE pela aplicação.

create table if not exists public.previdenciario_pathology_review_history (
  id uuid primary key default gen_random_uuid(),
  pathology_knowledge_id uuid not null references public.previdenciario_pathology_knowledge(id) on delete cascade,
  previous_status text not null check (previous_status in ('draft','needs_review','approved','rejected','archived')),
  next_status text not null check (next_status in ('draft','needs_review','approved','rejected','archived')),
  editorial_summary text check (editorial_summary is null or char_length(editorial_summary) <= 20000),
  benefit_hypotheses jsonb not null default '[]'::jsonb,
  review_note text check (review_note is null or char_length(review_note) <= 4000),
  reviewer_user_id uuid references auth.users(id) on delete set null,
  request_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists previdenciario_pathology_review_history_pathology_idx
  on public.previdenciario_pathology_review_history (pathology_knowledge_id, created_at desc);

alter table public.previdenciario_pathology_review_history enable row level security;
revoke all on table public.previdenciario_pathology_review_history from anon;
grant select, insert on table public.previdenciario_pathology_review_history to authenticated;

drop policy if exists previdenciario_pathology_review_history_read_authenticated on public.previdenciario_pathology_review_history;
create policy previdenciario_pathology_review_history_read_authenticated
  on public.previdenciario_pathology_review_history
  for select to authenticated
  using (true);

drop policy if exists previdenciario_pathology_review_history_platform_admin_insert on public.previdenciario_pathology_review_history;
create policy previdenciario_pathology_review_history_platform_admin_insert
  on public.previdenciario_pathology_review_history
  for insert to authenticated
  with check (public.fn_is_platform_admin());

-- Não há UPDATE/DELETE grant nem policy: o histórico editorial é append-only para a aplicação.
notify pgrst, 'reload schema';
-- END migration 0167: PREV-008 knowledge review history
