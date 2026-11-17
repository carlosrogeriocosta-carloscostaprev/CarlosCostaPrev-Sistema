import { describe, expect, it } from 'vitest';

import {
  PREVIDENCIARIO_BENEFIT_KEYS,
  PREVIDENCIARIO_SERVICE_KEYS,
} from '@/lib/previdenciario/catalog';
import { pathologyKnowledgeSchema } from '@/lib/previdenciario/knowledge-schema';

const baseKnowledge = {
  stableKey: 'esquizofrenia',
  displayName: 'Esquizofrenia',
  category: 'MENTAL',
  aliases: [],
  medicalClassification: {
    cid10: ['F20'],
    cid11: ['6A20'],
    sourceKind: 'legacy_import' as const,
    sourceRef: 'sistemaprev:pathologies.seed.ts',
    sourceVersion: null,
    reviewStatus: 'needs_review' as const,
  },
  functionalFramework: {
    cif: {
      bodyFunctions: ['b1'],
      bodyStructures: [],
      activitiesParticipation: ['d1'],
      environmentalFactors: ['e3'],
    },
    ifbra: {
      instrumentVersion: null,
      domains: [],
      activities: [],
      sourceRef: null,
      reviewStatus: 'needs_review' as const,
    },
  },
  clinicalContent: {
    educationalSummary: null,
    documentHints: [],
    hasMedicationContent: true,
    hasPrognosisContent: true,
    hasDiagnosticContent: true,
    hasRedFlagContent: false,
    reviewStatus: 'needs_review' as const,
  },
  benefitHypotheses: [],
  serviceLinks: [],
  provenance: {
    sourceRepo: 'sistemaprev' as const,
    sourcePath: 'backend/src/modules/medical-case/seed/pathologies.seed.ts',
    sourceLine: 1,
    importedAt: null,
  },
};

describe('previdenciario catalog contracts', () => {
  it('keeps the approved 9 benefits and 13 services as separate stable keys', () => {
    expect(PREVIDENCIARIO_BENEFIT_KEYS).toHaveLength(9);
    expect(PREVIDENCIARIO_SERVICE_KEYS).toHaveLength(13);
    expect(new Set(PREVIDENCIARIO_BENEFIT_KEYS).size).toBe(9);
    expect(new Set(PREVIDENCIARIO_SERVICE_KEYS).size).toBe(13);
    expect(new Set(PREVIDENCIARIO_BENEFIT_KEYS).intersection(new Set(PREVIDENCIARIO_SERVICE_KEYS)).size).toBe(0);
  });
});

describe('pathologyKnowledgeSchema', () => {
  it('accepts CID, CIF and IFBrA in independent structures', () => {
    const result = pathologyKnowledgeSchema.safeParse(baseKnowledge);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.medicalClassification.cid10).toEqual(['F20']);
      expect(result.data.functionalFramework.cif.bodyFunctions).toEqual(['b1']);
      expect(result.data.functionalFramework.ifbra.activities).toEqual([]);
    }
  });

  it('keeps benefit hypotheses explicitly non-approved', () => {
    const result = pathologyKnowledgeSchema.safeParse({
      ...baseKnowledge,
      benefitHypotheses: [{
        benefitKey: 'incapacidade_temporaria',
        hypothesis: 'Exige revisão de contexto e evidências.',
        sourceRef: null,
        reviewStatus: 'needs_review',
      }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown classification system inside the CID structure', () => {
    const result = pathologyKnowledgeSchema.safeParse({
      ...baseKnowledge,
      medicalClassification: {
        ...baseKnowledge.medicalClassification,
        cif: ['d1'],
      },
    });
    expect(result.success).toBe(false);
  });
});
