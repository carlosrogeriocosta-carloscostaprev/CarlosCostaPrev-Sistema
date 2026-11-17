"use server";

import { redirect } from "next/navigation";

import { audit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";

export type CancelMfaEnrollResult = { ok: true; removed: number } | { ok: false; message: string };

/**
 * Descarta somente fatores TOTP ainda não verificados.
 *
 * O QR Code de um enrollment cancelado não pode continuar válido para uma
 * tentativa posterior. Fatores já verificados nunca são removidos por este
 * caminho; a desativação da conta tem uma ação separada e exige AAL2.
 */
export async function cancelMfaEnroll(): Promise<CancelMfaEnrollResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) {
    return { ok: false, message: "Não foi possível cancelar a configuração agora." };
  }

  let removed = 0;
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type !== "totp" || factor.status !== "unverified") {
      continue;
    }

    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) {
      return { ok: false, message: "Não foi possível invalidar este QR Code agora." };
    }
    removed += 1;
  }

  await audit({
    action: "auth.mfa_enrollment_cancelled",
    actorUserId: user.id,
    metadata: { unverified_factors_removed: removed },
  });

  return { ok: true, removed };
}
