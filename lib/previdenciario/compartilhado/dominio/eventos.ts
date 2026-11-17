/**
 * Eventos de Domínio Cross-Module — Fonte da Verdade
 * 
 * Convenções:
 * - modulo_origem: onde o evento nasceu
 * - modulo_destino: para onde o evento vai (pode ser 'ambos')
 * - modulo_origem_id / modulo_destino_id: IDs no módulo respectivo
 * - correlation_id: rastreia cadeia de eventos (saga)
 * - causado_por: 'sistema' | 'usuario' | 'ia' | 'webhook' | 'automacao'
 */
import { randomId } from '@/lib/random-id'


// ============================================
// TIPOS BASE
// ============================================

export type ModuloOrigem = 'administrativo' | 'judicial' | 'compartilhado' | 'sistema'
export type ModuloDestino = 'administrativo' | 'judicial' | 'ambos'
export type CausadoPor = 'sistema' | 'usuario' | 'ia' | 'webhook' | 'automacao'

export interface EventoCrossModuleBase {
  id: string
  tipo: string
  modulo_origem: ModuloOrigem
  modulo_destino: ModuloDestino
  caso_id: string                    // ID do caso unificado (caso_previdenciario)
  modulo_origem_id: string           // ID no módulo origem (caso_admin_id ou caso_jud_id)
  modulo_destino_id?: string         // ID no módulo destino (se já existe)
  timestamp: Date
  correlation_id: string             // Para rastrear cadeia de eventos (saga)
  causado_por: CausadoPor
  usuario_id?: string
  metadados: Record<string, unknown>
}

// ============================================
// TIPOS DE DADOS COMPARTILHADOS (referenciados nos payloads)
// ============================================

/** Chaves de classificação de documentos previdenciários */
export type TipoDocumentoPrevidenciario =
  | 'rg' | 'cpf' | 'comprovante_residencia' | 'certidao_nascimento' | 'certidao_casamento'
  | 'cnis' | 'ctc' | 'gps_darf' | 'requerimento_inss' | 'carta_concessao' | 'carta_indeferimento'
  | 'ctps' | 'contrato_trabalho' | 'rescisao' | 'recibo_ferias' | 'ppp' | 'ltcat'
  | 'laudo_medico' | 'laudo_pericia_medica' | 'laudo_pericia_social' | 'exame' | 'receita' | 'atestado'
  | 'reclamacao_trabalhista' | 'acordo' | 'sentenca' | 'acordao'
  | 'procuracao' | 'contrato_honorarios' | 'termo_ciencia' | 'termo_compromisso'
  | 'whatsapp_export' | 'email' | 'carta' | 'notificacao_inss' | 'intimacao'
  | 'comprovante_renda' | 'extrato_bancario' | 'outro'

/** Catálogo descritivo de um tipo de documento */
export interface TipoDocumentoCatalogo {
  key: TipoDocumentoPrevidenciario
  label: string
  categoria: 'identificacao' | 'previdenciario' | 'trabalhista' | 'medico' | 'judicial' | 'procuracao' | 'comunicacao' | 'outro'
  obrigatorio_para?: string[] // chaves de benefício
}

export interface DocumentoCompartilhado {
  id: string
  caso_id: string
  nome: string
  mime_type: string
  tamanho_bytes: number
  drive_file_id: string
  drive_folder_id: string
  classificacao: TipoDocumentoPrevidenciario
  metadados_extraidos: Record<string, unknown>
  texto_ocr?: string
  versao: number
  criado_em: Date
  atualizado_em: Date
}

export interface LaudoPericiaCompartilhado {
  id: string
  caso_id: string
  perito_id: string
  tipo: 'medica' | 'social'
  modulo_origem: 'administrativo' | 'judicial'
  texto: string
  conclusao: string
  cid?: string
  data_realizacao: Date
  reaproveitavel_outro: boolean
  metadados: Record<string, unknown>
}

export interface DecisaoAdministrativa {
  id: string
  tipo: 'deferimento' | 'indeferimento' | 'exigencia' | 'arquivamento'
  texto: string
  fundamentacao: string
  data: Date
  orgao: string
}

export interface DecisaoRecursoAdmin {
  id: string
  recurso_id: string
  tipo: 'deferido' | 'indeferido' | 'parcial'
  texto: string
  data: Date
}

