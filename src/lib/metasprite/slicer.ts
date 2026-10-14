import type { PieceSize, SlicedPiece } from './types.ts'

export interface SliceOptions {
  /**
   * Limiar 8x8 vs 16x16. Num bloco 16x16 não vazio, se o número de
   * quadrantes 8x8 COM pixels for <= quadrantThreshold, emite uma peça 8x8
   * por quadrante ocupado (economiza VRAM: só os tiles que têm pixel);
   * senão emite uma única peça 16x16 (economiza entradas de OAM e fatias
   * por scanline). Padrão 1 = só "1 quadrante ocupado" vira 8x8. 0 = nunca
   * usa 8x8; 4 = sempre 8x8.
   */
  quadrantThreshold: number
}

export const DEFAULT_SLICE_OPTIONS: SliceOptions = { quadrantThreshold: 1 }

const QUADRANTS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [8, 0],
  [0, 8],
  [8, 8],
]

/** Transparente = índice de cor 0. */
function hasPixels(
  pixels: Uint8Array,
  sheetWidth: number,
  x0: number,
  y0: number,
  width: number,
  height: number,
): boolean {
  for (let y = y0; y < y0 + height; y++) {
    const row = y * sheetWidth
    for (let x = x0; x < x0 + width; x++) {
      if (pixels[row + x] !== 0) return true
    }
  }
  return false
}

/**
 * Fatia um frame lógico (largura x altura independentes, múltiplos de 8)
 * em peças de hardware (8x8 / 16x16).
 *
 * 1. Divide o frame em blocos 16x16 alinhados ao canto sup. esq. do frame.
 *    Se a largura/altura não for múltipla de 16 (ex.: 24, 40), sobra uma
 *    faixa de 8px na borda direita/inferior: esses blocos parciais NÃO
 *    cabem uma peça 16x16 (ela invadiria o frame vizinho), então viram só
 *    peças 8x8 por quadrante ocupado.
 * 2. Descarta blocos totalmente transparentes (não entram no OAM).
 * 3. Bloco 16x16 completo e não vazio: 8x8 por quadrante ocupado se poucos
 *    quadrantes (<= quadrantThreshold), senão uma peça 16x16.
 *
 * `originX/originY` = canto sup. esq. do frame dentro do sheet; as peças
 * saem com srcX/srcY relativos ao frame.
 */
export function sliceFrame(
  pixels: Uint8Array,
  sheetWidth: number,
  originX: number,
  originY: number,
  frameWidth: number,
  frameHeight: number,
  options: SliceOptions = DEFAULT_SLICE_OPTIONS,
): SlicedPiece[] {
  if (frameWidth % 8 !== 0 || frameHeight % 8 !== 0) {
    throw new Error(`frame precisa ter largura e altura múltiplas de 8 (recebido ${frameWidth}x${frameHeight})`)
  }
  const pieces: SlicedPiece[] = []

  for (let blockY = 0; blockY < frameHeight; blockY += 16) {
    for (let blockX = 0; blockX < frameWidth; blockX += 16) {
      const blockW = Math.min(16, frameWidth - blockX)
      const blockH = Math.min(16, frameHeight - blockY)
      const bx = originX + blockX
      const by = originY + blockY
      if (!hasPixels(pixels, sheetWidth, bx, by, blockW, blockH)) continue

      const occupied = QUADRANTS.filter(
        ([qx, qy]) => qx < blockW && qy < blockH && hasPixels(pixels, sheetWidth, bx + qx, by + qy, 8, 8),
      )

      const fullBlock = blockW === 16 && blockH === 16
      if (fullBlock && occupied.length > options.quadrantThreshold) {
        pieces.push({ srcX: blockX, srcY: blockY, size: 16 as PieceSize })
      } else {
        for (const [qx, qy] of occupied) {
          pieces.push({ srcX: blockX + qx, srcY: blockY + qy, size: 8 as PieceSize })
        }
      }
    }
  }

  return pieces
}

export type FrameEdge = 'left' | 'right' | 'top' | 'bottom'

/**
 * Contato mínimo (em pixels ao longo da borda) pra considerar o frame
 * cortado. Uma pose que atravessa a borda tem contato largo (o corpo todo);
 * poses vizinhas que só se encostam (ponta de braço, 1-3 linhas) não são
 * corte. Valor empírico: num sprite sheet real testado, membros encostando davam contato 2.
 */
export const MIN_CLIP_CONTACT = 4

/**
 * "Pixels fora do canvas do frame": o sheet é uma grade, então conteúdo que
 * ultrapassa a célula aparece como pixels opacos encostados na borda do
 * frame que CONTINUAM na célula vizinha (mesma conectividade 8), em pelo
 * menos MIN_CLIP_CONTACT posições da borda. Retorna as bordas onde isso
 * acontece (o frame provavelmente está cortado). Bordas do próprio sheet
 * não contam (não há vizinho pra comparar). É heurística: poses vizinhas
 * que se encostam por 4+ pixels também disparam o aviso (não dá pra
 * distinguir "cortada" de "encostada" só pelos pixels).
 */
export function findClippedEdges(
  pixels: Uint8Array,
  sheetWidth: number,
  sheetHeight: number,
  originX: number,
  originY: number,
  frameWidth: number,
  frameHeight: number,
): FrameEdge[] {
  const at = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < sheetWidth && y < sheetHeight && pixels[y * sheetWidth + x] !== 0

  const edges: FrameEdge[] = []

  const crosses = (
    length: number,
    pos: (i: number) => [number, number],
    outward: readonly [number, number],
  ): boolean => {
    let contact = 0
    for (let i = 0; i < length; i++) {
      const [x, y] = pos(i)
      if (!at(x, y)) continue
      for (let k = -1; k <= 1; k++) {
        const nx = outward[0] === 0 ? x + k : x + outward[0]
        const ny = outward[1] === 0 ? y + k : y + outward[1]
        if (at(nx, ny)) {
          contact++
          break
        }
      }
    }
    return contact >= MIN_CLIP_CONTACT
  }

  if (crosses(frameHeight, (i) => [originX, originY + i], [-1, 0])) edges.push('left')
  if (crosses(frameHeight, (i) => [originX + frameWidth - 1, originY + i], [1, 0])) edges.push('right')
  if (crosses(frameWidth, (i) => [originX + i, originY], [0, -1])) edges.push('top')
  if (crosses(frameWidth, (i) => [originX + i, originY + frameHeight - 1], [0, 1])) edges.push('bottom')
  return edges
}
