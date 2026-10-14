import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  resolveTerrainRole,
  terrainCellsToReevaluate,
  terrainRoleAt,
  trimRoleForMapEdges,
  type TerrainCell,
} from '../src/lib/tilemap/autotile.ts'
import type { TerrainRole } from '../src/lib/tilemap/types.ts'

const NO_EDGE = { top: false, bottom: false, left: false, right: false }

/** Grupo de terreno sintético a partir de um Set de "col,row" — só pra testar o motor isolado, sem
 * precisar de grid de hardware/tileset combinado nenhum (StageSession.tsx é quem faz essa ponte de
 * verdade). */
function membershipOf(cells: readonly TerrainCell[]): (col: number, row: number) => boolean {
  const set = new Set(cells.map((c) => `${c.col},${c.row}`))
  return (col, row) => set.has(`${col},${row}`)
}

const NO_NEIGHBORS = { north: false, south: false, east: false, west: false, northWest: false, northEast: false, southWest: false, southEast: false }
const ALL_NEIGHBORS = { north: true, south: true, east: true, west: true, northWest: true, northEast: true, southWest: true, southEast: true }

test('resolveTerrainRole: célula isolada (sem vizinho em nenhum lado) cai em topLeft por convenção', () => {
  const role = resolveTerrainRole(NO_NEIGHBORS)
  assert.equal(role, 'topLeft')
})

test('resolveTerrainRole: cercada nos 4 cardeais E nas 4 diagonais vira preenchimento de verdade', () => {
  const role = resolveTerrainRole(ALL_NEIGHBORS)
  assert.equal(role, 'fill')
})

test('resolveTerrainRole: 4 cardeais preenchidos mas 1 diagonal vazia vira o canto interno daquela quina', () => {
  assert.equal(resolveTerrainRole({ ...ALL_NEIGHBORS, northWest: false }), 'innerTopLeft')
  assert.equal(resolveTerrainRole({ ...ALL_NEIGHBORS, northEast: false }), 'innerTopRight')
  assert.equal(resolveTerrainRole({ ...ALL_NEIGHBORS, southWest: false }), 'innerBottomLeft')
  assert.equal(resolveTerrainRole({ ...ALL_NEIGHBORS, southEast: false }), 'innerBottomRight')
})

test('resolveTerrainRole: 4 cardeais preenchidos mas 2 diagonais OPOSTAS (ou 3) vazias ao mesmo tempo cai em preenchimento (fora do esquema de 24, decisão de escopo documentada)', () => {
  // As 2 combinações OPOSTAS (noroeste+sudeste, nordeste+sudoeste) não têm variante — só as 4
  // combinações ADJACENTES (mesmo lado) têm, ver o teste de "entalhe de lado inteiro" abaixo. 3
  // diagonais vazias também não tem variante — só 1 (canto interno), 2 adjacentes (entalhe) ou as
  // 4 ao mesmo tempo (cruzamento de bloco fino, ver teste dedicado abaixo) têm.
  assert.equal(resolveTerrainRole({ ...ALL_NEIGHBORS, northWest: false, southEast: false }), 'fill')
  assert.equal(resolveTerrainRole({ ...ALL_NEIGHBORS, northEast: false, southWest: false }), 'fill')
  assert.equal(resolveTerrainRole({ ...ALL_NEIGHBORS, northWest: false, northEast: false, southEast: false }), 'fill')
})

test('resolveTerrainRole: 4 cardeais preenchidos e as 4 diagonais TODAS vazias ao mesmo tempo vira o cruzamento de bloco fino — achado real, 2026-09-25: faltava a interseção entre uma faixa fina horizontal e uma coluna fina vertical', () => {
  assert.equal(resolveTerrainRole({ ...ALL_NEIGHBORS, northWest: false, northEast: false, southWest: false, southEast: false }), 'thinCross')
})

