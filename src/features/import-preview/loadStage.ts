// Carrega a fase já salva de volta pro editor.
//
// Caminho PRINCIPAL (2026-09-23, "fase referencia tileset por nome" — docs/DATA_FORMAT.md § 4):
// lê `<base>_tileset_refs.json` — cada tileset é carregado direto da galeria salva
// (loadTileset.ts), sem reconstrução/dedup nenhuma, e a grade pintada (`grid`/`gridLayer2`) vem
// gravada 1:1 no próprio sidecar (StageSession.tsx grava esse arquivo ao salvar). Sem perda
// nenhuma: tamanho de bloco, colisão e camada de cada tileset são os de verdade, não um "chute"
// reconstruído a partir da imagem já composta.
//
// Caminho de FALLBACK (mantido por compatibilidade, inalterado): fases salvas ANTES desse sidecar
// existir, OU cujo(s) tileset(s) referenciado(s) foi(ram) apagado(s) desde então, caem pra
// reconstrução por pixel (`reconstructStage.ts`/`reconstructLayer2`) — sempre reabre em blocos de
// 8×8 (a granularidade de pintura original não é preservada, só o layout final).

import { readGfxFile, readGfxFileText } from '../../lib/gfxFiles'
import type { RgbColor } from '../../lib/indexedBmp'
import { decodeImageData, indicesToPngDataUrl } from '../../lib/synthesizeImage'
import { bandGlobalTileIndex, combineTilesets, findBandLocalIndex, type StageTilesetInput, type TilesetUpload } from '../../lib/tilemap/combineTilesets'
import { EMPTY_STAGE_ENTITIES, type StageEntities } from '../../lib/tilemap/entities'
import { parseEntitiesHeader } from '../../lib/tilemap/exportEntities'
import { mergeTilesetMetaToHardware } from '../../lib/tilemap/mergeTilesetMeta'
import { reconstructLayer2, reconstructStage } from '../../lib/tilemap/reconstructStage'
import { parseStageTilesetRefs } from '../../lib/tilemap/stageTilesetRefs'
import {
  HARDWARE_TILE_SIZE,
  LAYER2_DEFAULT_WIDTH_TILES,
  NO_TILE,
  STAGE_BASE_NAME,
  STAGE_HEIGHT_TILES,
  type CollisionKind,
  type StageGrid,
  type TileLayer,
} from '../../lib/tilemap/types'
import type { ImportedImage } from '../../types/importedImage'
import {
  STAGE_COLLISION_FILE,
  STAGE_ENTITIES_FILE,
  STAGE_TILEMAP_FILE,
  STAGE_TILEMAP_LAYER2_FILE,
  STAGE_TILESET_REFS_FILE,
} from './stageDiscovery'
import { loadBackgroundAsset } from './loadBackground'
import { loadTilesetAsset } from './loadTileset'
import { validateForExport, type ValidationOk } from './validation'
import type { StageTilesetRef } from '../../lib/tilemap/stageTilesetRefs'

/** Carrega uma referência de `_tileset_refs.json` pelo loader certo — tileset normal
 * (`assets/tilesets/`) ou Fundo (`assets/backgrounds/`, docs/PROGRESS.md "Fundo como recurso
 * salvo", 2026-09-30), conforme `ref.kind`. Os dois devolvem o mesmo formato (`LoadedTileset`), por
 * isso quem chama isso não precisa saber qual dos dois foi. */
function loadRefAsset(ref: StageTilesetRef) {
  return ref.kind === 'background' ? loadBackgroundAsset(ref.name) : loadTilesetAsset(ref.name)
}

export interface StageSeed {
  grid: StageGrid
  entities: StageEntities
  /** Camada 2 (docs/DATA_FORMAT.md § 4, "2ª camada de tileset") — todo `NO_TILE` (nada pintado)
   * quando a fase não usa Camada 2 ou é nova. */
  gridLayer2: StageGrid
  /** Cor de fundo (backdrop) escolhida da última vez que a fase foi salva — docs/PROGRESS.md,
   * "seletor de cor de fundo", 2026-09-30. `undefined` numa fase nova OU salva antes desse campo
   * existir (fallback de reconstrução por pixel nunca tem isso — StageSession.tsx cai pro padrão). */
  backdropColor?: RgbColor
}

