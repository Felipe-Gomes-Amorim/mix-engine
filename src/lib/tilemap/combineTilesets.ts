// Combina até 8 tilesets importados separadamente (cada um já validado com no máximo 16 cores,
// mesma regra de sempre — ver validation.ts) num só `Tileset` raster, um banco de paleta de BG
// por tileset (docs/DATA_FORMAT.md § 4, "múltiplos tilesets com paleta por bloco").
//
// Mecanismo (confirmado testando o binário real do gfx4snes em 2026-09-21, não só lendo o
// código-fonte): o `.map` que ele gera dá a cada tile um banco de paleta (bits 10-12, hardware)
// igual ao nibble alto do índice de cor do PRIMEIRO pixel daquele tile. Por isso cada tileset
// entra inteiro num banco só (todo pixel dele desloca pelo mesmo `bankIndex*16`) — garante que
// nenhum bloco de 8x8 nunca mistura dois bancos, o que quebraria silenciosamente no hardware real
// (só apareceria errado no emulador, não no build). Empilhar tilesets de larguras diferentes
// verticalmente, alinhados à esquerda, evita ter que "compactar" índice de bloco — cada tileset
// vira uma faixa de linhas própria dentro do raster combinado; colunas sobrando (tileset mais
// estreito que o mais largo do grupo) ficam com pixel 0 nunca referenciado (nenhuma UI oferece
// esses blocos de "preenchimento" pra pintar, e o `composeLevel` só usa blocos que aparecem na
// grade pintada, então eles nunca chegam no `.bmp` final).
import { buildTileset } from './tileset.ts'
import {
  COLORS_PER_BANK,
  HARDWARE_TILE_SIZE,
  MAX_TILESET_BANKS,
  type StageBlockSize,
  type TerrainGroup,
  type Tileset,
  type TilesetBand,
} from './types.ts'
import type { RgbColor } from '../indexedBmp.ts'

/** Um tileset já validado (ver validation.ts / useImageUpload.ts), pronto pra combinar. */
export interface TilesetUpload {
  width: number
  height: number
  /** Índices de cor 0..15 (validado: no máximo 16 cores, ver validation.ts). */
  indices: Uint8Array
  palette: RgbColor[]
  label: string
}

/** Um tileset PRONTO pra pintar numa fase (StageSession.tsx) — escolhido da galeria salva ou
 * reconstruído de uma fase já salva (loadStage.ts). Mora aqui (não em StageSession.tsx nem
 * loadStage.ts) só pra evitar import circular entre os dois — os dois precisam do mesmo tipo.
 *
 * `name`/`version` (docs/PROGRESS.md, "fase referencia tileset por nome", 2026-09-23): ausentes
 * quando o tileset veio do FALLBACK de reconstrução por pixel de uma fase antiga (não tem nome —
 * é sintético, deduplicado a partir da imagem já composta). Presentes quando veio de um tileset
 * salvo de verdade — é o que `StageSession.tsx` usa pra gravar `<base>_tileset_refs.json` ao
 * salvar (só grava a referência por nome quando TODOS os tilesets da sessão têm os dois; uma
 * sessão nunca mistura os dois casos, ver StageWorkspace.tsx). */
export interface StageTilesetInput {
  upload: TilesetUpload
  blockSize: StageBlockSize
  name?: string
  version?: number
  /** Grupos de terreno inteligente (autotile, docs/PROGRESS.md "tilesets inteligentes",
   * 2026-09-23) deste tileset — usado pelo pincel de terreno em `StageSession.tsx`. Ausente/vazio
   * quando o tileset não tem nenhum grupo, OU quando veio do fallback de reconstrução por pixel de
   * uma fase antiga (mesmo caso de `name`/`version` ausentes, ver comentário acima). */
  terrainGroups?: TerrainGroup[]
  /** `'background'` quando este "tileset" na verdade é um Fundo salvo (docs/PROGRESS.md, "Fundo
   * como recurso salvo", 2026-09-30) — veio de `assets/backgrounds/` (loadBackground.ts), não de
   * `assets/tilesets/`, e TODOS os blocos dele já são Camada 2 por construção (sem colisão, sem UI
   * de marcar bloco a bloco). `StageSession.tsx` usa isso só pra: (1) esconder da paleta de pincel
   * avulso (não faz sentido escolher "um bloco" de um Fundo manualmente) e (2) achar a faixa certa
   * pra "carimbar" a imagem inteira na Camada 2 de uma vez. Ausente/`undefined` = tileset normal. */
  kind?: 'background'
}

export interface CombinedTileset {
  tileset: Tileset
  /** Paleta combinada: cor no índice `bankIndex*16 + i` é a `i`-ésima cor daquele tileset. */
  palette: RgbColor[]
  bands: TilesetBand[]
}

