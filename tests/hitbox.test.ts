import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildMetasprites } from '../src/lib/metasprite/builder.ts'
import { generateMetaspriteHeader } from '../src/lib/metasprite/exportHeader.ts'
import {
  defaultHitbox,
  defaultHitboxWidth,
  hitboxLeft,
  validateHitbox,
} from '../src/lib/metasprite/hitbox.ts'
import { FRAME_DIMENSIONS } from '../src/lib/metasprite/types.ts'
import { SYNTH16_SHEET_ROWS } from './fixtures/syntheticSheet16x32.ts'

function blank(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height)
}

function fillRect(px: Uint8Array, width: number, x: number, y: number, w: number, h: number, v = 1) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px[j * width + i] = v
}

function sheetFromRows(rows: string[]): Uint8Array {
  const width = rows[0].length
  const px = new Uint8Array(width * rows.length)
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) px[y * width + x] = parseInt(row[x], 16)
  })
  return px
}

test('largura padrão da hitbox: ~75% do frame, sempre inteira (16 -> 12, 32 -> 24)', () => {
  assert.equal(defaultHitboxWidth(16), 12) // as constantes provisórias da engine pro personagem 16x32
  assert.equal(defaultHitboxWidth(32), 24)
  assert.equal(defaultHitboxWidth(8), 6)
  assert.equal(defaultHitboxWidth(64), 48)
  for (const n of FRAME_DIMENSIONS) {
    const w = defaultHitboxWidth(n)
    assert.ok(Number.isInteger(w) && w >= 1 && w <= n, `${n} -> ${w}`)
    assert.equal(w, (n * 3) / 4)
  }
})

test('hitbox ancorada nos pés: esquerda = -floor(W/2) do pivô (divisão inteira, como a engine)', () => {
  assert.equal(hitboxLeft(12), -6) // 12 px: de -6 a +6
  assert.equal(hitboxLeft(13), -6) // ímpar: de -6 a +7 (direita = esquerda + W)
  assert.equal(hitboxLeft(1), 0)
  assert.equal(hitboxLeft(16), -8)
})

test('altura padrão = do pivô ao topo da arte (frame mais alto manda), largura = 75%', () => {
  // 2 frames 16x32: arte começando em y=10 no frame 0 e em y=14 no frame 1
  const px = blank(32, 32)
  fillRect(px, 32, 4, 10, 8, 20)
  fillRect(px, 32, 16 + 4, 14, 8, 16)
  const sheet = buildMetasprites(px, 32, 32, { frameWidth: 16, frameHeight: 32 }) // pivô (8, 32)
  assert.deepEqual(defaultHitbox(px, 32, 16, 32, sheet.frames), { width: 12, height: 22 }) // 32-10

  // pivôs por frame contam: frame 0 com pivô y=20 -> 20-10 = 10; frame 1 com y=32 -> 32-14 = 18
  const custom = buildMetasprites(px, 32, 32, {
    frameWidth: 16,
    frameHeight: 32,
    pivotOverrides: { 0: { x: 8, y: 20 } },
  })
  assert.equal(defaultHitbox(px, 32, 16, 32, custom.frames).height, 18)

  // sem arte nenhuma: usa a altura do frame; arte toda abaixo do pivô: mínimo 1
  const empty = buildMetasprites(blank(32, 32), 32, 32, { frameWidth: 16, frameHeight: 32 })
  assert.deepEqual(defaultHitbox(blank(32, 32), 32, 16, 32, empty.frames), { width: 12, height: 32 })
  const below = blank(16, 32)
  fillRect(below, 16, 4, 20, 8, 8)
  const belowSheet = buildMetasprites(below, 16, 32, {
    frameWidth: 16,
    frameHeight: 32,
    defaultPivot: { x: 8, y: 5 },
  })
  assert.equal(defaultHitbox(below, 16, 16, 32, belowSheet.frames).height, 1)
})

