import assert from 'node:assert/strict'
import { test } from 'node:test'
import { encodeIndexedBmp, type RgbColor } from '../src/lib/indexedBmp.ts'
import { bandGlobalTileIndex, blockToHardwareTopLeft, combineTilesets } from '../src/lib/tilemap/combineTilesets.ts'
import { composeLevel } from '../src/lib/tilemap/compose.ts'
import { generateCollisionHeader } from '../src/lib/tilemap/exportTilemap.ts'
import { parseCollisionHeader, reconstructLayer2, reconstructStage } from '../src/lib/tilemap/reconstructStage.ts'
import { buildTileset } from '../src/lib/tilemap/tileset.ts'
import {
  COLLISION_VALUES,
  HARDWARE_TILE_SIZE,
  STAGE_DEFAULT_WIDTH_TILES,
  STAGE_HEIGHT_PIXELS,
  STAGE_HEIGHT_TILES,
  STAGE_MAX_WIDTH_TILES,
  STAGE_PAGE_TILES,
  stageGridCols,
  stageGridRows,
  stageWidthPixels,
  type CollisionKind,
  type Tileset,
} from '../src/lib/tilemap/types.ts'

// A maioria dos testes deste arquivo usa a largura PADRÃO (32 tiles = mesma largura que altura,
// docs/PROGRESS.md "fases largas de verdade", 2026-09-24) — só os testes que exercitam largura
// variável de propósito passam um valor diferente.
const WIDTH_TILES = STAGE_DEFAULT_WIDTH_TILES

/** `generateCollisionHeader` sempre espera um grid de HARDWARE (largura variável x 32 linhas fixas,
 * docs/DATA_FORMAT.md § 4, "cursor de posicionamento sempre em 8px") — traduz um grid de BLOCOS (na
 * granularidade de `tileset.blockSize`, como os testes acima montam) pro grid de hardware carimbando
 * cada bloco pintado, exatamente como `paintCell` (StageEditor.tsx) faz de verdade célula a célula.
 * Só usado nos testes: em produção o grid já NASCE em resolução de hardware, nunca precisa dessa
 * conversão em lote. */
function blockGridToHardwareGrid(tileset: Tileset, blockGrid: Uint16Array, widthTiles: number): Uint16Array {
  const hwCols = stageGridCols(HARDWARE_TILE_SIZE, widthTiles)
  const hwRows = stageGridRows(HARDWARE_TILE_SIZE)
  const hardwareCols = tileset.sourceWidth / HARDWARE_TILE_SIZE
  const blockGridCols = stageGridCols(tileset.blockSize, widthTiles)
  const blockGridRows = stageGridRows(tileset.blockSize)
  const stampCells = tileset.blockSize / HARDWARE_TILE_SIZE
  const hardwareGrid = new Uint16Array(hwCols * hwRows)
  for (let row = 0; row < blockGridRows; row++) {
    for (let col = 0; col < blockGridCols; col++) {
      const topLeft = blockToHardwareTopLeft(tileset, blockGrid[row * blockGridCols + col])
      for (let dy = 0; dy < stampCells; dy++) {
        for (let dx = 0; dx < stampCells; dx++) {
          hardwareGrid[(row * stampCells + dy) * hwCols + (col * stampCells + dx)] =
            (topLeft.row + dy) * hardwareCols + (topLeft.col + dx)
        }
      }
    }
  }
  return hardwareGrid
}

/** Mesma tradução de `blockGridToHardwareGrid`, mas pra tabela de colisão (por índice de BLOCO) —
 * `generateCollisionHeader` agora sempre espera colisão indexada por tile de HARDWARE (docs/
 * PROGRESS.md, "tilesets como recurso salvo e reutilizável", 2026-09-23; ver mergeTilesetMeta.ts,
 * que faz essa mesma tradução em produção). */
function blockCollisionToHardwareCollision(
  tileset: Tileset,
  blockCollision: ReadonlyMap<number, CollisionKind>,
): Map<number, CollisionKind> {
  const hardwareCols = tileset.sourceWidth / HARDWARE_TILE_SIZE
  const stampCells = tileset.blockSize / HARDWARE_TILE_SIZE
  const hardwareCollision = new Map<number, CollisionKind>()
  for (const [blockIndex, kind] of blockCollision) {
    const topLeft = blockToHardwareTopLeft(tileset, blockIndex)
    for (let dy = 0; dy < stampCells; dy++) {
      for (let dx = 0; dx < stampCells; dx++) {
        hardwareCollision.set((topLeft.row + dy) * hardwareCols + (topLeft.col + dx), kind)
      }
    }
  }
  return hardwareCollision
}

