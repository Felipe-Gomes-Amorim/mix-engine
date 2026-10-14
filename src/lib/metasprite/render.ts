import type { RgbColor } from '../indexedBmp.ts'
import { COLORS_PER_BANK } from '../tilemap/types.ts'
import type { ComposedFrame } from './compose.ts'

/**
 * Converte um frame recomposto (índices de cor) em pixels RGBA pra desenhar
 * num canvas. Índice 0 (dentro do banco de 16 cores de origem daquele
 * pixel — `value % COLORS_PER_BANK`, não o índice GLOBAL) = transparente
 * (alpha 0); índice fora da paleta vira magenta (só aparece se algo
 * estiver errado).
 *
 * Achado real (2026-09-22, editor de fase com 2+ tilesets): um tileset
 * combinado (`combineTilesets.ts`) desloca TODO índice de cor de um
 * tileset pelo banco dele (`bankIndex*16`) — inclusive o que era o índice
 * 0 (transparente) na imagem original. Checar só `value === 0` fazia
 * qualquer tileset que não fosse o primeiro (banco 0) perder a
 * transparência: o pixel que devia ficar vazio virava opaco com a cor que
 * sobrou no slot `bankIndex*16 + 0` da paleta combinada (por isso o fundo
 * preto que apareceu no 2º tileset importado). `value % 16 === 0` resolve
 * as duas situações com a MESMA regra: pra quem só usa 1 paleta de 16
 * cores (personagem/animação, `value` nunca passa de 15), `value % 16` é
 * sempre igual a `value` — comportamento idêntico a antes, sem mudança.
 */
export function composedToRgba(composed: ComposedFrame, palette: RgbColor[]): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(composed.pixels.length * 4)
  for (let i = 0; i < composed.pixels.length; i++) {
    const value = composed.pixels[i]
    if (value % COLORS_PER_BANK === 0) continue
    const [r, g, b] = palette[value] ?? [255, 0, 255]
    const o = i * 4
    out[o] = r
    out[o + 1] = g
    out[o + 2] = b
    out[o + 3] = 255
  }
  return out
}
