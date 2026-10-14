// Redimensionar a grade da Camada 2 (docs/PROGRESS.md, "Camada 2 como padrão repetível",
// 2026-09-29) — ela tem largura PRÓPRIA agora (32 ou 64 tiles, `LAYER2_WIDTH_OPTIONS`),
// independente da largura da fase. Puro: só reshape de array 2D (linhas de `STAGE_HEIGHT_TILES`
// células), sem saber nada de React/canvas — dá pra testar isolado.

import { LAYER2_MAX_USEFUL_WIDTH_TILES, NO_TILE, STAGE_HEIGHT_TILES, type StageGrid } from './types.ts'

/**
 * Redimensiona uma grade de Camada 2 de `oldCols` pra `newCols` colunas (altura sempre
 * `STAGE_HEIGHT_TILES`) — cresce preenchendo com `NO_TILE` (nada pintado) à direita; encolhe
 * DESCARTANDO o que sobrar à direita. Preserva a estrutura de LINHAS (não é um truncamento plano
 * do array — cada linha de `oldCols` células precisa virar uma linha de `newCols`, senão a
 * segunda linha em diante desalinha).
 */
export function resizeLayer2Grid(grid: StageGrid, oldCols: number, newCols: number): StageGrid {
  if (oldCols === newCols) return grid
  const next = new Uint16Array(newCols * STAGE_HEIGHT_TILES).fill(NO_TILE)
  const copyCols = Math.min(oldCols, newCols)
  for (let row = 0; row < STAGE_HEIGHT_TILES; row++) {
    for (let col = 0; col < copyCols; col++) {
      next[row * newCols + col] = grid[row * oldCols + col]
    }
  }
  return next
}

/** `true` se alguma célula da grade, a partir da coluna `fromCol` (inclusive), tem algo pintado
 * (`!== NO_TILE`) — usado pra decidir se precisa confirmar antes de ENCOLHER a largura da Camada 2
 * (diminuir descarta permanentemente o que estiver além da nova largura). */
export function layer2GridHasContentFromColumn(grid: StageGrid, cols: number, fromCol: number): boolean {
  for (let row = 0; row < STAGE_HEIGHT_TILES; row++) {
    for (let col = fromCol; col < cols; col++) {
      if (grid[row * cols + col] !== NO_TILE) return true
    }
  }
  return false
}

export interface AdaptedLegacyLayer2 {
  grid: StageGrid
  widthTiles: number
  /** `true` quando a grade carregada era mais larga que `LAYER2_MAX_USEFUL_WIDTH_TILES` e foi
   * cortada — só as colunas que a Anubis realmente lê (as primeiras `LAYER2_MAX_USEFUL_WIDTH_TILES`)
   * foram preservadas; o resto já era desperdiçado mesmo (nunca aparecia no jogo). */
  truncated: boolean
  /** Quantas colunas tinha ANTES de cortar — só relevante quando `truncated` é `true`, pra
   * mensagem ao usuário. */
  originalWidthTiles: number
}

/**
 * Adapta uma grade de Camada 2 recém-CARREGADA (fase salva antes dela ter largura própria —
 * docs/PROGRESS.md, "Camada 2 como padrão repetível", 2026-09-29) — se já cabe no máximo útil
 * (`LAYER2_MAX_USEFUL_WIDTH_TILES`, hoje 64), devolve como está (mesmo que não seja exatamente 32
 * ou 64 — o seletor da UI decide se oferece redimensionar). Se for mais larga que isso, CORTA pras
 * primeiras `LAYER2_MAX_USEFUL_WIDTH_TILES` colunas — o resto nunca aparecia no jogo mesmo (só as
 * primeiras colunas são lidas pela Anubis), então cortar aqui não perde nada que já funcionasse.
 */
export function adaptLegacyLayer2Grid(grid: StageGrid): AdaptedLegacyLayer2 {
  const widthTiles = grid.length / STAGE_HEIGHT_TILES
  if (widthTiles <= LAYER2_MAX_USEFUL_WIDTH_TILES) {
    return { grid, widthTiles, truncated: false, originalWidthTiles: widthTiles }
  }
  return {
    grid: resizeLayer2Grid(grid, widthTiles, LAYER2_MAX_USEFUL_WIDTH_TILES),
    widthTiles: LAYER2_MAX_USEFUL_WIDTH_TILES,
    truncated: true,
    originalWidthTiles: widthTiles,
  }
}
