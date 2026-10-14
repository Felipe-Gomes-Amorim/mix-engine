import assert from 'node:assert/strict'
import { test } from 'node:test'
import { encodeIndexedBmp, extractPalette } from '../src/lib/indexedBmp.ts'
import { autoPivot, buildMetasprites, clampPivot } from '../src/lib/metasprite/builder.ts'
import { composeFrame, mirrorDx } from '../src/lib/metasprite/compose.ts'
import { generateMetaspriteHeader, pieceFlags } from '../src/lib/metasprite/exportHeader.ts'
import { MIN_CLIP_CONTACT, findClippedEdges, sliceFrame } from '../src/lib/metasprite/slicer.ts'
import { SLIVER_LIMIT, frameStats } from '../src/lib/metasprite/stats.ts'
import {
  FRAME_DIMENSIONS,
  FRAME_PRESETS,
  isValidFrameDimension,
  type Frame,
  type Pivot,
} from '../src/lib/metasprite/types.ts'
import { SYNTH16_SHEET_HEIGHT, SYNTH16_SHEET_ROWS, SYNTH16_SHEET_WIDTH } from './fixtures/syntheticSheet16x32.ts'
import { SYNTH32_SHEET_HEIGHT, SYNTH32_SHEET_ROWS, SYNTH32_SHEET_WIDTH } from './fixtures/syntheticSheet32.ts'

// ---------- helpers ----------

function blank(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height)
}

function fillRect(px: Uint8Array, width: number, x: number, y: number, w: number, h: number, v = 1) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px[j * width + i] = v
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

/** Sheet aleatório: blobs ocupando quadrantes variados + ruído, pra estressar o fatiador. */
function randomSheet(width: number, height: number, seed: number, density: number): Uint8Array {
  const rand = mulberry32(seed)
  const px = blank(width, height)
  for (let i = 0; i < (width * height) / 40; i++) {
    const w = 1 + Math.floor(rand() * 12)
    const h = 1 + Math.floor(rand() * 12)
    if (rand() > density) continue
    if (w >= width || h >= height) continue
    fillRect(
      px,
      width,
      Math.floor(rand() * (width - w)),
      Math.floor(rand() * (height - h)),
      w,
      h,
      1 + Math.floor(rand() * 15),
    )
  }
  return px
}

function sheetFromRows(rows: string[]): Uint8Array {
  const width = rows[0].length
  const px = new Uint8Array(width * rows.length)
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) px[y * width + x] = parseInt(row[x], 16)
  })
  return px
}

/** Recorta o frame `index` do sheet (referência "original" pra comparar). */
function sourceFrame(
  px: Uint8Array,
  sheetW: number,
  frameW: number,
  frameH: number,
  index: number,
): Uint8Array {
  const cols = sheetW / frameW
  const ox = (index % cols) * frameW
  const oy = Math.floor(index / cols) * frameH
  const out = new Uint8Array(frameW * frameH)
  for (let y = 0; y < frameH; y++) {
    for (let x = 0; x < frameW; x++) out[y * frameW + x] = px[(oy + y) * sheetW + ox + x]
  }
  return out
}

interface Composed {
  width: number
  originX: number
  originY: number
  pixels: Uint8Array
}

/** Pixel do frame composto na coordenada local do frame (x, y), levando o pivô em conta. */
function composedAt(composed: Composed, pivot: Pivot, x: number, y: number): number {
  const bx = composed.originX - pivot.x + x
  const by = composed.originY - pivot.y + y
  return composed.pixels[by * composed.width + bx]
}

function assertFrameReproduced(
  frame: Frame,
  sheet: ReturnType<typeof buildMetasprites>,
  source: Uint8Array,
  label: string,
) {
  const composed = composeFrame(frame, sheet.tileSheet, sheet.frameWidth, sheet.frameHeight)
  for (let y = 0; y < sheet.frameHeight; y++) {
    for (let x = 0; x < sheet.frameWidth; x++) {
      assert.equal(
        composedAt(composed, frame.pivot, x, y),
        source[y * sheet.frameWidth + x],
        `${label}: pixel (${x},${y}) difere`,
      )
    }
  }
}

/** Espelhar via fórmula = espelho do frame original em torno do pivô (pixel a pixel). */
function assertMirrorReproduced(
  frame: Frame,
  sheet: ReturnType<typeof buildMetasprites>,
  source: Uint8Array,
  label: string,
) {
  const mirrored = composeFrame(frame, sheet.tileSheet, sheet.frameWidth, sheet.frameHeight, true)
  for (let y = 0; y < sheet.frameHeight; y++) {
    for (let x = 0; x < sheet.frameWidth; x++) {
      const mx = 2 * frame.pivot.x - 1 - x // pixel x espelhado em torno de pivot.x
      assert.equal(
        composedAt(mirrored, frame.pivot, mx, y),
        source[y * sheet.frameWidth + x],
        `${label}: (${x},${y}) -> (${mx},${y})`,
      )
    }
  }
}