export interface RecursoAdministrativo {
  id: string
  caso_admin_id: string
  tipo: 'recurso_ordinario' | 'recurso_especial' | 'revisao'
  status: 'protocolado' | 'em_analise' | 'deferido' | 'indeferido'
  data_protocolo: Date
  prazo_resposta: Date
}

export interface ExigenciaAdministrativa {
  id: string
  caso_admin_id: string
  descricao: string
  prazo: Date
  cumprida: boolean
  data_cumprimento?: Date
  documento_comprovante_id?: string
}

export interface TipoBeneficio {
  id: string
  key: string
  nome: string
  codigo_oficial?: string
}

export interface RequerimentoAdmin {
  id: string
  caso_admin_id: string
  tipo: 'inicial' | 'recurso' | 'cumprimento_exigencia' | 'cumprimento_sentenca' | 'rpv_precatorio'
  status: 'rascunho' | 'protocolado' | 'em_analise' | 'deferido' | 'indeferido'
  data_protocolo?: Date
  beneficio: TipoBeneficio
}

export interface PrazoAdministrativo {
  id: string
  caso_admin_id: string
  tipo: 'exigencia' | 'recurso' | 'pericia' | 'cumprimento_exigencia' | 'outro'
  data_vencimento: Date
  descricao: string
  cumprido: boolean
}

export interface PrazoProcessual {
  id: string
  caso_jud_id: string
  tipo: 'contestacao' | 'recurso' | 'embargos' | 'embargos_declaracao' | 'agravo' | 'cumprimento_sentenca' | 'outro'
  data_inicio: Date
  data_vencimento: Date
  em_dobro: boolean
  suspenso: boolean
  suspenso_motivo?: string
}

export interface SentencaJudicial {
  id: string
  caso_jud_id: string
  texto: string
  valor_condenacao?: number
  data: Date
  transito_em_julgado: boolean
  data_transito?: Date
}

export interface Parcelamento {
  parcelas: number
  valor_parcela: number
  vencimento_dia: number
}

export interface AcordoJudicial {
  id: string
  caso_jud_id: string
  texto: string
  valor: number
  parcelamento?: Parcelamento
  data_homologacao: Date
}

export interface RPVPrecatorio {
  id: string
  caso_jud_id: string
  tipo: 'rpv' | 'precatorio'
  valor: number
  exercicio: number
  data_inscricao: Date
  status: 'inscrito' | 'pago' | 'cancelado'
}

export interface AudienciaJudicial {
  id: string
  caso_jud_id: string
  tipo: 'instrucao' | 'conciliacao' | 'pericia' | 'una' | 'outra'
  data: Date
  local: string
  virtual: boolean
  link_virtual?: string
  pauta?: string
}

export interface DecisaoInterlocutoria {
  id: string
  caso_jud_id: string
  texto: string
  tutela_antecipada: boolean
  data: Date
}

export interface RecursoJudicial {
  id: string
  caso_jud_id: string
  tipo: 'apelacao' | 'recurso_especial' | 'recurso_extraordinario' | 'agravo' | 'embargos_declaracao' | 'outro'
  status: 'protocolado' | 'em_analise' | 'deferido' | 'indeferido'
  data_protocolo: Date
  fundamentacao: string
}

// ============================================
// EVENTOS: ADMINISTRATIVO → JUDICIAL
// ============================================

export type EventoAdminParaJudicial = EventoCrossModuleBase & (
  | { tipo: 'INDEFERIMENTO_ADMINISTRATIVO'; payload: { decisao: DecisaoAdministrativa; documentos: DocumentoCompartilhado[]; sugerir_ajuizamento: boolean } }
  | { tipo: 'RECURSO_ADMINISTRATIVO_INDEFERIDO'; payload: { recurso: RecursoAdministrativo; decisao: DecisaoRecursoAdmin } }
  | { tipo: 'PERICIA_ADMINISTRATIVA_REALIZADA'; payload: { laudo: LaudoPericiaCompartilhado; reaproveitavel_judicial: boolean; perito_id: string } }
  | { tipo: 'EXIGENCIA_NAO_CUMPRIDA'; payload: { exigencia: ExigenciaAdministrativa; prazo_final: Date } }
  | { tipo: 'REQUERIMENTO_PROTOCOLADO'; payload: { requerimento: RequerimentoAdmin; beneficio: TipoBeneficio } }
  | { tipo: 'RECURSO_ADMINISTRATIVO_PROTOCOLADO'; payload: { recurso: RecursoAdministrativo } }
  | { tipo: 'DOCUMENTO_RECEBIDO_ADMIN'; payload: { documento: DocumentoCompartilhado; classificacao: TipoDocumentoPrevidenciario } }
  | { tipo: 'PRAZO_ADMIN_VENCENDO'; payload: { prazo: PrazoAdministrativo; dias_restantes: number } }
  | { tipo: 'CASO_ADMIN_ENCERRADO'; payload: { motivo: 'deferido' | 'indeferido' | 'arquivado'; decisao_final?: DecisaoAdministrativa } }
  | { tipo: 'CLIENTE_SOLICITA_AJUIZAMENTO'; payload: { motivo: string; documentos_base: DocumentoCompartilhado[] } }
)