function solidTileImage(cols: number, rows: number, blockSize: number): Uint8Array {
  const width = cols * blockSize
  const height = rows * blockSize
  const px = new Uint8Array(width * height)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const value = 1 + row * cols + col // nunca 0, pra não confundir com "vazio/transparente"
      for (let y = 0; y < blockSize; y++) {
        for (let x = 0; x < blockSize; x++) {
          px[(row * blockSize + y) * width + col * blockSize + x] = value
        }
      }
    }
  }
  return px
}

function randomPalette(seed: number): RgbColor[] {
  let a = seed
  const rand = () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return Array.from({ length: 16 }, () => [
    Math.floor(rand() * 256),
    Math.floor(rand() * 256),
    Math.floor(rand() * 256),
  ])
}

/** Monta um `.h` de colisão sintético com `rows`×`cols` quaisquer (não necessariamente válidos) —
 * só pra testar a checagem de tamanho de `reconstructStage`, sem passar pelo `generateCollisionHeader`
 * de verdade (que hoje já não deixaria gerar um tamanho inválido pela UI). */
function fakeCollisionHeader(rows: number, cols: number): string {
  const values = new Array(rows * cols).fill(0)
  return [
    '/* gerado pelo snes-asset-editor a partir de stage1.png — não editar à mão */',
    `#define STAGE1_COLLISION_ROWS ${rows}`,
    `#define STAGE1_COLLISION_COLS ${cols}`,
    `static const u8 stage1_collision[STAGE1_COLLISION_ROWS * STAGE1_COLLISION_COLS] = {`,
    `  ${values.join(', ')}`,
    '};',
    '',
  ].join('\n')
}

// ---------- parseCollisionHeader: inverso de generateCollisionHeader ----------

test('parseCollisionHeader: round-trip com generateCollisionHeader (rows/cols/valores)', () => {
  const blockSize = 8
  const gridCols = stageGridCols(blockSize, WIDTH_TILES)
  const gridRows = stageGridRows(blockSize)
  const grid = new Uint16Array(gridCols * gridRows)
  grid[0] = 2
  grid[5] = 3
  const tileCollision = new Map<number, CollisionKind>([
    [2, 'solid'],
    [3, 'goal'],
  ])
  const header = generateCollisionHeader('stage1', 'stage1.png', grid, tileCollision, WIDTH_TILES)

  const parsed = parseCollisionHeader('stage1', header)
  assert.equal(parsed.rows, 32)
  assert.equal(parsed.cols, 32)
  assert.equal(parsed.values.length, 1024)
  assert.equal(parsed.values[0], 1) // sólido
  assert.equal(parsed.values[5], 2) // bandeira
  assert.equal(parsed.values[1], 0) // vazio
})

test('parseCollisionHeader: erro em português quando falta #define ou o array', () => {
  assert.throws(() => parseCollisionHeader('stage1', ''), /STAGE1_COLLISION_ROWS/)
  assert.throws(
    () => parseCollisionHeader('stage1', '#define STAGE1_COLLISION_ROWS 32\n#define STAGE1_COLLISION_COLS 32\n'),
    /stage1_collision/,
  )
})

// ---------- reconstructStage: restrições de tamanho (achado real, 2026-09-24) ----------

test('reconstructStage: altura diferente de STAGE_HEIGHT_TILES lança mensagem clara (streaming da Anubis só funciona no eixo horizontal)', async () => {
  // Reproduz o cenário real que motivou essa checagem: uma fase foi salva enquanto o tamanho de
  // fase estava temporariamente maior (96x64, teste do viewport rolável — ver docs/PROGRESS.md
  // "preparar o editor pra fases maiores") e nunca foi resalva depois do revert. A largura 96
  // hoje é VÁLIDA (3 páginas) — só a altura 64 continua inválida pra sempre (restrição real e
  // permanente da Anubis, altura sempre 32).
  const header = fakeCollisionHeader(64, 96)
  const bmpBytes = new Uint8Array(await encodeIndexedBmp(8, 8, new Uint8Array(64), randomPalette(1)).arrayBuffer())

  assert.throws(() => reconstructStage(bmpBytes, header, 'stage1'), (err: unknown) => {
    assert.ok(err instanceof Error)
    assert.ok(err.message.includes('64×96'), `deveria citar o tamanho salvo (64×96): ${err.message}`)
    assert.ok(err.message.includes(String(STAGE_HEIGHT_TILES)), `deveria citar a altura fixa exigida: ${err.message}`)
    return true
  })
})