test('resolveTerrainRole: 4 cardeais preenchidos mas 2 diagonais ADJACENTES (mesmo lado) vazias vira o entalhe de lado inteiro daquele lado (achado real, 2026-09-25)', () => {
  assert.equal(resolveTerrainRole({ ...ALL_NEIGHBORS, northWest: false, northEast: false }), 'notchTop')
  assert.equal(resolveTerrainRole({ ...ALL_NEIGHBORS, southWest: false, southEast: false }), 'notchBottom')
  assert.equal(resolveTerrainRole({ ...ALL_NEIGHBORS, northWest: false, southWest: false }), 'notchLeft')
  assert.equal(resolveTerrainRole({ ...ALL_NEIGHBORS, northEast: false, southEast: false }), 'notchRight')
})

test('resolveTerrainRole: bloco fino — 2 cardeais OPOSTOS vazios ao mesmo tempo vira coluna/faixa fina, não o esquema de 9 normal (achado real, 2026-09-25)', () => {
  // Coluna de 1 bloco de largura: leste E oeste vazios, norte/sul preenchidos (as diagonais não
  // importam pra esse papel — sempre vira thinVertical independente delas).
  assert.equal(resolveTerrainRole({ ...NO_NEIGHBORS, north: true, south: true }), 'thinVertical')
  assert.equal(resolveTerrainRole({ ...ALL_NEIGHBORS, east: false, west: false }), 'thinVertical')
  // Faixa de 1 bloco de altura: norte E sul vazios, leste/oeste preenchidos.
  assert.equal(resolveTerrainRole({ ...NO_NEIGHBORS, east: true, west: true }), 'thinHorizontal')
  assert.equal(resolveTerrainRole({ ...ALL_NEIGHBORS, north: false, south: false }), 'thinHorizontal')
})

test('resolveTerrainRole: canto (cotovelo) de bloco fino — 2 cardeais ADJACENTES preenchidos e a diagonal de dentro da curva vazia vira canto de bloco fino, não o canto normal (achado real, 2026-09-25, print antes/depois)', () => {
  assert.equal(resolveTerrainRole({ ...NO_NEIGHBORS, north: true, east: true, northEast: false }), 'thinCornerBottomLeft')
  assert.equal(resolveTerrainRole({ ...NO_NEIGHBORS, north: true, west: true, northWest: false }), 'thinCornerBottomRight')
  assert.equal(resolveTerrainRole({ ...NO_NEIGHBORS, south: true, east: true, southEast: false }), 'thinCornerTopLeft')
  assert.equal(resolveTerrainRole({ ...NO_NEIGHBORS, south: true, west: true, southWest: false }), 'thinCornerTopRight')
})

test('resolveTerrainRole: mesmo padrão de 2 cardeais adjacentes, mas com a diagonal de dentro PREENCHIDA continua o canto normal (massa mais larga de verdade, não bloco fino) — não regride os testes de formas sólidas já existentes', () => {
  assert.equal(resolveTerrainRole({ ...NO_NEIGHBORS, north: true, east: true, northEast: true }), 'bottomLeft')
  assert.equal(resolveTerrainRole({ ...NO_NEIGHBORS, north: true, west: true, northWest: true }), 'bottomRight')
  assert.equal(resolveTerrainRole({ ...NO_NEIGHBORS, south: true, east: true, southEast: true }), 'topLeft')
  assert.equal(resolveTerrainRole({ ...NO_NEIGHBORS, south: true, west: true, southWest: true }), 'topRight')
})

test('resolveTerrainRole: só 1 cardeal vazio (não os 2 opostos) nunca vira bloco fino — continua o esquema de 9 normal', () => {
  assert.equal(resolveTerrainRole({ ...ALL_NEIGHBORS, east: false }), 'right')
  assert.equal(resolveTerrainRole({ ...ALL_NEIGHBORS, west: false }), 'left')
  assert.equal(resolveTerrainRole({ ...ALL_NEIGHBORS, north: false }), 'top')
  assert.equal(resolveTerrainRole({ ...ALL_NEIGHBORS, south: false }), 'bottom')
})

