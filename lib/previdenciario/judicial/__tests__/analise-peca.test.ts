/**
 * Testes do analisador de peça processual (judicial/analise-peca)
 *
 * Cobrem: schema Zod, cálculo de risco, classificação e os gates que
 * decidem "protocolar vs revisar".
 */
import { describe, expect, it } from 'vitest'
import { analisarPeca, validarAnalise, validarPeca } from '../analise-peca'
import { zPecaAnalisavel } from '../tipos'

function pecaBase() {
  return {
    id: 'peca-1',
    tipo: 'peticao_inicial' as const,
    texto: `
      I. Da ação
      1. Requer-se a citação do réu.
      2. Concessão de tutela antecipada.
      3. Justiça gratuita.
      O valor da causa é estimado em R$ 50.000,00, condizente com os pedidos.
      A fundamentação detalha fatos, datas e provas suficientes para o pedido.
    `.repeat(4),
    valor_causa: 50000,
    pedidos: [{ descricao: 'Conceder benefício', valor: 50000 }],
    fundamentacao: 'Detalhamento completo de fatos, datas e provas com lastro suficiente para aceitar o pedido.',
    documentos_ids: ['doc-1'],
  }
}

describe('analisarPeca — peça bem formada', () => {
  it('classifica como Baixo quando tudo está certo', () => {
    const peca = pecaBase()
    const r = analisarPeca(peca)
    expect(r.classificacao).toBe('Baixo')
    expect(r.indice_risco).toBeLessThanOrEqual(30)
    expect(r.necessita_revisao_humana).toBe(false)
  })

  it('não levanta red flag quando pedidos obrigatórios estão presentes', () => {
    const r = analisarPeca(pecaBase())
    expect(r.red_flags).toHaveLength(0)
  })
})

describe('analisarPeca — sinais de perigo', () => {
  it('levanta red flag quando à falta pedido de citação', () => {
    const peca = pecaBase()
    peca.texto = 'Ação de concessão de benefício sem instrução.' // sem citação/tutela/jg
    const r = analisarPeca(peca)
    expect(r.red_flags.length).toBeGreaterThan(0)
    expect(r.red_flags.some((f) => f.red_flag.includes('citação'))).toBe(true)
  })

  it('levanta erro de coerência quando valor da causa diverge dos pedidos', () => {
    const peca = pecaBase()
    peca.valor_causa = 99999 // diverge dos pedidos (50k)
    const r = analisarPeca(peca)
    expect(r.erros_coerencia.some((e) => e.erro.includes('diverge'))).toBe(true)
  })

  it('levanta risco jurídico quando fundamentação é muito curta', () => {
    const peca = pecaBase()
    peca.fundamentacao = 'Fatos simplificados.'
    const r = analisarPeca(peca)
    expect(r.riscos_juridicos.some((r) => r.risco.includes('curta'))).toBe(true)
  })

  it('marca necessita_revisao_humana quando classificação não é Baixo', () => {
    const peca = pecaBase()
    peca.texto += ' nexo causal comprovado, incapacidade confirmada, segurado tem direito ao benefício'
    const r = analisarPeca(peca)
    expect(r.classificacao).not.toBe('Baixo') // alto o bastante para exigir revisão
    expect(r.necessita_revisao_humana).toBe(true)
    expect(r.recomendacao).toMatch(/revis/i)
  })

  it('proíbe afirmações de juiz/perito no texto (tom inadequado)', () => {
    const peca = pecaBase()
    peca.texto += 'o nexo causal comprovado. incapacidade confirmada.'
    const r = analisarPeca(peca)
    expect(r.erros_coerencia.some((e) => e.erro.includes('nexo causal comprovado'))).toBe(true)
  })
})

describe('validarPeca / validarAnalise — Zod no gate', () => {
  it('aceita peça válida e rejeita inválida', () => {
    expect(() => validarPeca(pecaBase())).not.toThrow()
    expect(() => validarPeca({})).toThrow('Peça inválida')
  })

  it('aceita análise válida e rejeita inválida', () => {
    const r = analisarPeca(pecaBase())
    expect(() => validarAnalise(r)).not.toThrow()
    expect(() => validarAnalise({ indice_risco: 999 })).toThrow('Análise inválida')
  })

  it('rejeita índice fora de 0-100', () => {
    expect(() =>
      validarAnalise({
        peca_id: 'x',
        indice_risco: 101,
        classificacao: 'Baixo',
        erros_coerencia: [],
        riscos_juridicos: [],
        problemas_formatacao: [],
        red_flags: [],
        recomendacao: 'x',
        necessita_revisao_humana: false,
      })
    ).toThrow()
  })
})
