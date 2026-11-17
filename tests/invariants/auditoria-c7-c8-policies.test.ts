import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * C7/C8 da auditoria B2/Ponto 4 ficam FECHADOS pelo banco, não pela memória.
 *
 * C7: policies sem cláusula `TO` respondem a PUBLIC (inclui anon). Funcionavam
 * hoje porque as helpers de org devolvem vazio para anon — ou seja, a segurança
 * era ACIDENTAL. A migration 0173 fecha a classe inteira. Este teste garante
 * que nenhuma policy volte a nascer PUBLIC/anon fora da caixa-branca
 * intencional (ai_models e ai_pricing continuam, por decisão da 0171).
 *
 * C8: `previdenciario_pathology_review_history` tinha `USING(true)` — metadado
 * editorial (reviewer, nota, trilha) era legível cross-tenant. A migration
 * 0172 exige platform admin ou membro de org. Este teste prova que a policy
 * de leitura continua amarrada assim.
 */

describe("C7 — nenhuma policy volta a nascer PUBLIC/anon fora da caixa-branca", () => {
  it("zero policy com role public/anon fora de ai_models e ai_pricing", () => {
    const out = sql(`
      select tablename || '.' || policyname || ' (' || array_to_string(roles, ',') || ')'
      from pg_policies
      where schemaname = 'public'
        and permissive = 'PERMISSIVE'
        and 'public' = any(roles)
        and tablename not in ('ai_models', 'ai_pricing');
    `);
    expect(out, out || "nenhuma fora da caixa-branca").toBe("");
  });

  it("as leituras públicas intencionais seguem vivas (guarda contra correção excessiva)", () => {
    const out = sql(`
      select count(*)
      from pg_policies
      where schemaname = 'public'
        and tablename in ('ai_models', 'ai_pricing');
    `);
    expect(Number(out)).toBeGreaterThan(0);
  });
});

describe("C8 — histórico editorial só para membro de org", () => {
  it("a policy de leitura exige platform admin ou membro de org", () => {
    const out = sql(`
      select policyname, qual
      from pg_policies
      where schemaname = 'public'
        and tablename = 'previdenciario_pathology_review_history'
        and cmd = 'SELECT';
    `);
    const parts = out.split("|");
    expect(parts.length).toBe(2);
    const qual = parts[1]!;
    expect(qual).toContain("fn_is_platform_admin");
    expect(qual).toContain("user_organizations");
    expect(qual).not.toBe("true");
  });
});
