import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bandGlobalTileIndex, combineTilesets, findBandLocalIndex, type TilesetUpload } from '../src/lib/tilemap/combineTilesets.ts'
import { tilePixels } from '../src/lib/tilemap/tileset.ts'
import type { RgbColor } from '../src/lib/indexedBmp.ts'

function solidUpload(cols: number, rows: number, blockSize: number, colorValue: number, label: string): TilesetUpload {
  const width = cols * blockSize
  const height = rows * blockSize
  const indices = new Uint8Array(width * height)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const value = colorValue + row * cols + col
      for (let y = 0; y < blockSize; y++) {
        for (let x = 0; x < blockSize; x++) {
          indices[(row * blockSize + y) * width + col * blockSize + x] = value
        }
      }
    }
  }
  const palette: RgbColor[] = Array.from({ length: 16 }, (_, i) => [i, i, i])
  return { width, height, indices, palette, label }
}

test('combineTilesets: 1 tileset só (bankIndex 0) sai idêntico ao original, offset zero', () => {
  const upload = solidUpload(2, 1, 8, 1, 'a.png')
  const { tileset, palette, bands } = combineTilesets([upload], 8)
  assert.equal(tileset.cols, 2)
  assert.equal(tileset.rows, 1)
  assert.equal(tileset.tileCount, 2)
  assert.deepEqual([...tileset.sourceIndices], [...upload.indices])
  assert.equal(bands.length, 1)
  assert.equal(bands[0].bankIndex, 0)
  assert.equal(bands[0].rowOffset, 0)
  assert.deepEqual(palette.slice(0, 16), upload.palette)
})

test('combineTilesets: 2 tilesets empilham verticalmente, cada um desloca pro seu banco (+16, +32...)', () => {
  const a = solidUpload(2, 1, 8, 1, 'a.png') // valores de cor 1,2
  const b = solidUpload(2, 1, 8, 1, 'b.png') // valores de cor 1,2 (mesmos, ANTES do offset)
  const { tileset, palette, bands } = combineTilesets([a, b], 8)

  assert.equal(bands.length, 2)
  assert.equal(bands[0].bankIndex, 0)
  assert.equal(bands[0].rowOffset, 0)
  assert.equal(bands[1].bankIndex, 1)
  assert.equal(bands[1].rowOffset, 1) // depois da 1 linha de blocos do tileset a

  // bloco 0 do tileset b (índice local 0) deve estar deslocado (+16) em relação ao original
  const globalIndexB0 = bandGlobalTileIndex(bands[1], 0, tileset.cols)
  const pixelsB0 = tilePixels(tileset, globalIndexB0)
  assert.ok([...pixelsB0].every((v) => v === 1 + 16), 'bloco 0 do banco 1 tem cor 1+16=17 (offset aplicado)')

  const globalIndexA0 = bandGlobalTileIndex(bands[0], 0, tileset.cols)
  const pixelsA0 = tilePixels(tileset, globalIndexA0)
  assert.ok([...pixelsA0].every((v) => v === 1), 'bloco 0 do banco 0 continua com cor 1 (sem offset)')

  // paleta combinada: banco 0 nos slots 0-15, banco 1 nos slots 16-31
  assert.deepEqual(palette.slice(0, 16), a.palette)
  assert.deepEqual(palette.slice(16, 32), b.palette)
})

test('combineTilesets: tilesets com larguras diferentes ficam alinhados à esquerda, sem misturar bancos no preenchimento', () => {
  const wide = solidUpload(4, 1, 8, 1, 'wide.png') // 4 blocos de largura
  const narrow = solidUpload(2, 1, 8, 1, 'narrow.png') // só 2 blocos de largura
  const { tileset, bands } = combineTilesets([wide, narrow], 8)

  assert.equal(tileset.cols, 4, 'colunas do raster combinado = a largura do tileset mais largo')
  assert.equal(bands[1].cols, 2, 'a faixa do tileset estreito continua sabendo que só tem 2 colunas reais')

  // os 2 blocos reais do tileset estreito (banco 1) devem ter cor deslocada certinha
  for (let local = 0; local < 2; local++) {
    const globalIndex = bandGlobalTileIndex(bands[1], local, tileset.cols)
    const pixels = tilePixels(tileset, globalIndex)
    assert.ok([...pixels].every((v) => v === 1 + local + 16), `bloco local ${local} do banco 1 tem cor certa`)
  }
})

test('combineTilesets: rejeita mais de 8 tilesets', () => {
  const uploads = Array.from({ length: 9 }, (_, i) => solidUpload(1, 1, 8, 1, `t${i}.png`))
  assert.throws(() => combineTilesets(uploads, 8), /No máximo 8 tilesets/)
})

test('combineTilesets: rejeita lista vazia', () => {
  assert.throws(() => combineTilesets([], 8), /pelo menos um conjunto de blocos/)
})

test('combineTilesets: propaga erro de dimensão não múltipla de blockSize (reaproveita buildTileset)', () => {
  const bad: TilesetUpload = { width: 10, height: 8, indices: new Uint8Array(80), palette: [[0, 0, 0]], label: 'bad.png' }
  assert.throws(() => combineTilesets([bad], 8), /múltiplas de 8/)
})

test('findBandLocalIndex: inverso de bandGlobalTileIndex pra todo bloco de todo banco (docs/DATA_FORMAT.md § 4, remapeamento da Camada 2 no reabrir)', () => {
  const a = solidUpload(4, 1, 8, 1, 'a.png') // 4 blocos
  const b = solidUpload(2, 1, 8, 1, 'b.png') // 2 blocos, mais estreito (testa preenchimento)
  const { tileset, bands } = combineTilesets([a, b], 8)

  for (const band of bands) {
    for (let local = 0; local < band.tileCount; local++) {
      const globalIndex = bandGlobalTileIndex(band, local, tileset.cols)
      const found = findBandLocalIndex(bands, globalIndex, tileset.cols)
      assert.equal(found.band, band, `banco ${band.bankIndex}, bloco local ${local}: achou o banco certo`)
      assert.equal(found.localTileIndex, local, `banco ${band.bankIndex}, bloco local ${local}: achou o índice local certo`)
    }
  }
})

test('findBandLocalIndex: índice global fora de qualquer faixa lança erro em português', () => {
  const a = solidUpload(2, 1, 8, 1, 'a.png')
  const { tileset, bands } = combineTilesets([a], 8)
  assert.throws(() => findBandLocalIndex(bands, tileset.tileCount + 1, tileset.cols), /não corresponde a nenhuma faixa/)
})
