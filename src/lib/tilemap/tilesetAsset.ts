// Metadados de um tileset SALVO (docs/PROGRESS.md, "tilesets como recurso salvo e reutilizável",
// 2026-09-23) — arquivo `<nome>_tileset.json`, irmão de `<nome>_tileset.bmp` (a imagem original
// importada, sem fatiar — ver tilesetFiles.ts/loadTileset.ts). Puro JSON, sem parser de C: a
// Anubis NUNCA lê esse arquivo (fica em `assets/tilesets/` deste projeto, não em
// `jogo-plataforma-snes/`), então não tem contrato nenhum a preservar aqui além de nós mesmos —
// diferente de todo outro `.h` exportado nesta pasta.

import {
  STAGE_BLOCK_SIZES,
  TERRAIN_ROLES,
  type CollisionKind,
  type StageBlockSize,
  type TerrainGroup,
  type TerrainRole,
  type TileLayer,
} from './types.ts'

export interface TilesetMeta {
  /** Incrementa a cada "Salvar tileset" (1 na criação) — docs/PROGRESS.md, "fase referencia
   * tileset por nome" (2026-09-23): é o que permite uma fase salva saber se o tileset que ela usa
   * mudou desde que foi salva (comparação simples de número, sem precisar comparar pixel a pixel
   * nem colisão/camada campo a campo). Sobe mesmo se o usuário reabrir e salvar sem mudar nada de
   * verdade — trade-off aceito: um falso positivo ocasional ("mudou" quando na prática não mudou
   * nada) é muito mais barato que tentar detectar mudança "de verdade" byte a byte. */
  version: number
  blockSize: StageBlockSize
  /** Índice do bloco -> colisão. Bloco sem entrada é 'empty' (padrão, ver types.ts). */
  collision: Map<number, CollisionKind>
  /** Índice do bloco -> camada. Bloco sem entrada é Camada 1 (padrão, ver types.ts). */
  layer: Map<number, TileLayer>
  /** Índice do bloco -> `true` quando marcado "desenha na frente do jogador/inimigo" (docs/
   * DATA_FORMAT.md § 4, "Bit de prioridade por tile da Camada 1", 2026-10-01/02) — só faz sentido
   * pra blocos de Camada 1 (a Camada 2 fica sempre atrás dos sprites, por definição do formato);
   * bloco sem entrada ou de Camada 2 é `false`/normal. Independente da colisão (poste/moita
   * normalmente vazio + marcado). */
  priority: Map<number, boolean>
  /** Grupos de terreno inteligente (autotile, docs/PROGRESS.md "tilesets inteligentes",
   * 2026-09-23) — cada um agrupa até 9 blocos JÁ existentes deste tileset como variantes visuais da
   * mesma coisa de gameplay. Vazio = tileset sem nenhum terreno agrupado (comportamento de sempre,
   * só pincel avulso). */
  terrainGroups: TerrainGroup[]
}

const VALID_COLLISION: ReadonlySet<string> = new Set(['empty', 'solid', 'goal'])
const VALID_TERRAIN_ROLES: ReadonlySet<string> = new Set(TERRAIN_ROLES)

/** Serializa pra JSON — só grava entradas de colisão/camada que não são o padrão (mesmo espírito
 * enxuto de `Map<number, CollisionKind>` em memória: bloco "vazio"/Camada 1 nunca precisa de
 * entrada). */
export function generateTilesetMeta(meta: TilesetMeta): string {
  const collision: Record<string, CollisionKind> = {}
  for (const [tileIndex, kind] of meta.collision) {
    if (kind !== 'empty') collision[tileIndex] = kind
  }
  const layer: Record<string, TileLayer> = {}
  for (const [tileIndex, value] of meta.layer) {
    if (value === 2) layer[tileIndex] = value
  }
  const priority: Record<string, true> = {}
  for (const [tileIndex, value] of meta.priority) {
    if (value) priority[tileIndex] = true
  }
  return JSON.stringify(
    { version: meta.version, blockSize: meta.blockSize, collision, layer, priority, terrainGroups: meta.terrainGroups },
    null,
    2,
  )
}