test('resolveTerrainRole: 1 cardeal vazio nunca olha diagonal (esquema de 9 continua valendo sozinho nesse caso)', () => {
  // norte vazio (rowRole='top') com AMBAS as diagonais de cima também vazias não deveria virar
  // canto interno nenhum — só entra a lógica de diagonal quando os 4 CARDEAIS já estão cheios.
  assert.equal(resolveTerrainRole({ ...ALL_NEIGHBORS, north: false, northWest: false, northEast: false }), 'top')
})

test('terrainRoleAt: linha horizontal ISOLADA de 3 células (1 de altura, nada em cima/embaixo) vira thinHorizontalLeft/thinHorizontal/thinHorizontalRight — achado real, 2026-09-25: o meio ANTES virava "top" (escondia a borda de baixo) e as pontas viravam "topLeft"/"topRight" (assumiam terreno continuando pro lado que não existe)', () => {
  const isMember = membershipOf([
    { col: 0, row: 0 },
    { col: 1, row: 0 },
    { col: 2, row: 0 },
  ])
  const roles: Record<string, TerrainRole> = {
    left: terrainRoleAt(isMember, { col: 0, row: 0 }),
    mid: terrainRoleAt(isMember, { col: 1, row: 0 }),
    right: terrainRoleAt(isMember, { col: 2, row: 0 }),
  }
  assert.deepEqual(roles, { left: 'thinHorizontalLeft', mid: 'thinHorizontal', right: 'thinHorizontalRight' })
})

test('terrainRoleAt: linha horizontal de 3 células com CHÃO embaixo (topo de uma plataforma de verdade) vira topLeft/top/topRight — sem bloco fino aqui, porque só 1 lado do eixo vertical está vazio', () => {
  const isMember = membershipOf([
    { col: 0, row: 0 },
    { col: 1, row: 0 },
    { col: 2, row: 0 },
    { col: 0, row: 1 },
    { col: 1, row: 1 },
    { col: 2, row: 1 },
  ])
  const roles: Record<string, TerrainRole> = {
    left: terrainRoleAt(isMember, { col: 0, row: 0 }),
    mid: terrainRoleAt(isMember, { col: 1, row: 0 }),
    right: terrainRoleAt(isMember, { col: 2, row: 0 }),
  }
  assert.deepEqual(roles, { left: 'topLeft', mid: 'top', right: 'topRight' })
})

test('terrainRoleAt: coluna vertical de 3 células (1 de largura) vira thinVerticalTop/thinVertical/thinVerticalBottom — achado real, 2026-09-25: o meio ANTES virava "left" (escondia a borda direita) e as pontas viravam "topLeft"/"bottomLeft" (assumiam terreno à direita que não existe)', () => {
  const isMember = membershipOf([
    { col: 5, row: 0 },
    { col: 5, row: 1 },
    { col: 5, row: 2 },
  ])
  const roles: Record<string, TerrainRole> = {
    top: terrainRoleAt(isMember, { col: 5, row: 0 }),
    mid: terrainRoleAt(isMember, { col: 5, row: 1 }),
    bottom: terrainRoleAt(isMember, { col: 5, row: 2 }),
  }
  assert.deepEqual(roles, { top: 'thinVerticalTop', mid: 'thinVertical', bottom: 'thinVerticalBottom' })
})

test('terrainRoleAt: faixa horizontal de 3 células (1 de altura) vira thinHorizontalLeft/thinHorizontal/thinHorizontalRight — mesmo achado, eixo trocado', () => {
  const isMember = membershipOf([
    { col: 0, row: 5 },
    { col: 1, row: 5 },
    { col: 2, row: 5 },
  ])
  const roles: Record<string, TerrainRole> = {
    left: terrainRoleAt(isMember, { col: 0, row: 5 }),
    mid: terrainRoleAt(isMember, { col: 1, row: 5 }),
    right: terrainRoleAt(isMember, { col: 2, row: 5 }),
  }
  assert.deepEqual(roles, { left: 'thinHorizontalLeft', mid: 'thinHorizontal', right: 'thinHorizontalRight' })
})