function parseBmp(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const offset = view.getUint32(10, true)
  const width = view.getInt32(18, true)
  const height = view.getInt32(22, true)
  const stride = Math.ceil(width / 4) * 4
  const indices = new Uint8Array(width * height)
  for (let row = 0; row < height; row++) {
    for (let x = 0; x < width; x++) {
      indices[(height - 1 - row) * width + x] = bytes[offset + row * stride + x]
    }
  }
  return { width, height, indices, bitCount: view.getUint16(28, true) }
}

// ---------- dimensões de frame ----------

test('dimensões de frame: múltiplos de 8 entre 8 e 64; presets válidos e com 16x32', () => {
  assert.deepEqual([...FRAME_DIMENSIONS], [8, 16, 24, 32, 40, 48, 56, 64])
  for (const n of FRAME_DIMENSIONS) assert.ok(isValidFrameDimension(n))
  for (const n of [0, 4, 12, 20, 65, 72, -8, 16.5]) assert.ok(!isValidFrameDimension(n), `${n}`)
  for (const preset of FRAME_PRESETS) {
    assert.ok(isValidFrameDimension(preset.width) && isValidFrameDimension(preset.height))
  }
  assert.ok(FRAME_PRESETS.some((p) => p.width === 16 && p.height === 32))
  assert.deepEqual(
    FRAME_PRESETS.map((p) => `${p.width}x${p.height}`),
    ['16x16', '16x32', '32x32', '32x48', '48x48', '64x64'],
  )
})

// ---------- fatiador ----------

test('bloco totalmente transparente não gera peça', () => {
  const px = blank(32, 32)
  fillRect(px, 32, 20, 20, 3, 3) // só no bloco (1,1)
  const pieces = sliceFrame(px, 32, 0, 0, 32, 32)
  assert.equal(pieces.length, 1)
  assert.deepEqual(sliceFrame(blank(32, 32), 32, 0, 0, 32, 32), [])
})

test('bloco com 1 quadrante vira peça 8x8 (ponta de braço de 2px)', () => {
  const px = blank(32, 32)
  fillRect(px, 32, 18, 1, 2, 2) // bloco (16,0), quadrante superior esquerdo
  assert.deepEqual(sliceFrame(px, 32, 0, 0, 32, 32), [{ srcX: 16, srcY: 0, size: 8 }])

  const px2 = blank(32, 32)
  px2[(8 + 3) * 32 + 8 + 3] = 5 // quadrante inferior direito do bloco (0,0)
  assert.deepEqual(sliceFrame(px2, 32, 0, 0, 32, 32), [{ srcX: 8, srcY: 8, size: 8 }])
})

test('bloco cheio vira uma peça 16x16', () => {
  const px = blank(32, 32)
  fillRect(px, 32, 0, 0, 16, 16)
  assert.deepEqual(sliceFrame(px, 32, 0, 0, 32, 32), [{ srcX: 0, srcY: 0, size: 16 }])
})

test('limiar de quadrantes é configurável', () => {
  const px = blank(16, 16)
  px[0] = 1 // quadrante TL
  px[15 * 16 + 15] = 1 // quadrante BR
  const two = { quadrantThreshold: 2 }
  assert.deepEqual(sliceFrame(px, 16, 0, 0, 16, 16), [{ srcX: 0, srcY: 0, size: 16 }]) // padrão: 2 quadrantes -> 16x16
  assert.deepEqual(sliceFrame(px, 16, 0, 0, 16, 16, two), [
    { srcX: 0, srcY: 0, size: 8 },
    { srcX: 8, srcY: 8, size: 8 },
  ])
  assert.deepEqual(sliceFrame(px, 16, 0, 0, 16, 16, { quadrantThreshold: 0 }), [
    { srcX: 0, srcY: 0, size: 16 },
  ])
  const full = blank(16, 16)
  fillRect(full, 16, 0, 0, 16, 16)
  assert.equal(sliceFrame(full, 16, 0, 0, 16, 16, { quadrantThreshold: 4 }).length, 4)
})

test('fatia relativo à origem do frame dentro do sheet e rejeita dimensões não múltiplas de 8', () => {
  const px = blank(64, 32)
  fillRect(px, 64, 40, 2, 16, 16) // frame 1 (origem x=32), não alinhado -> vários blocos
  const pieces = sliceFrame(px, 64, 32, 0, 32, 32)
  assert.ok(pieces.length > 0)
  assert.ok(pieces.every((p) => p.srcX >= 0 && p.srcX < 32 && p.srcY >= 0 && p.srcY < 32))
  assert.throws(() => sliceFrame(px, 64, 0, 0, 20, 32))
  assert.throws(() => sliceFrame(px, 64, 0, 0, 16, 12))
})