/** Inverso da parte de `terrainGroups` de `generateTilesetMeta` — entrada inválida/incompleta do
 * ARRAY inteiro é ignorada (não lança: o resto do tileset continua utilizável mesmo que um grupo
 * tenha ficado corrompido), mesmo espírito de `parseTilesetMeta` pra colisão/camada. */
function parseTerrainGroups(raw: unknown): TerrainGroup[] {
  if (!Array.isArray(raw)) return []
  const groups: TerrainGroup[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const g = entry as Record<string, unknown>
    if (typeof g.name !== 'string' || g.name.trim() === '') continue
    if (typeof g.collision !== 'string' || !VALID_COLLISION.has(g.collision)) continue
    if (g.layer !== 1 && g.layer !== 2) continue
    const roles: Partial<Record<TerrainRole, number>> = {}
    if (g.roles && typeof g.roles === 'object') {
      for (const [role, blockIndex] of Object.entries(g.roles as Record<string, unknown>)) {
        if (VALID_TERRAIN_ROLES.has(role) && typeof blockIndex === 'number' && Number.isInteger(blockIndex) && blockIndex >= 0) {
          roles[role as TerrainRole] = blockIndex
        }
      }
    }
    groups.push({ name: g.name, collision: g.collision as CollisionKind, layer: g.layer, roles })
  }
  return groups
}

/** Inverso de `generateTilesetMeta`. Lança com mensagem em português se o JSON estiver
 * corrompido/num formato inesperado — mesmo padrão de erro dos outros parsers desta pasta.
 * Metadados salvos ANTES do campo `version` existir (não deveria acontecer em produção — o campo
 * já nasceu junto com o formato — mas cobre por segurança) caem pra versão 1. */
export function parseTilesetMeta(text: string): TilesetMeta {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('O arquivo de metadados do tileset não é um JSON válido.')
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('O arquivo de metadados do tileset não tem o formato esperado (objeto JSON).')
  }
  const obj = raw as Record<string, unknown>

  const blockSize = obj.blockSize
  if (!STAGE_BLOCK_SIZES.includes(blockSize as StageBlockSize)) {
    throw new Error(`Tamanho de bloco inválido nos metadados do tileset: ${JSON.stringify(blockSize)}.`)
  }
  const version = typeof obj.version === 'number' && Number.isInteger(obj.version) && obj.version > 0 ? obj.version : 1

  const collision = new Map<number, CollisionKind>()
  if (obj.collision && typeof obj.collision === 'object') {
    for (const [key, value] of Object.entries(obj.collision as Record<string, unknown>)) {
      if (typeof value === 'string' && VALID_COLLISION.has(value)) {
        collision.set(Number(key), value as CollisionKind)
      }
    }
  }

  const layer = new Map<number, TileLayer>()
  if (obj.layer && typeof obj.layer === 'object') {
    for (const [key, value] of Object.entries(obj.layer as Record<string, unknown>)) {
      if (value === 2) layer.set(Number(key), 2)
    }
  }

  const priority = new Map<number, boolean>()
  if (obj.priority && typeof obj.priority === 'object') {
    for (const [key, value] of Object.entries(obj.priority as Record<string, unknown>)) {
      if (value === true) priority.set(Number(key), true)
    }
  }

  return {
    version,
    blockSize: blockSize as StageBlockSize,
    collision,
    layer,
    priority,
    terrainGroups: parseTerrainGroups(obj.terrainGroups),
  }
}

/** Nome de arquivo seguro a partir do nome digitado pelo usuário — mesma ideia de
 * `sanitizeIdentifier` (animationSequence.ts), mas pra virar nome de ARQUIVO, não identificador C:
 * minúsculas, espaços viram `_`, remove tudo que não for letra/número/`_`/`-`. Nunca vazio (usa
 * "tileset" como fallback) — evita salvar com um nome de arquivo inválido/vazio silenciosamente. */
export function sanitizeTilesetFileName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
  return cleaned || 'tileset'
}
