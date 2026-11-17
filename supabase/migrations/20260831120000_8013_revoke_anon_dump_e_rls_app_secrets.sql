-- manifest: camada CarlosCostaPrev (antiga 0171, renumerada para 8013 em 13/11/2026; o timestamp nao mudou): revoke anon dump e rls app secrets
-- =============================================================================
-- Migration 0171 — privilégio de tabela como camada: anon não toca nas 28
-- tabelas de dados; RLS em private.app_secrets
-- =============================================================================
--
-- Origem: auditoria B2/Ponto 4 (AUDITORIA-RLS-PONTO4-2026-08-31.md), itens
-- C1+C2. MEDIDO no baseline: `GRANT ALL ON TABLE public.<t> TO anon` em 30
-- tabelas do dump (baseline:4690–4905) — a RLS já zera as linhas que o papel
-- `anon` enxerga, mas o grant permanente é zero defesa em profundidade: o dia
-- em que UMA policy permissiva for escrita por engano, a anon key (que vai no
-- browser de todo visitante) vira leitura/escrita direta pelo PostgREST.
--
-- Este é o mesmo mecanismo raiz dos incidentes já registrados: a 0142 criou
-- tabela que um `viewer` editava sem auditoria (0143 consertou), e o relato da
-- 0155 generaliza — "tabela nova nasce concedida". Aqui a higiene é feita no
-- ESTOQUE herdado do dump, não numa tabela nova.
--
-- Por que NÃO desfazer o `ALTER DEFAULT PRIVILEGES`: ele vem do pg_dump no
-- corpo do baseline e é reescrito a cada re-aplicação (decisão registrada na
-- 0116). O revoke AQUI, no apêndice, roda depois do dump e vale para o estado
-- final. Nova tabela continua nascendo concedida pelo default — e continua
-- sendo pega pela disciplina "create table → revoke explícito", agora vigiada
-- também pela expectativa de que este revoke permaneça aplicado.
--
-- ─── Por que só `anon`, e não `authenticated` ───────────────────────────────
-- `authenticated` é o papel da interface logada: revogar qualquer privilégio
-- dele desliga telas inteiras (a RLS filtra as LINHAS, mas o privilégio de
-- tabela é o que permite a query existir). `anon` é diferente: toda leitura
-- anônima legítima neste projeto passa por função ou pelas duas exceções
-- documentais abaixo — então o revoke total + grant pontual não muda nenhum
-- comportamento observável, só remove caminho silencioso.
--
-- ─── As duas exceções, com prova de que são intencionais ────────────────────
--   ai_models   — policy `ai_models_read_all`   USING(true), sem TO: serve o
--                 catálogo público de modelos de IA (baseline:4042).
--   ai_pricing  — policy `ai_pricing_public_read` USING(true): preços públicos
--                 (baseline:4053).
-- Sem o GRANT SELECT devolvido abaixo, essas duas telas morrem da mesma forma
-- que a RLS as deixaria vivas — e a morte seria silenciosa no deploy.
--
-- Idempotente: revoke/grant declarativos podem ser reaplicados. `private`
-- pode não existir num clone mínimo — o bloco `do` protege o RLS.

-- (1) Estoque: tira anon das 30 tabelas concedidas pelo dump.
do $$
declare
  t text;
  tabelas text[] := array[
    'ai_agents', 'ai_budgets', 'ai_chunks', 'ai_faq_items', 'ai_invocations',
    'ai_knowledge_sources', 'ai_knowledge_versions', 'ai_models', 'ai_pricing',
    'api_tokens', 'channel_session_warmup', 'channel_sessions', 'contacts',
    'conversations', 'crm_lead_links', 'crm_leads', 'crm_pipelines',
    'crm_stages', 'idempotency_keys', 'incidents', 'lgpd_requests',
    'merge_queue', 'messages', 'nuvemshop_products', 'orders', 'organizations',
    'platform_admins', 'tenant_integrations', 'user_organizations',
    'user_recovery_codes'
  ];
begin
  if to_regrole('anon') is null then
    return; -- clone sem os roles do Supabase (pg de teste cru): nada a fazer
  end if;
  foreach t in array tabelas loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on table public.%I from anon', t);
    end if;
  end loop;
end $$;

-- (2) Exceções intencionais: leitura pública devolvida às duas tabelas cuja
-- policy USING(true) existe de propósito. Sem TO aqui seria repetir o defeito:
-- o grant nomeia o papel.
grant select on table public.ai_models to anon;
grant select on table public.ai_pricing to anon;

-- (3) C2: RLS na tabela da chave-mestra de cifragem. Hoje a proteção é só
-- "schema private sem grants" — privilégio negativo. Com RLS ligada e ZERO
-- policies, mesmo PUBLIc com grant (que ninguém dá) cai em deny-all. O leitor
-- legítimo é `private.fn_oauth_key()` — SECURITY DEFINER roda como o owner
-- (postgres), e RLS não se aplica ao dono da tabela sem FORCE, então a cifra
-- continua funcionando. Medido antes de escrever: nenhum código acessa a
-- tabela direto (só via fn_oauth_key/fn_encrypt_oauth/fn_decrypt_oauth).
do $$
begin
  if to_regclass('private.app_secrets') is not null then
    execute 'alter table private.app_secrets enable row level security';
  end if;
end $$;

notify pgrst, 'reload schema';
-- END migration 0171: revoke de anon no estoque do dump + RLS em app_secrets
