/**
 * Grafo de Dependências Cross-Module
 * 
 * Mapeia dependências entre entidades dos módulos Admin, Judicial e Compartilhado
 * Permite validação, resolução de ordem e visualização
 */

// ============================================
// TIPOS
// ============================================

export type ModuloNome = 'administrativo' | 'judicial' | 'compartilhado'
export type TipoDependencia = 'forte' | 'fraca' | 'eventual' | 'bidirecional'

export interface NoDependencia {
  modulo: ModuloNome
  entidade: string
  descricao: string
  depende_de: Dependencia[]
  fornece_para: Dependencia[]
  metadata?: Record<string, unknown>
}

export interface Dependencia {
  modulo: ModuloNome
  entidade: string
  tipo: TipoDependencia
  descricao?: string
  obrigatoria: boolean
  cascade_delete?: boolean
}

export interface ArestaDependencia {
  de: string // `${modulo}.${entidade}`
  para: string // `${modulo}.${entidade}`
  tipo: TipoDependencia
  obrigatoria: boolean
  descricao?: string
}

// ============================================
// GRAFO COMPLETO DE DEPENDÊNCIAS
// ============================================

export const GRAFO_DEPENDENCIAS_COMPLETO: NoDependencia[] = [
  // ============================================
  // NÚCLEO COMPARTILHADO (Raiz)
  // ============================================
  {
    modulo: 'compartilhado',
    entidade: 'caso_previdenciario',
    descricao: 'Caso raiz que unifica admin + judicial',
    depende_de: [],
    fornece_para: [
      { modulo: 'administrativo', entidade: 'caso_administrativo', tipo: 'forte', descricao: 'Caso admin deriva do caso unificado', obrigatoria: true },
      { modulo: 'judicial', entidade: 'caso_judicial', tipo: 'forte', descricao: 'Caso judicial deriva do caso unificado', obrigatoria: true },
      { modulo: 'compartilhado', entidade: 'documento', tipo: 'forte', descricao: 'Documentos pertencem ao caso', obrigatoria: true },
      { modulo: 'compartilhado', entidade: 'prazos_unificados', tipo: 'forte', descricao: 'Prazos consolidados do caso', obrigatoria: true },
    ],
    metadata: { raiz: true, prioridade: 0 },
  },

  {
    modulo: 'compartilhado',
    entidade: 'cliente',
    descricao: 'Cliente único para ambos os módulos',
    depende_de: [],
    fornece_para: [
      { modulo: 'administrativo', entidade: 'caso_administrativo', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'caso_judicial', tipo: 'forte', obrigatoria: true },
      { modulo: 'compartilhado', entidade: 'documento', tipo: 'forte', obrigatoria: true },
    ],
  },

  {
    modulo: 'compartilhado',
    entidade: 'documento',
    descricao: 'Documentos compartilhados entre módulos',
    depende_de: [
      { modulo: 'compartilhado', entidade: 'caso_previdenciario', tipo: 'forte', obrigatoria: true },
    ],
    fornece_para: [
      { modulo: 'administrativo', entidade: 'caso_administrativo', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'caso_judicial', tipo: 'forte', obrigatoria: true },
      { modulo: 'compartilhado', entidade: 'prazos_unificados', tipo: 'fraca', obrigatoria: false },
    ],
  },

  {
    modulo: 'compartilhado',
    entidade: 'prazos_unificados',
    descricao: 'Visão unificada de prazos (admin + judicial)',
    depende_de: [
      { modulo: 'administrativo', entidade: 'prazos_administrativos', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'prazos_processuais', tipo: 'forte', obrigatoria: true },
    ],
    fornece_para: [
      { modulo: 'administrativo', entidade: 'alertas_prazo', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'alertas_prazo', tipo: 'forte', obrigatoria: true },
      { modulo: 'compartilhado', entidade: 'alertas_criticos', tipo: 'forte', obrigatoria: true },
    ],
  },

  {
    modulo: 'compartilhado',
    entidade: 'perito',
    descricao: 'Cadastro único de peritos',
    depende_de: [],
    fornece_para: [
      { modulo: 'administrativo', entidade: 'pericia_administrativa', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'pericia_judicial', tipo: 'forte', obrigatoria: true },
    ],
  },

  {
    modulo: 'compartilhado',
    entidade: 'beneficio',
    descricao: 'Catálogo de benefícios (12 tipos)',
    depende_de: [],
    fornece_para: [
      { modulo: 'administrativo', entidade: 'requerimento_admin', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'pedido_judicial', tipo: 'forte', obrigatoria: true },
    ],
  },

  {
    modulo: 'compartilhado',
    entidade: 'servico',
    descricao: 'Catálogo de serviços (13 serviços)',
    depende_de: [],
    fornece_para: [
      { modulo: 'administrativo', entidade: 'caso_administrativo', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'caso_judicial', tipo: 'forte', obrigatoria: true },
    ],
  },

  // ============================================
  // MÓDULO ADMINISTRATIVO (INSS)
  // ============================================
  {
    modulo: 'administrativo',
    entidade: 'caso_administrativo',
    descricao: 'Caso na esfera administrativa (INSS)',
    depende_de: [
      { modulo: 'compartilhado', entidade: 'caso_previdenciario', tipo: 'forte', obrigatoria: true },
      { modulo: 'compartilhado', entidade: 'cliente', tipo: 'forte', obrigatoria: true },
    ],
    fornece_para: [
      { modulo: 'judicial', entidade: 'caso_judicial', tipo: 'forte', obrigatoria: true, descricao: 'Origem do caso judicial' },
      { modulo: 'administrativo', entidade: 'requerimento_admin', tipo: 'forte', obrigatoria: true },
      { modulo: 'administrativo', entidade: 'recurso_admin', tipo: 'forte', obrigatoria: true },
      { modulo: 'administrativo', entidade: 'pericia_administrativa', tipo: 'forte', obrigatoria: true },
      { modulo: 'administrativo', entidade: 'exigencia_admin', tipo: 'forte', obrigatoria: true },
      { modulo: 'administrativo', entidade: 'prazos_administrativos', tipo: 'forte', obrigatoria: true },
      { modulo: 'compartilhado', entidade: 'prazos_unificados', tipo: 'forte', obrigatoria: true },
    ],
  },

  {
    modulo: 'administrativo',
    entidade: 'requerimento_admin',
    descricao: 'Requerimento inicial, recurso, cumprimento, RPV',
    depende_de: [
      { modulo: 'administrativo', entidade: 'caso_administrativo', tipo: 'forte', obrigatoria: true },
      { modulo: 'compartilhado', entidade: 'beneficio', tipo: 'forte', obrigatoria: true },
    ],
    fornece_para: [
      { modulo: 'administrativo', entidade: 'recurso_admin', tipo: 'forte', obrigatoria: true },
      { modulo: 'administrativo', entidade: 'exigencia_admin', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'acao_judicial', tipo: 'fraca', obrigatoria: false, descricao: 'Origem para ajuizamento' },
    ],
  },

  {
    modulo: 'administrativo',
    entidade: 'recurso_admin',
    descricao: 'Recurso administrativo (ordinário, especial, revisão)',
    depende_de: [
      { modulo: 'administrativo', entidade: 'requerimento_admin', tipo: 'forte', obrigatoria: true },
    ],
    fornece_para: [
      { modulo: 'judicial', entidade: 'acao_judicial', tipo: 'fraca', obrigatoria: false, descricao: 'Base para ajuizamento' },
    ],
  },

  {
    modulo: 'administrativo',
    entidade: 'pericia_administrativa',
    descricao: 'Perícia médica/social administrativa',
    depende_de: [
      { modulo: 'administrativo', entidade: 'caso_administrativo', tipo: 'forte', obrigatoria: true },
      { modulo: 'compartilhado', entidade: 'perito', tipo: 'forte', obrigatoria: true },
    ],
    fornece_para: [
      { modulo: 'judicial', entidade: 'pericia_judicial', tipo: 'fraca', obrigatoria: false, descricao: 'Reaproveitamento de laudo' },
      { modulo: 'compartilhado', entidade: 'pericia_cruzada', tipo: 'forte', obrigatoria: true },
    ],
  },

  {
    modulo: 'administrativo',
    entidade: 'exigencia_admin',
    descricao: 'Exigência administrativa (documentos complementares)',
    depende_de: [
      { modulo: 'administrativo', entidade: 'requerimento_admin', tipo: 'forte', obrigatoria: true },
    ],
    fornece_para: [
      { modulo: 'administrativo', entidade: 'alertas_prazo', tipo: 'fraca', obrigatoria: false, descricao: 'Exigência não cumprida afeta judicial' },
    ],
  },

  {
    modulo: 'administrativo',
    entidade: 'prazos_administrativos',
    descricao: 'Prazos administrativos (exigências, recursos, perícias)',
    depende_de: [
      { modulo: 'administrativo', entidade: 'caso_administrativo', tipo: 'forte', obrigatoria: true },
    ],
    fornece_para: [
      { modulo: 'compartilhado', entidade: 'prazos_unificados', tipo: 'forte', obrigatoria: true },
      { modulo: 'administrativo', entidade: 'alertas_prazo', tipo: 'forte', obrigatoria: true },
    ],
  },

  {
    modulo: 'administrativo',
    entidade: 'cumprimento_sentenca_admin',
    descricao: 'Cumprimento de sentença no admin (RPV/Precatório)',
    depende_de: [
      { modulo: 'judicial', entidade: 'sentenca', tipo: 'forte', obrigatoria: true },
      { modulo: 'administrativo', entidade: 'caso_administrativo', tipo: 'forte', obrigatoria: true },
    ],
    fornece_para: [
      { modulo: 'administrativo', entidade: 'rpv_precatorio_admin', tipo: 'forte', obrigatoria: true },
    ],
  },

  {
    modulo: 'administrativo',
    entidade: 'rpv_precatorio_admin',
    descricao: 'RPV/Precatório no âmbito administrativo',
    depende_de: [
      { modulo: 'administrativo', entidade: 'cumprimento_sentenca_admin', tipo: 'forte', obrigatoria: true },
    ],
    fornece_para: [],
  },

  // ============================================
  // MÓDULO JUDICIAL
  // ============================================
  {
    modulo: 'judicial',
    entidade: 'caso_judicial',
    descricao: 'Processo judicial previdenciário',
    depende_de: [
      { modulo: 'compartilhado', entidade: 'caso_previdenciario', tipo: 'forte', obrigatoria: true },
      { modulo: 'administrativo', entidade: 'caso_administrativo', tipo: 'fraca', obrigatoria: false, descricao: 'Origem opcional (pode ser ajuizamento direto)' },
      { modulo: 'compartilhado', entidade: 'cliente', tipo: 'forte', obrigatoria: true },
    ],
    fornece_para: [
      { modulo: 'administrativo', entidade: 'cumprimento_sentenca_admin', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'acao_judicial', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'audiencia', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'pericia_judicial', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'sentenca', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'acordo_judicial', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'cumprimento_judicial', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'prazos_processuais', tipo: 'forte', obrigatoria: true },
      { modulo: 'administrativo', entidade: 'cumprimento_sentenca_admin', tipo: 'forte', obrigatoria: true },
      { modulo: 'compartilhado', entidade: 'prazos_unificados', tipo: 'forte', obrigatoria: true },
    ],
  },

  {
    modulo: 'judicial',
    entidade: 'pedido_judicial',
    descricao: 'Pedido da ação judicial (condenação, declaratória, etc.)',
    depende_de: [
      { modulo: 'judicial', entidade: 'acao_judicial', tipo: 'forte', obrigatoria: true },
      { modulo: 'compartilhado', entidade: 'beneficio', tipo: 'forte', obrigatoria: true },
    ],
    fornece_para: [],
  },

  {
    modulo: 'judicial',
    entidade: 'acao_judicial',
    descricao: 'Ação judicial (inicial, contestação, recurso)',
    depende_de: [
      { modulo: 'judicial', entidade: 'caso_judicial', tipo: 'forte', obrigatoria: true },
      { modulo: 'compartilhado', entidade: 'beneficio', tipo: 'forte', obrigatoria: true },
    ],
    fornece_para: [
      { modulo: 'judicial', entidade: 'peticao_judicial', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'audiencia', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'sentenca', tipo: 'forte', obrigatoria: true },
    ],
  },

  {
    modulo: 'judicial',
    entidade: 'peticao_judicial',
    descricao: 'Petição judicial (inicial, contestação, recurso, etc.)',
    depende_de: [
      { modulo: 'judicial', entidade: 'acao_judicial', tipo: 'forte', obrigatoria: true },
    ],
    fornece_para: [
      { modulo: 'judicial', entidade: 'audiencia', tipo: 'forte', obrigatoria: false },
    ],
  },

  {
    modulo: 'judicial',
    entidade: 'audiencia',
    descricao: 'Audiências (instrução, conciliação, perícia, una)',
    depende_de: [
      { modulo: 'judicial', entidade: 'acao_judicial', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'peticao_judicial', tipo: 'fraca', obrigatoria: false },
    ],
    fornece_para: [
      { modulo: 'judicial', entidade: 'pericia_judicial', tipo: 'fraca', obrigatoria: false },
      { modulo: 'compartilhado', entidade: 'prazos_unificados', tipo: 'fraca', obrigatoria: false },
    ],
  },

  {
    modulo: 'judicial',
    entidade: 'pericia_judicial',
    descricao: 'Perícia judicial (médica/social)',
    depende_de: [
      { modulo: 'judicial', entidade: 'caso_judicial', tipo: 'forte', obrigatoria: true },
      { modulo: 'compartilhado', entidade: 'perito', tipo: 'forte', obrigatoria: true },
    ],
    fornece_para: [
      { modulo: 'administrativo', entidade: 'pericia_administrativa', tipo: 'fraca', obrigatoria: false, descricao: 'Reaproveitamento laudo' },
      { modulo: 'compartilhado', entidade: 'pericia_cruzada', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'sentenca', tipo: 'fraca', obrigatoria: false },
    ],
  },

  {
    modulo: 'judicial',
    entidade: 'sentenca',
    descricao: 'Sentença judicial (procedente, improcedente, parcial)',
    depende_de: [
      { modulo: 'judicial', entidade: 'acao_judicial', tipo: 'forte', obrigatoria: true },
    ],
    fornece_para: [
      { modulo: 'administrativo', entidade: 'cumprimento_sentenca_admin', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'acordo_judicial', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'cumprimento_judicial', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'rpv_precatorio', tipo: 'forte', obrigatoria: true },
      { modulo: 'administrativo', entidade: 'caso_administrativo', tipo: 'eventual', obrigatoria: false, descricao: 'Arquiva caso admin (via evento SENTENCA_PROFERIDA)' },
    ],
  },

  {
    modulo: 'judicial',
    entidade: 'acordo_judicial',
    descricao: 'Acordo homologado judicialmente',
    depende_de: [
      { modulo: 'judicial', entidade: 'caso_judicial', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'sentenca', tipo: 'fraca', obrigatoria: false },
    ],
    fornece_para: [
      { modulo: 'administrativo', entidade: 'caso_administrativo', tipo: 'eventual', obrigatoria: false, descricao: 'Baixa requerimento admin (via evento ACORDO_HOMOLOGADO)' },
      { modulo: 'judicial', entidade: 'cumprimento_judicial', tipo: 'forte', obrigatoria: true },
    ],
  },

  {
    modulo: 'judicial',
    entidade: 'cumprimento_judicial',
    descricao: 'Cumprimento de sentença (RPV/Precatório no judicial)',
    depende_de: [
      { modulo: 'judicial', entidade: 'sentenca', tipo: 'forte', obrigatoria: true },
    ],
    fornece_para: [
      { modulo: 'judicial', entidade: 'rpv_precatorio', tipo: 'forte', obrigatoria: true },
      { modulo: 'administrativo', entidade: 'rpv_precatorio_admin', tipo: 'forte', obrigatoria: true },
    ],
  },

  {
    modulo: 'judicial',
    entidade: 'rpv_precatorio',
    descricao: 'RPV/Precatório judicial',
    depende_de: [
      { modulo: 'judicial', entidade: 'cumprimento_judicial', tipo: 'forte', obrigatoria: true },
    ],
    fornece_para: [
      { modulo: 'administrativo', entidade: 'rpv_precatorio_admin', tipo: 'forte', obrigatoria: true },
    ],
  },

  {
    modulo: 'judicial',
    entidade: 'prazos_processuais',
    descricao: 'Prazos processuais (CPC - contestação, recurso, embargos, etc.)',
    depende_de: [
      { modulo: 'judicial', entidade: 'caso_judicial', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'acao_judicial', tipo: 'fraca', obrigatoria: false },
    ],
    fornece_para: [
      { modulo: 'compartilhado', entidade: 'prazos_unificados', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'alertas_prazo', tipo: 'forte', obrigatoria: true },
    ],
  },

  // ============================================
  // CRUZAMENTOS (Cross-module entities)
  // ============================================
  {
    modulo: 'compartilhado',
    entidade: 'pericia_cruzada',
    descricao: 'Vínculo entre perícia admin e judicial (reaproveitamento)',
    depende_de: [
      { modulo: 'administrativo', entidade: 'pericia_administrativa', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'pericia_judicial', tipo: 'forte', obrigatoria: true },
    ],
    fornece_para: [],
  },

  {
    modulo: 'compartilhado',
    entidade: 'alertas_criticos',
    descricao: 'Alertas unificados de prazos críticos',
    depende_de: [
      { modulo: 'compartilhado', entidade: 'prazos_unificados', tipo: 'forte', obrigatoria: true },
    ],
    fornece_para: [
      { modulo: 'administrativo', entidade: 'alertas_prazo', tipo: 'forte', obrigatoria: true },
      { modulo: 'judicial', entidade: 'alertas_prazo', tipo: 'forte', obrigatoria: true },
    ],
  },

  {
    modulo: 'administrativo',
    entidade: 'alertas_prazo',
    descricao: 'Alertas de prazos administrativos',
    depende_de: [
      { modulo: 'administrativo', entidade: 'prazos_administrativos', tipo: 'forte', obrigatoria: true },
      { modulo: 'compartilhado', entidade: 'alertas_criticos', tipo: 'fraca', obrigatoria: false },
    ],
    fornece_para: [],
  },

  {
    modulo: 'judicial',
    entidade: 'alertas_prazo',
    descricao: 'Alertas de prazos processuais',
    depende_de: [
      { modulo: 'judicial', entidade: 'prazos_processuais', tipo: 'forte', obrigatoria: true },
      { modulo: 'compartilhado', entidade: 'alertas_criticos', tipo: 'fraca', obrigatoria: false },
    ],
    fornece_para: [],
  },
]