export function combineTilesets(uploads: readonly TilesetUpload[], blockSize: StageBlockSize): CombinedTileset {
  if (uploads.length === 0) {
    throw new Error('Precisa de pelo menos um conjunto de blocos pra montar a fase.')
  }
  if (uploads.length > MAX_TILESET_BANKS) {
    throw new Error(
      `No máximo ${MAX_TILESET_BANKS} tilesets por fase — um por banco de paleta de BG do hardware ` +
        `(tem ${uploads.length}).`,
    )
  }

  // Reaproveita buildTileset só pra validar dimensões (múltiplas de blockSize) e calcular
  // cols/rows/tileCount de cada um — o sourceIndices dele é descartado, porque vamos reblitar os
  // pixels no raster combinado de qualquer forma.
  const perUpload = uploads.map((u) => buildTileset(u.width, u.height, u.indices, blockSize))
  const maxCols = Math.max(...perUpload.map((t) => t.cols))
  const totalRows = perUpload.reduce((sum, t) => sum + t.rows, 0)
  const mergedWidth = maxCols * blockSize
  const mergedHeight = totalRows * blockSize
  const sourceIndices = new Uint8Array(mergedWidth * mergedHeight)
  const palette: RgbColor[] = []
  const bands: TilesetBand[] = []

  let rowOffset = 0
  uploads.forEach((upload, bankIndex) => {
    const t = perUpload[bankIndex]
    for (let y = 0; y < upload.height; y++) {
      const srcRowStart = y * upload.width
      const dstRowStart = (rowOffset * blockSize + y) * mergedWidth
      for (let x = 0; x < upload.width; x++) {
        // desloca pro banco de paleta deste tileset — é isso que faz o gfx4snes gravar o bit de
        // paleta certo por tile depois (ver comentário no topo do arquivo).
        sourceIndices[dstRowStart + x] = upload.indices[srcRowStart + x] + bankIndex * COLORS_PER_BANK
      }
    }
    for (let c = 0; c < COLORS_PER_BANK; c++) {
      palette[bankIndex * COLORS_PER_BANK + c] = upload.palette[c] ?? [0, 0, 0]
    }
    bands.push({ bankIndex, label: upload.label, cols: t.cols, rows: t.rows, tileCount: t.tileCount, rowOffset })
    rowOffset += t.rows
  })

  const tileset: Tileset = {
    blockSize,
    cols: maxCols,
    rows: totalRows,
    tileCount: maxCols * totalRows,
    sourceWidth: mergedWidth,
    sourceHeight: mergedHeight,
    sourceIndices,
  }

  return { tileset, palette, bands }
}

/** Índice global (raster, row-major no `Tileset` combinado) de um bloco LOCAL de uma faixa —
 * usado pela UI pra escolher o pincel e pelo `grid` pra saber onde achar os pixels de cada bloco. */
export function bandGlobalTileIndex(band: TilesetBand, localTileIndex: number, combinedCols: number): number {
  const localCol = localTileIndex % band.cols
  const localRow = Math.floor(localTileIndex / band.cols)
  return (band.rowOffset + localRow) * combinedCols + localCol
}

/** Inverso de `bandGlobalTileIndex` — acha a faixa e o índice LOCAL dentro dela a partir de um
 * índice global. Usado só por `loadStage.ts` (docs/DATA_FORMAT.md § 4, "2ª camada de tileset"):
 * a Camada 2 reconstruída (`reconstructLayer2`) vem numa combinação própria, separada da Camada
 * 1 — pra reabrir as duas no MESMO tileset combinado do editor (faixas da Camada 1 primeiro,
 * Camada 2 depois), o `grid` da Camada 2 precisa traduzir seus índices globais ANTIGOS (relativos
 * só à combinação dela sozinha) pro NOVO índice global (relativo à combinação final, maior). */
export function findBandLocalIndex(
  bands: readonly TilesetBand[],
  globalIndex: number,
  combinedCols: number,
): { band: TilesetBand; localTileIndex: number } {
  const row = Math.floor(globalIndex / combinedCols)
  const col = globalIndex % combinedCols
  const band = bands.find((b) => row >= b.rowOffset && row < b.rowOffset + b.rows)
  if (!band) throw new Error(`Índice global ${globalIndex} não corresponde a nenhuma faixa combinada.`)
  return { band, localTileIndex: (row - band.rowOffset) * band.cols + col }
}

/**
 * Traduz um índice de BLOCO (granularidade `blockTileset.blockSize`, escolhida pelo usuário só
 * pra pintar mais rápido) pro tile de HARDWARE (8x8) do canto superior esquerdo dele — docs/
 * DATA_FORMAT.md § 4, "cursor de posicionamento sempre em 8px" (2026-09-23).
 *
 * Funciona porque `blockTileset` e um tileset combinado a 8px (`combineTilesets(uploads,
 * HARDWARE_TILE_SIZE)`) vêm dos MESMOS uploads, na MESMA ordem — o raster de pixels combinado é
 * byte-a-byte IDÊNTICO nos dois (blockSize só muda como esse raster é FATIADO em índices, nunca o
 * conteúdo/posição dos pixels — ver combineTilesets acima), então a tradução é só multiplicar a
 * posição do bloco pela razão de tamanho (`blockSize / 8`), sem precisar reconverter nada.
 */
export function blockToHardwareTopLeft(
  blockTileset: Pick<Tileset, 'cols' | 'blockSize'>,
  blockIndex: number,
): { col: number; row: number } {
  const scale = blockTileset.blockSize / HARDWARE_TILE_SIZE
  return {
    col: (blockIndex % blockTileset.cols) * scale,
    row: Math.floor(blockIndex / blockTileset.cols) * scale,
  }
}
