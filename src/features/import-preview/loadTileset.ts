// Carrega um tileset já salvo de volta — lê `<nome>_tileset.bmp` (a imagem ORIGINAL importada,
// sem fatiar/combinar com nada) + `<nome>_tileset.json` (tamanho de bloco, colisão e camada por
// bloco). Diferente de loadCharacter.ts/loadStage.ts, aqui não tem reconstrução com perda nenhuma:
// o `.bmp` salvo É a imagem que o usuário importou, então decodificar direto já basta (sem
// revalidar pelo caminho pesado de PNG/canvas — já foi validado uma vez, na hora de salvar).

import type { RgbColor } from '../../lib/indexedBmp.ts'
import { decodeIndexedBmp } from '../../lib/metasprite/importProject.ts'
import { parseTilesetMeta, type TilesetMeta } from '../../lib/tilemap/tilesetAsset.ts'
import { readTilesetFile, readTilesetFileText } from './tilesetFiles.ts'

export interface LoadedTileset {
  name: string
  width: number
  height: number
  indices: Uint8Array
  palette: RgbColor[]
  meta: TilesetMeta
}

/** Lê `<name>_tileset.bmp` + `<name>_tileset.json` de `assets/tilesets/`. Lança com mensagem em
 * português se algum dos dois estiver ausente/corrompido. */
export async function loadTilesetAsset(name: string): Promise<LoadedTileset> {
  const [bmpBuffer, metaText] = await Promise.all([
    readTilesetFile(`${name}_tileset.bmp`),
    readTilesetFileText(`${name}_tileset.json`),
  ])
  const decoded = decodeIndexedBmp(bmpBuffer)
  const meta = parseTilesetMeta(metaText)
  return { name, width: decoded.width, height: decoded.height, indices: decoded.indices, palette: decoded.palette, meta }
}