// ============================================
// HELPERS PARA TRABALHAR COM O GRAFO
// ============================================

/**
 * Converte grafo para arestas (para visualização)
 */
export function grafoParaArestas(grafo: NoDependencia[]): ArestaDependencia[] {
  const arestas: ArestaDependencia[] = []
  
  for (const no of grafo) {
    const origem = `${no.modulo}.${no.entidade}`
    
    // Dependências (o que este nó PRECISA)
    for (const dep of no.depende_de) {
      if (dep.obrigatoria) {
        arestas.push({
          de: `${dep.modulo}.${dep.entidade}`,
          para: `${no.modulo}.${no.entidade}`,
          tipo: dep.tipo,
          obrigatoria: dep.obrigatoria,
          descricao: dep.descricao,
        })
      }
    }
    
    // Fornece (o que este nó FORNECE para outros)
    for (const forn of no.fornece_para) {
      if (forn.obrigatoria) {
        arestas.push({
          de: `${no.modulo}.${no.entidade}`,
          para: `${forn.modulo}.${forn.entidade}`,
          tipo: forn.tipo,
          obrigatoria: forn.obrigatoria,
          descricao: forn.descricao,
        })
      }
    }
  }
  
  return arestas
}

/**
 * Retorna todos os nós do grafo
 */
