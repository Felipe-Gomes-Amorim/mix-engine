// Reconstrói uma imagem PNG (data URL) a partir de índices de cor já
// decodificados — usado tanto pra reabrir um personagem salvo
// (loadCharacter.ts) quanto uma fase salva (loadStage.ts), pra passar pelo
// MESMO caminho de validação (`validateForExport`) que um upload normal
// usaria. Depende de DOM (canvas/Image) — a reconstrução de pixels em si
// (pura) fica em lib/metasprite/importProject.ts e lib/tilemap/.

import type { RgbColor } from './indexedBmp.ts'

/** Índice 0 = transparente, mesma convenção do resto do editor. */
export function indicesToPngDataUrl(width: number, height: number, indices: Uint8Array, palette: RgbColor[]): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível criar um canvas para reconstruir a imagem.')

  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < indices.length; i++) {
    const value = indices[i]
    if (value === 0) continue
    const [r, g, b] = palette[value] ?? [255, 0, 255]
    const o = i * 4
    rgba[o] = r
    rgba[o + 1] = g
    rgba[o + 2] = b
    rgba[o + 3] = 255
  }
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0)
  return canvas.toDataURL('image/png')
}

export async function decodeImageData(dataUrl: string): Promise<ImageData> {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível processar a imagem reconstruída.')
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}
