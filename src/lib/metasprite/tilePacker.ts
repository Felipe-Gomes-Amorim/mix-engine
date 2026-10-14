import { OBJ_TILES_PER_ROW, type PieceSize, type SlicedPiece, type TileSheet } from './types.ts'

export interface FrameSource {
  /** Canto sup. esq. do frame dentro do sheet. */
  originX: number
  originY: number
  pieces: SlicedPiece[]
}

export interface PackedPiece {
  tile: number
  flipH: boolean
  flipV: boolean
}

export interface PackResult {
  /** assignments[frame][peça], na mesma ordem da entrada. */
  assignments: PackedPiece[][]
  tileSheet: TileSheet
  uniqueShapes: number
  tilesUsed: number
}

export interface PackOptions {
  /** Deduplica formas idênticas (inclusive espelhadas H/V) entre frames. */
  dedupe: boolean
}

interface Shape {
  size: PieceSize
  block: Uint8Array
  col: number
  row: number
}

function extractBlock(
  pixels: Uint8Array,
  sheetWidth: number,
  x0: number,
  y0: number,
  size: number,
): Uint8Array {
  const block = new Uint8Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      block[y * size + x] = pixels[(y0 + y) * sheetWidth + x0 + x]
    }
  }
  return block
}

/** Espelha o bloco INTEIRO (o hardware espelha a peça 16x16 como um todo). */
function flipBlock(block: Uint8Array, size: number, h: boolean, v: boolean): Uint8Array {
  const out = new Uint8Array(block.length)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = h ? size - 1 - x : x
      const sy = v ? size - 1 - y : y
      out[y * size + x] = block[sy * size + sx]
    }
  }
  return out
}

function blockKey(size: number, block: Uint8Array): string {
  let key = `${size}:`
  for (let i = 0; i < block.length; i++) key += String.fromCharCode(48 + block[i])
  return key
}

/** Grade de células 8x8 da memória OBJ (16 colunas, cresce em linhas). */
class TileGrid {
  private cells: boolean[] = []

  private ensureRows(rows: number): void {
    while (this.cells.length < rows * OBJ_TILES_PER_ROW) this.cells.push(false)
  }

  private isFree(col: number, row: number, span: number): boolean {
    this.ensureRows(row + span)
    for (let r = row; r < row + span; r++) {
      for (let c = col; c < col + span; c++) {
        if (this.cells[r * OBJ_TILES_PER_ROW + c]) return false
      }
    }
    return true
  }

  /** Primeira posição livre. 16x16 (span 2) só em coluna e linha PARES. */
  allocate(span: 1 | 2): { col: number; row: number } {
    const step = span
    for (let row = 0; ; row += step) {
      for (let col = 0; col + span <= OBJ_TILES_PER_ROW; col += step) {
        if (!this.isFree(col, row, span)) continue
        for (let r = row; r < row + span; r++) {
          for (let c = col; c < col + span; c++) this.cells[r * OBJ_TILES_PER_ROW + c] = true
        }
        return { col, row }
      }
    }
  }

  get rowsUsed(): number {
    let last = -1
    this.cells.forEach((used, i) => {
      if (used) last = Math.floor(i / OBJ_TILES_PER_ROW)
    })
    return last + 1
  }
}

/**
 * Empacota os gráficos das peças no layout da memória de sprites (OBJ).
 *
 * No OAM, um sprite 16x16 com tile N usa N, N+1, N+16 e N+17 — a memória é
 * uma grade de 16 tiles de largura. Então: peças 16x16 ocupam blocos 2x2
 * alinhados em coluna E linha pares; peças 8x8 ocupam células individuais
 * (preenchendo os buracos que sobram depois dos 16x16). O índice de tile
 * de uma peça = linha * 16 + coluna do seu canto sup. esq.
 */
export function packTiles(
  pixels: Uint8Array,
  sheetWidth: number,
  frames: FrameSource[],
  options: PackOptions,
): PackResult {
  const shapes: Shape[] = []
  const variants = new Map<string, { shape: number; flipH: boolean; flipV: boolean }>()
  const pending: Array<Array<{ shape: number; flipH: boolean; flipV: boolean }>> = []

  for (const frame of frames) {
    const framePending: Array<{ shape: number; flipH: boolean; flipV: boolean }> = []
    for (const piece of frame.pieces) {
      const block = extractBlock(
        pixels,
        sheetWidth,
        frame.originX + piece.srcX,
        frame.originY + piece.srcY,
        piece.size,
      )

      const found = options.dedupe ? variants.get(blockKey(piece.size, block)) : undefined
      if (found) {
        framePending.push(found)
        continue
      }

      const shapeIndex = shapes.length
      shapes.push({ size: piece.size, block, col: 0, row: 0 })
      framePending.push({ shape: shapeIndex, flipH: false, flipV: false })

      if (options.dedupe) {
        // Registra as 4 orientações; a primeira registrada vence (identidade
        // primeiro, então formas simétricas não ganham flip à toa).
        for (const [flipH, flipV] of [
          [false, false],
          [true, false],
          [false, true],
          [true, true],
        ] as const) {
          const key = blockKey(piece.size, flipBlock(block, piece.size, flipH, flipV))
          if (!variants.has(key)) variants.set(key, { shape: shapeIndex, flipH, flipV })
        }
      }
    }
    pending.push(framePending)
  }

  const grid = new TileGrid()
  for (const shape of shapes.filter((s) => s.size === 16)) {
    Object.assign(shape, grid.allocate(2))
  }
  for (const shape of shapes.filter((s) => s.size === 8)) {
    Object.assign(shape, grid.allocate(1))
  }

  const tileRows = Math.max(1, grid.rowsUsed)
  const width = OBJ_TILES_PER_ROW * 8
  const height = tileRows * 8
  const indices = new Uint8Array(width * height)
  for (const shape of shapes) {
    const x0 = shape.col * 8
    const y0 = shape.row * 8
    for (let y = 0; y < shape.size; y++) {
      for (let x = 0; x < shape.size; x++) {
        indices[(y0 + y) * width + x0 + x] = shape.block[y * shape.size + x]
      }
    }
  }

  const assignments = pending.map((framePending) =>
    framePending.map(({ shape, flipH, flipV }) => ({
      tile: shapes[shape].row * OBJ_TILES_PER_ROW + shapes[shape].col,
      flipH,
      flipV,
    })),
  )

  const tilesUsed = shapes.reduce((sum, s) => sum + (s.size === 16 ? 4 : 1), 0)
  return {
    assignments,
    tileSheet: { width, height, indices, tileRows },
    uniqueShapes: shapes.length,
    tilesUsed,
  }
}
