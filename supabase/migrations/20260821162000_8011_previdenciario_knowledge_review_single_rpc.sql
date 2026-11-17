-- manifest: camada CarlosCostaPrev (antiga 0169, renumerada para 8011 em 13/11/2026; o timestamp nao mudou): previdenciario knowledge review single rpc
-- PREV-008 forward-fix: revisão individual atômica com snapshot editorial completo.
-- A função 0168 permanece para revisão em lote; esta assinatura é específica para
-- uma patologia e recebe o estado final já validado pela API.

drop function if exists public.fn_previdenciario_review_pathology(text, text, text, jsonb, text, uuid);

create or replace function public.fn_previdenciario_review_pathology(
  p_stable_key text,
  p_next_status text,
  p_editorial_summary text,
  p_benefit_hypotheses jsonb,
  p_review_note text,
  p_request_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_result jsonb;
  v_editor uuid := auth.uid();
  v_history_id uuid;
begin
  if not public.fn_is_platform_admin() then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;
  if p_stable_key is null or p_stable_key !~ '^[a-z0-9][a-z0-9_]{2,119}$' then
    raise exception 'invalid_stable_key' using errcode = '22023';
  end if;
  if p_next_status not in ('draft','needs_review','approved','rejected','archived') then
    raise exception 'invalid_review_status' using errcode = '22023';
  end if;
  if p_editorial_summary is not null and char_length(p_editorial_summary) > 20000 then
    raise exception 'editorial_summary_too_long' using errcode = '22023';
  end if;
  if p_review_note is not null and char_length(p_review_note) > 4000 then
    raise exception 'review_note_too_long' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_benefit_hypotheses, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_benefit_hypotheses' using errcode = '22023';
  end if;

  select id, stable_key, review_status
    into v_row
    from public.previdenciario_pathology_knowledge
   where stable_key = p_stable_key
   for update;
  if not found then
    raise exception 'pathology_not_found' using errcode = 'P0002';
  end if;

  update public.previdenciario_pathology_knowledge
     set review_status = p_next_status,
         reviewer_user_id = v_editor,
         reviewed_at = case when p_next_status in ('approved','rejected') then now() else null end,
         review_note = p_review_note,
         clinical_content = jsonb_set(
           coalesce((select clinical_content from public.previdenciario_pathology_knowledge where id = v_row.id), '{}'::jsonb),
           '{educationalSummary}',
           coalesce(to_jsonb(p_editorial_summary), 'null'::jsonb),
           true
         ),
         benefit_hypotheses = coalesce(p_benefit_hypotheses, '[]'::jsonb)
   where id = v_row.id;

  insert into public.previdenciario_pathology_review_history
    (pathology_knowledge_id, previous_status, next_status, editorial_summary,
     benefit_hypotheses, review_note, reviewer_user_id, request_id)
  values
    (v_row.id, v_row.review_status, p_next_status, p_editorial_summary,
     coalesce(p_benefit_hypotheses, '[]'::jsonb), p_review_note, v_editor, p_request_id)
  returning id into v_history_id;

  v_result := jsonb_build_object(
    'pathology_id', v_row.id,
    'history_id', v_history_id,
    'stable_key', v_row.stable_key,
    'previous_status', v_row.review_status,
    'next_status', p_next_status
  );
  return v_result;
end;
$$;

revoke execute on function public.fn_previdenciario_review_pathology(text, text, text, jsonb, text, uuid) from public, anon;
grant execute on function public.fn_previdenciario_review_pathology(text, text, text, jsonb, text, uuid) to authenticated;

notify pgrst, 'reload schema';
-- END migration 0169: PREV-008 single review RPC
