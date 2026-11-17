/**
 * O WORKER DE ROTEAMENTO VALIDA A ORG DO PAYLOAD — e precisa continuar assim.
 *
 * A auditoria B2 (frente service role) apontou `lib/routing/worker.ts` como
 * ⚠️ "aceita org do payload do evento". Releitura linha a linha mostrou que o
 * check EXISTE — `orgId !== event.organization_id` → `skipped_invalid_payload`
 * — mas ele está fundido com a validação de `conversation_id`, numa linha que
 * não diz o que protege. Um futuro refator pode "simplificar" a condição e
 * remover a defesa sem intenção: o worker roda com service role (bypass RLS),
 * então um `organization_id` forjado no payload do evento faria atribuição
 * cross-tenant.
 *
 * Este teste torna a exigência visível: se alguém remover o teste de
 * consistência de organização, a suíte reprova — e o código deixa de compilar
 * a mensagem do jeito que o auditor não conseguiu ler.
 *
 * Medido em 2026-08-31: o guarda está na linha `if (!conversationId || orgId
 * !== event.organization_id)`. Separar em dois `if`s (payload inválido vs org
 * divergente) segue válido — o que não pode é a condição `orgId !==
 * event.organization_id` sumir.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WORKER = join(
  __dirname, "..", "..", "lib", "routing", "worker.ts",
);

describe("routing worker — a org do payload não pode divergir da linha do evento", () => {
  const src = readFileSync(WORKER, "utf8");

  it("o check de consistência de organização existe no caminho do processEvent", () => {
    // Padrão estrutural: a comparação com a org da LINHA (a fonte confiável),
    // não com outro campo do payload (que é influenciável pela origem do evento).
    expect(
      /orgId\s*!==\s*event\.organization_id/.test(src),
      "lib/routing/worker.ts não compara mais a org do payload com " +
        "event.organization_id — o guard contra evento com org forjada sumiu.",
    ).toBe(true);
  });

  it("a divergência produz skipped_invalid_payload (a recusa tem nome próprio)", () => {
    expect(src).toContain("skipped_invalid_payload");
  });

  it("o controle negativo: o detector pega a remoção", () => {
    const sabotado = src.replace(/orgId\s*!==\s*event\.organization_id/, "false");
    expect(/orgId\s*!==\s*event\.organization_id/.test(sabotado)).toBe(false);
  });
});
