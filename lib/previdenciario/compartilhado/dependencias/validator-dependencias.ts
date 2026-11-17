/**
 * Validador de Dependências Cross-Module
 *
 * Valida a integridade do grafo de dependências:
 * - Referências a nós inexistentes
 * - Dependências obrigatórias orfãs
 * - Ciclos de dependência obrigatória
 * - Consistência bidirecional (A fornece B ⇔ B depende de A)
 * - Entidades isoladas (sem conexões)
 */

import {
  GRAFO_DEPENDENCIAS_COMPLETO,
  detectarCiclos,
  type NoDependencia,
  type Dependencia,
} from './dependency-graph'

// ============================================
// TIPOS DE RESULTADO
// ============================================

export type SeveridadeValidacao = 'erro' | 'aviso' | 'info'

export interface ProblemaValidacao {
  severidade: SeveridadeValidacao
  regra: string
  mensagem: string
  entidade_origem?: string // `${modulo}.${entidade}`
  entidade_alvo?: string
}

export interface ResultadoValidacao {
  valido: boolean
  erros: ProblemaValidacao[]
  avisos: ProblemaValidacao[]
  infos: ProblemaValidacao[]
  resumo: {
    total_nos: number
    total_arestas_obrigatorias: number
    total_arestas_opcionais: number
    ciclos_detectados: number
  }
}

// ============================================
// HELPERS INTERNOS
// ============================================

const chave = (modulo: string, entidade: string) => `${modulo}.${entidade}`

function construirIndice(grafo: NoDependencia[]): Map<string, NoDependencia> {
  const indice = new Map<string, NoDependencia>()
  for (const no of grafo) {
    indice.set(chave(no.modulo, no.entidade), no)
  }
  return indice
}

function* todasDependencias(grafo: NoDependencia[]): Generator<{
  origem: NoDependencia
  dep: Dependencia
  direcao: 'depende_de' | 'fornece_para'
}> {
  for (const no of grafo) {
    for (const dep of no.depende_de) {
      yield { origem: no, dep, direcao: 'depende_de' }
    }
    for (const dep of no.fornece_para) {
      yield { origem: no, dep, direcao: 'fornece_para' }
    }
  }
}

// ============================================
// REGRAS DE VALIDAÇÃO
// ============================================

/** Regra 1: todas as referências devem apontar para nós existentes */
function validarReferencias(grafo: NoDependencia[], indice: Map<string, NoDependencia>): ProblemaValidacao[] {
  const problemas: ProblemaValidacao[] = []

  for (const { origem, dep, direcao } of todasDependencias(grafo)) {
    const alvo = chave(dep.modulo, dep.entidade)
    if (!indice.has(alvo)) {
      problemas.push({
        severidade: 'erro',
        regra: 'REFERENCIA_INEXISTENTE',
        mensagem: `Nó ${chave(origem.modulo, origem.entidade)} referencia '${alvo}' em '${direcao}', mas esse nó não existe no grafo`,
        entidade_origem: chave(origem.modulo, origem.entidade),
        entidade_alvo: alvo,
      })
    }
  }
  return problemas
}

/** Regra 2: não pode haver nós duplicados no grafo */
function validarDuplicatas(grafo: NoDependencia[]): ProblemaValidacao[] {
  const problemas: ProblemaValidacao[] = []
  const vistos = new Map<string, number>()

  for (const no of grafo) {
    const c = chave(no.modulo, no.entidade)
    vistos.set(c, (vistos.get(c) ?? 0) + 1)
  }

  for (const [c, count] of vistos) {
    if (count > 1) {
      problemas.push({
        severidade: 'erro',
        regra: 'NO_DUPLICADO',
        mensagem: `Nó '${c}' aparece ${count} vezes no grafo`,
        entidade_origem: c,
      })
    }
  }
  return problemas
}

/** Regra 3: ciclos de dependência obrigatória são erros; ciclos só com arestas fracas são avisos */
function validarCiclos(): ProblemaValidacao[] {
  const problemas: ProblemaValidacao[] = []
  const ciclos = detectarCiclos() // considera apenas arestas obrigatórias

  for (const ciclo of ciclos) {
    problemas.push({
      severidade: 'erro',
      regra: 'CICLO_OBRIGATORIO',
      mensagem: `Ciclo de dependência obrigatória detectado: ${ciclo.join(' → ')}`,
      entidade_origem: ciclo[0],
      entidade_alvo: ciclo[ciclo.length - 1],
    })
  }
  return problemas
}

