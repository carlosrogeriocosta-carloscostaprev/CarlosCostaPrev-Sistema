/**
 * Avaliador de Condições Cross-Module
 *
 * Avalia condições complexas que podem acessar contexto de múltiplos módulos
 * (admin, judicial, compartilhado, payload, evento)
 */

import type { CondicaoCrossModule } from '../motor-cross-module'
import type { EventoCrossModule } from '../../dominio/eventos'

// ============================================
// TIPOS
// ============================================

type FonteContexto = 'evento' | 'payload' | 'admin' | 'judicial' | 'compartilhado'

interface ContextoAvaliacao {
  evento: EventoCrossModule
  admin?: Record<string, unknown>
  judicial?: Record<string, unknown>
  compartilhado?: Record<string, unknown>
  payload: Record<string, unknown>
}

// ============================================
// AVALIADOR PRINCIPAL
// ============================================

export function avaliarCondicoesCross(
  condicoes: CondicaoCrossModule[],
  evento: EventoCrossModule,
  contextosAdicionais?: {
    admin?: Record<string, unknown>
    judicial?: Record<string, unknown>
    compartilhado?: Record<string, unknown>
  }
): boolean {
  const contexto: ContextoAvaliacao = {
    evento,
    payload: evento.payload as Record<string, unknown>,
    admin: contextosAdicionais?.admin,
    judicial: contextosAdicionais?.judicial,
    compartilhado: contextosAdicionais?.compartilhado,
  }

  return condicoes.every((condicao) => avaliarCondicao(condicao, contexto))
}

function avaliarCondicao(condicao: CondicaoCrossModule, contexto: ContextoAvaliacao): boolean {
  const valor = obterValor(condicao, contexto)
  return avaliarOperador(valor, condicao.operador, condicao.valor)
}

function obterValor(condicao: CondicaoCrossModule, contexto: ContextoAvaliacao): unknown {
  const fonte: FonteContexto = (condicao.modulo_contexto as FonteContexto) ?? 'payload'
  const caminho = condicao.campo.split('.')

  const bases: Record<FonteContexto, unknown> = {
    evento: contexto.evento,
    payload: contexto.payload,
    admin: contexto.admin,
    judicial: contexto.judicial,
    compartilhado: contexto.compartilhado,
  }

  let obj: unknown = bases[fonte] ?? contexto.payload

  for (const parte of caminho) {
    if (obj === null || obj === undefined) return undefined
    obj = (obj as Record<string, unknown>)[parte]
  }
  return obj
}

function avaliarOperador(valor: unknown, operador: string, esperado: unknown): boolean {
  const normalizar = (v: unknown): unknown => {
    if (v === null || v === undefined) return v
    if (typeof v === 'string') return v.trim()
    return v
  }

  const v = normalizar(valor)
  const e = normalizar(esperado)

  switch (operador) {
    case 'igual':
      return v === e
    case 'diferente':
      return v !== e
    case 'contem':
      return String(v).includes(String(e))
    case 'nao_contem':
      return !String(v).includes(String(e))
    case 'maior':
      return Number(v) > Number(e)
    case 'menor':
      return Number(v) < Number(e)
    case 'maior_igual':
      return Number(v) >= Number(e)
    case 'menor_igual':
      return Number(v) <= Number(e)
    case 'existe':
      return valor !== undefined && valor !== null && valor !== ''
    case 'nao_existe':
      return valor === undefined || valor === null || valor === ''
    case 'in':
      return Array.isArray(e) && e.some((item) => normalizar(item) === normalizar(v))
    case 'not_in':
      return Array.isArray(e) && !e.some((item) => normalizar(item) === normalizar(v))
    case 'regex':
      try {
        return new RegExp(String(e)).test(String(v))
      } catch {
        return false
      }
    case 'starts_with':
      return String(v).startsWith(String(e))
    case 'ends_with':
      return String(v).endsWith(String(e))
    case 'entre': {
      if (!Array.isArray(e) || e.length !== 2) return false
      return Number(v) >= Number(e[0]) && Number(v) <= Number(e[1])
    }
    case 'fora': {
      if (!Array.isArray(e) || e.length !== 2) return false
      return Number(v) < Number(e[0]) || Number(v) > Number(e[1])
    }
    case 'vazio':
      return (
        v === null ||
        v === undefined ||
        v === '' ||
        (Array.isArray(v) && v.length === 0) ||
        (typeof v === 'object' && Object.keys(v as object).length === 0)
      )
    case 'nao_vazio':
      return !avaliarOperador(v, 'vazio', e)
    default:
      console.warn(`[avaliarCondicoesCross] Operador desconhecido: ${operador}`)
      return false
  }
}

