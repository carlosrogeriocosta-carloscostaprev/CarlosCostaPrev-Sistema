/**
 * Revisão de Peça Processual — Gap 2 (arcabe3 → nosso)
 *
 * Analisa uma peça (petição inicial, recurso, contestação) e produz:
 * - índice de risco 0-100
 * - classificação (Baixo/Médio/Alto/Crítico)
 * - erros de coerência, riscos jurídicos, formatação, red flags
 *
 * Decisão de arquitetura: o LLM NÃO decide. A análise é determinística —
 * se quiser um parecer de IA, alimente o mesmo esquema vindo de um agente,
 * mas o cálculo de risco e a recomendação de protocolo são SEMPRE feitos
 * por este módulo, nunca pelo modelo.
 */

import {
  zPecaAnalisavel,
  zAnalisePeca,
  TIPOS_PECA,
  type PecaAnalisavel,
  type AnalisePeca,
  type ErroCoerencia,
  type RiscoJuridico,
  type ProblemaFormatacao,
  type RedFlag,
  PESOS,
} from './tipos'

export { zPecaAnalisavel, zAnalisePeca }
export type { PecaAnalisavel, AnalisePeca }

// ============================================
// REGRAS DETERMINÍSTICAS (o "juiz" da análise)
// ============================================

interface Finding {
  titulo: string
  descricao: string
  localizacao: string
  impacto: string
  sugestao: string
  tipo: 'erro_coerencia' | 'risco_juridico' | 'problema_formatacao' | 'red_flag'
  gravidade: 'critica' | 'alta' | 'media' | 'baixa'
  urgencia?: 'alta' | 'media'
}

/** Expressões que, quando aparecem na peça, sinalizam problema automático */
const PADROES_RED_FLAG: { regex: RegExp; titulo: string; descricao: string; gravidade: 'critica' | 'alta'; urgencia: 'alta' | 'media' }[] = [
  {
    regex: /\b(?:valor da causa|valor da ação)\b[^.]{0,120}(?:diverge|!=|≠|não corresponde|inconsistente)[^.]*pedid/i,
    titulo: 'Valor da causa divergente do pedido',
    descricao: 'A soma dos pedidos não bate com o valor da causa declarado.',
    gravidade: 'critica',
    urgencia: 'alta',
  },
  {
    regex: /\bpedid[oa]\b[^.]{0,80}(?:omiss|faltam?|ausen)[^.]*(?:citação|tutela antecipada|justi[çc]a gratuita)/i,
    titulo: 'Pedido obrigatório ausente',
    descricao: 'Falta pedido expresso obrigatório para o tipo de ação.',
    gravidade: 'critica',
    urgencia: 'alta',
  },
  {
    regex: /\b(?:competência|juízo)\b[^.]{0,80}(?:divergent|incorret|errat|errad)/i,
    titulo: 'Competência potentially equivocada',
    descricao: 'O juízo indicado pode não ser o competente (matéria-previdenciária tem regras rígidas de foro).',
    gravidade: 'alta',
    urgencia: 'alta',
  },
]

/** Pedidos mínimos por tipo de ação */
const PEDIDOS_OBRIGATORIOS: Record<string, string[]> = {
  peticao_inicial: ['citação', 'tutela antecipada', 'justiça gratuita'],
  recurso_ordinario: [],
  contestacao: [],
}

/** Palavras que não devem estar na peça (neutro vs conclusivo) */
const PROIBIDO_AFIRMATIVO = [
  'nexo causal comprovado',
  'incapacidade confirmada',
  'o segurado tem direito a',
  'direito adquirido ao benefício',
]