test('reconstructStage: largura que não é múltiplo de STAGE_PAGE_TILES lança mensagem clara', async () => {
  const header = fakeCollisionHeader(STAGE_HEIGHT_TILES, 50)
  const bmpBytes = new Uint8Array(await encodeIndexedBmp(8, 8, new Uint8Array(64), randomPalette(1)).arrayBuffer())

  assert.throws(() => reconstructStage(bmpBytes, header, 'stage1'), (err: unknown) => {
    assert.ok(err instanceof Error)
    assert.ok(err.message.includes(`${STAGE_HEIGHT_TILES}×50`), `deveria citar o tamanho salvo: ${err.message}`)
    return true
  })
})

test('reconstructStage: largura maior que STAGE_MAX_WIDTH_TILES lança mensagem clara (limite de ponteiro s16 da Anubis)', async () => {
  const invalidWidth = STAGE_MAX_WIDTH_TILES + STAGE_PAGE_TILES
  const header = fakeCollisionHeader(STAGE_HEIGHT_TILES, invalidWidth)
  const bmpBytes = new Uint8Array(await encodeIndexedBmp(8, 8, new Uint8Array(64), randomPalette(1)).arrayBuffer())

  assert.throws(() => reconstructStage(bmpBytes, header, 'stage1'), (err: unknown) => {
    assert.ok(err instanceof Error)
    assert.ok(err.message.includes(`${STAGE_HEIGHT_TILES}×${invalidWidth}`), `deveria citar o tamanho salvo: ${err.message}`)
    return true
  })
})

test('reconstructStage: header de colisão e imagem exportada com tamanhos diferentes lança mensagem de arquivos desencontrados', async () => {
  // Os dois são "válidos" isoladamente (32x32 e 32x64), mas não BATEM entre si — simula os dois
  // arquivos exportados terem sido editados/substituídos fora do fluxo normal de salvar.
  const header = fakeCollisionHeader(STAGE_HEIGHT_TILES, STAGE_PAGE_TILES)
  const imageWidthTiles = STAGE_PAGE_TILES * 2
  const width = stageWidthPixels(imageWidthTiles)
  const height = STAGE_HEIGHT_PIXELS
  const bmpBytes = new Uint8Array(
    await encodeIndexedBmp(width, height, new Uint8Array(width * height), randomPalette(1)).arrayBuffer(),
  )

  assert.throws(() => reconstructStage(bmpBytes, header, 'stage1'), (err: unknown) => {
    assert.ok(err instanceof Error)
    assert.match(err.message, /não batem/)
    return true
  })
})

// ---------- reconstructStage: round-trip export real -> reconstrução ----------

