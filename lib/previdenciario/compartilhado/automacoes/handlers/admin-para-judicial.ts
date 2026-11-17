/**
 * Handlers: Administrativo → Judicial
 *
 * Executa ações no módulo Judicial disparadas por eventos do Administrativo
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventoAdminParaJudicial } from '../../dominio/eventos'
import { audit } from '@/lib/audit'
import { logger } from '@/lib/logger'

type Extrair<T extends EventoAdminParaJudicial['tipo']> = Extract<EventoAdminParaJudicial, { tipo: T }>

/** Payloads com o id do caso admin no topo (a alias usada pelos handlers) */
type EventoComCasoAdmin<T extends EventoAdminParaJudicial['tipo']> = Extrair<T> & { caso_admin_id: string }

type ResultadoHandler = Record<string, unknown> & { sucesso: boolean }

// ============================================
// TIPOS DE CONFIGURAÇÃO
// ============================================

interface ConfigCriarSugestaoAjuizamento {
  preencher_peticao_inicial: boolean
  anexar_documentos_admin: boolean
  preencher_pedidos_baseados_em: 'beneficio_solicitado' | 'decisao_indeferimento'
  notificar_advogado: boolean
  prioridade_tarefa: 'baixa' | 'media' | 'alta' | 'critica'
  prazo_horas: number
}

interface ConfigAlertaPrazo {
  titulo: string
  prioridade: 'baixa' | 'media' | 'alta' | 'critica'
  canais?: ('whatsapp' | 'email' | 'sistema')[]
}

// ============================================
// FUNÇÕES AUXILIARES (stubs - implementação real nas integrações)
// ============================================

async function criarSugestaoAjuizamentoCompleta(params: Record<string, unknown>): Promise<{ id: string; advogado_responsavel_id?: string }> {
  return { id: crypto.randomUUID(), ...params } as { id: string; advogado_responsavel_id?: string }
}

async function criarTarefaAjuizamento(_params: Record<string, unknown>): Promise<void> {}

async function gerarQuesitosComplementares(_casoJudId: string, _laudo: object): Promise<void> {}

async function notificarPerito(_params: Record<string, unknown>): Promise<void> {}

async function enviarWhatsAppAlerta(_advogadoId: string, _alerta: Record<string, unknown>): Promise<void> {}

// ============================================
// HANDLERS
// ============================================

async function judicial_criar_sugestao_ajuizamento(
  evento: EventoComCasoAdmin<'INDEFERIMENTO_ADMINISTRATIVO'>,
  config: Record<string, unknown>,
  admin: SupabaseClient
): Promise<ResultadoHandler> {
  const { caso_admin_id, payload } = evento
  const { decisao, documentos, sugerir_ajuizamento } = payload
  const cfg = config as unknown as ConfigCriarSugestaoAjuizamento

  if (!sugerir_ajuizamento) {
    return { sucesso: true, acao: 'nao_sugerido', mensagem: 'Ajuizamento não sugerido na configuração' }
  }

  try {
    const { data: casoAdmin, error: erroCaso } = await admin
      .from('casos_administrativos')
      .select(`
        *,
        cliente:clientes(*),
        beneficio:beneficios(*),
        advogado_responsavel:usuarios!casos_administrativos_advogado_responsavel_id_fkey(*)
      `)
      .eq('id', caso_admin_id)
      .single()

    if (erroCaso || !casoAdmin) {
      throw new Error(`Caso administrativo não encontrado: ${caso_admin_id}`)
    }

    const { data: casoJudExistente } = await admin
      .from('casos_judiciais')
      .select('id')
      .eq('caso_admin_origem_id', caso_admin_id)
      .maybeSingle()

    if (casoJudExistente) {
      return {
        sucesso: true,
        acao: 'ja_existe',
        caso_judicial_id: casoJudExistente.id,
        mensagem: 'Caso judicial já existe para este caso administrativo',
      }
    }

    const sugestao = await criarSugestaoAjuizamentoCompleta({
      caso_admin_id,
      cliente_id: casoAdmin.cliente_id,
      beneficio: casoAdmin.beneficio,
      decisao_indeferimento: decisao,
      documentos_base: documentos,
      advogado_responsavel_id: casoAdmin.advogado_responsavel_id,
    })

    if (cfg.notificar_advogado) {
      await criarTarefaAjuizamento({
        sugestao_id: sugestao.id,
        advogado_id: sugestao.advogado_responsavel_id,
        prioridade: cfg.prioridade_tarefa,
        prazo_horas: cfg.prazo_horas,
      })
    }

    await audit({
      action: 'previdenciario.cross_module_sugestao_ajuizamento_criada',
      organizationId: evento.caso_id,
      resourceType: 'sugestao_ajuizamento',
      resourceId: sugestao.id,
      metadata: {
        caso_admin_id,
        caso_judicial_id: null,
        modulo_origem: 'administrativo',
        modulo_destino: 'judicial',
      },
    })

    return {
      sucesso: true,
      acao: 'sugestao_criada',
      sugestao_ajuizamento_id: sugestao.id,
      caso_judicial_id: null,
      mensagem: 'Sugestão de ajuizamento criada para revisão do advogado',
    }
  } catch (e) {
    logger.error('[handlersAdminParaJudicial] Erro ao criar sugestão ajuizamento', { erro: e })
    throw e
  }
}