export function obterTodosNos(): NoDependencia[] {
  return GRAFO_DEPENDENCIAS_COMPLETO
}

/**
 * Busca nó por módulo e entidade
 */
export function buscarNo(modulo: string, entidade: string): NoDependencia | undefined {
  return GRAFO_DEPENDENCIAS_COMPLETO.find(n => n.modulo === modulo && n.entidade === entidade)
}

/**
 * Retorna dependências diretas de uma entidade
 */
export function obterDependenciasDiretas(modulo: string, entidade: string): Dependencia[] {
  const no = buscarNo(modulo, entidade)
  return no?.depende_de ?? []
}

/**
 * Retorna entidades que dependem desta (fornece_para)
 */
export function obterDependentes(modulo: string, entidade: string): Dependencia[] {
  const no = buscarNo(modulo, entidade)
  return no?.fornece_para ?? []
}

/**
 * Verifica se existe caminho entre duas entidades
 */
export function existeCaminho(origem: string, destino: string, visitados = new Set<string>()): boolean {
  if (origem === destino) return true
  if (visitados.has(origem)) return false
  
  visitados.add(origem)
  
  const noOrigem = GRAFO_DEPENDENCIAS_COMPLETO.find(n => `${n.modulo}.${n.entidade}` === origem)
  if (!noOrigem) return false
  
  for (const forn of noOrigem.fornece_para) {
    const proximo = `${forn.modulo}.${forn.entidade}`
    if (forn.obrigatoria && !visitados.has(proximo)) {
      if (existeCaminho(proximo, destino, new Set([...visitados, origem]))) {
        return true
      }
    }
  }
  return false
}

