/**
 * O RECOVERY CODE NÃO PODE SER FORÇA BRUTA — auditoria B2 (C4, 2026-08-31).
 *
 * `useRecoveryCode` é o ÚNICO caminho público com service role: quem acerta o
 * código de 8 chars tem TODOS os fatores TOTP da conta apagados. Antes da C4
 * não havia teto de tentativas — só um delay de 200ms por miss. 36^8 com
 * 200ms dá ~178 anos por IP, mas o ataque distribuído (muitos IPs, mesma
 * conta) não paga esse preço: o que o barre é o contador por E-MAIL.
 *
 * O que este teste guarda: quando o rate limit dispara, a action devolve o
 * MESMO erro genérico de sempre (`invalid_or_used`) e NÃO chega a abrir o
 * client admin — o atacante não aprende nem que existe limite, e a conta
 * não gasta nada além do contador.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const rateLimited = vi.fn();

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (nome: string) =>
      nome === "x-forwarded-for" ? "203.0.113.7" : nome === "x-request-id" ? "req-1" : null,
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => {
    throw new Error("admin client NÃO pode ser criado quando rate limited");
  }),
}));
vi.mock("@/lib/audit", () => ({
  audit: vi.fn(async () => {}),
  isServiceRoleConfigured: () => true,
}));
vi.mock("@/lib/auth/recovery-codes", () => ({
  hashRecoveryCode: (code: string) => `hash:${code}`,
  // A matriz v1.109.0 normaliza o código (maiúsculas, sem separador) ANTES de
  // validar; a action passou a importar esta função, então o mock precisa dela.
  normalizeRecoveryCode: (code: string) => code.trim().toUpperCase(),
}));
vi.mock("@/lib/auth/rate-limit", () => ({
  authRateLimited: (...args: unknown[]) => rateLimited(...args),
  AUTH_LIMITS: { recovery_code: { ip: 10, id: 3, windowSec: 3600 } },
}));

const { useRecoveryCode } = await import("@/app/actions/auth/useRecoveryCode");

const INPUT = { email: "vitima@example.com", code: "ABCD1234" };

describe("useRecoveryCode — rate limit antes do service role", () => {
  beforeEach(() => {
    rateLimited.mockReset();
  });

  it("limite estourado devolve o erro GENÉRICO (não vaza que há limite)", async () => {
    rateLimited.mockResolvedValue(true);
    const r = await useRecoveryCode(INPUT);
    expect(r).toEqual({ ok: false, error: "invalid_or_used" });
  });

  it("o bucket é o de recovery_code, contado por e-mail", async () => {
    rateLimited.mockResolvedValue(true);
    await useRecoveryCode(INPUT);
    expect(rateLimited).toHaveBeenCalledWith(
      "recovery_code",
      "vitima@example.com",
      { ip: 10, id: 3, windowSec: 3600 },
    );
  });

  it("input inválido nem consulta o contador (parse falha antes)", async () => {
    const r = await useRecoveryCode({ email: "nao-e-email", code: "x" });
    expect(r).toEqual({ ok: false, error: "invalid_or_used" });
    expect(rateLimited).not.toHaveBeenCalled();
  });
});

describe("AUTH_LIMITS.recovery_code — o teto não pode ser afrouxado em silêncio", () => {
  it("permanece fechado: 3 tentativas por e-mail por hora", async () => {
    // Sem este caso, alguém "corrige" o limite para 100 e a proteção some com
    // a suíte verde. Se a decisão de produto mudar, o número muda aqui JUNTO.
    const { AUTH_LIMITS } = await import("@/lib/auth/rate-limit");
    expect(AUTH_LIMITS.recovery_code).toEqual({ ip: 10, id: 3, windowSec: 3600 });
  });
});
