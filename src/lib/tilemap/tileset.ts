import type { StageBlockSize, Tileset } from './types.ts'

/**
 * Fatia a imagem de origem (já validada: múltipla de 8 nos dois eixos) num
 * conjunto de blocos de `blockSize`x`blockSize`, em ordem raster. Sem
 * pivô/dedup — background não precisa disso, e o `gfx4snes -m` já
 * deduplica tiles repetidos ao converter a fase composta.
 */
export function buildTileset(
  width: number,
  height: number,
  sourceIndices: Uint8Array,
  blockSize: StageBlockSize,
): Tileset {
  if (width % blockSize !== 0 || height % blockSize !== 0) {
    throw new Error(
      `A imagem do conjunto de blocos precisa ter dimensões múltiplas de ${blockSize}px ` +
        `(essa tem ${width}×${height}).`,
    )
  }
  const cols = width / blockSize
  const rows = height / blockSize
  return { blockSize, cols, rows, tileCount: cols * rows, sourceWidth: width, sourceHeight: height, sourceIndices }
}

/** Índices de cor (0 = transparente) de um bloco específico, num buffer blockSize x blockSize. */
export function tilePixels(tileset: Tileset, tileIndex: number): Uint8Array {
  const { blockSize } = tileset
  const col = tileIndex % tileset.cols
  const row = Math.floor(tileIndex / tileset.cols)
  const ox = col * blockSize
  const oy = row * blockSize
  const out = new Uint8Array(blockSize * blockSize)
  for (let y = 0; y < blockSize; y++) {
    for (let x = 0; x < blockSize; x++) {
      out[y * blockSize + x] = tileset.sourceIndices[(oy + y) * tileset.sourceWidth + ox + x]
    }
  }
  return out
}