/**
 * Detecta ciclos no grafo
 */
export function detectarCiclos(): string[][] {
  const visitados = new Set<string>()
  const pilha = new Set<string>()
  const ciclos: string[][] = []

  function dfs(no: string, caminho: string[]) {
    if (pilha.has(no)) {
      const idx = caminho.indexOf(no)
      ciclos.push([...caminho.slice(idx), no])
      return
    }
    if (visitados.has(no)) return

    visitados.add(no)
    pilha.add(no)

    const noObj = GRAFO_DEPENDENCIAS_COMPLETO.find(n => `${n.modulo}.${n.entidade}` === no)
    if (noObj) {
      for (const forn of noObj.fornece_para) {
        if (forn.obrigatoria) {
          dfs(`${forn.modulo}.${forn.entidade}`, [...caminho, no])
        }
      }
    }

    pilha.delete(no)
  }

  for (const no of GRAFO_DEPENDENCIAS_COMPLETO) {
    dfs(`${no.modulo}.${no.entidade}`, [])
  }

  return ciclos
}

/**
 * Gera diagrama Mermaid do grafo
 */
export function gerarDiagramaMermaid(): string {
  const arestas = grafoParaArestas(GRAFO_DEPENDENCIAS_COMPLETO)
  
  const nos = GRAFO_DEPENDENCIAS_COMPLETO.map(n => 
    `    ${n.modulo}_${n.entidade}[${n.entidade}]`
  ).join('\n')

  const arestasStr = GRAFO_DEPENDENCIAS_COMPLETO.flatMap(n => 
    n.fornece_para
      .filter(f => f.obrigatoria)
      .map(f => `    ${n.modulo}_${n.entidade} --> ${f.modulo}_${f.entidade}`)
  ).join('\n')

  return `graph TD
${nos}

${arestasStr}

    classDef compartilhado fill:#e1f5fe,stroke:#01579b,stroke-width:2px;
    classDef admin fill:#fff3e0,stroke:#e65100,stroke-width:2px;
    classDef judicial fill:#fce4ec,stroke:#880e4f,stroke-width:2px;
    
    class ${GRAFO_DEPENDENCIAS_COMPLETO.filter(n => n.modulo === 'compartilhado').map(n => `${n.modulo}_${n.entidade}`).join(',')} compartilhado;
    class ${GRAFO_DEPENDENCIAS_COMPLETO.filter(n => n.modulo === 'administrativo').map(n => `${n.modulo}_${n.entidade}`).join(',')} admin;
    class ${GRAFO_DEPENDENCIAS_COMPLETO.filter(n => n.modulo === 'judicial').map(n => `${n.modulo}_${n.entidade}`).join(',')} judicial;
`
}

// ============================================
// ESTATÍSTICAS DO GRAFO
// ============================================

export function estatisticasGrafo() {
  const nos = GRAFO_DEPENDENCIAS_COMPLETO.length
  const modulos = new Set(GRAFO_DEPENDENCIAS_COMPLETO.map(n => n.modulo)).size
  const arestas = GRAFO_DEPENDENCIAS_COMPLETO.reduce((acc, n) => acc + n.fornece_para.filter(f => f.obrigatoria).length, 0)
  const dependenciasFortes = GRAFO_DEPENDENCIAS_COMPLETO.reduce((acc, n) => acc + n.depende_de.filter(d => d.obrigatoria).length, 0)
  const dependenciasFracas = GRAFO_DEPENDENCIAS_COMPLETO.reduce((acc, n) => acc + n.depende_de.filter(d => !d.obrigatoria).length, 0)

  const porModulo = GRAFO_DEPENDENCIAS_COMPLETO.reduce((acc, n) => {
    acc[n.modulo] = (acc[n.modulo] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return {
    nos,
    modulos,
    arestas,
    dependenciasFortes,
    dependenciasFracas,
    porModulo,
    densidade: arestas / (nos * (nos - 1)),
  }
}