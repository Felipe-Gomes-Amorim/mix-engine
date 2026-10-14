// Extração de paleta e escrita de BMP indexado (8bpp), formato aceito pelo
// gfx4snes (PVSnesLib) — ver docs/DATA_FORMAT.md seção 1.

export type RgbColor = [number, number, number]

export interface PaletteExtracted {
  ok: true
  palette: RgbColor[]
  indices: Uint8Array
  /** Se a imagem tem pixels transparentes, o índice 0 foi reservado pra eles. */
  hasTransparency: boolean
}

export interface PaletteOverflow {
  ok: false
  /** Conta a cor 0 transparente (quando existir) — é uma das `maxColors`. */
  colorCount: number
  hasTransparency: boolean
}

/** Pixel com alpha abaixo disso é tratado como transparente. */
const ALPHA_OPAQUE_MIN = 128

/**
 * Varre os pixels da imagem e monta uma paleta indexada. Regra de
 * transparência do SNES (cor 0 = transparente): se a imagem tiver algum
 * pixel transparente (alpha < 128), o índice 0 é reservado pra ele — assim
 * um contorno preto opaco (0,0,0) não colide com o fundo transparente
 * (0,0,0,0) — e as cores opacas ocupam 1..N. Sem transparência, os índices
 * seguem a ordem de aparição (comportamento anterior). O RGB dos pixels
 * opacos ignora alpha (o BMP de saída não tem canal alpha). Retorna
 * overflow se passar de `maxColors` (contando a transparente).
 */
export function extractPalette(
  imageData: ImageData,
  maxColors = 16,
): PaletteExtracted | PaletteOverflow {
  const { data, width, height } = imageData
  const pixelCount = width * height

  let hasTransparency = false
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    if (data[pixel * 4 + 3] < ALPHA_OPAQUE_MIN) {
      hasTransparency = true
      break
    }
  }

  const colorToIndex = new Map<number, number>()
  const palette: RgbColor[] = hasTransparency ? [[0, 0, 0]] : []
  const indices = new Uint8Array(pixelCount)

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const offset = pixel * 4
    if (data[offset + 3] < ALPHA_OPAQUE_MIN) continue // índice 0

    const r = data[offset]
    const g = data[offset + 1]
    const b = data[offset + 2]
    const key = (r << 16) | (g << 8) | b

    let index = colorToIndex.get(key)
    if (index === undefined) {
      index = palette.length
      colorToIndex.set(key, index)
      palette.push([r, g, b])
    }
    indices[pixel] = index
  }

  if (palette.length > maxColors) {
    return { ok: false, colorCount: palette.length, hasTransparency }
  }
  return { ok: true, palette, indices, hasTransparency }
}

/**
 * Gera um .bmp indexado de verdade: BITMAPFILEHEADER (14 bytes) +
 * BITMAPINFOHEADER (40 bytes) + tabela de cores (BGR0, 4 bytes/cor) +
 * pixels (1 byte/pixel = índice na paleta). Pegadinhas do formato: linhas
 * são armazenadas de baixo pra cima (bottom-up) e cada linha é preenchida
 * (padding) até ser múltiplo de 4 bytes.
 */
export function encodeIndexedBmp(
  width: number,
  height: number,
  indices: Uint8Array,
  palette: RgbColor[],
): Blob {
  const paletteLength = palette.length
  const rowStride = Math.ceil(width / 4) * 4
  const pixelDataOffset = 14 + 40 + paletteLength * 4
  const pixelDataSize = rowStride * height
  const fileSize = pixelDataOffset + pixelDataSize

  const buffer = new ArrayBuffer(fileSize)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  // BITMAPFILEHEADER
  bytes[0] = 0x42 // 'B'
  bytes[1] = 0x4d // 'M'
  view.setUint32(2, fileSize, true)
  view.setUint32(6, 0, true) // reservado
  view.setUint32(10, pixelDataOffset, true)

  // BITMAPINFOHEADER
  view.setUint32(14, 40, true) // tamanho do header
  view.setInt32(18, width, true)
  view.setInt32(22, height, true) // positivo = bottom-up
  view.setUint16(26, 1, true) // planes
  view.setUint16(28, 8, true) // bits por pixel
  view.setUint32(30, 0, true) // BI_RGB, sem compressão
  view.setUint32(34, pixelDataSize, true)
  view.setInt32(38, 0, true) // pixels/metro horizontal
  view.setInt32(42, 0, true) // pixels/metro vertical
  view.setUint32(46, paletteLength, true) // cores usadas
  view.setUint32(50, 0, true) // cores "importantes" (0 = todas)

  // Tabela de cores (BGR0)
  let offset = 54
  for (const [r, g, b] of palette) {
    bytes[offset] = b
    bytes[offset + 1] = g
    bytes[offset + 2] = r
    bytes[offset + 3] = 0
    offset += 4
  }

  // Pixels: bottom-up, cada linha com padding até múltiplo de 4 bytes
  let rowOffset = pixelDataOffset
  for (let row = 0; row < height; row++) {
    const sourceY = height - 1 - row
    const sourceRowStart = sourceY * width
    for (let x = 0; x < width; x++) {
      bytes[rowOffset + x] = indices[sourceRowStart + x]
    }
    rowOffset += rowStride
  }

  return new Blob([buffer], { type: 'image/bmp' })
}
