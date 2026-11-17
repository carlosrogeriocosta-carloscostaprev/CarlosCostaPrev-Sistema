/**
 * Handlers: Judicial → Administrativo
 *
 * Executa ações no módulo Administrativo disparadas por eventos do Judicial
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventoJudicialParaAdmin } from '../../dominio/eventos'
import { audit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { randomId } from '@/lib/random-id'

type Extrair<T extends EventoJudicialParaAdmin['tipo']> = Extract<EventoJudicialParaAdmin, { tipo: T }>
type EventoComJud<T extends EventoJudicialParaAdmin['tipo']> = Extrair<T> & { caso_jud_id: string }

type ResultadoHandler = Record<string, unknown> & { sucesso: boolean }

// ============================================
// TIPOS DE CONFIGURAÇÃO
// ============================================

interface ConfigIniciarCumprimento {
  criar_requerimento_cumprimento: boolean
  calcular_valor_rpv: boolean
  anexar_sentenca: boolean
  notificar_advogado: boolean
  prioridade_tarefa: 'baixa' | 'media' | 'alta' | 'critica'
  prazo_horas: number
}

interface ConfigBaixarRequerimento {
  motivo: 'acordo_judicial_homologado' | 'transitado_em_julgado' | 'extincao' | 'desistencia'
  anexar_acordo: boolean
  atualizar_status: 'encerrado_acordo' | 'encerrado_transito' | 'encerrado_extincao'
  notificar_equipe: boolean
}

interface ConfigNotificarRPV {
  criar_tarefa_protocolo: boolean
  prazo_horas: number
  prioridade: 'baixa' | 'media' | 'alta' | 'critica'
  notificar_advogado: boolean
}

interface ConfigArquivarCaso {
  motivo: 'transitado_em_julgado_judicial' | 'extincao' | 'desistencia'
  encerrar_prazos_admin: boolean
  notificar_equipe: boolean
  mover_para_arquivados: boolean
}

// ============================================
// FUNÇÕES AUXILIARES (stubs - implementação real nas integrações)
// ============================================

async function criarRequerimentoCumprimentoAdmin(params: Record<string, unknown>): Promise<{ id: string }> {
  return { id: randomId(), ...params } as { id: string }
}

async function criarRequerimentoCumprimentoAvulso(_evento: object, _config: Record<string, unknown>): Promise<ResultadoHandler> {
  return { sucesso: true, avulso: true }
}

async function criarRPVPrecatorioAdmin(params: Record<string, unknown>): Promise<{ id: string }> {
  return { id: randomId(), ...params } as { id: string }
}

async function anexarDocumentoCasoAdmin(_params: Record<string, unknown>): Promise<void> {}

async function notificarAdvogadoCumprimento(_casoAdminId: string, _requerimentoId: string): Promise<void> {}

async function notificarEquipeCasoBaixado(_casoAdminId: string, _acordo: object): Promise<void> {}

async function notificarEquipeArquivamento(_casoAdminId: string, _motivo: string): Promise<void> {}

async function moverParaArquivados(_casoAdminId: string): Promise<void> {}

async function criarTarefaProtocoloRPV(_params: Record<string, unknown>): Promise<void> {}

// ============================================
// HANDLERS
// ============================================

async function admin_iniciar_cumprimento_sentenca(
  evento: EventoComJud<'SENTENCA_PROFERIDA'>,
  config: Record<string, unknown>,
  admin: SupabaseClient
): Promise<ResultadoHandler> {
  const { sentenca, transitado_em_julgado } = evento.payload
  const cfg = config as unknown as ConfigIniciarCumprimento

  try {
    const { data: casoJud } = await admin
      .from('casos_judiciais')
      .select('id, caso_admin_origem_id, valor_condenacao, cliente_id')
      .eq('id', evento.caso_jud_id)
      .single()

    if (!casoJud?.caso_admin_origem_id) {
      return await criarRequerimentoCumprimentoAvulso(evento, config)
    }

    const casoAdminId = casoJud.caso_admin_origem_id

    const requerimento = await criarRequerimentoCumprimentoAdmin({
      caso_admin_id: casoAdminId,
      sentenca_judicial_id: evento.caso_jud_id,
      valor: casoJud.valor_condenacao || sentenca.valor_condenacao,
      tipo: transitado_em_julgado ? 'rpv_precatorio' : 'cumprimento_provisorio',
      sentenca_texto: sentenca.texto,
      sentenca_data: sentenca.data,
    })

    if (transitado_em_julgado && cfg.criar_requerimento_cumprimento && sentenca.valor_condenacao != null) {
      await criarRPVPrecatorioAdmin({
        caso_admin_id: casoAdminId,
        processo_judicial_id: evento.caso_jud_id,
        valor: sentenca.valor_condenacao,
        tipo: sentenca.valor_condenacao > 60000 ? 'precatorio' : 'rpv', // ~60 salários mínimos
      })
    }

    if (cfg.anexar_sentenca) {
      await anexarDocumentoCasoAdmin({
        caso_admin_id: casoAdminId,
        documento: {
          tipo: 'sentenca_judicial',
          conteudo: sentenca.texto,
          fonte: 'judicial',
          processo_judicial_id: evento.caso_jud_id,
        },
      })
    }

    if (cfg.notificar_advogado) {
      await notificarAdvogadoCumprimento(casoAdminId, requerimento.id)
    }

    await audit({
      action: 'previdenciario.cross_module_cumprimento_iniciado_admin',
      resourceType: 'requerimento_admin',
      resourceId: requerimento.id,
      metadata: {
        caso_judicial_id: evento.caso_jud_id,
        caso_admin_id: casoAdminId,
        modulo_origem: 'judicial',
        modulo_destino: 'administrativo',
        transitado_em_julgado,
      },
    })

    return { sucesso: true, requerimento_admin_id: requerimento.id, caso_admin_id: casoAdminId }
  } catch (e) {
    logger.error('[handlersJudicialParaAdmin] Erro ao iniciar cumprimento', { erro: e })
    throw e
  }
}

async function admin_baixar_requerimento(
  evento: EventoComJud<'ACORDO_HOMOLOGADO'>,
  config: Record<string, unknown>,
  admin: SupabaseClient
): Promise<ResultadoHandler> {
  const { acordo } = evento.payload
  const cfg = config as unknown as ConfigBaixarRequerimento

  try {
    const { data: casoJud } = await admin
      .from('casos_judiciais')
      .select('caso_admin_origem_id')
      .eq('id', evento.caso_jud_id)
      .single()

    if (!casoJud?.caso_admin_origem_id) {
      return { sucesso: false, erro: 'Caso admin não vinculado' }
    }

    await admin
      .from('casos_administrativos')
      .update({
        status: cfg.atualizar_status || 'encerrado_acordo',
        decisao_final: {
          tipo: 'acordo_judicial_homologado',
          acordo_id: acordo.id,
          valor: acordo.valor,
          data: new Date().toISOString(),
        },
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', casoJud.caso_admin_origem_id)

    if (cfg.anexar_acordo) {
      await anexarDocumentoCasoAdmin({
        caso_admin_id: casoJud.caso_admin_origem_id,
        documento: {
          tipo: 'acordo_judicial',
          conteudo: acordo.texto,
          fonte: 'judicial',
          acordo_id: acordo.id,
        },
      })
    }

    if (cfg.notificar_equipe) {
      await notificarEquipeCasoBaixado(casoJud.caso_admin_origem_id, acordo)
    }

    await audit({
      action: 'previdenciario.cross_module_caso_admin_baixado_acordo',
      resourceType: 'caso_administrativo',
      metadata: {
        caso_judicial_id: evento.caso_jud_id,
        acordo_id: acordo.id,
        valor: acordo.valor,
      },
    })

    return {
      sucesso: true,
      caso_admin_id: casoJud.caso_admin_origem_id,
      status_novo: cfg.atualizar_status,
    }
  } catch (e) {
    logger.error('[handlersJudicialParaAdmin] Erro ao baixar requerimento', { erro: e })
    throw e
  }
}

async function admin_arquivar_caso(
  evento: EventoComJud<'ARQUIVAMENTO_JUDICIAL'>,
  config: Record<string, unknown>,
  admin: SupabaseClient
): Promise<ResultadoHandler> {
  const cfg = config as unknown as ConfigArquivarCaso

  try {
    const { data: casoJud } = await admin
      .from('casos_judiciais')
      .select('caso_admin_origem_id')
      .eq('id', evento.caso_jud_id)
      .single()

    if (!casoJud?.caso_admin_origem_id) {
      return { sucesso: false, erro: 'Caso admin não vinculado' }
    }

    await admin
      .from('casos_administrativos')
      .update({
        status: 'arquivado',
        motivo_encerramento: cfg.motivo,
        data_encerramento: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', casoJud.caso_admin_origem_id)

    if (cfg.encerrar_prazos_admin) {
      await admin
        .from('prazos_administrativos')
        .update({
          cumprido: true,
          data_cumprimento: new Date().toISOString(),
          observacao: `Encerrado por ${cfg.motivo.replace(/_/g, ' ')} judicial`,
        })
        .eq('caso_admin_id', casoJud.caso_admin_origem_id)
        .eq('cumprido', false)
    }

    if (cfg.mover_para_arquivados) {
      await moverParaArquivados(casoJud.caso_admin_origem_id)
    }

    if (cfg.notificar_equipe) {
      await notificarEquipeArquivamento(casoJud.caso_admin_origem_id, cfg.motivo)
    }

    await audit({
      action: 'previdenciario.cross_module_caso_admin_arquivado_transito',
      resourceType: 'caso_administrativo',
      metadata: {
        caso_judicial_id: evento.caso_jud_id,
        caso_admin_id: casoJud.caso_admin_origem_id,
        motivo: cfg.motivo,
      },
    })

    return { sucesso: true, caso_admin_id: casoJud.caso_admin_origem_id, status_novo: 'arquivado' }
  } catch (e) {
    logger.error('[handlersJudicialParaAdmin] Erro ao arquivar caso admin', { erro: e })
    throw e
  }
}

async function admin_notificar_rpv_liberada(
  evento: EventoComJud<'RPV_LIBERADA'>,
  config: Record<string, unknown>,
  admin: SupabaseClient
): Promise<ResultadoHandler> {
  const cfg = config as unknown as ConfigNotificarRPV

  try {
    const { rpv, data_disponibilidade } = evento.payload

    const { data: casoJud } = await admin
      .from('casos_judiciais')
      .select('caso_admin_origem_id, advogado_responsavel_id')
      .eq('id', evento.caso_jud_id)
      .single()

    if (!casoJud?.caso_admin_origem_id) {
      return { sucesso: false, erro: 'Caso admin não vinculado' }
    }

    if (cfg.criar_tarefa_protocolo) {
      await criarTarefaProtocoloRPV({
        caso_admin_id: casoJud.caso_admin_origem_id,
        rpv_id: rpv.id,
        valor: rpv.valor,
        data_disponibilidade,
        advogado_id: casoJud.advogado_responsavel_id,
        prazo_horas: cfg.prazo_horas || 48,
        prioridade: cfg.prioridade || 'alta',
      })
    }

    await audit({
      action: 'previdenciario.cross_module_rpv_liberada_notificada',
      resourceType: 'rpv_precatorio',
      metadata: {
        caso_judicial_id: evento.caso_jud_id,
        caso_admin_id: casoJud.caso_admin_origem_id,
        rpv_id: rpv.id,
        valor: rpv.valor,
      },
    })

    return { sucesso: true, tarefa_criada: true, caso_admin_id: casoJud.caso_admin_origem_id }
  } catch (e) {
    logger.error('[handlersJudicialParaAdmin] Erro ao notificar RPV', { erro: e })
    throw e
  }
}

export const handlersJudicialParaAdmin = {
  admin_iniciar_cumprimento_sentenca,
  admin_baixar_requerimento,
  admin_arquivar_caso,
  admin_notificar_rpv_liberada,
}
