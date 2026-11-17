/**
 * Event Bus Cross-Module — Comunicação entre Admin, Judicial e Compartilhado
 * 
 * Implementa pub/sub com:
 * - Tipagem forte via EventoCrossModule
 * - Handlers assíncronos com retry/timeout
 * - Dead letter queue para falhas
 * - Métricas de latência
 * - Replay de eventos
 */

import type { EventoCrossModule } from '../dominio/eventos'

type Handler = (evento: EventoCrossModule) => Promise<void>
type FiltroHandler = (evento: EventoCrossModule) => boolean

/**
 * PRD 24 / E1.2 — persistência write-through no bus de verdade (event_log).
 *
 * O nome do tipo vem do contrato de domínio ("CASO_ADMIN_ENCERRADO"); no
 * Postgres o CHECK `event_type_format` exige `modulo.evento` snake-case, então
 * o emissor converte: `prev.caso_admin_encerrado`.
 */
export function tipoParaEventLog(tipo: string): string {
  return `prev.${tipo.toLowerCase()}`
}

/**
 * Assinatura do gravador injetado pela aplicação (camada server-side) — aqui
 * dentro não importamos Supabase para o bus continuar testável sem banco.
 * Retorna o id da linha em `event_log` ou lança.
 */
export type PersistidorEvento = (evento: EventoCrossModule) => Promise<string>

interface HandlerRegistro {
  handler: Handler
  filtro?: FiltroHandler
  modulo_destino: 'administrativo' | 'judicial' | 'ambos' | 'compartilhado'
  prioridade: number
  timeout_ms: number
  max_retries: number
}

type EventoEnfileirado = EventoCrossModule & {
  tentativas: number
  enfileirado_em: Date
  processado_em?: Date
  erro?: string
}

interface MetricasEventBus {
  eventos_processados: number
  eventos_falhos: number
  latencia_media_ms: number
  handlers_registrados: number
  fila_tamanho: number
  dead_letter_tamanho: number
}

export class EventBusCrossModule {
  private handlers: Map<string, HandlerRegistro[]> = new Map()
  private fila: EventoEnfileirado[] = []
  private processando = false
  private deadLetter: EventoEnfileirado[] = []
  private metricas: MetricasEventBus = {
    eventos_processados: 0,
    eventos_falhos: 0,
    latencia_media_ms: 0,
    handlers_registrados: 0,
    fila_tamanho: 0,
    dead_letter_tamanho: 0,
  }
  private processandoFila = false

  // Configurações
  private readonly maxRetries = 3
  private readonly retryDelayMs = 1000
  private readonly maxDeadLetter = 1000
  private readonly processamentoBatchSize = 10
  private readonly intervaloProcessamentoMs = 100

  /**
   * E1.2: gravador write-through. Quando configurado, o evento é persistido em
   * `event_log` ANTES de entrar na fila em memória — se a gravação falhar, o
   * evento vai direto para a dead letter com o motivo (nunca se perde em
   * silêncio). Sem configurar, o bus mantém o comportamento antigo (memória).
   */
  private persistidor: PersistidorEvento | null = null

  configurarPersistencia(persistidor: PersistidorEvento) {
    this.persistidor = persistidor
  }

  constructor() {
    this.iniciarProcessamentoFila()
  }

  // ============================================
  // REGISTRO DE HANDLERS
  // ============================================

  /**
   * Registra handler para um tipo de evento
   */
  assinar<T extends EventoCrossModule>(
    tipo: string,
    handler: (evento: T) => Promise<void>,
    opcoes?: {
      filtro?: (evento: T) => boolean
      modulo_destino?: 'administrativo' | 'judicial' | 'ambos' | 'compartilhado'
      prioridade?: number
      timeout_ms?: number
      max_retries?: number
    }
  ): () => void {
    const registro: HandlerRegistro = {
      handler: handler as Handler,
      filtro: opcoes?.filtro as FiltroHandler | undefined,
      modulo_destino: opcoes?.modulo_destino ?? 'ambos',
      prioridade: opcoes?.prioridade ?? 0,
      timeout_ms: opcoes?.timeout_ms ?? 30000,
      max_retries: opcoes?.max_retries ?? 3,
    }

    if (!this.handlers.has(tipo)) {
      this.handlers.set(tipo, [])
    }
    this.handlers.get(tipo)!.push(registro)
    this.handlers.get(tipo)!.sort((a, b) => b.prioridade - a.prioridade)
    this.metricas.handlers_registrados++

    // Retorna função de unsubscribe
    return () => {
      const handlers = this.handlers.get(tipo)
      if (handlers) {
        const idx = handlers.findIndex(h => h.handler === (handler as Handler))
        if (idx >= 0) handlers.splice(idx, 1)
        this.metricas.handlers_registrados--
      }
    }
  }

