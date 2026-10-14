import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GfxFileEntry } from '../src/features/import-preview/characterDiscovery.ts'
import {
  STAGE_COLLISION_FILE,
  STAGE_ENTITIES_FILE,
  STAGE_FILE_NAMES,
  STAGE_TILEMAP_FILE,
  stageExists,
} from '../src/features/import-preview/stageDiscovery.ts'

function entry(name: string): GfxFileEntry {
  return { name, mtimeMs: 0 }
}

test('stageExists: só é true quando o .bmp E o .h da fase estão os dois presentes (entities.h é opcional)', () => {
  assert.equal(stageExists([]), false)
  assert.equal(stageExists([entry(STAGE_TILEMAP_FILE)]), false)
  assert.equal(stageExists([entry(STAGE_COLLISION_FILE)]), false)
  assert.equal(stageExists([entry(STAGE_TILEMAP_FILE), entry(STAGE_COLLISION_FILE)]), true)
  assert.equal(
    stageExists([entry(STAGE_TILEMAP_FILE), entry(STAGE_COLLISION_FILE), entry(STAGE_ENTITIES_FILE)]),
    true,
  )
})

test('stageExists: não confunde com arquivos de personagem/cenário soltos', () => {
  assert.equal(stageExists([entry('hero_tiles.bmp'), entry('hero_metasprites.h')]), false)
})

test('STAGE_FILE_NAMES: inclui os dois arquivos que stageExists confere, mais os derivados pelo gfx4snes/build da engine', () => {
  assert.ok(STAGE_FILE_NAMES.includes(STAGE_TILEMAP_FILE))
  assert.ok(STAGE_FILE_NAMES.includes(STAGE_COLLISION_FILE))
  for (const derived of ['stage1_tilemap.pic', 'stage1_tilemap.pal', 'stage1_tilemap.map', 'stage1_tilemap.inc', 'stage1_tilemap_data.as']) {
    assert.ok(STAGE_FILE_NAMES.includes(derived), derived)
  }
})
