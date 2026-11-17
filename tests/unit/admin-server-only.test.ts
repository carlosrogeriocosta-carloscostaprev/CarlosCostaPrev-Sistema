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
 * O que este teste guarda, em duas frentes:
 *   1. `admin.ts` carrega `import "server-only"` — o Next derruba o BUILD se o
 *      arquivo entrar no grafo de um Client Component.
 *   2. Nenhum arquivo com `"use client"` importa o admin DIRETAMENTE — a rede
 *      de segurança estática para quem desviar da barreira 1 (ex.: alguém
 *      remove a linha para "destravar um build").
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
  it("admin.ts carrega a barreira `server-only` (o build morre se ela sair)", () => {
    const admin = readFileSync(join(RAIZ, "lib", "supabase", "admin.ts"), "utf8");
    expect(
      /import\s+["']server-only["']/.test(admin),
      "lib/supabase/admin.ts perdeu o `import \"server-only\"` — a barreira de " +
        "build que impede a service role de entrar num Client Component sumiu.",
    ).toBe(true);
  });

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
