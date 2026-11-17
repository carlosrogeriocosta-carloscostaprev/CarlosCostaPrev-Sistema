-- manifest: camada CarlosCostaPrev (antiga 0163, renumerada para 8005 em 13/11/2026; o timestamp nao mudou): previdenciario documents storage
-- PREV-006: bucket privado para documentos dos casos previdenciários.
-- O upload e a emissão de URL assinada passam pelo backend com service_role;
-- não expor INSERT/DELETE do bucket diretamente ao navegador.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'previdenciario-documents',
  'previdenciario-documents',
  false,
  26214400,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Acesso a storage.objects é deliberadamente restrito ao service_role.
-- As rotas validam sessão, RBAC, organização, caso e prefixo antes de usar o admin client.
revoke all on storage.objects from anon, authenticated;
notify pgrst, 'reload schema';
-- END migration 0163: PREV-006 previdenciario documents storage
