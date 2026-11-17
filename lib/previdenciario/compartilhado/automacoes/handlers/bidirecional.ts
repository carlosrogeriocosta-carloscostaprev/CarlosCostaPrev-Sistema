/**
 * Handlers Bidirecionais — Ações que afetam ambos os módulos
 *
 * Perícia compartilhada, prazos unificados, documentos compartilhados
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventoBidirecional } from '../../dominio/eventos'
import { logger } from '@/lib/logger'

type Extrair<T extends EventoBidirecional['tipo']> = Extract<EventoBidirecional, { tipo: T }>
type EventoComAdmin<T extends EventoBidirecional['tipo']> = Extrair<T> & { caso_admin_id: string }
type EventoComJud<T extends EventoBidirecional['tipo']> = Extrair<T> & { caso_jud_id: string }

type ResultadoHandler = Record<string, unknown> & { sucesso: boolean }

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

async function gerarQuesitosComplementares(_casoJudId: string, _laudo: object): Promise<void> {}

async function processarVinculoAdminParaJudicial(
  evento: EventoComAdmin<'PERICIA_COMPARTILHADA_REALIZADA'>,
  config: Record<string, unknown>,
  admin: SupabaseClient
): Promise<ResultadoHandler> {
  const { laudo, reaproveitavel_outro } = evento.payload

  if (!reaproveitavel_outro) {
    return { sucesso: true, acao: 'nao_reaproveitavel' }
  }

  const { data: casoJud } = await admin
    .from('casos_judiciais')
    .select('id, pericia_judicial_id')
    .eq('caso_admin_origem_id', evento.caso_admin_id)
    .maybeSingle()

  if (!casoJud) {
    return { sucesso: false, erro: 'Caso judicial não vinculado' }
  }

  const { data: laudoJud, error } = await admin
    .from('pericias_judiciais')
    .insert({
      caso_judicial_id: casoJud.id,
      laudo_admin_origem_id: laudo.id,
      perito_id: laudo.perito_id,
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

  return { sucesso: true, laudo_judicial_id: laudoJud.id, caso_judicial_id: casoJud.id }
}

async function processarVinculoJudicialParaAdmin(
  evento: EventoComJud<'PERICIA_COMPARTILHADA_REALIZADA'>,
  _config: Record<string, unknown>,
  admin: SupabaseClient
): Promise<ResultadoHandler> {
  const { laudo, reaproveitavel_outro } = evento.payload

  if (!reaproveitavel_outro) {
    return { sucesso: true, acao: 'nao_reaproveitavel' }
  }

  const { data: casoJud } = await admin
    .from('casos_judiciais')
    .select('caso_admin_origem_id, pericia_judicial_id')
    .eq('id', evento.caso_jud_id)
    .maybeSingle()

  if (!casoJud?.caso_admin_origem_id) {
    return { sucesso: false, erro: 'Caso admin não vinculado' }
  }

  await admin
    .from('casos_administrativos')
    .update({
      'pericias.laudo_judicial_vinculado_id': laudo.id,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', casoJud.caso_admin_origem_id)

  await admin.from('pericias_cruzadas').insert({
    pericia_admin_id: null,
    pericia_judicial_id: laudo.id,
    tipo_cruzamento: 'judicial_para_admin',
    reaproveitado: true,
  })

  return { sucesso: true, laudo_vinculado: true, caso_admin_id: casoJud.caso_admin_origem_id }
}

async function copiarDocumentoEntreModulos(params: Record<string, unknown>): Promise<{ id: string }> {
  return { id: crypto.randomUUID(), ...params } as { id: string }
}

async function notificarProprietarioDocumento(_params: Record<string, unknown>): Promise<void> {}

async function criarAlertaPrazoCritico(params: Record<string, unknown>): Promise<{ id: string }> {
  return { id: crypto.randomUUID(), ...params } as { id: string }
}

async function buscarDestinatariosAlerta(_casoId: string, _modulo: string): Promise<string[]> {
  return []
}

async function sincronizarClienteModulo(
  modulo: string,
  _clienteId: string,
  _campos: string[],
  _cfg: Record<string, unknown>
): Promise<{ modulo: string; sucesso: boolean }> {
  return { modulo, sucesso: true }
}

async function detectarConflitosCliente(_clienteId: string, _campos: string[]): Promise<string[]> {
  return []
}

async function propagarEventoCriticoModulo(
  modulo: string,
  _acao: string,
  _detalhes: Record<string, unknown>
): Promise<{ modulo: string; sucesso: boolean }> {
  return { modulo, sucesso: true }
}

// ============================================
// HANDLERS
// ============================================

async function bidirecional_vincular_laudo(
  evento: Extrair<'PERICIA_COMPARTILHADA_REALIZADA'>,
  config: Record<string, unknown>,
  admin: SupabaseClient
): Promise<ResultadoHandler> {
  const { modulo_origem, reaproveitavel_outro } = evento.payload

  if (!reaproveitavel_outro) {
    return {
      sucesso: true,
      acao: 'nao_reaproveitavel',
      mensagem: 'Laudo não marcado como reaproveitável no outro módulo',
    }
  }

  const modulo_destino = modulo_origem === 'administrativo' ? 'judicial' : 'administrativo'

  try {
      const payload = evento.payload
      if (modulo_destino === 'judicial') {
        return await processarVinculoAdminParaJudicial(
          { ...evento, payload, caso_admin_id: (evento as { caso_admin_id?: string }).caso_admin_id ?? '' } as EventoComAdmin<'PERICIA_COMPARTILHADA_REALIZADA'>,
          config,
          admin,
        )
      }
      return await processarVinculoJudicialParaAdmin(
        { ...evento, payload, caso_jud_id: (evento as { caso_jud_id?: string }).caso_jud_id ?? '' } as EventoComJud<'PERICIA_COMPARTILHADA_REALIZADA'>,
        config,
        admin,
      )
  } catch (e) {
    logger.error('[handlersBidirecionais] Erro ao vincular laudo', { erro: e })
    throw e
  }
}

async function bidirecional_sincronizar_documento(
  evento: Extrair<'DOCUMENTO_COMPARTILHADO_RECEBIDO'>,
  config: Record<string, unknown>,
  _admin: SupabaseClient
): Promise<ResultadoHandler> {
  const { documento, origem } = evento.payload
  const modulo_destino = origem === 'administrativo' ? 'judicial' : 'administrativo'

  try {
    if (!config.copiar_para_outro_modulo) {
      return { sucesso: true, acao: 'nao_copiado', mensagem: 'Cópia desabilitada na config' }
    }

    const documentoCopiado = await copiarDocumentoEntreModulos({
      documento_id: documento.id,
      modulo_origem: origem,
      modulo_destino,
      caso_id: evento.caso_id,
      manter_sincronizado: config.manter_sincronizado,
    })

    if (config.notificar_proprietario) {
      await notificarProprietarioDocumento({
        documento_id: documento.id,
        copia_id: documentoCopiado.id,
        modulo_destino,
        acao: 'documento_sincronizado',
      })
    }

    return { sucesso: true, documento_copiado_id: documentoCopiado.id, modulo_destino }
  } catch (e) {
    logger.error('[handlersBidirecionais] Erro ao sincronizar documento', { erro: e })
    throw e
  }
}

async function bidirecional_alerta_prazo_critico(
  evento: Extrair<'PRAZO_CRITICO_UNIFICADO'>,
  config: Record<string, unknown>,
  _admin: SupabaseClient
): Promise<ResultadoHandler> {
  const { prazos, urgencia } = evento.payload

  try {
    const alertas = await Promise.all(
      prazos.map(async (prazo) => {
        const modulo = 'caso_admin_id' in prazo ? 'administrativo' : 'judicial'
        const caso_id = 'caso_admin_id' in prazo ? prazo.caso_admin_id : prazo.caso_jud_id

        return criarAlertaPrazoCritico({
          caso_id,
          modulo,
          prazo_tipo: prazo.tipo,
          data_vencimento: prazo.data_vencimento,
          urgencia,
          destinatarios: await buscarDestinatariosAlerta(caso_id, modulo),
          canais: (config.canais as string[]) || ['whatsapp', 'email', 'sistema'],
        })
      })
    )

    return { sucesso: true, alertas_criados: alertas.length, alertas }
  } catch (e) {
    logger.error('[handlersBidirecionais] Erro ao criar alertas de prazo', { erro: e })
    throw e
  }
}

async function bidirecional_sincronizar_cliente(
  evento: Extrair<'CLIENTE_ATUALIZADO'>,
  config: Record<string, unknown>,
  _admin: SupabaseClient
): Promise<ResultadoHandler> {
  const { cliente_id, campos_alterados } = evento.payload

  try {
    const resultados = await Promise.all([
      sincronizarClienteModulo('administrativo', cliente_id, campos_alterados, config),
      sincronizarClienteModulo('judicial', cliente_id, campos_alterados, config),
    ])

    let conflitos: string[] = []
    if (config.validar_conflitos) {
      conflitos = await detectarConflitosCliente(cliente_id, campos_alterados)
    }

    return {
      sucesso: true,
      modulos_atualizados: resultados.filter((r) => r.sucesso).map((r) => r.modulo),
      conflitos: conflitos.length > 0 ? conflitos : undefined,
    }
  } catch (e) {
    logger.error('[handlersBidirecionais] Erro ao sincronizar cliente', { erro: e })
    throw e
  }
}

async function bidirecional_propagar_evento_critico(
  evento: Extrair<'CLIENTE_SOLICITOU_ACAO'>,
  _config: Record<string, unknown>,
  _admin: SupabaseClient
): Promise<ResultadoHandler> {
  const { acao, detalhes } = evento.payload

  try {
    const modulos = (['administrativo', 'judicial'] as const).filter(
      (m) => m !== evento.modulo_origem
    )

    const resultados = await Promise.all(
      modulos.map((modulo) => propagarEventoCriticoModulo(modulo, acao, detalhes))
    )

    return { sucesso: true, modulos_notificados: modulos, resultados }
  } catch (e) {
    logger.error('[handlersBidirecionais] Erro ao propagar evento crítico', { erro: e })
    throw e
  }
}

export const handlersBidirecionais = {
  bidirecional_vincular_laudo,
  bidirecional_sincronizar_documento,
  bidirecional_alerta_prazo_critico,
  bidirecional_sincronizar_cliente,
  bidirecional_propagar_evento_critico,
}