test('frame 16x32: dois blocos 16x16 empilhados, bloco vazio é descartado', () => {
  const px = blank(16, 32)
  fillRect(px, 16, 0, 0, 16, 32) // cheio: 2 blocos 16x16
  assert.deepEqual(sliceFrame(px, 16, 0, 0, 16, 32), [
    { srcX: 0, srcY: 0, size: 16 },
    { srcX: 0, srcY: 16, size: 16 },
  ])

  const lower = blank(16, 32)
  fillRect(lower, 16, 2, 20, 12, 8) // só na célula de baixo, 2 quadrantes ocupados... (linhas 20..27)
  assert.deepEqual(sliceFrame(lower, 16, 0, 0, 16, 32), [{ srcX: 0, srcY: 16, size: 16 }])

  const arm = blank(16, 32)
  arm[5 * 16 + 14] = 3 // 1 pixel na célula de cima, quadrante TR
  assert.deepEqual(sliceFrame(arm, 16, 0, 0, 16, 32), [{ srcX: 8, srcY: 0, size: 8 }])
})

test('frames retangulares num sheet: origem por coluna/linha usa largura E altura', () => {
  // sheet 32x64 com frames 16x32 (2 colunas x 2 linhas): pixel só no frame 3 (col 1, linha 1)
  const px = blank(32, 64)
  fillRect(px, 32, 16 + 1, 32 + 20, 4, 4)
  const sheet = buildMetasprites(px, 32, 64, { frameWidth: 16, frameHeight: 32 })
  assert.equal(sheet.cols, 2)
  assert.equal(sheet.rows, 2)
  assert.deepEqual(
    sheet.frames.map((f) => [f.col, f.row, f.pieces.length]),
    [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 1]],
  )
  assert.deepEqual([sheet.frames[3].pieces[0].srcX, sheet.frames[3].pieces[0].srcY], [0, 16])
  assert.throws(() => buildMetasprites(px, 32, 64, { frameWidth: 24, frameHeight: 32 }))
  assert.throws(() => buildMetasprites(px, 32, 64, { frameWidth: 16, frameHeight: 48 }))
})

test('frames de 24 (não múltiplo de 16): faixa de 8px vira só peças 8x8 e nada invade o vizinho', () => {
  const full = blank(24, 24)
  fillRect(full, 24, 0, 0, 24, 24)
  const pieces = sliceFrame(full, 24, 0, 0, 24, 24)
  assert.deepEqual(pieces, [
    { srcX: 0, srcY: 0, size: 16 },
    { srcX: 16, srcY: 0, size: 8 },
    { srcX: 16, srcY: 8, size: 8 },
    { srcX: 0, srcY: 16, size: 8 },
    { srcX: 8, srcY: 16, size: 8 },
    { srcX: 16, srcY: 16, size: 8 },
  ])
  assert.ok(pieces.every((p) => p.srcX + p.size <= 24 && p.srcY + p.size <= 24))
})

// ---------- pivô ----------

test('pivô padrão = (largura/2, altura): (8,32) no 16x32; dx/dy relativos ao pivô', () => {
  assert.deepEqual(autoPivot(16, 32), { x: 8, y: 32 })
  for (const p of FRAME_PRESETS) assert.deepEqual(autoPivot(p.width, p.height), { x: p.width / 2, y: p.height })

  const px = blank(32, 32)
  fillRect(px, 32, 0, 16, 16, 16) // bloco 16x16 nos "pés" (canto inf. esquerdo)
  const sheet = buildMetasprites(px, 32, 32, { frameWidth: 32, frameHeight: 32 })
  const piece = sheet.frames[0].pieces[0]
  assert.deepEqual(sheet.frames[0].pivot, { x: 16, y: 32 })
  assert.deepEqual([piece.srcX, piece.srcY, piece.size], [0, 16, 16])
  assert.equal(piece.dx, 0 - 16)
  assert.equal(piece.dy, 16 - 32)

  const tall = blank(16, 32)
  fillRect(tall, 16, 0, 16, 16, 16)
  const tallSheet = buildMetasprites(tall, 16, 32, { frameWidth: 16, frameHeight: 32 })
  assert.deepEqual(tallSheet.frames[0].pivot, { x: 8, y: 32 })
  assert.equal(tallSheet.frames[0].pieces[0].dx, 0 - 8)
  assert.equal(tallSheet.frames[0].pieces[0].dy, 16 - 32)
})

test('pivô por frame sobrepõe o padrão do sheet; valores são limitados por eixo (largura x altura)', () => {
  const px = blank(64, 32)
  fillRect(px, 64, 0, 0, 16, 16)
  fillRect(px, 64, 32, 0, 16, 16)
  const sheet = buildMetasprites(px, 64, 32, {
    frameWidth: 32,
    frameHeight: 32,
    defaultPivot: { x: 4, y: 30 },
    pivotOverrides: { 1: { x: 10, y: 20 } },
  })
  assert.deepEqual(sheet.frames[0].pivot, { x: 4, y: 30 })
  assert.deepEqual(sheet.frames[1].pivot, { x: 10, y: 20 })
  assert.equal(sheet.frames[0].pieces[0].dx, 0 - 4)
  assert.equal(sheet.frames[1].pieces[0].dx, 0 - 10)
  assert.equal(sheet.frames[1].pieces[0].dy, 0 - 20)
  assert.deepEqual(clampPivot({ x: -5, y: 99 }, 32, 32), { x: 0, y: 32 })
  // retângulo 16x32: x vai até 16, y vai até 32 (eixos independentes)
  assert.deepEqual(clampPivot({ x: 30, y: 99 }, 16, 32), { x: 16, y: 32 })
  assert.deepEqual(clampPivot({ x: 30, y: 99 }, 32, 16), { x: 30, y: 16 })
  assert.deepEqual(clampPivot({ x: 7.6, y: 12.4 }, 16, 32), { x: 8, y: 12 })
})

