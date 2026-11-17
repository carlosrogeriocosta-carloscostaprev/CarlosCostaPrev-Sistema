-- manifest: camada CarlosCostaPrev (antiga 0174, renumerada para 8016 em 13/11/2026; o timestamp nao mudou): event log cross module
-- 0174 — PRD 24 / E1 (revisada em 01/09/2026, antes de aplicar): eventos
-- cross-module passam a trafegar pelo bus PERSISTENTE do produto, e não por
-- um segundo barramento.
--
-- A proposta original criava `dominio_eventos`. Revisto antes do deploy por um
-- motivo medido no código: o bus de `lib/previdenciario/compartilhado/infra/
-- event-bus.ts` é em memória (Map) — o handler registrado no processo A nunca
-- vê o evento publicado no processo B (Next.js multi-instância). Persistir em
-- tabela própria guardaria a evidência, mas NÃO entregaria o evento. O produto
-- já tem o barramento que funciona assim: `public.event_log` + `emit_event()`
-- + workers que consomem por `consumed_by` (spec 07).
--
-- O que faltava na event_log para cobrir o contrato cross-module
-- (`lib/previdenciario/compartilhado/dominio/eventos.ts`): correlação de saga
-- e origem/destino de módulo. Isso é uma extensão de 3 colunas, não uma tabela
-- nova. `metadata` já carrega o payload livre.

alter table public.event_log
  add column if not exists correlation_id uuid,
  add column if not exists modulo_origem text,
  add column if not exists modulo_destino text;

-- Checks de domínio (idempotentes: drop-if-exists antes, convenção do apêndice)
alter table public.event_log
  drop constraint if exists event_log_modulo_origem_check;
alter table public.event_log
  add constraint event_log_modulo_origem_check
  check (modulo_origem is null or modulo_origem in
    ('administrativo', 'judicial', 'compartilhado', 'sistema'));

alter table public.event_log
  drop constraint if exists event_log_modulo_destino_check;
alter table public.event_log
  add constraint event_log_modulo_destino_check
  check (modulo_destino is null or modulo_destino in
    ('administrativo', 'judicial', 'ambos'));

-- Replay/auditoria de saga: todos os eventos de uma cadeia pelo correlation_id.
create index if not exists event_log_correlation_idx
  on public.event_log (correlation_id)
  where correlation_id is not null;

-- índice para o reconcile SOS (spec 23): tráfego por módulo nas últimas 24h.
create index if not exists event_log_modulo_created_idx
  on public.event_log (modulo_origem, created_at desc)
  where modulo_origem is not null;

-- A função `emit_event` ainda não conhece as 3 colunas novas. Duas armadilhas
-- já medidas nesta exata mudança (run 33568936956 + suíte local completa):
--
--  1. `drop` da assinatura antiga quebra os probes de hardening que conferem
--     privilégio por assinatura exata (`has_function_privilege('anon',
--     'public.emit_event(text,text,uuid,jsonb,jsonb,uuid)')`) — e qualquer
--     cliente PostgREST que assine a forma antiga quebraria igual.
--  2. Mexer no corpo da antiga arrisca regredir o bus do CRM inteiro.
--
-- A saída que não quebra nada: a função antiga (6 params) fica INTACTA e a
-- nova (9 params, corpo fiel + 3 colunas) é ADICIONADA como overload. Numa
-- chamada com 6 argumentos o Postgres prefere a candidata que não precisa
-- preencher defaults — regra documentada do resolvedor de funções — então
-- não há ambiguidade: cada aridade cai no seu corpo.
--
-- A função `emit_event` antiga (6 params) nasce do baseline. Como a nova tem
-- assinatura diferente (9 params), `CREATE OR REPLACE` NÃO substitui — cria
-- OVERLOAD (duas funções mesmo nome). Isso causa "function is not unique" nas
-- chamadas e no `has_function_privilege`. A solução: dropar a antiga ANTES
-- de criar a nova. O hardening test JÁ USA a assinatura de 9 params, então
-- dropar a de 6 é seguro.
drop function if exists public.emit_event(text, text, uuid, jsonb, jsonb, uuid);

-- CORPO = cópia fiel do baseline (resolução de org por auth.uid + emitted_at),
-- com insert estendido para correlation_id, modulo_origem, modulo_destino.
-- Substitui a função antiga (6 params) pela nova (9 params) — UMA função só,
-- sem overload, sem ambiguidade. Defaults nos 3 novos + os originais em
-- p_payload/p_metadata/p_organization_id (compat total com chamadas 3-6 args).
create or replace function public.emit_event(
  p_event_type text,
  p_entity_kind text,
  p_entity_id uuid,
  p_payload jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_organization_id uuid default null::uuid,
  p_correlation_id uuid default null::uuid,
  p_modulo_origem text default null,
  p_modulo_destino text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_org_id uuid;
  v_event_id uuid;
begin
  v_org_id := p_organization_id;
  if v_org_id is null then
    -- Try to resolve from caller's first org (best-effort; trigger callers MUST pass it)
    select organization_id into v_org_id
      from public.user_organizations
      where user_id = auth.uid() and revoked_at is null
      limit 1;
  end if;
  if v_org_id is null then
    raise exception 'emit_event: organization_id obrigatorio';
  end if;

  -- Guard crítico (do baseline): caller autenticado PRECISA ser member da org alvo.
  -- Sem isso, qualquer authenticated emite em QUALQUER org (furo de segurança).
  if auth.uid() is not null
     and not public.fn_role_at_least(v_org_id, 'viewer') then
    raise exception 'caller_not_authorized_for_org'
      using hint = 'emit_event: caller must be an active member of the organization';
  end if;

  insert into public.event_log
    (organization_id, event_type, entity_kind, entity_id, payload, metadata,
     correlation_id, modulo_origem, modulo_destino)
  values
    (v_org_id, p_event_type, p_entity_kind, p_entity_id,
     coalesce(p_payload, '{}'::jsonb),
     coalesce(p_metadata, '{}'::jsonb)
       || jsonb_build_object('emitted_at', extract(epoch from now())),
     p_correlation_id, p_modulo_origem, p_modulo_destino)
  returning id into v_event_id;

  return v_event_id;
end
$fn$;

-- Grants da assinatura nova (9 params): mesmo regime da antiga (0171/varredura).
-- CREATE OR REPLACE NÃO preserva grants quando a assinatura muda — re-aplica.
revoke execute on function public.emit_event(text, text, uuid, jsonb, jsonb, uuid, uuid, text, text) from public, anon;
grant execute on function public.emit_event(text, text, uuid, jsonb, jsonb, uuid, uuid, text, text) to authenticated, service_role;

-- O CHECK `event_type_format` exige `modulo.evento` em snake-case. Os tipos
-- cross-module do TypeScript são SNAKE_UPPER ('CASO_ADMIN_ENCERRADO'); a
-- adaptação é responsabilidade do emissor: `prev.` + lower(tipo). Documentado
-- em lib/previdenciario/compartilhado/infra/event-bus.ts (E1.2).