test('terrainRoleAt: ponta de bloco fino não trava com diagonal nenhuma (sempre ignora diagonal, só olha cardeal) — achado real, 2026-09-25', () => {
  // Mesma coluna vertical de cima, mas com uma célula de OUTRO grupo bem diagonal da ponta — não
  // deveria mudar nada (a lógica de ponta nem olha diagonal).
  const isMember = membershipOf([
    { col: 5, row: 0 },
    { col: 5, row: 1 },
    { col: 5, row: 2 },
    { col: 6, row: -1 }, // "ruído" diagonal de outro grupo, não deveria interferir
  ])
  assert.equal(terrainRoleAt(isMember, { col: 5, row: 0 }), 'thinVerticalTop')
})

test('terrainRoleAt: coluna fina de 1 bloco saindo do meio de uma base larga (2 linhas) gera o entalhe no topo, exatamente na célula onde a coluna nasce (achado real, 2026-09-25)', () => {
  // Base larga 5x2 (linhas 1-2) + uma coluna fina de 1 célula subindo da célula do meio (linha 0)
  // — a célula (2,1), logo abaixo da coluna, tem os 4 cardeais preenchidos (coluna em cima, base
  // embaixo/dos lados) mas as 2 diagonais de CIMA vazias (nada em (1,0)/(3,0), só a coluna estreita
  // em (2,0)).
  const cells: TerrainCell[] = [{ col: 2, row: 0 }]
  for (let col = 0; col <= 4; col++) {
    cells.push({ col, row: 1 }, { col, row: 2 })
  }
  const isMember = membershipOf(cells)
  assert.equal(terrainRoleAt(isMember, { col: 2, row: 1 }), 'notchTop')
  // a base larga longe da coluna continua um "top" normal, sem entalhe nenhum:
  assert.equal(terrainRoleAt(isMember, { col: 0, row: 1 }), 'topLeft')
  assert.equal(terrainRoleAt(isMember, { col: 4, row: 1 }), 'topRight')
})

test('terrainRoleAt: cruzamento "+" entre uma faixa fina horizontal e uma coluna fina vertical gera thinCross exatamente na interseção (achado real, 2026-09-25)', () => {
  // Faixa horizontal fina na linha 2 (colunas 0-4) cruzando com uma coluna vertical fina na
  // coluna 2 (linhas 0-4) — só a célula (2,2) tem os 4 cardeais preenchidos E as 4 diagonais
  // vazias (os braços são finos dos dois lados).
  const cells: TerrainCell[] = []
  for (let col = 0; col <= 4; col++) cells.push({ col, row: 2 })
  for (let row = 0; row <= 4; row++) if (row !== 2) cells.push({ col: 2, row })
  const isMember = membershipOf(cells)
  assert.equal(terrainRoleAt(isMember, { col: 2, row: 2 }), 'thinCross')
  // longe da interseção, cada braço continua um bloco fino normal (meio/ponta), sem cruzamento:
  assert.equal(terrainRoleAt(isMember, { col: 0, row: 2 }), 'thinHorizontalLeft')
  assert.equal(terrainRoleAt(isMember, { col: 1, row: 2 }), 'thinHorizontal')
  assert.equal(terrainRoleAt(isMember, { col: 2, row: 0 }), 'thinVerticalTop')
  assert.equal(terrainRoleAt(isMember, { col: 2, row: 1 }), 'thinVertical')
})

test('terrainRoleAt: formação em L de 1 bloco de largura — o cotovelo TAMBÉM é canto de bloco fino, não canto normal (achado real, 2026-09-25, print antes/depois: reaproveitar o canto normal aqui assumia terreno que não existe no lado de dentro da curva)', () => {
  // (0,0)-(1,0)
  //        |
  //       (1,1)
  // (0,0) e (1,1) são PONTAS (só 1 vizinho cardeal cada); (1,0) é o COTOVELO (2 vizinhos cardeais,
  // oeste+sul) — a diagonal "de dentro" da curva (sudoeste, entre oeste e sul) também está vazia
  // (não existe (0,1) neste grupo), então vira canto de bloco fino, não o canto normal de uma
  // massa mais larga (ver teste "formação em L de 2 blocos de largura" abaixo pro contraste).
  const cells: TerrainCell[] = [
    { col: 0, row: 0 },
    { col: 1, row: 0 },
    { col: 1, row: 1 },
  ]
  const isMember = membershipOf(cells)
  assert.equal(terrainRoleAt(isMember, { col: 0, row: 0 }), 'thinHorizontalLeft')
  assert.equal(terrainRoleAt(isMember, { col: 1, row: 0 }), 'thinCornerTopRight')
  assert.equal(terrainRoleAt(isMember, { col: 1, row: 1 }), 'thinVerticalBottom')
})