test('reconstructStage: composeLevel do reconstruído reproduz pixel a pixel o composeLevel original', async () => {
  for (const blockSize of [8, 16, 32] as const) {
    const cols = 5
    const rows = 2
    const tileset = buildTileset(cols * blockSize, rows * blockSize, solidTileImage(cols, rows, blockSize), blockSize)
    const gridCols = stageGridCols(blockSize, WIDTH_TILES)
    const gridRows = stageGridRows(blockSize)
    const grid = new Uint16Array(gridCols * gridRows)
    // pinta um padrão usando vários tiles diferentes do conjunto
    for (let i = 0; i < grid.length; i++) grid[i] = i % tileset.tileCount

    const tileCollision = new Map<number, CollisionKind>()
    for (let i = 0; i < tileset.tileCount; i++) {
      tileCollision.set(i, i % 3 === 0 ? 'solid' : i % 3 === 1 ? 'goal' : 'empty')
    }

    const originalLevel = composeLevel(tileset, grid, WIDTH_TILES)
    const palette = randomPalette(blockSize)
    const bmpBytes = new Uint8Array(
      await encodeIndexedBmp(originalLevel.width, originalLevel.height, originalLevel.indices, palette).arrayBuffer(),
    )
    const hardwareGrid = blockGridToHardwareGrid(tileset, grid, WIDTH_TILES)
    const hardwareCollision = blockCollisionToHardwareCollision(tileset, tileCollision)
    const header = generateCollisionHeader('stage1', 'stage1.png', hardwareGrid, hardwareCollision, WIDTH_TILES)

    const reconstructed = reconstructStage(bmpBytes, header, 'stage1')
    assert.equal(reconstructed.tilesets.length, 1, `bloco ${blockSize}px: só 1 banco de paleta usado (todas as cores ≤15)`)
    assert.equal(reconstructed.widthTiles, WIDTH_TILES, `bloco ${blockSize}px: largura reconstruída bate com a original`)
    const [band] = reconstructed.tilesets
    const reconstructedTileset = buildTileset(band.width, band.height, band.indices, 8)
    const reconstructedLevel = composeLevel(reconstructedTileset, reconstructed.grid, WIDTH_TILES)

    assert.deepEqual(
      [...reconstructedLevel.indices],
      [...originalLevel.indices],
      `bloco ${blockSize}px: imagem final reconstruída bate pixel a pixel com a original`,
    )

    // a colisão de cada bloco reconstruído bate com o array de colisão de hardware já resolvido
    // originalmente — fonte da verdade, independe da granularidade de pintura (blockSize)
    const parsedOriginal = parseCollisionHeader('stage1', header)
    for (let cell = 0; cell < reconstructed.grid.length; cell++) {
      const reconstructedTileIndex = reconstructed.grid[cell]
      const reconstructedValue = COLLISION_VALUES[reconstructed.tileCollision.get(reconstructedTileIndex) ?? 'empty']
      assert.equal(
        reconstructedValue,
        parsedOriginal.values[cell],
        `bloco ${blockSize}px, célula de hardware ${cell}: colisão reconstruída bate com o array original`,
      )
    }
  }
})

test('reconstructStage: fase larga de verdade (96 colunas, 3 páginas) reconstrói com a largura certa', async () => {
  const widthTiles = STAGE_PAGE_TILES * 3
  const blockSize = 8
  const cols = 5
  const rows = 2
  const tileset = buildTileset(cols * blockSize, rows * blockSize, solidTileImage(cols, rows, blockSize), blockSize)
  const gridCols = stageGridCols(blockSize, widthTiles)
  const gridRows = stageGridRows(blockSize)
  const grid = new Uint16Array(gridCols * gridRows)
  for (let i = 0; i < grid.length; i++) grid[i] = i % tileset.tileCount

  const tileCollision = new Map<number, CollisionKind>()
  for (let i = 0; i < tileset.tileCount; i++) tileCollision.set(i, i % 3 === 0 ? 'solid' : 'empty')

  const originalLevel = composeLevel(tileset, grid, widthTiles)
  const palette = randomPalette(3)
  const bmpBytes = new Uint8Array(
    await encodeIndexedBmp(originalLevel.width, originalLevel.height, originalLevel.indices, palette).arrayBuffer(),
  )
  const hardwareGrid = blockGridToHardwareGrid(tileset, grid, widthTiles)
  const hardwareCollision = blockCollisionToHardwareCollision(tileset, tileCollision)
  const header = generateCollisionHeader('stage1', 'stage1.png', hardwareGrid, hardwareCollision, widthTiles)

  const reconstructed = reconstructStage(bmpBytes, header, 'stage1')
  assert.equal(reconstructed.widthTiles, widthTiles)
  assert.equal(reconstructed.grid.length, gridCols * gridRows)
  const reconstructedTileset = buildTileset(reconstructed.tilesets[0].width, reconstructed.tilesets[0].height, reconstructed.tilesets[0].indices, 8)
  const reconstructedLevel = composeLevel(reconstructedTileset, reconstructed.grid, widthTiles)
  assert.deepEqual([...reconstructedLevel.indices], [...originalLevel.indices], 'imagem larga reconstruída bate pixel a pixel com a original')
})

