import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { deleteGfxFile, isReadableGfxFileName, listGfxDir, readGfxFile } from '../vite-gfx-files.ts'

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'gfx-files-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('isReadableGfxFileName: aceita bmp/h/pic/pal/inc/as/map/json; rejeita outras extensões e caminho fora da pasta', () => {
  // .json entrou pros metadados de tileset salvo (docs/PROGRESS.md, "tilesets como recurso salvo e
  // reutilizável", 2026-09-23) — reaproveita este módulo genérico por diretório em vez de duplicar
  // (ver vite-tileset-files-plugin.ts).
  for (const ok of ['hero_tiles.bmp', 'hero_metasprites.H', 'a.pic', 'a.pal', 'a.inc', 'a.as', 'stage1_tilemap.map', 'floresta_tileset.json']) {
    assert.ok(isReadableGfxFileName(ok), ok)
  }
  for (const bad of ['a.exe', '../a.bmp', 'sub/a.bmp', 'C:/a.bmp', '']) {
    assert.ok(!isReadableGfxFileName(bad), bad)
  }
})

test('listGfxDir: lista nomes e mtimes; diretório inexistente devolve lista vazia (não lança)', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, 'a.bmp'), 'x')
    writeFileSync(join(dir, 'b.h'), 'y')
    const files = listGfxDir(dir).sort((a, b) => a.name.localeCompare(b.name))
    assert.deepEqual(files.map((f) => f.name), ['a.bmp', 'b.h'])
    assert.ok(files.every((f) => typeof f.mtimeMs === 'number' && f.mtimeMs > 0))
  })
  assert.deepEqual(listGfxDir('C:/isso/nao/existe/de/verdade'), [])
})

test('readGfxFile: lê o conteúdo exato; nome inválido lança antes de tocar no disco', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, 'hero_metasprites.h'), '/* conteúdo */')
    assert.equal(readGfxFile(dir, 'hero_metasprites.h').toString('utf8'), '/* conteúdo */')
    assert.throws(() => readGfxFile(dir, '../secret.txt'), /inválido/)
    assert.throws(() => readGfxFile(dir, 'a.exe'), /inválido/)
  })
})

test('deleteGfxFile: apaga de verdade (true), arquivo ausente não é erro (false), nome inválido lança', () => {
  withTempDir((dir) => {
    const path = join(dir, 'hero_tiles.bmp')
    writeFileSync(path, 'x')
    assert.equal(deleteGfxFile(dir, 'hero_tiles.bmp'), true)
    assert.equal(deleteGfxFile(dir, 'hero_tiles.bmp'), false) // já foi
    assert.throws(() => deleteGfxFile(dir, '../fora.bmp'), /inválido/)
  })
})

test('path traversal: nome com "/" é rejeitado tanto pelo padrão de extensão quanto pela checagem de basename', () => {
  assert.ok(!isReadableGfxFileName('x/a.bmp'))
  assert.ok(!isReadableGfxFileName('../a.bmp'))
  assert.ok(!isReadableGfxFileName('sub/../a.bmp'))
})
