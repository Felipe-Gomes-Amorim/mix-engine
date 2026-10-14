import assert from 'node:assert/strict'
import { test } from 'node:test'
import { countUniqueHardwareTiles } from '../src/lib/tilemap/vramBudget.ts'

/** Imagem sintética `cols x rows` tiles de 8x8, cada tile preenchido com um valor único = seu
 * índice raster — fácil de conferir quantos tiles "deveriam" ser únicos. */
function uniqueTilesImage(cols: number, rows: number): { width: number; height: number; indices: Uint8Array } {
  const width = cols * 8
  const height = rows * 8
  const indices = new Uint8Array(width * height)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const value = row * cols + col
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) indices[(row * 8 + y) * width + col * 8 + x] = value
      }
    }
  }
  return { width, height, indices }
}

test('countUniqueHardwareTiles: cada tile diferente conta como 1 — 3x2 tiles todos distintos dá 6', () => {
  const level = uniqueTilesImage(3, 2)
  assert.equal(countUniqueHardwareTiles(level), 6)
})

test('countUniqueHardwareTiles: tiles repetidos (mesmo pixel a pixel) dedupam pro mesmo — mesmo comportamento real do gfx4snes', () => {
  const level = uniqueTilesImage(2, 1) // 2 tiles distintos (valor 0 e 1)
  // repete o padrão inteiro lado a lado: 4 tiles no total, só 2 valores únicos (0,1,0,1)
  const width = level.width * 2
  const indices = new Uint8Array(width * level.height)
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const value = level.indices[y * level.width + x]
      indices[y * width + x] = value
      indices[y * width + level.width + x] = value
    }
  }
  assert.equal(countUniqueHardwareTiles({ width, height: level.height, indices }), 2)
})

test('countUniqueHardwareTiles: imagem toda transparente (Camada 2 vazia) conta como 1 tile único', () => {
  const level = { width: 8 * 5, height: 8 * 3, indices: new Uint8Array(8 * 5 * 8 * 3) } // tudo índice 0
  assert.equal(countUniqueHardwareTiles(level), 1)
})

test('countUniqueHardwareTiles: fase larga real (96 colunas x 32 linhas) com um padrão que se repete a cada página continua contando certo', () => {
  // 12x4 tiles de hardware (96x32px) — só 3 valores possíveis, repetidos várias vezes.
  const cols = 12
  const rows = 4
  const width = cols * 8
  const height = rows * 8
  const indices = new Uint8Array(width * height)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const value = (row + col) % 3
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) indices[(row * 8 + y) * width + col * 8 + x] = value
      }
    }
  }
  assert.equal(countUniqueHardwareTiles({ width, height, indices }), 3)
})
