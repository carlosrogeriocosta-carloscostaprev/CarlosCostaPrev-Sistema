/**
 * Cliente da API pública DataJud (CNJ) — Consulta processual por número CNJ.
 *
 * Fonte: https://www.cnj.jus.br/sistemas/datajud/
 * Endpoint: POST https://api-publica.datajud.cnj.jus.br/api_publica_{tribunal}/_search
 *
 * Convenções alinhadas aos demais clientes de serviço externo do repo:
 * - Timeout explícito (API externa pode travar).
 * - Erros nunca incluem corpo da resposta (pode conter dados processuais).
 * - `getDatajudClient()` retorna null quando a chave não está configurada,
 *   permitindo ao chamador degradar graciosamente com banner de configuração.
 * - A chave padrão do CNJ é pública e documentada, mas NÃO fica hardcoded:
 *   vem de DATAJUD_API_KEY.
 */

// ============================================
// TIPOS
// ============================================

/** Tribunais com endpoint público no DataJud (sufixo api_publica_{tribunal}). */
export type TribunalDataJud =
  | 'tst' | 'tse' | 'stj' | 'stm'
  | 'trf1' | 'trf2' | 'trf3' | 'trf4' | 'trf5' | 'trf6'
  | 'tjac' | 'tjal' | 'tjam' | 'tjap' | 'tjba' | 'tjce' | 'tjdft' | 'tjes' | 'tjgo'
  | 'tjma' | 'tjmg' | 'tjms' | 'tjmt' | 'tjpa' | 'tjpb' | 'tjpe' | 'tjpi' | 'tjpr'
  | 'tjrj' | 'tjrn' | 'tjro' | 'tjrr' | 'tjrs' | 'tjsc' | 'tjse' | 'tjsp' | 'tjto'

export interface MovimentacaoDataJud {
  dataHora: string
  nome: string
  codigo?: number
  complementosTabelados?: { nome: string; valor: string | number }[]
}

export interface OrgaoJulgadorDataJud {
  nome: string
  codigoMunicipioIBGE?: number
}

export interface ProcessoDataJud {
  numeroProcesso: string
  tribunal: string
  classe?: { nome: string; codigo?: number }
  sistema?: { nome: string }
  formato?: { nome: string }
  grau?: string
  dataHoraUltimaAtualizacao?: string
  dataAjuizamento?: string
  movimentos?: MovimentacaoDataJud[]
  orgaoJulgador?: OrgaoJulgadorDataJud
  assuntos?: { nome: string; codigo?: number; principal?: boolean }[]
}

interface HitDataJud {
  _source: ProcessoDataJud
}

interface RespostaSearchDataJud {
  took?: number
  hits?: { total?: { value: number } | number; hits?: HitDataJud[] }
}

// ============================================
// VALIDAÇÃO
// ============================================

/** Número CNJ: 20 dígitos (NNNNNNN-DD.AAAA.J.TR.OOOO sem máscara). */
export function normalizarNumeroCNJ(numero: string): string | null {
  const digitos = numero.replace(/\D/g, '')
  return digitos.length === 20 ? digitos : null
}

/**
 * Inferência de tribunal pelo dígito J.TR do número CNJ é best-effort:
 * prefira informar o tribunal explicitamente. Retorna null quando ambíguo.
 */