test('terrainRoleAt: formação em L de 2 blocos de largura (chão de verdade) resolve os cantos externos normalmente — sem ponta de bloco fino aqui, cada perna tem mais de 1 vizinho cardeal', () => {
  // Barra horizontal (linhas 0-1, colunas 0-3) + perna vertical descendo (linhas 2-3, colunas
  // 0-1) — 2 células de espessura em toda parte, ninguém tem só 1 vizinho cardeal.
  const cells: TerrainCell[] = []
  for (let row = 0; row <= 1; row++) for (let col = 0; col <= 3; col++) cells.push({ col, row })
  for (let row = 2; row <= 3; row++) for (let col = 0; col <= 1; col++) cells.push({ col, row })
  const isMember = membershipOf(cells)
  assert.equal(terrainRoleAt(isMember, { col: 0, row: 0 }), 'topLeft')
  assert.equal(terrainRoleAt(isMember, { col: 1, row: 3 }), 'bottomRight')
})

test('terrainRoleAt: célula cercada nos 4 lados (bloco 3x3 sólido) vira fill só no centro', () => {
  const cells: TerrainCell[] = []
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) cells.push({ col, row })
  }
  const isMember = membershipOf(cells)
  assert.equal(terrainRoleAt(isMember, { col: 1, row: 1 }), 'fill')
  assert.equal(terrainRoleAt(isMember, { col: 0, row: 0 }), 'topLeft')
  assert.equal(terrainRoleAt(isMember, { col: 1, row: 0 }), 'top')
  assert.equal(terrainRoleAt(isMember, { col: 2, row: 0 }), 'topRight')
  assert.equal(terrainRoleAt(isMember, { col: 0, row: 1 }), 'left')
  assert.equal(terrainRoleAt(isMember, { col: 2, row: 1 }), 'right')
  assert.equal(terrainRoleAt(isMember, { col: 0, row: 2 }), 'bottomLeft')
  assert.equal(terrainRoleAt(isMember, { col: 1, row: 2 }), 'bottom')
  assert.equal(terrainRoleAt(isMember, { col: 2, row: 2 }), 'bottomRight')
})

test('terrainRoleAt: chão sólido retangular fechado (5x5) não gera nenhum canto interno — só o esquema de 9 nas bordas/cantos e fill no meio', () => {
  const cells: TerrainCell[] = []
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) cells.push({ col, row })
  }
  const isMember = membershipOf(cells)
  const innerCornerRoles = new Set<TerrainRole>(['innerTopLeft', 'innerTopRight', 'innerBottomLeft', 'innerBottomRight'])
  for (const cell of cells) {
    assert.ok(!innerCornerRoles.has(terrainRoleAt(isMember, cell)), `célula (${cell.col},${cell.row}) não deveria ser canto interno`)
  }
  // as 9 células realmente interiores (sem tocar a borda do retângulo 5x5) são preenchimento:
  for (let row = 1; row <= 3; row++) {
    for (let col = 1; col <= 3; col++) assert.equal(terrainRoleAt(isMember, { col, row }), 'fill')
  }
})

