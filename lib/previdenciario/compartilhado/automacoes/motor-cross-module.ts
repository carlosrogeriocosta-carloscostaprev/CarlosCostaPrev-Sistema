/**
 * Motor de Automações Cross-Module — Cérebro que conecta Admin ↔ Judicial
 * 
 * Responsabilidades:
 * - Registra e executa regras de automação cross-module
 * - Avalia condições contextuais (admin + judicial)
 * - Executa ações em módulos destino
 * - Gerencia anti-loop, retry, timeout, dead letter
 * - Integra com Event Bus para disparar/ouvir eventos
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventoCrossModule, ModuloOrigem } from '../dominio/eventos'
import { eventBusCrossModule } from '../infra/event-bus'
import { avaliarCondicoesCross } from '../automacoes/conditions/evaluator-cross'
import { handlersAdminParaJudicial } from '../automacoes/handlers/admin-para-judicial'
import { handlersJudicialParaAdmin } from '../automacoes/handlers/judicial-para-admin'
import { handlersBidirecionais } from '../automacoes/handlers/bidirecional'
import { logger } from '@/lib/logger'

// ============================================
// TIPOS
// ============================================

export type { EventoCrossModule } from '../dominio/eventos'

export type ModuloDestinoAcao = 'administrativo' | 'judicial' | 'ambos' | 'compartilhado'

export interface CondicaoCrossModule {
  campo: string                    // Path: 'payload.campo', 'contexto_admin.campo', 'contexto_judicial.campo'
  operador: 'igual' | 'diferente' | 'contem' | 'nao_contem' | 'maior' | 'menor' | 'maior_igual' | 'menor_igual' | 'existe' | 'nao_existe' | 'in' | 'not_in' | 'regex' | 'starts_with' | 'ends_with' | 'entre' | 'fora' | 'vazio' | 'nao_vazio'
  valor?: unknown
  modulo_contexto?: 'admin' | 'judicial' | 'evento' | 'payload' | 'compartilhado'  // Onde buscar o valor
}

/** Assinatura comum dos handlers de ação cross-module */
export type HandlerCrossModule = (
  evento: EventoCrossModule,
  config: Record<string, unknown>,
  admin: SupabaseClient
) => Promise<Record<string, unknown>>

export interface AcaoCrossModule {
  tipo: string
  modulo_destino: ModuloDestinoAcao
  config?: Record<string, unknown>
  on_failure: 'continuar' | 'parar' | 'retry' | 'parar_tudo'
  on_success: 'continuar' | 'parar'
  timeout_ms?: number
  on_failure_compensacao?: string  // Tipo de ação de compensação (para saga)
}

export interface RegraAutomacaoCrossModule {
  id: string
  nome: string
  descricao?: string
  ativa: boolean
  modulo_origem: ModuloOrigem | 'ambos'
  evento_gatilho: string[]                    // Tipos de evento que disparam
  condicoes: CondicaoCrossModule[]            // Condições AND (todas devem passar)
  acoes: AcaoCrossModule[]                    // Ações em ordem
  prioridade: number                          // Menor = executa primeiro
  modulo_destino: ModuloDestinoAcao
  anti_loop: boolean                          // Previne loops infinitos
  max_retries: number
  timeout_ms: number
  on_error: 'continuar' | 'parar' | 'parar_tudo' | 'retry'
  tags?: string[]
  descricao_tecnica?: string
}

export interface ContextoCrossModule {
  evento: EventoCrossModule
  admin?: Record<string, unknown>
  judicial?: Record<string, unknown>
  compartilhado?: Record<string, unknown>
  payload: Record<string, unknown>
  timestamp: Date
}

export interface ResultadoAcaoCross {
  sucesso: boolean
  acao: string
  detalhes?: unknown
  erro?: string
  tempo_ms?: number
  compensacao?: () => Promise<void>
}

export interface ResultadoExecucaoCross {
  processado: boolean
  motivo?: string
  regras_executadas: number
  acoes_executadas: number
  acoes_sucesso: number
  acoes_falha: number
  falha_critica: boolean
  detalhes: ResultadoAcaoCross[]
  tempo_total_ms: number
}

