-- manifest: camada CarlosCostaPrev: tira a sobrecarga emit_event de 9 parâmetros (da 8016) e cria emit_event_cross_module, que delega ao emit_event da matriz; idempotente
-- Migration 8018 — forward-fix da 8016 (ex-0174)
--
-- A 8016 trocou o `emit_event` de 6 parâmetros por um de 9 com o corpo ANTIGO, sem a guarda de
-- eventos reservados da matriz v1.109.0, e a matriz redefine o de 6 parâmetros: as duas
-- coexistiriam ("function is not unique") e a de 9 seria uma porta para forjar evento.
-- Aqui a de 9 sai e a capacidade (correlation_id, modulo_origem, modulo_destino) passa a uma
-- função própria, que chama o `emit_event` e depois grava as 3 colunas.
--
-- ATENÇÃO (banco ATIVO): o `emit_event` de 6 parâmetros só volta a existir quando o
-- `supabase/baseline.sql` da matriz for aplicado (passo de atualização). Aplicar esta migration
-- sozinha, sem o baseline, deixa o banco sem `emit_event` até lá.

drop function if exists public.emit_event(text, text, uuid, jsonb, jsonb, uuid, uuid, text, text);

-- Correlação de saga e módulos SEM tocar no `emit_event` da matriz: esta função só
-- delega a ele (herdando a guarda de membership e a de eventos reservados) e depois
-- grava as 3 colunas da mesma linha, na mesma transação. Atualização da matriz que
-- mexer no `emit_event` não afeta esta camada.
create or replace function public.emit_event_cross_module(
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
  v_event_id uuid;
begin
  v_event_id := public.emit_event(
    p_event_type, p_entity_kind, p_entity_id, p_payload, p_metadata, p_organization_id
  );
  update public.event_log
     set correlation_id = p_correlation_id,
         modulo_origem = p_modulo_origem,
         modulo_destino = p_modulo_destino
   where id = v_event_id;
  return v_event_id;
end
$fn$;
revoke execute on function public.emit_event_cross_module(text, text, uuid, jsonb, jsonb, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.emit_event_cross_module(text, text, uuid, jsonb, jsonb, uuid, uuid, text, text) to service_role;

notify pgrst, 'reload schema';
-- END migration 8018