test('terrainRoleAt: recorte de 1 célula numa quina gera exatamente 1 canto interno, na célula certa', () => {
  // Bloco 3x3 sólido (cols/rows 0-2) rodeado de mais uma camada, MENOS o canto (0,0) — deixa a
  // célula central (1,1) com os 4 cardeais preenchidos mas a diagonal noroeste vazia.
  const cells: TerrainCell[] = []
  for (let row = -1; row <= 3; row++) {
    for (let col = -1; col <= 3; col++) {
      if (col === -1 && row === -1) continue // o recorte
      cells.push({ col, row })
    }
  }
  const isMember = membershipOf(cells)
  assert.equal(terrainRoleAt(isMember, { col: 0, row: 0 }), 'innerTopLeft')
  // ninguém mais na vizinhança vira canto interno por causa desse único recorte:
  const innerCornerRoles = new Set<TerrainRole>(['innerTopLeft', 'innerTopRight', 'innerBottomLeft', 'innerBottomRight'])
  const neighbors: TerrainCell[] = [
    { col: 1, row: 0 },
    { col: 0, row: 1 },
    { col: 1, row: 1 },
    { col: -1, row: 0 },
    { col: 0, row: -1 },
  ]
  for (const cell of neighbors) {
    const role = terrainRoleAt(isMember, cell)
    assert.ok(!innerCornerRoles.has(role), `célula (${cell.col},${cell.row}) não deveria ser canto interno (veio ${role})`)
  }
})

test('terrainRoleAt: 2 diagonais vazias ao mesmo tempo na mesma célula cai em preenchimento, sem travar', () => {
  // Igual ao teste do recorte de 1 célula, mas agora faltam DUAS diagonais opostas (noroeste e
  // sudeste) da célula central (1,1) — fora do esquema de 13, decisão de escopo documentada.
  const cells: TerrainCell[] = []
  for (let row = -1; row <= 3; row++) {
    for (let col = -1; col <= 3; col++) {
      if ((col === -1 && row === -1) || (col === 3 && row === 3)) continue // as 2 diagonais
      cells.push({ col, row })
    }
  }
  const isMember = membershipOf(cells)
  assert.equal(terrainRoleAt(isMember, { col: 1, row: 1 }), 'fill')
})

test('terrainRoleAt: fronteira entre dois grupos de terreno diferentes sempre desenha borda, nunca mistura', () => {
  // Dois blocos 3x3 sólidos lado a lado (grupo A nas colunas 0-2, grupo B nas colunas 3-5) — do
  // ponto de vista de A, uma célula de B não é diferente de uma célula vazia: sempre borda ali.
  const groupACells: TerrainCell[] = []
  const groupBCells: TerrainCell[] = []
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) groupACells.push({ col, row })
    for (let col = 3; col < 6; col++) groupBCells.push({ col, row })
  }
  const isMemberA = membershipOf(groupACells)
  // Sem o vizinho de B, (2,1) seria "cercada" (topo/baixo/esquerda vêm do próprio grupo A) — mas o
  // vizinho a leste é do grupo B, então deveria continuar sendo borda direita, nunca fill.
  assert.equal(terrainRoleAt(isMemberA, { col: 2, row: 1 }), 'right')

  // Mesma ideia, mas testando a checagem DIAGONAL: um bloco 5x5 do grupo A com uma ÚNICA célula
  // substituída por uma célula do grupo B (não vazia — só de OUTRO grupo) numa posição diagonal
  // deveria gerar canto interno ali, igual a uma célula vazia geraria.
  const mixedGroupACells: TerrainCell[] = []
  for (let row = -1; row <= 3; row++) {
    for (let col = -1; col <= 3; col++) {
      if (col === -1 && row === -1) continue // essa célula "pertence" ao grupo B, não a A
      mixedGroupACells.push({ col, row })
    }
  }
  const isMemberMixedA = membershipOf(mixedGroupACells)
  assert.equal(terrainRoleAt(isMemberMixedA, { col: 0, row: 0 }), 'innerTopLeft')
})

test('terrainCellsToReevaluate: célula isolada só reavalia ela mesma (vizinhos não pertencem ao grupo)', () => {
  const isMember = membershipOf([{ col: 4, row: 4 }])
  const cells = terrainCellsToReevaluate(isMember, { col: 4, row: 4 })
  assert.deepEqual(cells, [{ col: 4, row: 4 }])
})

