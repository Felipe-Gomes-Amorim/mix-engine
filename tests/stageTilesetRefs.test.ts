import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateStageTilesetRefs, parseStageTilesetRefs } from '../src/lib/tilemap/stageTilesetRefs.ts'
import { NO_TILE, STAGE_DEFAULT_WIDTH_TILES, STAGE_PAGE_TILES } from '../src/lib/tilemap/types.ts'

function fakeGrid(fillValue: number, cellCount = 32 * 32): Uint16Array {
  return new Uint16Array(cellCount).fill(fillValue)
}

test('generateStageTilesetRefs + parseStageTilesetRefs: round-trip com vários tilesets e grade pintada', () => {
  const refs = [
    { name: 'floresta', version: 3 },
    { name: 'castelo', version: 1 },
  ]
  const grid = fakeGrid(5)
  grid[10] = 42
  const gridLayer2 = fakeGrid(NO_TILE)
  gridLayer2[10] = 7

  const json = generateStageTilesetRefs(refs, STAGE_DEFAULT_WIDTH_TILES, grid, gridLayer2)
  const parsed = parseStageTilesetRefs(json)

  assert.deepEqual(parsed.tilesets, refs)
  assert.equal(parsed.widthTiles, STAGE_DEFAULT_WIDTH_TILES)
  assert.equal(parsed.grid.length, 1024)
  assert.equal(parsed.gridLayer2.length, 1024)
  assert.equal(parsed.grid[10], 42)
  assert.equal(parsed.grid[0], 5)
  assert.equal(parsed.gridLayer2[10], 7)
  assert.equal(parsed.gridLayer2[0], NO_TILE)
})

test('generateStageTilesetRefs + parseStageTilesetRefs: 1 tileset só, grade toda vazia (Camada 2)', () => {
  const json = generateStageTilesetRefs([{ name: 'a', version: 1 }], STAGE_DEFAULT_WIDTH_TILES, fakeGrid(0), fakeGrid(NO_TILE))
  const parsed = parseStageTilesetRefs(json)
  assert.equal(parsed.tilesets.length, 1)
  assert.ok(parsed.gridLayer2.every((v) => v === NO_TILE))
})

test('generateStageTilesetRefs + parseStageTilesetRefs: fase larga de verdade (docs/PROGRESS.md, "fases largas de verdade", 2026-09-24) round-tripa a largura e o tamanho de grade certos', () => {
  const widthTiles = STAGE_PAGE_TILES * 3 // 96 colunas
  const cellCount = widthTiles * 32 // altura sempre 32
  const grid = fakeGrid(1, cellCount)
  const gridLayer2 = fakeGrid(NO_TILE, cellCount)

  const json = generateStageTilesetRefs([{ name: 'a', version: 1 }], widthTiles, grid, gridLayer2)
  const parsed = parseStageTilesetRefs(json)
  assert.equal(parsed.widthTiles, widthTiles)
  assert.equal(parsed.grid.length, cellCount)
  assert.equal(parsed.gridLayer2.length, cellCount)
})

test('parseStageTilesetRefs: sidecar antigo sem "widthTiles" assume STAGE_DEFAULT_WIDTH_TILES (fases salvas antes desse campo existir)', () => {
  const json = JSON.stringify({
    tilesets: [{ name: 'a', version: 1 }],
    grid: Array(1024).fill(0),
    gridLayer2: Array(1024).fill(NO_TILE),
  })
  const parsed = parseStageTilesetRefs(json)
  assert.equal(parsed.widthTiles, STAGE_DEFAULT_WIDTH_TILES)
})

test('parseStageTilesetRefs: "widthTiles" inválido (não múltiplo de STAGE_PAGE_TILES, fora do intervalo, ou não numérico) lança erro em português', () => {
  const base = { tilesets: [{ name: 'a', version: 1 }], grid: Array(1024).fill(0), gridLayer2: Array(1024).fill(NO_TILE) }
  assert.throws(() => parseStageTilesetRefs(JSON.stringify({ ...base, widthTiles: 50 })), /widthTiles/)
  assert.throws(() => parseStageTilesetRefs(JSON.stringify({ ...base, widthTiles: 0 })), /widthTiles/)
  assert.throws(() => parseStageTilesetRefs(JSON.stringify({ ...base, widthTiles: 'trinta e dois' })), /widthTiles/)
})

