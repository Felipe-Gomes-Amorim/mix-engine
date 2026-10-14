import assert from 'node:assert/strict'
import { test } from 'node:test'
import { encodeIndexedBmp, type RgbColor } from '../src/lib/indexedBmp.ts'
import { buildMetasprites } from '../src/lib/metasprite/builder.ts'
import { generateMetaspriteHeader } from '../src/lib/metasprite/exportHeader.ts'
import {
  buildSyntheticSheet,
  decodeIndexedBmp,
  parseAnimationHeader,
  parseMetaspriteHeader,
  reconstructFrameAt,
  reconstructFramePixels,
  reconstructThumbnail,
} from '../src/lib/metasprite/importProject.ts'
import { generateAnimationHeader } from '../src/features/import-preview/animationSequence.ts'

// ---------- helpers (mesmo padrão de tests/metasprite.test.ts) ----------

function blank(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height)
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomSheet(width: number, height: number, seed: number, density: number): Uint8Array {
  const rand = mulberry32(seed)
  const px = blank(width, height)
  for (let i = 0; i < (width * height) / 40; i++) {
    const w = 1 + Math.floor(rand() * 12)
    const h = 1 + Math.floor(rand() * 12)
    if (rand() > density || w >= width || h >= height) continue
    const x0 = Math.floor(rand() * (width - w))
    const y0 = Math.floor(rand() * (height - h))
    const v = 1 + Math.floor(rand() * 15)
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px[y * width + x] = v
  }
  return px
}

function sourceFrame(px: Uint8Array, sheetW: number, frameW: number, frameH: number, index: number): Uint8Array {
  const cols = sheetW / frameW
  const ox = (index % cols) * frameW
  const oy = Math.floor(index / cols) * frameH
  const out = new Uint8Array(frameW * frameH)
  for (let y = 0; y < frameH; y++) {
    for (let x = 0; x < frameW; x++) out[y * frameW + x] = px[(oy + y) * sheetW + ox + x]
  }
  return out
}

function randomPalette(seed: number): RgbColor[] {
  const rand = mulberry32(seed)
  return Array.from({ length: 16 }, () => [
    Math.floor(rand() * 256),
    Math.floor(rand() * 256),
    Math.floor(rand() * 256),
  ])
}

// ---------- decodeIndexedBmp: inverso de encodeIndexedBmp ----------

test('decodeIndexedBmp: round-trip com encodeIndexedBmp (dimensões, paleta e índices exatos)', async () => {
  for (const [width, height] of [[8, 8], [17, 5], [128, 32], [1, 1]] as const) {
    const rand = mulberry32(width * 1000 + height)
    const indices = new Uint8Array(width * height).map(() => Math.floor(rand() * 5))
    const palette = randomPalette(width + height)
    const blob = encodeIndexedBmp(width, height, indices, palette)
    const bytes = new Uint8Array(await blob.arrayBuffer())

    const decoded = decodeIndexedBmp(bytes)
    assert.equal(decoded.width, width)
    assert.equal(decoded.height, height)
    assert.deepEqual([...decoded.indices], [...indices])
    // só as cores realmente usadas foram escritas na paleta (ver encodeIndexedBmp)
    for (let i = 0; i < palette.length; i++) assert.deepEqual(decoded.palette[i], palette[i])
  }
})

test('decodeIndexedBmp: rejeita assinatura errada e bit depth != 8', () => {
  assert.throws(() => decodeIndexedBmp(new Uint8Array(60)), /assinatura/)
  const bytes = new Uint8Array(60)
  bytes[0] = 0x42
  bytes[1] = 0x4d
  new DataView(bytes.buffer).setUint16(28, 24, true) // 24bpp
  assert.throws(() => decodeIndexedBmp(bytes), /24 bits por pixel/)
})

// ---------- parseMetaspriteHeader: inverso de generateMetaspriteHeader ----------

