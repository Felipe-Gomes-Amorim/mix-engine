import type { Pivot } from './types.ts'

// Hitbox do sprite (docs/DATA_FORMAT.md seção 3): UM retângulo por sheet (não
// por frame), ancorado nos pés — a base fica no pivô e ele é centrado no pivô
// em X. Sem offset em X por enquanto.

export interface Hitbox {
  width: number
  height: number
}

/** Largura padrão sugerida: ~75% da largura do frame (16 -> 12, 32 -> 24). */
export const HITBOX_WIDTH_RATIO = 0.75

export function defaultHitboxWidth(frameWidth: number): number {
  return Math.max(1, Math.round(frameWidth * HITBOX_WIDTH_RATIO))
}

/**
 * Deslocamento X da borda esquerda em relação ao pivô: -floor(W / 2)
 * (divisão inteira, igual ao `PLAYER_HITBOX_W / 2` da engine). A borda
 * direita fica em `left + W`; o topo em `-H` (a base está em y = 0, o pivô).
 */
export function hitboxLeft(width: number): number {
  return 0 - Math.floor(width / 2) // "0 -" evita -0 quando W = 1
}

interface FrameRef {
  col: number
  row: number
  pivot: Pivot
}

/**
 * Hitbox padrão: largura ~75% do frame; altura = do pivô ao TOPO DA ARTE, ou
 * seja, a maior distância (pivô.y - primeira linha com pixel opaco) entre os
 * frames com desenho. Sem desenho nenhum, usa a altura do frame. Sempre
 * limitada a [1, frame].
 */
export function defaultHitbox(
  pixels: Uint8Array,
  sheetWidth: number,
  frameWidth: number,
  frameHeight: number,
  frames: ReadonlyArray<FrameRef>,
): Hitbox {
  let tallest = 0
  let anyArt = false

  for (const frame of frames) {
    const originX = frame.col * frameWidth
    const originY = frame.row * frameHeight
    for (let y = 0; y < frameHeight; y++) {
      let found = false
      for (let x = 0; x < frameWidth; x++) {
        if (pixels[(originY + y) * sheetWidth + originX + x] !== 0) {
          found = true
          break
        }
      }
      if (found) {
        anyArt = true
        tallest = Math.max(tallest, frame.pivot.y - y)
        break
      }
    }
  }

  const height = anyArt ? tallest : frameHeight
  return {
    width: Math.min(frameWidth, defaultHitboxWidth(frameWidth)),
    height: Math.min(frameHeight, Math.max(1, height)),
  }
}

/** Mensagens em português (vazio = válida). W e H: inteiros, >= 1 e <= frame. */
export function validateHitbox(hitbox: Hitbox, frameWidth: number, frameHeight: number): string[] {
  const errors: string[] = []
  const check = (label: string, value: number, frameValue: number, frameLabel: string) => {
    if (!Number.isInteger(value)) {
      errors.push(`A ${label} da caixa de colisão precisa ser um número inteiro de pixels.`)
    } else if (value < 1) {
      errors.push(`A ${label} da caixa de colisão precisa ser de pelo menos 1 pixel.`)
    } else if (value > frameValue) {
      errors.push(
        `A ${label} da caixa de colisão (${value} px) não pode ser maior que a ${frameLabel} do quadro (${frameValue} px).`,
      )
    }
  }
  check('largura', hitbox.width, frameWidth, 'largura')
  check('altura', hitbox.height, frameHeight, 'altura')
  return errors
}