/** Um tileset referenciado cuja versão atual (no arquivo salvo dele) é diferente da que foi
 * gravada quando esta fase foi salva pela última vez — docs/PROGRESS.md, "fase referencia tileset
 * por nome" (2026-09-23). A fase em si não muda sozinha (`stage1_tilemap.bmp` etc. continuam
 * congelados) — isso é só um aviso pra decidir se vale resalvar a fase pra usar a versão atual. */
export interface TilesetStaleness {
  name: string
  savedVersion: number
  currentVersion: number
}

export interface LoadedStageProject {
  tilesets: StageTilesetInput[]
  tileCollision: ReadonlyMap<number, CollisionKind>
  tileLayer: ReadonlyMap<number, TileLayer>
  /** Hardware index -> `true` quando marcado "desenha na frente do jogador/inimigo" (docs/
   * DATA_FORMAT.md § 4, "Bit de prioridade por tile da Camada 1", 2026-10-02) — vazio no fallback
   * de reconstrução por pixel (fase antiga, sem metadado de tileset pra recuperar isso). */
  tilePriority: ReadonlyMap<number, boolean>
  /** Largura da fase reaberta, em tiles de hardware (docs/PROGRESS.md, "fases largas de verdade",
   * 2026-09-24) — recuperada de `_tileset_refs.json` (caminho principal) ou do `.h` de colisão
   * (fallback de reconstrução por pixel, ver `reconstructStage`). */
  widthTiles: number
  seed: StageSeed
  /** Vazio quando não há divergência, OU quando a fase caiu no fallback de reconstrução por pixel
   * (não existe referência nenhuma pra comparar nesse caso). */
  staleness: TilesetStaleness[]
}

async function loadEntities(): Promise<StageEntities> {
  // Opcional (ver stageDiscovery.ts): fases salvas antes das entidades existirem não têm esse
  // arquivo — trata como "nenhuma entidade posicionada ainda" em vez de lançar.
  try {
    const text = await readGfxFileText(STAGE_ENTITIES_FILE)
    return parseEntitiesHeader(STAGE_BASE_NAME, text)
  } catch {
    return EMPTY_STAGE_ENTITIES
  }
}

/**
 * Reconstrói a fase a partir de `<base>_tileset_refs.json` — cada tileset referenciado carregado
 * direto da galeria salva, `grid`/`gridLayer2` lidos do próprio sidecar (sem dedup nenhum). Lança
 * se o sidecar não existir, estiver corrompido, ou referenciar um tileset que não existe mais —
 * quem chama (`loadStageProject`) trata isso como "sem referência utilizável" e cai pro fallback.
 */
async function loadStageProjectFromRefs(): Promise<LoadedStageProject> {
  const [refsText, entities] = await Promise.all([readGfxFileText(STAGE_TILESET_REFS_FILE), loadEntities()])
  const refs = parseStageTilesetRefs(refsText)

  const loaded = await Promise.all(refs.tilesets.map((ref) => loadRefAsset(ref)))

  const staleness: TilesetStaleness[] = []
  refs.tilesets.forEach((ref, i) => {
    const currentVersion = loaded[i].meta.version
    if (currentVersion !== ref.version) {
      staleness.push({ name: ref.name, savedVersion: ref.version, currentVersion })
    }
  })

  const tilesets: StageTilesetInput[] = loaded.map((t, i) => ({
    upload: { width: t.width, height: t.height, indices: t.indices, palette: t.palette, label: t.name },
    blockSize: t.meta.blockSize,
    name: refs.tilesets[i].name,
    version: t.meta.version,
    terrainGroups: t.meta.terrainGroups,
    kind: refs.tilesets[i].kind,
  }))

  const hardwareCombined = combineTilesets(
    tilesets.map((t) => t.upload),
    HARDWARE_TILE_SIZE,
  )
  const merged = mergeTilesetMetaToHardware(
    hardwareCombined,
    loaded.map((t) => ({ width: t.width, height: t.height, indices: t.indices, palette: t.palette, label: t.name, meta: t.meta })),
  )

  return {
    tilesets,
    tileCollision: merged.collision,
    tileLayer: merged.layer,
    tilePriority: merged.priority,
    widthTiles: refs.widthTiles,
    seed: {
      grid: Uint16Array.from(refs.grid),
      gridLayer2: Uint16Array.from(refs.gridLayer2),
      backdropColor: refs.backdropColor,
      entities,
    },
    staleness,
  }
}