test('dx/dy cabem em int8 mesmo com pivô nos extremos (64x64, 16x64 e 64x16)', () => {
  for (const [fw, fh] of [[64, 64], [16, 64], [64, 16]] as const) {
    const px = randomSheet(fw, fh, 7, 1)
    for (const pivot of [{ x: 0, y: 0 }, { x: fw, y: fh }, { x: 0, y: fh }, { x: fw, y: 0 }]) {
      const sheet = buildMetasprites(px, fw, fh, { frameWidth: fw, frameHeight: fh, defaultPivot: pivot })
      for (const piece of sheet.frames[0].pieces) {
        assert.ok(piece.dx >= -128 && piece.dx <= 127 && piece.dy >= -128 && piece.dy <= 127)
        assert.ok(-(piece.dx + piece.size) >= -128 && -(piece.dx + piece.size) <= 127) // espelhado também
      }
    }
  }
})

// ---------- layout de tiles ----------

test('layout de tiles: 16x16 em coluna/linha pares, 8x8 em células próprias, sem sobreposição', () => {
  for (const dedupe of [false, true]) {
    const px = randomSheet(96, 64, 3, 0.9)
    const sheet = buildMetasprites(px, 96, 64, { frameWidth: 32, frameHeight: 32, dedupe })
    const owner = new Map<number, string>()
    for (const frame of sheet.frames) {
      for (const piece of frame.pieces) {
        const col = piece.tile % 16
        const row = Math.floor(piece.tile / 16)
        const span = piece.size / 8
        if (piece.size === 16) {
          assert.equal(col % 2, 0, 'coluna par')
          assert.equal(row % 2, 0, 'linha par')
        }
        const id = `${piece.tile}:${piece.size}`
        for (let r = row; r < row + span; r++) {
          for (let c = col; c < col + span; c++) {
            const cell = r * 16 + c
            const prev = owner.get(cell)
            assert.ok(prev === undefined || prev === id, `célula ${cell} usada por ${prev} e ${id}`)
            owner.set(cell, id)
            assert.ok(r < sheet.tileSheet.tileRows)
          }
        }
      }
    }
    assert.equal(sheet.tileSheet.width, 128)
    assert.equal(sheet.tileSheet.height, sheet.tileSheet.tileRows * 8)
  }
})

test('dedup: frame repetido e frame espelhado reutilizam tiles (com flip) e continuam exatos', () => {
  for (const [fw, fh] of [[32, 32], [16, 32]] as const) {
    const frame = randomSheet(fw, fh, 11, 1)
    const width = fw * 4 // 4 frames: original, cópia, espelhado H, espelhado V
    const px = blank(width, fh)
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const v = frame[y * fw + x]
        px[y * width + x] = v
        px[y * width + fw + x] = v
        px[y * width + 2 * fw + x] = frame[y * fw + (fw - 1 - x)]
        px[y * width + 3 * fw + x] = frame[(fh - 1 - y) * fw + x]
      }
    }
    const dedup = buildMetasprites(px, width, fh, { frameWidth: fw, frameHeight: fh, dedupe: true })
    const plain = buildMetasprites(px, width, fh, { frameWidth: fw, frameHeight: fh, dedupe: false })
    const single = buildMetasprites(frame, fw, fh, { frameWidth: fw, frameHeight: fh, dedupe: true })
    assert.ok(dedup.uniqueShapes < plain.uniqueShapes)
    assert.ok(dedup.tilesUsed <= single.tilesUsed, `${fw}x${fh}: as 4 versões cabem nos tiles de uma só`)
    assert.ok(dedup.frames[2].pieces.some((p) => p.flipH), 'o frame espelhado H usa flip H')
    assert.ok(dedup.frames[3].pieces.some((p) => p.flipV), 'o frame espelhado V usa flip V')
    for (const sheet of [dedup, plain]) {
      sheet.frames.forEach((f) =>
        assertFrameReproduced(f, sheet, sourceFrame(px, width, fw, fh, f.index), `${fw}x${fh} frame ${f.index}`),
      )
    }
  }
})

// ---------- recomposição pixel a pixel + flip ----------

