// Quantização automática de paleta (docs/PROGRESS.md, "quantização automática de paleta",
// 2026-09-25) — até aqui, uma imagem com mais de 16 cores era só REJEITADA (validation.ts), pedindo
// pro usuário reduzir num editor externo. Este módulo reduz de verdade, com median-cut (simples e
// suficiente pra este caso — sprites/tilesets pequenos, não fotos): sempre com confirmação
// explícita do usuário (é destrutivo/lossy), nunca automático/silencioso.

import type { RgbColor } from './indexedBmp'

/** Pixel com alpha abaixo disso é tratado como transparente — MESMO limiar de `indexedBmp.ts`
 * (`extractPalette`), pra decidir "essa cor conta pro orçamento?" da mesma forma nos dois lugares. */
const ALPHA_OPAQUE_MIN = 128

interface ColorBucket {
  /** Uma entrada por COR ÚNICA (não por pixel) — count = quantos pixels tinham essa cor, usado só
   * pra ponderar a média final (evita 1 pixel isolado puxar a média igual a uma área grande). */
  colors: Array<{ r: number; g: number; b: number; count: number }>
}

function bucketRange(bucket: ColorBucket): { channel: 0 | 1 | 2; range: number } {
  let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0
  for (const { r, g, b } of bucket.colors) {
    if (r < minR) minR = r
    if (r > maxR) maxR = r
    if (g < minG) minG = g
    if (g > maxG) maxG = g
    if (b < minB) minB = b
    if (b > maxB) maxB = b
  }
  const rangeR = maxR - minR
  const rangeG = maxG - minG
  const rangeB = maxB - minB
  if (rangeR >= rangeG && rangeR >= rangeB) return { channel: 0, range: rangeR }
  if (rangeG >= rangeB) return { channel: 1, range: rangeG }
  return { channel: 2, range: rangeB }
}

function splitBucket(bucket: ColorBucket): [ColorBucket, ColorBucket] {
  const { channel } = bucketRange(bucket)
  const key = channel === 0 ? 'r' : channel === 1 ? 'g' : ('b' as const)
  const sorted = [...bucket.colors].sort((a, b) => a[key] - b[key])
  const mid = Math.ceil(sorted.length / 2)
  return [{ colors: sorted.slice(0, mid) }, { colors: sorted.slice(mid) }]
}

function bucketAverage(bucket: ColorBucket): RgbColor {
  let sumR = 0, sumG = 0, sumB = 0, totalCount = 0
  for (const { r, g, b, count } of bucket.colors) {
    sumR += r * count
    sumG += g * count
    sumB += b * count
    totalCount += count
  }
  return [Math.round(sumR / totalCount), Math.round(sumG / totalCount), Math.round(sumB / totalCount)]
}

/**
 * Median-cut: recebe o histograma de cores ÚNICAS (chave `"r,g,b"` -> contagem de pixels) e reduz
 * pra no máximo `maxColors` cores, devolvendo um mapa de cada cor ORIGINAL pra sua cor
 * quantizada. Se o histograma já cabe em `maxColors`, devolve cada cor mapeada pra ELA MESMA (sem
 * perda nenhuma — quantizar uma imagem que já é válida é um no-op).
 */
export function medianCutQuantize(histogram: ReadonlyMap<string, { r: number; g: number; b: number; count: number }>, maxColors: number): Map<string, RgbColor> {
  const entries = [...histogram.entries()]
  if (entries.length <= maxColors) {
    return new Map(entries.map(([key, { r, g, b }]) => [key, [r, g, b] as RgbColor]))
  }

  let buckets: ColorBucket[] = [{ colors: entries.map(([, v]) => v) }]
  while (buckets.length < maxColors) {
    // Divide sempre o bucket com maior alcance de cor (heurística padrão do median-cut) — só entre
    // os que TÊM mais de 1 cor pra dividir (um bucket de 1 cor não rende mais nada).
    let splitIndex = -1
    let bestRange = -1
    buckets.forEach((bucket, i) => {
      if (bucket.colors.length <= 1) return
      const { range } = bucketRange(bucket)
      if (range > bestRange) {
        bestRange = range
        splitIndex = i
      }
    })
    if (splitIndex === -1) break // nenhum bucket dá mais pra dividir

    const [a, b] = splitBucket(buckets[splitIndex])
    buckets = [...buckets.slice(0, splitIndex), a, b, ...buckets.slice(splitIndex + 1)]
  }

  const mapping = new Map<string, RgbColor>()
  for (const bucket of buckets) {
    const representative = bucketAverage(bucket)
    for (const { r, g, b } of bucket.colors) {
      mapping.set(`${r},${g},${b}`, representative)
    }
  }
  return mapping
}

export interface QuantizeResult {
  /** Pixels RGBA reduzidos, no mesmo formato "cru" que `composedToRgba`/`synthesizeImage.ts` já
   * devolvem (não um `ImageData` de verdade — esse construtor só existe no navegador; quem chama
   * do lado da UI é que embrulha com `new ImageData(...)` na hora de desenhar/reler, o mesmo
   * padrão já usado no resto do projeto). Alpha de cada pixel preservado como veio; pixels
   * transparentes não são alterados (RGB deles é ignorado no resto do pipeline, ver
   * `extractPalette`). */
  width: number
  height: number
  data: Uint8ClampedArray
  /** Quantas cores opacas ÚNICAS a imagem tinha antes de reduzir. */
  originalColorCount: number
  /** Quantas cores opacas ÚNICAS sobraram depois — sempre ≤ `maxColors`. */
  quantizedColorCount: number
}

/**
 * Aplica `medianCutQuantize` a uma imagem RGBA inteira (mesmo formato de `ImageData.data`, mas
 * aceita um objeto plano — funciona em Node, testável com `node:test`, sem precisar do
 * `ImageData` do navegador) — monta o histograma de cores OPACAS (mesmo critério de
 * `extractPalette`), reduz pra `maxColors`, e reescreve cada pixel opaco com a cor quantizada
 * correspondente. Pura (não muda o array recebido, devolve uma cópia nova).
 */
export function quantizeImageData(
  imageData: { data: ArrayLike<number>; width: number; height: number },
  maxColors: number,
): QuantizeResult {
  const { data, width, height } = imageData
  const pixelCount = width * height

  const histogram = new Map<string, { r: number; g: number; b: number; count: number }>()
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const offset = pixel * 4
    if (data[offset + 3] < ALPHA_OPAQUE_MIN) continue
    const r = data[offset]
    const g = data[offset + 1]
    const b = data[offset + 2]
    const key = `${r},${g},${b}`
    const entry = histogram.get(key)
    if (entry) entry.count++
    else histogram.set(key, { r, g, b, count: 1 })
  }

  const mapping = medianCutQuantize(histogram, maxColors)

  const outData = new Uint8ClampedArray(data)
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const offset = pixel * 4
    if (data[offset + 3] < ALPHA_OPAQUE_MIN) continue
    const key = `${data[offset]},${data[offset + 1]},${data[offset + 2]}`
    const [r, g, b] = mapping.get(key)!
    outData[offset] = r
    outData[offset + 1] = g
    outData[offset + 2] = b
  }

  const quantizedColorCount = new Set([...mapping.values()].map(([r, g, b]) => `${r},${g},${b}`)).size

  return {
    width,
    height,
    data: outData,
    originalColorCount: histogram.size,
    quantizedColorCount,
  }
}
