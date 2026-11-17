import { z } from 'zod';

import type { Database, Json } from '@/lib/database.types';
import { benefitHypothesisSchema, type BenefitHypothesis } from './knowledge-schema';

export type PathologyKnowledgeRow =
  Database['public']['Tables']['previdenciario_pathology_knowledge']['Row'];
export type IfbraItemRow = Database['public']['Tables']['previdenciario_ifbra_items']['Row'];
export type IfbraQualifierRow =
  Database['public']['Tables']['previdenciario_ifbra_qualifiers']['Row'];
export type LegalSourceRow = Database['public']['Tables']['previdenciario_legal_sources']['Row'];
export type LegalCrosswalkRow =
  Database['public']['Tables']['previdenciario_legal_crosswalk']['Row'];
export type PathologyReviewHistoryRow =
  Database['public']['Tables']['previdenciario_pathology_review_history']['Row'];

export const PATHOLOGY_KNOWLEDGE_COLUMNS =
  'id,stable_key,display_name,category,aliases,cid10_codes,cid11_codes,cif_body_functions,cif_body_structures,cif_activities_participation,cif_environmental_factors,ifbra_instrument_version,ifbra_domains,ifbra_activities,clinical_content,benefit_hypotheses,service_links,source_repo,source_path,source_line,source_commit,source_snapshot_sha256,review_status,reviewer_user_id,reviewed_at,review_note,created_at,updated_at' as const;

export const IFBRA_ITEM_COLUMNS =
  'id,instrument_version,domain_key,domain_label,domain_description,code,label,source_repo,source_path,source_commit,source_snapshot_sha256,review_status,reviewer_user_id,reviewed_at,review_note,created_at,updated_at' as const;

export const IFBRA_QUALIFIER_COLUMNS =
  'value,label,range_label,source_repo,source_path,source_commit,source_snapshot_sha256,review_status,reviewer_user_id,reviewed_at,review_note,created_at,updated_at' as const;

export const LEGAL_SOURCE_COLUMNS =
  'id,source_key,title,source_type,official_url,jurisdiction,accessed_at,source_version,source_snapshot_sha256,review_status,reviewer_user_id,reviewed_at,review_note,created_at,updated_at' as const;

export const LEGAL_CROSSWALK_COLUMNS =
  'id,benefit_catalog_item_id,legal_source_id,provision_ref,relation_type,summary,case_date_rule,review_status,confidence,reviewer_user_id,reviewed_at,review_note,created_at,updated_at' as const;

export const PATHOLOGY_REVIEW_HISTORY_COLUMNS =
  'id,pathology_knowledge_id,previous_status,next_status,editorial_summary,benefit_hypotheses,review_note,reviewer_user_id,request_id,created_at' as const;

export const KNOWLEDGE_REVIEW_STATUSES = [
  'draft',
  'needs_review',
  'approved',
  'rejected',
  'archived',
] as const;

export type KnowledgeReviewStatus = (typeof KNOWLEDGE_REVIEW_STATUSES)[number];

export function parseBenefitHypotheses(value: Json): BenefitHypothesis[] {
  const parsed = z.array(benefitHypothesisSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function serializeReviewHistory(row: PathologyReviewHistoryRow) {
  return {
    id: row.id,
    pathologyKnowledgeId: row.pathology_knowledge_id,
    previousStatus: row.previous_status as KnowledgeReviewStatus,
    nextStatus: row.next_status as KnowledgeReviewStatus,
    editorialSummary: row.editorial_summary,
    benefitHypotheses: parseBenefitHypotheses(row.benefit_hypotheses),
    reviewNote: row.review_note,
    reviewerUserId: row.reviewer_user_id,
    requestId: row.request_id,
    createdAt: row.created_at,
  };
}

function searchableValues(row: PathologyKnowledgeRow): string[] {
  return [
    row.stable_key,
    row.display_name,
    ...row.aliases,
    ...row.cid10_codes,
    ...row.cid11_codes,
  ].map((value) => value.toLocaleLowerCase('pt-BR'));
}

export function matchesPathologySearch(row: PathologyKnowledgeRow, search: string): boolean {
  const normalized = search.trim().toLocaleLowerCase('pt-BR');
  if (!normalized) return true;
  return searchableValues(row).some((value) => value.includes(normalized));
}

export function serializePathology(row: PathologyKnowledgeRow) {
  return {
    id: row.id,
    stableKey: row.stable_key,
    displayName: row.display_name,
    category: row.category,
    aliases: row.aliases,
    medicalClassification: {
      cid10: row.cid10_codes,
      cid11: row.cid11_codes,
      sourceKind: 'legacy_import' as const,
      sourceRef: `${row.source_repo}@${row.source_commit}:${row.source_path}${row.source_line ? `#L${row.source_line}` : ''}`,
      sourceVersion: row.source_commit,
      reviewStatus: row.review_status as KnowledgeReviewStatus,
    },
    functionalFramework: {
      cif: {
        bodyFunctions: row.cif_body_functions,
        bodyStructures: row.cif_body_structures,
        activitiesParticipation: row.cif_activities_participation,
        environmentalFactors: row.cif_environmental_factors,
      },
      ifbra: {
        instrumentVersion: row.ifbra_instrument_version,
        domains: row.ifbra_domains,
        activities: row.ifbra_activities,
        sourceRef: `${row.source_repo}@${row.source_commit}:frontend/src/lib/ifbra-items.ts`,
        reviewStatus: row.review_status as KnowledgeReviewStatus,
      },
    },
    clinicalContent: row.clinical_content,
    editorialSummary:
      typeof row.clinical_content === 'object' && row.clinical_content !== null && !Array.isArray(row.clinical_content)
        ? typeof row.clinical_content.educationalSummary === 'string'
          ? row.clinical_content.educationalSummary
          : null
        : null,
    benefitHypotheses: parseBenefitHypotheses(row.benefit_hypotheses),
    serviceLinks: row.service_links,
    provenance: {
      sourceRepo: row.source_repo,
      sourcePath: row.source_path,
      sourceLine: row.source_line,
      importedAt: row.created_at,
      snapshotSha256: row.source_snapshot_sha256,
    },
    review: {
      status: row.review_status as KnowledgeReviewStatus,
      reviewerUserId: row.reviewer_user_id,
      reviewedAt: row.reviewed_at,
      note: row.review_note,
    },
  };
}
