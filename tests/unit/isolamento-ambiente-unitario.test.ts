/**
 * A BARREIRA DO AMBIENTE SINTÉTICO É TESTE, NÃO CONVENÇÃO.
 *
 * O isolamento B4 (definido no PRD futuro, §9 F2: "testes unitários sem `.env`
 * real, sem rede e sem banco") só vale se for impossível REGREDIR sem a suíte
 * ficar vermelha. Este arquivo é a régua:
 *
 *   1. O setup não pode ler `.env`/`.env.local` — se a leitura voltar, a suíte
 *      volta a herdar credencial de produção sem avisar ninguém.
 *   2. Os placeholders do setup devem estar em `process.env` — se a semeadura
 *      virar `??=` de novo, um shell com credencial exportada vence o sintético.
 *   3. Nenhuma variável de destino pode apontar para host real conhecido —
 *      `*.supabase.co` e `*.upstash.io` num teste unitário são sempre acidente.
 *
 * O terceiro item é o unico contact possível entre um dev distraído e dados de
 * clientes durante uma run de teste: ele tem que estar no teste, nao num wiki.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");

const VARS_DE_DESTINO = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_DB_URL",
  "UPSTASH_REDIS_REST_URL",
  "WAHA_API_BASE_URL",
  "WAHA_WEBHOOK_BASE_URL",
] as const;

/** Hosts que identificam infraestrutura REAL. `.invalid`/loopback são seguros. */
const HOST_REAL = [/\.supabase\.co/i, /\.upstash\.com/i];

describe("a suíte unitária roda em ambiente sintético", () => {
  it("o setup do vitest não lê .env do disco", () => {
    // Leitura estática do próprio setup — o mesmo truque de
    // `seed-nao-le-env-local-do-disco.test.ts`: regex no fonte é barata,
    // roda em milissegundos e não depende do estado do processo.
    const setup = readFileSync(join(RAIZ, "tests", "setup", "vitest.setup.ts"), "utf8");
    const leEnv = /readFileSync[\s\S]{0,120}?\.env(?!\.)/
      .test(setup);
    expect(
      leEnv,
      "tests/setup/vitest.setup.ts voltou a ler .env/.env.local do disco. " +
        "Isso reintroduz credencial real na suíte unitária — ver o isolamento " +
        "sintético (PRD futuro, F2) e o cabeçalho do setup.",
    ).toBe(false);
  });

  it("os placeholders do Supabase foram semeados com sobrescrita", () => {
    // Não testamos o valor exato para não acoplar ao texto; testamos a
    // PROPRIEDADE: o host é o reservado pela RFC 2606, nunca algo utilizável.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    expect(
      url.endsWith(".invalid"),
      `NEXT_PUBLIC_SUPABASE_URL="${url}" não é o placeholder sintético. ` +
        "Se um valor real chegou aqui, o setup perdeu a semeadura forte e a " +
        "suíte está rodando contra o ambiente de quem a executou.",
    ).toBe(true);
  });

  it("NODE_ENV é test", () => {
    expect(process.env.NODE_ENV).toBe("test");
  });

  it.each(VARS_DE_DESTINO)("nenhum destino real vazou em %s", (nome) => {
    const valor = process.env[nome] ?? "";
    if (valor === "") return; // ausente é seguro: a chamada falha alto.
    for (const re of HOST_REAL) {
      expect(
        re.test(valor),
        `${nome}="${valor.replace(/:\/\/[^@]*@/, "://***@")}" aponta para um host REAL. ` +
          "Teste unitário não pode herdar destino de produção — defina um valor " +
          "sintético no setup ou apague a variável do ambiente antes de rodar.",
      ).toBe(false);
    }
  });
});