test('parseMetaspriteHeader: round-trip com generateMetaspriteHeader (frame, hitbox, paleta, pivô, peças)', () => {
  for (const [fw, fh] of [[32, 32], [16, 32], [24, 40]] as const) {
    for (const seed of [1, 2, 3]) {
      const px = randomSheet(fw * 3, fh * 2, seed * 10 + fw, 0.85)
      const sheet = buildMetasprites(px, fw * 3, fh * 2, {
        frameWidth: fw,
        frameHeight: fh,
        palette: (seed % 8) as number,
        defaultPivot: { x: Math.floor(fw / 2), y: fh - 2 },
      })
      const hitbox = { width: Math.max(1, fw - 4), height: Math.max(1, fh - 6) }
      const header = generateMetaspriteHeader(sheet, 'demo', 'demo.png', 'demo_tiles.bmp', hitbox)

      const parsed = parseMetaspriteHeader('demo', header)
      assert.equal(parsed.frameWidth, fw)
      assert.equal(parsed.frameHeight, fh)
      assert.deepEqual(parsed.hitbox, hitbox)
      assert.equal(parsed.objPalette, seed % 8)
      assert.equal(parsed.frames.length, sheet.frames.length)

      sheet.frames.forEach((frame, i) => {
        assert.deepEqual(parsed.frames[i].pivot, frame.pivot, `frame ${i} pivô`)
        assert.equal(parsed.frames[i].pieces.length, frame.pieces.length, `frame ${i} nº de peças`)
        frame.pieces.forEach((piece, k) => {
          assert.deepEqual(
            parsed.frames[i].pieces[k],
            { dx: piece.dx, dy: piece.dy, tile: piece.tile, size: piece.size, flipH: piece.flipH, flipV: piece.flipV },
            `frame ${i} peça ${k}`,
          )
        })
      })
    }
  }
})

test('parseMetaspriteHeader: quadro totalmente vazio (sem nenhuma peça) recupera objPalette 0 e não quebra', () => {
  const sheet = buildMetasprites(blank(32, 32), 32, 32, { frameWidth: 32, frameHeight: 32 })
  const header = generateMetaspriteHeader(sheet, 'demo', 'demo.png', 'demo_tiles.bmp', { width: 10, height: 10 })
  const parsed = parseMetaspriteHeader('demo', header)
  assert.equal(parsed.objPalette, 0)
  assert.equal(parsed.frames.length, 1)
  assert.deepEqual(parsed.frames[0].pieces, [])
})