test('reconstructStage: mais de 256 blocos únicos de 8x8 NÃO lança mais erro (StageGrid virou Uint16Array)', async () => {
  // constrói uma imagem 256x256 onde cada um dos 1024 tiles de hardware tem um padrão de pixel
  // ÚNICO (os 10 bits do índice global do tile viram 10 pixels 0/1 dentro do bloco 8x8) — garante
  // os 1024 blocos possíveis, todos únicos, todos dentro do banco 0 (só usa cor 0 e 1). Antes do
  // StageGrid virar Uint16Array isso lançava erro acima de 256; agora o único limite estrutural é
  // 1024 (32x32 células), que é exatamente o que este teste atinge — e funciona.
  const width = stageWidthPixels(WIDTH_TILES)
  const height = STAGE_HEIGHT_PIXELS
  const indices = new Uint8Array(width * height)
  const hwCols = width / HARDWARE_TILE_SIZE
  for (let row = 0; row < hwCols; row++) {
    for (let col = 0; col < hwCols; col++) {
      const tileGlobalId = row * hwCols + col
      const ox = col * HARDWARE_TILE_SIZE
      const oy = row * HARDWARE_TILE_SIZE
      for (let bit = 0; bit < 10; bit++) {
        const px = bit % HARDWARE_TILE_SIZE
        const py = Math.floor(bit / HARDWARE_TILE_SIZE)
        indices[(oy + py) * width + ox + px] = (tileGlobalId >> bit) & 1
      }
    }
  }
  const palette = randomPalette(1)
  const bmpBytes = new Uint8Array(await encodeIndexedBmp(width, height, indices, palette).arrayBuffer())
  const grid = new Uint16Array(hwCols * hwCols)
  const header = generateCollisionHeader('stage1', 'stage1.png', grid, new Map(), WIDTH_TILES)

  const reconstructed = reconstructStage(bmpBytes, header, 'stage1')
  assert.equal(reconstructed.tilesets.length, 1, 'só cores 0/1 usadas — tudo cai no banco 0')
  assert.equal(new Set([...reconstructed.grid]).size, 1024, 'os 1024 blocos únicos foram todos reconhecidos como distintos')
})

test('reconstructStage: fase com 2 bancos de paleta reconstrói em 2 tilesets sintéticos, um por banco', async () => {
  // monta uma fase combinando 2 tilesets de verdade (mesma função que o upload usa), pinta a
  // grade usando blocos dos dois, exporta e reconstrói — confirma que reabrir uma fase multi-
  // tileset separa os blocos de volta por banco de paleta corretamente.
  const blockSize = 8
  const a = solidTileImage(2, 1, blockSize) // cores 1,2 -> banco 0
  const b = solidTileImage(2, 1, blockSize) // cores 1,2 ANTES do offset -> banco 1 depois de combinar
  const paletteA: RgbColor[] = Array.from({ length: 16 }, (_, i) => [i, 0, 0])
  const paletteB: RgbColor[] = Array.from({ length: 16 }, (_, i) => [0, i, 0])
  const { tileset, palette, bands } = combineTilesets(
    [
      { width: 2 * blockSize, height: blockSize, indices: a, palette: paletteA, label: 'a.png' },
      { width: 2 * blockSize, height: blockSize, indices: b, palette: paletteB, label: 'b.png' },
    ],
    blockSize,
  )

  const gridCols = stageGridCols(blockSize, WIDTH_TILES)
  const gridRows = stageGridRows(blockSize)
  const grid = new Uint16Array(gridCols * gridRows)
  // pinta metade do mapa com blocos do banco 0, metade com blocos do banco 1
  const globalFromA0 = bandGlobalTileIndex(bands[0], 0, tileset.cols)
  const globalFromB1 = bandGlobalTileIndex(bands[1], 1, tileset.cols)
  for (let i = 0; i < grid.length; i++) grid[i] = i % 2 === 0 ? globalFromA0 : globalFromB1

  const tileCollision = new Map<number, CollisionKind>([
    [globalFromA0, 'solid'],
    [globalFromB1, 'goal'],
  ])
  const originalLevel = composeLevel(tileset, grid, WIDTH_TILES)
  const bmpBytes = new Uint8Array(
    await encodeIndexedBmp(originalLevel.width, originalLevel.height, originalLevel.indices, palette).arrayBuffer(),
  )
  const header = generateCollisionHeader('stage1', 'a.png + b.png', grid, tileCollision, WIDTH_TILES)

  const reconstructed = reconstructStage(bmpBytes, header, 'stage1')
  assert.equal(reconstructed.tilesets.length, 2, 'reconstrói exatamente 2 tilesets, um por banco usado')

  const reconstructedCombined = combineTilesets(
    reconstructed.tilesets.map((t) => ({ width: t.width, height: t.height, indices: t.indices, palette: t.palette, label: t.label })),
    blockSize,
  )
  const reconstructedLevel = composeLevel(reconstructedCombined.tileset, reconstructed.grid, WIDTH_TILES)
  assert.deepEqual([...reconstructedLevel.indices], [...originalLevel.indices], 'imagem final reconstruída bate pixel a pixel com a original')

  const parsedOriginal = parseCollisionHeader('stage1', header)
  for (let cell = 0; cell < reconstructed.grid.length; cell++) {
    const reconstructedValue = COLLISION_VALUES[reconstructed.tileCollision.get(reconstructed.grid[cell]) ?? 'empty']
    assert.equal(reconstructedValue, parsedOriginal.values[cell], `célula ${cell}: colisão reconstruída bate com a original`)
  }
})