interface RegraAutomacaoCrossModuleDB {
  id: string
  nome: string
  descricao: string | null
  ativa: boolean
  modulo_origem: string
  evento_gatilho: string[]
  condicoes: CondicaoCrossModule[]
  acoes: AcaoCrossModule[]
  prioridade: number
  modulo_destino: string
  anti_loop: boolean
  max_retries: number
  timeout_ms: number
  on_error: string
  tags: string[] | null
  descricao_tecnica: string | null
  criado_em: string
  atualizado_em: string
}

// ============================================
// MOTOR PRINCIPAL
// ============================================

export class MotorAutomacoesCrossModule {
  private regras: Map<string, RegraAutomacaoCrossModule[]> = new Map()
  private emExecucao: Set<string> = new Set()
  private admin: SupabaseClient
  private config: MotorConfig
  private metricas: MotorMetricas = {
    eventos_processados: 0,
    regras_executadas: 0,
    acoes_executadas: 0,
    acoes_sucesso: 0,
    acoes_falha: 0,
    falhas_criticas: 0,
    tempo_medio_ms: 0,
  }
  private latencias: number[] = []
  private readonly maxLatenciasHistorico = 1000

  constructor(admin: SupabaseClient, config: MotorConfig = {}) {
    this.admin = admin
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      timeoutMs: config.timeoutMs ?? 30000,
      enableDeadLetter: config.enableDeadLetter ?? true,
      maxDeadLetter: config.maxDeadLetter ?? 1000,
      intervaloLimpezaMs: config.intervaloLimpezaMs ?? 3600000, // 1h
      enableMetrics: config.enableMetrics ?? true,
    }
    this.carregarRegrasDoBanco()
    this.iniciarLimpezaPeriodica()
    this.registrarListenersEventBus()
  }

  // ============================================
  // INICIALIZAÇÃO
  // ============================================

  private async carregarRegrasDoBanco() {
    try {
      const { data, error } = await this.admin
        .from('automation_rules_cross_module')
        .select('*')
        .eq('ativa', true)
        .order('prioridade', { ascending: true })

      if (error) throw error

      this.regras.clear()
      for (const regraBruta of data ?? []) {
        const regra = this.mapearRegraDB(regraBruta)
        for (const evento of regra.evento_gatilho) {
          if (!this.regras.has(evento)) this.regras.set(evento, [])
          this.regras.get(evento)!.push(regra)
        }
      }
      logger.info('[MotorCrossModule] Regras carregadas', { total: data?.length ?? 0 })
    } catch (e) {
      logger.error('[MotorCrossModule] Erro ao carregar regras', { erro: e })
    }
  }

  private mapearRegraDB(db: RegraAutomacaoCrossModuleDB): RegraAutomacaoCrossModule {
    return {
      id: db.id,
      nome: db.nome,
      descricao: db.descricao ?? undefined,
      ativa: db.ativa,
      modulo_origem: db.modulo_origem as RegraAutomacaoCrossModule['modulo_origem'],
      evento_gatilho: db.evento_gatilho,
      condicoes: db.condicoes ?? [],
      acoes: db.acoes ?? [],
      prioridade: db.prioridade ?? 0,
      modulo_destino: db.modulo_destino as ModuloDestinoAcao,
      anti_loop: db.anti_loop ?? true,
      max_retries: db.max_retries ?? 3,
      timeout_ms: db.timeout_ms ?? 30000,
      on_error: (db.on_error as RegraAutomacaoCrossModule['on_error']) ?? 'continuar',
      tags: db.tags ?? undefined,
      descricao_tecnica: db.descricao_tecnica ?? undefined,
    }
  }

  private registrarListenersEventBus() {
    // Registra listener genérico no Event Bus para TODOS os eventos
    // O motor filtra as regras relevantes
    eventBusCrossModule.assinar('*', async (evento) => {
      await this.processarEvento(evento)
    }, { prioridade: 10 }) // Prioridade baixa para o motor processar depois de handlers específicos
  }

  private iniciarLimpezaPeriodica() {
    setInterval(() => this.limpezaPeriodica(), this.config.intervaloLimpezaMs)
  }

  // ============================================
  // API PÚBLICA
  // ============================================

  /**
   * Processa evento recebido do Event Bus
   */
  async processarEvento(evento: EventoCrossModule): Promise<ResultadoExecucaoCross> {
    const inicio = Date.now()
    const regras = this.obterRegrasParaEvento(evento)

    if (!regras.length) {
      return {
        processado: false,
        motivo: 'sem_regras_para_evento',
        regras_executadas: 0,
        acoes_executadas: 0,
        acoes_sucesso: 0,
        acoes_falha: 0,
        falha_critica: false,
        detalhes: [],
        tempo_total_ms: Date.now() - inicio,
      }
    }

    // Ordena por prioridade
    const regrasOrdenadas = regras
      .filter(r => r.ativa && r.evento_gatilho.includes(evento.tipo))
      .sort((a, b) => a.prioridade - b.prioridade)

    const detalhes: ResultadoAcaoCross[] = []
    let regrasExecutadas = 0
    let acoesExecutadas = 0
    let acoesSucesso = 0
    let acoesFalha = 0
    let falhaCritica = false

    for (const regra of regrasOrdenadas) {
      // Anti-loop
      if (this.estaEmExecucao(evento.id, regra.id)) {
        logger.warn('[MotorCrossModule] Loop detectado', { evento: evento.tipo, regra: regra.id })
        continue
      }

      if (this.excedeuLimiteConcorrencia()) {
        await this.enviarDeadLetter(evento, 'limite_concorrencia_excedido')
        continue
      }

      this.marcarEmExecucao(evento.id, regra.id)

      try {
        // Avalia condições
        const condicoesOk = avaliarCondicoesCross(regra.condicoes, evento)
        if (!condicoesOk) {
          logger.debug('[MotorCrossModule] Condições não atendidas', { regra: regra.id, evento: evento.tipo })
          continue
        }

        regrasExecutadas++

        // Executa ações em sequência
        for (const acao of regra.acoes) {
          const resultado = await this.executarAcao(acao, evento)
          detalhes.push(resultado)
          acoesExecutadas++

          if (resultado.sucesso) {
            acoesSucesso++
          } else {
            acoesFalha++
            if (acao.on_failure === 'parar' || regra.on_error === 'parar') {
              throw new Error(`Ação falhou e on_failure=parar: ${acao.tipo}`)
            }
            if (acao.on_failure === 'parar_tudo' || regra.on_error === 'parar_tudo') {
              falhaCritica = true
              throw new Error(`Ação falhou e on_failure=parar_tudo: ${acao.tipo}`)
            }
            if (acao.on_failure === 'retry') {
              await this.agendarRetry(evento, regra)
            }
          }
        }
      } catch (e) {
        logger.error('[MotorCrossModule] Erro ao executar regra', { regra: regra.id, evento: evento.tipo, erro: e })
        this.metricas.falhas_criticas++

        if (regra.on_error === 'parar_tudo') {
          falhaCritica = true
          throw e
        }
      } finally {
        this.liberarExecucao(evento.id, regra.id)
      }
    }

    const tempoTotal = Date.now() - inicio
    this.atualizarMetricas(tempoTotal)
    this.metricas.regras_executadas += regrasExecutadas
    this.metricas.acoes_executadas += acoesExecutadas
    this.metricas.acoes_sucesso += acoesSucesso
    this.metricas.acoes_falha += acoesFalha

    return {
      processado: true,
      regras_executadas: regrasExecutadas,
      acoes_executadas: acoesExecutadas,
      acoes_sucesso: acoesSucesso,
      acoes_falha: acoesFalha,
      falha_critica: falhaCritica,
      detalhes,
      tempo_total_ms: tempoTotal,
    }
  }

  // ============================================
  // MÉTODOS AUXILIARES
  // ============================================

  private obterChavesEvento(evento: EventoCrossModule): string[] {
    return [
      `${evento.modulo_origem}:${evento.tipo}`,
      `${evento.modulo_origem}:${evento.modulo_destino}:${evento.tipo}`,
      `*:${evento.tipo}`,
    ]
  }

  private obterRegrasParaEvento(evento: EventoCrossModule): RegraAutomacaoCrossModule[] {
    const chaves = this.obterChavesEvento(evento)
    const regras: RegraAutomacaoCrossModule[] = []
    
    for (const chave of chaves) {
      const regras = this.regras.get(chave)
      if (regras) regras.push(...regras)
    }
    
    return regras
  }

  private async construirContexto(evento: EventoCrossModule): Promise<ContextoCrossModule> {
    // Constrói contexto enriquecido com dados dos módulos
    // Pode buscar dados do admin, judicial, compartilhado conforme necessário
    return {
      evento,
      payload: evento.payload as Record<string, unknown>,
      timestamp: new Date(),
    }
  }

  private async avaliarCondicoes(condicoes: CondicaoCrossModule[], evento: EventoCrossModule): Promise<boolean> {
    for (const condicao of condicoes) {
      const valor = this.obterValorContexto(condicao, evento)
      if (!this.avaliarOperador(valor, condicao.operador, condicao.valor)) {
        return false
      }
    }
    return true
  }

  private obterValorContexto(condicao: CondicaoCrossModule, evento: EventoCrossModule): unknown {
    const fonte = condicao.modulo_contexto ?? 'payload'
    const caminho = condicao.campo.split('.')

    let obj: unknown = fonte === 'evento' ? evento : evento.payload

    for (const parte of caminho) {
      if (obj === null || obj === undefined) return undefined
      obj = (obj as Record<string, unknown>)[parte]
    }
    return obj
  }

  private avaliarOperador(valor: unknown, operador: string, esperado: unknown): boolean {
    switch (operador) {
      case 'igual': return valor === esperado
      case 'diferente': return valor !== esperado
      case 'contem': return String(valor).includes(String(esperado))
      case 'nao_contem': return !String(valor).includes(String(esperado))
      case 'maior': return Number(valor) > Number(esperado)
      case 'menor': return Number(valor) < Number(esperado)
      case 'maior_igual': return Number(valor) >= Number(esperado)
      case 'menor_igual': return Number(valor) <= Number(esperado)
      case 'existe': return valor !== undefined && valor !== null && valor !== ''
      case 'nao_existe': return valor === undefined || valor === null || valor === ''
      case 'in': return Array.isArray(esperado) && esperado.includes(valor)
      case 'not_in': return Array.isArray(esperado) && !esperado.includes(valor)
      case 'regex': return new RegExp(String(esperado)).test(String(valor))
      default: return false
    }
  }

  private async executarAcao(acao: AcaoCrossModule, evento: EventoCrossModule): Promise<ResultadoAcaoCross> {
    const inicio = Date.now()
    const timeout = acao.timeout_ms ?? this.config.timeoutMs ?? 30000

    try {
      const resultado = await Promise.race([
        this.executarAcaoInterna(acao, evento),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), timeout)
        )
      ])

      return { sucesso: true, acao: acao.tipo, detalhes: resultado, tempo_ms: Date.now() - inicio }
    } catch (e) {
      return { 
        sucesso: false, 
        acao: acao.tipo, 
        erro: e instanceof Error ? e.message : String(e),
        tempo_ms: Date.now() - inicio,
      }
    }
  }

  private async executarAcaoInterna(acao: AcaoCrossModule, evento: EventoCrossModule): Promise<unknown> {
    const buscarHandler = (): HandlerCrossModule | undefined => {
      const todos: Record<string, HandlerCrossModule> = {
        ...(handlersAdminParaJudicial as unknown as Record<string, HandlerCrossModule>),
        ...(handlersJudicialParaAdmin as unknown as Record<string, HandlerCrossModule>),
        ...(handlersBidirecionais as unknown as Record<string, HandlerCrossModule>),
      }
      return todos[acao.tipo]
    }

    const handler = buscarHandler()
    if (!handler) {
      throw new Error(`Handler não encontrado para ação: ${acao.tipo}`)
    }
    return handler(evento as never, acao.config ?? {}, this.admin)
  }

  // ============================================
  // CONTROLE DE CONCORRÊNCIA E ANTI-LOOP
  // ============================================

  private estaEmExecucao(eventoId: string, regraId: string): boolean {
    return this.emExecucao.has(`${eventoId}:${regraId}`)
  }

  private marcarEmExecucao(eventoId: string, regraId: string) {
    this.emExecucao.add(`${eventoId}:${regraId}`)
  }

  private liberarExecucao(eventoId: string, regraId: string) {
    this.emExecucao.delete(`${eventoId}:${regraId}`)
  }

  private excedeuLimiteConcorrencia(): boolean {
    return this.emExecucao.size > 100
  }

  // ============================================
  // DEAD LETTER & RETRY
  // ============================================

  private async enviarDeadLetter(evento: EventoCrossModule, motivo: string) {
    // Implementar: salva em dead_letter_queue no banco
    logger.error('[MotorCrossModule] Dead letter', { evento_id: evento.id, motivo })
  }

  private async agendarRetry(evento: EventoCrossModule, regra: RegraAutomacaoCrossModule) {
    // Implementar: agenda retry com backoff exponencial
    logger.info('[MotorCrossModule] Retry agendado', { evento: evento.tipo, regra: regra.id })
  }

  // ============================================
  // MÉTRICAS E LIMPEZA
  // ============================================

  private atualizarMetricas(_tempoMs: number) {
    this.metricas.eventos_processados++
    if (this.config.enableMetrics) {
      this.latencias.push(_tempoMs)
      if (this.latencias.length > this.maxLatenciasHistorico) this.latencias.shift()
      this.metricas.tempo_medio_ms = this.latencias.length > 0
        ? this.latencias.reduce((a, b) => a + b, 0) / this.latencias.length
        : 0
    }
  }

  getMetricas() {
    return { ...this.metricas }
  }

  async limpezaPeriodica() {
    // Limpa dead letter antigo, métricas antigas, etc.
  }

  async recarregarRegras() {
    await this.carregarRegrasDoBanco()
  }

  // ============================================
  // API PÚBLICA PARA REGISTRO DINÂMICO DE REGRAS
  // ============================================

  registrarRegra(regra: RegraAutomacaoCrossModule) {
    for (const evento of regra.evento_gatilho) {
      if (!this.regras.has(evento)) this.regras.set(evento, [])
      this.regras.get(evento)!.push(regra)
      this.regras.get(evento)!.sort((a, b) => a.prioridade - b.prioridade)
    }
  }

  removerRegra(regraId: string) {
    for (const [chave, regras] of this.regras.entries()) {
      const idx = regras.findIndex(r => r.id === regraId)
      if (idx >= 0) regras.splice(idx, 1)
    }
  }

  listarRegras(): RegraAutomacaoCrossModule[] {
    const todas: RegraAutomacaoCrossModule[] = []
    for (const regras of this.regras.values()) {
      todas.push(...regras)
    }
    return todas.sort((a, b) => a.prioridade - b.prioridade)
  }

  obterRegra(id: string): RegraAutomacaoCrossModule | undefined {
    for (const regras of this.regras.values()) {
      const encontrada = regras.find(r => r.id === id)
      if (encontrada) return encontrada
    }
    return undefined
  }
}

