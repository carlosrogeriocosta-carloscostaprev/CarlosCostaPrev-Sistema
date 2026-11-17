-- manifest: camada CarlosCostaPrev (antiga 0173, renumerada para 8015 em 13/11/2026; o timestamp nao mudou): policies to authenticated
-- 0173 — Auditoria B2 Ponto 4, gate C7: 130 policies legadas sem cláusula TO.
--
-- Uma policy sem `TO <papel>` responde a PUBLIC — ou seja, também a `anon`.
-- Hoje é seguro porque `fn_user_org_ids()` devolve vazio para anon, mas isso é
-- acidental: o dia em que uma função helper deixar vazar filtro, as 130
-- policies abrem para anon junto. A disciplina moderna (0088+) escreve
-- `TO authenticated` sempre; esta migration fecha a classe inteira.
--
-- Exceção mantida de propósito: as leituras públicas INTENCIONAIS
-- (`ai_models`, `ai_pricing`) continuam abertas — C1 decidiu isso em 31/08 e
-- a lista aqui existe para que o teste saiba a diferença.
--
-- Idempotente: se a policy já responde a authenticated, o ALTER não muda nada.

do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      -- Sem TO ⇒ roles = {public}. Também cobre o caso anon explícito legado.
      and ('public' = any(roles) or 'anon' = any(roles))
      -- Caixa branca: leitura pública intencional (C1), documentada na 0171.
      and tablename not in ('ai_models', 'ai_pricing')
  loop
    execute format(
      'alter policy %I on %I.%I to authenticated',
      p.policyname, p.schemaname, p.tablename
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
