import { extractPalette, type RgbColor } from '../../lib/indexedBmp'

const MAX_COLORS = 16

export interface ValidationOk {
  ok: true
  palette: RgbColor[]
  indices: Uint8Array
  hasTransparency: boolean
}

export interface ValidationFailed {
  ok: false
  errors: string[]
}

export type ValidationResult = ValidationOk | ValidationFailed

/**
 * Valida se a imagem pode ser exportada no formato que o gfx4snes espera
 * (ver docs/DATA_FORMAT.md seção 1): dimensões múltiplas de 8 e no máximo
 * 16 cores únicas (4bpp). Não faz quantização automática — só rejeita.
 */
export function validateForExport(imageData: ImageData): ValidationResult {
  const errors: string[] = []
  const { width, height } = imageData

  if (width % 8 !== 0 || height % 8 !== 0) {
    errors.push(
      `O tamanho da imagem precisa ser múltiplo de 8 pixels (a sua tem ${width}×${height}). ` +
        'Ajuste o tamanho num editor de imagem e importe de novo.',
    )
  }

  const extraction = extractPalette(imageData, MAX_COLORS)
  if (!extraction.ok) {
    const transparencyNote = extraction.hasTransparency ? ' (contando a transparência)' : ''
    errors.push(
      `A imagem usa ${extraction.colorCount} cores${transparencyNote}, mas o SNES aceita no máximo ` +
        `${MAX_COLORS}. Reduza as cores num editor de imagem (Aseprite, GIMP, Piskel) e ` +
        'importe de novo.',
    )
    return { ok: false, errors }
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    palette: extraction.palette,
    indices: extraction.indices,
    hasTransparency: extraction.hasTransparency,
  }
}

export function toBmpFileName(fileName: string): string {
  const base = fileName.replace(/\.[^./]+$/, '')
  return `${base}.bmp`
}