/** Um tileset reconstruído por pixel (sem nome — sintético, deduplicado a partir da imagem já
 * composta), já revalidado pelo MESMO caminho (`validateForExport`) de um upload normal. */
interface ReconstructedTilesetImage {
  image: ImportedImage
  validation: ValidationOk
}

/**
 * FALLBACK: reconstrói a fase a partir de `assets/gfx/stage1_tilemap.bmp` + `stage1_collision.h`
 * (+ `_tilemap_layer2.bmp` opcional) — usado quando não há `<base>_tileset_refs.json` utilizável
 * (fase salva antes desse sidecar existir, ou tileset(s) referenciado(s) apagado(s)). Lança com
 * mensagem em português se algo estiver ausente/corrompido. Sempre reabre com blocos de 8×8 (a
 * granularidade de pintura original não é preservada, só o layout final, que é idêntico).
 */
async function loadStageProjectFromPixels(): Promise<LoadedStageProject> {
  const [tilemapBuffer, collisionText, entities, layer2] = await Promise.all([
    readGfxFile(STAGE_TILEMAP_FILE),
    readGfxFileText(STAGE_COLLISION_FILE),
    loadEntities(),
    // Opcional (docs/DATA_FORMAT.md § 4, "2ª camada de tileset") — ausente = fase sem Camada 2.
    readGfxFile(STAGE_TILEMAP_LAYER2_FILE)
      .then((buffer) => reconstructLayer2(buffer, STAGE_BASE_NAME))
      .catch(() => null),
  ])
  const reconstructed = reconstructStage(tilemapBuffer, collisionText, STAGE_BASE_NAME)

  // A Camada 1 e a Camada 2 foram reconstruídas cada uma contra a SUA PRÓPRIA imagem exportada,
  // então cada uma tem sua própria numeração de banco/índice global, começando do zero — mas o
  // editor pinta as duas camadas sobre UM SÓ tileset combinado (docs/DATA_FORMAT.md § 4: "ambos
  // indexando a MESMA numeração de bloco combinado"). Concatena as faixas da Camada 1 (primeiro,
  // sem mudar nada — o `grid` dela já é válido pra essa ordem) com as da Camada 2 (depois) e
  // recombina UMA VEZ pra achar o layout final; só o `grid` da Camada 2 precisa ser traduzido pro
  // novo índice global (ver findBandLocalIndex/bandGlobalTileIndex).
  const layer1Uploads: TilesetUpload[] = reconstructed.tilesets
  const layer2Uploads: TilesetUpload[] = layer2?.tilesets ?? []
  const allUploads = [...layer1Uploads, ...layer2Uploads]
  const finalCombine = combineTilesets(allUploads, HARDWARE_TILE_SIZE)

  // Camada 2 tem largura PRÓPRIA (docs/DATA_FORMAT.md § 4, "Camada 2 com parallax", 2026-09-29) —
  // achado real ao revisar este caminho pra essa mudança: `gridLayer2` era dimensionado igual à
  // Camada 1 (`reconstructed.grid.length`), o que já estava tecnicamente errado mesmo antes (só
  // não dava pra perceber porque as duas sempre tinham o mesmo tamanho até aqui). Correto é usar o
  // tamanho PRÓPRIO que `reconstructLayer2` devolveu (`layer2.grid.length`, derivado da largura
  // real da imagem `_tilemap_layer2.bmp` exportada) — sem Camada 2 nenhuma, usa a largura padrão
  // nova só como um array vazio razoável (nunca é lido de verdade nesse caso).
  let gridLayer2: StageGrid = new Uint16Array(LAYER2_DEFAULT_WIDTH_TILES * STAGE_HEIGHT_TILES).fill(NO_TILE)
  const tileLayer = new Map<number, TileLayer>()

  if (layer2) {
    const layer2OwnCombine = combineTilesets(layer2Uploads, HARDWARE_TILE_SIZE)
    gridLayer2 = new Uint16Array(layer2.grid.length)
    for (let i = 0; i < layer2.grid.length; i++) {
      const { band: oldBand, localTileIndex } = findBandLocalIndex(
        layer2OwnCombine.bands,
        layer2.grid[i],
        layer2OwnCombine.tileset.cols,
      )
      const newBand = finalCombine.bands[layer1Uploads.length + layer2OwnCombine.bands.indexOf(oldBand)]
      gridLayer2[i] = bandGlobalTileIndex(newBand, localTileIndex, finalCombine.tileset.cols)
    }
    // Todo bloco de uma faixa da Camada 2 é, por definição, um bloco de decoração — mesmo o que não
    // estiver pintado em nenhuma célula agora (a faixa inteira só existe porque apareceu na imagem
    // exportada da Camada 2 em algum momento).
    layer2Uploads.forEach((_, uploadIndex) => {
      const band = finalCombine.bands[layer1Uploads.length + uploadIndex]
      for (let local = 0; local < band.tileCount; local++) {
        tileLayer.set(bandGlobalTileIndex(band, local, finalCombine.tileset.cols), 2)
      }
    })
  }

  const reconstructedImages: ReconstructedTilesetImage[] = await Promise.all(
    allUploads.map(async (band, bandIndex) => {
      const dataUrl = indicesToPngDataUrl(band.width, band.height, band.indices, band.palette)
      const imageData = await decodeImageData(dataUrl)
      const validation = validateForExport(imageData)
      if (!validation.ok) {
        throw new Error(
          `O conjunto de blocos reconstruído (banco ${bandIndex}) da fase não passou na validação ` +
            `(${validation.errors.join(' ')}) — os arquivos exportados podem estar corrompidos.`,
        )
      }
      const image: ImportedImage = {
        fileName: band.label,
        width: band.width,
        height: band.height,
        sizeBytes: dataUrl.length,
        dataUrl,
      }
      return { image, validation }
    }),
  )

  const tilesets: StageTilesetInput[] = reconstructedImages.map(({ image, validation }) => ({
    upload: { width: image.width, height: image.height, indices: validation.indices, palette: validation.palette, label: image.fileName },
    blockSize: 8,
    // sem `name`/`version` — sintético, não existe tileset salvo nenhum por trás (ver
    // StageTilesetInput em combineTilesets.ts).
  }))

  return {
    tilesets,
    tileCollision: reconstructed.tileCollision,
    tileLayer,
    tilePriority: new Map(), // fallback de reconstrução por pixel não recupera prioridade (ver comentário acima)
    widthTiles: reconstructed.widthTiles,
    seed: { grid: reconstructed.grid, gridLayer2, entities },
    staleness: [],
  }
}