test('terrainCellsToReevaluate: célula no meio de uma linha reavalia ela + os vizinhos que pertencem, incluindo diagonal (complemento "cantos internos")', () => {
  const isMember = membershipOf([
    { col: 0, row: 0 },
    { col: 1, row: 0 },
    { col: 2, row: 0 },
    // vizinho DIAGONAL de (1,0) que pertence ao grupo — precisa entrar na lista agora (uma
    // diagonal pode virar canto interno/preenchimento dependendo do que muda na célula central).
    { col: 2, row: 1 },
  ])
  const cells = terrainCellsToReevaluate(isMember, { col: 1, row: 0 })
  assert.deepEqual(
    new Set(cells.map((c) => `${c.col},${c.row}`)),
    new Set(['1,0', '0,0', '2,0', '2,1']),
  )
})

test('terrainCellsToReevaluate: vizinho diagonal que NÃO pertence ao grupo fica de fora', () => {
  const isMember = membershipOf([
    { col: 1, row: 1 },
    // (2,2) é diagonal de (1,1) mas não pertence ao grupo:
  ])
  const cells = terrainCellsToReevaluate(isMember, { col: 1, row: 1 })
  assert.deepEqual(cells, [{ col: 1, row: 1 }])
})

test('terrainCellsToReevaluate: apagar uma célula (deixa de pertencer) só reavalia os vizinhos que sobraram', () => {
  // Depois de apagar o meio de uma linha de 3, os dois extremos ficam isolados um do outro — a
  // célula apagada em si não entra (não pertence mais a nada).
  const isMember = membershipOf([
    { col: 0, row: 0 },
    { col: 2, row: 0 },
  ])
  const cells = terrainCellsToReevaluate(isMember, { col: 1, row: 0 })
  assert.deepEqual(
    new Set(cells.map((c) => `${c.col},${c.row}`)),
    new Set(['0,0', '2,0']),
  )
})

// ---------- trimRoleForMapEdges: bordas do mapa "seamless" (docs/PROGRESS.md, "fases largas de
// verdade"/autotile, 2026-09-25) ----------
//
// Achado real: uma versão ANTERIOR desse ajuste fazia `terrainRoleAt` enxergar a borda do mapa
// como "pertence ao grupo" DIRETO (via um `isMember` que devolvia `true` fora dos limites) — isso
// quebrava formas côncavas/finas perto da borda (ex.: uma moldura oca), porque de repente os 4
// cardeais "pareciam" preenchidos e o canto de verdade virava canto INTERNO por engano. Corrigido
// separando os dois passos: `terrainRoleAt` sempre resolve com pertencimento REAL, e só DEPOIS
// `trimRoleForMapEdges` corta a borda que toca o limite do mapa no papel já resolvido.

test('trimRoleForMapEdges: sem tocar borda nenhuma, devolve o papel original sem mudar nada', () => {
  assert.equal(trimRoleForMapEdges('topLeft', NO_EDGE), 'topLeft')
  assert.equal(trimRoleForMapEdges('thinVertical', NO_EDGE), 'thinVertical')
  assert.equal(trimRoleForMapEdges('fill', NO_EDGE), 'fill')
})

test('trimRoleForMapEdges: chão largo tocando a borda esquerda — o lado que toca vira "chão contínuo" (achado original, 2026-09-25)', () => {
  // Topo do chão (grama) no canto esquerdo: perde só o lado esquerdo, sobra o topo.
  assert.equal(trimRoleForMapEdges('topLeft', { ...NO_EDGE, left: true }), 'top')
  // Meio do chão (só "esquerda" antes): perde o único lado que tinha — vira preenchimento.
  assert.equal(trimRoleForMapEdges('left', { ...NO_EDGE, left: true }), 'fill')
  // Base do chão no canto esquerdo: perde só o lado esquerdo, sobra a base.
  assert.equal(trimRoleForMapEdges('bottomLeft', { ...NO_EDGE, left: true }), 'bottom')
})

