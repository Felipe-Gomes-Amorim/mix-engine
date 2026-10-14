// Modelo de dados de metasprites (docs/DATA_FORMAT.md seção 3).
//
// Pipeline: sliceFrame() -> SlicedPiece[]  (automático hoje; edição manual
// de peças no futuro produziria a mesma lista) -> packTiles() atribui
// tile/flip -> buildMetasprites() monta os Frames finais (Piece[]).

/** Largura/altura de frame lógico permitidas: múltiplos de 8 entre 8 e 64, independentes. */
export const FRAME_DIMENSIONS = [8, 16, 24, 32, 40, 48, 56, 64] as const

export interface FrameDimensions {
  width: number
  height: number
}

/** Presets oferecidos na UI (além da opção personalizada). */
export const FRAME_PRESETS: ReadonlyArray<FrameDimensions> = [
  { width: 16, height: 16 },
  { width: 16, height: 32 },
  { width: 32, height: 32 },
  { width: 32, height: 48 },
  { width: 48, height: 48 },
  { width: 64, height: 64 },
]
export const DEFAULT_FRAME: FrameDimensions = { width: 32, height: 32 }

export function isValidFrameDimension(value: number): boolean {
  return Number.isInteger(value) && value >= 8 && value <= 64 && value % 8 === 0
}

/** Par de tamanhos de hardware: pequeno 8x8 e grande 16x16 (OBSEL = OBJ_SIZE8_L16). */
export type PieceSize = 8 | 16

/** Memória de sprites (OBJ) é uma grade de 16 tiles de 8x8 de largura. */
export const OBJ_TILES_PER_ROW = 16

export interface Pivot {
  x: number
  y: number
}

/** Peça saída do fatiador: posição no frame (px, canto sup. esq.) + tamanho. */
export interface SlicedPiece {
  srcX: number
  srcY: number
  size: PieceSize
}

/** Peça final = uma entrada de OAM. */
export interface Piece extends SlicedPiece {
  /** Offset relativo ao pivô (int8): srcX - pivot.x. */
  dx: number
  /** Offset relativo ao pivô (int8): srcY - pivot.y. */
  dy: number
  /** Índice de tile OBJ (canto sup. esq. da peça na grade de 16 colunas). */
  tile: number
  flipH: boolean
  flipV: boolean
  /** Sub-paleta de OBJ (0..7). */
  palette: number
}

export interface Frame {
  index: number
  col: number
  row: number
  pivot: Pivot
  pieces: Piece[]
}

/** Imagem indexada 4bpp com os tiles empacotados no layout da memória OBJ. */
export interface TileSheet {
  /** Sempre OBJ_TILES_PER_ROW * 8 = 128. */
  width: number
  height: number
  indices: Uint8Array
  /** Linhas de tiles 8x8 ocupadas (height / 8). */
  tileRows: number
}

export interface MetaspriteSheet {
  frameWidth: number
  frameHeight: number
  cols: number
  rows: number
  frames: Frame[]
  tileSheet: TileSheet
  /** Formas únicas (8x8 + 16x16) depois do dedup. */
  uniqueShapes: number
  /** Total de tiles 8x8 ocupados na memória (16x16 conta 4). */
  tilesUsed: number
}
