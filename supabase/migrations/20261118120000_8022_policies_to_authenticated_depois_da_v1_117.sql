-- manifest: camada CarlosCostaPrev: refaz a varredura C7 (policies permissivas abertas a PUBLIC passam a TO authenticated) DEPOIS das migrations da matriz ate a v1.117.0 (a 8020 ficou antes delas); o baseline.sql ja faz isso no fim do arquivo
-- =============================================================================
-- 8022 — C7 no fim da cadeia, de novo (a 8020 tem carimbo anterior às migrations da v1.110 a v1.117)
-- =============================================================================
-- Idempotente: só toca policy PERMISSIVA aberta a PUBLIC. A RESTRICTIVE que nomeia anon
-- (idempotency_platform_creation_server_only) só restringe, e convertê-la enfraqueceria.
-- Ficam de fora ai_models e ai_pricing, cuja leitura pública é intencional (0171).
--
-- A 8020 continua no repositório (migration aplicada não se renomeia nem se apaga); esta é a que fecha a
-- cadeia hoje. Toda atualização da matriz que traga migration com `create policy` sem TO exige uma
-- migration como esta, depois dela, até o baseline e a cadeia voltarem a concordar.

do $c7$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and permissive = 'PERMISSIVE'
      and 'public' = any(roles)
      and tablename not in ('ai_models', 'ai_pricing')
  loop
    execute format(
      'alter policy %I on %I.%I to authenticated',
      p.policyname, p.schemaname, p.tablename
    );
  end loop;
end $c7$;
