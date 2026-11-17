/**
 * Contratos de Interface entre Módulos (Dependency Contracts)
 *
 * Define as interfaces que cada módulo deve implementar para comunicação cross-module.
 * Tipos de domínio compartilhados são importados de `../dominio/eventos` (fonte da verdade).
 */

import type {
  EventoCrossModule,
  DocumentoCompartilhado,
  LaudoPericiaCompartilhado,
  TipoDocumentoPrevidenciario,
  DecisaoAdministrativa,
  DecisaoRecursoAdmin,
  RecursoAdministrativo,
  ExigenciaAdministrativa,
  RequerimentoAdmin,
  PrazoAdministrativo,
  TipoBeneficio,
  PrazoProcessual,
  SentencaJudicial,
  AcordoJudicial,
  RPVPrecatorio,
  AudienciaJudicial,
  DecisaoInterlocutoria,
  RecursoJudicial,
} from '../dominio/eventos'

// Re-export dos tipos compartilhados para conveniência dos consumidores dos contratos
export type {
  EventoCrossModule,
  DocumentoCompartilhado,
  LaudoPericiaCompartilhado,
  TipoDocumentoPrevidenciario,
  DecisaoAdministrativa,
  DecisaoRecursoAdmin,
  RecursoAdministrativo,
  ExigenciaAdministrativa,
  RequerimentoAdmin,
  PrazoAdministrativo,
  TipoBeneficio,
  PrazoProcessual,
  SentencaJudicial,
  AcordoJudicial,
  RPVPrecatorio,
  AudienciaJudicial,
  DecisaoInterlocutoria,
  RecursoJudicial,
}

// ============================================
// INTERFACE: Módulo Administrativo (exposto para Judicial)
// ============================================

export interface IModuloAdministrativo {
  // ----- Casos -----
  buscarCasoAdmin(caso_id: string): Promise<CasoAdministrativo | null>
  buscarCasoAdminPorJudicial(caso_jud_id: string): Promise<CasoAdministrativo | null>
  criarCasoAdmin(input: CriarCasoAdminInput): Promise<CasoAdministrativo>
  atualizarCasoAdmin(id: string, patch: Partial<CasoAdministrativo>): Promise<void>
  arquivarCasoAdmin(id: string, motivo: string): Promise<void>

  // ----- Requerimentos -----
  criarRequerimento(input: CriarRequerimentoAdminInput): Promise<RequerimentoAdmin>
  protocolarRequerimento(id: string): Promise<RequerimentoAdmin>
  listarRequerimentos(caso_id: string, filtros?: FiltroRequerimento): Promise<RequerimentoAdmin[]>

  // ----- Recursos -----
  criarRecurso(input: CriarRecursoAdminInput): Promise<RecursoAdministrativo>
  interporRecurso(input: InterporRecursoInput): Promise<RecursoAdministrativo>
  listarRecursos(caso_id: string): Promise<RecursoAdministrativo[]>

  // ----- Perícias -----
  agendarPericia(input: AgendarPericiaAdminInput): Promise<PericiaAdministrativa>
  receberLaudoPericia(id: string, laudo: LaudoPericiaCompartilhado): Promise<void>
  listarPericias(caso_id: string): Promise<PericiaAdministrativa[]>
  verificarReaproveitamentoPericia(laudo_id: string): Promise<ReaproveitamentoPericia>

  // ----- Documentos -----
  uploadDocumento(input: UploadDocumentoAdminInput): Promise<DocumentoCompartilhado>
  anexarDocumentoCaso(caso_id: string, documento: DocumentoCompartilhado): Promise<void>
  buscarDocumentosCaso(caso_id: string, filtros?: FiltroDocumento): Promise<DocumentoCompartilhado[]>
  classificarDocumento(arquivo: Buffer, mime: string, contexto?: ContextoClassificacao): Promise<ClassificacaoDocumento>

  // ----- Prazos -----
  listarPrazos(caso_id: string, filtros?: FiltroPrazos): Promise<PrazoAdministrativo[]>
  criarPrazo(input: CriarPrazoAdminInput): Promise<PrazoAdministrativo>
  atualizarPrazo(id: string, patch: Partial<PrazoAdministrativo>): Promise<void>

