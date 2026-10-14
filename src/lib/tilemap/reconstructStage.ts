// Reconstrói uma fase já exportada de volta pro editor, a partir SÓ dos
// arquivos que já existem (`<base>_tilemap.bmp` + `<base>_collision.h`) —
// mesmo espírito de lib/metasprite/importProject.ts pro personagem: não
// existe um formato de "projeto" à parte.
//
// Diferença importante em relação ao personagem: o que foi exportado é a
// imagem da fase já COMPOSTA (não um conjunto de blocos + índices) e a
// colisão já RESOLVIDA por tile de hardware (não por índice de bloco
// original). Não dá pra saber qual bloco do conjunto de imagens que o
// usuário importou originalmente foi usado em cada célula — mas dá pra
// reconstruir um conjunto de blocos SINTÉTICO deduplicando os tiles 8x8
// únicos da própria imagem composta, e a colisão de cada um deles vem
// direto da célula correspondente no array já resolvido. O resultado é
// visualmente idêntico ao original (mesmo `composeLevel` reproduz a mesma
// imagem), só perde a granularidade de bloco (8/16/32) escolhida na hora
// de pintar — reabre sempre em blocos de 8x8.

import { bandGlobalTileIndex, combineTilesets } from './combineTilesets.ts'
import { decodeIndexedBmp } from '../metasprite/importProject.ts'
import {
  COLORS_PER_BANK,
  COLLISION_VALUES,
  HARDWARE_TILE_SIZE,
  isValidStageWidthTiles,
  STAGE_HEIGHT_TILES,
  STAGE_MAX_WIDTH_TILES,
  STAGE_PAGE_TILES,
  type CollisionKind,
  type StageGrid,
} from './types.ts'
import type { RgbColor } from '../indexedBmp.ts'

const COLLISION_KIND_BY_VALUE: Record<number, CollisionKind> = Object.fromEntries(
  Object.entries(COLLISION_VALUES).map(([kind, value]) => [value, kind as CollisionKind]),
)

function collisionKindFromValue(value: number): CollisionKind {
  return COLLISION_KIND_BY_VALUE[value] ?? 'empty'
}

export interface ParsedCollision {
  rows: number
  cols: number
  values: number[]
}

function requiredDefine(text: string, name: string): number {
  const match = text.match(new RegExp(`#define\\s+${name}\\s+(-?\\d+)`))
  if (!match) throw new Error(`Não encontrei "#define ${name}" no header de colisão.`)
  return Number(match[1])
}

/** Inverso de `generateCollisionHeader` (exportTilemap.ts). */
export function parseCollisionHeader(baseName: string, text: string): ParsedCollision {
  const upper = baseName.toUpperCase()
  const rows = requiredDefine(text, `${upper}_COLLISION_ROWS`)
  const cols = requiredDefine(text, `${upper}_COLLISION_COLS`)

  const arrayPattern = new RegExp(
    `static const u8 ${baseName}_collision\\[${upper}_COLLISION_ROWS \\* ${upper}_COLLISION_COLS\\] = \\{\\n([\\s\\S]*?)\\n\\};`,
  )
  const match = text.match(arrayPattern)
  if (!match) throw new Error(`Não encontrei o array "${baseName}_collision" no header de colisão.`)

  const values = match[1]
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map(Number)
  if (values.length !== rows * cols) {
    throw new Error(
      `O array de colisão tem ${values.length} valor(es), mas ${upper}_COLLISION_ROWS × ` +
        `${upper}_COLLISION_COLS diz ${rows * cols}.`,
    )
  }
  return { rows, cols, values }
}

/** Um tileset sintético reconstruído — um por banco de paleta de BG realmente usado na fase
 * salva. Formato pronto pra "hidratar" um slot de upload no editor (mesma forma de uma imagem
 * recém-importada: índices locais 0..15, paleta própria de até 16 cores). */
export interface ReconstructedTilesetBand {
  width: number
  height: number
  indices: Uint8Array
  palette: RgbColor[]
  label: string
}

export interface ReconstructedStage {
  /** Um tileset sintético por banco de paleta de BG usado (1 a 8) — ver combineTilesets.ts. */
  tilesets: ReconstructedTilesetBand[]
  /** Grade de granularidade de hardware (32 linhas fixas, largura variável — docs/PROGRESS.md,
   * "fases largas de verdade", 2026-09-24) de índices GLOBAIS no tileset combinado (mesma numeração
   * que `combineTilesets(tilesets, HARDWARE_TILE_SIZE)` produziria). */
  grid: StageGrid
  tileCollision: Map<number, CollisionKind>
  /** Largura real da fase reconstruída, em tiles de hardware — recuperada do próprio `.h` de
   * colisão (`collision.cols`), não mais assumida fixa. Quem reabre a fase precisa disso pra
   * continuar pintando/exportando no tamanho certo (ver StageSession.tsx). */
  widthTiles: number
}

