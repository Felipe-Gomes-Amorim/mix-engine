import { STAGE_HEIGHT_PIXELS, stageGridCols, stageGridRows, stageWidthPixels, type StageGrid, type Tileset } from './types.ts'

export interface ComposedLevel {
  width: number
  height: number
  /** Índices de cor (0 = transparente), imagem completa da fase pronta pra exportar/desenhar. */
  indices: Uint8Array
}

/**
 * Monta a imagem completa da fase (`widthTiles*8` x `STAGE_HEIGHT_PIXELS`, o tamanho físico
 * ESCOLHIDO da fase — docs/PROGRESS.md, "fases largas de verdade", 2026-09-24) a partir da grade de
 * índices de bloco — é isso que vira `<base>_tilemap.bmp` (convertido pelo `gfx4snes -m` do lado da
 * engine em `.pic`/`.pal`/`.map`; o dedup de tiles repetidos é dele, não precisamos fazer aqui).
 * Funciona pra qualquer `blockSize` do tileset (8/16/32) — o resultado final é sempre a mesma
 * imagem (largura/altura fixas da fase), só muda a granularidade com que ela foi pintada.
 *
 * `skipValue` (opcional, docs/DATA_FORMAT.md § 4 "2ª camada de tileset"):
 * célula com esse valor no `grid` não escreve pixel nenhum, deixando o
 * índice 0 (transparente, já é o padrão do `Uint8Array`) — usado pela
 * Camada 2 (`NO_TILE` em types.ts) pra células nunca pintadas não
 * mostrarem o bloco 0 cobrindo a tela toda. Camada 1 nunca passa isso —
 * toda célula dela sempre teve um bloco de verdade, comportamento
 * inalterado.
 */
export function composeLevel(tileset: Tileset, grid: StageGrid, widthTiles: number, skipValue?: number): ComposedLevel {
  const { blockSize } = tileset
  const gridCols = stageGridCols(blockSize, widthTiles)
  const gridRows = stageGridRows(blockSize)
  const width = stageWidthPixels(widthTiles)
  const height = STAGE_HEIGHT_PIXELS
  const indices = new Uint8Array(width * height)

  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const tileIndex = grid[row * gridCols + col]
      if (tileIndex === skipValue) continue
      const tileCol = tileIndex % tileset.cols
      const tileRow = Math.floor(tileIndex / tileset.cols)
      const srcOx = tileCol * blockSize
      const srcOy = tileRow * blockSize
      const dstOx = col * blockSize
      const dstOy = row * blockSize

      for (let y = 0; y < blockSize; y++) {
        for (let x = 0; x < blockSize; x++) {
          indices[(dstOy + y) * width + dstOx + x] =
            tileset.sourceIndices[(srcOy + y) * tileset.sourceWidth + srcOx + x]
        }
      }
    }
  }

  return { width, height, indices }
}
