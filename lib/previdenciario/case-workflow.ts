import { z } from 'zod';

import type { Database, Json } from '@/lib/database.types';

export type PrevidenciarioCaseRow = Database['public']['Tables']['previdenciario_cases']['Row'];
export type PrevidenciarioCaseStageRow = Database['public']['Tables']['previdenciario_case_stages']['Row'];
export type PrevidenciarioCasePendencyRow = Database['public']['Tables']['previdenciario_case_pendencies']['Row'];
export type PrevidenciarioCaseDeadlineRow = Database['public']['Tables']['previdenciario_case_deadlines']['Row'];
export type PrevidenciarioCaseDocumentRow = Database['public']['Tables']['previdenciario_case_documents']['Row'];
export type PrevidenciarioCaseEventRow = Database['public']['Tables']['previdenciario_case_events']['Row'];

export const PREVIDENCIARIO_CASE_COLUMNS = [
  'id',
  'organization_id',
  'contact_id',
  'lead_id',
  'benefit_catalog_item_id',
  'service_catalog_item_id',
  'stage_id',
  'status',
  'title',
  'protocol_number',
  'source',
  'responsible_user_id',
  'opened_at',
  'completed_at',
  'archived_at',
  'metadata',
  'created_at',
  'updated_at',
  'created_by_user_id',
].join(', ');

export const PREVIDENCIARIO_CASE_STAGE_COLUMNS = [
  'id',
  'organization_id',
  'stable_key',
  'name',
  'description',
  'position',
  'color',
  'is_terminal',
  'is_active',
  'created_at',
  'updated_at',
].join(', ');

export const PREVIDENCIARIO_CASE_PENDENCY_COLUMNS = [
  'id',
  'organization_id',
  'case_id',
  'kind',
  'title',
  'description',
  'action',
  'status',
  'due_at',
  'source',
  'metadata',
  'created_at',
  'updated_at',
  'resolved_at',
  'resolved_by_user_id',
].join(', ');

export const PREVIDENCIARIO_CASE_DEADLINE_COLUMNS = [
  'id',
  'organization_id',
  'case_id',
  'kind',
  'title',
  'reference_at',
  'due_at',
  'timezone',
  'responsible_user_id',
  'source',
  'rule_key',
  'rule_version',
  'status',
  'metadata',
  'created_at',
  'updated_at',
  'completed_at',
  'completed_by_user_id',
].join(', ');

export const PREVIDENCIARIO_CASE_DOCUMENT_COLUMNS = [
  'id',
  'organization_id',
  'case_id',
  'contact_id',
  'kind',
  'file_name',
  'storage_bucket',
  'storage_path',
  'sha256',
  'version',
  'source',
  'review_status',
  'metadata',
  'uploaded_at',
  'reviewed_at',
  'reviewed_by_user_id',
  'created_at',
  'updated_at',
].join(', ');

export const PREVIDENCIARIO_CASE_EVENT_COLUMNS = [
  'id',
  'organization_id',
  'case_id',
  'kind',
  'actor_kind',
  'actor_user_id',
  'source',
  'from_stage_id',
  'to_stage_id',
  'body',
  'metadata',
  'created_at',
].join(', ');

const uuidSchema = z.string().uuid();
const stableKeySchema = z.string().regex(/^[a-z][a-z0-9_]{2,119}$/);
const jsonObjectSchema = z.record(z.string(), z.unknown()).default({});

