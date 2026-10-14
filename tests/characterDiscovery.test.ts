import assert from 'node:assert/strict'
import { test } from 'node:test'
import { characterFileNames, discoverCharacters, type GfxFileEntry } from '../src/features/import-preview/characterDiscovery.ts'

function entry(name: string, mtimeMs = 0): GfxFileEntry {
  return { name, mtimeMs }
}

test('characterFileNames: lista os arquivos do Editor + os derivados pelo gfx4snes; anim.h só se hasAnim', () => {
  assert.deepEqual(characterFileNames('hero', false), [
    'hero_tiles.bmp',
    'hero_metasprites.h',
    'hero_tiles.pic',
    'hero_tiles.pal',
    'hero_tiles.inc',
    'hero_tiles_data.as',
  ])
  assert.deepEqual(characterFileNames('hero', true), [
    'hero_tiles.bmp',
    'hero_metasprites.h',
    'hero_tiles.pic',
    'hero_tiles.pal',
    'hero_tiles.inc',
    'hero_tiles_data.as',
    'hero_anim.h',
  ])
})

test('discoverCharacters: um personagem completo (tiles + metasprites) aparece; hasAnim reflete o anim.h', () => {
  const files = [entry('hero_metasprites.h'), entry('hero_tiles.bmp'), entry('hero_anim.h')]
  assert.deepEqual(discoverCharacters(files), [{ baseName: 'hero', hasAnim: true, updatedAt: 0 }])

  const withoutAnim = [entry('hero_metasprites.h'), entry('hero_tiles.bmp')]
  assert.deepEqual(discoverCharacters(withoutAnim), [{ baseName: 'hero', hasAnim: false, updatedAt: 0 }])
})

test('discoverCharacters: metasprites.h sem o tiles.bmp correspondente não conta (incompleto, não dá pra reconstruir)', () => {
  assert.deepEqual(discoverCharacters([entry('hero_metasprites.h')]), [])
  assert.deepEqual(discoverCharacters([entry('hero_metasprites.h'), entry('enemy_tiles.bmp')]), [])
})

test('discoverCharacters: ignora arquivos que não são de um personagem (test_sprite.*, cenário solto, .map, .pal isolados)', () => {
  const files = [
    entry('test_sprite.bmp'),
    entry('test_sprite.inc'),
    entry('test_sprite.map'),
    entry('test_sprite.pal'),
    entry('test_sprite.pic'),
    entry('test_sprite_data.as'),
    entry('legado.bmp'), // cenário/legado — sem _metasprites.h, não é personagem
    entry('hero_metasprites.h'),
    entry('hero_tiles.bmp'),
  ]
  assert.deepEqual(discoverCharacters(files), [{ baseName: 'hero', hasAnim: false, updatedAt: 0 }])
})

test('discoverCharacters: vários personagens, ordenados pelo mais editado primeiro (maior mtime)', () => {
  const files = [
    entry('hero_metasprites.h', 100),
    entry('hero_tiles.bmp', 100),
    entry('enemy1_metasprites.h', 300),
    entry('enemy1_tiles.bmp', 250),
    entry('enemy1_anim.h', 300),
  ]
  const characters = discoverCharacters(files)
  assert.deepEqual(
    characters.map((c) => c.baseName),
    ['enemy1', 'hero'],
  )
  assert.equal(characters[0].updatedAt, 300)
  assert.equal(characters[1].updatedAt, 100)
})

test('discoverCharacters: nome de base com underscore no meio (ex.: "boss_final") ainda casa certo', () => {
  const files = [entry('boss_final_metasprites.h'), entry('boss_final_tiles.bmp')]
  assert.deepEqual(discoverCharacters(files), [{ baseName: 'boss_final', hasAnim: false, updatedAt: 0 }])
})