test('recompor as peças reproduz cada frame pixel a pixel (retângulos, limiares e dedup)', () => {
  const dims: Array<[number, number]> = [
    [8, 8], [16, 16], [16, 32], [32, 16], [24, 24], [40, 24], [32, 48], [48, 48], [64, 64], [8, 64], [64, 8],
  ]
  for (const [frameWidth, frameHeight] of dims) {
    const width = frameWidth * 2
    for (const seed of [1, 2, 3]) {
      const px = randomSheet(width, frameHeight, seed * 100 + frameWidth + frameHeight, 0.8)
      for (const quadrantThreshold of [0, 1, 2, 4]) {
        for (const dedupe of [false, true]) {
          const sheet = buildMetasprites(px, width, frameHeight, {
            frameWidth,
            frameHeight,
            slice: { quadrantThreshold },
            dedupe,
          })
          sheet.frames.forEach((f) =>
            assertFrameReproduced(
              f,
              sheet,
              sourceFrame(px, width, frameWidth, frameHeight, f.index),
              `${frameWidth}x${frameHeight} seed ${seed} thr ${quadrantThreshold} dedupe ${dedupe} frame ${f.index}`,
            ),
          )
        }
      }
    }
  }
})

test('espelhar via -(dx + tamanho) + flip H reproduz o frame espelhado em torno do pivô (32x32 e 16x32)', () => {
  assert.equal(mirrorDx(-8, 16), -8)
  assert.equal(mirrorDx(-16, 16), 0)
  assert.equal(mirrorDx(3, 8), -11)
  const cases: Array<[number, number, Pivot]> = [
    [32, 32, { x: 13, y: 30 }],
    [16, 32, { x: 5, y: 31 }],
    [16, 32, { x: 8, y: 32 }],
    [48, 24, { x: 20, y: 24 }],
  ]
  for (const [fw, fh, pivot] of cases) {
    for (const dedupe of [false, true]) {
      const px = randomSheet(fw * 2, fh, 21 + fw, 0.9)
      const sheet = buildMetasprites(px, fw * 2, fh, {
        frameWidth: fw,
        frameHeight: fh,
        dedupe,
        defaultPivot: pivot,
      })
      for (const frame of sheet.frames) {
        assertMirrorReproduced(frame, sheet, sourceFrame(px, fw * 2, fw, fh, frame.index), `${fw}x${fh} frame ${frame.index}`)
      }
    }
  }
})

// ---------- estatísticas e avisos ----------

test('estatísticas por frame: peças, tiles 8x8 e fatias por scanline', () => {
  const px = blank(64, 32)
  fillRect(px, 64, 0, 0, 32, 16) // 2 blocos 16x16 lado a lado
  px[20 * 64 + 40] = 1 // 1 quadrante -> 8x8, no frame 1
  const sheet = buildMetasprites(px, 64, 32, { frameWidth: 32, frameHeight: 32 })
  const s0 = frameStats(sheet.frames[0], 32)
  assert.deepEqual(
    { p: s0.pieceCount, t: s0.tiles8x8, m: s0.maxSliversPerScanline, over: s0.overSliverLimit },
    { p: 2, t: 8, m: 4, over: false },
  )
  const s1 = frameStats(sheet.frames[1], 32)
  assert.deepEqual([s1.pieceCount, s1.tiles8x8, s1.maxSliversPerScanline], [1, 1, 1])
})

test('fatias por scanline usam a altura: frame 16x32 com duas células empilhadas dá 2 fatias/linha', () => {
  const px = blank(16, 32)
  fillRect(px, 16, 0, 0, 16, 32)
  const sheet = buildMetasprites(px, 16, 32, { frameWidth: 16, frameHeight: 32 })
  const stats = frameStats(sheet.frames[0], 32)
  assert.deepEqual(
    [stats.pieceCount, stats.tiles8x8, stats.maxSliversPerScanline, stats.overSliverLimit],
    [2, 8, 2, false], // empilhados: cada scanline cruza só UMA peça (2 fatias), nunca 4
  )
  // frame alto (16x64): peça na última linha de blocos é contada nas linhas 48..63 (array tem 64 posições)
  const tall = blank(16, 64)
  fillRect(tall, 16, 0, 48, 16, 16)
  const tallSheet = buildMetasprites(tall, 16, 64, { frameWidth: 16, frameHeight: 64 })
  assert.equal(frameStats(tallSheet.frames[0], 64).maxSliversPerScanline, 2)
})

test('avisa quando passa de 34 fatias de 8px na mesma scanline', () => {
  const pieces = Array.from({ length: 18 }, (_, i) => ({
    srcX: (i % 4) * 16,
    srcY: 0,
    size: 16 as const,
    dx: 0,
    dy: 0,
    tile: 0,
    flipH: false,
    flipV: false,
    palette: 0,
  }))
  const stats = frameStats({ index: 0, col: 0, row: 0, pivot: { x: 0, y: 0 }, pieces }, 64)
  assert.equal(stats.maxSliversPerScanline, 36) // 18 peças 16x16 sobrepostas * 2 fatias
  assert.ok(stats.maxSliversPerScanline > SLIVER_LIMIT)
  assert.equal(stats.overSliverLimit, true)
})