  // ----- Cumprimento / RPV / Precatório (decorrentes de sentença judicial) -----
  iniciarCumprimentoSentenca(input: CumprimentoSentencaInput): Promise<RequerimentoAdmin>
  registrarRPVPrecatorio(input: RPVPrecatorioInput): Promise<RPVPrecatorio>
  listarRPVPrecatorios(caso_id: string): Promise<RPVPrecatorio[]>

  // ----- Eventos Cross-Module -----
  emitirEventoCrossModule(evento: EventoCrossModule): Promise<void>
  assinarEventoCrossModule(tipo: EventoCrossModule['tipo'], handler: (evento: EventoCrossModule) => Promise<void>): () => void
}

// ============================================
// INTERFACE: Módulo Judicial (exposto para Administrativo)
// ============================================

export interface IModuloJudicial {
  // ----- Casos -----
  buscarCasoJudicial(caso_id: string): Promise<CasoJudicial | null>
  buscarCasoJudicialPorAdmin(caso_admin_id: string): Promise<CasoJudicial | null>
  criarCasoJudicial(input: CriarCasoJudicialInput): Promise<CasoJudicial>
  atualizarCasoJudicial(id: string, patch: Partial<CasoJudicial>): Promise<void>
  arquivarCasoJudicial(id: string, motivo: string): Promise<void>

  // ----- Petições -----
  peticionar(input: PeticionarInput): Promise<PeticaoJudicial>
  protocolarPeticao(id: string): Promise<PeticaoJudicial>
  listarPeticoes(caso_id: string): Promise<PeticaoJudicial[]>

  // ----- Audiências -----
  agendarAudiencia(input: AgendarAudienciaInput): Promise<AudienciaJudicial>
  listarAudiencias(caso_id: string, filtros?: FiltroAudiencia): Promise<AudienciaJudicial[]>
  reagendarAudiencia(id: string, nova_data: Date, motivo: string): Promise<AudienciaJudicial>

  // ----- Perícias -----
  nomearPerito(input: NomearPeritoInput): Promise<PericiaJudicial>
  receberLaudoPericia(id: string, laudo: LaudoPericiaCompartilhado): Promise<void>
  listarPericias(caso_id: string): Promise<PericiaJudicial[]>
  verificarReaproveitamentoPericia(laudo_id: string): Promise<ReaproveitamentoPericia>

  // ----- Prazos Processuais -----
  listarPrazos(caso_id: string, filtros?: FiltroPrazos): Promise<PrazoProcessual[]>
  calcularPrazosProcessuais(caso_id: string): Promise<PrazoProcessual[]>
  verificarConflitosPrazos(caso_id: string): Promise<ConflitoPrazo[]>

  // ----- Acordos -----
  proporAcordo(input: ProporAcordoInput): Promise<AcordoJudicial>
  homologarAcordo(id: string): Promise<AcordoJudicial>
  listarAcordos(caso_id: string): Promise<AcordoJudicial[]>

  // ----- Cumprimento de Sentença -----
  iniciarCumprimento(input: CumprimentoSentencaInput): Promise<CumprimentoSentenca>
  emitirRPVPrecatorio(input: RPVPrecatorioInput): Promise<RPVPrecatorio>
  listarRPVPrecatorios(caso_id: string): Promise<RPVPrecatorio[]>

  // ----- Eventos Cross-Module -----
  emitirEventoCrossModule(evento: EventoCrossModule): Promise<void>
  assinarEventoCrossModule(tipo: EventoCrossModule['tipo'], handler: (evento: EventoCrossModule) => Promise<void>): () => void
}

// ============================================
// INTERFACE: Módulo Compartilhado (exposto para ambos)
// ============================================

export interface IModuloCompartilhado {
  // ----- Cliente -----
  buscarCliente(id: string): Promise<ClienteCompartilhado | null>
  buscarClientePorCpf(cpf: string): Promise<ClienteCompartilhado | null>
  buscarClientePorEmail(email: string): Promise<ClienteCompartilhado | null>
  criarCliente(input: CriarClienteInput): Promise<ClienteCompartilhado>
  atualizarCliente(id: string, dados: Partial<ClienteCompartilhado>): Promise<void>