test('trimRoleForMapEdges: bloco fino tocando a borda de mapa perde só o lado que toca, sem virar canto errado', () => {
  // Coluna fina vertical (meio) encostada na borda esquerda do mapa — perde a borda esquerda,
  // sobra só a direita (facing o resto da fase).
  assert.equal(trimRoleForMapEdges('thinVertical', { ...NO_EDGE, left: true }), 'right')
  // Ponta de cima da coluna fina, também na borda esquerda — perde esquerda, sobra topo+direita.
  assert.equal(trimRoleForMapEdges('thinVerticalTop', { ...NO_EDGE, left: true }), 'topRight')
  // Faixa fina horizontal (meio) encostada na borda de CIMA do mapa — perde o topo, sobra a base.
  assert.equal(trimRoleForMapEdges('thinHorizontal', { ...NO_EDGE, top: true }), 'bottom')
})

test('trimRoleForMapEdges: célula no canto EXATO do mapa (2 bordas ao mesmo tempo) pode virar preenchimento se os 2 únicos lados abertos tocarem o limite', () => {
  assert.equal(trimRoleForMapEdges('topLeft', { top: true, bottom: false, left: true, right: false }), 'fill')
})

test('trimRoleForMapEdges: cantos internos e entalhes de lado inteiro nunca são afetados (não têm entrada na tabela de lados)', () => {
  assert.equal(trimRoleForMapEdges('innerTopLeft', { top: true, bottom: true, left: true, right: true }), 'innerTopLeft')
  assert.equal(trimRoleForMapEdges('notchTop', { top: true, bottom: true, left: true, right: true }), 'notchTop')
})

test('terrainRoleAt + trimRoleForMapEdges: moldura oca (1 bloco de espessura) encostada nas 4 bordas do mapa continua com cantos/blocos finos corretos — REGRESSÃO real, 2026-09-25 (a versão anterior do ajuste de borda virava canto interno aqui)', () => {
  const W = 8
  const H = 6
  const cells: TerrainCell[] = []
  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      if (row === 0 || row === H - 1 || col === 0 || col === W - 1) cells.push({ col, row })
    }
  }
  const isMember = membershipOf(cells)
  function roleAtEdge(cell: TerrainCell): TerrainRole {
    return trimRoleForMapEdges(terrainRoleAt(isMember, cell), {
      top: cell.row === 0,
      bottom: cell.row === H - 1,
      left: cell.col === 0,
      right: cell.col === W - 1,
    })
  }

  // Os 4 cantos da moldura, exatamente nos 4 cantos do mapa: como a moldura é 1 bloco de
  // espessura, cada canto é um COTOVELO de bloco fino de verdade (achado real mais recente, ver
  // "Blocos finos — canto/cotovelo") — isso tem prioridade sobre o corte de borda de mapa (mesmo
  // motivo de cantos internos/entalhes: não tem entrada em `ROLE_MAP_EDGE_SIDES`, passa
  // inalterado). Nunca vira canto interno (o bug original desta entrada).
  assert.equal(roleAtEdge({ col: 0, row: 0 }), 'thinCornerTopLeft')
  assert.equal(roleAtEdge({ col: W - 1, row: 0 }), 'thinCornerTopRight')
  assert.equal(roleAtEdge({ col: 0, row: H - 1 }), 'thinCornerBottomLeft')
  assert.equal(roleAtEdge({ col: W - 1, row: H - 1 }), 'thinCornerBottomRight')

  // Meio das paredes (topo/base horizontais, laterais verticais): perde só o lado que toca a
  // borda do mapa, sobra o lado que faz fronteira com o buraco oco no meio da moldura.
  assert.equal(roleAtEdge({ col: 3, row: 0 }), 'bottom')
  assert.equal(roleAtEdge({ col: 3, row: H - 1 }), 'top')
  assert.equal(roleAtEdge({ col: 0, row: 2 }), 'right')
  assert.equal(roleAtEdge({ col: W - 1, row: 2 }), 'left')

  // Nenhuma célula da moldura vira canto interno (o bug real reportado pelo usuário).
  const innerRoles = new Set<TerrainRole>(['innerTopLeft', 'innerTopRight', 'innerBottomLeft', 'innerBottomRight'])
  for (const cell of cells) {
    assert.ok(!innerRoles.has(roleAtEdge(cell)), `célula (${cell.col},${cell.row}) não deveria virar canto interno`)
  }
})