test('detecta pixels que vazam do frame para a célula vizinha (largura e altura separadas)', () => {
  const px = blank(64, 32)
  fillRect(px, 64, 20, 10, 24, 4) // atravessa a borda x=32 entre os frames 0 e 1 (4 linhas de contato)
  assert.deepEqual(findClippedEdges(px, 64, 32, 0, 0, 32, 32), ['right'])
  assert.deepEqual(findClippedEdges(px, 64, 32, 32, 0, 32, 32), ['left'])
  const inside = blank(64, 32)
  fillRect(inside, 64, 5, 5, 10, 10)
  assert.deepEqual(findClippedEdges(inside, 64, 32, 0, 0, 32, 32), [])
  // encostar na borda do frame sem continuar na vizinha não é vazamento
  const touching = blank(64, 32)
  fillRect(touching, 64, 22, 10, 10, 4) // termina em x=31
  assert.deepEqual(findClippedEdges(touching, 64, 32, 0, 0, 32, 32), [])

  // frames 16x32 lado a lado (sheet 32x32): corpo cruza x=16
  const wide = blank(32, 32)
  fillRect(wide, 32, 10, 8, 12, 12)
  assert.deepEqual(findClippedEdges(wide, 32, 32, 0, 0, 16, 32), ['right'])
  assert.deepEqual(findClippedEdges(wide, 32, 32, 16, 0, 16, 32), ['left'])

  // frames 16x32 empilhados (sheet 16x64): corpo cruza y=32 -> só a altura (32) define a borda
  const stacked = blank(16, 64)
  fillRect(stacked, 16, 4, 24, 8, 16)
  assert.deepEqual(findClippedEdges(stacked, 16, 64, 0, 0, 16, 32), ['bottom'])
  assert.deepEqual(findClippedEdges(stacked, 16, 64, 0, 32, 16, 32), ['top'])
  // com frame 16x16 a mesma imagem cruza y=16 e y=48? só y=32 tem conteúdo dos dois lados
  assert.deepEqual(findClippedEdges(stacked, 16, 64, 0, 16, 16, 16), ['bottom'])
})

test('poses vizinhas que só se encostam por poucas linhas não contam como corte', () => {
  assert.equal(MIN_CLIP_CONTACT, 4)
  const px = blank(32, 32)
  fillRect(px, 32, 10, 10, 6, 2) // braço até x=15, 2 linhas...
  fillRect(px, 32, 16, 10, 6, 2) // ...encostando na vizinha em x=16
  assert.deepEqual(findClippedEdges(px, 32, 32, 0, 0, 16, 32), [])
  assert.deepEqual(findClippedEdges(px, 32, 32, 16, 0, 16, 32), [])
  const more = blank(32, 32)
  fillRect(more, 32, 10, 10, 12, MIN_CLIP_CONTACT) // 4 linhas de contato já contam
  assert.deepEqual(findClippedEdges(more, 32, 32, 0, 0, 16, 32), ['right'])
})

// ---------- paleta / transparência ----------

test('cor 0 = transparente: fundo alpha 0 não colide com contorno preto opaco', () => {
  // (0,0,0,0) transparente, (0,0,0,255) preto opaco, (255,0,0,255) vermelho
  const rgba = [0, 0, 0, 0, 0, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0]
  const result = extractPalette(
    { data: new Uint8ClampedArray(rgba), width: 4, height: 1 } as unknown as ImageData,
  )
  assert.ok(result.ok)
  assert.deepEqual([...result.indices], [0, 1, 2, 0])
  assert.deepEqual(result.palette, [[0, 0, 0], [0, 0, 0], [255, 0, 0]])
  assert.equal(result.hasTransparency, true)
})

test('sem transparência a ordem de aparição continua igual; overflow conta a transparente', () => {
  const opaque = [10, 10, 10, 255, 20, 20, 20, 255]
  const a = extractPalette({ data: new Uint8ClampedArray(opaque), width: 2, height: 1 } as unknown as ImageData)
  assert.ok(a.ok)
  assert.deepEqual([...a.indices], [0, 1])
  assert.equal(a.hasTransparency, false)

  const many: number[] = [0, 0, 0, 0] // 1 transparente + 16 opacas = 17
  for (let i = 0; i < 16; i++) many.push(i * 10, 0, 0, 255)
  const b = extractPalette({ data: new Uint8ClampedArray(many), width: 17, height: 1 } as unknown as ImageData)
  assert.ok(!b.ok)
  assert.equal(b.colorCount, 17)
})

// ---------- export ----------