test('parseMetaspriteHeader: header antigo sem _HITBOX_W/H (de antes da hitbox existir) tem hitbox null, sem lançar', () => {
  const sheet = buildMetasprites(randomSheet(64, 32, 99, 0.8), 64, 32, { frameWidth: 32, frameHeight: 32 })
  const header = generateMetaspriteHeader(sheet, 'demo', 'demo.png', 'demo_tiles.bmp', { width: 10, height: 10 })
  const legacyHeader = header
    .replace(/^#define DEMO_HITBOX_W .*$/m, '')
    .replace(/^#define DEMO_HITBOX_H .*$/m, '')
  assert.doesNotMatch(legacyHeader, /#define \w+_HITBOX_[WH]/)

  const parsed = parseMetaspriteHeader('demo', legacyHeader)
  assert.equal(parsed.hitbox, null)
  assert.equal(parsed.frameWidth, 32)
  assert.equal(parsed.frames.length, sheet.frames.length)
})

test('parseMetaspriteHeader: erro em português quando falta um #define ou a tabela de quadros', () => {
  assert.throws(() => parseMetaspriteHeader('demo', ''), /DEMO_FRAME_WIDTH/)
  assert.throws(
    () => parseMetaspriteHeader('demo', '#define DEMO_FRAME_WIDTH 16\n#define DEMO_FRAME_HEIGHT 32\n#define DEMO_HITBOX_W 8\n#define DEMO_HITBOX_H 20\n#define DEMO_FRAME_COUNT 1\n'),
    /demo_frames/,
  )
})

// ---------- parseAnimationHeader: inverso de generateAnimationHeader ----------

test('parseAnimationHeader: round-trip com generateAnimationHeader (nomes, sequência e duração)', () => {
  const animations = [
    { name: 'idle', frameIndices: [0], frameDuration: 30 },
    { name: 'walk', frameIndices: [1, 2, 3, 2], frameDuration: 8 },
    { name: 'fall', frameIndices: [5], frameDuration: 12 },
  ]
  const header = generateAnimationHeader('demo', 'demo.png', 16, 32, animations)
  const parsed = parseAnimationHeader('demo', header)
  assert.equal(parsed.frameWidth, 16)
  assert.equal(parsed.frameHeight, 32)
  assert.deepEqual(parsed.animations, animations)
})

test('parseAnimationHeader: sem animações dá lista vazia, sem quebrar', () => {
  const header = generateAnimationHeader('demo', 'demo.png', 32, 32, [])
  assert.deepEqual(parseAnimationHeader('demo', header), { frameWidth: 32, frameHeight: 32, animations: [] })
})

// ---------- reconstrução pixel a pixel: export real -> decode -> reconstruct ----------

test('reconstrução completa (export real -> bmp/header -> reconstructFramePixels) reproduz cada quadro pixel a pixel', async () => {
  for (const [fw, fh] of [[32, 32], [16, 32], [24, 40], [8, 64]] as const) {
    for (const seed of [11, 12, 13]) {
      for (const dedupe of [false, true]) {
        const sheetWidth = fw * 3
        const sheetHeight = fh * 2
        const px = randomSheet(sheetWidth, sheetHeight, seed * 7 + fw + fh, 0.85)
        const sheet = buildMetasprites(px, sheetWidth, sheetHeight, { frameWidth: fw, frameHeight: fh, dedupe })

        const palette = randomPalette(seed)
        const bmpBytes = new Uint8Array(
          await encodeIndexedBmp(sheet.tileSheet.width, sheet.tileSheet.height, sheet.tileSheet.indices, palette).arrayBuffer(),
        )
        const header = generateMetaspriteHeader(sheet, 'demo', 'demo.png', 'demo_tiles.bmp', { width: 1, height: 1 })

        const decodedTiles = decodeIndexedBmp(bmpBytes)
        const parsed = parseMetaspriteHeader('demo', header)

        parsed.frames.forEach((frame, i) => {
          const reconstructed = reconstructFramePixels(frame, decodedTiles, fw, fh)
          const expected = sourceFrame(px, sheetWidth, fw, fh, i)
          assert.deepEqual(
            [...reconstructed],
            [...expected],
            `${fw}x${fh} seed ${seed} dedupe ${dedupe} frame ${i}`,
          )
        })
      }
    }
  }
})

// ---------- reconstructThumbnail: miniatura (só quadro 0) pra galeria ----------

test('reconstructThumbnail: quadro 0 bate pixel a pixel com o export real, com largura/altura/paleta corretas', async () => {
  for (const [fw, fh] of [[32, 32], [16, 32]] as const) {
    const sheetWidth = fw * 3
    const sheetHeight = fh * 2
    const px = randomSheet(sheetWidth, sheetHeight, fw * 3 + fh, 0.85)
    const sheet = buildMetasprites(px, sheetWidth, sheetHeight, { frameWidth: fw, frameHeight: fh })
    const palette = randomPalette(fw + fh)
    const bmpBytes = new Uint8Array(
      await encodeIndexedBmp(sheet.tileSheet.width, sheet.tileSheet.height, sheet.tileSheet.indices, palette).arrayBuffer(),
    )
    const header = generateMetaspriteHeader(sheet, 'demo', 'demo.png', 'demo_tiles.bmp', { width: 1, height: 1 })

    const thumb = reconstructThumbnail(bmpBytes, header, 'demo')
    assert.equal(thumb.width, fw)
    assert.equal(thumb.height, fh)
    assert.deepEqual([...thumb.pixels], [...sourceFrame(px, sheetWidth, fw, fh, 0)])
    for (let i = 0; i < palette.length; i++) assert.deepEqual(thumb.palette[i], palette[i])
  }
})

test('reconstructThumbnail: header sem nenhum quadro (FRAME_COUNT 0) lança erro em português citando o nome', async () => {
  const bmpBytes = new Uint8Array(await encodeIndexedBmp(1, 1, new Uint8Array([0]), [[0, 0, 0]]).arrayBuffer())
  const header = [
    '#define DEMO_FRAME_WIDTH 16',
    '#define DEMO_FRAME_HEIGHT 16',
    '#define DEMO_HITBOX_W 8',
    '#define DEMO_HITBOX_H 16',
    '#define DEMO_FRAME_COUNT 0',
    'static const metaframe_t demo_frames[DEMO_FRAME_COUNT] = {',
    '',
    '};',
    '',
  ].join('\n')
  assert.throws(() => reconstructThumbnail(bmpBytes, header, 'demo'), /"demo".*nenhum quadro/)
})

test('reconstructThumbnail: header corrompido/formato inesperado propaga o erro em vez de devolver lixo', async () => {
  const bmpBytes = new Uint8Array(await encodeIndexedBmp(1, 1, new Uint8Array([0]), [[0, 0, 0]]).arrayBuffer())
  assert.throws(() => reconstructThumbnail(bmpBytes, 'isso não é um header de verdade', 'demo'), /DEMO_FRAME_WIDTH/)
})

// ---------- reconstructFrameAt: quadro ESPECÍFICO por índice (decor1, docs/DATA_FORMAT.md § 3) ----------

test('reconstructFrameAt: cada índice pedido bate pixel a pixel com o quadro correspondente do export real', async () => {
  const fw = 16
  const fh = 32
  const sheetWidth = fw * 3
  const sheetHeight = fh * 2
  const px = randomSheet(sheetWidth, sheetHeight, fw * 5 + fh, 0.85)
  const sheet = buildMetasprites(px, sheetWidth, sheetHeight, { frameWidth: fw, frameHeight: fh })
  const palette = randomPalette(fw + fh)
  const bmpBytes = new Uint8Array(
    await encodeIndexedBmp(sheet.tileSheet.width, sheet.tileSheet.height, sheet.tileSheet.indices, palette).arrayBuffer(),
  )
  const header = generateMetaspriteHeader(sheet, 'demo', 'demo.png', 'demo_tiles.bmp', { width: 1, height: 1 })

  for (let frameIndex = 0; frameIndex < sheet.frames.length; frameIndex++) {
    const thumb = reconstructFrameAt(bmpBytes, header, 'demo', frameIndex)
    assert.deepEqual([...thumb.pixels], [...sourceFrame(px, sheetWidth, fw, fh, frameIndex)], `quadro ${frameIndex}`)
  }
})

test('reconstructFrameAt: índice fora do intervalo (sheet reimportado com menos quadros) cai pro quadro 0 em vez de lançar', async () => {
  const fw = 16
  const fh = 32
  const sheetWidth = fw * 3
  const sheetHeight = fh * 2
  const px = randomSheet(sheetWidth, sheetHeight, 99, 0.85)
  const sheet = buildMetasprites(px, sheetWidth, sheetHeight, { frameWidth: fw, frameHeight: fh })
  const palette = randomPalette(fw + fh)
  const bmpBytes = new Uint8Array(
    await encodeIndexedBmp(sheet.tileSheet.width, sheet.tileSheet.height, sheet.tileSheet.indices, palette).arrayBuffer(),
  )
  const header = generateMetaspriteHeader(sheet, 'demo', 'demo.png', 'demo_tiles.bmp', { width: 1, height: 1 })

  const thumb = reconstructFrameAt(bmpBytes, header, 'demo', 999)
  assert.deepEqual([...thumb.pixels], [...sourceFrame(px, sheetWidth, fw, fh, 0)])
})

test('buildSyntheticSheet: 1 linha, ordem de índice preservada, cada quadro no lugar certo', () => {
  const frameA = new Uint8Array([1, 1, 1, 1]) // 2x2
  const frameB = new Uint8Array([2, 2, 2, 2])
  const frameC = new Uint8Array([3, 3, 3, 3])
  const sheet = buildSyntheticSheet([frameA, frameB, frameC], 2, 2)
  assert.deepEqual({ width: sheet.width, height: sheet.height, cols: sheet.cols, rows: sheet.rows }, { width: 6, height: 2, cols: 3, rows: 1 })
  // linha 0: [1,1,2,2,3,3] / linha 1: [1,1,2,2,3,3]
  assert.deepEqual([...sheet.indices], [1, 1, 2, 2, 3, 3, 1, 1, 2, 2, 3, 3])
})

test('sheet sintético de 1 quadro só não quebra (mínimo 1 coluna)', () => {
  const sheet = buildSyntheticSheet([new Uint8Array(4)], 2, 2)
  assert.deepEqual({ width: sheet.width, height: sheet.height, cols: sheet.cols }, { width: 2, height: 2, cols: 1 })
})
