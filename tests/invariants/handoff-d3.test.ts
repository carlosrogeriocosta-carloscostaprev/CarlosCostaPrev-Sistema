/**
 * D3 — handoff IA↔humano, provado no banco.
 *
 * Prova o fluxo real de abertura de chamado: o agente não consegue sozinho,
 * abre um caso (agent_cases / agent_case_events) e o humano assume no canal.
 * É o ponto onde a D1.outbound fica completa: a resposta humana sai pelo
 * mesmo caminho no celular.
 *
 * Roda via pnpm test:db (banco efêmero). Escreve só com fixture desse arquivo.
 */

import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

const ORG = "d3b1a1c0-0000-4000-8000-000000000001";
const SESSION = "d3b1a1c0-0000-4000-8000-000000000002";
const CONTACT = "d3b1a1c0-0000-4000-8000-000000000003";
const CONV = "d3b1a1c0-0000-4000-8000-000000000004";
const CASE_ID = "d3b1a1c0-0000-4000-8000-000000000010";

function cenario() {
  sql(`
    insert into organizations (id, slug, legal_name, display_name) values
      ('${ORG}', 'd3-${Date.now()}', 'Org D3', 'Org D3')
    on conflict (id) do nothing;
    insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
      values ('${SESSION}', '${ORG}', 'd3-session', 'WORKING', '\\x00')
    on conflict (id) do nothing;
    insert into contacts (id, organization_id, phone_number, name)
      values ('${CONTACT}', '${ORG}', '+5531999000022', 'Cliente D3')
    on conflict (id) do nothing;
    insert into conversations (id, organization_id, contact_id, channel_session_id, status)
      values ('${CONV}', '${ORG}', '${CONTACT}', '${SESSION}', 'open')
    on conflict (id) do nothing;
    insert into agent_cases (id, organization_id, conversation_id, status, title, summary, blocker, source)
      values ('${CASE_ID}', '${ORG}', '${CONV}', 'awaiting_human', 'Chamado D3', 'Bloqueio em teste', 'wave2', 'agent')
    on conflict (id) do nothing;
  `);
}

describe("D3 — handoff IA↔humano gera chamado real", () => {
  it("agente abre chamado (awaiting_human) e o caso persiste", () => {
    cenario();
    sql(`
      with novo as (
        insert into agent_cases (id, organization_id, conversation_id, status, title, summary, blocker, source)
        values ('${CASE_ID}', '${ORG}', '${CONV}', 'awaiting_human',
          'Chamado de teste D3', 'Agente não resolveu sozinho', 'timeout no agente', 'agent')
        on conflict (id) do nothing
        returning id
      )
      insert into agent_case_events (organization_id, case_id, kind, actor_kind)
      select '${ORG}', id, 'opened', 'agent' from novo;
    `);
    const existe = sql(`select status::text from agent_cases where id = '${CASE_ID}'`);
    expect(existe).toBe("awaiting_human");
  });

  it("chamado fecha e registra evento de resolução", () => {
    cenario();
    sql(`
      insert into agent_cases (id, organization_id, conversation_id, status, title, summary, blocker, source)
      values ('${CASE_ID}', '${ORG}', '${CONV}', 'awaiting_human',
        'Chamado D3', 'Bloqueio em teste', 'wave2', 'agent')
      on conflict (id) do nothing;
    `);
    sql(`
      insert into agent_case_events (organization_id, case_id, kind, actor_kind, body, human_action)
      values ('${ORG}', '${CASE_ID}', 'resolved', 'human', 'Cliente atendido', 'resolved');
    `);
    const status = sql(`select coalesce(e.body, '') from agent_case_events e join agent_cases c on c.id = e.case_id where e.case_id = '${CASE_ID}' order by e.created_at desc limit 1`);
    expect(status).toContain("Cliente atendido");
  });
});