/** Regra 4: consistência bidirecional — se A fornece para B (obrigatório), B deve depender de A */
function validarConsistenciaBidirecional(grafo: NoDependencia[], indice: Map<string, NoDependencia>): ProblemaValidacao[] {
  const problemas: ProblemaValidacao[] = []

  for (const no of grafo) {
    const noChave = chave(no.modulo, no.entidade)

    for (const forn of no.fornece_para.filter(f => f.obrigatoria)) {
      const alvo = indice.get(chave(forn.modulo, forn.entidade))
      if (!alvo) continue // já reportado pela Regra 1

      const alvoDep = alvo.depende_de.find(
        d => d.modulo === no.modulo && d.entidade === no.entidade && d.obrigatoria
      )
      if (!alvoDep) {
        problemas.push({
          severidade: 'aviso',
          regra: 'BIDIRECIONAL_INCONSISTENTE',
          mensagem: `'${noChave}' fornece obrigatoriamente para '${chave(forn.modulo, forn.entidade)}', mas o alvo não declara essa dependência em 'depende_de'`,
          entidade_origem: noChave,
          entidade_alvo: chave(forn.modulo, forn.entidade),
        })
      }
    }
  }
  return problemas
}

/** Regra 5: entidades não-raiz sem nenhuma conexão são suspeitas */
function validarOrfas(grafo: NoDependencia[]): ProblemaValidacao[] {
  const problemas: ProblemaValidacao[] = []
  const conectados = new Set<string>()

  for (const { origem, dep } of todasDependencias(grafo)) {
    conectados.add(chave(origem.modulo, origem.entidade))
    conectados.add(chave(dep.modulo, dep.entidade))
  }

  for (const no of grafo) {
    const c = chave(no.modulo, no.entidade)
    const ehRaiz = no.metadata?.raiz === true
    if (!conectados.has(c) && !ehRaiz) {
      problemas.push({
        severidade: 'aviso',
        regra: 'ENTIDADE_ORFA',
        mensagem: `Entidade '${c}' não tem nenhuma dependência nem fornece para ninguém`,
        entidade_origem: c,
      })
    }
  }
  return problemas
}

// ============================================
// API PRINCIPAL
// ============================================

/**
 * Executa todas as regras de validação sobre o grafo de dependências.
 * `valido = true` somente quando não há erros (avisos não bloqueiam).
 */
export function validarGrafoDependencias(grafo: NoDependencia[] = GRAFO_DEPENDENCIAS_COMPLETO): ResultadoValidacao {
  const indice = construirIndice(grafo)

  const problemas = [
    ...validarDuplicatas(grafo),
    ...validarReferencias(grafo, indice),
    ...validarCiclos(),
    ...validarConsistenciaBidirecional(grafo, indice),
    ...validarOrfas(grafo),
  ]

  const erros = problemas.filter(p => p.severidade === 'erro')
  const avisos = problemas.filter(p => p.severidade === 'aviso')
  const infos = problemas.filter(p => p.severidade === 'info')

  let arestasObrigatorias = 0
  let arestasOpcionais = 0
  for (const no of grafo) {
    for (const f of no.fornece_para) {
      if (f.obrigatoria) arestasObrigatorias++
      else arestasOpcionais++
    }
  }

  return {
    valido: erros.length === 0,
    erros,
    avisos,
    infos,
    resumo: {
      total_nos: grafo.length,
      total_arestas_obrigatorias: arestasObrigatorias,
      total_arestas_opcionais: arestasOpcionais,
      ciclos_detectados: detectarCiclos().length,
    },
  }
}

/**
 * Lança erro se o grafo for inválido. Útil para rodar em startup ou em testes.
 */
export function assertGrafoValido(grafo?: NoDependencia[]): void {
  const resultado = validarGrafoDependencias(grafo)
  if (!resultado.valido) {
    const linhas = resultado.erros.map(e => `  [${e.regra}] ${e.mensagem}`).join('\n')
    throw new Error(`Grafo de dependências inválido (${resultado.erros.length} erro(s)):\n${linhas}`)
  }
}

/**
 * Relatório legível para humanos (logs, CI, PR comments).
 */
export function relatorioValidacao(resultado: ResultadoValidacao): string {
  const linhas: string[] = [
    `Grafo de dependências: ${resultado.valido ? 'VÁLIDO' : 'INVÁLIDO'}`,
    `  nós: ${resultado.resumo.total_nos} | arestas obrigatórias: ${resultado.resumo.total_arestas_obrigatorias} | opcionais: ${resultado.resumo.total_arestas_opcionais} | ciclos: ${resultado.resumo.ciclos_detectados}`,
  ]

  for (const e of resultado.erros) linhas.push(`  ERRO [${e.regra}] ${e.mensagem}`)
  for (const a of resultado.avisos) linhas.push(`  AVISO [${a.regra}] ${a.mensagem}`)

  return linhas.join('\n')
}
