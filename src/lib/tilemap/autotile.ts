// Motor de autotile — esquema de 28 variantes (9 bordas/cantos/preenchimento + 4 cantos internos +
// 2 blocos finos + 4 pontas de bloco fino + 4 cantos de bloco fino + 4 entalhes de lado inteiro + 1
// cruzamento de bloco fino, docs/PROGRESS.md, "tilesets inteligentes" + complemento "cantos
// internos" + "mais casos de autotile", 2026-09-23/25): dado quais vizinhos (cardeais + diagonais)
// de uma célula pertencem ao MESMO grupo de terreno, escolhe qual dos 28 papéis (TerrainRole, ver
// types.ts) usar ali. Puro: não sabe nada sobre grid de hardware, tileset combinado ou React — só
// recebe/devolve coordenadas de célula e um predicado de pertencimento, pra dar pra testar isolado
// (ver autotile.test.ts) e reusar tanto ao pintar quanto ao apagar (StageSession.tsx).
//
// Achado ao desenhar o esquema original de 9 variantes: papel de LINHA (topo/meio/baixo) só depende
// dos vizinhos norte/sul; papel de COLUNA (esquerda/meio/direita) só depende de leste/oeste — os
// dois eixos são independentes, e a combinação dos dois já cobre exatamente as 9 variantes SEM
// checar diagonal nenhuma. Isso só deixa de bastar quando os 4 cardeais estão TODOS preenchidos
// (célula "no meio" de alguma direção) — aí, e só aí, uma diagonal vazia pode indicar um canto
// CÔNCAVO/interno (ex.: chão sólido com um recorte de 1 célula numa quina), que o esquema de 9
// variantes não tem como representar (cairia tudo em "preenchimento", escondendo o recorte).
//
// Bloco fino (achado real do usuário, 2026-09-25): o esquema de 9 (linha/coluna independentes) só
// decide UM lado por vez em cada eixo — quando os DOIS lados de um eixo estão vazios ao mesmo tempo
// (ex. uma coluna de 1 bloco de largura: leste E oeste vazios, mas norte/sul preenchidos), ele só
// desenhava a borda de um lado (esquerda, por causa da ordem do `!west` no `colRole`), deixando o
// outro lado "sumindo" — bug visual real, não só limitação teórica. Resolvido com 2 papéis novos
// (`thinVertical`/`thinHorizontal`) checados ANTES do esquema de 9, pra esses casos MAIS
// específicos (dois cardeais OPOSTOS vazios, não só um) nunca caírem nele.
//
// Ponta de bloco fino (2º achado real, mesma sessão): o FIM de uma coluna/faixa fina (só 1 cardeal
// preenchido, os outros 3 vazios) reaproveitava um canto CONVEXO normal (`topLeft` etc.), que
// assume o lado "fechado" continuando com MAIS terreno — errado aqui, porque num bloco fino não
// tem nada pros dois lados. Resolvido com 4 papéis dedicados (`thinVerticalTop`/
// `thinVerticalBottom`/`thinHorizontalLeft`/`thinHorizontalRight`), checados no mesmo nível de
// prioridade dos blocos finos (exatamente 1 cardeal preenchido só é geometricamente possível na
// ponta de um bloco fino, nunca faz parte de nenhuma outra forma).
//
// Canto (cotovelo) de bloco fino (4º achado real, print antes/depois): um caminho de 1 bloco de
// largura fazendo uma curva de 90° (ex. vindo de baixo e virando pra direita) tem EXATAMENTE 2
// cardeais ADJACENTES preenchidos (não opostos — já é `thinVertical`/`thinHorizontal`), igual a um
// canto CONVEXO normal — mas reaproveitar o canto normal aqui está errado pelo MESMO motivo das
// pontas: ele assume que a diagonal "de dentro" da curva (entre os 2 cardeais preenchidos) é massa
// sólida continuando, e num caminho de 1 bloco de largura não tem nada lá. Resolvido com 4 papéis
// dedicados (`thinCornerTopLeft` etc.), que só disparam quando essa diagonal de dentro TAMBÉM está
// vazia — se estiver preenchida (canto de verdade de uma massa mais larga, ex. um retângulo sólido),
// continua caindo no canto convexo normal, sem mudança nenhuma nos testes já existentes pra formas
// sólidas.
//
// Esquema de 28 (não o blob completo de 47): resolve 1, 2 (adjacentes) OU 4 diagonais vazias — 1
// vazia vira um canto interno (`innerTopLeft` etc.); 2 vazias ADJACENTES (mesmo lado cardeal) viram
// um entalhe de lado inteiro (`notchTop` etc., achado real: acontece numa junção tipo "T", uma
// coluna fina saindo do meio de uma base larga); as 4 vazias ao mesmo tempo viram o cruzamento de
// bloco fino (`thinCross`, 3º achado real: a interseção entre uma faixa fina horizontal e uma
// coluna fina vertical — os 4 braços são finos, então os 4 cantos do cruzamento ficam ocos ao mesmo
// tempo). 2 diagonais OPOSTAS (ex. noroeste+sudeste, combinação rara tipo xadrez) ou 3 diagonais
// vazias ao mesmo tempo continuam sem variante exata (o blob de 47 resolveria) e caem em
// "preenchimento" por decisão explícita de escopo (documentado, não é bug) — ver
// `resolveTerrainRole` e os testes de "diagonais opostas"/"3 vazias" em autotile.test.ts.
import type { TerrainRole } from './types.ts'

