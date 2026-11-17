/**
 * Testes do cliente DataJud (CNJ)
 *
 * Cobrem: validação de número CNJ, inferência de tribunal, resposta 200/0 hits,
 * erros HTTP sem vazar corpo na exceção, e timeout.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DatajudClient,
  inferirTribunalDeNumeroCNJ,
  normalizarNumeroCNJ,
} from './datajud-client'

const NUMERO = '00008323520184013202' // 20 dígitos válidos (ex. doc DataJud)

function respostaCom(processo: unknown) {
  return new Response(
    JSON.stringify({
      took: 1,
      hits: { total: { value: processo ? 1 : 0 }, hits: processo ? [{ _source: processo }] : [] },
    }),
    { status: 200 },
  )
}

describe('normalizarNumeroCNJ', () => {
  it('aceita 20 dígitos puros ou mascarados', () => {
    expect(normalizarNumeroCNJ(NUMERO)).toBe(NUMERO)
    expect(normalizarNumeroCNJ('0000832-35.2018.4.01.3202')).toBe('00008323520184013202')
  })

  it('rejeita tamanhos errados', () => {
    expect(normalizarNumeroCNJ('123')).toBeNull()
    expect(normalizarNumeroCNJ('')).toBeNull()
    expect(normalizarNumeroCNJ('123456789012345678901')).toBeNull()
  })
})

describe('inferirTribunalDeNumeroCNJ', () => {
  it('infere TRF pelo J=4', () => {
    // 0000832-35.2018.4.01.3202 → J=4, TR=01 → trf1
    expect(inferirTribunalDeNumeroCNJ('00008323520184013202')).toBe('trf1')
  })

  it('infere TJ estadual pelo J=8 (TJSP=26)', () => {
    expect(inferirTribunalDeNumeroCNJ('00000000020268260000')).toBe('tjsp')
  })

  it('retorna null para segmentos fora do catálogo', () => {
    expect(inferirTribunalDeNumeroCNJ('00000000020209000000')).toBeNull()
    expect(inferirTribunalDeNumeroCNJ('123')).toBeNull()
  })
})

describe('DatajudClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  const processoBase = {
    numeroProcesso: NUMERO,
    classe: { nome: 'Benefício Previdenciário' },
    dataAjuizamento: '2018-01-15',
    movimentos: [
      { dataHora: '2026-01-10T10:00:00.000Z', nome: 'Juntada de petição' },
      { dataHora: '2026-02-01T10:00:00.000Z', nome: 'Sentença' },
    ],
  }

  it('consulta retorna o processo com tribunal preenchido', async () => {
    const stub = vi.fn().mockResolvedValue(respostaCom(processoBase))
    vi.stubGlobal('fetch', stub)

    // consulta com tribunal explícito
    const cliente = new DatajudClient('chave-teste')
    const proc = await cliente.consultarProcesso('trf1', NUMERO)

    expect(proc?.numeroProcesso).toBe(NUMERO)
    expect(proc?.tribunal).toBe('trf1')
    expect(stub).toHaveBeenCalledWith(
      expect.stringContaining('https://api-publica.datajud.cnj.jus.br/api_publica_trf1/_search'),
      expect.objectContaining({ method: 'POST' }),
    )
    // chave vai no header Authorization, nunca na URL
    const chamada = stub.mock.calls[0]!
    const init = chamada[1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('APIKey chave-teste')
  })

  it('retorna null quando não há hits', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respostaCom(null)))
    const cliente = new DatajudClient('chave-teste')
    expect(await cliente.consultarProcesso('tjsp', NUMERO)).toBeNull()
  })

  it('rejeita número inválido sem chamar a rede', async () => {
    const stub = vi.fn()
    vi.stubGlobal('fetch', stub)
    const cliente = new DatajudClient('chave-teste')
    await expect(cliente.consultarProcesso('trf1', 'abc')).rejects.toThrow('datajud_numero_invalido')
    expect(stub).not.toHaveBeenCalled()
  })

  it('erro HTTP não vaza corpo da resposta na exceção', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('segredo processual', { status: 500 })),
    )
    const cliente = new DatajudClient('chave-teste')
    await expect(cliente.consultarProcesso('trf1', NUMERO)).rejects.toThrow('datajud_500')
    await expect(cliente.consultarProcesso('trf1', NUMERO)).rejects.not.toThrow('segredo')
  })

  it('consultarProcessoAuto inferindo tribunal e lançando quando indeterminado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respostaCom(processoBase)))
    const cliente = new DatajudClient('chave-teste')

    const proc = await cliente.consultarProcessoAuto('00008323520184013202')
    expect(proc?.tribunal).toBe('trf1')

    const stub = vi.fn()
    vi.stubGlobal('fetch', stub)
    await expect(cliente.consultarProcessoAuto('00000000020209000000')).rejects.toThrow(
      'datajud_tribunal_indeterminado',
    )
    expect(stub).not.toHaveBeenCalled()
  })

  it('movimentacoesNovas filtra corretamente pela data de corte', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respostaCom(processoBase)))
    const cliente = new DatajudClient('chave-teste')
    const novas = await cliente.movimentacoesNovas('trf1', NUMERO, new Date('2026-01-15'))
    expect(novas).toHaveLength(1)
    expect(novas[0]!.nome).toBe('Sentença')
  })

  it('movimentacoesNovas retorna vazio quando o processo não existe', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respostaCom(null)))
    const cliente = new DatajudClient('chave-teste')
    expect(await cliente.movimentacoesNovas('trf1', NUMERO, new Date())).toEqual([])
  })

  it('interrompe consulta que excede o timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
          }),
      ),
    )

    const cliente = new DatajudClient('chave-teste')
    const promise = cliente.consultarProcesso('trf1', NUMERO)
    vi.advanceTimersByTime(20_000)
    await expect(promise).rejects.toThrow('datajud_timeout')
  })
})
