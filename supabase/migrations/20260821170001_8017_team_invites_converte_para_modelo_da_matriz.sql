-- manifest: camada CarlosCostaPrev: converte a team_invites do modelo antigo (8012, ex-0170) para o modelo da matriz (0238); idempotente; no banco ATIVO rodar ANTES de atualizar para a v1.109.0
-- =============================================================================
-- Migration 8017 — team_invites: do nosso modelo para o modelo da matriz DeskcommCRM
-- =============================================================================
-- Por quê: a 8012 (nossa) e a 0238 (matriz) criam a MESMA tabela com colunas
-- diferentes. Como a nossa roda primeiro, o `create table if not exists` da
-- matriz não faz nada e o `create unique index ... lower(email)` dela falha,
-- porque a nossa coluna se chama `invited_email`. Esta migration leva a tabela
-- ao formato da matriz, SEM apagar nenhum dado.
--
-- Timestamp logo depois da 8012 (e antes da 0238), para a ordem do Supabase CLI.
-- ATENÇÃO: banco novo NÃO nasce destas migrations; nasce do `supabase/baseline.sql`
-- (doutrina do repositório: "a cadeia não sobe do zero"). Esta migration serve
-- ao Supabase CLI e ao banco ATIVO, que já aplicou a 8012: ela é anterior à
-- última migration aplicada, então rodar à mão ANTES do update da matriz (ou
-- `db push --include-all`). É segura de repetir: só mexe se a tabela ainda está
-- no modelo antigo.
-- PENDENTE (passo 4 do plano): espelhar esta conversão no apêndice idempotente
-- do `baseline.sql`, que é o que o `update.sh` da matriz re-aplica. Sem isso o
-- update recria a 0238 sobre a tabela antiga e o índice por `lower(email)` falha.
--
-- O que NÃO faz (o baseline/0238 da matriz recria; fazer aqui dependeria de
-- funções que podem ainda não existir neste ponto da ordem): policies, grants
-- para `authenticated`, trigger `fn_set_updated_at` e os índices da 0238.
--
-- Efeitos que o dono precisa saber:
--   * convite RECUSADO (declined_at) passa a REVOGADO: a matriz não tem o estado
--     "recusado". A coluna declined_at fica, só deixa de ser usada.
--   * `token_hash` deixa de ser obrigatória: na matriz o id da linha é o
--     invite_id do token. Convite PENDENTE emitido no modelo antigo pode não ser
--     aceito pelo fluxo da matriz; reenviar. A migration avisa quantos são.
-- =============================================================================

do $$
declare
  v_pendentes integer;
begin
  if to_regclass('public.team_invites') is null then
    raise notice '8017: team_invites ainda não existe; nada a converter (a 0238 cria no modelo da matriz).';
    return;
  end if;

  -- Só converte se ainda está no modelo antigo.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'team_invites' and column_name = 'invited_email'
  ) then
    -- 1) estados: o check antigo proíbe declined_at junto de revoked_at.
    alter table public.team_invites drop constraint if exists team_invites_terminal_states_check;

    -- recusado -> revogado (a matriz não tem "recusado"); só onde ainda não aceito/revogado.
    update public.team_invites
       set revoked_at = declined_at
     where declined_at is not null and revoked_at is null and accepted_at is null;

    -- 2) o e-mail passa a se chamar `email`.
    alter table public.team_invites rename column invited_email to email;
    alter table public.team_invites drop constraint if exists team_invites_email_check;
  end if;

  -- 3) restrição de e-mail da matriz (nome igual ao dela, para a 0238 não duplicar).
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.team_invites'::regclass and conname = 'team_invites_email_nao_vazio'
  ) then
    alter table public.team_invites
      add constraint team_invites_email_nao_vazio check (length(btrim(email)) > 0);
  end if;

  -- 4) colunas que a matriz tem e a nossa não.
  alter table public.team_invites
    add column if not exists interface_settings jsonb not null default '{"preset":"completa"}'::jsonb,
    add column if not exists inviter_name text,
    add column if not exists last_sent_at timestamptz not null default now(),
    add column if not exists resend_count integer not null default 0,
    add column if not exists revoked_by uuid references auth.users(id) on delete set null;

  -- 5) token_hash deixa de ser obrigatória (a matriz não grava).
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'team_invites'
      and column_name = 'token_hash' and is_nullable = 'NO'
  ) then
    alter table public.team_invites alter column token_hash drop not null;
  end if;

  select count(*) into v_pendentes
    from public.team_invites
   where accepted_at is null and revoked_at is null and expires_at > now();
  if v_pendentes > 0 then
    raise notice '8017: % convite(s) pendente(s) emitido(s) no modelo antigo; reenviar pelo fluxo da matriz.', v_pendentes;
  end if;
end
$$;

notify pgrst, 'reload schema';
-- END migration 8017