async function checkExportRoundTrip(fw: number, fh: number, seed: number) {
  const px = randomSheet(fw * 3, fh * 2, seed, 0.9)
  const sheet = buildMetasprites(px, fw * 3, fh * 2, {
    frameWidth: fw,
    frameHeight: fh,
    defaultPivot: { x: Math.floor(fw / 2) - 2, y: fh - 1 },
    palette: 2,
  })
  const hitbox = { width: Math.max(1, Math.round(fw * 0.75)), height: fh - 2 }
  const header = generateMetaspriteHeader(sheet, 'demo', 'demo.png', 'demo_tiles.bmp', hitbox)

  // documentação da fórmula no próprio arquivo + macros de dimensão (sem FRAME_SIZE)
  assert.match(header, /dx' = -\(dx \+ tamanho_da_peça\)/)
  assert.match(header, /DEMO_MIRROR_DX\(dx, size\)/)
  assert.ok(header.includes(`#define DEMO_FRAME_WIDTH ${fw}\n`), 'FRAME_WIDTH')
  assert.ok(header.includes(`#define DEMO_FRAME_HEIGHT ${fh}\n`), 'FRAME_HEIGHT')
  assert.ok(header.includes('#define DEMO_FRAME_COUNT 6\n'), 'FRAME_COUNT')
  assert.doesNotMatch(header, /FRAME_SIZE/)
  assert.ok(header.includes(`#define DEMO_HITBOX_W ${hitbox.width} `), 'HITBOX_W')
  assert.ok(header.includes(`#define DEMO_HITBOX_H ${hitbox.height} `), 'HITBOX_H')

  // .bmp de tiles: 8bpp indexado, 128 de largura
  const palette = Array.from({ length: 16 }, (_, i) => [i * 16, i * 16, i * 16] as [number, number, number])
  const bmpBytes = new Uint8Array(
    await encodeIndexedBmp(128, sheet.tileSheet.height, sheet.tileSheet.indices, palette).arrayBuffer(),
  )
  const bmp = parseBmp(bmpBytes)
  assert.equal(bmp.bitCount, 8)
  assert.equal(bmp.width, 128)
  assert.equal(bmp.height % 8, 0)

  // parse do .h
  const frames: Frame[] = []
  const frameRe = /\{ (\d+), (\d+), (\d+), (demo_f(\d+)_pieces|0) \},/g
  const pieceLists = new Map<number, Frame['pieces']>()
  for (const block of header.matchAll(/demo_f(\d+)_pieces\[\] = \{\n([\s\S]*?)\n\};/g)) {
    const list: Frame['pieces'] = []
    for (const m of block[2].matchAll(/\{ (-?\d+), (-?\d+), (\d+), (0x[0-9A-F]{2}), (OBJ_SMALL|OBJ_LARGE) \}/g)) {
      const flags = parseInt(m[4], 16)
      list.push({
        srcX: 0,
        srcY: 0,
        dx: Number(m[1]),
        dy: Number(m[2]),
        tile: Number(m[3]),
        size: m[5] === 'OBJ_LARGE' ? 16 : 8,
        flipH: (flags & 0x40) !== 0,
        flipV: (flags & 0x80) !== 0,
        palette: (flags & 0x0e) >> 1,
      })
    }
    pieceLists.set(Number(block[1]), list)
  }
  let index = 0
  for (const m of header.matchAll(frameRe)) {
    frames.push({
      index,
      col: 0,
      row: 0,
      pivot: { x: Number(m[1]), y: Number(m[2]) },
      pieces: pieceLists.get(index) ?? [],
    })
    assert.equal(Number(m[3]), (pieceLists.get(index) ?? []).length, 'piece_count bate com a lista')
    index++
  }
  assert.equal(frames.length, sheet.frames.length)
  assert.equal(pieceFlags(true, true, 2), 0xc4)

  const parsedTiles = { width: bmp.width, height: bmp.height, indices: bmp.indices, tileRows: bmp.height / 8 }
  for (const frame of frames) {
    const source = sourceFrame(px, fw * 3, fw, fh, frame.index)
    const composed = composeFrame(frame, parsedTiles, fw, fh)
    const mirrored = composeFrame(frame, parsedTiles, fw, fh, true)
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        assert.equal(composedAt(composed, frame.pivot, x, y), source[y * fw + x], `${fw}x${fh} frame ${frame.index}`)
        assert.equal(
          composedAt(mirrored, frame.pivot, 2 * frame.pivot.x - 1 - x, y),
          source[y * fw + x],
          `${fw}x${fh} frame ${frame.index} espelhado`,
        )
      }
    }
  }
}

test('export: recompor a partir do .h + .bmp gerados reproduz o frame (e o espelhado) — 32x32', async () => {
  await checkExportRoundTrip(32, 32, 5)
})

test('export: idem para quadros retangulares (16x32, 32x48) e emite FRAME_WIDTH/FRAME_HEIGHT', async () => {
  await checkExportRoundTrip(16, 32, 6)
  await checkExportRoundTrip(32, 48, 7)
  await checkExportRoundTrip(48, 16, 8)
})

// ---------- sheets sintéticos (sem personagem nenhum, só formas abstratas — ver tests/fixtures/) ----------

