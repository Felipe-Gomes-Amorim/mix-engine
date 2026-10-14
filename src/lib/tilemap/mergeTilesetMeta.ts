// Combina os metadados (colisão/camada por bloco) de vários tilesets SALVOS — cada um com o seu
// próprio `blockSize` — num único par de mapas indexados por TILE DE HARDWARE (8px), no espaço do
// tileset combinado a 8px da fase (docs/PROGRESS.md, "tilesets como recurso salvo e reutilizável",
// 2026-09-23).
//
// Por que hardware-indexado e não "block index numa combinação a um blockSize só": tilesets
// salvos podem ter blockSize DIFERENTE um do outro (cada um escolhido na hora de criar aquele
// tileset, na aba "Tilesets") — não existe um "blockSize da combinação" único e correto quando se
// combina, por exemplo, um tileset de 16px com um de 32px. Índice de tile de HARDWARE não tem essa
// ambiguidade (é sempre 8px, universal) — é também exatamente a convenção que `reconstructStage.ts`
// já usa (ver StageSession.tsx: os dois caminhos, tileset escolhido da galeria ou fase reaberta por
// reconstrução de pixel, convergem pro mesmo formato de `tileCollision`/`tileLayer`).

import { bandGlobalTileIndex, blockToHardwareTopLeft, combineTilesets, type TilesetUpload } from './combineTilesets.ts'
import { buildTileset } from './tileset.ts'
import type { TilesetMeta } from './tilesetAsset.ts'
import { HARDWARE_TILE_SIZE, type CollisionKind, type TileLayer } from './types.ts'

export interface MergedTilesetMeta {
  collision: Map<number, CollisionKind>
  layer: Map<number, TileLayer>
  /** Hardware index -> `true` quando marcado "desenha na frente do jogador/inimigo" (docs/
   * DATA_FORMAT.md § 4, "Bit de prioridade por tile da Camada 1", 2026-10-01/02). Só blocos de
   * Camada 1 chegam a ter entrada aqui (TilesetEditor.tsx já limpa a marcação ao virar Camada 2). */
  priority: Map<number, boolean>
}

/** `tilesets[i]` precisa estar na MESMA ordem que os uploads passados pra `combineTilesets` que
 * gerou `hardwareCombined` (StageSession.tsx sempre monta os dois a partir da mesma lista, então
 * isso é automático — só importa se alguém reusar esta função separado disso). */
export function mergeTilesetMetaToHardware(
  hardwareCombined: ReturnType<typeof combineTilesets>,
  tilesets: readonly (TilesetUpload & { meta: TilesetMeta })[],
): MergedTilesetMeta {
  const collision = new Map<number, CollisionKind>()
  const layer = new Map<number, TileLayer>()
  const priority = new Map<number, boolean>()

  tilesets.forEach((t, i) => {
    const band = hardwareCombined.bands[i]
    const ownTileset = buildTileset(t.width, t.height, t.indices, t.meta.blockSize)
    const scale = t.meta.blockSize / HARDWARE_TILE_SIZE

    function forEachHardwareIndex(blockIndex: number, fn: (hardwareIndex: number) => void) {
      const topLeft = blockToHardwareTopLeft(ownTileset, blockIndex)
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const localHardwareIndex = (topLeft.row + dy) * band.cols + (topLeft.col + dx)
          fn(bandGlobalTileIndex(band, localHardwareIndex, hardwareCombined.tileset.cols))
        }
      }
    }

    for (const [blockIndex, kind] of t.meta.collision) {
      forEachHardwareIndex(blockIndex, (hardwareIndex) => collision.set(hardwareIndex, kind))
    }
    for (const [blockIndex, value] of t.meta.layer) {
      forEachHardwareIndex(blockIndex, (hardwareIndex) => layer.set(hardwareIndex, value))
    }
    for (const [blockIndex, value] of t.meta.priority) {
      if (value) forEachHardwareIndex(blockIndex, (hardwareIndex) => priority.set(hardwareIndex, true))
    }
  })

  return { collision, layer, priority }
}
