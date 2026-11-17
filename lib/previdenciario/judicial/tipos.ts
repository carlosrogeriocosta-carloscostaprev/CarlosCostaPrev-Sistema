/**
 * Tipos da Análise de Peça Processual (Judicial)
 *
 * Modelado para cobrir o ciclo: peça → análise determinística → veredicto
 * de protocolo, com tipos explícitos (sem any) e Zod para runtime.
 */
import { z } from 'zod'

// ============================================
// SCHEMAS — peça analisada
// ============================================

export const TIPOS_PECA = [
  'peticao_inicial',
  'recurso_ordinario',
  'recurso_especial',
  'agravo',
  'embargos',
  'contestacao',
  'outro',
] as const

export const zPedido = z.object({
  descricao: z.string(),
  tipo: z.enum(['condenacao', 'declaratoria', 'constitutiva', 'mandamental', 'executiva']).optional(),
  valor: z.number().optional(),
})

export const zPecaAnalisavel = z.object({
  id: z.string(),
  tipo: z.enum(TIPOS_PECA),
  titulo: z.string().optional(),
  texto: z.string(),
  valor_causa: z.number().optional(),
  pedidos: z.array(zPedido).optional(),
  fundamentacao: z.string().optional(),
  documentos_ids: z.array(z.string()).optional(),
})

export type Pedido = z.infer<typeof zPedido>
export type PecaAnalisavel = z.infer<typeof zPecaAnalisavel>

// ============================================
// SCHEMAS — resultado da análise
// ============================================

export const zErroCoerencia = z.object({
  erro: z.string(),
  localizacao: z.string(),
  impacto: z.string(),
  sugestao: z.string(),
})

export const zRiscoJuridico = z.object({
  risco: z.string(),
  fundamentacao: z.string(),
  probabilidade: z.enum(['alta', 'media', 'baixa']),
  impacto: z.string(),
  sugestao: z.string(),
})

export const zProblemaFormatacao = z.object({
  problema: z.string(),
  localizacao: z.string(),
  sugestao: z.string(),
})

export const zRedFlag = z.object({
  red_flag: z.string(),
  descricao: z.string(),
  gravidade: z.enum(['critica', 'alta', 'media', 'baixa']),
  urgencia: z.enum(['alta', 'media']),
  recomendacao: z.string(),
})

export const zAnalisePeca = z.object({
  peca_id: z.string(),
  indice_risco: z.number().int().min(0).max(100),
  classificacao: z.enum(['Baixo', 'Médio', 'Alto', 'Crítico']),
  erros_coerencia: z.array(zErroCoerencia),
  riscos_juridicos: z.array(zRiscoJuridico),
  problemas_formatacao: z.array(zProblemaFormatacao),
  red_flags: z.array(zRedFlag),
  recomendacao: z.string(),
  necessita_revisao_humana: z.boolean(),
})

export type ErroCoerencia = z.infer<typeof zErroCoerencia>
export type RiscoJuridico = z.infer<typeof zRiscoJuridico>
export type ProblemaFormatacao = z.infer<typeof zProblemaFormatacao>
export type RedFlag = z.infer<typeof zRedFlag>
export type AnalisePeca = z.infer<typeof zAnalisePeca>

// ============================================
// PESOS (tabela de decisão — podem ser movidos para config)
// ============================================

export const PESOS = {
  red_flag: 20,
  risco: 10,
  erro_coerencia: 8,
  problema_formatacao: 2,
} as const
