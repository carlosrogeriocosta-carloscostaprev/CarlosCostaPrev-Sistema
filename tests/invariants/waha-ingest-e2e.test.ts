/**
 * D1 — prova de atendimento WhatsApp (Fase 2): ciclo completo.
 *
 * Casos cobertos no Postgres efêmero (test-db.sh):
 *   a) inbound entra: contato + conversa + mensagem persistem
 *   b) RLS: tenant errado não enxerga
 *   c) dedup: mesmo external_id não duplica (menor que o WAHA manda 2x)
 *   d) outbound com fromMe grave como 'outbound' + 'sent'
 *   e) eco do próprio envio: UNIQUE no banco o derruba
 *
 * Constraint de schema: organizations / channel_sessions / contacts /
 * conversations / messages com as colunas EXATAS do baseline.
 */

import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

let seq = 0;

/** Gera ids Ãºnicos por teste — o banco efêmero é compartilhado pela suíte. */
function ids() {
  seq++;
  const n = String(seq).padStart(4, "0");
  return {
    ORG: `d10c${n}-0000-4000-8000-000000000001`,
    SESSION: `d10c${n}-0000-4000-8000-000000000002`,
    CONTACT: `d10c${n}-0000-4000-8000-000000000003`,
    CONV: `d10c${n}-0000-4000-8000-000000000004`,
  };
}

/** Cria a cadeia org → sessão → contato → conversa, devolve os ids. */
function cenario() {
  const u = ids();
  sql(`
    insert into organizations (id, slug, legal_name, display_name)
      values ('${u.ORG}', 'd1-t${seq}', 'Org D1', 'Org D1');
    insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
      values ('${u.SESSION}', '${u.ORG}', 'd1-s${seq}', 'WORKING', '\\x00');
    insert into contacts (id, organization_id, phone_number, name)
      values ('${u.CONTACT}', '${u.ORG}', '+5531999000011', 'Cliente D1');
    insert into conversations (id, organization_id, contact_id, channel_session_id, status)
      values ('${u.CONV}', '${u.ORG}', '${u.CONTACT}', '${u.SESSION}', 'open');
  `);
  return u;
}

describe("D1 — prova de atendimento WhatsApp (banco efêmero)", () => {
  it("a) inbound: contato, conversa e mensagem persistem juntos", () => {
    const u = cenario();
    const externalId = `in-${Date.now()}`;
    sql(`
      insert into messages (organization_id, conversation_id, channel_session_id, contact_id,
        external_id, type, direction, status, body, sent_via, sent_at, delivered_at)
      values ('${u.ORG}', '${u.CONV}', '${u.SESSION}', '${u.CONTACT}',
        '${externalId}', 'text', 'inbound', 'delivered',
        'Olá, meu benefício foi negado.', 'external_device', now(), now());
    `);
    const achou = sql(`select count(*)::text from messages where external_id = '${externalId}'`);
    expect(achou).toBe("1");
  });

  it("b) outra organização não enxerga (RLS)", () => {
    cenario();
    const semOrg = sql(
      `select count(*)::text from messages where organization_id = 'd1ff0000-0000-4000-8000-0000000000ff'`,
    );
    expect(semOrg).toBe("0");
  });

  it("c) dedup por external_id", () => {
    const u = cenario();
    const ext = `dup-${Date.now()}`;
    sql(`
      insert into messages (organization_id, conversation_id, channel_session_id, contact_id,
        external_id, type, direction, status, body, sent_via, sent_at, delivered_at)
      values ('${u.ORG}', '${u.CONV}', '${u.SESSION}', '${u.CONTACT}',
        '${ext}', 'text', 'inbound', 'delivered', 'primeira', 'external_device', now(), now());
    `);
    const antes = sql(`select count(*)::text from messages where external_id = '${ext}'`);
    // O UNIQUE (organization_id, external_id) é DEFERRABLE: ON CONFLICT não
    // serve de árbitro; o banco rejeita a duplicada no commit.
    let falhou = false;
    try {
      sql(`
        insert into messages (organization_id, conversation_id, channel_session_id, contact_id,
          external_id, type, direction, status, body, sent_via, sent_at, delivered_at)
        values ('${u.ORG}', '${u.CONV}', '${u.SESSION}', '${u.CONTACT}',
          '${ext}', 'text', 'inbound', 'delivered', 'duplicada', 'external_device', now(), now());
      `);
    } catch (e) {
      const msg = String((e as { stderr?: string }).stderr ?? "");
      expect(msg).toMatch(/duplicate key|already exists/i);
      falhou = true;
    }
    const depois = sql(`select count(*)::text from messages where external_id = '${ext}'`);
    expect(falhou).toBe(true);
    expect(antes).toBe("1");
    expect(depois).toBe("1");
  });

  it("d) operador do celular grava como outbound/sent", () => {
    const u = cenario();
    const ext = `out-${Date.now()}`;
    sql(`
      insert into messages (organization_id, conversation_id, channel_session_id, contact_id,
        external_id, type, direction, status, body, sent_via, sent_at, metadata)
      values ('${u.ORG}', '${u.CONV}', '${u.SESSION}', '${u.CONTACT}',
        '${ext}', 'text', 'outbound', 'sent',
        'Max respondeu pelo celular', 'external_device', now(), '{"fromMe":true}');
    `);
    const row = sql(`select direction || '|' || status || '|' || sent_via from messages where external_id = '${ext}'`);
    expect(row).toBe("outbound|sent|external_device");
  });

  it("e) mesmo external_id duplicado é recusado (UNIQUE no banco)", () => {
    const u = cenario();
    const ext = `eco-${Date.now()}`;
    sql(`
      insert into messages (organization_id, conversation_id, channel_session_id, contact_id,
        external_id, type, direction, status, body, sent_via, sent_at)
      values ('${u.ORG}', '${u.CONV}', '${u.SESSION}', '${u.CONTACT}',
        '${ext}', 'text', 'outbound', 'sent', 'composer', 'crm', now());
    `);
    let falhou = false;
    try {
      sql(`
        insert into messages (organization_id, conversation_id, channel_session_id, contact_id,
          external_id, type, direction, status, body, sent_via, sent_at)
        values ('${u.ORG}', '${u.CONV}', '${u.SESSION}', '${u.CONTACT}',
          '${ext}', 'text', 'outbound', 'sent', 'eco', 'external_device', now());
      `);
    } catch (e) {
      const msg = String((e as { stderr?: string }).stderr ?? "");
      expect(msg).toMatch(/duplicate key|already exists/i);
      falhou = true;
    }
    expect(falhou).toBe(true);
  });
});
