-- manifest: camada CarlosCostaPrev (antiga 0165, renumerada para 8007 em 13/11/2026; o timestamp nao mudou): previdenciario storage anon grant fix
-- PREV-006 forward-fix: 0164 restaurou anon por engano ao tentar recompor os
-- grants de storage.objects. O acesso anônimo não é necessário para documentos
-- previdenciários; authenticated continua sujeito às policies do bucket.
revoke select, insert, update, delete on table storage.objects from anon;
grant select, insert, update, delete on table storage.objects to authenticated;
notify pgrst, 'reload schema';
-- END migration 0165: remove anon grant do Storage previdenciário
