-- manifest: camada CarlosCostaPrev (antiga 0168, renumerada para 8010 em 13/11/2026; o timestamp nao mudou): previdenciario knowledge review rpc
-- PREV-008 forward-fix: encapsula atualização do estado corrente e inserção do
-- histórico na mesma transação sem usar SECURITY DEFINER. A RLS existente continua
-- sendo o gate final para administrador de plataforma.

create or replace function public.fn_previdenciario_review_pathologies(
  p_stable_keys text[],
  p_next_status text,
  p_editorial_summary text,
  p_review_note text,
  p_request_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_requested_count integer;
  v_found_count integer;
  v_items jsonb := '[]'::jsonb;
  v_summary text;
  v_editor uuid := auth.uid();
begin
  if not public.fn_is_platform_admin() then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;

  if p_stable_keys is null or cardinality(p_stable_keys) < 1 or cardinality(p_stable_keys) > 100 then
    raise exception 'invalid_stable_keys' using errcode = '22023';
  end if;

  select count(*) into v_requested_count from (select distinct key from unnest(p_stable_keys) as key) keys;
  if v_requested_count <> cardinality(p_stable_keys) then
    raise exception 'duplicate_stable_keys' using errcode = '22023';
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

  select count(*) into v_found_count
    from public.previdenciario_pathology_knowledge
   where stable_key = any(p_stable_keys);
  if v_found_count <> cardinality(p_stable_keys) then
    raise exception 'pathology_not_found' using errcode = 'P0002';
  end if;

  for v_row in
    select id, stable_key, review_status, clinical_content, benefit_hypotheses
      from public.previdenciario_pathology_knowledge
     where stable_key = any(p_stable_keys)
     order by stable_key
     for update
  loop
    v_summary := case
      when p_editorial_summary is null
        then v_row.clinical_content ->> 'educationalSummary'
      else p_editorial_summary
    end;

    update public.previdenciario_pathology_knowledge
       set review_status = p_next_status,
           reviewer_user_id = v_editor,
           reviewed_at = now(),
           review_note = p_review_note,
           clinical_content = jsonb_set(
             coalesce(v_row.clinical_content, '{}'::jsonb),
             '{educationalSummary}',
             coalesce(to_jsonb(v_summary), 'null'::jsonb),
             true
           )
     where id = v_row.id;

    insert into public.previdenciario_pathology_review_history
      (pathology_knowledge_id, previous_status, next_status, editorial_summary,
       benefit_hypotheses, review_note, reviewer_user_id, request_id)
    values
      (v_row.id, v_row.review_status, p_next_status, v_summary,
       coalesce(v_row.benefit_hypotheses, '[]'::jsonb), p_review_note, v_editor, p_request_id);

    v_items := v_items || jsonb_build_object(
      'id', v_row.id,
      'stable_key', v_row.stable_key,
      'previous_status', v_row.review_status,
      'next_status', p_next_status,
      'editorial_summary', v_summary,
      'benefit_hypotheses', coalesce(v_row.benefit_hypotheses, '[]'::jsonb)
    );
  end loop;

  return jsonb_build_object('updated_count', cardinality(p_stable_keys), 'items', v_items);
end;
$$;

revoke execute on function public.fn_previdenciario_review_pathologies(text[], text, text, text, uuid) from public, anon;
grant execute on function public.fn_previdenciario_review_pathologies(text[], text, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
-- END migration 0168: PREV-008 knowledge review RPC