export interface TerrainNeighbors {
  north: boolean
  south: boolean
  east: boolean
  west: boolean
  northWest: boolean
  northEast: boolean
  southWest: boolean
  southEast: boolean
}

/** Linha/coluna dentro do mini-grid 3x3 — exportado só pra reaproveitar a mesma tabela em
 * `resolveTerrainRole` sem duplicar os 9 nomes de papel espalhados em vários lugares. */
const ROLE_GRID: Record<'top' | 'mid' | 'bottom', Record<'left' | 'mid' | 'right', TerrainRole>> = {
  top: { left: 'topLeft', mid: 'top', right: 'topRight' },
  mid: { left: 'left', mid: 'fill', right: 'right' },
  bottom: { left: 'bottomLeft', mid: 'bottom', right: 'bottomRight' },
}

/**
 * Resolve o papel a partir de quais vizinhos pertencem ao MESMO grupo, em ordem de prioridade:
 * (1) EXATAMENTE 1 cardeal preenchido = ponta de bloco fino (`thinVerticalTop` etc., ver
 * comentário no topo do arquivo — só acontece no fim de uma coluna/faixa fina);
 * (2) os DOIS lados de um eixo cardeal vazios ao mesmo tempo E o eixo perpendicular TODO
 * preenchido = bloco fino no MEIO (`thinVertical`/`thinHorizontal`);
 * (3) EXATAMENTE 2 cardeais ADJACENTES preenchidos (não opostos, já coberto no passo 2) E a
 * diagonal "de dentro" da curva TAMBÉM vazia = canto (cotovelo) de bloco fino (`thinCornerTopLeft`
 * etc.) — se essa diagonal estiver preenchida, é um canto de verdade de uma massa mais larga, cai
 * no passo (4) normalmente;
 * (4) senão, cardeais decidem borda/canto/preenchimento (esquema de 9, sem diagonal nenhuma);
 * (5) só quando os 4 cardeais estão TODOS preenchidos é que as diagonais entram, pra distinguir
 * preenchimento de verdade (0 diagonais vazias) de um canto interno (1 diagonal vazia), um entalhe
 * de lado inteiro (2 diagonais ADJACENTES vazias) ou um cruzamento de bloco fino (`thinCross`, as 4
 * diagonais vazias ao mesmo tempo). Célula isolada nos DOIS eixos ao mesmo tempo (ZERO cardeais
 * preenchidos) cai no lado "de fora" por convenção (topo/esquerda, via o esquema de 9) — é o jeito
 * mais visualmente razoável de desenhar uma "ilha" de 1 célula com um esquema sem variante de ilha
 * dedicada.
 */