test('parseStageTilesetRefs: JSON inválido ou formato inesperado lança erro em português', () => {
  assert.throws(() => parseStageTilesetRefs('não é json'), /JSON válido/)
  assert.throws(() => parseStageTilesetRefs('null'), /formato esperado/)
  assert.throws(() => parseStageTilesetRefs('{}'), /não lista nenhum tileset/)
  assert.throws(() => parseStageTilesetRefs(JSON.stringify({ tilesets: [] })), /não lista nenhum tileset/)
  assert.throws(() => parseStageTilesetRefs(JSON.stringify({ tilesets: [{ name: '', version: 1 }] })), /sem nome válido/)
  assert.throws(() => parseStageTilesetRefs(JSON.stringify({ tilesets: [{ name: 'a', version: 0 }] })), /versão inválida/)
  assert.throws(
    () => parseStageTilesetRefs(JSON.stringify({ tilesets: [{ name: 'a', version: 1 }], grid: [1, 2, 3] })),
    /tamanho errado/,
  )
})

test('generateStageTilesetRefs + parseStageTilesetRefs: round-trip com um Fundo (kind: "background") misturado a tilesets normais (docs/PROGRESS.md, "Fundo como recurso salvo", 2026-09-30)', () => {
  const refs = [
    { name: 'floresta', version: 2 },
    { name: 'ceu', version: 1, kind: 'background' as const },
  ]
  const json = generateStageTilesetRefs(refs, STAGE_DEFAULT_WIDTH_TILES, fakeGrid(0), fakeGrid(NO_TILE))
  const parsed = parseStageTilesetRefs(json)
  assert.deepEqual(parsed.tilesets, refs)
  // tileset normal continua SEM a chave `kind` no JSON gravado (não só `undefined`) — mesmo espírito
  // enxuto de outros campos opcionais deste arquivo.
  const raw = JSON.parse(json)
  assert.equal('kind' in raw.tilesets[0], false)
  assert.equal(raw.tilesets[1].kind, 'background')
})

test('generateStageTilesetRefs + parseStageTilesetRefs: round-trip da cor de fundo (docs/PROGRESS.md, "seletor de cor de fundo", 2026-09-30)', () => {
  const refs = [{ name: 'floresta', version: 1 }]
  const json = generateStageTilesetRefs(refs, STAGE_DEFAULT_WIDTH_TILES, fakeGrid(0), fakeGrid(NO_TILE), [120, 180, 255])
  const parsed = parseStageTilesetRefs(json)
  assert.deepEqual(parsed.backdropColor, [120, 180, 255])
})

test('parseStageTilesetRefs: sidecar sem "backdropColor" (salvo antes desse campo existir) devolve undefined, sem lançar', () => {
  const json = generateStageTilesetRefs([{ name: 'a', version: 1 }], STAGE_DEFAULT_WIDTH_TILES, fakeGrid(0), fakeGrid(NO_TILE))
  const parsed = parseStageTilesetRefs(json)
  assert.equal(parsed.backdropColor, undefined)
})

test('parseStageTilesetRefs: "backdropColor" corrompido (não é trio de 0-255) vira undefined em vez de propagar lixo', () => {
  const base = { tilesets: [{ name: 'a', version: 1 }], grid: Array(1024).fill(0), gridLayer2: Array(1024).fill(NO_TILE) }
  assert.equal(parseStageTilesetRefs(JSON.stringify({ ...base, backdropColor: [1, 2] })).backdropColor, undefined)
  assert.equal(parseStageTilesetRefs(JSON.stringify({ ...base, backdropColor: [1, 2, 300] })).backdropColor, undefined)
  assert.equal(parseStageTilesetRefs(JSON.stringify({ ...base, backdropColor: 'red' })).backdropColor, undefined)
})

test('parseStageTilesetRefs: valor não-numérico dentro de grid/gridLayer2 vira NO_TILE em vez de propagar lixo', () => {
  const grid = Array(1024).fill(0)
  grid[5] = 'oops'
  const parsed = parseStageTilesetRefs(
    JSON.stringify({ tilesets: [{ name: 'a', version: 1 }], grid, gridLayer2: Array(1024).fill(NO_TILE) }),
  )
  assert.equal(parsed.grid[5], NO_TILE)
})
