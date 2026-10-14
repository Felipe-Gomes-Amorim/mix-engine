import assert from 'node:assert/strict'
import { test } from 'node:test'
import { composeLevel } from '../src/lib/tilemap/compose.ts'
import { generateCollisionHeader, generateTilePriorityText, summarizeCollision } from '../src/lib/tilemap/exportTilemap.ts'
import { buildTileset, tilePixels } from '../src/lib/tilemap/tileset.ts'
import {
  HARDWARE_TILE_SIZE,
  STAGE_DEFAULT_WIDTH_TILES,
  STAGE_HEIGHT_PIXELS,
  STAGE_HEIGHT_TILES,
  STAGE_MAX_WIDTH_TILES,
  STAGE_PAGE_TILES,
  stageGridCols,
  stageGridRows,
  stageWidthPixels,
} from '../src/lib/tilemap/types.ts'

// Largura PADRÃO usada pela maioria dos testes deste arquivo (docs/PROGRESS.md, "fases largas de
// verdade", 2026-09-24) — igual à altura, então mantém o comportamento "quadrado" que estes testes
// sempre assumiram, sem depender de uma largura fixa hardcoded no tipo.
const WIDTH_TILES = STAGE_DEFAULT_WIDTH_TILES

function solidTileImage(cols: number, rows: number, blockSize: number): Uint8Array {
  // Cada bloco é preenchido com um valor único = (índice do bloco) — fácil de conferir depois.
  const width = cols * blockSize
  const height = rows * blockSize
  const px = new Uint8Array(width * height)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const value = row * cols + col
      for (let y = 0; y < blockSize; y++) {
        for (let x = 0; x < blockSize; x++) {
          px[(row * blockSize + y) * width + col * blockSize + x] = value
        }
      }
    }
  }
  return px
}

for (const blockSize of [8, 16, 32] as const) {
  test(`buildTileset (bloco ${blockSize}px): fatia certinho, ordem raster, rejeita dimensão não múltipla do bloco`, () => {
    const px = solidTileImage(3, 2, blockSize)
    const tileset = buildTileset(3 * blockSize, 2 * blockSize, px, blockSize)
    assert.deepEqual(
      { cols: tileset.cols, rows: tileset.rows, tileCount: tileset.tileCount, blockSize: tileset.blockSize },
      { cols: 3, rows: 2, tileCount: 6, blockSize },
    )
    assert.throws(() => buildTileset(3 * blockSize - 1, 2 * blockSize, px, blockSize), new RegExp(`múltiplas de ${blockSize}`))
  })

  test(`tilePixels (bloco ${blockSize}px): cada bloco vem preenchido com o valor único daquele índice`, () => {
    const cols = 4
    const rows = 3
    const tileset = buildTileset(cols * blockSize, rows * blockSize, solidTileImage(cols, rows, blockSize), blockSize)
    for (let i = 0; i < tileset.tileCount; i++) {
      const pixels = tilePixels(tileset, i)
      assert.equal(pixels.length, blockSize * blockSize)
      assert.ok(
        [...pixels].every((v) => v === i),
        `bloco ${i} deveria ser só o valor ${i}, veio [${[...new Set(pixels)]}]`,
      )
    }
  })

  test(`composeLevel (bloco ${blockSize}px): imagem final sempre stageWidthPixels x STAGE_HEIGHT_PIXELS, cada célula com o bloco certo no lugar certo`, () => {
    const tileset = buildTileset(3 * blockSize, 1 * blockSize, solidTileImage(3, 1, blockSize), blockSize) // blocos 0,1,2
    const gridCols = stageGridCols(blockSize, WIDTH_TILES)
    const gridRows = stageGridRows(blockSize)
    const grid = new Uint16Array(gridCols * gridRows) // tudo bloco 0 (vazio) por padrão
    grid[0] = 1 // canto sup. esq.
    grid[gridCols - 1] = 2 // fim da 1ª linha
    grid[gridCols * gridRows - 1] = 1 // canto inf. dir.

    const level = composeLevel(tileset, grid, WIDTH_TILES)
    const widthPixels = stageWidthPixels(WIDTH_TILES)
    assert.deepEqual({ width: level.width, height: level.height }, { width: widthPixels, height: STAGE_HEIGHT_PIXELS })

    function pixelAt(px: number, py: number): number {
      return level.indices[py * level.width + px]
    }
    for (let y = 0; y < blockSize; y++) for (let x = 0; x < blockSize; x++) assert.equal(pixelAt(x, y), 1)
    const lastColX = (gridCols - 1) * blockSize
    for (let y = 0; y < blockSize; y++) for (let x = 0; x < blockSize; x++) assert.equal(pixelAt(lastColX + x, y), 2)
    // célula do meio (nunca pintada) continua bloco 0 (vazio)
    const midCol = Math.floor(gridCols / 2)
    assert.equal(pixelAt(midCol * blockSize, midCol * blockSize), 0)
    assert.equal(pixelAt(widthPixels - 1, STAGE_HEIGHT_PIXELS - blockSize), 1)
  })
}

