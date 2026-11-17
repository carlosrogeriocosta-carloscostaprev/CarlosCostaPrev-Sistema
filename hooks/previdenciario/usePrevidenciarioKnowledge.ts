import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { showApiError } from '@/components/feedback/ApiErrorToast';
import { apiClient } from '@/lib/api/client';

export type KnowledgeReviewStatus = 'draft' | 'needs_review' | 'approved' | 'rejected' | 'archived';

type Envelope<T> = { data: T; meta?: { has_more?: boolean; total?: number | null } };

export type BenefitHypothesisView = {
  benefitKey: string;
  hypothesis: string;
  sourceRef: string | null;
  reviewStatus: KnowledgeReviewStatus;
};

export type PathologyReviewHistoryView = {
  id: string;
  pathologyKnowledgeId: string;
  previousStatus: KnowledgeReviewStatus;
  nextStatus: KnowledgeReviewStatus;
  editorialSummary: string | null;
  benefitHypotheses: BenefitHypothesisView[];
  reviewNote: string | null;
  reviewerUserId: string | null;
  requestId: string | null;
  createdAt: string;
};

export type PathologyKnowledgeView = {
  id: string;
  stableKey: string;
  displayName: string;
  category: string;
  aliases: string[];
  medicalClassification: {
    cid10: string[];
    cid11: string[];
    sourceKind: string;
    sourceRef: string | null;
    sourceVersion: string | null;
    reviewStatus: KnowledgeReviewStatus;
  };
  functionalFramework: {
    cif: {
      bodyFunctions: string[];
      bodyStructures: string[];
      activitiesParticipation: string[];
      environmentalFactors: string[];
    };
    ifbra: {
      instrumentVersion: string | null;
      domains: string[];
      activities: string[];
      sourceRef: string | null;
      reviewStatus: KnowledgeReviewStatus;
    };
  };
  clinicalContent: {
    educationalSummary?: string | null;
    documentHints?: string[];
    hasMedicationContent?: boolean;
    hasPrognosisContent?: boolean;
    hasDiagnosticContent?: boolean;
    hasRedFlagContent?: boolean;
  };
  editorialSummary: string | null;
  benefitHypotheses: BenefitHypothesisView[];
  serviceLinks: string[];
  provenance: {
    sourceRepo: string;
    sourcePath: string;
    sourceLine: number | null;
    importedAt: string;
    snapshotSha256: string;
  };
  review: {
    status: KnowledgeReviewStatus;
    reviewerUserId: string | null;
    reviewedAt: string | null;
    note: string | null;
  };
};

export type PathologyDetailView = {
  item: PathologyKnowledgeView;
  history: PathologyReviewHistoryView[];
  disclaimer: string;
};

export type IfbraView = {
  instrumentVersion: string | null;
  domains: Array<{
    key: string;
    label: string;
    description: string;
    items: Array<{ code: string; label: string; reviewStatus: string }>;
  }>;
  qualifiers: Array<{ value: number; label: string; range: string; reviewStatus: string }>;
  disclaimer: string;
};

export type LegislationView = {
  items: Array<{
    id: string;
    benefitCatalogItemId: string;
    legalSourceId: string;
    provisionRef: string;
    relationType: string;
    summary: string;
    caseDateRule: string | null;
    reviewStatus: KnowledgeReviewStatus;
    confidence: string;
    review: { reviewerUserId: string | null; reviewedAt: string | null; note: string | null };
    source: {
      key?: string;
      title?: string;
      type?: string;
      officialUrl?: string;
      accessedAt?: string;
      version?: string | null;
      reviewStatus?: string;
    } | null;
  }>;
  disclaimer: string;
};

export function usePrevidenciarioPathologies(filters: {
  search?: string;
  category?: string;
  reviewStatus?: KnowledgeReviewStatus;
} = {}) {
  return useQuery({
    queryKey: ['previdenciario-knowledge-pathologies', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.category) params.set('category', filters.category);
      if (filters.reviewStatus) params.set('reviewStatus', filters.reviewStatus);
      return apiClient.get<Envelope<{ items: PathologyKnowledgeView[] }>>(
        `/api/v1/previdenciario/knowledge/pathologies?${params.toString()}`,
      );
    },
  });
}

export function usePrevidenciarioPathology(stableKey: string | null) {
  return useQuery({
    queryKey: ['previdenciario-knowledge-pathology', stableKey],
    enabled: Boolean(stableKey),
    queryFn: () =>
      apiClient.get<Envelope<PathologyDetailView>>(
        `/api/v1/previdenciario/knowledge/pathologies/${encodeURIComponent(stableKey ?? '')}`,
      ),
  });
}

export function usePrevidenciarioIfbra() {
  return useQuery({
    queryKey: ['previdenciario-knowledge-ifbra'],
    queryFn: () => apiClient.get<Envelope<IfbraView>>('/api/v1/previdenciario/knowledge/ifbra'),
  });
}

export function usePrevidenciarioLegislation(benefitKey?: string) {
  return useQuery({
    queryKey: ['previdenciario-knowledge-legislation', benefitKey],
    queryFn: async () => {
      const params = benefitKey ? `?benefitKey=${encodeURIComponent(benefitKey)}` : '';
      return apiClient.get<Envelope<LegislationView>>(
        `/api/v1/previdenciario/knowledge/legislation${params}`,
      );
    },
  });
}

export function useReviewPrevidenciarioPathology() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      stableKey: string;
      reviewStatus: KnowledgeReviewStatus;
      reviewNote?: string | null;
      editorialSummary?: string | null;
      benefitHypotheses?: BenefitHypothesisView[];
    }) =>
      apiClient.patch<Envelope<{ item: PathologyKnowledgeView; history: PathologyReviewHistoryView }>>(
        `/api/v1/previdenciario/knowledge/pathologies/${encodeURIComponent(input.stableKey)}/review`,
        {
          reviewStatus: input.reviewStatus,
          reviewNote: input.reviewNote ?? null,
          editorialSummary: input.editorialSummary ?? null,
          benefitHypotheses: input.benefitHypotheses ?? [],
        },
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['previdenciario-knowledge-pathologies'] });
      void queryClient.invalidateQueries({
        queryKey: ['previdenciario-knowledge-pathology', variables.stableKey],
      });
    },
    onError: showApiError,
  });
}

export function useBulkReviewPrevidenciarioPathologies() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      stableKeys: string[];
      reviewStatus: KnowledgeReviewStatus;
      reviewNote?: string | null;
      editorialSummary?: string | null;
    }) =>
      apiClient.patch<
        Envelope<{
          updatedCount: number;
          items: Array<{ id: string; stable_key: string; next_status: KnowledgeReviewStatus }>;
        }>
      >('/api/v1/previdenciario/knowledge/pathologies/bulk-review', {
        stableKeys: input.stableKeys,
        reviewStatus: input.reviewStatus,
        reviewNote: input.reviewNote ?? null,
        editorialSummary: input.editorialSummary ?? null,
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['previdenciario-knowledge-pathologies'] });
      for (const stableKey of variables.stableKeys) {
        void queryClient.invalidateQueries({
          queryKey: ['previdenciario-knowledge-pathology', stableKey],
        });
      }
    },
    onError: showApiError,
  });
}
