# CAMADA CarlosCostaPrev — o que nós temos por cima da matriz

> Fechamento do passo 3 do plano de atualização (PRD em `../PRD-e-plano-atualizacao-da-matriz.md`).
> Estado de **15/11/2026**, branch `atualizacao/v1.109.0` (base: tag `v1.109.0` da matriz `melgarafael/DeskcommCRM`).
> Tudo local, sem commit. Os números saem de `git diff --name-status v1.109.0` e envelhecem:
> para conferir, rode esse comando, não confie nesta linha.

Regra de uso: cada arquivo da matriz que alteramos vira conflito possível em toda atualização.
**Antes de alterar um arquivo da matriz, tente pôr a mudança num arquivo nosso.**

## A. Arquivos só nossos (102 no momento)

Não existem na matriz; não conflitam. Por área:

| Área | O que é |
|---|---|
| `lib/previdenciario/*`, `lib/previdenciario/compartilhado/*`, `lib/previdenciario/judicial/*` | Regras do domínio previdenciário: casos, catálogo, conhecimento, documentos, prazos, grafo de dependências |
| `app/app/previdenciario/*` (6) e `app/api/v1/previdenciario/*` (20: cases 10, knowledge 6, catalog 3, case-stages 1) | Telas e rotas do módulo |
| `hooks/previdenciario/*`, `data/previdenciario/*` | Hooks de tela e dados de referência (patologias curadas, IFBrA) |
| `supabase/migrations/8001…8017` (17) | Nossas migrations, na faixa 8001+ que a matriz nunca usa. A 8017 converte `team_invites` para o modelo da matriz e **não foi testada num banco** |
| `lib/mcp/connection.ts` (+ teste) | Informação de conexão MCP |
| `docs/specs/*` (6) e `SECURITY-AUDIT-REPORT.md` | Specs e relatório nossos |
| `.github/ci-config.json`, `.github/docker-images.json` | Config de CI nossa |
| `tests/unit/*` (7), `tests/invariants/*` (4) | Testes da camada |

Sem dono claro, a investigar: `src/app/agentes/EditorTopBar.tsx`, `src/mock/demo.ts`, `src/mock/fixtures.ts`
(uma pasta `src/` que a matriz não tem).

## B. Arquivos da matriz que alteramos (88 no momento)

**Alterações funcionais (revisadas nesta etapa)**

| Arquivo | O que mudamos e por quê |
|---|---|
| `lib/navigation/catalogo.ts` | Grupo "Previdenciário" e as duas portas (`/app/previdenciario`, `/app/previdenciario/conhecimento`); sem porta, o gate `navegacao-completude` reprova |
| `lib/i18n/dicionario.ts` | Textos em espanhol dessas duas portas; o gate `i18n-catalogo-do-menu` exige |
| `lib/audit/actions.ts` | 19 códigos de auditoria nossos acrescentados no fim (os 6 `security.sos_*` do Centro SOS saíram em 17/11/2026: linhas antigas do log com esses códigos seguem no banco, sem rótulo no filtro) |
| `lib/auth/rate-limit.ts` + `app/actions/auth/useRecoveryCode.ts` | Teto de tentativas do código de recuperação (3/hora por e-mail, 10/hora por IP): auditoria B2/C4 |
| `lib/auth/invite-token.ts` + teste | Token de convite exige segredo (`INVITE_TOKEN_SECRET`/`INTERNAL_SECRET`), sem fallback público: commit `0c5fe7f49` |
| `lib/database.types.ts` | Tabelas `previdenciario_*` e 2 funções, **copiadas** da nossa versão. Precisa ser **regenerado de um banco real** (passo 4) |
| `scripts/lint-channels.ts` | Tirada a exceção da rota SOS (rota removida) |

