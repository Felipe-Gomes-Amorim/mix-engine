// Carrega um Fundo já salvo de volta — lê `<nome>_fundo.bmp` (a imagem ORIGINAL importada, inteira)
// + `<nome>_fundo.json` (só `version`). Devolve no MESMO formato de `loadTilesetAsset`
// (`LoadedTileset`) — um Fundo, pra efeito de combinar numa fase (`combineTilesets`/
// `mergeTilesetMetaToHardware`), é só mais um "tileset" cujos metadados são SINTETIZADOS em vez de
// editados pelo usuário: `blockSize` sempre 8 (granularidade de hardware — não existe passo de
// "escolher tamanho de bloco" pra Fundo), TODO bloco já marcado como Camada 2 (`layer`), nenhuma
// colisão (um Fundo nunca é sólido/bandeira), nenhum grupo de terreno. Isso evita duplicar a lógica
// de combinar/mesclar metadados pra um segundo tipo de recurso — StageWorkspace.tsx/StageSession.tsx
// tratam o resultado exatamente como um tileset normal (ver `StageTilesetInput.kind`).

import { decodeIndexedBmp } from '../../lib/metasprite/importProject.ts'
import { parseBackgroundMeta } from '../../lib/tilemap/backgroundAsset.ts'
import { HARDWARE_TILE_SIZE, type TileLayer } from '../../lib/tilemap/types.ts'
import { readBackgroundFile, readBackgroundFileText } from './backgroundFiles.ts'
import type { LoadedTileset } from './loadTileset.ts'

/** Lê `<name>_fundo.bmp` + `<name>_fundo.json` de `assets/backgrounds/`. Lança com mensagem em
 * português se algum dos dois estiver ausente/corrompido. */
export async function loadBackgroundAsset(name: string): Promise<LoadedTileset> {
  const [bmpBuffer, metaText] = await Promise.all([
    readBackgroundFile(`${name}_fundo.bmp`),
    readBackgroundFileText(`${name}_fundo.json`),
  ])
  const decoded = decodeIndexedBmp(bmpBuffer)
  const { version } = parseBackgroundMeta(metaText)

  const cols = decoded.width / HARDWARE_TILE_SIZE
  const rows = decoded.height / HARDWARE_TILE_SIZE
  const layer = new Map<number, TileLayer>()
  for (let i = 0; i < cols * rows; i++) layer.set(i, 2)

  return {
    name,
    width: decoded.width,
    height: decoded.height,
    indices: decoded.indices,
    palette: decoded.palette,
    meta: { version, blockSize: HARDWARE_TILE_SIZE, collision: new Map(), layer, priority: new Map(), terrainGroups: [] },
  }
}
