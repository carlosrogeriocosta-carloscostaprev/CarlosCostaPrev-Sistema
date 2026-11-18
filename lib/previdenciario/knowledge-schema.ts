import { z } from 'zod';

import {
  PREVIDENCIARIO_BENEFIT_KEYS,
  PREVIDENCIARIO_SERVICE_KEYS,
} from './catalog';

export const reviewStatusSchema = z.enum(['draft', 'needs_review', 'approved', 'rejected', 'archived']);
const sourceKindSchema = z.enum(['official', 'editorial', 'legacy_import', 'internal']);
const classificationSystemSchema = z.enum(['cid10', 'cid11']);
const functionalSystemSchema = z.enum(['cif', 'ifbra']);

export const pathologyKnowledgeSchema = z.strictObject({
  stableKey: z.string().regex(/^[a-z0-9][a-z0-9_]{2,119}$/),
  displayName: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(80),
  aliases: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  medicalClassification: z.strictObject({
    cid10: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
    cid11: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
    sourceKind: sourceKindSchema,
    sourceRef: z.string().trim().max(500).nullable().default(null),
    sourceVersion: z.string().trim().max(100).nullable().default(null),
    reviewStatus: reviewStatusSchema,
  }),
  functionalFramework: z.strictObject({
    cif: z.strictObject({
      bodyFunctions: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
      bodyStructures: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
      activitiesParticipation: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
      environmentalFactors: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
    }),
    ifbra: z.strictObject({
      instrumentVersion: z.string().trim().max(100).nullable().default(null),
      domains: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
      activities: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
      sourceRef: z.string().trim().max(500).nullable().default(null),
      reviewStatus: reviewStatusSchema,
    }),
  }),
  clinicalContent: z.strictObject({
    educationalSummary: z.string().trim().max(20_000).nullable().default(null),
    documentHints: z.array(z.string().trim().min(1).max(300)).max(100).default([]),
    hasMedicationContent: z.boolean().default(false),
    hasPrognosisContent: z.boolean().default(false),
    hasDiagnosticContent: z.boolean().default(false),
    hasRedFlagContent: z.boolean().default(false),
    reviewStatus: reviewStatusSchema,
  }),
  benefitHypotheses: z.array(z.strictObject({
    benefitKey: z.enum(PREVIDENCIARIO_BENEFIT_KEYS),
    hypothesis: z.string().trim().max(2_000),
    sourceRef: z.string().trim().max(500).nullable().default(null),
    reviewStatus: reviewStatusSchema,
  })).max(PREVIDENCIARIO_BENEFIT_KEYS.length * 2).default([]),
  serviceLinks: z.array(z.enum(PREVIDENCIARIO_SERVICE_KEYS)).max(PREVIDENCIARIO_SERVICE_KEYS.length).default([]),
  provenance: z.strictObject({
    sourceRepo: z.literal('sistemaprev'),
    sourcePath: z.string().trim().min(1).max(500),
    sourceLine: z.number().int().positive().nullable().default(null),
    importedAt: z.string().datetime().nullable().default(null),
  }),
});

export type PathologyKnowledge = z.infer<typeof pathologyKnowledgeSchema>;

export const benefitHypothesisSchema = z.strictObject({
  benefitKey: z.enum(PREVIDENCIARIO_BENEFIT_KEYS),
  hypothesis: z.string().trim().max(2_000),
  sourceRef: z.string().trim().max(500).nullable().default(null),
  reviewStatus: reviewStatusSchema,
});

export const pathologyReviewUpdateSchema = z.strictObject({
  reviewStatus: reviewStatusSchema,
  reviewNote: z.string().trim().max(4_000).nullable().optional(),
  editorialSummary: z.string().trim().max(20_000).nullable().optional(),
  benefitHypotheses: z.array(benefitHypothesisSchema).max(PREVIDENCIARIO_BENEFIT_KEYS.length * 2).optional(),
});

export const pathologyBulkReviewSchema = z.strictObject({
  stableKeys: z.array(z.string().regex(/^[a-z0-9][a-z0-9_]{2,119}$/)).min(1).max(100),
  reviewStatus: reviewStatusSchema,
  reviewNote: z.string().trim().max(4_000).nullable().optional(),
  editorialSummary: z.string().trim().max(20_000).nullable().optional(),
});

export type BenefitHypothesis = z.infer<typeof benefitHypothesisSchema>;
export type PathologyReviewUpdate = z.infer<typeof pathologyReviewUpdateSchema>;
export type PathologyBulkReview = z.infer<typeof pathologyBulkReviewSchema>;

export const legalCrosswalkLinkSchema = z.strictObject({
  benefitKey: z.enum(PREVIDENCIARIO_BENEFIT_KEYS),
  relationType: z.enum([
    'defines_requirement',
    'defines_exception',
    'defines_document',
    'defines_deadline',
    'defines_procedure',
    'historical_context',
    'not_applicable',
  ]),
  summary: z.string().trim().max(4_000),
  sourceId: z.string().uuid(),
  provisionId: z.string().uuid(),
  caseDateRule: z.string().trim().max(500).nullable().default(null),
  reviewStatus: z.enum(['draft', 'needs_review', 'approved', 'rejected', 'archived']),
  confidence: z.enum(['unknown', 'low', 'medium', 'high']),
});

export type LegalCrosswalkLink = z.infer<typeof legalCrosswalkLinkSchema>;

export const classificationSystems = {
  cid10: { key: 'cid10' as const, label: 'CID-10', finalidade: 'classificação médica' },
  cid11: { key: 'cid11' as const, label: 'CID-11', finalidade: 'classificação médica' },
  cif: { key: 'cif' as const, label: 'CIF', finalidade: 'funcionalidade, deficiência e fatores ambientais' },
  ifbra: { key: 'ifbra' as const, label: 'IFBrA', finalidade: 'instrumento específico de avaliação da pessoa com deficiência' },
} satisfies Record<typeof classificationSystemSchema['_output'] | typeof functionalSystemSchema['_output'], { key: string; label: string; finalidade: string }>;