test('sheet sintético em frames 32x32: poses completas, peças 8x8 e 16x16, nenhuma vazia, sem cortes', () => {
  const px = sheetFromRows(SYNTH32_SHEET_ROWS)
  assert.equal(px.length, SYNTH32_SHEET_WIDTH * SYNTH32_SHEET_HEIGHT)
  const sheet = buildMetasprites(px, SYNTH32_SHEET_WIDTH, SYNTH32_SHEET_HEIGHT, { frameWidth: 32, frameHeight: 32 })
  assert.equal(sheet.frames.length, 6)

  const sizes = new Set<number>()
  for (const frame of sheet.frames) {
    assert.ok(frame.pieces.length > 0, `frame ${frame.index} tem peças`)
    const src = sourceFrame(px, SYNTH32_SHEET_WIDTH, 32, 32, frame.index)
    for (const piece of frame.pieces) {
      sizes.add(piece.size)
      let opaque = 0
      for (let y = piece.srcY; y < piece.srcY + piece.size; y++) {
        for (let x = piece.srcX; x < piece.srcX + piece.size; x++) if (src[y * 32 + x] !== 0) opaque++
      }
      assert.ok(opaque > 0, `frame ${frame.index}: peça ${piece.srcX},${piece.srcY} vazia`)
    }
    assertFrameReproduced(frame, sheet, src, `synth ${frame.index}`)
    assert.deepEqual(
      findClippedEdges(px, SYNTH32_SHEET_WIDTH, SYNTH32_SHEET_HEIGHT, frame.col * 32, frame.row * 32, 32, 32),
      [],
      `frame ${frame.index} sem cortes`,
    )
    assert.ok(!frameStats(frame, 32).overSliverLimit)
  }
  assert.ok(sizes.has(8) && sizes.has(16), 'usa peças 8x8 e 16x16')
})

test('sheet sintético 64x64 com poses de 16x32: quadro 16x32, pivô (8,32), sem cortes, peças coerentes', () => {
  const px = sheetFromRows(SYNTH16_SHEET_ROWS)
  assert.equal(px.length, SYNTH16_SHEET_WIDTH * SYNTH16_SHEET_HEIGHT)
  assert.deepEqual([SYNTH16_SHEET_WIDTH, SYNTH16_SHEET_HEIGHT], [64, 64])

  const sheet = buildMetasprites(px, 64, 64, { frameWidth: 16, frameHeight: 32 })
  assert.deepEqual([sheet.cols, sheet.rows, sheet.frames.length], [4, 2, 8])

  const withPose = [0, 1, 2, 4, 5, 6] // a 4ª coluna (quadros 3 e 7) está vazia
  const covered = new Set<number>()
  for (const frame of sheet.frames) {
    // ponto de apoio padrão nos pés: (largura/2, altura) = (8, 32)
    assert.deepEqual(frame.pivot, { x: 8, y: 32 }, `quadro ${frame.index}`)

    // nenhuma pose cortada
    assert.deepEqual(
      findClippedEdges(px, 64, 64, frame.col * 16, frame.row * 32, 16, 32),
      [],
      `quadro ${frame.index} sem aviso de corte`,
    )

    const src = sourceFrame(px, 64, 16, 32, frame.index)
    if (withPose.includes(frame.index)) covered.add(frame.index)
    assert.equal(frame.pieces.length > 0, withPose.includes(frame.index), `quadro ${frame.index}: peças só onde há pose`)

    // overlay coerente: peças dentro do quadro, sem sobreposição e nenhuma vazia
    const occupied = new Set<string>()
    for (const piece of frame.pieces) {
      assert.ok(
        piece.srcX >= 0 && piece.srcY >= 0 && piece.srcX + piece.size <= 16 && piece.srcY + piece.size <= 32,
        `quadro ${frame.index}: peça fora do quadro`,
      )
      let opaque = 0
      for (let y = piece.srcY; y < piece.srcY + piece.size; y++) {
        for (let x = piece.srcX; x < piece.srcX + piece.size; x++) {
          assert.ok(!occupied.has(`${x},${y}`), `quadro ${frame.index}: peças se sobrepõem em ${x},${y}`)
          occupied.add(`${x},${y}`)
          if (src[y * 16 + x] !== 0) opaque++
        }
      }
      assert.ok(opaque > 0, `quadro ${frame.index}: peça ${piece.srcX},${piece.srcY} vazia`)
      // dx/dy saem do pivô (8,32)
      assert.equal(piece.dx, piece.srcX - 8)
      assert.equal(piece.dy, piece.srcY - 32)
    }

    assertFrameReproduced(frame, sheet, src, `synth16 ${frame.index}`)
    assertMirrorReproduced(frame, sheet, src, `synth16 ${frame.index}`)
    assert.ok(!frameStats(frame, 32).overSliverLimit)
  }
  assert.equal(covered.size, 6)
  assert.ok(sheet.tilesUsed <= 256)
})

test('sheet sintético 16x32 com quadro pequeno demais (16x16) continua avisando corte', () => {
  const px = sheetFromRows(SYNTH16_SHEET_ROWS)
  const sheet = buildMetasprites(px, 64, 64, { frameWidth: 16, frameHeight: 16 })
  const flagged = sheet.frames.filter(
    (f) => findClippedEdges(px, 64, 64, f.col * 16, f.row * 16, 16, 16).length > 0,
  )
  assert.ok(flagged.length > 0, 'poses de 20px de altura atravessam a borda de quadros de 16px')
})
