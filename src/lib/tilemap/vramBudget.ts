// Orçamento de VRAM de uma camada (docs/PROGRESS.md, "fases largas de verdade", 2026-09-24) — cada
// camada tem um espaço FIXO reservado pro tileset dela na VRAM da Anubis (ver
// VRAM_LAYER1_MAX_UNIQUE_TILES/VRAM_LAYER2_MAX_UNIQUE_TILES, types.ts), e ela não detecta sozinha
// hoje se uma fase larga/variada estourar isso — só sobrescreve dado adjacente em silêncio. Esse
// módulo conta quantos tiles de hardware (8x8) ÚNICOS uma imagem já composta teria depois do dedup
// do gfx4snes, pra avisar ANTES de exportar.

import { HARDWARE_TILE_SIZE } from './types.ts'

/** Mesmo dedup que o `gfx4snes` faz de verdade (comparação exata de pixel — já confirmado contra o
 * binário real em `reconstructStage.ts`/`combineTilesets.ts`), aplicado a uma imagem JÁ composta
 * (`composeLevel`) em vez de reconstruir tilesets a partir dela — aqui só interessa a CONTAGEM.
 * Assume `level.width`/`level.height` múltiplos de `HARDWARE_TILE_SIZE` (sempre verdade pra uma
 * imagem vinda de `composeLevel`). */
export function countUniqueHardwareTiles(level: { width: number; height: number; indices: Uint8Array }): number {
  const cols = level.width / HARDWARE_TILE_SIZE
  const rows = level.height / HARDWARE_TILE_SIZE
  const seen = new Set<string>()
  const block = new Uint8Array(HARDWARE_TILE_SIZE * HARDWARE_TILE_SIZE)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ox = col * HARDWARE_TILE_SIZE
      const oy = row * HARDWARE_TILE_SIZE
      for (let y = 0; y < HARDWARE_TILE_SIZE; y++) {
        for (let x = 0; x < HARDWARE_TILE_SIZE; x++) {
          block[y * HARDWARE_TILE_SIZE + x] = level.indices[(oy + y) * level.width + ox + x]
        }
      }
      seen.add(block.join(','))
    }
  }

  return seen.size
}
