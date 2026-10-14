// Reconstrói um personagem a partir dos próprios arquivos exportados
// (`<base>_tiles.bmp` + `<base>_metasprites.h` + `<base>_anim.h` opcional) —
// não existe um formato de projeto à parte: os arquivos que a engine já
// consome são a única fonte de verdade, então "carregar pra editar" é o
// inverso exato de `encodeIndexedBmp`/`generateMetaspriteHeader`/
// `generateAnimationHeader`. Sem DOM — a conversão pra PNG fica na camada
// de UI (precisa de canvas).

import type { RgbColor } from '../indexedBmp.ts'
import type { Hitbox } from './hitbox.ts'
import { OBJ_TILES_PER_ROW, type Pivot } from './types.ts'

export interface DecodedBmp {
  width: number
  height: number
  indices: Uint8Array
  palette: RgbColor[]
}

/**
 * Inverso de `encodeIndexedBmp` (src/lib/indexedBmp.ts): BMP 8bpp indexado,
 * bottom-up, com padding de linha em múltiplo de 4 bytes.
 */
export function decodeIndexedBmp(input: ArrayBuffer | Uint8Array): DecodedBmp {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (bytes.length < 54 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) {
    throw new Error('Arquivo não é um .bmp válido (assinatura "BM" ausente).')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const pixelDataOffset = view.getUint32(10, true)
  const width = view.getInt32(18, true)
  const height = view.getInt32(22, true)
  const bitCount = view.getUint16(28, true)
  if (bitCount !== 8) {
    throw new Error(`.bmp com ${bitCount} bits por pixel não é suportado (esperado 8).`)
  }

  const paletteLength = view.getUint32(46, true) || 256
  const palette: RgbColor[] = []
  for (let i = 0; i < paletteLength; i++) {
    const o = 54 + i * 4
    palette.push([bytes[o + 2], bytes[o + 1], bytes[o]])
  }

  const rowStride = Math.ceil(width / 4) * 4
  const indices = new Uint8Array(width * height)
  for (let row = 0; row < height; row++) {
    const sourceY = height - 1 - row
    for (let x = 0; x < width; x++) {
      indices[sourceY * width + x] = bytes[pixelDataOffset + row * rowStride + x]
    }
  }
  return { width, height, indices, palette }
}

export interface ParsedMetaspritePiece {
  dx: number
  dy: number
  tile: number
  size: 8 | 16
  flipH: boolean
  flipV: boolean
}

export interface ParsedMetaspriteFrame {
  pivot: Pivot
  pieces: ParsedMetaspritePiece[]
}

export interface ParsedMetasprites {
  frameWidth: number
  frameHeight: number
  /** `null` em headers exportados antes da hitbox existir (sem `_HITBOX_W/H`) — quem chama calcula uma sugestão. */
  hitbox: Hitbox | null
  /** Recuperado do byte de atributo (OBJ_PAL) da primeira peça encontrada; 0 se o sheet não tem nenhuma peça. */
  objPalette: number
  frames: ParsedMetaspriteFrame[]
}

function requiredDefine(text: string, name: string): number {
  const match = text.match(new RegExp(`#define\\s+${name}\\s+(-?\\d+)`))
  if (!match) throw new Error(`Não encontrei "#define ${name}" no header.`)
  return Number(match[1])
}

function optionalDefine(text: string, name: string): number | null {
  const match = text.match(new RegExp(`#define\\s+${name}\\s+(-?\\d+)`))
  return match ? Number(match[1]) : null
}

/** Inverso de `generateMetaspriteHeader` (exportHeader.ts). */
export function parseMetaspriteHeader(baseName: string, text: string): ParsedMetasprites {
  const upper = baseName.toUpperCase()
  const frameWidth = requiredDefine(text, `${upper}_FRAME_WIDTH`)
  const frameHeight = requiredDefine(text, `${upper}_FRAME_HEIGHT`)
  // _HITBOX_W/H são opcionais: headers exportados antes dessa funcionalidade existir não têm.
  const hitboxWidth = optionalDefine(text, `${upper}_HITBOX_W`)
  const hitboxHeight = optionalDefine(text, `${upper}_HITBOX_H`)
  const frameCount = requiredDefine(text, `${upper}_FRAME_COUNT`)

  const pieceArrays = new Map<string, ParsedMetaspritePiece[]>()
  const pieceArrayPattern = new RegExp(
    `static const metapiece_t (${baseName}_f\\d+_pieces)\\[\\] = \\{\\n([\\s\\S]*?)\\n\\};`,
    'g',
  )
  const piecePattern = /\{\s*(-?\d+),\s*(-?\d+),\s*(\d+),\s*(0x[0-9A-Fa-f]{2}),\s*(OBJ_SMALL|OBJ_LARGE)\s*\}/g
  let objPalette = 0
  let foundPiece = false
  for (const arrayMatch of text.matchAll(pieceArrayPattern)) {
    const pieces: ParsedMetaspritePiece[] = []
    for (const pieceMatch of arrayMatch[2].matchAll(piecePattern)) {
      const flags = parseInt(pieceMatch[4], 16)
      if (!foundPiece) {
        objPalette = (flags >> 1) & 0x7
        foundPiece = true
      }
      pieces.push({
        dx: Number(pieceMatch[1]),
        dy: Number(pieceMatch[2]),
        tile: Number(pieceMatch[3]),
        size: pieceMatch[5] === 'OBJ_LARGE' ? 16 : 8,
        flipH: (flags & 0x40) !== 0,
        flipV: (flags & 0x80) !== 0,
      })
    }
    pieceArrays.set(arrayMatch[1], pieces)
  }

  const framesTablePattern = new RegExp(
    `static const metaframe_t ${baseName}_frames\\[${upper}_FRAME_COUNT\\] = \\{\\n([\\s\\S]*?)\\n\\};`,
  )
  const tableMatch = text.match(framesTablePattern)
  if (!tableMatch) throw new Error(`Não encontrei a tabela "${baseName}_frames" no header.`)

  const rowPattern = /\{\s*(\d+),\s*(\d+),\s*(\d+),\s*(\w+)\s*\}/g
  const frames: ParsedMetaspriteFrame[] = []
  for (const row of tableMatch[1].matchAll(rowPattern)) {
    const ref = row[4]
    frames.push({
      pivot: { x: Number(row[1]), y: Number(row[2]) },
      pieces: ref === '0' ? [] : (pieceArrays.get(ref) ?? []),
    })
  }
  if (frames.length !== frameCount) {
    throw new Error(
      `A tabela de quadros tem ${frames.length} entrada(s), mas ${upper}_FRAME_COUNT diz ${frameCount}.`,
    )
  }

  return {
    frameWidth,
    frameHeight,
    hitbox: hitboxWidth !== null && hitboxHeight !== null ? { width: hitboxWidth, height: hitboxHeight } : null,
    objPalette,
    frames,
  }
}

export interface ParsedAnimationEntry {
  name: string
  frameIndices: number[]
  frameDuration: number
}

export interface ParsedAnimations {
  frameWidth: number
  frameHeight: number
  animations: ParsedAnimationEntry[]
}

/** Inverso de `generateAnimationHeader` (animationSequence.ts). */
export function parseAnimationHeader(baseName: string, text: string): ParsedAnimations {
  const upper = baseName.toUpperCase()
  const frameWidth = requiredDefine(text, `${upper}_FRAME_W`)
  const frameHeight = requiredDefine(text, `${upper}_FRAME_H`)

  const animations: ParsedAnimationEntry[] = []
  const arrayPattern = new RegExp(`static const u8 ${baseName}_anim_(\\w+)\\[\\] = \\{([^}]*)\\};`, 'g')
  for (const match of text.matchAll(arrayPattern)) {
    const name = match[1]
    const frameIndices = match[2]
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map(Number)
    const frameDuration = requiredDefine(text, `${upper}_${name.toUpperCase()}_FRAME_DURATION`)
    animations.push({ name, frameIndices, frameDuration })
  }
  return { frameWidth, frameHeight, animations }
}

/**
 * Redesenha um quadro (índices frameWidth x frameHeight, relativo ao seu
 * próprio canto sup. esq.) a partir das peças exportadas + tiles. Inverso
 * do fatiamento: srcX/srcY = pivô + dx/dy (a mesma conta que gerou dx/dy).
 */
export function reconstructFramePixels(
  frame: ParsedMetaspriteFrame,
  tileSheet: Pick<DecodedBmp, 'width' | 'indices'>,
  frameWidth: number,
  frameHeight: number,
): Uint8Array {
  const out = new Uint8Array(frameWidth * frameHeight)
  for (const piece of frame.pieces) {
    const srcX = frame.pivot.x + piece.dx
    const srcY = frame.pivot.y + piece.dy
    const tileX = (piece.tile % OBJ_TILES_PER_ROW) * 8
    const tileY = Math.floor(piece.tile / OBJ_TILES_PER_ROW) * 8

    for (let ly = 0; ly < piece.size; ly++) {
      const dy = srcY + ly
      if (dy < 0 || dy >= frameHeight) continue
      for (let lx = 0; lx < piece.size; lx++) {
        const dx = srcX + lx
        if (dx < 0 || dx >= frameWidth) continue
        const sx = piece.flipH ? piece.size - 1 - lx : lx
        const sy = piece.flipV ? piece.size - 1 - ly : ly
        const value = tileSheet.indices[(tileY + sy) * tileSheet.width + tileX + sx]
        if (value === 0) continue
        out[dy * frameWidth + dx] = value
      }
    }
  }
  return out
}

export interface ReconstructedThumbnail {
  width: number
  height: number
  /** Índices de cor (0 = transparente), relativos ao canto sup. esq. do quadro. */
  pixels: Uint8Array
  palette: RgbColor[]
}

/**
 * Reconstrói um quadro específico (por índice) de `<baseName>` — núcleo
 * compartilhado de `reconstructThumbnail`/`reconstructIdleFrame` (frame 0 e
 * frame "idle", respectivamente) e usado diretamente pelo marcador de
 * decoração (`decor1`, docs/DATA_FORMAT.md § 3: "cada quadro da folha é uma
 * peça de decoração diferente"), onde o usuário escolhe explicitamente QUAL
 * quadro mostrar. Cai pro quadro 0 se `frameIndex` não existir (sheet
 * reimportado com menos quadros que antes).
 */
export function reconstructFrameAt(
  tilesBmp: ArrayBuffer | Uint8Array,
  metaspritesHeader: string,
  baseName: string,
  frameIndex: number,
): ReconstructedThumbnail {
  const tileSheet = decodeIndexedBmp(tilesBmp)
  const parsed = parseMetaspriteHeader(baseName, metaspritesHeader)
  const frame = parsed.frames[frameIndex] ?? parsed.frames[0]
  if (!frame) throw new Error(`"${baseName}" não tem nenhum quadro pra mostrar.`)
  const pixels = reconstructFramePixels(frame, tileSheet, parsed.frameWidth, parsed.frameHeight)
  return { width: parsed.frameWidth, height: parsed.frameHeight, pixels, palette: tileSheet.palette }
}

/**
 * Reconstrói só o quadro 0 de `<baseName>` a partir do `.bmp`/`.h` já
 * exportados — usado pela miniatura da galeria (`CharacterThumbnail.tsx`),
 * que não precisa (nem quer) pagar o custo de reconstruir TODOS os quadros
 * numa imagem sintética e revalidar como `loadCharacterProject` faz pra
 * reabrir um personagem pra edição completa.
 */
export function reconstructThumbnail(
  tilesBmp: ArrayBuffer | Uint8Array,
  metaspritesHeader: string,
  baseName: string,
): ReconstructedThumbnail {
  return reconstructFrameAt(tilesBmp, metaspritesHeader, baseName, 0)
}

/**
 * Reconstrói o quadro da animação "idle" de `<baseName>` — usado pelos
 * marcadores de jogador/inimigo no editor de fase (StageEditor.tsx), no
 * lugar do ícone com letra genérico. `animHeader` é opcional (`enemy1` só
 * exige `walk`, `idle` é sugestão — pode não existir): sem ele, ou se não
 * tiver uma entrada "idle", cai pro quadro 0 (mesmo comportamento de
 * `reconstructThumbnail`) em vez de lançar erro.
 */
export function reconstructIdleFrame(
  tilesBmp: ArrayBuffer | Uint8Array,
  metaspritesHeader: string,
  animHeader: string | null,
  baseName: string,
): ReconstructedThumbnail {
  let frameIndex = 0
  if (animHeader) {
    const idle = parseAnimationHeader(baseName, animHeader).animations.find((a) => a.name === 'idle')
    if (idle?.frameIndices.length) frameIndex = idle.frameIndices[0]
  }
  return reconstructFrameAt(tilesBmp, metaspritesHeader, baseName, frameIndex)
}

export interface SyntheticSheet {
  width: number
  height: number
  indices: Uint8Array
  cols: number
  rows: number
}

/**
 * Reflui os quadros reconstruídos numa única imagem em grade (1 linha —
 * layout novo, não precisa bater com o sheet original; só a ORDEM dos
 * índices de frame importa, e essa vem preservada da tabela do header).
 */
export function buildSyntheticSheet(
  frames: ReadonlyArray<Uint8Array>,
  frameWidth: number,
  frameHeight: number,
): SyntheticSheet {
  const cols = Math.max(1, frames.length)
  const rows = 1
  const width = cols * frameWidth
  const height = frameHeight
  const indices = new Uint8Array(width * height)
  frames.forEach((frame, i) => {
    const originX = i * frameWidth
    for (let y = 0; y < frameHeight; y++) {
      for (let x = 0; x < frameWidth; x++) {
        indices[y * width + originX + x] = frame[y * frameWidth + x]
      }
    }
  })
  return { width, height, indices, cols, rows }
}