test('generateCollisionHeader: colisão vem da tabela por índice de tile de HARDWARE, não de um valor fixo por célula', () => {
  // docs/PROGRESS.md, "tilesets como recurso salvo e reutilizável" (2026-09-23): `tileCollision`
  // agora é sempre indexada por tile de HARDWARE (8px) — cada tileset salvo pode ter seu próprio
  // blockSize, então não existe mais um "índice de bloco numa combinação a um blockSize só" único
  // (ver mergeTilesetMeta.ts, que resolve essa tradução ANTES de chegar aqui). `grid` já é sempre
  // em índice de hardware (docs/DATA_FORMAT.md § 4, "cursor de posicionamento sempre em 8px").
  const grid = new Uint16Array(32 * 32)
  grid[0] = 5 // tile "chão" -> sólido
  grid[1] = 9 // tile "bandeira" -> bandeira
  grid[2] = 5 // mesmo tile "chão" de novo -> sólido também
  // o resto fica no tile 0, sem entrada na tabela -> vazio (padrão)

  const tileCollision = new Map([
    [5, 'solid' as const],
    [9, 'goal' as const],
  ])
  const header = generateCollisionHeader('stage1', 'stage1.png', grid, tileCollision, WIDTH_TILES)

  assert.ok(header.includes('#define STAGE1_COLLISION_ROWS 32'))
  assert.ok(header.includes('#define STAGE1_COLLISION_COLS 32'))
  assert.ok(header.includes('static const u8 stage1_collision[STAGE1_COLLISION_ROWS * STAGE1_COLLISION_COLS] = {'))

  const arrayMatch = header.match(/= \{\n\s*([\s\S]*?)\n\};/)
  assert.ok(arrayMatch, 'array de colisão encontrado no header')
  const values = arrayMatch![1].split(',').map((v) => Number(v.trim()))
  assert.equal(values.length, 32 * 32)
  assert.equal(values[0], 1) // sólido
  assert.equal(values[1], 2) // bandeira
  assert.equal(values[2], 1) // sólido
  assert.equal(values[3], 0) // vazio (tile 0, sem entrada na tabela)
})

test('generateCollisionHeader: tabela vazia (nenhum tile marcado) exporta tudo vazio, sem lançar', () => {
  const grid = new Uint16Array(32 * 32).fill(0)
  const header = generateCollisionHeader('stage1', 'stage1.png', grid, new Map(), WIDTH_TILES)
  const arrayMatch = header.match(/= \{\n\s*([\s\S]*?)\n\};/)
  const values = arrayMatch![1].split(',').map((v) => Number(v.trim()))
  assert.ok(values.every((v) => v === 0))
})

test('generateCollisionHeader: largura larga de verdade (múltiplo de STAGE_PAGE_TILES) gera COLS/ROWS certos (docs/PROGRESS.md, "fases largas de verdade", 2026-09-24)', () => {
  for (const widthTiles of [STAGE_PAGE_TILES, STAGE_PAGE_TILES * 3, STAGE_MAX_WIDTH_TILES] as const) {
    const gridCols = stageGridCols(HARDWARE_TILE_SIZE, widthTiles)
    const gridRows = stageGridRows(HARDWARE_TILE_SIZE)
    const grid = new Uint16Array(gridCols * gridRows)
    const header = generateCollisionHeader('stage1', 'stage1.png', grid, new Map(), widthTiles)
    assert.ok(header.includes(`#define STAGE1_COLLISION_ROWS ${STAGE_HEIGHT_TILES}`))
    assert.ok(header.includes(`#define STAGE1_COLLISION_COLS ${widthTiles}`))
    const arrayMatch = header.match(/= \{\n\s*([\s\S]*?)\n\};/)
    const values = arrayMatch![1].split(',').map((v) => Number(v.trim()))
    assert.equal(values.length, widthTiles * STAGE_HEIGHT_TILES)
  }
})