**Alterações mescladas sem conflito (marca, infraestrutura, testes)**: aplicadas pelo merge de três pontas;
o motivo de cada uma **não foi revisado linha a linha** nesta etapa. Lista: `.env*.example`, `AGENTS.md`,
`ARCHITECTURE.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `VISION.md`, `SECURITY.md`, `Caddyfile`, `Dockerfile*`,
`app/globals.css`, `app/layout.tsx`, `app/design/*`, `docs/design-system/*`, `docs/doctrine/*`, `docs/testing/*`,
`docs/threat-model.md`, `hostgator-setup-kit/_common.sh`, `hostgator-setup-kit/comecar.sh`, `lib/branding.ts`,
`lib/email/resend.ts`, `lib/legal/operador.ts`, `lib/lgpd/*`, `lib/agent-engine/*` (4 arquivos),
`lib/mcp/tools/pacotes.ts`, `lib/nuvemshop/config.ts`, `lib/supabase/admin.ts`, `lib/api/errors.ts`,
`workers/agent-worker/main.ts`, `hooks/ai/useDebugToggle.ts`, `app/api/v1/cron/sync-model-catalog/route.ts`,
`app/app/settings/atualizacao/_components/UpdatePanel.tsx`, testes (`tests/e2e/*`, `tests/invariants/*`,
`tests/unit/*`, `tests/setup/vitest.setup.ts`, `vitest.db.config.ts`).

## C. Onde ficamos com a versão da matriz (decidido)

| Tema | Decisão |
|---|---|
| Convites de equipe | Modelo da matriz (migration `0238` + `aplicarConvite`, que trata revogação, limite do plano e suporte). O nosso modelo antigo saiu. O link `accept_url` é devolvido sempre ao admin que convida (comportamento da matriz) |
| `health/route.ts`, `waha/client.ts`, `encerramento.ts`, campos personalizados do contato, `debounce.ts` | Versão da matriz: já cobre o que tínhamos (a do WAHA incorpora o nosso PR #465) |
| Cancelar ativação de MFA | Não reaplicado (decisão de 15/11). `app/actions/auth/cancelMfaEnroll.ts` ficou **sem uso** |
| Conexão MCP para quem não é admin | Não reaplicada: a matriz leva o não-admin a `/403` |
| Cadastro de novas organizações | Desligado (decisão de 13/11); fica a versão da matriz |
| Anonimização LGPD do dossiê previdenciário | **Mantido** (decisão do dono, 16/11/2026): casos e documentos ficam; só o contato é anonimizado. Prazo de guarda e base legal a fixar com o advogado |
| Centro SOS | **Removido** por decisão do dono em 14/11/2026 (tela, 2 rotas, catálogo, 9 manifestos, hook, spec, porta do menu, `platformAdminOnly`). Em 17/11/2026 o dono mandou apagar também o resto: os 6 códigos `security.sos_*` e o SOS da cópia antiga em `C:/Users/NIKE/CarlosCostaPrev-Sistema` (alterações lá sem commit). A tag `pre-atualizacao` é o que ainda guarda o módulo. Sobra só um comentário "reconcile SOS" no índice de `event_log` (migration 8016 e baseline), deixado de propósito |

**Decidido na correção de 17/11/2026, depois do primeiro CI no GitHub (PR #26):**

| Tema | Decisão |
|---|---|
| `import "server-only"` em `lib/supabase/admin.ts` (C6, auditoria B2 do `main` antigo) | **Removido; o arquivo voltou a ser o da matriz.** O worker do `event_log` roda sob `tsx`, que não resolve `server-only` (o pacote nem é dependência), e `tests/unit/drain-loop-carrega-deps-sob-tsx.test.ts` reprovou. Perde-se a trava de build contra a service role cair no bundle do navegador; se quiser de volta, o caminho é uma regra de lint (`no-restricted-imports`), não este import |
| Espanhol das telas previdenciárias | `lib/i18n/previdenciario.ts` (nosso), espalhado em `DICIONARIO` por uma linha. Tradução sem revisão de falante nativo |
| Rótulo de benefício/serviço | `lib/previdenciario/primeiro-preenchido.ts`, para não mexer na lista de leituras legítimas de `rotulo-do-contato.test.ts` (da matriz) |
| Policies do previdenciário no baseline | Só a versão final (8019) fica no arquivo; as intermediárias saíram (a cerca `baseline-nao-constroi-o-que-derruba` exige). O bloco `0159` de `contacts.custom_fields` que sobrava no dump também saiu |
| Linha do `0204` no MANIFEST | Carimbo mudou para `20260901120001`, igual ao nome do arquivo (o `20260901120000` é da nossa 8016) |

**Decidido depois do primeiro CI do repositório novo (17/11/2026):**

| Tema | Decisão |
|---|---|
| README | Reescrito com a marca CarlosCostaPrev, sem logo, curso, parceria com afiliado nem lista de contribuidores da matriz. Diz que instala em VPS HostGator, Hostinger ou outra com Docker, e avisa que o `update.sh` ainda aponta para a matriz. `LICENSE` mantém o copyright original (a MIT exige). `README.en.md` e `README.es.md` **ainda têm a marca da matriz** |
| Migration `8012` (convites, modelo antigo) | Declarada em `MIGRATIONS_QUE_NAO_RODAM` de `baseline-e-cadeia-chegam-ao-mesmo-schema.test.ts` (**teste da matriz editado**): sobre o baseline falha com `column "declined_at" does not exist`; a `8017` converte |
| Migration `8020` | Refaz a varredura C7 (policies `TO authenticated`) no fim da cadeia: as migrations da matriz posteriores à `8015` recriam policies sem `TO`, e baseline e cadeia divergiam em 324 objetos |
| Menu lateral | `interface-por-empresa.test.ts` (**da matriz, editado**) passou de 15 para 17 itens: o grupo Previdenciário traz 2 portas. Aceita-se a rolagem do menu no preset completo |
| `lint-channels.ts` | `health/route.ts` volta à dívida conhecida (rota da matriz); sai a entrada do manifesto do SOS |

## D. Órfãos (ninguém importa; **apagar só com ok explícito**)

`lib/health/status.ts`, `lib/health/integration-checks.ts` (+ `tests/unit/health-status.test.ts`),
`app/app/settings/api-tokens/_components/McpConnectionInfo.tsx`, `app/actions/auth/cancelMfaEnroll.ts`,
`tests/stubs/server-only.ts`.

## E. Marca da matriz que ainda aparece (passo 6)

`package.json` (`name: deskcomm-crm`), assunto do e-mail de alerta de orçamento de IA ("— DeskcommCRM"),
`hostgator-setup-kit/install.sh` (`REPO_URL` aponta para `melgarafael/DeskcommCRM`: o `update.sh` precisa do nosso repositório).

## F. Em aberto (não é do passo 3)

- `supabase/baseline.sql`: mesclado em 15/11 (nossa camada + conversão da 8017). Em 16/11 entraram a 8018
  (`emit_event_cross_module` separado do `emit_event`, que voltou ao texto da matriz) e a 8019 (escrita do módulo
  previdenciário só com `fn_is_platform_admin_full()`, grants literais e travas do suporte depois das nossas tabelas).
  `test:db` em 4 fatias (nunca numa rodada só depois dos consertos; os arquivos consertados foram reexecutados à
  parte e passaram): 5 dos 649 arquivos sem verde. 3 são de ambiente (Windows lento: `catalogo-operacao-persistida-real`
  com limite de 20 s no processo filho, `conversa-que-nasce-durante-a-trava-do-contato` com 892 ms contra 700 ms,
  `baseline-e-cadeia-chegam-ao-mesmo-schema` com `beforeAll` de 600 s estourado — este último NÃO provado, rodar no CI).
  2 que dependiam de decisão do dono, **resolvidos em 16/11/2026**: `previdenciario_cases` e `previdenciario_case_documents`
  ficam FORA da anonimização da LGPD (dossiê mantido por dever do escritório; base a confirmar com o advogado, que fixa o
  prazo de guarda). O contato continua anonimizado. Registrado em `DECISOES` de
  `lgpd-redact-unificado-alcanca-pelo-catalogo.test.ts` e em `DIVIDA_LGPD_CONHECIDA` de
  `lgpd-cascata-alcanca-quem-guarda-pessoa.test.ts` — **dois testes da matriz editados**, vão conflitar na próxima atualização.
- Atualização de um banco ANTIGO com dados (16/11/2026): baseline da main antiga + casos, prazos, documentos e convites
  nos 3 estados do modelo antigo, depois o baseline novo duas vezes com `ON_ERROR_STOP=1`, em Postgres 15 (com os 9
  `GRANT … MAINTAIN` do baseline antigo removidos, pois só existem no 17) e em Postgres 17 (baseline antigo intacto).
  Passou nos dois: dados preservados, convites convertidos (recusado→revogado), `emit_event` com 6 argumentos, 15
  travas de suporte nas tabelas de caso, leitura isolada por organização. **Dados sintéticos, banco descartável**; o
  `update.sh` real roda SEM `ON_ERROR_STOP` e é menos rígido que este teste. Não provado: o banco ativo de verdade.
- `lib/database.types.ts` (16/11/2026): conferido por estrutura contra tipos gerados do baseline novo (CLI 2.122.0). As
  14 tabelas `previdenciario_*` e as 2 funções nossas conferem (única diferença: `Json` da matriz contra
  `NonNullable<Json>` do CLI novo). O arquivo da **própria matriz** já é mais velho que o baseline dela (faltam 5 tabelas,
  ~30 funções e views), então NÃO foi trocado pelo gerado: trocaria áreas que não são nossas. `emit_event_cross_module`
  não tem tipo no arquivo porque nenhum código a chama.
- Achado de segurança do PRD (seção 8) **corrigido em 16/11/2026**: as rotas `POST cases`, `PATCH cases/[id]` e `POST cases/[id]/prazos`
  gravavam `contact_id`, `lead_id` e `responsible_user_id` do corpo sem conferir a organização. Agora chamam
  `validateCaseRefs` (`lib/previdenciario/case-api.ts`); prova em `tests/unit/previdenciario-referencias-da-organizacao.test.ts`
  (14 casos, inclui cerca que reprova rota nova que grave esses campos sem conferir). **Só na aplicação**: a FK composta no banco
  (que o PRD mandava avaliar) não foi feita. Não passou por e2e nem por teste em tela.
- Em 16/11/2026: `typecheck` 0 erros (8 GB) e `lint` 0 erros, **696 avisos** (não medi quantos são da nossa camada).
  Falta: e2e, suíte unitária completa, passos 5 e 6 (marca, repositório do `update.sh`, CI).
- `pnpm-lock.yaml` e `supabase/migrations/MANIFEST.md`: ficaram com a matriz.
- `tests/invariants/hardening-definer-varredura.test.ts`: falta a entrada da função `emit_event(...)` da nossa versão; confirmar no `test:db`.
- Nunca rodaram: `lint`, `test:db`, e2e. O typecheck passa (0 erros, 8 GB de heap). A suíte `test:unit` completa **não terminou**; log parcial com 9 arquivos vermelhos, a maioria por ambiente (Windows, timeouts, git/bash).