  // ----- Documentos -----
  uploadDocumento(input: UploadDocumentoCompartilhadoInput): Promise<DocumentoCompartilhado>
  classificarDocumento(arquivo: Buffer, mime: string, contexto?: ContextoClassificacao): Promise<ClassificacaoDocumento>
  buscarDocumentos(filtros: FiltroDocumento): Promise<DocumentoCompartilhado[]>

  // ----- Perícias Cruzadas -----
  verificarReaproveitamentoPericia(laudo_id: string, modulo_destino: 'administrativo' | 'judicial'): Promise<ReaproveitamentoPericia>
  vincularLaudoCruzado(laudo_origem_id: string, modulo_origem: 'administrativo' | 'judicial', caso_destino_id: string): Promise<void>
  listarPericiasCruzadas(filtros: FiltroPericiasCruzadas): Promise<PericiaCruzada[]>

  // ----- Prazos Unificados -----
  listarPrazosUnificados(filtros: FiltroPrazosUnificados): Promise<(PrazoAdministrativo | PrazoProcessual)[]>
  verificarConflitosPrazos(caso_id: string): Promise<ConflitoPrazo[]>
  criarAlertaPrazoUnificado(input: AlertaPrazoInput): Promise<AlertaPrazo>

  // ----- Eventos Cross-Module -----
  emitirEventoCrossModule(evento: EventoCrossModule): Promise<void>
  assinarEventoCrossModule(tipo: EventoCrossModule['tipo'], handler: (evento: EventoCrossModule) => Promise<void>): () => void

  // ----- LGPD / Auditoria -----
  exportarDadosTitular(titular_id: string): Promise<Buffer>
  anonimizarTitular(titular_id: string, motivo: string): Promise<void>
  registrarConsentimento(input: ConsentimentoInput): Promise<Consentimento>
  revogarConsentimento(consentimento_id: string, revogado_por: string): Promise<void>
}

// ============================================
// ENTIDADES DOS MÓDULOS (não compartilhadas em eventos.ts)
// ============================================

export interface CasoAdministrativo {
  id: string
  caso_previdenciario_id: string
  organizacao_id: string
  numero_processo_admin: string
  beneficio_solicitado: string
  status: string
  cliente_id: string
  advogado_responsavel_id: string
  criado_em: Date
  atualizado_em: Date
}

export interface CasoJudicial {
  id: string
  caso_previdenciario_id: string
  caso_admin_origem_id?: string
  numero_processo: string
  foro: string
  status: string
  cliente_id: string
  advogado_responsavel_id: string
  criado_em: Date
  atualizado_em: Date
}

export interface ClienteCompartilhado {
  id: string
  organizacao_id: string
  nome: string
  cpf_encrypted: string
  email: string
  telefone?: string
  endereco?: EnderecoCompleto
  data_nascimento?: Date
  genero?: string
  estado_civil?: string
  profissao?: string
  rg?: string
  orgao_emissor_rg?: string
  uf_rg?: string
  cnis_status?: string
  cnis_ultima_atualizacao?: Date
  lgpd_consentimento: boolean
  lgpd_consentimento_em?: Date
  criado_em: Date
  atualizado_em: Date
}

export interface EnderecoCompleto {
  cep: string
  logradouro: string
  numero: string
  complemento?: string
  bairro: string
  cidade: string
  uf: string
}

export interface PericiaAdministrativa {
  id: string
  caso_admin_id: string
  perito_id: string
  tipo: 'medica' | 'social'
  status: string
  data_agendamento?: Date
  data_realizacao?: Date
  laudo_id?: string
}

export interface PericiaJudicial {
  id: string
  caso_jud_id: string
  perito_id: string
  tipo: 'medica' | 'social'
  status: string
  data_agendamento?: Date
  data_realizacao?: Date
  laudo_id?: string
}

export interface PericiaCruzada {
  id: string
  pericia_admin_id?: string
  pericia_judicial_id?: string
  tipo_cruzamento: 'admin_para_judicial' | 'judicial_para_admin'
  reaproveitado: boolean
  criado_em: Date
}

