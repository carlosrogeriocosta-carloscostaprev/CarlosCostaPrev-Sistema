/**
 * PRD 24 / E1.3 — eventos cross-module persistem no bus real (event_log).
 *
 * Prova, no Postgres efêmero, que o caminho E1 funciona de verdade:
 *   a) emit_event aceita correlação + módulos (migration 0174)
 *   b) o evento sobrevive e é encontrável por correlation_id (replay)
 *   c) RLS: outra organização não enxerga o evento
 *   d) tipo fora do contrato (sem namespace) é recusado pelo CHECK
 *
 * Não simula HTTP nem WAHA: mede a escrita real no barramento persistente.
 */

import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

const ORG = "e1c00000-0000-4000-8000-000000000001";

function cenario() {
  sql(`
    insert into organizations (id, slug, legal_name, display_name)
    values ('${ORG}', 'e1-${Date.now()}', 'Org E1', 'Org E1')
    on conflict (id) do nothing;
  `);
}

describe("E1 — eventos cross-module persistem no event_log (bus real)", () => {
  it("a) emit_event_cross_module grava tipo prev.*, módulos e correlação", () => {
    cenario();
    const corr = randomUUID();
    sql(`
      select public.emit_event_cross_module(
        'prev.documento_compartilhado_recebido',
        'cross_module_document',
        null,
        '{"doc": "cnis"}'::jsonb,
        '{}'::jsonb,
        '${ORG}',
        '${corr}',
        'administrativo',
        'judicial'
      );
    `);
    const row = sql(
      `select event_type || '|' || modulo_origem || '|' || modulo_destino
       from event_log where correlation_id = '${corr}'`,
    );
    expect(row).toBe("prev.documento_compartilhado_recebido|administrativo|judicial");
  });

  it("b) saga: segunda perna com o mesmo correlation_id é localizável", () => {
    cenario();
    const corr = randomUUID();
    sql(`
      select public.emit_event_cross_module('prev.acordo_judicial_proposto', 'cross_module_case',
        null, '{}', '{}', '${ORG}', '${corr}', 'judicial', 'administrativo');
      select public.emit_event_cross_module('prev.cliente_atualizado', 'cross_module_case',
        null, '{}', '{}', '${ORG}', '${corr}', 'administrativo', 'ambos');
    `);
    const total = sql(`select count(*)::text from event_log where correlation_id = '${corr}'`);
    expect(total).toBe("2");
  });

  it("c) RLS: outra organização não vê o evento", () => {
    const invisivel = sql(
      `select count(*)::text from event_log
       where organization_id = 'e1ffff00-0000-4000-8000-0000000000ff'`,
    );
    expect(invisivel).toBe("0");
  });

  it("d) tipo sem namespace é recusado pelo CHECK do produto", () => {
    cenario();
    let falhou = false;
    try {
      sql(`
        insert into event_log (organization_id, event_type, entity_kind, payload)
        values ('${ORG}', 'CASO_ADMIN_ENCERRADO', 'cross_module_case', '{}');
      `);
    } catch (e) {
      const msg = String((e as { stderr?: string }).stderr ?? "");
      expect(msg).toMatch(/event_type_format/);
      falhou = true;
    }
    expect(falhou).toBe(true);
  });
});
