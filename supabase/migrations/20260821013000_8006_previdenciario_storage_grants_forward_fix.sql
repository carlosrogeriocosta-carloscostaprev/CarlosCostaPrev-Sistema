-- manifest: camada CarlosCostaPrev (antiga 0164, renumerada para 8006 em 13/11/2026; o timestamp nao mudou): previdenciario storage grants forward fix
-- PREV-006 forward-fix: 0163 aplicou um revoke global em storage.objects.
-- O isolamento continua sendo garantido por policies e pelas rotas backend;
-- os grants de tabela precisam permanecer no padrão do Storage para não quebrar
-- buckets existentes (ai-policy, lgpd-exports e whatsapp-media).

grant select, insert, update, delete on table storage.objects to anon, authenticated;
notify pgrst, 'reload schema';
-- END migration 0164: restaura grants do Storage após PREV-006
