import { COLLISION_VALUES, HARDWARE_TILE_SIZE, stageGridCols, stageGridRows, type CollisionKind, type StageGrid } from './types.ts'

/**
 * Gera o `.h` de colisão da fase — mesmo espírito dos outros exports desta
 * tela (dado estático em C, sem parser nenhum): um array `u8[32*cols]` com
 * 0=vazio/1=sólido/2=bandeira, na MESMA ordem (`row*cols+col`) que
 * `tilemapData`/`tilemapStreamUpdate()` já usam em `src/tilemap.c` da
 * engine — SEMPRE na granularidade de tiles de 8x8 (fixa, hardware).
 *
 * `widthTiles` (docs/PROGRESS.md, "fases largas de verdade", 2026-09-24) é a largura ESCOLHIDA da
 * fase — `STAGE1_COLLISION_COLS` sai com esse valor (a Anubis lê a largura real do `#define`, não
 * assume 32 fixo; altura continua sempre 32, restrição real dela, ver `STAGE_HEIGHT_TILES`).
 *
 * `grid` já vem nessa MESMA granularidade de hardware (docs/DATA_FORMAT.md
 * § 4, "cursor de posicionamento sempre em 8px", 2026-09-23) — cada célula
 * guarda um índice de tile de HARDWARE (8x8) do tileset combinado a 8px.
 * `tileCollision` (docs/PROGRESS.md, "tilesets como recurso salvo e
 * reutilizável", 2026-09-23) agora já vem indexada por TILE DE HARDWARE
 * também — cada tileset salvo tem seu próprio `blockSize`, então não existe
 * mais um "índice de bloco numa combinação a um blockSize só" único e
 * correto quando se combina tilesets com blockSize diferente entre si (ver
 * mergeTilesetMeta.ts). Isso também bate exatamente com o que
 * `reconstructStage.ts` já produzia (sempre trabalhou a 8px), então os dois
 * caminhos (tileset da galeria ou fase reaberta por reconstrução de pixel)
 * usam a MESMA convenção sem precisar traduzir nada aqui.
 */
export function generateCollisionHeader(
  baseName: string,
  sourceFileName: string,
  grid: StageGrid,
  tileCollision: ReadonlyMap<number, CollisionKind>,
  widthTiles: number,
): string {
  const upper = baseName.toUpperCase()
  const cols = stageGridCols(HARDWARE_TILE_SIZE, widthTiles)
  const rows = stageGridRows(HARDWARE_TILE_SIZE)

  const values = new Array<number>(cols * rows)
  for (let i = 0; i < values.length; i++) {
    values[i] = COLLISION_VALUES[tileCollision.get(grid[i]) ?? 'empty']
  }

  return [
    `/* gerado pelo snes-asset-editor a partir de ${sourceFileName} — não editar à mão */`,
    `#define ${upper}_COLLISION_ROWS ${rows}`,
    `#define ${upper}_COLLISION_COLS ${cols}`,
    `static const u8 ${baseName}_collision[${upper}_COLLISION_ROWS * ${upper}_COLLISION_COLS] = {`,
    `  ${values.join(', ')}`,
    '};',
    '',
  ].join('\n')
}

/**
 * Gera o `.txt` de prioridade por tile da Camada 1 — docs/DATA_FORMAT.md § 4, "Bit de prioridade
 * por tile da Camada 1" (2026-10-01/02): texto puro, exatamente `STAGE_HEIGHT_TILES` (32) linhas,
 * cada uma com exatamente `cols` caracteres `0`/`1` (mesma largura que `_COLLISION_COLS` no `.h` de
 * colisão — não repetida aqui, a Anubis já sabe o valor por aquele define). `1` = tile na frente do
 * sprite, `0` = normal. SEMPRE as 32 linhas inteiras, mesmo sem nenhum bloco marcado (tudo `0`) —
 * decisão explícita (mesma lição da Camada 2, docs/PROGRESS.md "export de Camada 2 ficando
 * desatualizado": evita qualquer ambiguidade de arquivo ausente/órfão, a Anubis aceita os dois
 * jeitos mas sempre exportar é mais simples e mais seguro).
 *
 * `grid`/`tilePriority` na MESMA convenção de `generateCollisionHeader` — índice de tile de
 * HARDWARE (8x8) do tileset combinado, não índice de bloco (ver mergeTilesetMeta.ts).
 */
export function generateTilePriorityText(grid: StageGrid, tilePriority: ReadonlyMap<number, boolean>, widthTiles: number): string {
  const cols = stageGridCols(HARDWARE_TILE_SIZE, widthTiles)
  const rows = stageGridRows(HARDWARE_TILE_SIZE)

  const lines: string[] = []
  for (let row = 0; row < rows; row++) {
    let line = ''
    for (let col = 0; col < cols; col++) {
      line += tilePriority.get(grid[row * cols + col]) ? '1' : '0'
    }
    lines.push(line)
  }
  return lines.join('\n') + '\n'
}

export interface CollisionSummary {
  empty: number
  solid: number
  goal: number
}

/**
 * Quantas células (das `HARDWARE_ROWS*HARDWARE_COLS` da fase) exportariam cada tipo de colisão — mesma
 * matemática de `generateCollisionHeader`, só que devolve os TIPOS em vez do `.h` em texto, pra dar
 * pra avisar o usuário ANTES de salvar (docs/PROGRESS.md, "aviso de proporção alta de bandeira",
 * 2026-09-23). Achado real que motivou isso: a Camada 1 nunca tem célula "vazia" de verdade — toda
 * célula NUNCA pintada guarda o índice de tile de hardware `0` por padrão (`new Uint16Array` zera
 * sozinho), que é sempre o bloco 0 do PRIMEIRO tileset escolhido pra fase. Se esse bloco específico
 * estiver marcado como colisão perigosa (bandeira, ou até sólido sem querer), TODA a área nunca
 * pintada da fase herda esse valor silenciosamente — um usuário relatou uma fase inteira virando
 * "bandeira" (632 de 1024 células, exatamente as que não tinham chão pintado) por causa disso, sem
 * nenhum aviso na hora de salvar.
 */
export function summarizeCollision(grid: StageGrid, tileCollision: ReadonlyMap<number, CollisionKind>): CollisionSummary {
  const summary: CollisionSummary = { empty: 0, solid: 0, goal: 0 }
  for (let i = 0; i < grid.length; i++) {
    summary[tileCollision.get(grid[i]) ?? 'empty']++
  }
  return summary
}
