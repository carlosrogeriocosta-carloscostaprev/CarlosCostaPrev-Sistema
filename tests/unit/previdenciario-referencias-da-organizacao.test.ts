import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { validateCaseRefs } from "@/lib/previdenciario/case-api";

/**
 * Achado de segurança de 13/11/2026 (PRD da atualização, seção 8): as rotas do caso previdenciário gravavam
 * `contact_id`, `lead_id` e `responsible_user_id` vindos do corpo sem conferir a organização, e as FKs do banco
 * apontam só para `contacts(id)`, `crm_leads(id)` e `auth.users(id)`. Aqui se prova a conferência e se cerca
 * que as três rotas continuem a chamá-la.
 */

type Linha = Record<string, unknown>;

/** Cliente de mentira que aplica `eq` e `is` de verdade sobre linhas em memória, como o PostgREST faria. */
function falso(tabelas: Record<string, Linha[]>, falhaEm?: string) {
  const consultas: string[] = [];
  const cliente = {
    from(tabela: string) {
      consultas.push(tabela);
      const filtros: Array<[string, string, unknown]> = [];
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => (filtros.push(["eq", c, v]), b),
        is: (c: string, v: unknown) => (filtros.push(["is", c, v]), b),
        maybeSingle: async () => {
          if (falhaEm === tabela) return { data: null, error: { message: "falha simulada" } };
          const linha = (tabelas[tabela] ?? []).find((l) =>
            filtros.every(([op, c, v]) => (op === "eq" ? l[c] === v : (l[c] ?? null) === v)),
          );
          return { data: linha ?? null, error: null };
        },
      };
      return b;
    },
  };
  return { cliente: cliente as unknown as SupabaseClient<never>, consultas };
}

const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B = "bbbbbbbb-0000-4000-8000-000000000002";
const CONTATO_A = "cccccccc-0000-4000-8000-00000000000a";
const CONTATO_B = "cccccccc-0000-4000-8000-00000000000b";
const LEAD_A = "dddddddd-0000-4000-8000-00000000000a";
const LEAD_B = "dddddddd-0000-4000-8000-00000000000b";
const USUARIO_A = "eeeeeeee-0000-4000-8000-00000000000a";
const USUARIO_B = "eeeeeeee-0000-4000-8000-00000000000b";
const USUARIO_REVOGADO = "eeeeeeee-0000-4000-8000-0000000000ff";

const BANCO = {
  contacts: [
    { id: CONTATO_A, organization_id: ORG_A },
    { id: CONTATO_B, organization_id: ORG_B },
  ],
  crm_leads: [
    { id: LEAD_A, organization_id: ORG_A },
    { id: LEAD_B, organization_id: ORG_B },
  ],
  user_organizations: [
    { user_id: USUARIO_A, organization_id: ORG_A, revoked_at: null },
    { user_id: USUARIO_B, organization_id: ORG_B, revoked_at: null },
    { user_id: USUARIO_REVOGADO, organization_id: ORG_A, revoked_at: "2026-11-01T00:00:00Z" },
  ],
};

