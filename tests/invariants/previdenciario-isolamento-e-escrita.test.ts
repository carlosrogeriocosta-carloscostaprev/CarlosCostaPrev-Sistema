import { beforeAll, describe, expect, it } from "vitest";

import { countAs, sql, writeCountAs } from "./gov-helpers";

/**
 * MÓDULO PREVIDENCIÁRIO (migrations 8002, 8003, 8008, 8009, 8019) — isolamento por
 * organização e escrita do super-admin.
 *
 * Camada nossa: a matriz não conhece estas tabelas e a varredura de RLS
 * (`rls-completude-varredura.test.ts`) exige prova comportamental de toda tabela com
 * `organization_id`. A prova mora aqui, em arquivo novo, e a varredura aponta para cá
 * por `PROVA_PROPRIA`.
 *
 * Duas perguntas, as duas por `set role authenticated` + JWT simulado (conectar como
 * `postgres` mediria nada: ele ignora RLS):
 *
 *   1. Isolamento: quem é membro de A lê as linhas de A e ZERO das de B, e não escreve em B.
 *   2. Escrita do super-admin (8019, fatia da #2115 da matriz): o `support_readonly` LÊ e
 *      NÃO escreve; o `full` escreve. Antes da 8019 as nossas policies de escrita citavam
 *      `fn_is_platform_admin()`, que ignora o escopo, e o `support_readonly` escrevia.
 */

const ORG_A = "08190819-0000-4000-8000-00000000000a";
const ORG_B = "08190819-0000-4000-8000-00000000000b";
const AGENTE_A = "08190819-1111-4000-8000-00000000000a";
const GERENTE_A = "08190819-1111-4000-8000-0000000000a1";
const AGENTE_B = "08190819-1111-4000-8000-00000000000b";
const FULL = "08190819-2222-4000-8000-000000000001";
const READONLY = "08190819-2222-4000-8000-000000000002";

const id = (n: number, lado: "a" | "b") => `08190819-${String(n).padStart(4, "0")}-4000-8000-0000000000${lado}0`;
const CONTATO = { a: id(10, "a"), b: id(10, "b") };
const ETAPA = { a: id(11, "a"), b: id(11, "b") };
const CASO = { a: id(12, "a"), b: id(12, "b") };
const PENDENCIA = { a: id(13, "a"), b: id(13, "b") };
const PRAZO = { a: id(14, "a"), b: id(14, "b") };
const DOCUMENTO = { a: id(15, "a"), b: id(15, "b") };
const EVENTO = { a: id(16, "a"), b: id(16, "b") };
const SOBRESCRITA = { a: id(17, "a"), b: id(17, "b") };

/** As sete tabelas tenant-aware do módulo e a coluna que cada caso semeado ocupa. */
const TABELAS = [
  ["previdenciario_case_stages", ETAPA],
  ["previdenciario_cases", CASO],
  ["previdenciario_case_pendencies", PENDENCIA],
  ["previdenciario_case_deadlines", PRAZO],
  ["previdenciario_case_documents", DOCUMENTO],
  ["previdenciario_case_events", EVENTO],
  ["previdenciario_catalog_overrides", SOBRESCRITA],
] as const;