test('sheet sintético 16x32: sugestão = 12 de largura (como a engine) e altura do pivô ao topo da arte', () => {
  const px = sheetFromRows(SYNTH16_SHEET_ROWS)
  const feet = buildMetasprites(px, 64, 64, { frameWidth: 16, frameHeight: 32 })
  const top = (frameIndex: number) => {
    const col = frameIndex % 4
    const row = Math.floor(frameIndex / 4)
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 16; x++) if (px[(row * 32 + y) * 64 + col * 16 + x] !== 0) return y
    }
    return null
  }
  const tops = [0, 1, 2, 4, 5, 6].map((i) => top(i) as number)
  const highest = Math.min(...tops)

  const atBase = defaultHitbox(px, 64, 16, 32, feet.frames) // pivô padrão (8, 32)
  assert.deepEqual(atBase, { width: 12, height: 32 - highest })

  // pivô nos pés reais da arte (y = 25, como no export usado pela engine): altura = 25 - topo
  const atFeet = buildMetasprites(px, 64, 64, { frameWidth: 16, frameHeight: 32, defaultPivot: { x: 8, y: 25 } })
  const hb = defaultHitbox(px, 64, 16, 32, atFeet.frames)
  assert.deepEqual(hb, { width: 12, height: 25 - highest })
  assert.equal(validateHitbox(hb, 16, 32).length, 0)
})

test('validação da hitbox: inteiros, >= 1 e <= frame, mensagens em português', () => {
  assert.deepEqual(validateHitbox({ width: 12, height: 24 }, 16, 32), [])
  assert.deepEqual(validateHitbox({ width: 16, height: 32 }, 16, 32), []) // igual ao frame vale
  assert.deepEqual(validateHitbox({ width: 1, height: 1 }, 16, 32), [])

  const zero = validateHitbox({ width: 0, height: 24 }, 16, 32)
  assert.equal(zero.length, 1)
  assert.match(zero[0], /A largura da caixa de colisão precisa ser de pelo menos 1 pixel\./)

  const tooTall = validateHitbox({ width: 12, height: 33 }, 16, 32)
  assert.match(tooTall[0], /A altura da caixa de colisão \(33 px\) não pode ser maior que a altura do quadro \(32 px\)\./)

  const tooWide = validateHitbox({ width: 20, height: 24 }, 16, 32)
  assert.match(tooWide[0], /A largura da caixa de colisão \(20 px\) não pode ser maior que a largura do quadro \(16 px\)\./)

  assert.match(validateHitbox({ width: 1.5, height: 24 }, 16, 32)[0], /número inteiro/)
  assert.match(validateHitbox({ width: Number.NaN, height: 24 }, 16, 32)[0], /número inteiro/)
  assert.equal(validateHitbox({ width: -3, height: 0 }, 16, 32).length, 2) // largura e altura reportadas juntas
})

test('export: defines <BASE>_HITBOX_W/H, documentação da âncora e recusa de hitbox inválida', () => {
  const px = blank(16, 32)
  fillRect(px, 16, 2, 8, 12, 24)
  const sheet = buildMetasprites(px, 16, 32, { frameWidth: 16, frameHeight: 32 })
  const header = generateMetaspriteHeader(sheet, 'testchar', 'testchar.png', 'testchar_tiles.bmp', {
    width: 12,
    height: 24,
  })
  assert.match(header, /^#define TESTCHAR_HITBOX_W 12 /m)
  assert.match(header, /^#define TESTCHAR_HITBOX_H 24 /m)
  assert.match(header, /HITBOX \(TESTCHAR_HITBOX_W\/H, px\)/)
  assert.match(header, /Ancorada nos pés: a base fica no pivô/)
  assert.match(header, /esquerda = pivô_x - W\/2/)
  // continua emitindo o resto do contrato
  assert.match(header, /^#define TESTCHAR_FRAME_WIDTH 16$/m)
  assert.match(header, /^#define TESTCHAR_FRAME_HEIGHT 32$/m)

  for (const bad of [
    { width: 0, height: 24 },
    { width: 12, height: 0 },
    { width: 17, height: 24 },
    { width: 12, height: 33 },
    { width: 1.5, height: 24 },
  ]) {
    assert.throws(
      () => generateMetaspriteHeader(sheet, 'testchar', 'testchar.png', 'testchar_tiles.bmp', bad),
      /caixa de colisão/,
      JSON.stringify(bad),
    )
  }
})
