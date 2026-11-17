/**
 * O ADMIN CLIENT É CERCADO POR MÁQUINA, NÃO POR CONVÊNIO — C6 da auditoria B2.
 *
 * `lib/supabase/admin.ts` cria o client de service role: bypassa RLS e ignora
 * qualquer fronteira de tenant. A auditoria mediu que a barreira entre ele e o
 * navegador era só uma instrução escrita — nenhum mecanismo impedia um
 * `import { createAdminClient }` dentro de um Client Component, e o resultado
 * seria a chave service-role indo para o bundle que todo visitante baixa.
 *
 * O defeito é fácil de cometer de verdade: um componente Client que precisa de
 * "só mais um dado" e o copilot sugere o import que já existe. O build passa,
 * o preview passa, e a chave sai no JS público com a suíte verde.
 *
 * O que este teste guarda: nenhum arquivo com `"use client"` importa o admin
 * DIRETAMENTE (varredura estática).
 *
 * ATUALIZAÇÃO de 17/11/2026 (atualização para a matriz v1.109.0): a primeira
 * frente, que exigia `import "server-only"` em `admin.ts`, SAIU. O worker do
 * `event_log` carrega o admin sob `tsx`, que não resolve `server-only` (o pacote
 * nem é dependência), e `drain-loop-carrega-deps-sob-tsx.test.ts`, da matriz,
 * reprovou. Ficou só a varredura estática, que não depende do pacote. A barreira
 * de build pode voltar por uma regra de lint (`no-restricted-imports`), sem tocar
 * no worker. Registro: docs/CAMADA-CARLOSCOSTAPREV.md.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");

/** Pastas varridas — as que abrigam componentes com "use client". */
const ALVOS = ["app", "components", "lib"];

function* arquivosTs(dir: string): Generator<string> {
  let entrada;
  try {
    entrada = readdirSync(dir);
  } catch {
    return;
  }
  for (const nome of entrada) {
    if (nome === "node_modules" || nome.startsWith(".")) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      yield* arquivosTs(caminho);
    } else if (/\.(ts|tsx)$/.test(nome)) {
      yield caminho;
    }
  }
}

const IMPORT_ADMIN = /from\s+["']@\/lib\/supabase\/admin["']/;
const USE_CLIENT = /^["']use client["']/m;

describe("o client de service role nunca chega ao navegador", () => {
  it("nenhum arquivo 'use client' importa o admin diretamente", () => {
    const infratores: string[] = [];
    for (const alvo of ALVOS) {
      for (const arquivo of arquivosTs(join(RAIZ, alvo))) {
        // Testes e arquivos de teste adjacentes nunca vão ao bundle do cliente.
        if (/\.(test|spec)\.(ts|tsx)$/.test(arquivo)) continue;
        const src = readFileSync(arquivo, "utf8");
        if (USE_CLIENT.test(src) && IMPORT_ADMIN.test(src)) {
          infratores.push(arquivo.replace(RAIZ, ""));
        }
      }
    }
    expect(
      infratores,
      "Client Component importando @/lib/supabase/admin: a service role iria " +
        "para o bundle do navegador. Use uma rota/route handler no servidor.",
    ).toEqual([]);
  });

  it("o detector realmente encontra a violação (controle negativo)", () => {
    // Sem a guarda de vacuidade, um regex quebrado faria o teste acima passar
    // medindo nada — o verde vazio que a doutrina proíbe.
    const sabotado = '"use client";\nimport { createAdminClient } from "@/lib/supabase/admin";\n';
    expect(USE_CLIENT.test(sabotado)).toBe(true);
    expect(IMPORT_ADMIN.test(sabotado)).toBe(true);
  });
});