interface DedupedLayer {
  tilesets: ReconstructedTilesetBand[]
  grid: StageGrid
  /** Índice PROVISÓRIO (ordem de descoberta, antes de agrupar por banco) de cada célula — exposto
   * só pra quem precisa cruzar com outro array na MESMA ordem de descoberta (ex.: colisão, ver
   * `reconstructStage`). Camada 2 (sem colisão nenhuma) não usa isso. */
  provisionalGrid: Uint16Array
  /** Traduz o índice provisório de um tile único pro índice GLOBAL final no tileset combinado —
   * mesmo motivo do campo acima. */
  globalIndexByProvisional: Map<number, number>
}

/**
 * Núcleo compartilhado entre `reconstructStage` (Camada 1, com colisão) e `reconstructLayer2`
 * (Camada 2, sem colisão, docs/DATA_FORMAT.md § 4 "2ª camada de tileset") — dedup dos tiles 8x8
 * únicos de uma imagem já composta + agrupamento por banco de paleta de BG (mesma regra que o
 * gfx4snes usa de verdade, nibble alto do índice de cor do primeiro pixel do tile, ver
 * combineTilesets.ts), pronto pra reabrir como se fosse upload de verdade.
 */
function dedupeAndGroupByBank(
  level: { width: number; height: number; indices: Uint8Array; palette: RgbColor[] },
  baseName: string,
): DedupedLayer {
  // Passo 1: dedup dos tiles 8x8 únicos (índices de cor GLOBAIS, 0..127, como saíram do .bmp
  // combinado) — numeração provisória, só em ordem de descoberta. Colunas derivadas da largura REAL
  // da imagem (variável, docs/PROGRESS.md "fases largas de verdade", 2026-09-24) em vez de uma
  // constante fixa — `StageGrid` (Uint16Array) aguenta de sobra o total de qualquer tamanho válido.
  const hardwareCols = level.width / HARDWARE_TILE_SIZE
  const hardwareRows = level.height / HARDWARE_TILE_SIZE
  const uniqueTiles: Uint8Array[] = []
  const tileIndexByKey = new Map<string, number>()
  const provisionalGrid = new Uint16Array(hardwareCols * hardwareRows)

  for (let row = 0; row < hardwareRows; row++) {
    for (let col = 0; col < hardwareCols; col++) {
      const block = new Uint8Array(HARDWARE_TILE_SIZE * HARDWARE_TILE_SIZE)
      const srcOx = col * HARDWARE_TILE_SIZE
      const srcOy = row * HARDWARE_TILE_SIZE
      for (let y = 0; y < HARDWARE_TILE_SIZE; y++) {
        for (let x = 0; x < HARDWARE_TILE_SIZE; x++) {
          block[y * HARDWARE_TILE_SIZE + x] = level.indices[(srcOy + y) * level.width + srcOx + x]
        }
      }

      const key = block.join(',')
      let tileIndex = tileIndexByKey.get(key)
      if (tileIndex === undefined) {
        tileIndex = uniqueTiles.length
        uniqueTiles.push(block)
        tileIndexByKey.set(key, tileIndex)
      }

      provisionalGrid[row * hardwareCols + col] = tileIndex
    }
  }

  // Passo 2: agrupa os tiles únicos por banco de paleta de BG.
  const tilesByBank = new Map<number, number[]>()
  uniqueTiles.forEach((block, provisionalIndex) => {
    const bank = block[0] >> 4
    const list = tilesByBank.get(bank)
    if (list) list.push(provisionalIndex)
    else tilesByBank.set(bank, [provisionalIndex])
  })

  const usedBanks = [...tilesByBank.keys()].sort((a, b) => a - b)
  const perBankUploads = usedBanks.map((bank) => {
    const provisionalIndices = tilesByBank.get(bank)!
    const width = provisionalIndices.length * HARDWARE_TILE_SIZE
    const height = HARDWARE_TILE_SIZE
    const indices = new Uint8Array(width * height)
    const palette = level.palette.slice(bank * COLORS_PER_BANK, bank * COLORS_PER_BANK + COLORS_PER_BANK)
    provisionalIndices.forEach((provisionalIndex, localTileIndex) => {
      const block = uniqueTiles[provisionalIndex]
      const ox = localTileIndex * HARDWARE_TILE_SIZE
      for (let y = 0; y < HARDWARE_TILE_SIZE; y++) {
        for (let x = 0; x < HARDWARE_TILE_SIZE; x++) {
          indices[y * width + ox + x] = block[y * HARDWARE_TILE_SIZE + x] - bank * COLORS_PER_BANK
        }
      }
    })
    return { width, height, indices, palette, label: `${baseName}_banco${bank}.png` }
  })

  // Passo 3: recombina (mesma função usada por upload novo) só pra saber o layout final — cols
  // totais e o offset de linha de cada banda — e traduzir os índices PROVISÓRIOS (passo 1) pros
  // índices GLOBAIS finais no tileset combinado.
  const { tileset: combinedTileset, bands } = combineTilesets(perBankUploads, HARDWARE_TILE_SIZE)

  const globalIndexByProvisional = new Map<number, number>()
  usedBanks.forEach((bank, bandPosition) => {
    const provisionalIndices = tilesByBank.get(bank)!
    const band = bands[bandPosition]
    provisionalIndices.forEach((provisionalIndex, localTileIndex) => {
      globalIndexByProvisional.set(provisionalIndex, bandGlobalTileIndex(band, localTileIndex, combinedTileset.cols))
    })
  })

  const grid: StageGrid = new Uint16Array(hardwareCols * hardwareRows)
  for (let i = 0; i < provisionalGrid.length; i++) {
    grid[i] = globalIndexByProvisional.get(provisionalGrid[i])!
  }

  return { tilesets: perBankUploads, grid, provisionalGrid, globalIndexByProvisional }
}

