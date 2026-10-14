import assert from 'node:assert/strict'
import { test } from 'node:test'
import { combineTilesets } from '../src/lib/tilemap/combineTilesets.ts'
import { mergeTilesetMetaToHardware } from '../src/lib/tilemap/mergeTilesetMeta.ts'
import { HARDWARE_TILE_SIZE, type CollisionKind } from '../src/lib/tilemap/types.ts'
import type { RgbColor } from '../src/lib/indexedBmp.ts'

function solidUpload(cols: number, rows: number, blockSize: number, label: string) {
  const width = cols * blockSize
  const height = rows * blockSize
  const indices = new Uint8Array(width * height).fill(1) // 1 cor só, nunca 0 (transparente)
  const palette: RgbColor[] = Array.from({ length: 16 }, (_, i) => [i, i, i])
  return { width, height, indices, palette, label }
}

test('mergeTilesetMetaToHardware: 1 tileset, blockSize 8 == hardware — tradução é 1:1', () => {
  const upload = solidUpload(4, 1, 8, 'a.png')
  const hardwareCombined = combineTilesets([upload], HARDWARE_TILE_SIZE)
  const collision = new Map<number, CollisionKind>([[2, 'solid']])
  const merged = mergeTilesetMetaToHardware(hardwareCombined, [
    { ...upload, meta: { version: 1, blockSize: 8, collision, layer: new Map(), priority: new Map(), terrainGroups: [] } },
  ])
  assert.deepEqual([...merged.collision.entries()], [[2, 'solid']])
})

test('mergeTilesetMetaToHardware: 1 tileset, blockSize 16 — 1 bloco marcado vira 4 tiles de hardware (2x2)', () => {
  const upload = solidUpload(2, 1, 16, 'a.png') // 2 blocos de 16px = 4x2 tiles de hardware
  const hardwareCombined = combineTilesets([upload], HARDWARE_TILE_SIZE)
  const collision = new Map<number, CollisionKind>([[1, 'solid']]) // 2º bloco de 16px (col 1)
  const merged = mergeTilesetMetaToHardware(hardwareCombined, [
    { ...upload, meta: { version: 1, blockSize: 16, collision, layer: new Map(), priority: new Map(), terrainGroups: [] } },
  ])

  // bloco 1 (16px) ocupa colunas de hardware 2-3, linhas 0-1 (raster de 4 tiles de largura)
  const hardwareCols = hardwareCombined.tileset.cols
  const expected = [2, 3, hardwareCols + 2, hardwareCols + 3]
  assert.deepEqual([...merged.collision.keys()].sort((a, b) => a - b), expected.sort((a, b) => a - b))
  for (const hw of expected) assert.equal(merged.collision.get(hw), 'solid')
})