export function resolveTerrainRole(neighbors: TerrainNeighbors): TerrainRole {
  // Ponta de bloco fino (ver comentário no topo do arquivo) — EXATAMENTE 1 cardeal preenchido só é
  // geometricamente possível na ponta de uma coluna/faixa fina (nenhuma outra forma produz esse
  // padrão), então checado ANTES de tudo, com prioridade sobre o esquema de 9 normal.
  const trueCardinalCount = [neighbors.north, neighbors.south, neighbors.east, neighbors.west].filter(Boolean).length
  if (trueCardinalCount === 1) {
    if (neighbors.south) return 'thinVerticalTop' // só o sul preenchido: a coluna desce a partir daqui
    if (neighbors.north) return 'thinVerticalBottom' // só o norte: a coluna sobe a partir daqui
    if (neighbors.east) return 'thinHorizontalLeft' // só o leste: a faixa continua pra direita
    if (neighbors.west) return 'thinHorizontalRight' // só o oeste: a faixa continua pra esquerda
  }

  // Bloco fino (ver comentário no topo do arquivo) — checado ANTES do esquema de 9: dois cardeais
  // OPOSTOS vazios ao mesmo tempo (não só um) precisam de um papel dedicado, senão caem no
  // esquema de 9 normal e só uma das duas bordas necessárias é desenhada.
  if (!neighbors.east && !neighbors.west && neighbors.north && neighbors.south) return 'thinVertical'
  if (!neighbors.north && !neighbors.south && neighbors.east && neighbors.west) return 'thinHorizontal'

  // Canto (cotovelo) de bloco fino (ver comentário no topo do arquivo) — chegou aqui com
  // `trueCardinalCount === 2` só pode ser um par ADJACENTE (os 2 pares opostos já retornaram
  // acima), ou seja, é sempre um dos 4 padrões de canto — mas só é um canto DE BLOCO FINO se a
  // diagonal "de dentro" (entre os 2 cardeais preenchidos) também estiver vazia.
  if (trueCardinalCount === 2) {
    if (neighbors.north && neighbors.east && !neighbors.northEast) return 'thinCornerBottomLeft'
    if (neighbors.north && neighbors.west && !neighbors.northWest) return 'thinCornerBottomRight'
    if (neighbors.south && neighbors.east && !neighbors.southEast) return 'thinCornerTopLeft'
    if (neighbors.south && neighbors.west && !neighbors.southWest) return 'thinCornerTopRight'
  }

  const allCardinalsFilled = neighbors.north && neighbors.south && neighbors.east && neighbors.west
  if (!allCardinalsFilled) {
    const rowRole = !neighbors.north ? 'top' : !neighbors.south ? 'bottom' : 'mid'
    const colRole = !neighbors.west ? 'left' : !neighbors.east ? 'right' : 'mid'
    return ROLE_GRID[rowRole][colRole]
  }
  const emptyDiagonalRoles: TerrainRole[] = []
  if (!neighbors.northWest) emptyDiagonalRoles.push('innerTopLeft')
  if (!neighbors.northEast) emptyDiagonalRoles.push('innerTopRight')
  if (!neighbors.southWest) emptyDiagonalRoles.push('innerBottomLeft')
  if (!neighbors.southEast) emptyDiagonalRoles.push('innerBottomRight')
  if (emptyDiagonalRoles.length === 1) return emptyDiagonalRoles[0]

  // 2 diagonais vazias ADJACENTES (mesmo lado cardeal) = entalhe de lado inteiro (ver comentário no
  // topo do arquivo). As 2 combinações OPOSTAS (noroeste+sudeste, nordeste+sudoeste) não têm
  // variante — caem no `return 'fill'` no final, junto com 3 diagonais vazias.
  if (emptyDiagonalRoles.length === 2) {
    if (!neighbors.northWest && !neighbors.northEast) return 'notchTop'
    if (!neighbors.southWest && !neighbors.southEast) return 'notchBottom'
    if (!neighbors.northWest && !neighbors.southWest) return 'notchLeft'
    if (!neighbors.northEast && !neighbors.southEast) return 'notchRight'
  }

  // As 4 diagonais vazias ao mesmo tempo (ver comentário no topo do arquivo) = cruzamento entre uma
  // faixa fina horizontal e uma coluna fina vertical (achado real, 2026-09-25) — diferente de
  // preenchimento de verdade (0 diagonais vazias), que já caiu no primeiro `if` acima.
  if (emptyDiagonalRoles.length === 4) return 'thinCross'

  return 'fill'
}

