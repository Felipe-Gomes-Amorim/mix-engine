// Carrega um personagem já salvo de volta pro editor: lê os arquivos
// exportados (tiles.bmp + metasprites.h + anim.h opcional), reconstrói os
// quadros e monta uma imagem PNG sintética que passa pelo MESMO caminho de
// validação de um upload normal (garante índices/paleta consistentes).
// Depende de DOM (canvas) — a lógica pura fica em lib/metasprite/importProject.ts.

import { readGfxFile, readGfxFileText } from '../../lib/gfxFiles'
import { defaultHitbox, type Hitbox } from '../../lib/metasprite/hitbox'
import {
  buildSyntheticSheet,
  decodeIndexedBmp,
  parseAnimationHeader,
  parseMetaspriteHeader,
  reconstructFrameAt,
  reconstructFramePixels,
  reconstructIdleFrame,
  reconstructThumbnail,
} from '../../lib/metasprite/importProject'
import { composedToRgba } from '../../lib/metasprite/render'
import type { Pivot } from '../../lib/metasprite/types'
import { decodeImageData, indicesToPngDataUrl } from '../../lib/synthesizeImage'
import type { ImportedImage } from '../../types/importedImage'
import type { AnimationEntry } from './animationSequence'
import { validateForExport, type ValidationOk } from './validation'

export interface ProjectSeed {
  /** Slot de onde este personagem foi carregado (ver characterSlots.ts) — o editor precisa
   * reabrir com o seletor "Isso é o:" já correto, senão "Salvar" reescreveria o slot errado. */
  baseName: string
  frameWidth: number
  frameHeight: number
  objPalette: number
  pivotOverrides: Record<number, Pivot>
  hitbox: Hitbox
  animations: AnimationEntry[]
}

export interface LoadedCharacter {
  image: ImportedImage
  validation: ValidationOk
  seed: ProjectSeed
}

/**
 * Reconstrói `baseName` a partir de `assets/gfx/<baseName>_tiles.bmp` +
 * `_metasprites.h` (+ `_anim.h` se `hasAnim`). Lança com mensagem em
 * português se algum arquivo estiver ausente/corrompido.
 */
export async function loadCharacterProject(baseName: string, hasAnim: boolean): Promise<LoadedCharacter> {
  const [tilesBuffer, headerText] = await Promise.all([
    readGfxFile(`${baseName}_tiles.bmp`),
    readGfxFileText(`${baseName}_metasprites.h`),
  ])
  const tileSheet = decodeIndexedBmp(tilesBuffer)
  const parsed = parseMetaspriteHeader(baseName, headerText)

  const reconstructedFrames = parsed.frames.map((frame) =>
    reconstructFramePixels(frame, tileSheet, parsed.frameWidth, parsed.frameHeight),
  )
  const synthetic = buildSyntheticSheet(reconstructedFrames, parsed.frameWidth, parsed.frameHeight)
  const dataUrl = indicesToPngDataUrl(synthetic.width, synthetic.height, synthetic.indices, tileSheet.palette)

  const imageData = await decodeImageData(dataUrl)
  const validation = validateForExport(imageData)
  if (!validation.ok) {
    throw new Error(
      `A imagem reconstruída de "${baseName}" não passou na validação (${validation.errors.join(' ')}) — os arquivos exportados podem estar corrompidos ou de uma versão antiga.`,
    )
  }

  const image: ImportedImage = {
    fileName: `${baseName}.png`,
    width: synthetic.width,
    height: synthetic.height,
    sizeBytes: dataUrl.length,
    dataUrl,
  }

  const pivotOverrides: Record<number, Pivot> = {}
  parsed.frames.forEach((frame, index) => {
    pivotOverrides[index] = frame.pivot
  })

  // Headers exportados antes da hitbox existir não têm _HITBOX_W/H: calcula
  // a mesma sugestão que um upload novo receberia (ver hitbox.ts).
  const hitbox: Hitbox =
    parsed.hitbox ??
    defaultHitbox(
      synthetic.indices,
      synthetic.width,
      parsed.frameWidth,
      parsed.frameHeight,
      parsed.frames.map((frame, index) => ({ col: index, row: 0, pivot: frame.pivot })),
    )

  let animations: AnimationEntry[] = []
  if (hasAnim) {
    const animText = await readGfxFileText(`${baseName}_anim.h`)
    animations = parseAnimationHeader(baseName, animText).animations
  }

  return {
    image,
    validation,
    seed: {
      baseName,
      frameWidth: parsed.frameWidth,
      frameHeight: parsed.frameHeight,
      objPalette: parsed.objPalette,
      pivotOverrides,
      hitbox,
      animations,
    },
  }
}

export interface CharacterThumbnail {
  width: number
  height: number
  // Pinado em <ArrayBuffer> (em vez do ArrayBufferLike genérico default) porque o construtor de
  // `ImageData` exige esse tipo especificamente — ver uso em CharacterThumbnail.tsx.
  rgba: Uint8ClampedArray<ArrayBuffer>
}

