import assert from 'node:assert/strict'
import { test } from 'node:test'
import { adaptLegacyLayer2Grid, layer2GridHasContentFromColumn, resizeLayer2Grid } from '../src/lib/tilemap/layer2Grid.ts'
import { NO_TILE, STAGE_HEIGHT_TILES } from '../src/lib/tilemap/types.ts'

function fakeGrid(cols: number, paint: (row: number, col: number) => number): Uint16Array {
  const grid = new Uint16Array(cols * STAGE_HEIGHT_TILES).fill(NO_TILE)
  for (let row = 0; row < STAGE_HEIGHT_TILES; row++) {
    for (let col = 0; col < cols; col++) {
      const value = paint(row, col)
      if (value !== NO_TILE) grid[row * cols + col] = value
    }
  }
  return grid
}

test('resizeLayer2Grid: mesmo tamanho devolve a MESMA referência (no-op, sem copiar à toa)', () => {
  const grid = fakeGrid(32, () => NO_TILE)
  assert.equal(resizeLayer2Grid(grid, 32, 32), grid)
})

test('resizeLayer2Grid: crescer preserva cada linha na posição certa e preenche o resto com NO_TILE (achado real: um truncamento/expansão "plano" desalinharia a 2ª linha em diante)', () => {
  // 2 colunas x 32 linhas, cada célula = (linha*10 + coluna) pra reconhecer exatamente onde foi parar.
  const grid = fakeGrid(2, (row, col) => row * 10 + col)
  const grown = resizeLayer2Grid(grid, 2, 4)
  assert.equal(grown.length, 4 * STAGE_HEIGHT_TILES)
  for (let row = 0; row < STAGE_HEIGHT_TILES; row++) {
    assert.equal(grown[row * 4 + 0], row * 10 + 0, `linha ${row}, coluna 0`)
    assert.equal(grown[row * 4 + 1], row * 10 + 1, `linha ${row}, coluna 1`)
    assert.equal(grown[row * 4 + 2], NO_TILE, `linha ${row}, coluna 2 (nova, vazia)`)
    assert.equal(grown[row * 4 + 3], NO_TILE, `linha ${row}, coluna 3 (nova, vazia)`)
  }
})

test('resizeLayer2Grid: encolher preserva as colunas que sobram, na linha certa, descartando o resto', () => {
  const grid = fakeGrid(4, (row, col) => row * 10 + col)
  const shrunk = resizeLayer2Grid(grid, 4, 2)
  assert.equal(shrunk.length, 2 * STAGE_HEIGHT_TILES)
  for (let row = 0; row < STAGE_HEIGHT_TILES; row++) {
    assert.equal(shrunk[row * 2 + 0], row * 10 + 0)
    assert.equal(shrunk[row * 2 + 1], row * 10 + 1)
  }
})

test('layer2GridHasContentFromColumn: detecta bloco pintado além da coluna dada, em qualquer linha', () => {
  const grid = fakeGrid(4, () => NO_TILE)
  assert.equal(layer2GridHasContentFromColumn(grid, 4, 2), false)
  grid[10 * 4 + 3] = 7 // linha 10, coluna 3 (além de fromCol=2)
  assert.equal(layer2GridHasContentFromColumn(grid, 4, 2), true)
  // pintado só ANTES de fromCol não conta:
  const grid2 = fakeGrid(4, (_row, col) => (col === 0 ? 5 : NO_TILE))
  assert.equal(layer2GridHasContentFromColumn(grid2, 4, 2), false)
})

test('adaptLegacyLayer2Grid: grade já dentro do máximo útil (<=64) volta inalterada', () => {
  const grid32 = fakeGrid(32, () => NO_TILE)
  const result32 = adaptLegacyLayer2Grid(grid32)
  assert.deepEqual(result32, { grid: grid32, widthTiles: 32, truncated: false, originalWidthTiles: 32 })

  const grid64 = fakeGrid(64, () => NO_TILE)
  const result64 = adaptLegacyLayer2Grid(grid64)
  assert.equal(result64.widthTiles, 64)
  assert.equal(result64.truncated, false)
})

test('adaptLegacyLayer2Grid: grade mais larga que 64 (fase antiga, do tamanho da fase inteira) é cortada pras 64 primeiras colunas — achado real, docs/DATA_FORMAT.md "Camada 2 com parallax": só essas apareciam no jogo mesmo', () => {
  const legacyGrid = fakeGrid(96, (row, col) => row * 1000 + col) // fase antiga de 96 colunas
  const result = adaptLegacyLayer2Grid(legacyGrid)
  assert.equal(result.widthTiles, 64)
  assert.equal(result.truncated, true)
  assert.equal(result.originalWidthTiles, 96)
  assert.equal(result.grid.length, 64 * STAGE_HEIGHT_TILES)
  // as 64 primeiras colunas de cada linha continuam exatamente como estavam:
  for (let row = 0; row < STAGE_HEIGHT_TILES; row++) {
    for (let col = 0; col < 64; col++) {
      assert.equal(result.grid[row * 64 + col], row * 1000 + col, `linha ${row}, coluna ${col}`)
    }
  }
})