type MapEdgeSide = 'top' | 'bottom' | 'left' | 'right'

/** Quais lados de MAPA cada papel "simples" (borda/canto/preenchimento + blocos finos, meio e
 * ponta) mostra como borda visível — usado por `trimRoleForMapEdges` pra "cortar" só o lado que
 * toca a borda do mapa, sem reclassificar a célula inteira errado. Cantos internos e entalhes de
 * lado inteiro ficam de fora de propósito: pra uma célula chegar neles, os 4 cardeais reais (não
 * de borda de mapa) já precisam estar preenchidos — geometricamente impossível ela também estar
 * tocando uma borda de mapa no MESMO lado que importaria aqui (ver `trimRoleForMapEdges`). */
const ROLE_MAP_EDGE_SIDES: Partial<Record<TerrainRole, readonly MapEdgeSide[]>> = {
  fill: [],
  top: ['top'],
  bottom: ['bottom'],
  left: ['left'],
  right: ['right'],
  topLeft: ['top', 'left'],
  topRight: ['top', 'right'],
  bottomLeft: ['bottom', 'left'],
  bottomRight: ['bottom', 'right'],
  thinHorizontal: ['top', 'bottom'],
  thinVertical: ['left', 'right'],
  thinHorizontalLeft: ['top', 'bottom', 'left'],
  thinHorizontalRight: ['top', 'bottom', 'right'],
  thinVerticalTop: ['top', 'left', 'right'],
  thinVerticalBottom: ['bottom', 'left', 'right'],
}

const MAP_EDGE_SIDE_ORDER: readonly MapEdgeSide[] = ['top', 'bottom', 'left', 'right']

function mapEdgeSidesKey(sides: ReadonlySet<MapEdgeSide>): string {
  return MAP_EDGE_SIDE_ORDER.filter((side) => sides.has(side)).join(',')
}

const ROLE_BY_MAP_EDGE_SIDES = new Map<string, TerrainRole>(
  Object.entries(ROLE_MAP_EDGE_SIDES).map(([role, sides]) => [mapEdgeSidesKey(new Set(sides)), role as TerrainRole]),
)

/**
 * "Corta" a borda de um papel já resolvido nos lados onde a célula toca a borda do MAPA (achado
 * real, 2026-09-25: a versão anterior desse ajuste passava um `isMember` que já enxergava a borda
 * do mapa como "pertence ao grupo" DIRETO pra dentro de `terrainRoleAt` — funcionava pra formas
 * sólidas simples, mas quebrava formas côncavas/finas perto da borda: um canto de verdade de uma
 * moldura oca virava canto INTERNO, porque de repente os 4 cardeais "pareciam" preenchidos.
 * Resolvido separando os dois passos: `resolveTerrainRole`/`terrainRoleAt` sempre usam o
 * pertencimento REAL (nunca a borda do mapa) pra decidir o papel; só DEPOIS, aqui, o lado que toca
 * a borda do mapa é removido do papel resultante (ex.: `topLeft` tocando a borda esquerda vira só
 * `top` — o lado esquerdo passa a parecer "chão contínuo" em vez de uma borda cortada). Papéis sem
 * entrada em `ROLE_MAP_EDGE_SIDES` (cantos internos, entalhes) voltam inalterados — ver comentário
 * da tabela. Se a combinação resultante não bater com nenhum papel conhecido (não deveria
 * acontecer, mas não trava), devolve o papel original sem cortar nada. */
