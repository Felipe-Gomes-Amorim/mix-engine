import assert from 'node:assert/strict'
import { test } from 'node:test'
import { backgroundFileNames, discoverBackgrounds } from '../src/features/import-preview/backgroundDiscovery.ts'

test('discoverBackgrounds: só conta fundo com .bmp E .json juntos (incompleto não dá pra reconstruir)', () => {
  const files = [
    { name: 'ceu_fundo.bmp', mtimeMs: 100 },
    { name: 'ceu_fundo.json', mtimeMs: 200 },
    { name: 'incompleto_fundo.bmp', mtimeMs: 50 }, // sem .json — não conta
    { name: 'floresta_tileset.bmp', mtimeMs: 10 }, // tileset normal, não fundo
  ]
  const backgrounds = discoverBackgrounds(files)
  assert.deepEqual(backgrounds.map((b) => b.name), ['ceu'])
})

test('discoverBackgrounds: ordena pelo mais editado primeiro (maior mtime entre os dois arquivos)', () => {
  const files = [
    { name: 'a_fundo.bmp', mtimeMs: 100 },
    { name: 'a_fundo.json', mtimeMs: 100 },
    { name: 'b_fundo.bmp', mtimeMs: 50 },
    { name: 'b_fundo.json', mtimeMs: 300 }, // b foi editado depois (mtime mais recente no json)
  ]
  const backgrounds = discoverBackgrounds(files)
  assert.deepEqual(backgrounds.map((b) => b.name), ['b', 'a'])
  assert.equal(backgrounds[0].updatedAt, 300)
})

test('discoverBackgrounds: lista vazia dá lista vazia, sem lançar', () => {
  assert.deepEqual(discoverBackgrounds([]), [])
})

test('backgroundFileNames: os dois arquivos de um fundo salvo', () => {
  assert.deepEqual(backgroundFileNames('ceu'), ['ceu_fundo.bmp', 'ceu_fundo.json'])
})