// ============================================
// TIPOS DE CONFIGURAÇÃO E MÉTRICAS
// ============================================

export interface MotorConfig {
  maxRetries?: number
  timeoutMs?: number
  enableDeadLetter?: boolean
  maxDeadLetter?: number
  intervaloLimpezaMs?: number
  enableMetrics?: boolean
}

export interface MotorMetricas {
  eventos_processados: number
  regras_executadas: number
  acoes_executadas: number
  acoes_sucesso: number
  acoes_falha: number
  falhas_criticas: number
  tempo_medio_ms: number
}

// Singleton global (inicializado na aplicação)
let motorCrossModuleInstance: MotorAutomacoesCrossModule | null = null

export function inicializarMotorCrossModule(admin: SupabaseClient, config?: MotorConfig): MotorAutomacoesCrossModule {
  if (motorCrossModuleInstance) {
    logger.warn('[MotorCrossModule] Já inicializado, retornando instância existente')
    return motorCrossModuleInstance
  }
  motorCrossModuleInstance = new MotorAutomacoesCrossModule(admin, config)
  return motorCrossModuleInstance
}

export function obterMotorCrossModule(): MotorAutomacoesCrossModule | null {
  return motorCrossModuleInstance
}

// Função de conveniência para emitir evento e processar via motor
export async function emitirEProcessarEvento(
  evento: EventoCrossModule,
  admin: SupabaseClient
): Promise<ResultadoExecucaoCross> {
  const motor = obterMotorCrossModule() ?? inicializarMotorCrossModule(admin)
  await eventBusCrossModule.publicar(evento)
  return motor.processarEvento(evento)
}

export type { RegraAutomacaoCrossModule as RegraAutomacao, AcaoCrossModule as Acao }