describe("validateCaseRefs — contato, lead e responsável têm de ser da mesma organização", () => {
  it("aceita referências da própria organização", async () => {
    const { cliente } = falso(BANCO);
    const { cliente: admin } = falso(BANCO);
    expect(await validateCaseRefs(cliente, admin, ORG_A, { contactId: CONTATO_A, leadId: LEAD_A, responsibleUserId: USUARIO_A })).toBeNull();
  });

  it("sem referência nenhuma não consulta nada e aceita", async () => {
    const a = falso(BANCO);
    const b = falso(BANCO);
    expect(await validateCaseRefs(a.cliente, b.cliente, ORG_A, {})).toBeNull();
    expect(await validateCaseRefs(a.cliente, b.cliente, ORG_A, { leadId: null, responsibleUserId: null })).toBeNull();
    expect(a.consultas).toEqual([]);
    expect(b.consultas).toEqual([]);
  });

  it.each([
    ["contato de outra organização", { contactId: CONTATO_B }, "Contato inválido"],
    ["lead de outra organização", { leadId: LEAD_B }, "Lead inválido"],
    ["responsável de outra organização", { responsibleUserId: USUARIO_B }, "Responsável inválido"],
    ["responsável com vínculo revogado", { responsibleUserId: USUARIO_REVOGADO }, "Responsável inválido"],
    ["contato que não existe", { contactId: "cccccccc-0000-4000-8000-0000000000ee" }, "Contato inválido"],
  ])("recusa com 422: %s", async (_nome, refs, mensagem) => {
    const { cliente } = falso(BANCO);
    const { cliente: admin } = falso(BANCO);
    const erro = await validateCaseRefs(cliente, admin, ORG_A, refs);
    expect(erro).toMatchObject({ code: "validation_failed", status: 422 });
    expect(erro?.message).toContain(mensagem);
  });

  it("a mensagem não distingue 'não existe' de 'é de outra organização' (não confirma o UUID)", async () => {
    const { cliente } = falso(BANCO);
    const { cliente: admin } = falso(BANCO);
    const alheio = await validateCaseRefs(cliente, admin, ORG_A, { contactId: CONTATO_B });
    const inexistente = await validateCaseRefs(cliente, admin, ORG_A, { contactId: "cccccccc-0000-4000-8000-0000000000ee" });
    expect(alheio).toEqual(inexistente);
  });

  it("a pertinência do responsável é lida pelo cliente admin, nunca pela sessão", async () => {
    const sessao = falso(BANCO);
    const admin = falso(BANCO);
    await validateCaseRefs(sessao.cliente, admin.cliente, ORG_A, { responsibleUserId: USUARIO_A });
    expect(admin.consultas).toEqual(["user_organizations"]);
    expect(sessao.consultas).toEqual([]);
  });

  it("falha de leitura vira 500, e não aceitação silenciosa", async () => {
    const admin = falso(BANCO).cliente;
    for (const [tabela, refs] of [
      ["contacts", { contactId: CONTATO_A }],
      ["crm_leads", { leadId: LEAD_A }],
    ] as const) {
      const erro = await validateCaseRefs(falso(BANCO, tabela).cliente, admin, ORG_A, refs);
      expect(erro).toMatchObject({ code: "internal_error", status: 500 });
    }
    const erro = await validateCaseRefs(falso(BANCO).cliente, falso(BANCO, "user_organizations").cliente, ORG_A, { responsibleUserId: USUARIO_A });
    expect(erro).toMatchObject({ code: "internal_error", status: 500 });
  });
});

describe("as três rotas que gravam essas referências continuam chamando a conferência", () => {
  const ROTAS = [
    "app/api/v1/previdenciario/cases/route.ts",
    "app/api/v1/previdenciario/cases/[id]/route.ts",
    "app/api/v1/previdenciario/cases/[id]/prazos/route.ts",
  ];

  it.each(ROTAS)("%s chama validateCaseRefs ANTES de gravar", (rota) => {
    const fonte = readFileSync(join(process.cwd(), rota), "utf8");
    const conferencia = fonte.indexOf("validateCaseRefs(");
    const gravacao = Math.min(
      ...[".insert(", ".update(update"].map((t) => fonte.indexOf(t)).filter((i) => i >= 0),
    );
    expect(conferencia, `${rota} não chama validateCaseRefs`).toBeGreaterThan(-1);
    expect(conferencia).toBeLessThan(gravacao);
  });

  it("nenhuma rota do previdenciário grava responsible_user_id/contact_id/lead_id fora das três conferidas", () => {
    const raiz = join(process.cwd(), "app/api/v1/previdenciario");
    const lista = readdirSync(raiz, { recursive: true, encoding: "utf8" })
      .map((f) => f.replaceAll("\\", "/"))
      .filter((f) => f.endsWith("route.ts"))
      .map((f) => `app/api/v1/previdenciario/${f}`);
    const gravam = lista.filter((f) => /(contact_id|lead_id|responsible_user_id)\s*[:=]\s*parsed/.test(readFileSync(join(process.cwd(), f), "utf8")));
    expect(gravam.sort()).toEqual([...ROTAS].sort());
  });
});

vi.mock("server-only", () => ({}));