function analisarInterno(peca: PecaAnalisavel): {
  erros: ErroCoerencia[]
  riscos: RiscoJuridico[]
  formatacao: ProblemaFormatacao[]
  redFlags: RedFlag[]
  score_base: number
} {
  const erros: ErroCoerencia[] = []
  const riscos: RiscoJuridico[] = []
  const formatacao: ProblemaFormatacao[] = []
  const redFlags: RedFlag[] = []

  const texto = peca.texto.toLowerCase()

  // ---- 1. Red flags por padrão de texto ----
  for (const p of PADROES_RED_FLAG) {
    if (p.regex.test(texto)) {
      redFlags.push({
        red_flag: p.titulo,
        descricao: p.descricao,
        gravidade: p.gravidade,
        urgencia: p.urgencia,
        recomendacao: 'Revisar antes de protocolar. Este ponto pode levar a indeferimento.',
      })
    }
  }

  // ---- 2. Pedidos obrigatórios por tipo ----
  const minimos = PEDIDOS_OBRIGATORIOS[peca.tipo] ?? []
  for (const pedido of minimos) {
    if (!texto.includes(pedido)) {
      redFlags.push({
        red_flag: `Pedido obrigatório ausente: ${pedido}`,
        descricao: `A peça do tipo '${peca.tipo}' deveria conter pedido expresso de "${pedido}".`,
        gravidade: 'critica',
        urgencia: 'alta',
        recomendacao: `Adicionar pedido expresso de ${pedido}.`,
      })
    }
  }

  // ---- 3. Erros de coerência (fatos vs pedidos) ----
  if (peca.pedidos?.length) {
    const pedidoValorTotal = peca.pedidos
      .filter((p) => p.valor != null)
      .reduce((s, p) => s + (p.valor ?? 0), 0)
    if (peca.valor_causa != null && pedidoValorTotal > 0 && Math.abs(peca.valor_causa - pedidoValorTotal) > 0.01) {
      erros.push({
        erro: `Valor da causa (R$ ${peca.valor_causa}) diverge da soma dos pedidos (R$ ${pedidoValorTotal})`,
        localizacao: 'campo "valor_causa" vs lista de pedidos',
        impacto: 'Competência e prescrição podem ser afetadas. Juiz pode questionar a causa.',
        sugestao: 'Revisar o cálculo e garantir coerência entre causa e pedidos.',
      })
    }

    for (const pedido of peca.pedidos) {
      if (!pedido.descricao && !pedido.tipo) {
        erros.push({
          erro: 'Pedido listado sem descrição nem tipo',
          localizacao: 'lista de pedidos',
          impacto: 'Pedido vazio vira volume morto e pode ser preterido.',
          sugestao: 'Descrever ou remover o pedido vazio.',
        })
      }
    }
  }

  // ---- 4. Riscos jurídicos ----
  if (!peca.fundamentacao || peca.fundamentacao.length < 120) {
    riscos.push({
      risco: 'Fundamentação muito curta ou ausente',
      fundamentacao: 'Art. 319 CPC + jurisprudência sobre pedido genérico — falta de causa de pedir leva à improcedência',
      probabilidade: 'alta',
      impacto: 'Indeferimento ou improcedência por falta de lastro fático-jurídico.',
      sugestao: 'Detalhar fatos, datas, provas e fundamentos legais aplicáveis.',
    })
  }
  if (!peca.documentos_ids?.length) {
    riscos.push({
      risco: 'Nenhum documento de prova anexado',
      fundamentacao: 'CPC exige prova mínima para pedido provável',
      probabilidade: 'alta',
      impacto: 'Pedido pode ser visto como especulativo.',
      sugestao: 'Anexar laudos, documentos administrativos ou testemunhas.',
    })
  }
  if (peca.tipo === 'peticao_inicial' && !texto.includes('limitação') && !texto.includes('decadênc')) {
    // não bloqueia, mas alerta: termos de prescrição ausentes
    riscos.push({
      risco: 'Não menciona prescrição/decadência',
      fundamentacao: 'Prequestionamento sobre prescrição do direito à ação',
      probabilidade: 'media',
      impacto: 'O juiz pode levantar de ofício; defesa difícil sem menção.',
      sugestao: 'Avaliar e mencionar a questão prescricional quando relevante.',
    })
  }

  // ---- 5. Problema de formatação ----
  if (!peca.texto.trim().match(/\d+\.\s/) && peca.texto.length > 500) {
    formatacao.push({
      problema: 'Falta numeração de itens/seções',
      localizacao: 'corpo do texto',
      sugestao: 'Adicionar numeração para facilitar leitura do juiz.',
    })
  }
  if (!peca.texto.trim().match(/(I\.|II\.|III\.|1º|2º)/) && peca.texto.length > 1000) {
    formatacao.push({
      problema: 'Falta seções com hierarquia (I., II. ou 1º, 2º)',
      localizacao: 'estrutura',
      sugestao: 'Dividir em seções com hierarquia clara.',
    })
  }

  // ---- 6. Palavras proibidas (tom da peça) ----
  for (const palavra of PROIBIDO_AFIRMATIVO) {
    if (texto.includes(palavra)) {
      erros.push({
        erro: `Afirmação conclusiva proibida: "${palavra}"`,
        localizacao: 'corpo do texto',
        impacto: 'O tom é de juiz/perito, não de advogado — pode ser lido como não probatório.',
        sugestao: `Reescrever em linguagem de pedido: "solicita-se..." ou "resta demonstrado, pelos documentos anexos, que...".`,
      })
    }
  }

  return { erros, riscos, formatacao, redFlags, score_base: 0 }
}