test('generateTilePriorityText: exatamente 32 linhas de COLUNAS caracteres 0/1, resolvido por índice de tile de HARDWARE (docs/DATA_FORMAT.md § 4, "Bit de prioridade por tile da Camada 1", 2026-10-02)', () => {
  const grid = new Uint16Array(WIDTH_TILES * STAGE_HEIGHT_TILES)
  grid[0] = 5 // marcado "na frente"
  grid[1] = 9 // não marcado
  grid[WIDTH_TILES] = 5 // 1ª célula da 2ª linha, mesmo tile marcado de novo

  const tilePriority = new Map<number, boolean>([[5, true]])
  const text = generateTilePriorityText(grid, tilePriority, WIDTH_TILES)

  const lines = text.split('\n').filter((line) => line.length > 0)
  assert.equal(lines.length, STAGE_HEIGHT_TILES)
  for (const line of lines) assert.equal(line.length, WIDTH_TILES)
  assert.equal(lines[0][0], '1')
  assert.equal(lines[0][1], '0')
  assert.equal(lines[1][0], '1')
  assert.ok(lines[0].slice(2).split('').every((c) => c === '0'))
})

test('generateTilePriorityText: nenhum bloco marcado exporta as 32 linhas inteiras de "0" mesmo assim — nunca omite o arquivo (achado real, mesma lição da Camada 2, "export ficando desatualizado em silêncio")', () => {
  const grid = new Uint16Array(WIDTH_TILES * STAGE_HEIGHT_TILES)
  const text = generateTilePriorityText(grid, new Map(), WIDTH_TILES)
  const lines = text.split('\n').filter((line) => line.length > 0)
  assert.equal(lines.length, STAGE_HEIGHT_TILES)
  assert.ok(lines.every((line) => line === '0'.repeat(WIDTH_TILES)))
})

test('generateTilePriorityText: fase larga de verdade (múltiplo de STAGE_PAGE_TILES) gera linhas do tamanho certo', () => {
  const widthTiles = STAGE_PAGE_TILES * 3
  const grid = new Uint16Array(widthTiles * STAGE_HEIGHT_TILES)
  const text = generateTilePriorityText(grid, new Map(), widthTiles)
  const lines = text.split('\n').filter((line) => line.length > 0)
  assert.equal(lines.length, STAGE_HEIGHT_TILES)
  for (const line of lines) assert.equal(line.length, widthTiles)
})

test('stageWidthPixels/STAGE_HEIGHT_PIXELS: largura variável por fase (múltiplo de STAGE_PAGE_TILES), altura sempre fixa (docs/PROGRESS.md, "fases largas de verdade", 2026-09-24)', () => {
  assert.equal(STAGE_HEIGHT_PIXELS, STAGE_HEIGHT_TILES * HARDWARE_TILE_SIZE)
  assert.equal(stageGridRows(HARDWARE_TILE_SIZE), STAGE_HEIGHT_TILES)
  assert.equal(stageGridRows(16), STAGE_HEIGHT_PIXELS / 16)

  for (const widthTiles of [STAGE_PAGE_TILES, STAGE_PAGE_TILES * 2, STAGE_MAX_WIDTH_TILES] as const) {
    assert.equal(stageWidthPixels(widthTiles), widthTiles * HARDWARE_TILE_SIZE)
    assert.equal(stageGridCols(HARDWARE_TILE_SIZE, widthTiles), widthTiles)
    assert.equal(stageGridCols(16, widthTiles), stageWidthPixels(widthTiles) / 16)
  }
})

test('summarizeCollision: conta certinho os 3 tipos, célula sem entrada na tabela conta como vazio', () => {
  const grid = new Uint16Array(32 * 32) // tudo tile 0 (sem entrada -> vazio) por padrão
  grid[0] = 5 // sólido
  grid[1] = 9 // bandeira
  const tileCollision = new Map([
    [5, 'solid' as const],
    [9, 'goal' as const],
  ])
  const summary = summarizeCollision(grid, tileCollision)
  assert.deepEqual(summary, { empty: 32 * 32 - 2, solid: 1, goal: 1 })
})

test('summarizeCollision: reproduz o achado real (2026-09-23) — bloco 0 do 1º tileset marcado como bandeira sem querer vira bandeira em TODA célula nunca pintada', () => {
  // Camada 1 nunca tem "vazio" de verdade: célula nunca pintada guarda o tile 0 por padrão (ver
  // comentário de `summarizeCollision`). Uma fase com 392 células de chão sólido (tile 5) e o
  // resto nunca pintado (tile 0), com o tile 0 marcado (sem querer) como bandeira, exporta
  // exatamente 632 = 1024 - 392 células como bandeira e ZERO como vazio — bate com o relato real do
  // usuário jogando (docs/PROGRESS.md).
  const grid = new Uint16Array(32 * 32) // tudo tile 0 por padrão
  for (let i = 0; i < 392; i++) grid[i] = 5 // "chão" pintado
  const tileCollision = new Map([
    [5, 'solid' as const],
    [0, 'goal' as const], // o erro: bloco 0 (implícito em toda célula não pintada) marcado como bandeira
  ])
  const summary = summarizeCollision(grid, tileCollision)
  assert.deepEqual(summary, { empty: 0, solid: 392, goal: 1024 - 392 })
})