export function inferirTribunalDeNumeroCNJ(numero: string): TribunalDataJud | null {
  const n = normalizarNumeroCNJ(numero)
  if (!n) return null
  const tr = n.slice(14, 16)
  const mapaTrf: Record<string, TribunalDataJud> = {
    '01': 'trf1', '02': 'trf2', '03': 'trf3', '04': 'trf4', '05': 'trf5', '06': 'trf6',
  }
  // TJs estaduais: J=8, TR = código UF (TJSP=26, TJRJ=19, TJMG=13, ...)
  const mapaTj: Record<string, TribunalDataJud> = {
    '01': 'tjac', '02': 'tjal', '03': 'tjap', '04': 'tjam', '05': 'tjba', '06': 'tjce',
    '07': 'tjdft', '08': 'tjes', '09': 'tjgo', '10': 'tjma', '11': 'tjmt', '12': 'tjms',
    '13': 'tjmg', '14': 'tjpa', '15': 'tjpb', '16': 'tjpe', '17': 'tjpi', '18': 'tjpr',
    '19': 'tjrj', '20': 'tjrn', '21': 'tjrs', '22': 'tjro', '23': 'tjrr', '24': 'tjsc',
    '25': 'tjse', '26': 'tjsp', '27': 'tjto',
  }
  const j = n.slice(13, 14)
  if (j === '4') return mapaTrf[tr] ?? null
  if (j === '8') return mapaTj[tr] ?? null
  return null
}

// ============================================
// CLIENTE
// ============================================

const DATAJUD_BASE_URL = 'https://api-publica.datajud.cnj.jus.br'
const DATAJUD_TIMEOUT_MS = 15_000

export class DatajudClient {
  constructor(private readonly apiKey: string) {}

  private async fetchDatajud(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DATAJUD_TIMEOUT_MS)
    try {
      return await fetch(`${DATAJUD_BASE_URL}${path}`, { ...init, signal: controller.signal })
    } catch (error) {
      if (controller.signal.aborted) throw new Error('datajud_timeout')
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Busca um processo pelo número CNJ em um tribunal.
   * Retorna null quando não encontrado (0 hits); lança datajud_{status}
   * em falhas HTTP. O corpo da resposta nunca entra na exceção.
   */
  async consultarProcesso(
    tribunal: TribunalDataJud,
    numeroProcesso: string,
  ): Promise<ProcessoDataJud | null> {
    const numero = normalizarNumeroCNJ(numeroProcesso)
    if (!numero) throw new Error('datajud_numero_invalido')

    const res = await this.fetchDatajud(`/api_publica_${tribunal}/_search`, {
      method: 'POST',
      headers: {
        Authorization: `APIKey ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: { match: { numeroProcesso: numero } } }),
    })

    if (!res.ok) throw new Error(`datajud_${res.status}`)

    const body = (await res.json()) as RespostaSearchDataJud
    const hit = body.hits?.hits?.[0]
    return hit ? { ...hit._source, tribunal } : null
  }

  /**
   * Consulta inferindo o tribunal pelo número CNJ.
   * Lança 'datajud_tribunal_indeterminado' quando o número não permite inferência.
   */
  async consultarProcessoAuto(numeroProcesso: string): Promise<ProcessoDataJud | null> {
    const tribunal = inferirTribunalDeNumeroCNJ(numeroProcesso)
    if (!tribunal) throw new Error('datajud_tribunal_indeterminado')
    return this.consultarProcesso(tribunal, numeroProcesso)
  }

  /**
   * Retorna apenas movimentações mais novas que `desde` (ISO date string).
   * Útil para o detector de movimentação nova que emite
   * MOVIMENTACAO_PROCESSUAL_NOVA no event bus.
   */
  async movimentacoesNovas(
    tribunal: TribunalDataJud,
    numeroProcesso: string,
    desde: Date,
  ): Promise<MovimentacaoDataJud[]> {
    const proc = await this.consultarProcesso(tribunal, numeroProcesso)
    if (!proc?.movimentos) return []
    return proc.movimentos.filter((m) => {
      const t = Date.parse(m.dataHora)
      return !Number.isNaN(t) && t > desde.getTime()
    })
  }
}

/**
 * Cliente configurado via env, ou null quando ausente.
 * A ausência é um estado esperado em desenvolvimento — quem chama
 * deve exibir o aviso "DataJud não configurado" em vez de quebrar.
 */
export function getDatajudClient(): DatajudClient | null {
  const key = process.env.DATAJUD_API_KEY
  if (!key) return null
  return new DatajudClient(key)
}
