import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";

export type PrevidenciarioStage = {
  id: string;
  stable_key: string;
  name: string;
  description: string | null;
  position: number;
  color: string | null;
  is_terminal: boolean;
  is_active: boolean;
};

export type PrevidenciarioCatalogRef = {
  id: string;
  stable_key: string;
  kind: "benefit" | "service";
  display_name: string;
  official_codes?: string[];
  review_status?: string;
  is_active: boolean;
} | null;

export type PrevidenciarioCaseListItem = {
  id: string;
  title: string;
  status: "open" | "completed" | "archived";
  stage_id: string;
  stage: PrevidenciarioStage;
  benefit_key: string | null;
  service_key: string | null;
  benefit: PrevidenciarioCatalogRef;
  service: PrevidenciarioCatalogRef;
  protocol_number: string | null;
  responsible_user_id: string | null;
  opened_at: string;
  updated_at: string;
  pending_count: number;
  completeness: {
    is_complete: boolean;
    missing: Array<"classification" | "protocol" | "responsible" | "pending">;
  };
};

export type PrevidenciarioCaseBundle = PrevidenciarioCaseListItem & {
  contact_id: string;
  lead_id: string | null;
  source: string;
  completed_at: string | null;
  archived_at: string | null;
  metadata: Record<string, unknown>;
  pendencies: Array<{
    id: string;
    kind: string;
    title: string;
    description: string | null;
    action: string;
    status: "open" | "resolved" | "dismissed";
    due_at: string | null;
    source: string;
    created_at: string;
    resolved_at: string | null;
  }>;
  deadlines: Array<{
    id: string;
    kind: "external" | "internal" | "reminder";
    title: string;
    due_at: string;
    timezone: string;
    status: "open" | "completed" | "cancelled";
    source: string;
    rule_key: string;
  }>;
  documents: Array<{
    id: string;
    kind: string;
    file_name: string;
    storage_bucket: string;
    storage_path: string;
    version: number;
    review_status: "draft" | "needs_review" | "approved" | "rejected";
    uploaded_at: string;
  }>;
  events: Array<{
    id: string;
    kind: string;
    actor_kind: string;
    body: string | null;
    created_at: string;
  }>;
};

type Envelope<T> = { data: T; meta?: { has_more?: boolean; count?: number } };

export type PrevidenciarioCaseFilters = {
  status?: "open" | "completed" | "archived";
  stage_id?: string;
  search?: string;
};

export type CreatePrevidenciarioCaseInput = {
  contact_id: string;
  title: string;
  benefit_key?: string | null;
  service_key?: string | null;
  protocol_number?: string | null;
  responsible_user_id?: string | null;
};

export function usePrevidenciarioCases(filters: PrevidenciarioCaseFilters = {}) {
  return useQuery({
    queryKey: ["previdenciario-cases", filters],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (filters.status) params.set("status", filters.status);
      if (filters.stage_id) params.set("stage_id", filters.stage_id);
      if (filters.search) params.set("search", filters.search);
      return apiClient.get<Envelope<PrevidenciarioCaseListItem[]>>(
        `/api/v1/previdenciario/cases?${params.toString()}`,
      );
    },
  });
}

export function usePrevidenciarioStages() {
  return useQuery({
    queryKey: ["previdenciario-case-stages"],
    queryFn: async () => apiClient.get<Envelope<PrevidenciarioStage[]>>("/api/v1/previdenciario/case-stages"),
  });
}

export function usePrevidenciarioCase(caseId: string | null) {
  return useQuery({
    queryKey: ["previdenciario-case", caseId],
    enabled: Boolean(caseId),
    queryFn: async () =>
      apiClient.get<Envelope<PrevidenciarioCaseBundle>>(`/api/v1/previdenciario/cases/${caseId}`),
  });
}

export function useCreatePrevidenciarioCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePrevidenciarioCaseInput) =>
      apiClient.post<Envelope<PrevidenciarioCaseBundle>>("/api/v1/previdenciario/cases", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["previdenciario-cases"] });
    },
    onError: showApiError,
  });
}

export function useTransitionPrevidenciarioCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, to_stage_id, note }: { caseId: string; to_stage_id: string; note?: string }) =>
      apiClient.post<Envelope<PrevidenciarioCaseBundle>>(
        `/api/v1/previdenciario/cases/${caseId}/transition`,
        { to_stage_id, note: note ?? null },
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["previdenciario-cases"] });
      void queryClient.invalidateQueries({ queryKey: ["previdenciario-case", variables.caseId] });
    },
    onError: showApiError,
  });
}

export function useCreatePrevidenciarioDeadline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, title, due_at, kind = "internal" }: { caseId: string; title: string; due_at: string; kind?: "external" | "internal" | "reminder" }) =>
      apiClient.post<Envelope<unknown>>(`/api/v1/previdenciario/cases/${caseId}/prazos`, {
        title,
        due_at,
        kind,
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["previdenciario-case", variables.caseId] });
      void queryClient.invalidateQueries({ queryKey: ["previdenciario-cases"] });
    },
    onError: showApiError,
  });
}

export function useCreatePrevidenciarioDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, kind, file }: { caseId: string; kind: string; file: File }) => {
      const form = new FormData();
      form.set("kind", kind);
      form.set("source", "manual");
      form.set("metadata", JSON.stringify({}));
      form.set("file", file);

      const requestId = crypto.randomUUID();
      const response = await fetch(`/api/v1/previdenciario/cases/${caseId}/documentos`, {
        method: "POST",
        body: form,
        credentials: "same-origin",
        headers: { Accept: "application/json", "X-Request-Id": requestId, "Idempotency-Key": requestId },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { code?: string; details?: Record<string, unknown>; message?: string; request_id?: string } } | null;
        throw new ApiError(
          response.status,
          body?.error?.code ?? "internal_error",
          body?.error?.details,
          body?.error?.request_id ?? requestId,
          body?.error?.message ?? `Falha ao enviar o documento (${response.status}).`,
        );
      }
      return response.json() as Promise<Envelope<unknown>>;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["previdenciario-case", variables.caseId] });
    },
    onError: showApiError,
  });
}

export function useDownloadPrevidenciarioDocument() {
  return useMutation({
    mutationFn: ({ caseId, documentId }: { caseId: string; documentId: string }) =>
      apiClient.get<Envelope<{ document_id: string; file_name: string; url: string; expires_at: string }>>(
        `/api/v1/previdenciario/cases/${caseId}/documentos/${documentId}/download`,
      ),
    onError: showApiError,
  });
}

export function useReviewPrevidenciarioDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, documentId, review_status }: { caseId: string; documentId: string; review_status: "draft" | "needs_review" | "approved" | "rejected" }) =>
      apiClient.patch<Envelope<unknown>>(`/api/v1/previdenciario/cases/${caseId}/documentos/${documentId}`, { review_status }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["previdenciario-case", variables.caseId] });
    },
    onError: showApiError,
  });
}

export function useUpdatePrevidenciarioPendency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, pendencyId, status, note }: { caseId: string; pendencyId: string; status: "resolved" | "dismissed"; note?: string }) =>
      apiClient.patch<Envelope<unknown>>(
        `/api/v1/previdenciario/cases/${caseId}/pendencias/${pendencyId}`,
        { status, note: note ?? null },
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["previdenciario-case", variables.caseId] });
      void queryClient.invalidateQueries({ queryKey: ["previdenciario-cases"] });
    },
    onError: showApiError,
  });
}