// ============================================
// EVENTOS: JUDICIAL → ADMINISTRATIVO
// ============================================

export interface MovimentacaoProcessual {
  data: Date
  descricao: string
  orgao_julgador?: string
}

export interface AcaoDataJud {
  codigo?: string
  nome?: string
}

export type EventoJudicialParaAdmin = EventoCrossModuleBase & (
  | { tipo: 'SENTENCA_PROFERIDA'; payload: { sentenca: SentencaJudicial; transitado_em_julgado: boolean; data_transito?: Date } }
  | { tipo: 'MOVIMENTACAO_PROCESSUAL_NOVA'; payload: { numero_processo: string; tribunal: string; movimentacao: MovimentacaoProcessual; total_movimentacoes: number } }
  | { tipo: 'ACORDO_HOMOLOGADO'; payload: { acordo: AcordoJudicial; valor: number; parcelamento?: Parcelamento } }
  | { tipo: 'CUMPRIMENTO_SENTENCA_INICIADO'; payload: { rpv_precatorio: RPVPrecatorio; valor: number; data_prevista_pagamento: Date } }
  | { tipo: 'RPV_LIBERADA'; payload: { rpv: RPVPrecatorio; valor: number; data_disponibilidade: Date } }
  | { tipo: 'PRECATORIO_INSCRITO'; payload: { rpv_precatorio: RPVPrecatorio; exercicio: number } }
  | { tipo: 'ACORDO_JUDICIAL_PROPOSTO'; payload: { acordo: AcordoJudicial; valor_proposto: number } }
  | { tipo: 'PERICIA_JUDICIAL_REALIZADA'; payload: { laudo: LaudoPericiaCompartilhado; reaproveitavel_admin: boolean; perito_id: string } }
  | { tipo: 'AUDIENCIA_DESIGNADA'; payload: { audiencia: AudienciaJudicial; tipo: 'instrucao' | 'conciliacao' | 'pericia' } }
  | { tipo: 'PRAZO_PROCESSUAL_VENCENDO'; payload: { prazo: PrazoProcessual; dias_restantes: number; em_dobro: boolean } }
  | { tipo: 'TRANSITADO_EM_JULGADO'; payload: { transitado_em: Date; transito_certificado: boolean } }
  | { tipo: 'ARQUIVAMENTO_JUDICIAL'; payload: { motivo: 'extincao' | 'desistencia' | 'transitado_em_julgado' } }
  | { tipo: 'DECISAO_INTERLOCUTORIA'; payload: { decisao: DecisaoInterlocutoria; tutela_antecipada: boolean } }
  | { tipo: 'RECURSO_JUDICIAL_INTERPOSTO'; payload: { recurso: RecursoJudicial; instancia: 'segunda' | 'superior' | 'stf' } }
)

// ============================================
// EVENTOS BIDIRECIONAIS
// ============================================

export type EventoBidirecional = EventoCrossModuleBase & (
  | { tipo: 'PERICIA_COMPARTILHADA_REALIZADA'; payload: { laudo: LaudoPericiaCompartilhado; modulo_origem: 'administrativo' | 'judicial'; reaproveitavel_outro: boolean } }
  | { tipo: 'DOCUMENTO_COMPARTILHADO_RECEBIDO'; payload: { documento: DocumentoCompartilhado; origem: 'administrativo' | 'judicial' } }
  | { tipo: 'CLIENTE_ATUALIZADO'; payload: { cliente_id: string; campos_alterados: string[] } }
  | { tipo: 'PRAZO_CRITICO_UNIFICADO'; payload: { prazos: (PrazoAdministrativo | PrazoProcessual)[]; urgencia: 'critica' | 'alta' | 'media' } }
  | { tipo: 'CLIENTE_SOLICITOU_ACAO'; payload: { acao: string; modulo_solicitante: 'administrativo' | 'judicial'; detalhes: Record<string, unknown> } }
)