  // ============================================
  // PUBLICAÇÃO DE EVENTOS
  // ============================================

  /**
   * Publica evento na fila (assíncrono, não bloqueia)
   */
  async publicar<T extends EventoCrossModule>(
    evento: EventoCrossModule,
    opcoes?: { prioridade?: number; delay_ms?: number }
  ): Promise<string> {
    // Write-through: grava no event_log antes de enfileirar. Falha na gravação
    // derruba o evento direto na dead letter com o motivo — evidência sempre.
    if (this.persistidor) {
      try {
        await this.persistidor(evento)
      } catch (e) {
        const erro = e instanceof Error ? e.message : String(e)
        this.deadLetter.push({
          ...evento,
          tentativas: 0,
          enfileirado_em: new Date(),
          processado_em: new Date(),
          erro: `persistencia_falhou: ${erro}`,
        })
        this.metricas.dead_letter_tamanho = this.deadLetter.length
        this.metricas.eventos_falhos++
        console.error('[EventBus] persistência falhou; evento na dead letter', {
          evento_id: evento.id,
          tipo: evento.tipo,
          erro,
        })
        return evento.id
      }
    }

    const eventoEnfileirado: EventoEnfileirado = {
      ...evento,
      tentativas: 0,
      enfileirado_em: new Date(),
    }

    if (opcoes?.delay_ms && opcoes.delay_ms > 0) {
      setTimeout(() => this.fila.push(eventoEnfileirado), opcoes.delay_ms)
    } else {
      // Insere baseado na prioridade (maior prioridade primeiro)
      const prioridade = opcoes?.prioridade ?? 0
      const prioridadeEvento = (e: EventoEnfileirado) =>
        (e as EventoEnfileirado & { prioridade?: number }).prioridade ?? 0
      const idx = this.fila.findIndex(e => prioridadeEvento(e) < prioridade)
      if (idx >= 0) {
        this.fila.splice(idx, 0, eventoEnfileirado)
      } else {
        this.fila.push(eventoEnfileirado)
      }
    }

    this.metricas.fila_tamanho = this.fila.length
    return evento.id
  }