async function judicial_vincular_laudo_pericia(
  evento: EventoComCasoAdmin<'PERICIA_ADMINISTRATIVA_REALIZADA'>,
  config: Record<string, unknown>,
  admin: SupabaseClient
): Promise<ResultadoHandler> {
  const { laudo, reaproveitavel_judicial } = evento.payload

  if (!reaproveitavel_judicial) {
    return {
      sucesso: true,
      acao: 'nao_reaproveitavel',
      mensagem: 'Laudo não reaproveitável no judicial',
    }
  }

  try {
    const { data: casoJud } = await admin
      .from('casos_judiciais')
      .select('id, pericia_judicial_id')
      .eq('caso_admin_origem_id', evento.caso_admin_id)
      .maybeSingle()

    if (!casoJud) {
      return { sucesso: false, erro: 'Caso judicial não encontrado para vincular laudo' }
    }

    const { data: laudoJud, error } = await admin
      .from('pericias_judiciais')
      .insert({
        caso_judicial_id: casoJud.id,
        laudo_admin_origem_id: laudo.id,
        perito_id: evento.payload.perito_id,
        status: 'concluida',
        laudo_texto: laudo.texto,
        conclusao: laudo.conclusao,
        cid: laudo.cid,
        reaproveitado_de_admin: true,
        data_realizacao: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) throw error

    await admin
      .from('casos_judiciais')
      .update({ pericia_judicial_id: laudoJud.id, status: 'em_pericia' })
      .eq('id', casoJud.id)

    if (config.criar_quesitos_complementares) {
      await gerarQuesitosComplementares(casoJud.id, laudo)
    }

    if (config.notificar_perito) {
      await notificarPerito({
        perito_id: evento.payload.perito_id,
        caso_judicial_id: casoJud.id,
        tipo: 'laudo_vinculado_admin',
      })
    }

    await audit({
      action: 'previdenciario.cross_module_laudo_vinculado_judicial',
      resourceType: 'pericia_judicial',
      resourceId: laudoJud.id,
      metadata: {
        caso_admin_id: evento.caso_admin_id,
        caso_judicial_id: casoJud.id,
        laudo_admin_id: laudo.id,
      },
    })

    return { sucesso: true, laudo_judicial_id: laudoJud.id, caso_judicial_id: casoJud.id }
  } catch (e) {
    logger.error('[handlersAdminParaJudicial] Erro ao vincular laudo', { erro: e })
    throw e
  }
}

async function judicial_criar_alerta_prazo(
  evento: EventoComCasoAdmin<'EXIGENCIA_NAO_CUMPRIDA'>,
  config: Record<string, unknown>,
  admin: SupabaseClient
): Promise<ResultadoHandler> {
  const { exigencia, prazo_final } = evento.payload
  const cfg = config as unknown as ConfigAlertaPrazo

  try {
    const { data: casoJud } = await admin
      .from('casos_judiciais')
      .select('id, advogado_responsavel_id')
      .eq('caso_admin_origem_id', evento.caso_admin_id)
      .maybeSingle()

    if (!casoJud) {
      return { sucesso: false, erro: 'Caso judicial não vinculado' }
    }

    const { data: alerta } = await admin
      .from('alertas_prazo')
      .insert({
        caso_judicial_id: casoJud.id,
        tipo: 'exigencia_admin_nao_cumprida',
        titulo: cfg.titulo || 'Exigência administrativa não cumprida - risco judicial',
        descricao: `Exigência "${exigencia.descricao}" não foi cumprida no prazo (${new Date(prazo_final).toLocaleDateString('pt-BR')}). Risco de impactar andamento judicial.`,
        prioridade: cfg.prioridade || 'alta',
        data_vencimento: new Date(prazo_final).toISOString(),
        canais: cfg.canais || ['sistema', 'whatsapp', 'email'],
        destinatario_id: casoJud.advogado_responsavel_id,
        metadata: {
          caso_admin_id: evento.caso_admin_id,
          exigencia_id: exigencia.id,
          modulo_origem: 'administrativo',
        },
      })
      .select('id')
      .single()

    if (cfg.canais?.includes('whatsapp')) {
      await enviarWhatsAppAlerta(casoJud.advogado_responsavel_id, {
        titulo: cfg.titulo || 'Alerta de Prazo',
        mensagem: 'Exigência administrativa não cumprida pode impactar processo judicial.',
        acao: 'ver_prazo',
      })
    }

    return { sucesso: true, alerta_id: alerta?.id, mensagem: 'Alerta criado no módulo judicial' }
  } catch (e) {
    logger.error('[handlersAdminParaJudicial] Erro ao criar alerta prazo', { erro: e })
    throw e
  }
}

export const handlersAdminParaJudicial = {
  judicial_criar_sugestao_ajuizamento,
  judicial_vincular_laudo_pericia,
  judicial_criar_alerta_prazo,
}
