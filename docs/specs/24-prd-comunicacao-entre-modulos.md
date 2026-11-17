# PRD 24 — Comunicação Real entre Módulos (Cross-Module de Verdade)

**Status:** Proposta — nenhuma linha implementada ainda.
**Autor:** sessão 2026-09-01 (após auditoria de honestidade do Centro SOS)
**Depende de:** spec 23 (Centro SOS), `lib/previdenciario/compartilhado/*`
**Princípio norteador:** todo número exibido na UI precisa ser medido, não declarado. "Declarado à mão" é provisório e deve aparecer rotulado como tal.

> Sinceridade registrada: hoje o Centro SOS mostra versões, contratos e integrações
> **escritos à mão** em `lib/security/sos-catalog.ts`. O motor de automações e o
> event bus em `lib/previdenciario/compartilhado/` **existem como código**, mas
> ninguém verifica se os eventos declarados são emitidos de verdade, nem se os
> handlers registrados correspondem aos contratos. Esta PRD fecha essa lacuna.

---

## 1. Objetivo

Fazer os módulos se comunicarem **de fato** — evento emitido é evento entregue e registrado — e fazer o Centro SOS **medir** essa comunicação em vez de declará-la.

Não-objetivo desta fase: nenhuma ação destrutiva via SOS (isso é SOS-07, futuro).

## 2. O que existe hoje (levantamento real, 01/09/2026)

| Peça | Onde | Estado real |
|---|---|---|
| Tipos de evento cross-module | `compartilhado/dominio/eventos.ts` | Tipagem completa (fonte da verdade de tipos) |
| Event bus (pub/sub, DLQ, métricas) | `compartilhado/infra/event-bus.ts` | Em memória; métricas existem mas **não são expostas em lugar nenhum** |
| Motor de automações cross-module | `compartilhado/automacoes/motor-cross-module.ts` | Código existe; regras vivem em memória/código |
| Validação de grafo de dependências | `compartilhado/dependencias/validator-dependencias.ts` | **Funciona** (30 nós, 0 ciclos, testado) |
| Catálogo SOS (módulos, versões, contratos) | `lib/security/sos-catalog.ts` | **Declarativo** — strings escritas à mão; diverge do grafo real |
| Health-check Supabase/Redis/WAHA | `lib/health/integration-checks.ts` | **Real** (mede latência de verdade) |
| Persistência de eventos | — | **Não existe**. Evento processado se perde quando o processo morre |

## 3. Problemas concretos a resolver

1. **P1 — Evento some no reinício.** Event bus é `Map` em memória. Sem tabela, não há replay nem evidência (e SOS-06 precisa de evidência).
2. **P2 — Catálogo SOS não é verificado contra o código.** "10 módulos, versões, contratos" podem divergir do real sem ninguém notar.
3. **P3 — Nenhum porteiro.** Nada impede um módulo emitir evento fora do contrato declarado.
4. **P4 — Métricas existem mas ninguém vê.** `MetricasEventBus` morre com o processo.
5. **P5 — Sem prova end-to-end.** Não existe teste que emite um evento real e verifica a entrega no módulo destino (o D1/D3 provam constraints do banco, não o fluxo).

## 4. Escopo — 4 entregas

### E1. Persistência de eventos (resolve P1)
- Tabela `dominio_eventos` (append-only): id, tipo, modulo_origem, modulo_destino, caso_id, correlation_id, causado_por, payload jsonb, status (recebido/processado/falho/dead_letter), tentativas, timestamps.
- `event-bus.ts` passa a gravar antes de despachar (write-through), com fallback: se gravar falhar, evento vai para DLQ em memória + log de erro (nunca perder silenciosamente).
- Anti-duplicata: UNIQUE em `(id)` + correlação; replay possível por `correlation_id`.
- RLS por organização (eventos carregam dados de cliente).

### E2. Registro e reconciliação do catálogo (resolve P2 e P4)
- Cada módulo exporta um `manifest` **do próprio código** (arquivo `manifest.ts` no módulo): chaves de eventos que emite, eventos que consome, tabelas que usa.
- Novo job/endpoint `GET /api/v1/admin/security/sos/reconcile` que compara:
  - manifestos reais × `sos-catalog.ts` → lista divergências;
  - grafo `validator-dependencias` × manifestos → nó sem manifesto / aresta sem evento correspondente.
- Centro SOS passa a exibir **duas colunas**: "declarado" e "medido" (contagem real de eventos na tabela nas últimas 24h por módulo).

### E3. Contrato enforced no bus (resolve P3)
- `publicar(evento)` valida: tipo existe em `dominio/eventos` (union type run-time via Zod), módulo origem tem manifesto registrado, destino é válido. Inválido → erro typed, vai à DLQ com motivo.
- Handler registrado para tipo não declarado → warning na reconciliação.

### E4. Prova end-to-end (resolve P5)
- Teste em `tests/invariants/cross-module-e2e.test.ts`: publica evento real no bus (com Supabase efêmero), verifica: linha na tabela, handler executado, métrica incrementada, status `processado`.
- Teste de falha: handler que lança exceção → status `falho` após N retries → `dead_letter`, registro íntegro.

## 5. Critérios de aceite (verificáveis, sem exceção)

1. `pnpm test:db` verde com os 2 novos testes de E4.
2. Reiniciar o processo não apaga histórico: evento gravado em E1 persiste e é replayável.
3. Endpoint de reconciliação retorna JSON com `divergencias: []` quando código e catálogo estão alinhados; remover uma linha do manifesto de propósito faz a divergência aparecer (teste unitário prova isso).
4. Centro SOS mostra contagem real de eventos/24h por módulo vinda da tabela — se a tabela estiver vazia, mostra 0 e rótulo "sem tráfego medido", nunca número inventado.
5. Nenhuma ação destrutiva adicionada; `read_only: true` continua verdade no SOS.
6. O que permanecer declarativo (ex.: textos de `controls`/`recovery`) ganha rótulo explícito "declarativo" na UI.

## 6. Fora de escopo (registrado para não confundir depois)

- SOS-03 a SOS-08 completos (gates, WAF, ações destrutivas).
- Migração dos eventos para broker externo (Redis streams etc.) — decidir depois que o volume real for medido por E2/E4.
- Callbacks tempo-real para a UI (SSE/websocket) — próxima fase.

## 7. Riscos e honestidade sobre esforço

| Risco | Mitigação |
|---|---|
| Escrever no bus a cada evento adiciona latência ao fluxo de mensagens | Medir com dados reais (D2); write assíncrono com lote se necessário |
| Manifestos por módulo exigem tocar módulos existentes | E2 começa com 3 módulos-piloto (crm-core, messaging-channel, ai-and-rag); demais seguem |
| Catálogo legado diverge e o reconcile vira ruído | Divergência = aviso (não bloqueio) até os manifestos convergirem |

Estimativa honesta: E1 = 1-2 dias; E2 = 1-2 dias; E3 = 1 dia; E4 = 1 dia. Com testes e CI verde: **4-6 dias de trabalho focado**, não "uma tarde".

## 8. Ordem de execução proposta

1. E1 (persistência) — sem ela todo o resto mede nada.
2. E4 parcial (prova de que E1 funciona) — antes de construir em cima.
3. E2 (manifestos de 3 módulos + reconcile + UI duas colunas).
4. E3 (portaria do bus).
5. E4 completo + documentação da spec 23 atualizada (o que virou real).
