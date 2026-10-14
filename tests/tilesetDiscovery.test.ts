import assert from 'node:assert/strict'
import { test } from 'node:test'
import { discoverTilesets, tilesetFileNames } from '../src/features/import-preview/tilesetDiscovery.ts'

test('discoverTilesets: só conta tileset com .bmp E .json juntos (incompleto não dá pra reconstruir)', () => {
  const files = [
    { name: 'floresta_tileset.bmp', mtimeMs: 100 },
    { name: 'floresta_tileset.json', mtimeMs: 200 },
    { name: 'incompleto_tileset.bmp', mtimeMs: 50 }, // sem .json — não conta
    { name: 'stage1_tilemap.bmp', mtimeMs: 10 }, // arquivo de fase, não de tileset
  ]
  const tilesets = discoverTilesets(files)
  assert.deepEqual(tilesets.map((t) => t.name), ['floresta'])
})

test('discoverTilesets: ordena pelo mais editado primeiro (maior mtime entre os dois arquivos)', () => {
  const files = [
    { name: 'a_tileset.bmp', mtimeMs: 100 },
    { name: 'a_tileset.json', mtimeMs: 100 },
    { name: 'b_tileset.bmp', mtimeMs: 50 },
    { name: 'b_tileset.json', mtimeMs: 300 }, // b foi editado depois (mtime mais recente no json)
  ]
  const tilesets = discoverTilesets(files)
  assert.deepEqual(tilesets.map((t) => t.name), ['b', 'a'])
  assert.equal(tilesets[0].updatedAt, 300)
})

test('discoverTilesets: lista vazia dá lista vazia, sem lançar', () => {
  assert.deepEqual(discoverTilesets([]), [])
})

test('tilesetFileNames: os dois arquivos de um tileset salvo', () => {
  assert.deepEqual(tilesetFileNames('floresta'), ['floresta_tileset.bmp', 'floresta_tileset.json'])
})
