// Descoberta da fase já exportada em assets/gfx/ (mesmo espírito de
// characterDiscovery.ts, mas bem mais simples: só existe UMA fase possível
// hoje, `STAGE_BASE_NAME` — ver docs/DATA_FORMAT.md § 4). Reabrir pra
// editar (ver loadStage.ts) prefere `STAGE_TILESET_REFS_FILE` (fase
// referencia tileset salvo por nome, 2026-09-23) — sem perda nenhuma, ao
// contrário do fallback antigo (reconstrução por pixel, sempre em blocos
// de 8×8), usado só pra fases salvas antes desse arquivo existir.

import { STAGE_BASE_NAME } from '../../lib/tilemap/types.ts'
import type { GfxFileEntry } from './characterDiscovery'

export const STAGE_TILEMAP_FILE = `${STAGE_BASE_NAME}_tilemap.bmp`
export const STAGE_COLLISION_FILE = `${STAGE_BASE_NAME}_collision.h`
/** Opcional (2026-09-21, editor de fase v2 fase 1) — fases salvas antes dessa etapa não têm esse
 * arquivo; `loadStage.ts` trata a ausência dele como "nenhuma entidade posicionada ainda". */
export const STAGE_ENTITIES_FILE = `${STAGE_BASE_NAME}_entities.h`
/** Opcional (2026-09-22, "2ª camada de tileset", docs/DATA_FORMAT.md § 4) — só existe se a fase
 * usa a Camada 2 (decoração, sem colisão); `loadStage.ts` trata a ausência como "sem Camada 2". */
export const STAGE_TILEMAP_LAYER2_FILE = `${STAGE_BASE_NAME}_tilemap_layer2.bmp`
/** Opcional (2026-09-23, "fase referencia tileset por nome") — sidecar Prometeus-only (a Anubis
 * nunca lê); ausente = fase salva antes desse recurso existir, ou tilesets usados foram
 * apagados — `loadStage.ts` cai pro fallback de reconstrução por pixel nesses casos. */
export const STAGE_TILESET_REFS_FILE = `${STAGE_BASE_NAME}_tileset_refs.json`
/** Sempre exportado, mesmo vazio/tudo "0" (docs/DATA_FORMAT.md § 4, "Bit de prioridade por tile da
 * Camada 1", 2026-10-02 — mesma decisão de sempre exportar `STAGE_TILEMAP_LAYER2_FILE`, evita
 * arquivo órfão/desatualizado). Aplicado pelo `build/apply_tile_priority.pl` da Anubis direto no
 * `.map` já convertido — não tem `.pic`/`.pal`/`.map` PRÓPRIO derivado dele. */
export const STAGE_TILEMAP_PRIORITY_FILE = `${STAGE_BASE_NAME}_tilemap_priority.txt`

/** Arquivos gerados pela fase (incluindo os derivados pelo gfx4snes) — usado só pra excluir. */
export const STAGE_FILE_NAMES = [
  STAGE_TILEMAP_FILE,
  STAGE_COLLISION_FILE,
  STAGE_ENTITIES_FILE,
  STAGE_TILEMAP_LAYER2_FILE,
  STAGE_TILESET_REFS_FILE,
  STAGE_TILEMAP_PRIORITY_FILE,
  `${STAGE_BASE_NAME}_tilemap.pic`,
  `${STAGE_BASE_NAME}_tilemap.pal`,
  `${STAGE_BASE_NAME}_tilemap.map`,
  `${STAGE_BASE_NAME}_tilemap.inc`,
  `${STAGE_BASE_NAME}_tilemap_data.as`,
  `${STAGE_BASE_NAME}_tilemap_layer2.pic`,
  `${STAGE_BASE_NAME}_tilemap_layer2.pal`,
  `${STAGE_BASE_NAME}_tilemap_layer2.map`,
  `${STAGE_BASE_NAME}_tilemap_layer2.inc`,
  `${STAGE_BASE_NAME}_tilemap_layer2_data.as`,
]

/** A fase existe quando os dois arquivos NÃO OPCIONAIS que o Prometeus gera estão presentes —
 * `_entities.h` é opcional (ver acima), não entra nessa checagem. */
export function stageExists(files: ReadonlyArray<GfxFileEntry>): boolean {
  const names = new Set(files.map((f) => f.name))
  return names.has(STAGE_TILEMAP_FILE) && names.has(STAGE_COLLISION_FILE)
}
