/**
 * Catálogo estável do domínio previdenciário.
 *
 * As chaves abaixo são contratos internos do produto. Elas não são códigos
 * oficiais do INSS e não devem ser substituídas por códigos de espécie sem
 * validação normativa e revisão profissional.
 */

export const PREVIDENCIARIO_BENEFIT_KEYS = [
  'aposentadoria_idade',
  'aposentadoria_tempo_contribuicao',
  'aposentadoria_especial',
  'incapacidade_permanente',
  'incapacidade_temporaria',
  'auxilio_acidente',
  'pensao_morte',
  'auxilio_reclusao',
  'bpc_loa_deficiencia',
] as const;

export type PrevidenciarioBenefitKey = (typeof PREVIDENCIARIO_BENEFIT_KEYS)[number];

export const PREVIDENCIARIO_BENEFITS = {
  aposentadoria_idade: {
    key: 'aposentadoria_idade',
    displayName: 'Aposentadoria por Idade Urbana / Rural',
    officialCodes: [],
  },
  aposentadoria_tempo_contribuicao: {
    key: 'aposentadoria_tempo_contribuicao',
    displayName: 'Aposentadoria por Tempo de Contribuição',
    officialCodes: [],
  },
  aposentadoria_especial: {
    key: 'aposentadoria_especial',
    displayName: 'Aposentadoria Especial',
    officialCodes: [],
  },
  incapacidade_permanente: {
    key: 'incapacidade_permanente',
    displayName: 'Aposentadoria por Incapacidade Permanente',
    officialCodes: [],
  },
  incapacidade_temporaria: {
    key: 'incapacidade_temporaria',
    displayName: 'Auxílio por Incapacidade Temporária',
    officialCodes: [],
  },
  auxilio_acidente: {
    key: 'auxilio_acidente',
    displayName: 'Auxílio-Acidente',
    officialCodes: [],
  },
  pensao_morte: {
    key: 'pensao_morte',
    displayName: 'Pensão por Morte',
    officialCodes: [],
  },
  auxilio_reclusao: {
    key: 'auxilio_reclusao',
    displayName: 'Auxílio-Reclusão',
    officialCodes: [],
  },
  bpc_loa_deficiencia: {
    key: 'bpc_loa_deficiencia',
    displayName: 'Benefício de Prestação Continuada — BPC/LOAS para Pessoa com Deficiência',
    officialCodes: [],
  },
} as const satisfies Record<PrevidenciarioBenefitKey, {
  key: PrevidenciarioBenefitKey;
  displayName: string;
  officialCodes: readonly string[];
}>;

export const PREVIDENCIARIO_SERVICE_KEYS = [
  'extrato_cnis',
  'atualizacao_tempo_contribuicao_cadastro',
  'simulacao_aposentadoria',
  'pericia_medica',
  'cumprimento_exigencia',
  'copia_processo_administrativo',
  'procuracao_curatela',
  'bloqueio_desbloqueio_consignado',
  'alteracao_forma_local_pagamento',
  'certidao_tempo_contribuicao_ctc',
  'recurso_crps',
  'reabilitacao_profissional',
  'pagamento_beneficio_nao_recebido',
] as const;

export type PrevidenciarioServiceKey = (typeof PREVIDENCIARIO_SERVICE_KEYS)[number];

export const PREVIDENCIARIO_SERVICES = {
  extrato_cnis: { key: 'extrato_cnis', displayName: 'Emissão de Extrato de Contribuição (CNIS)' },
  atualizacao_tempo_contribuicao_cadastro: { key: 'atualizacao_tempo_contribuicao_cadastro', displayName: 'Atualização do Tempo de Contribuição / Cadastro' },
  simulacao_aposentadoria: { key: 'simulacao_aposentadoria', displayName: 'Simulação de Aposentadoria' },
  pericia_medica: { key: 'pericia_medica', displayName: 'Perícia Médica (Agendamento / Reagendamento)' },
  cumprimento_exigencia: { key: 'cumprimento_exigencia', displayName: 'Cumprimento de Exigência' },
  copia_processo_administrativo: { key: 'copia_processo_administrativo', displayName: 'Solicitação de Cópia de Processo Administrativo' },
  procuracao_curatela: { key: 'procuracao_curatela', displayName: 'Cadastramento / Renovação de Procuração ou Curatela' },
  bloqueio_desbloqueio_consignado: { key: 'bloqueio_desbloqueio_consignado', displayName: 'Bloqueio / Desbloqueio do Benefício para Empréstimo Consignado' },
  alteracao_forma_local_pagamento: { key: 'alteracao_forma_local_pagamento', displayName: 'Alteração de Forma ou Local de Pagamento' },
  certidao_tempo_contribuicao_ctc: { key: 'certidao_tempo_contribuicao_ctc', displayName: 'Solicitação de Certidão de Tempo de Contribuição (CTC)' },
  recurso_crps: { key: 'recurso_crps', displayName: 'Recurso Ordinário ou Especial (CRPS)' },
  reabilitacao_profissional: { key: 'reabilitacao_profissional', displayName: 'Reabilitação Profissional' },
  pagamento_beneficio_nao_recebido: { key: 'pagamento_beneficio_nao_recebido', displayName: 'Solicitação de Pagamento de Benefício Não Recebido' },
} as const satisfies Record<PrevidenciarioServiceKey, {
  key: PrevidenciarioServiceKey;
  displayName: string;
}>;