/**
 * Reconstrói uma fase a partir de `<base>_tilemap.bmp` (a imagem já
 * composta) + `<base>_collision.h` (a colisão já resolvida por tile de
 * hardware). Lança com mensagem em português se algo estiver
 * inconsistente/corrompido.
 */
export function reconstructStage(
  tilemapBmp: ArrayBuffer | Uint8Array,
  collisionHeaderText: string,
  baseName: string,
): ReconstructedStage {
  const level = decodeIndexedBmp(tilemapBmp)
  const collision = parseCollisionHeader(baseName, collisionHeaderText)

  // Checagem 1 (achado real, 2026-09-24, "reverter o estado de teste 96×64 com segurança"): a
  // fase salva precisa caber nas restrições REAIS da Anubis hoje — altura sempre
  // STAGE_HEIGHT_TILES (streaming só funciona no eixo horizontal, ver docs/DATA_FORMAT.md v3) e
  // largura múltipla de STAGE_PAGE_TILES até STAGE_MAX_WIDTH_TILES (limite de ponteiro `s16` da
  // própria engine). Fora disso o build da Anubis falha com `#error` de propósito — sem essa
  // checagem aqui, reabrir uma fase assim tentaria ler o `.bmp`/`.h` só pra descobrir isso mais
  // tarde, com dado incoerente em vez de uma mensagem clara.
  if (collision.rows !== STAGE_HEIGHT_TILES || !isValidStageWidthTiles(collision.cols)) {
    throw new Error(
      `Esta fase foi salva com uma grade de colisão ${collision.rows}×${collision.cols}, que não é ` +
        `um tamanho de fase válido hoje (altura sempre ${STAGE_HEIGHT_TILES}, largura múltipla de ` +
        `${STAGE_PAGE_TILES} até ${STAGE_MAX_WIDTH_TILES}) — repinte a fase inteira dentro de um ` +
        `tamanho válido e salve de novo antes de continuar editando.`,
    )
  }

  // Checagem 2: o `.h` de colisão e o `.bmp` da fase são dois arquivos exportados separadamente —
  // se um dos dois foi editado/substituído fora do fluxo normal de salvar, os tamanhos podem
  // desencontrar mesmo os dois sendo individualmente "válidos".
  const hardwareCols = level.width / HARDWARE_TILE_SIZE
  const hardwareRows = level.height / HARDWARE_TILE_SIZE
  if (collision.rows !== hardwareRows || collision.cols !== hardwareCols) {
    throw new Error(
      `O header de colisão desta fase diz ${collision.rows}×${collision.cols} tiles, mas a imagem ` +
        `exportada (${baseName}_tilemap.bmp) tem ${hardwareRows}×${hardwareCols} — os dois arquivos ` +
        `não batem (podem ter sido editados/substituídos fora do fluxo normal de salvar).`,
    )
  }

  const { tilesets, grid, provisionalGrid, globalIndexByProvisional } = dedupeAndGroupByBank(level, baseName)

  const collisionByProvisionalIndex = new Map<number, CollisionKind>()
  for (let i = 0; i < provisionalGrid.length; i++) {
    collisionByProvisionalIndex.set(provisionalGrid[i], collisionKindFromValue(collision.values[i]))
  }
  const tileCollision = new Map<number, CollisionKind>()
  for (const [provisionalIndex, kind] of collisionByProvisionalIndex) {
    tileCollision.set(globalIndexByProvisional.get(provisionalIndex)!, kind)
  }

  return { tilesets, grid, tileCollision, widthTiles: collision.cols }
}

/**
 * Reconstrói a Camada 2 (docs/DATA_FORMAT.md § 4 "2ª camada de tileset") a partir de
 * `<base>_tilemap_layer2.bmp` — mesmo algoritmo de `reconstructStage`, sem colisão nenhuma pra
 * cruzar (Camada 2 não tem `_collision.h` equivalente, por design: é só decoração).
 */
export function reconstructLayer2(tilemapBmp: ArrayBuffer | Uint8Array, baseName: string): { tilesets: ReconstructedTilesetBand[]; grid: StageGrid } {
  const level = decodeIndexedBmp(tilemapBmp)
  const { tilesets, grid } = dedupeAndGroupByBank(level, `${baseName}_layer2`)
  return { tilesets, grid }
}
