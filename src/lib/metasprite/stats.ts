import type { Frame } from './types.ts'

/** Limite de hardware: 34 fatias de 8px (tiles) de sprite por scanline. */
export const SLIVER_LIMIT = 34

export interface FrameStats {
  /** Entradas de OAM usadas pelo frame. */
  pieceCount: number
  /** Tiles 8x8 usados (peça 8x8 = 1, peça 16x16 = 4), sem dedup. */
  tiles8x8: number
  /** Maior nº de fatias de 8px numa mesma scanline (16x16 = 2 por linha). */
  maxSliversPerScanline: number
  overSliverLimit: boolean
}

/** As fatias por scanline dependem só da ALTURA do frame (uma contagem por linha). */
export function frameStats(frame: Frame, frameHeight: number): FrameStats {
  const slivers = new Array<number>(frameHeight).fill(0)
  let tiles8x8 = 0

  for (const piece of frame.pieces) {
    tiles8x8 += piece.size === 16 ? 4 : 1
    for (let y = piece.srcY; y < piece.srcY + piece.size; y++) {
      slivers[y] += piece.size / 8
    }
  }

  const maxSliversPerScanline = Math.max(0, ...slivers)
  return {
    pieceCount: frame.pieces.length,
    tiles8x8,
    maxSliversPerScanline,
    overSliverLimit: maxSliversPerScanline > SLIVER_LIMIT,
  }
}
