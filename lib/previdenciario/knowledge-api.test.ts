import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  matchesPathologySearch,
  serializePathology,
  type PathologyKnowledgeRow,
} from './knowledge-api';
import { pathologyKnowledgeSchema } from './knowledge-schema';

describe('PREV-007 knowledge-api', () => {
  const row: PathologyKnowledgeRow = {
    id: '00000000-0000-4000-8000-000000000001',
    stable_key: 'depressao_major',
    display_name: 'Depressão Major',
    category: 'mental',
    aliases: ['Depressão Clínica'],
    cid10_codes: ['F32', 'F32.2'],
    cid11_codes: ['6A70'],
    cif_body_functions: ['b152'],
    cif_body_structures: [],
    cif_activities_participation: ['d850'],
    cif_environmental_factors: ['e310'],
    ifbra_instrument_version: 'Portaria Conjunta MDS/INSS nº 2/2015',
    ifbra_domains: [],
    ifbra_activities: [],
    clinical_content: {
      educationalSummary: null,
      documentHints: ['Laudo Psiquiátrico'],
      hasMedicationContent: true,
      hasPrognosisContent: true,
      hasDiagnosticContent: true,
      hasRedFlagContent: true,
      reviewStatus: 'needs_review',
    },
    benefit_hypotheses: [],
    service_links: [],
    source_repo: 'sistemaprev',
    source_path: 'backend/src/modules/medical-case/seed/pathologies.seed.ts',
    source_line: 5,
    source_commit: '009b98f',
    source_snapshot_sha256: 'f'.repeat(64),
    review_status: 'needs_review',
    reviewer_user_id: null,
    reviewed_at: null,
    review_note: null,
    created_at: '2026-08-21T00:00:00.000Z',
    updated_at: '2026-08-21T00:00:00.000Z',
  };

  it('busca por nome, alias e códigos sem misturar campos funcionais', () => {
    expect(matchesPathologySearch(row, 'clínica')).toBe(true);
    expect(matchesPathologySearch(row, 'f32.2')).toBe(true);
    expect(matchesPathologySearch(row, 'd850')).toBe(false);
    expect(matchesPathologySearch(row, 'inexistente')).toBe(false);
  });

  it('serializa CID, CIF, IFBrA e proveniência em estruturas distintas', () => {
    const result = serializePathology(row);
    expect(result.medicalClassification.cid10).toEqual(['F32', 'F32.2']);
    expect(result.functionalFramework.cif.activitiesParticipation).toEqual(['d850']);
    expect(result.functionalFramework.ifbra.domains).toEqual([]);
    expect(result.medicalClassification.sourceRef).toContain('sistemaprev@009b98f');
    expect(result.review.status).toBe('needs_review');
  });

  it('valida cada registro do artefato curado contra o schema Zod', () => {
    const fixture = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'data/previdenciario/pathologies-curated.json'),
        'utf8',
      ),
    ) as { recordCount: number; records: unknown[] };
    expect(fixture.recordCount).toBe(80);
    expect(fixture.records).toHaveLength(80);
    for (const record of fixture.records) {
      expect(pathologyKnowledgeSchema.safeParse(record).success).toBe(true);
    }
  });
});


describe('PREV-008 knowledge review', () => {
  const historyRow = {
    id: '00000000-0000-4000-8000-000000000002',
    pathology_knowledge_id: '00000000-0000-4000-8000-000000000001',
    previous_status: 'needs_review',
    next_status: 'approved',
    editorial_summary: 'Resumo educacional revisado.',
    benefit_hypotheses: [
      {
        benefitKey: 'bpc_loa_deficiencia',
        hypothesis: 'Avaliar requisitos legais e funcionais aplicáveis.',
        sourceRef: 'Lei 8.742/1993',
        reviewStatus: 'needs_review',
      },
    ],
    review_note: 'Conferido por administrador de plataforma.',
    reviewer_user_id: '00000000-0000-4000-8000-000000000003',
    request_id: '00000000-0000-4000-8000-000000000004',
    created_at: '2026-08-21T00:00:00.000Z',
  };

  it('serializa o snapshot do histórico editorial e mantém hipóteses estruturadas', async () => {
    const { serializeReviewHistory } = await import('./knowledge-api');
    const result = serializeReviewHistory(historyRow);
    expect(result.previousStatus).toBe('needs_review');
    expect(result.nextStatus).toBe('approved');
    expect(result.editorialSummary).toBe('Resumo educacional revisado.');
    expect(result.benefitHypotheses[0]?.benefitKey).toBe('bpc_loa_deficiencia');
  });

  it('aceita revisão editorial individual e rejeita lote sem chaves', async () => {
    const { pathologyBulkReviewSchema, pathologyReviewUpdateSchema } = await import('./knowledge-schema');
    expect(pathologyReviewUpdateSchema.safeParse({
      reviewStatus: 'approved',
      editorialSummary: 'Resumo sem diagnóstico ou decisão.',
      benefitHypotheses: [{
        benefitKey: 'bpc_loa_deficiencia',
        hypothesis: 'Hipótese para análise profissional.',
        sourceRef: null,
        reviewStatus: 'needs_review',
      }],
    }).success).toBe(true);
    expect(pathologyBulkReviewSchema.safeParse({
      stableKeys: [],
      reviewStatus: 'approved',
    }).success).toBe(false);
  });
});