/** Ponto de entrada único pra reabrir a fase salva — tenta o caminho principal (referência por
 * nome) primeiro, cai pro fallback (reconstrução por pixel) se o sidecar não existir, estiver
 * corrompido, ou referenciar um tileset que foi apagado. */
export async function loadStageProject(): Promise<LoadedStageProject> {
  try {
    return await loadStageProjectFromRefs()
  } catch {
    return loadStageProjectFromPixels()
  }
}

/** Verificação LEVE de "a fase salva está desatualizada em relação aos tilesets que ela
 * referencia?" — só lê o sidecar + o `.json` de metadados de cada tileset referenciado (não a
 * imagem inteira), pra mostrar já na lista de fases salvas (`SavedStage.tsx`), antes de clicar
 * "Editar". Devolve lista vazia se não há sidecar (fase antiga) ou algum tileset referenciado não
 * existe mais — nesses casos não há "desatualizado", só "sem referência pra comparar". */
export async function checkStageStaleness(): Promise<TilesetStaleness[]> {
  try {
    const refsText = await readGfxFileText(STAGE_TILESET_REFS_FILE)
    const refs = parseStageTilesetRefs(refsText)
    const currentVersions = await Promise.all(refs.tilesets.map((ref) => loadRefAsset(ref).then((t) => t.meta.version)))
    return refs.tilesets
      .map((ref, i) => ({ name: ref.name, savedVersion: ref.version, currentVersion: currentVersions[i] }))
      .filter((entry) => entry.savedVersion !== entry.currentVersion)
  } catch {
    return []
  }
}