beforeAll(() => {
  const semear = (lado: "a" | "b", org: string) => `
    insert into public.contacts (id, organization_id, display_name)
      values ('${CONTATO[lado]}', '${org}', 'Contato 8019 ${lado}');
    insert into public.previdenciario_case_stages (id, organization_id, stable_key, name)
      values ('${ETAPA[lado]}', '${org}', 'intake', 'Entrada');
    insert into public.previdenciario_cases (id, organization_id, contact_id, stage_id, title)
      values ('${CASO[lado]}', '${org}', '${CONTATO[lado]}', '${ETAPA[lado]}', 'Caso 8019 ${lado}');
    insert into public.previdenciario_case_pendencies (id, organization_id, case_id, kind, title)
      values ('${PENDENCIA[lado]}', '${org}', '${CASO[lado]}', 'other', 'Pendência 8019 ${lado}');
    insert into public.previdenciario_case_deadlines (id, organization_id, case_id, kind, title, due_at)
      values ('${PRAZO[lado]}', '${org}', '${CASO[lado]}', 'internal', 'Prazo 8019 ${lado}', now() + interval '10 days');
    insert into public.previdenciario_case_documents
      (id, organization_id, case_id, contact_id, kind, file_name, storage_bucket, storage_path, sha256)
      values ('${DOCUMENTO[lado]}', '${org}', '${CASO[lado]}', '${CONTATO[lado]}', 'cnis', 'cnis-${lado}.pdf', 'previdenciario',
              '${org}/cnis-${lado}.pdf', repeat('${lado === "a" ? "a" : "b"}', 64));
    insert into public.previdenciario_case_events (id, organization_id, case_id, kind, actor_kind)
      values ('${EVENTO[lado]}', '${org}', '${CASO[lado]}', 'created', 'system');
    insert into public.previdenciario_catalog_overrides (id, organization_id, catalog_item_id, display_name)
      values ('${SOBRESCRITA[lado]}', '${org}', (select id from public.previdenciario_catalog_items order by stable_key limit 1), 'Sobrescrita 8019 ${lado}');
  `;

  sql(`
    delete from public.organizations where id in ('${ORG_A}', '${ORG_B}');
    insert into auth.users (id, email) values
      ('${AGENTE_A}', 'prev-a@invariant.test'),
      ('${GERENTE_A}', 'prev-ger-a@invariant.test'),
      ('${AGENTE_B}', 'prev-b@invariant.test'),
      ('${FULL}', 'prev-full@invariant.test'),
      ('${READONLY}', 'prev-readonly@invariant.test')
    on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'prev-8019-a', 'Prev 8019 A', 'Prev A'),
      ('${ORG_B}', 'prev-8019-b', 'Prev 8019 B', 'Prev B');
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${AGENTE_A}', '${ORG_A}', 'agent', now()),
      ('${GERENTE_A}', '${ORG_A}', 'manager', now()),
      ('${AGENTE_B}', '${ORG_B}', 'agent', now())
    on conflict do nothing;
    delete from public.platform_admins where user_id in ('${FULL}', '${READONLY}');
    insert into public.platform_admins (user_id, granted_by, scope, mfa_required, reason) values
      ('${FULL}', '${FULL}', 'full', false, 'invariante 8019'),
      ('${READONLY}', '${FULL}', 'support_readonly', false, 'invariante 8019');
    ${semear("a", ORG_A)}
    ${semear("b", ORG_B)}
  `);
});

describe("previdenciário — isolamento entre organizações", () => {
  it.each(TABELAS)("%s: o membro de A lê as linhas de A e ZERO das de B", (tabela, ids) => {
    expect(countAs(AGENTE_A, `select count(*) from public.${tabela} where id = '${ids.a}';`)).toBe(1);
    expect(countAs(AGENTE_A, `select count(*) from public.${tabela} where id = '${ids.b}';`)).toBe(0);
    expect(countAs(AGENTE_B, `select count(*) from public.${tabela} where id = '${ids.a}';`)).toBe(0);
    // Sem filtro, como um cliente do PostgREST pediria a tabela toda: nada da vizinha.
    expect(countAs(AGENTE_A, `select count(*) from public.${tabela} where organization_id = '${ORG_B}';`)).toBe(0);
  });

  it("o agente de A escreve no caso da própria organização (controle positivo) e em 0 do vizinho", () => {
    expect(writeCountAs(AGENTE_A, `update public.previdenciario_cases set title = 'Caso A editado' where id = '${CASO.a}'`)).toBe(1);
    expect(writeCountAs(AGENTE_A, `update public.previdenciario_cases set title = 'invasão' where id = '${CASO.b}'`)).toBe(0);
  });

  it("INSERT em nome da outra organização é recusado pela RLS", () => {
    expect(
      writeCountAs(
        AGENTE_A,
        `insert into public.previdenciario_case_pendencies (organization_id, case_id, kind, title)
           values ('${ORG_B}', '${CASO.b}', 'other', 'invasão')`,
      ),
    ).toBe(0);
  });

  it("sobrescrita do catálogo exige manager: o agente escreve 0; o gerente da própria organização escreve 1", () => {
    expect(writeCountAs(AGENTE_A, `update public.previdenciario_catalog_overrides set display_name = 'x' where id = '${SOBRESCRITA.a}'`)).toBe(0);
    expect(writeCountAs(GERENTE_A, `update public.previdenciario_catalog_overrides set display_name = 'gerente' where id = '${SOBRESCRITA.a}'`)).toBe(1);
    expect(writeCountAs(GERENTE_A, `update public.previdenciario_catalog_overrides set display_name = 'invasão' where id = '${SOBRESCRITA.b}'`)).toBe(0);
  });
});

