import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  backdropColorToSnes5Bit,
  channel8To5Bit,
  roundTripBackdropColor,
  uniqueBackdropColors,
} from '../src/lib/tilemap/backdropColor.ts'

test('uniqueBackdropColors: dedupe por VALOR rgb entre vários tilesets, ordem = primeira aparição', () => {
  const tilesets = [
    { upload: { palette: [[0, 0, 0], [255, 0, 0], [0, 255, 0]] as [number, number, number][] } },
    { upload: { palette: [[255, 0, 0], [0, 0, 255]] as [number, number, number][] } },
  ]
  const result = uniqueBackdropColors(tilesets)
  assert.deepEqual(result, [
    [0, 0, 0],
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
  ])
})

test('uniqueBackdropColors: lista de tilesets vazia dá lista vazia, sem lançar', () => {
  assert.deepEqual(uniqueBackdropColors([]), [])
})

test('uniqueBackdropColors: não distingue Camada 1 de Camada 2 — pedido explícito do usuário é combinar/deduplicar as duas juntas', () => {
  // Simula um tileset cujo próprio array de paleta já mistura cores de blocos de Camada 1 e 2
  // (não existe separação por camada dentro de `upload.palette` — a paleta é do TILESET, não do
  // bloco individual) — a função não precisa (nem pode) separar por camada, só deduplicar o que vê.
  const tilesets = [{ upload: { palette: [[1, 1, 1], [2, 2, 2], [1, 1, 1]] as [number, number, number][] } }]
  assert.deepEqual(uniqueBackdropColors(tilesets), [
    [1, 1, 1],
    [2, 2, 2],
  ])
})

test('channel8To5Bit: mesmo bit-shift documentado em docs/DATA_FORMAT.md § 4 (canal8 >> 3) — extremos e um valor do meio', () => {
  assert.equal(channel8To5Bit(0), 0)
  assert.equal(channel8To5Bit(255), 31) // máximo 0-255 vira o máximo 0-31, sem estourar
  assert.equal(channel8To5Bit(8), 1)
  assert.equal(channel8To5Bit(160), 20)
})

test('backdropColorToSnes5Bit: os 3 canais juntos, mesma conversão de channel8To5Bit', () => {
  assert.deepEqual(backdropColorToSnes5Bit([96, 160, 248]), [12, 20, 31])
})

test('roundTripBackdropColor: ida e volta por 5 bits — só pra exibição, nunca exatamente igual ao original salvo pelo editor', () => {
  // 96 -> 12 (5 bits) -> round(12*255/31) = 99 (não 96 — é exatamente a "surpresa" que a prévia
  // ao vivo precisa mostrar ANTES de salvar, não só depois). 160 -> 20 -> round(20*255/31) = 165.
  assert.deepEqual(roundTripBackdropColor([96, 160, 248]), [99, 165, 255])
  assert.deepEqual(roundTripBackdropColor([0, 0, 0]), [0, 0, 0])
  assert.deepEqual(roundTripBackdropColor([255, 255, 255]), [255, 255, 255])
})
