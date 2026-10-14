import type { Frame, TileSheet } from './types.ts'

/**
 * Espelhar o personagem inteiro: cada peça troca dx por
 * -(dx + tamanho_da_peça) E liga/inverte o flip H (o hardware só espelha
 * dentro do próprio quadrado da peça). Fórmula documentada no .h exportado.
 */
export function mirrorDx(dx: number, size: number): number {
  return 0 - (dx + size) // "0 -" evita -0 quando dx + size == 0
}

export interface ComposedFrame {
  /** Buffer de 2*frameWidth x 2*frameHeight; o pivô fica em (originX, originY) = (frameWidth, frameHeight). */
  width: number
  height: number
  originX: number
  originY: number
  pixels: Uint8Array
}

/**
 * Recompõe um frame a partir das peças + tile sheet, como o hardware
 * desenharia (pivô no centro do buffer, flips por peça). Com `mirror`,
 * aplica a fórmula de espelhamento do personagem inteiro. Índice 0 =
 * transparente (não sobrescreve).
 */
export function composeFrame(
  frame: Frame,
  tileSheet: TileSheet,
  frameWidth: number,
  frameHeight: number,
  mirror = false,
): ComposedFrame {
  const width = frameWidth * 2
  const height = frameHeight * 2
  const originX = frameWidth
  const originY = frameHeight
  const pixels = new Uint8Array(width * height)

  for (const piece of frame.pieces) {
    const dx = mirror ? mirrorDx(piece.dx, piece.size) : piece.dx
    const flipH = mirror ? !piece.flipH : piece.flipH
    const tileX = (piece.tile % 16) * 8
    const tileY = Math.floor(piece.tile / 16) * 8

    for (let py = 0; py < piece.size; py++) {
      for (let px = 0; px < piece.size; px++) {
        const sx = flipH ? piece.size - 1 - px : px
        const sy = piece.flipV ? piece.size - 1 - py : py
        const value = tileSheet.indices[(tileY + sy) * tileSheet.width + tileX + sx]
        if (value === 0) continue
        pixels[(originY + piece.dy + py) * width + originX + dx + px] = value
      }
    }
  }

  return { width, height, originX, originY, pixels }
}