export interface ReaproveitamentoPericia {
  reaproveitavel: boolean
  motivo?: string
  laudo_origem_id: string
  modulo_origem: 'administrativo' | 'judicial'
  modulo_destino: 'administrativo' | 'judicial'
}

export interface ConflitoPrazo {
  prazos: (PrazoAdministrativo | PrazoProcessual)[]
  tipo_conflito: 'sobreposicao' | 'sequencia_impossivel' | 'prazo_curto'
  severidade: 'critica' | 'alta' | 'media' | 'baixa'
  sugestao_resolucao: string
}

export interface AlertaPrazo {
  id: string
  caso_id: string
  modulo: 'administrativo' | 'judicial'
  tipo_prazo: string
  data_vencimento: Date
  dias_restantes: number
  urgencia: 'critica' | 'alta' | 'media' | 'baixa'
  destinatarios: string[]
  canais: ('whatsapp' | 'email' | 'sistema')[]
  status: 'pendente' | 'enviado' | 'lido' | 'resolvido'
}

export interface CumprimentoSentenca {
  id: string
  caso_jud_id: string
  tipo: 'rpv' | 'precatorio' | 'provisorio'
  valor: number
  status: 'pendente' | 'protocolado' | 'processando' | 'pago' | 'cancelado'
  data_protocolo?: Date
  data_pagamento?: Date
}

export interface PeticaoJudicial {
  id: string
  caso_jud_id: string
  tipo: 'inicial' | 'contestacao' | 'recurso' | 'embargos' | 'embargos_declaracao' | 'agravo' | 'outro'
  conteudo: string
  documentos_ids: string[]
  status: 'rascunho' | 'protocolado' | 'deferido' | 'indeferido'
  data_protocolo?: Date
}

// ============================================
// CLASSIFICAÇÃO DE DOCUMENTOS
// ============================================

export interface ContextoClassificacao {
  caso_id?: string
  tipo_caso?: string
  cliente_nome?: string
  modulo_origem?: 'administrativo' | 'judicial'
}

export interface ClassificacaoDocumento {
  tipo: TipoDocumentoPrevidenciario
  confianca: number
  pasta_destino: string
  metadados_extraidos: Record<string, unknown>
  precisa_revisao: boolean
}

// ============================================
// FILTROS
// ============================================

export interface FiltroDocumento {
  caso_id?: string
  tipo?: TipoDocumentoPrevidenciario
  data_inicio?: Date
  data_fim?: Date
  classificacao?: string
}

export interface FiltroPrazos {
  caso_id?: string
  modulo?: 'administrativo' | 'judicial'
  status?: 'pendente' | 'cumprido' | 'vencido'
  data_inicio?: Date
  data_fim?: Date
}

export interface FiltroPrazosUnificados {
  caso_id?: string
  modulo?: 'administrativo' | 'judicial' | 'ambos'
  tipo?: string
  status?: string
  data_inicio?: Date
  data_fim?: Date
}

export interface FiltroPericiasCruzadas {
  caso_id?: string
  modulo_origem?: 'administrativo' | 'judicial'
  reaproveitavel?: boolean
}

export interface FiltroRequerimento {
  caso_id?: string
  status?: RequerimentoAdmin['status']
  tipo?: RequerimentoAdmin['tipo']
}

export interface FiltroAudiencia {
  caso_id?: string
  tipo?: AudienciaJudicial['tipo']
  data_inicio?: Date
  data_fim?: Date
}

// ============================================
// INPUTS — Administrativo
// ============================================

export interface CriarCasoAdminInput {
  caso_previdenciario_id: string
  organizacao_id: string
  numero_processo_admin: string
  beneficio_solicitado: string
  cliente_id: string
  advogado_responsavel_id: string
}

export interface CriarRequerimentoAdminInput {
  caso_admin_id: string
  tipo: RequerimentoAdmin['tipo']
  beneficio: string
  documentos_ids: string[]
}

export interface CriarRecursoAdminInput {
  caso_admin_id: string
  requerimento_origem_id: string
  tipo: RecursoAdministrativo['tipo']
  fundamentacao: string
}