function calcularRisco(
  erros: ErroCoerencia[],
  riscos: RiscoJuridico[],
  formatacao: ProblemaFormatacao[],
  redFlags: RedFlag[]
): { indice: number; classificacao: 'Baixo' | 'Médio' | 'Alto' | 'Crítico' } {
  const score =
    redFlags.length * PESOS.red_flag +
    riscos.length * PESOS.risco +
    erros.length * PESOS.erro_coerencia +
    formatacao.length * PESOS.problema_formatacao

  const indice = Math.min(100, Math.max(0, score))
  let classificacao: 'Baixo' | 'Médio' | 'Alto' | 'Crítico'
  if (indice <= 30) classificacao = 'Baixo'
  else if (indice <= 60) classificacao = 'Médio'
  else if (indice <= 80) classificacao = 'Alto'
  else classificacao = 'Crítico'

  return { indice, classificacao }
}

// ============================================
// API PÚBLICA
// ============================================

/**
 * Analisa uma peça processual de forma determinística.
 *
 * O LLM pode ter sido usado para redigir/auxiliar, mas esta função calcula
 * o risco e a recomendação. A decisão de protocolar continua exigindo
 * approval humano (Interrupt) — isso é garantido fora daqui.
 */
export function analisarPeca(peca: PecaAnalisavel): AnalisePeca {
  const { erros, riscos, formatacao, redFlags } = analisarInterno(peca)
  const { indice, classificacao } = calcularRisco(erros, riscos, formatacao, redFlags)

  return {
    peca_id: peca.id,
    indice_risco: indice,
    classificacao,
    erros_coerencia: erros,
    riscos_juridicos: riscos,
    problemas_formatacao: formatacao,
    red_flags: redFlags,
    recomendacao: classificacao === 'Crítico' || classificacao === 'Alto'
      ? 'NÃO PROTOCOLAR antes de revisão do advogado responsável'
      : 'Revisar pontos críticos antes de protocolar',
    necessita_revisao_humana: classificacao !== 'Baixo',
  }
}

/** Valida um objeto arbitrário contra o schema da peça analisada */
export function validarPeca(data: unknown): PecaAnalisavel {
  const result = zPecaAnalisavel.safeParse(data)
  if (!result.success) {
    throw new Error(`Peça inválida: ${result.error.issues[0]?.message ?? 'erro desconhecido'}`)
  }
  return result.data
}

/** Valida um objeto arbitrário contra o schema da análise */
export function validarAnalise(data: unknown): AnalisePeca {
  const result = zAnalisePeca.safeParse(data)
  if (!result.success) {
    throw new Error(`Análise inválida: ${result.error.issues[0]?.message ?? 'erro desconhecido'}`)
  }
  return result.data
}
