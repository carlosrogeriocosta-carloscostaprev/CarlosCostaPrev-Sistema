import { env } from "@/lib/env";
import { alvoDe, classificarFalhaDeAlcance, type FalhaDeAlcance } from "@/lib/net/alcance";
import { isOptionalEndpointUnconfigured } from "@/lib/health/status";
import { validarConfigRedisRest } from "@/lib/redis-config";

export type IntegrationCheckStatus = "ok" | "degraded" | "down";

export type IntegrationFailureReason =
  | FalhaDeAlcance
  | "credencial_recusada"
  | "resposta_inesperada"
  | "nao_configurado"
  | "configuracao_invalida";

export type IntegrationCheck = {
  status: IntegrationCheckStatus;
  latency_ms: number;
  error?: string;
  reason?: IntegrationFailureReason;
  /** Protocolo + host + porta, nunca credencial ou caminho sensível. */
  target?: string;
};

export type IntegrationChecks = {
  supabase: IntegrationCheck;
  redis: IntegrationCheck;
  waha: IntegrationCheck;
};

const TIMEOUT_MS = 3_000;

async function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}

function motivoDoStatusHttp(status: number): IntegrationFailureReason {
  return status === 401 || status === 403 ? "credencial_recusada" : "resposta_inesperada";
}

async function checkSupabase(): Promise<IntegrationCheck> {
  const t0 = Date.now();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const res = await withTimeout(
      fetch(`${url}/rest/v1/organizations?select=id&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
      }),
    );
    if (res.status === 200 || res.status === 401 || res.status === 403) {
      return { status: "ok", latency_ms: Date.now() - t0, target: alvoDe(url) };
    }
    return {
      status: "down",
      latency_ms: Date.now() - t0,
      error: `http_${res.status}`,
      reason: motivoDoStatusHttp(res.status),
      target: alvoDe(url),
    };
  } catch (error) {
    return {
      status: "down",
      latency_ms: Date.now() - t0,
      error: "request_failed",
      reason: classificarFalhaDeAlcance(error),
      target: alvoDe(url),
    };
  }
}

async function checkRedis(): Promise<IntegrationCheck> {
  const t0 = Date.now();
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  const config = validarConfigRedisRest(url, token);
  if (!config.ok) {
    if (config.reason === "nao_configurado" || isOptionalEndpointUnconfigured(url)) {
      return {
        status: "degraded",
        latency_ms: 0,
        error: "not_configured",
        reason: "nao_configurado",
      };
    }
    return {
      status: "down",
      latency_ms: 0,
      error: "invalid_configuration",
      reason: "configuracao_invalida",
    };
  }
  try {
    const res = await withTimeout(
      fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(["PING"]),
        cache: "no-store",
      }),
    );
    if (!res.ok) {
      return {
        status: "down",
        latency_ms: Date.now() - t0,
        error: `http_${res.status}`,
        reason: motivoDoStatusHttp(res.status),
        target: alvoDe(url),
      };
    }
    return { status: "ok", latency_ms: Date.now() - t0, target: alvoDe(url) };
  } catch (error) {
    return {
      status: "down",
      latency_ms: Date.now() - t0,
      error: "request_failed",
      reason: classificarFalhaDeAlcance(error),
      target: alvoDe(url),
    };
  }
}

async function checkWaha(): Promise<IntegrationCheck> {
  const t0 = Date.now();
  const base = env.WAHA_API_BASE_URL;
  if (!base || isOptionalEndpointUnconfigured(base)) {
    return {
      status: "degraded",
      latency_ms: 0,
      error: "not_configured",
      reason: "nao_configurado",
    };
  }
  try {
    const res = await withTimeout(
      fetch(`${base.replace(/\/$/, "")}/api/sessions`, {
        headers: env.WAHA_API_KEY ? { "X-Api-Key": env.WAHA_API_KEY } : {},
        cache: "no-store",
      }),
    );
    if (!res.ok) {
      return {
        status: "down",
        latency_ms: Date.now() - t0,
        error: `http_${res.status}`,
        reason: motivoDoStatusHttp(res.status),
        target: alvoDe(base),
      };
    }
    return { status: "ok", latency_ms: Date.now() - t0, target: alvoDe(base) };
  } catch (error) {
    return {
      status: "down",
      latency_ms: Date.now() - t0,
      error: "request_failed",
      reason: classificarFalhaDeAlcance(error),
      target: alvoDe(base),
    };
  }
}

export async function checkCriticalIntegrations(): Promise<IntegrationChecks> {
  const [supabase, redis, waha] = await Promise.all([checkSupabase(), checkRedis(), checkWaha()]);
  return { supabase, redis, waha };
}

export function redactIntegrationTargets(checks: IntegrationChecks): IntegrationChecks {
  return Object.fromEntries(
    Object.entries(checks).map(([key, check]) => {
      const { target: _target, ...redacted } = check;
      return [key, redacted];
    }),
  ) as IntegrationChecks;
}

/**
 * O contrato interno histórico ainda usa a chave do transporte legado. A camada
 * acima deve consumir a capacidade neutra de canal, nunca o nome do provider.
 */
export function getMessagingIntegration(checks: IntegrationChecks): IntegrationCheck {
  return checks.waha;
}