export interface InterporRecursoInput {
  caso_admin_id: string
  recurso_id: string
  documentos_ids?: string[]
}

export interface AgendarPericiaAdminInput {
  caso_admin_id: string
  tipo: 'medica' | 'social'
  perito_id: string
  data_agendamento: Date
  local: string
  observacoes?: string
}

export interface UploadDocumentoAdminInput {
  caso_admin_id: string
  arquivo: Buffer
  nome_arquivo: string
  mime_type: string
  classificacao?: TipoDocumentoPrevidenciario
  contexto?: ContextoClassificacao
}

export interface CriarPrazoAdminInput {
  caso_admin_id: string
  tipo: PrazoAdministrativo['tipo']
  data_vencimento: Date
  descricao: string
}

// ============================================
// INPUTS — Judicial
// ============================================

export interface CriarCasoJudicialInput {
  caso_previdenciario_id: string
  caso_admin_origem_id?: string
  numero_processo: string
  foro: string
  cliente_id: string
  advogado_responsavel_id: string
  pedidos: PedidoJudicialInput[]
  valor_causa: number
  gratuidade_justica: boolean
}

export interface PedidoJudicialInput {
  descricao: string
  tipo: 'condenacao' | 'declaratoria' | 'constitutiva' | 'mandamental' | 'executiva'
  valor?: number
}

export interface PeticionarInput {
  caso_jud_id: string
  tipo: PeticaoJudicial['tipo']
  conteudo: string
  documentos_ids: string[]
}

export interface AgendarAudienciaInput {
  caso_jud_id: string
  tipo: AudienciaJudicial['tipo']
  data: Date
  local: string
  virtual: boolean
  link_virtual?: string
  pauta?: string
}

export interface NomearPeritoInput {
  caso_jud_id: string
  tipo: 'medica' | 'social'
  perito_id: string
  quesitos: string[]
  prazo_dias: number
}

export interface ProporAcordoInput {
  caso_jud_id: string
  valor: number
  parcelamento?: { parcelas: number; valor_parcela: number; vencimento_dia: number }
  termos: string
}

export interface CumprimentoSentencaInput {
  caso_jud_id: string
  tipo: CumprimentoSentenca['tipo']
  valor: number
  sentenca_id: string
}

export interface RPVPrecatorioInput {
  caso_jud_id: string
  tipo: RPVPrecatorio['tipo']
  valor: number
  exercicio: number
}

// ============================================
// INPUTS — Compartilhado
// ============================================

export interface CriarClienteInput {
  organizacao_id: string
  nome: string
  cpf: string
  email: string
  telefone?: string
  endereco?: EnderecoCompleto
  data_nascimento?: Date
  genero?: string
  estado_civil?: string
  profissao?: string
}

export interface UploadDocumentoCompartilhadoInput {
  caso_id: string
  modulo_origem: 'administrativo' | 'judicial'
  arquivo: Buffer
  nome_arquivo: string
  mime_type: string
  classificacao?: TipoDocumentoPrevidenciario
  contexto?: ContextoClassificacao
}

export interface AlertaPrazoInput {
  caso_id: string
  modulo: 'administrativo' | 'judicial'
  tipo_prazo: string
  data_vencimento: Date
  dias_antecedencia: number[]
  destinatarios: string[]
  canais: ('whatsapp' | 'email' | 'sistema')[]
  template_personalizado?: string
}

// ============================================
// LGPD
// ============================================

export interface ConsentimentoInput {
  titular_id: string
  finalidade: string
  base_legal: 'consentimento' | 'contrato' | 'obrigacao_legal' | 'interesse_legitimo' | 'protecao_vida' | 'interesse_publico'
  versao_termo: string
  ip_origem?: string
  user_agent?: string
  metadados?: Record<string, unknown>
}

export interface Consentimento {
  id: string
  titular_id: string
  finalidade: string
  base_legal: ConsentimentoInput['base_legal']
  versao_termo: string
  aceite_em: Date
  revogado_em?: Date
  revogado_por?: string
  ip_origem?: string
  user_agent?: string
  metadados?: Record<string, unknown>
}