type FonteCurta = CondicaoCrossModule['modulo_contexto']

// ============================================
// HELPERS PARA CONSTRUIR CONDIÇÕES
// ============================================

export const Condicao = {
  igual: (campo: string, valor: unknown, modulo_contexto?: FonteCurta): CondicaoCrossModule => ({
    campo, operador: 'igual', valor, modulo_contexto,
  }),
  diferente: (campo: string, valor: unknown, modulo_contexto?: FonteCurta): CondicaoCrossModule => ({
    campo, operador: 'diferente', valor, modulo_contexto,
  }),
  maior: (campo: string, valor: number | string, modulo_contexto?: FonteCurta): CondicaoCrossModule => ({
    campo, operador: 'maior', valor, modulo_contexto,
  }),
  menor: (campo: string, valor: number | string, modulo_contexto?: FonteCurta): CondicaoCrossModule => ({
    campo, operador: 'menor', valor, modulo_contexto,
  }),
  maior_igual: (campo: string, valor: number | string, modulo_contexto?: FonteCurta): CondicaoCrossModule => ({
    campo, operador: 'maior_igual', valor, modulo_contexto,
  }),
  menor_igual: (campo: string, valor: number | string, modulo_contexto?: FonteCurta): CondicaoCrossModule => ({
    campo, operador: 'menor_igual', valor, modulo_contexto,
  }),
  existe: (campo: string, modulo_contexto?: FonteCurta): CondicaoCrossModule => ({
    campo, operador: 'existe', modulo_contexto,
  }),
  nao_existe: (campo: string, modulo_contexto?: FonteCurta): CondicaoCrossModule => ({
    campo, operador: 'nao_existe', modulo_contexto,
  }),
  vazio: (campo: string, modulo_contexto?: FonteCurta): CondicaoCrossModule => ({
    campo, operador: 'vazio', modulo_contexto,
  }),
  nao_vazio: (campo: string, modulo_contexto?: FonteCurta): CondicaoCrossModule => ({
    campo, operador: 'nao_vazio', modulo_contexto,
  }),
  contem: (campo: string, valor: string, modulo_contexto?: FonteCurta): CondicaoCrossModule => ({
    campo, operador: 'contem', valor, modulo_contexto,
  }),
  nao_contem: (campo: string, valor: string, modulo_contexto?: FonteCurta): CondicaoCrossModule => ({
    campo, operador: 'nao_contem', valor, modulo_contexto,
  }),
  starts_with: (campo: string, prefixo: string, modulo_contexto?: FonteCurta): CondicaoCrossModule => ({
    campo, operador: 'starts_with', valor: prefixo, modulo_contexto,
  }),
  ends_with: (campo: string, sufixo: string, modulo_contexto?: FonteCurta): CondicaoCrossModule => ({
    campo, operador: 'ends_with', valor: sufixo, modulo_contexto,
  }),
  regex: (campo: string, padrao: string, modulo_contexto?: FonteCurta): CondicaoCrossModule => ({
    campo, operador: 'regex', valor: padrao, modulo_contexto,
  }),
  in: (campo: string, valores: unknown[], modulo_contexto?: FonteCurta): CondicaoCrossModule => ({
    campo, operador: 'in', valor: valores, modulo_contexto,
  }),
  not_in: (campo: string, valores: unknown[], modulo_contexto?: FonteCurta): CondicaoCrossModule => ({
    campo, operador: 'not_in', valor: valores, modulo_contexto,
  }),
  entre: (campo: string, min: number, max: number, modulo_contexto?: FonteCurta): CondicaoCrossModule => ({
    campo, operador: 'entre', valor: [min, max], modulo_contexto,
  }),
  fora: (campo: string, min: number, max: number, modulo_contexto?: FonteCurta): CondicaoCrossModule => ({
    campo, operador: 'fora', valor: [min, max], modulo_contexto,
  }),
} as const