  /**
   * Publica e aguarda processamento (síncrono, para testes)
   */
  async publicarESperar<T extends EventoCrossModule>(
    evento: EventoCrossModule,
    timeout_ms = 5000
  ): Promise<{ sucesso: boolean; erros: string[] }> {
    const handlers = this.handlers.get(evento.tipo) ?? []
    const erros: string[] = []

    for (const registro of handlers) {
      if (registro.filtro && !registro.filtro(evento)) continue
      
      try {
        await Promise.race([
          registro.handler(evento),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), registro.timeout_ms)
          )
        ])
      } catch (e) {
        erros.push(`${e instanceof Error ? e.message : String(e)}`)
      }
    }

    return { sucesso: erros.length === 0, erros }
  }

  // ============================================
  // PROCESSAMENTO DA FILA
  // ============================================

  private iniciarProcessamentoFila() {
    setInterval(() => this.processarFila(), this.intervaloProcessamentoMs)
  }

  private async processarFila() {
    if (this.processandoFila || this.fila.length === 0) return
    this.processandoFila = true

    const batch = this.fila.splice(0, this.processamentoBatchSize)
    this.metricas.fila_tamanho = this.fila.length

    for (const evento of batch) {
      const inicio = Date.now()
      const handlers = this.handlers.get(evento.tipo) ?? []

      if (handlers.length === 0) {
        this.metricas.eventos_processados++
        this.registrarLatencia(Date.now() - inicio)
        continue
      }

      let sucesso = true
      const erros: string[] = []

      for (const registro of this.handlers.get(evento.tipo) ?? []) {
        if (registro.filtro && !registro.filtro(evento)) continue

        let tentativas = 0
        let sucessoHandler = false
        let ultimoErro: Error | null = null

        while (tentativas <= (this.maxRetries)) {
          try {
            await Promise.race([
              registro.handler(evento),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), registro.timeout_ms)
              )
            ])
            sucessoHandler = true
            break
          } catch (e) {
            ultimoErro = e instanceof Error ? e : new Error(String(e))
            tentativas++
            if (tentativas <= this.maxRetries) {
              await new Promise(r => setTimeout(r, this.retryDelayMs * tentativas))
            }
          }
        }

        if (!sucessoHandler) {
          sucesso = false
          erros.push(ultimoErro?.message ?? 'Erro desconhecido')
        }
      }

      if (!sucesso) {
        await this.tratarFalha(evento, erros)
      } else {
        this.metricas.eventos_processados++
      }

      this.registrarLatencia(Date.now() - inicio)
    }

    this.processandoFila = false
  }

  private async tratarFalha(evento: EventoEnfileirado, erros: string[]) {
    evento.tentativas++
    this.metricas.eventos_falhos++

    if (evento.tentativas >= this.maxRetries) {
      // Move para dead letter
      evento.erro = erros.join('; ')
      evento.processado_em = new Date()
      this.deadLetter.push(evento)
      this.metricas.dead_letter_tamanho = this.deadLetter.length

      // Limita dead letter
      if (this.deadLetter.length > this.maxDeadLetter) {
        this.deadLetter.shift()
      }

      console.error('[EventBus] Evento movido para dead letter', {
        evento_id: evento.id,
        tipo: evento.tipo,
        tentativas: evento.tentativas,
        erros,
      })
    } else {
      // Re-enfileira com delay exponencial
      setTimeout(() => {
        this.fila.unshift(evento)
        this.metricas.fila_tamanho = this.fila.length
      }, Math.min(1000 * Math.pow(2, evento.tentativas), 30000))
    }
  }

  // ============================================
  // MÉTRICAS E MONITORAMENTO
  // ============================================

  private latencias: number[] = []
  private readonly maxLatenciasHistorico = 1000

  private registrarLatencia(ms: number) {
    this.latencias.push(ms)
    if (this.latencias.length > this.maxLatenciasHistorico) {
      this.latencias.shift()
    }
    const soma = this.latencias.reduce((a, b) => a + b, 0)
    this.metricas.latencia_media_ms = this.latencias.length > 0 
      ? Math.round(soma / this.latencias.length) 
      : 0
  }

  getMetricas(): MetricasEventBus {
    return { ...this.metricas, fila_tamanho: this.fila.length, dead_letter_tamanho: this.deadLetter.length }
  }

  getDeadLetter(): EventoEnfileirado[] {
    return [...this.deadLetter]
  }

  async reenfileirarDeadLetter(id: string): Promise<boolean> {
    const idx = this.deadLetter.findIndex(e => e.id === id)
    if (idx === -1) return false
    
    const [evento] = this.deadLetter.splice(idx, 1)
    if (!evento) return false
    evento.tentativas = 0
    evento.erro = undefined
    evento.processado_em = undefined
    this.fila.unshift(evento)
    this.metricas.dead_letter_tamanho = this.deadLetter.length
    this.metricas.fila_tamanho = this.fila.length
    return true
  }

  limparDeadLetter() {
    this.deadLetter = []
    this.metricas.dead_letter_tamanho = 0
  }

  // ============================================
  // REPLAY DE EVENTOS
  // ============================================

  async replayEventos(
    filtro: { 
      tipo?: string 
      modulo_origem?: string
      de?: Date
      ate?: Date
      limit?: number
    } = {}
  ): Promise<number> {
    // Busca no banco de eventos (event_log) e reenfileira
    // Implementação depende do storage de eventos
    return 0
  }

  // ============================================
  // HEALTH CHECK
  // ============================================

  healthCheck(): { saudavel: boolean; detalhes: MetricasEventBus & { fila_parada: boolean } } {
    const filaParada = this.fila.length > 100 && !this.processandoFila
    return {
      saudavel: !filaParada && this.deadLetter.length < 100,
      detalhes: {
        ...this.getMetricas(),
        fila_parada: filaParada,
      }
    }
  }
}

// Singleton global
export const eventBusCrossModule = new EventBusCrossModule()

// Helpers de conveniência
export async function emitirEventoCrossModule(evento: EventoCrossModule): Promise<string> {
  return eventBusCrossModule.publicar(evento)
}

export function assinarEventoCrossModule<T extends EventoCrossModule>(
  tipo: string,
  handler: (evento: T) => Promise<void>,
  opcoes?: Parameters<EventBusCrossModule['assinar']>[2]
) {
  return eventBusCrossModule.assinar<T>(tipo, handler, opcoes)
}

// Factory para criar eventos tipados
export {
  criarEventoAdminParaJudicial,
  criarEventoJudicialParaAdmin,
  criarEventoBidirecional,
} from '../dominio/eventos'
export type {
  EventoCrossModule,
  EventoAdminParaJudicial,
  EventoJudicialParaAdmin,
  EventoBidirecional,
  ModuloOrigem,
  ModuloDestino,
  CausadoPor,
} from '../dominio/eventos'