// ---------- reconstructLayer2: mesmo algoritmo de reconstructStage, sem colisão ----------

test('reconstructLayer2: composeLevel do reconstruído reproduz pixel a pixel o composeLevel original, sem colisão nenhuma', async () => {
  const blockSize = 8
  const cols = 4
  const rows = 1
  const tileset = buildTileset(cols * blockSize, rows * blockSize, solidTileImage(cols, rows, blockSize), blockSize)
  const gridCols = stageGridCols(blockSize, WIDTH_TILES)
  const gridRows = stageGridRows(blockSize)
  const grid = new Uint16Array(gridCols * gridRows)
  for (let i = 0; i < grid.length; i++) grid[i] = i % tileset.tileCount

  const originalLevel = composeLevel(tileset, grid, WIDTH_TILES)
  const palette = randomPalette(7)
  const bmpBytes = new Uint8Array(
    await encodeIndexedBmp(originalLevel.width, originalLevel.height, originalLevel.indices, palette).arrayBuffer(),
  )

  const reconstructed = reconstructLayer2(bmpBytes, 'stage1')
  const reconstructedCombined = combineTilesets(
    reconstructed.tilesets.map((t) => ({ width: t.width, height: t.height, indices: t.indices, palette: t.palette, label: t.label })),
    HARDWARE_TILE_SIZE,
  )
  const reconstructedLevel = composeLevel(reconstructedCombined.tileset, reconstructed.grid, WIDTH_TILES)

  assert.deepEqual(
    [...reconstructedLevel.indices],
    [...originalLevel.indices],
    'imagem final reconstruída da Camada 2 bate pixel a pixel com a original',
  )
})

test('reconstructLayer2: reconstrói em 2 tilesets sintéticos quando a arte usa 2 bancos de paleta', () => {
  const blockSize = 8
  const a: RgbColor[] = Array.from({ length: 16 }, (_, i) => [i, 0, 0])
  const b: RgbColor[] = Array.from({ length: 16 }, (_, i) => [0, i, 0])
  const { tileset, palette, bands } = combineTilesets(
    [
      { width: blockSize, height: blockSize, indices: new Uint8Array(blockSize * blockSize).fill(1), palette: a, label: 'a.png' },
      { width: blockSize, height: blockSize, indices: new Uint8Array(blockSize * blockSize).fill(1), palette: b, label: 'b.png' },
    ],
    blockSize,
  )
  const gridCols = stageGridCols(blockSize, WIDTH_TILES)
  const gridRows = stageGridRows(blockSize)
  const grid = new Uint16Array(gridCols * gridRows)
  const globalA = bandGlobalTileIndex(bands[0], 0, tileset.cols)
  const globalB = bandGlobalTileIndex(bands[1], 0, tileset.cols)
  for (let i = 0; i < grid.length; i++) grid[i] = i % 2 === 0 ? globalA : globalB

  const level = composeLevel(tileset, grid, WIDTH_TILES)

  return encodeIndexedBmp(level.width, level.height, level.indices, palette)
    .arrayBuffer()
    .then((buf) => {
      const reconstructed = reconstructLayer2(new Uint8Array(buf), 'stage1')
      assert.equal(reconstructed.tilesets.length, 2, 'reconstrói exatamente 2 tilesets, um por banco usado — sem nenhum arquivo de colisão envolvido')
    })
})