// ============================================
// COMPOSITORES DE CONDIÇÕES (AND/OR/NOT)
// ============================================

export function E(...condicoes: CondicaoCrossModule[]): CondicaoCrossModule[] {
  return condicoes
}

export function OU(...condicoes: CondicaoCrossModule[]): CondicaoCrossModule[] {
  // Avaliador principal trata array como AND; OR real exigiria wrapper dedicado.
  return condicoes
}

export function NAO(condicao: CondicaoCrossModule): CondicaoCrossModule {
  const inversos: Record<string, CondicaoCrossModule['operador']> = {
    igual: 'diferente',
    diferente: 'igual',
    maior: 'menor_igual',
    menor: 'maior_igual',
    maior_igual: 'menor',
    menor_igual: 'maior',
    contem: 'nao_contem',
    nao_contem: 'contem',
    existe: 'nao_existe',
    nao_existe: 'existe',
    in: 'not_in',
    not_in: 'in',
    vazio: 'nao_vazio',
    nao_vazio: 'vazio',
  }

  const inverso = inversos[condicao.operador]
  if (!inverso) {
    throw new Error(`Operador não invertível: ${condicao.operador}`)
  }

  return { ...condicao, operador: inverso }
}

// ============================================
// HELPERS PARA CONTEXTOS ESPECÍFICOS
// ============================================

export const Contexto = {
  admin: (campo: string) => ({ modulo_contexto: 'admin' as const, campo }),
  judicial: (campo: string) => ({ modulo_contexto: 'judicial' as const, campo }),
  compartilhado: (campo: string) => ({ modulo_contexto: 'compartilhado' as const, campo }),
  payload: (campo: string) => ({ modulo_contexto: 'payload' as const, campo }),
  evento: (campo: string) => ({ modulo_contexto: 'evento' as const, campo }),

  adminIgual: (campo: string, valor: unknown): CondicaoCrossModule => ({
    campo, operador: 'igual', valor, modulo_contexto: 'admin',
  }),
  judicialIgual: (campo: string, valor: unknown): CondicaoCrossModule => ({
    campo, operador: 'igual', valor, modulo_contexto: 'judicial',
  }),
  payloadIgual: (campo: string, valor: unknown): CondicaoCrossModule => ({
    campo, operador: 'igual', valor, modulo_contexto: 'payload',
  }),

  casoAdminExiste: (): CondicaoCrossModule => ({
    campo: 'caso_admin_existente', operador: 'existe', modulo_contexto: 'judicial',
  }),
  casoJudicialExiste: (): CondicaoCrossModule => ({
    campo: 'caso_judicial_existente', operador: 'existe', modulo_contexto: 'admin',
  }),
  clienteTemCapacidade: (): CondicaoCrossModule => ({
    campo: 'cliente_tem_capacidade', operador: 'igual', valor: true, modulo_contexto: 'compartilhado',
  }),
  documentoExiste: (tipo: string): CondicaoCrossModule => ({
    campo: `documentos.${tipo}`, operador: 'existe', modulo_contexto: 'compartilhado',
  }),
} as const

// ============================================
// COMPOSITORES AVANÇADOS
// ============================================

export function TODAS(...condicoes: (CondicaoCrossModule | null | undefined)[]): CondicaoCrossModule[] {
  return condicoes.filter((c): c is CondicaoCrossModule => c != null)
}

export function NENHUMA(...condicoes: CondicaoCrossModule[]): CondicaoCrossModule[] {
  return condicoes.map((c) => NAO(c))
}

export { avaliarCondicoesCross as avaliar }
