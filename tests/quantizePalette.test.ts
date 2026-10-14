import assert from 'node:assert/strict'
import { test } from 'node:test'
import { medianCutQuantize, quantizeImageData } from '../src/lib/quantizePalette.ts'

function rgbaImage(pixels: Array<[number, number, number, number]>, width: number): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(pixels.length * 4)
  pixels.forEach(([r, g, b, a], i) => {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  })
  return { data, width, height: pixels.length / width }
}

test('medianCutQuantize: histograma que já cabe no limite devolve cada cor mapeada pra ela mesma (no-op)', () => {
  const histogram = new Map([
    ['1,2,3', { r: 1, g: 2, b: 3, count: 5 }],
    ['4,5,6', { r: 4, g: 5, b: 6, count: 1 }],
  ])
  const mapping = medianCutQuantize(histogram, 16)
  assert.deepEqual(mapping.get('1,2,3'), [1, 2, 3])
  assert.deepEqual(mapping.get('4,5,6'), [4, 5, 6])
})

test('medianCutQuantize: reduz pra no máximo maxColors cores distintas', () => {
  const histogram = new Map<string, { r: number; g: number; b: number; count: number }>()
  for (let i = 0; i < 40; i++) {
    // Espalha cores ao longo do eixo R — bastante variedade pra forçar divisão de verdade.
    const r = Math.floor((i * 255) / 39)
    histogram.set(`${r},10,10`, { r, g: 10, b: 10, count: 1 })
  }
  const mapping = medianCutQuantize(histogram, 8)
  const uniqueOutputs = new Set([...mapping.values()].map((c) => c.join(',')))
  assert.ok(uniqueOutputs.size <= 8, `esperado ≤8 cores únicas, veio ${uniqueOutputs.size}`)
  assert.equal(mapping.size, 40, 'toda cor original tem uma entrada no mapeamento')
})

test('medianCutQuantize: dois clusters bem separados (vermelho vs azul) viram 2 representantes coerentes com cada cluster', () => {
  const histogram = new Map<string, { r: number; g: number; b: number; count: number }>()
  for (let i = 0; i < 10; i++) histogram.set(`${200 + i},0,0`, { r: 200 + i, g: 0, b: 0, count: 1 }) // cluster vermelho
  for (let i = 0; i < 10; i++) histogram.set(`0,0,${200 + i}`, { r: 0, g: 0, b: 200 + i, count: 1 }) // cluster azul

  const mapping = medianCutQuantize(histogram, 2)
  const redRepresentative = mapping.get('205,0,0')!
  const blueRepresentative = mapping.get('0,0,205')!
  assert.ok(redRepresentative[0] > 150 && redRepresentative[2] < 50, `representante do cluster vermelho deveria continuar vermelho: ${redRepresentative}`)
  assert.ok(blueRepresentative[2] > 150 && blueRepresentative[0] < 50, `representante do cluster azul deveria continuar azul: ${blueRepresentative}`)
})

test('quantizeImageData: imagem já dentro do limite não muda nenhum pixel', () => {
  const image = rgbaImage(
    [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
    ],
    2,
  )
  const result = quantizeImageData(image, 16)
  assert.equal(result.originalColorCount, 2)
  assert.equal(result.quantizedColorCount, 2)
  assert.deepEqual([...result.data], [...image.data])
})

test('quantizeImageData: pixels transparentes não entram no orçamento de cor e continuam transparentes', () => {
  const image = rgbaImage(
    [
      [255, 0, 0, 255],
      [0, 0, 0, 0], // transparente — não deveria contar como uma "cor" nem ser tocado
    ],
    2,
  )
  const result = quantizeImageData(image, 16)
  assert.equal(result.originalColorCount, 1, 'pixel transparente não conta pro histograma de cores opacas')
  assert.equal(result.data[7], 0, 'alpha do pixel transparente continua 0')
})

test('quantizeImageData: imagem com mais cores que o limite reduz pra <= maxColors cores opacas únicas', () => {
  const pixels: Array<[number, number, number, number]> = []
  for (let i = 0; i < 20; i++) pixels.push([i * 10, 0, 0, 255]) // 20 vermelhos distintos
  const image = rgbaImage(pixels, 20)

  const result = quantizeImageData(image, 15)
  assert.equal(result.originalColorCount, 20)
  assert.ok(result.quantizedColorCount <= 15, `esperado ≤15, veio ${result.quantizedColorCount}`)

  const distinctColorsInOutput = new Set<string>()
  for (let i = 0; i < 20; i++) {
    distinctColorsInOutput.add(`${result.data[i * 4]},${result.data[i * 4 + 1]},${result.data[i * 4 + 2]}`)
  }
  assert.ok(distinctColorsInOutput.size <= 15, `pixels de saída deveriam usar ≤15 cores distintas, veio ${distinctColorsInOutput.size}`)
})