test('mergeTilesetMetaToHardware: dois tilesets com blockSize DIFERENTE combinados — cada um traduzido pro seu próprio banco', () => {
  // a capacidade central deste recurso: tileset A salvo em 16px, tileset B salvo em 32px, os dois
  // escolhidos juntos numa fase — não existe um "blockSize da combinação" único que sirva pros
  // dois, por isso a tradução é sempre por tile de HARDWARE (docs/PROGRESS.md, "tilesets como
  // recurso salvo e reutilizável", 2026-09-23).
  const a = solidUpload(2, 1, 16, 'a.png') // banda 0: 4x2 tiles de hardware
  const b = solidUpload(1, 1, 32, 'b.png') // banda 1: 4x4 tiles de hardware, empilhada embaixo da A
  const hardwareCombined = combineTilesets([a, b], HARDWARE_TILE_SIZE)

  const collisionA = new Map<number, CollisionKind>([[0, 'solid']]) // 1º bloco de 16px da A
  const collisionB = new Map<number, CollisionKind>([[0, 'goal']]) // único bloco de 32px da B
  const merged = mergeTilesetMetaToHardware(hardwareCombined, [
    { ...a, meta: { version: 1, blockSize: 16, collision: collisionA, layer: new Map(), priority: new Map(), terrainGroups: [] } },
    { ...b, meta: { version: 1, blockSize: 32, collision: collisionB, layer: new Map(), priority: new Map(), terrainGroups: [] } },
  ])

  const hardwareCols: number = hardwareCombined.tileset.cols
  // bloco 0 da A: colunas 0-1, linhas 0-1 (banda A começa em rowOffset 0)
  for (const hwIndexA of [0, 1, hardwareCols, hardwareCols + 1]) {
    assert.equal(merged.collision.get(hwIndexA), 'solid', `tile de hardware ${hwIndexA} (bloco da A) deveria ser sólido`)
  }
  // bloco único da B: 4x4 tiles, começando na banda B (rowOffset = altura em tiles de hardware da A = 2)
  const bandB = hardwareCombined.bands[1]
  assert.equal(bandB.rowOffset, 2, 'banda B começa depois das 2 linhas de tile de hardware da A')
  for (let dy = 0; dy < 4; dy++) {
    for (let dx = 0; dx < 4; dx++) {
      const hwIndexB: number = (bandB.rowOffset + dy) * hardwareCols + dx
      assert.equal(merged.collision.get(hwIndexB), 'goal', `tile de hardware ${hwIndexB} (bloco da B) deveria ser bandeira`)
    }
  }
})

test('mergeTilesetMetaToHardware: camada segue a mesma tradução, independente da colisão', () => {
  const upload = solidUpload(2, 1, 16, 'a.png')
  const hardwareCombined = combineTilesets([upload], HARDWARE_TILE_SIZE)
  const layer = new Map<number, 1 | 2>([[0, 2]])
  const merged = mergeTilesetMetaToHardware(hardwareCombined, [
    { ...upload, meta: { version: 1, blockSize: 16, collision: new Map(), layer, priority: new Map(), terrainGroups: [] } },
  ])
  const hardwareCols = hardwareCombined.tileset.cols
  for (const hw of [0, 1, hardwareCols, hardwareCols + 1]) {
    assert.equal(merged.layer.get(hw), 2)
  }
  assert.equal(merged.collision.size, 0, 'colisão não marcada continua vazia')
})

test('mergeTilesetMetaToHardware: prioridade ("na frente do sprite") segue a mesma tradução, independente de colisão/camada (docs/DATA_FORMAT.md § 4, "Bit de prioridade por tile da Camada 1", 2026-10-02)', () => {
  const upload = solidUpload(2, 1, 16, 'a.png')
  const hardwareCombined = combineTilesets([upload], HARDWARE_TILE_SIZE)
  const priority = new Map<number, boolean>([[1, true]]) // 2º bloco de 16px (col 1)
  const merged = mergeTilesetMetaToHardware(hardwareCombined, [
    { ...upload, meta: { version: 1, blockSize: 16, collision: new Map(), layer: new Map(), priority, terrainGroups: [] } },
  ])
  const hardwareCols = hardwareCombined.tileset.cols
  const expected = [2, 3, hardwareCols + 2, hardwareCols + 3]
  assert.deepEqual([...merged.priority.keys()].sort((a, b) => a - b), expected.sort((a, b) => a - b))
  for (const hw of expected) assert.equal(merged.priority.get(hw), true)
})

test('mergeTilesetMetaToHardware: entrada de prioridade `false` (bloco desmarcado de novo) NÃO gera entrada no mapa mesclado — igual ao espírito enxuto de collision/layer', () => {
  const upload = solidUpload(2, 1, 16, 'a.png')
  const hardwareCombined = combineTilesets([upload], HARDWARE_TILE_SIZE)
  const priority = new Map<number, boolean>([[0, false]])
  const merged = mergeTilesetMetaToHardware(hardwareCombined, [
    { ...upload, meta: { version: 1, blockSize: 16, collision: new Map(), layer: new Map(), priority, terrainGroups: [] } },
  ])
  assert.equal(merged.priority.size, 0)
})
