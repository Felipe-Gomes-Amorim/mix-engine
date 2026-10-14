import { DEFAULT_SLICE_OPTIONS, sliceFrame, type SliceOptions } from './slicer.ts'
import { packTiles } from './tilePacker.ts'
import type { Frame, MetaspriteSheet, Pivot } from './types.ts'

export interface BuildOptions {
  /** Frame lógico: largura e altura independentes (múltiplos de 8). */
  frameWidth: number
  frameHeight: number
  slice?: SliceOptions
  /** Deduplica tiles idênticos/espelhados entre frames. Padrão: true. */
  dedupe?: boolean
  /** Sub-paleta de OBJ (0..7) gravada em toda peça. Padrão: 0. */
  palette?: number
  /** Pivô padrão do sheet. Padrão: centro horizontal e base do frame. */
  defaultPivot?: Pivot
  /** Pivô específico por índice de frame (sobrepõe o padrão). */
  pivotOverrides?: Record<number, Pivot>
}

/** Padrão: centro horizontal e base do frame (os pés): (largura / 2, altura). */
export function autoPivot(frameWidth: number, frameHeight: number): Pivot {
  return { x: frameWidth / 2, y: frameHeight }
}

export function clampPivot(pivot: Pivot, frameWidth: number, frameHeight: number): Pivot {
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v)))
  return { x: clamp(pivot.x, frameWidth), y: clamp(pivot.y, frameHeight) }
}

/**
 * Monta os metasprites do sheet inteiro: fatia cada frame, empacota os
 * tiles e calcula dx/dy (int8) relativos ao pivô de cada frame.
 * Exige largura/altura do sheet múltiplas de frameWidth/frameHeight.
 */
export function buildMetasprites(
  pixels: Uint8Array,
  sheetWidth: number,
  sheetHeight: number,
  options: BuildOptions,
): MetaspriteSheet {
  const { frameWidth, frameHeight } = options
  if (sheetWidth % frameWidth !== 0 || sheetHeight % frameHeight !== 0) {
    throw new Error(`sheet ${sheetWidth}x${sheetHeight} não é múltiplo de ${frameWidth}x${frameHeight}`)
  }
  const cols = sheetWidth / frameWidth
  const rows = sheetHeight / frameHeight
  const slice = options.slice ?? DEFAULT_SLICE_OPTIONS
  const palette = options.palette ?? 0
  const defaultPivot = clampPivot(
    options.defaultPivot ?? autoPivot(frameWidth, frameHeight),
    frameWidth,
    frameHeight,
  )

  const sources = []
  for (let index = 0; index < cols * rows; index++) {
    const originX = (index % cols) * frameWidth
    const originY = Math.floor(index / cols) * frameHeight
    sources.push({
      originX,
      originY,
      pieces: sliceFrame(pixels, sheetWidth, originX, originY, frameWidth, frameHeight, slice),
    })
  }

  const packed = packTiles(pixels, sheetWidth, sources, { dedupe: options.dedupe ?? true })

  const frames: Frame[] = sources.map((source, index) => {
    const override = options.pivotOverrides?.[index]
    const pivot = override ? clampPivot(override, frameWidth, frameHeight) : defaultPivot
    return {
      index,
      col: index % cols,
      row: Math.floor(index / cols),
      pivot,
      pieces: source.pieces.map((piece, k) => ({
        ...piece,
        dx: piece.srcX - pivot.x,
        dy: piece.srcY - pivot.y,
        ...packed.assignments[index][k],
        palette,
      })),
    }
  })

  return {
    frameWidth,
    frameHeight,
    cols,
    rows,
    frames,
    tileSheet: packed.tileSheet,
    uniqueShapes: packed.uniqueShapes,
    tilesUsed: packed.tilesUsed,
  }
}