describe("previdenciário — migration 8019: o support_readonly lê e não escreve; o full escreve", () => {
  it.each(TABELAS.filter(([t]) => t !== "previdenciario_case_events"))("%s: support_readonly LÊ as duas organizações", (tabela, ids) => {
    expect(countAs(READONLY, `select count(*) from public.${tabela} where id in ('${ids.a}', '${ids.b}');`)).toBe(2);
  });

  const ESCRITAS: ReadonlyArray<readonly [string, (alvo: string) => string, (typeof CASO)]> = [
    ["previdenciario_cases", (a) => `update public.previdenciario_cases set title = 'T' where id = '${a}'`, CASO],
    ["previdenciario_case_pendencies", (a) => `update public.previdenciario_case_pendencies set title = 'T' where id = '${a}'`, PENDENCIA],
    ["previdenciario_case_deadlines", (a) => `update public.previdenciario_case_deadlines set title = 'T' where id = '${a}'`, PRAZO],
    ["previdenciario_case_documents", (a) => `update public.previdenciario_case_documents set file_name = 'T.pdf' where id = '${a}'`, DOCUMENTO],
    ["previdenciario_case_stages", (a) => `update public.previdenciario_case_stages set name = 'T' where id = '${a}'`, ETAPA],
    ["previdenciario_catalog_overrides", (a) => `update public.previdenciario_catalog_overrides set display_name = 'T' where id = '${a}'`, SOBRESCRITA],
  ];

  it.each(ESCRITAS)("%s: UPDATE 0 como support_readonly; 1 como full", (_tabela, dml, ids) => {
    expect(writeCountAs(READONLY, dml(ids.a))).toBe(0);
    expect(writeCountAs(READONLY, dml(ids.b))).toBe(0);
    expect(writeCountAs(FULL, dml(ids.a))).toBe(1);
  });

  it("previdenciario_cases: INSERT 0 como support_readonly; 1 como full", () => {
    const linha = (alvo: string) =>
      `insert into public.previdenciario_cases (id, organization_id, contact_id, stage_id, title)
         values ('${alvo}', '${ORG_A}', '${CONTATO.a}', '${ETAPA.a}', 'sonda')`;
    expect(writeCountAs(READONLY, linha("08190819-0099-4000-8000-0000000000a1"))).toBe(0);
    expect(writeCountAs(FULL, linha("08190819-0099-4000-8000-0000000000a2"))).toBe(1);
  });

  it("previdenciario_cases: ninguém apaga pela sessão — authenticated não tem DELETE (o caso arquiva), nem o full", () => {
    // A recusa vem do GRANT (42501 "permission denied"), antes da RLS: não há linha a contar.
    for (const usuario of [READONLY, FULL, AGENTE_A]) {
      expect(() =>
        sql(`
          set role authenticated;
          select set_config('request.jwt.claims', '{"sub":"${usuario}"}', false);
          delete from public.previdenciario_cases where id = '${CASO.a}';
        `),
      ).toThrow(/permission denied/);
    }
    expect(sql(`select count(*) from public.previdenciario_cases where id = '${CASO.a}';`)).toBe("1");
  });

  it("base de conhecimento: UPDATE 0 como support_readonly; 1 como full", () => {
    const alvo = sql("select id from public.previdenciario_pathology_knowledge order by stable_key limit 1;");
    expect(alvo, "a base de conhecimento semeada pelo baseline está vazia").toMatch(/^[0-9a-f-]{36}$/);
    const dml = `update public.previdenciario_pathology_knowledge set updated_at = now() where id = '${alvo}'`;
    expect(writeCountAs(READONLY, dml)).toBe(0);
    expect(writeCountAs(FULL, dml)).toBe(1);
  });
});