/**
 * Miniatura (quadro 0) de `baseName` pra galeria — bem mais leve que
 * `loadCharacterProject` (não monta a imagem sintética inteira nem passa
 * por `validateForExport`, já que aqui só queremos pixels pra desenhar).
 */
export async function loadCharacterThumbnail(baseName: string): Promise<CharacterThumbnail> {
  const [tilesBuffer, headerText] = await Promise.all([
    readGfxFile(`${baseName}_tiles.bmp`),
    readGfxFileText(`${baseName}_metasprites.h`),
  ])
  const thumb = reconstructThumbnail(tilesBuffer, headerText, baseName)
  const rgba = composedToRgba(
    { width: thumb.width, height: thumb.height, originX: 0, originY: 0, pixels: thumb.pixels },
    thumb.palette,
  )
  return { width: thumb.width, height: thumb.height, rgba }
}

/**
 * Quadro da animação "idle" de `baseName` — usado pelos marcadores de
 * jogador/inimigo no editor de fase (StageEditor.tsx) no lugar do ícone com
 * letra. `_anim.h` é opcional aqui (`enemy1` só exige `walk`, ver
 * characterSlots.ts): ausente ou sem entrada "idle", cai pro quadro 0
 * (mesmo fallback de `loadCharacterThumbnail`).
 */
export async function loadCharacterIdleSprite(baseName: string): Promise<CharacterThumbnail> {
  const [tilesBuffer, headerText, animText] = await Promise.all([
    readGfxFile(`${baseName}_tiles.bmp`),
    readGfxFileText(`${baseName}_metasprites.h`),
    readGfxFileText(`${baseName}_anim.h`).catch(() => null),
  ])
  const thumb = reconstructIdleFrame(tilesBuffer, headerText, animText, baseName)
  const rgba = composedToRgba(
    { width: thumb.width, height: thumb.height, originX: 0, originY: 0, pixels: thumb.pixels },
    thumb.palette,
  )
  return { width: thumb.width, height: thumb.height, rgba }
}

/**
 * Quadro ESPECÍFICO (por índice) de `baseName` — usado pelo marcador de
 * decoração (`decor1`, docs/DATA_FORMAT.md § 3: "cada quadro da folha é uma
 * peça de decoração diferente"), onde o usuário escolhe explicitamente QUAL
 * quadro mostrar em vez de depender de "idle"/quadro 0.
 */
export async function loadCharacterFrame(baseName: string, frameIndex: number): Promise<CharacterThumbnail> {
  const [tilesBuffer, headerText] = await Promise.all([
    readGfxFile(`${baseName}_tiles.bmp`),
    readGfxFileText(`${baseName}_metasprites.h`),
  ])
  const thumb = reconstructFrameAt(tilesBuffer, headerText, baseName, frameIndex)
  const rgba = composedToRgba(
    { width: thumb.width, height: thumb.height, originX: 0, originY: 0, pixels: thumb.pixels },
    thumb.palette,
  )
  return { width: thumb.width, height: thumb.height, rgba }
}

/**
 * Quantos quadros a folha de `baseName` tem — usado pelo seletor de quadro
 * de decoração pra saber até onde o usuário pode escolher. Só lê o header de
 * texto (`_metasprites.h`), não precisa decodificar o `.bmp`.
 */
export async function loadCharacterFrameCount(baseName: string): Promise<number> {
  const headerText = await readGfxFileText(`${baseName}_metasprites.h`)
  return parseMetaspriteHeader(baseName, headerText).frames.length
}

/**
 * Hitbox de `baseName` (`_HITBOX_W`/`_HITBOX_H` do `_metasprites.h`) — usado
 * pelos marcadores de jogador/inimigo no editor de fase (StageEditor.tsx)
 * pra saber onde o sprite REALMENTE aparece no jogo. Achado real do
 * usuário: o marcador desenhava centrado no ponto salvo (`x`,`y`), mas a
 * engine trata esse ponto como o canto superior esquerdo da hitbox
 * (`player.c`/`enemy.c`: "enemyX/enemyY guardam o canto superior esquerdo
 * da hitbox, não o pivô" — o pivô/pé fica em `x + hitboxW/2, y + hitboxH`),
 * então o sprite sempre aparecia mais embaixo (e um pouco pro lado) do que
 * o marcador mostrava. Só leitura leve (`_metasprites.h` é texto, não
 * precisa do `.bmp`). `null` se o header não tiver hitbox (exportado antes
 * dela existir) — quem chama cai pro comportamento antigo (centralizado no
 * ponto salvo) nesse caso, não trava.
 */
export async function loadCharacterHitbox(baseName: string): Promise<Hitbox | null> {
  const headerText = await readGfxFileText(`${baseName}_metasprites.h`)
  return parseMetaspriteHeader(baseName, headerText).hitbox
}