export function trimRoleForMapEdges(
  role: TerrainRole,
  touching: { top: boolean; bottom: boolean; left: boolean; right: boolean },
): TerrainRole {
  const sides = ROLE_MAP_EDGE_SIDES[role]
  if (!sides) return role
  const trimmed = new Set(sides)
  if (touching.top) trimmed.delete('top')
  if (touching.bottom) trimmed.delete('bottom')
  if (touching.left) trimmed.delete('left')
  if (touching.right) trimmed.delete('right')
  return ROLE_BY_MAP_EDGE_SIDES.get(mapEdgeSidesKey(trimmed)) ?? role
}

export interface TerrainCell {
  col: number
  row: number
}

/** Papel de UMA célula, a partir de um predicado "essa posição pertence ao mesmo grupo?" — fora dos
 * limites da grade conta como "não pertence" (mesmo efeito de uma borda de mapa: sempre resolve pra
 * canto/borda ali, nunca preenchimento), então `isMember` não precisa se preocupar com limites por
 * fora do que ela mesma já checa. Célula de OUTRO grupo de terreno (ou bloco avulso, ou nada
 * pintado) conta igual como "não pertence" — é o que garante que dois terrenos nunca se misturam
 * sozinhos, sempre desenham borda um contra o outro (docs/PROGRESS.md, "cantos internos"; quem
 * decide isso é o `isMember` que `StageSession.tsx` passa pra cá, não este arquivo). */
export function terrainRoleAt(isMember: (col: number, row: number) => boolean, cell: TerrainCell): TerrainRole {
  return resolveTerrainRole({
    north: isMember(cell.col, cell.row - 1),
    south: isMember(cell.col, cell.row + 1),
    west: isMember(cell.col - 1, cell.row),
    east: isMember(cell.col + 1, cell.row),
    northWest: isMember(cell.col - 1, cell.row - 1),
    northEast: isMember(cell.col + 1, cell.row - 1),
    southWest: isMember(cell.col - 1, cell.row + 1),
    southEast: isMember(cell.col + 1, cell.row + 1),
  })
}

/**
 * Células que precisam ter o papel recalculado depois de pintar/apagar `cell` — ela mesma + os 8
 * vizinhos ao redor (cardeais E diagonais agora, ver comentário no topo do arquivo: com cantos
 * internos, uma diagonal pode virar de "canto interno" pra "preenchimento" e vice-versa) que AINDA
 * pertencem ao grupo depois da mudança. Um vizinho que não pertence (nunca pertenceu, ou deixou de
 * pertencer nesta operação — ex.: `cell` acabou de ser apagada) não tem papel de terreno nenhum pra
 * atualizar, então fica de fora.
 */
export function terrainCellsToReevaluate(
  isMember: (col: number, row: number) => boolean,
  cell: TerrainCell,
): TerrainCell[] {
  const candidates: TerrainCell[] = [
    cell,
    { col: cell.col, row: cell.row - 1 },
    { col: cell.col, row: cell.row + 1 },
    { col: cell.col - 1, row: cell.row },
    { col: cell.col + 1, row: cell.row },
    { col: cell.col - 1, row: cell.row - 1 },
    { col: cell.col + 1, row: cell.row - 1 },
    { col: cell.col - 1, row: cell.row + 1 },
    { col: cell.col + 1, row: cell.row + 1 },
  ]
  return candidates.filter((c) => isMember(c.col, c.row))
}