export const previdenciarioCaseListQuerySchema = z.object({
  status: z.enum(['open', 'completed', 'archived']).optional(),
  stage_id: uuidSchema.optional(),
  benefit_key: stableKeySchema.optional(),
  service_key: stableKeySchema.optional(),
  responsible_user_id: uuidSchema.optional(),
  search: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const createPrevidenciarioCaseSchema = z.strictObject({
  contact_id: uuidSchema,
  lead_id: uuidSchema.nullable().optional(),
  benefit_key: stableKeySchema.nullable().optional(),
  service_key: stableKeySchema.nullable().optional(),
  stage_id: uuidSchema.optional(),
  status: z.enum(['open', 'completed', 'archived']).default('open'),
  title: z.string().trim().min(1).max(240),
  protocol_number: z.string().trim().min(1).max(160).nullable().optional(),
  source: z.string().trim().min(1).max(80).default('manual'),
  responsible_user_id: uuidSchema.nullable().optional(),
  metadata: jsonObjectSchema,
});

export const updatePrevidenciarioCaseSchema = z.strictObject({
  title: z.string().trim().min(1).max(240).optional(),
  benefit_key: stableKeySchema.nullable().optional(),
  service_key: stableKeySchema.nullable().optional(),
  protocol_number: z.string().trim().min(1).max(160).nullable().optional(),
  responsible_user_id: uuidSchema.nullable().optional(),
  status: z.enum(['open', 'completed', 'archived']).optional(),
  metadata: jsonObjectSchema.optional(),
});

export const transitionPrevidenciarioCaseSchema = z.strictObject({
  to_stage_id: uuidSchema,
  note: z.string().trim().max(2000).nullable().optional(),
});

export const createPrevidenciarioPendencySchema = z.strictObject({
  kind: z.enum(['registration', 'protocol', 'document', 'responsible', 'requirement', 'deadline', 'other']),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(4000).nullable().optional(),
  action: z.string().trim().min(1).max(80).default('other'),
  due_at: z.string().datetime({ offset: true }).nullable().optional(),
  source: z.string().trim().min(1).max(80).default('manual'),
  metadata: jsonObjectSchema,
});

export const updatePrevidenciarioPendencySchema = z.strictObject({
  status: z.enum(['open', 'resolved', 'dismissed']),
  note: z.string().trim().max(2000).nullable().optional(),
});

export const createPrevidenciarioDeadlineSchema = z.strictObject({
  kind: z.enum(['external', 'internal', 'reminder']),
  title: z.string().trim().min(1).max(240),
  reference_at: z.string().datetime({ offset: true }).nullable().optional(),
  due_at: z.string().datetime({ offset: true }),
  timezone: z.string().trim().min(1).max(80).default('America/Sao_Paulo'),
  responsible_user_id: uuidSchema.nullable().optional(),
  source: z.string().trim().min(1).max(80).default('manual'),
  rule_key: z.string().trim().min(1).max(160).default('manual'),
  rule_version: z.string().trim().min(1).max(80).default('1'),
  metadata: jsonObjectSchema,
});

export const updatePrevidenciarioDeadlineSchema = z.strictObject({
  status: z.enum(['completed', 'cancelled']),
  note: z.string().trim().max(2000).nullable().optional(),
});

export const createPrevidenciarioDocumentSchema = z.strictObject({
  kind: z.string().trim().min(1).max(120),
  file_name: z.string().trim().min(1).max(255),
  storage_bucket: z.string().trim().min(1).max(120),
  storage_path: z.string().trim().min(1).max(1024),
  sha256: z.string().regex(/^[0-9a-fA-F]{64}$/),
  version: z.number().int().positive().default(1),
  source: z.string().trim().min(1).max(80).default('manual'),
  review_status: z.enum(['draft', 'needs_review', 'approved', 'rejected']).default('needs_review'),
  metadata: jsonObjectSchema,
});

export const updatePrevidenciarioDocumentSchema = z.strictObject({
  review_status: z.enum(['draft', 'needs_review', 'approved', 'rejected']),
  note: z.string().trim().max(2000).nullable().optional(),
});

export const uploadPrevidenciarioDocumentSchema = z.strictObject({
  kind: z.string().trim().min(1).max(120),
  source: z.string().trim().min(1).max(80).default('manual'),
  metadata: jsonObjectSchema,
});

export function asJsonObject(value: Record<string, unknown> | undefined): Json {
  return (value ?? {}) as Json;
}

export type CaseCompleteness = {
  is_complete: boolean;
  missing: Array<'classification' | 'protocol' | 'responsible' | 'pending'>;
};

export function deriveCaseCompleteness(
  row: Pick<PrevidenciarioCaseRow, 'benefit_catalog_item_id' | 'service_catalog_item_id' | 'protocol_number' | 'responsible_user_id'>,
  openPendencyCount: number,
): CaseCompleteness {
  const missing: CaseCompleteness['missing'] = [];
  if (!row.benefit_catalog_item_id && !row.service_catalog_item_id) missing.push('classification');
  if (!row.protocol_number) missing.push('protocol');
  if (!row.responsible_user_id) missing.push('responsible');
  if (openPendencyCount > 0) missing.push('pending');
  return { is_complete: missing.length === 0, missing };
}

export function initialPendencyInputs(
  row: Pick<PrevidenciarioCaseRow, 'benefit_catalog_item_id' | 'service_catalog_item_id' | 'protocol_number' | 'responsible_user_id'>,
  organizationId: string,
  caseId: string,
) {
  const base = {
    organization_id: organizationId,
    case_id: caseId,
    source: 'system',
    metadata: asJsonObject({ automatic: true, trigger: 'case_created' }),
  };
  const inputs: Array<Database['public']['Tables']['previdenciario_case_pendencies']['Insert']> = [];
  if (!row.benefit_catalog_item_id && !row.service_catalog_item_id) {
    inputs.push({ ...base, kind: 'other', title: 'Classificar benefício ou serviço', action: 'review' });
  }
  if (!row.protocol_number) {
    inputs.push({ ...base, kind: 'protocol', title: 'Informar protocolo ou justificar ausência', action: 'add_protocol' });
  }
  if (!row.responsible_user_id) {
    inputs.push({ ...base, kind: 'responsible', title: 'Definir responsável pelo caso', action: 'assign_responsible' });
  }
  return inputs;
}