// ============================================
// UNION TYPES
// ============================================

export type EventoCrossModule =
  | EventoAdminParaJudicial
  | EventoJudicialParaAdmin
  | EventoBidirecional

export type PayloadDeEvento<E extends EventoCrossModule, T extends E['tipo']> =
  Extract<E, { tipo: T }> extends { payload: infer P } ? P : never

// ============================================
// TYPE GUARDS
// ============================================

export function isEventoAdminParaJudicial(e: EventoCrossModule): e is EventoAdminParaJudicial {
  return e.modulo_origem === 'administrativo' && e.modulo_destino === 'judicial'
}

export function isEventoJudicialParaAdmin(e: EventoCrossModule): e is EventoJudicialParaAdmin {
  return e.modulo_origem === 'judicial' && e.modulo_destino === 'administrativo'
}

export function isEventoBidirecional(e: EventoCrossModule): e is EventoBidirecional {
  return e.modulo_destino === 'ambos'
}

// ============================================
// HELPERS
// ============================================

export interface OpcoesEvento {
  correlation_id?: string
  causado_por?: CausadoPor
  usuario_id?: string
  metadados?: Record<string, unknown>
  modulo_destino_id?: string
}

function baseEvento(
  modulo_origem: ModuloOrigem,
  modulo_destino: ModuloDestino,
  caso_id: string,
  modulo_origem_id: string,
  opcoes?: OpcoesEvento
): EventoCrossModuleBase {
  return {
    id: randomId(),
    tipo: '',
    modulo_origem,
    modulo_destino,
    caso_id,
    modulo_origem_id,
    modulo_destino_id: opcoes?.modulo_destino_id,
    timestamp: new Date(),
    correlation_id: opcoes?.correlation_id ?? randomId(),
    causado_por: opcoes?.causado_por ?? 'sistema',
    usuario_id: opcoes?.usuario_id,
    metadados: opcoes?.metadados ?? {},
  }
}

export function criarEventoAdminParaJudicial<T extends EventoAdminParaJudicial['tipo']>(
  tipo: T,
  caso_id: string,
  caso_admin_id: string,
  payload: PayloadDeEvento<EventoAdminParaJudicial, T>,
  opcoes?: OpcoesEvento
): Extract<EventoAdminParaJudicial, { tipo: T }> {
  return {
    ...baseEvento('administrativo', 'judicial', caso_id, caso_admin_id, opcoes),
    tipo,
    payload,
  } as unknown as Extract<EventoAdminParaJudicial, { tipo: T }>
}

export function criarEventoJudicialParaAdmin<T extends EventoJudicialParaAdmin['tipo']>(
  tipo: T,
  caso_id: string,
  caso_jud_id: string,
  payload: PayloadDeEvento<EventoJudicialParaAdmin, T>,
  opcoes?: OpcoesEvento
): Extract<EventoJudicialParaAdmin, { tipo: T }> {
  return {
    ...baseEvento('judicial', 'administrativo', caso_id, caso_jud_id, opcoes),
    tipo,
    payload,
  } as unknown as Extract<EventoJudicialParaAdmin, { tipo: T }>
}

export function criarEventoBidirecional<T extends EventoBidirecional['tipo']>(
  tipo: T,
  caso_id: string,
  modulo_origem_id: string,
  modulo_origem: 'administrativo' | 'judicial',
  payload: PayloadDeEvento<EventoBidirecional, T>,
  opcoes?: OpcoesEvento
): Extract<EventoBidirecional, { tipo: T }> {
  return {
    ...baseEvento(modulo_origem, 'ambos', caso_id, modulo_origem_id, opcoes),
    tipo,
    payload,
  } as unknown as Extract<EventoBidirecional, { tipo: T }>
}

export function getModuloDestino(e: EventoCrossModule): ModuloDestino {
  return e.modulo_destino
}

export function getModuloOrigem(e: EventoCrossModule): ModuloOrigem {
  return e.modulo_origem
}
