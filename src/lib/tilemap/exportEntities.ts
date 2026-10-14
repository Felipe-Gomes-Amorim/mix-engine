import { backdropColorToSnes5Bit } from './backdropColor.ts'
import {
  DEFAULT_SPECIAL_PROPERTY_ID,
  SPECIAL_PROPERTIES,
  type DecorInstance,
  type EnemyInstance,
  type PlayerSpawn,
  type StageEntities,
} from './entities.ts'
import type { RgbColor } from '../indexedBmp.ts'

/** `specialPropertyId` -> valor numérico exportado (docs/DATA_FORMAT.md § 3, "Comportamento de
 * objeto: colisão + propriedade especial", 2026-10-10) — id desconhecido (não deveria acontecer,
 * mas por segurança) cai no valor de "nenhuma". */
function specialExportValue(specialPropertyId: string): number {
  return SPECIAL_PROPERTIES.find((p) => p.id === specialPropertyId)?.exportValue ?? 0
}

/** Inverso de `specialExportValue` — valor desconhecido (export mais novo que este editor, ou
 * arquivo corrompido) cai em `DEFAULT_SPECIAL_PROPERTY_ID` ("nenhuma"), mesmo espírito do resto
 * deste arquivo: nunca propagar lixo, sempre um padrão seguro. */
function specialPropertyIdFromExportValue(value: number): string {
  return SPECIAL_PROPERTIES.find((p) => p.exportValue === value)?.id ?? DEFAULT_SPECIAL_PROPERTY_ID
}

/** Nunca deixa passar `NaN`/`Infinity`/`undefined` pro `.h` exportado — viraria um token inválido
 * de C (ex.: o literal `NaN`, ou um buraco vazio em `{ }`) e quebra o build da Anubis com um erro
 * réptil de achar ("'NaN' undeclared"). Achado real (2026-09-22): um `<input type="number">`
 * controlado sem rascunho próprio deixava `Number('-')` (só o sinal, digitando um offset
 * negativo) virar `NaN` direto no estado, exportado sem checagem nenhuma. Corrigido na origem do
 * lado da UI (`PatrolOffsetInput` em StageEditor.tsx), mas esta função também nunca deveria
 * CONSEGUIR gerar C inválido, não importa o que vier no `EnemyInstance` — última linha de defesa
 * antes de virar arquivo. Usada tanto aqui (export) quanto em `parseEntitiesHeader` (pra um
 * arquivo JÁ corrompido, ou com array mais curto que `_ENEMY_COUNT`, se autocurar ao reabrir em
 * vez de propagar o problema pra sempre). */
function sanitizeOffset(value: number | undefined): number {
  return Number.isFinite(value) ? (value as number) : 0
}

/**
 * Gera o `.h` de posicionamento de entidades (docs/DATA_FORMAT.md § 4,
 * "Resposta do Prometeus aos pontos em aberto") — arrays paralelos, sem
 * struct exportada (evita layout de struct sincronizado à mão entre os
 * dois lados, mesmo espírito de todo o resto desta seção: dado estático
 * em C, sem parser).
 *
 * 816-tcc não compila array de tamanho 0: com `enemies.length === 0`,
 * ainda declara 1 elemento de sobra (nunca lido do lado do Anubis, cujo
 * loop é limitado por `<BASE>_ENEMY_COUNT`, que continua 0 nesse caso).
 *
 * `backdropColor` (docs/DATA_FORMAT.md § 4, "Cor de fundo fixa da fase (backdrop)", 2026-10-01) —
 * aditivo, 3 defines opcionais `<BASE>_BACKDROP_R/G/B`. `undefined` OMITE os 3 (mesmo espírito
 * enxuto do resto deste arquivo) — a engine trata ausência como preto explícito (0,0,0), ver
 * DATA_FORMAT.md. Sempre os 3 juntos quando presente (nunca parcial, sem motivo pra isso). Valor
 * 0-255 (RGB web, mesma paleta de tileset) convertido pro nativo SNES (5 bits/canal) com
 * `backdropColorToSnes5Bit` — conversão/arredondamento pra EXIBIR fica em StageSession.tsx
 * (`roundTripBackdropColor`), nunca aqui (este arquivo só escreve o valor exato já convertido).
 *
 * `decorations` (docs/DATA_FORMAT.md § 3, "Slot de decoração estática `decor1`", 2026-10-05) —
 * aditivo, arrays `<BASE>_decor_*` paralelos. DIFERENTE do array de inimigos: lista vazia OMITE
 * o bloco inteiro (nem `STAGE1_DECOR_COUNT`), não declara um array de 1 elemento de sobra — a
 * Anubis trata a ausência do define como "nenhuma decoração" (§ 3: "Opcional: sem
 * STAGE1_DECOR_COUNT = nenhuma decoração"), diferente do array de inimigos que sempre existiu e
 * sempre é lido (ainda que com count 0).
 *
 * `<BASE>_DECOR_HAS_BEHAVIOR` + `_decor_collision`/`_decor_special` (docs/DATA_FORMAT.md § 3,
 * "Comportamento de objeto: colisão + propriedade especial", 2026-10-10) — sempre os 3 juntos
 * quando há QUALQUER decoração (nunca parcial, mesmo objeto sem nada marcado exporta `0`/`0` —
 * "Exportar os 3 juntos, sempre que houver objetos"), nunca sozinhos sem o bloco de decoração
 * básico acima.
 */
export function generateEntitiesHeader(
  baseName: string,
  sourceFileName: string,
  player: PlayerSpawn,
  enemies: readonly EnemyInstance[],
  backdropColor?: RgbColor,
  decorations?: readonly DecorInstance[],
): string {
  const upper = baseName.toUpperCase()
  const arraySize = Math.max(1, enemies.length)
  const padded: readonly EnemyInstance[] =
    enemies.length > 0
      ? enemies
      : [{ typeIndex: 0, x: 0, y: 0, hasPatrolLimit: false, patrolMinOffsetX: 0, patrolMaxOffsetX: 0 }]
  const backdrop5Bit = backdropColor ? backdropColorToSnes5Bit(backdropColor) : null

  return [
    `/* gerado pelo snes-asset-editor a partir de ${sourceFileName} — não editar à mão */`,
    `#define ${upper}_PLAYER_SPAWN_X ${player.x}`,
    `#define ${upper}_PLAYER_SPAWN_Y ${player.y}`,
    '',
    ...(backdrop5Bit
      ? [
          `#define ${upper}_BACKDROP_R ${backdrop5Bit[0]}`,
          `#define ${upper}_BACKDROP_G ${backdrop5Bit[1]}`,
          `#define ${upper}_BACKDROP_B ${backdrop5Bit[2]}`,
          '',
        ]
      : []),
    `#define ${upper}_ENEMY_COUNT ${enemies.length}`,
    `static const u8  ${baseName}_enemy_type[${arraySize}]  = { ${padded.map((e) => e.typeIndex).join(', ')} };`,
    `static const s16 ${baseName}_enemy_x[${arraySize}]     = { ${padded.map((e) => e.x).join(', ')} };`,
    `static const s16 ${baseName}_enemy_y[${arraySize}]     = { ${padded.map((e) => e.y).join(', ')} };`,
    `static const u8  ${baseName}_enemy_has_patrol_limit[${arraySize}] = { ${padded.map((e) => (e.hasPatrolLimit ? 1 : 0)).join(', ')} };`,
    `static const s16 ${baseName}_enemy_patrol_min_x[${arraySize}] = { ${padded.map((e) => sanitizeOffset(e.patrolMinOffsetX)).join(', ')} };`,
    `static const s16 ${baseName}_enemy_patrol_max_x[${arraySize}] = { ${padded.map((e) => sanitizeOffset(e.patrolMaxOffsetX)).join(', ')} };`,
    '',
    ...(decorations && decorations.length > 0
      ? [
          `#define ${upper}_DECOR_COUNT ${decorations.length}`,
          `static const u8  ${baseName}_decor_type[${decorations.length}]  = { ${decorations.map((d) => d.typeIndex).join(', ')} };`,
          `static const u8  ${baseName}_decor_frame[${decorations.length}] = { ${decorations.map((d) => d.frame).join(', ')} };`,
          `static const s16 ${baseName}_decor_x[${decorations.length}]     = { ${decorations.map((d) => d.x).join(', ')} };`,
          `static const s16 ${baseName}_decor_y[${decorations.length}]     = { ${decorations.map((d) => d.y).join(', ')} };`,
          `#define ${upper}_DECOR_HAS_BEHAVIOR 1`,
          `static const u8  ${baseName}_decor_collision[${decorations.length}] = { ${decorations.map((d) => (d.solid ? 1 : 0)).join(', ')} };`,
          `static const u8  ${baseName}_decor_special[${decorations.length}]   = { ${decorations.map((d) => specialExportValue(d.specialPropertyId)).join(', ')} };`,
          '',
        ]
      : []),
  ].join('\n')
}

function requiredDefine(text: string, name: string): number {
  const match = text.match(new RegExp(`#define\\s+${name}\\s+(-?\\d+)`))
  if (!match) throw new Error(`Não encontrei "#define ${name}" no header de entidades.`)
  return Number(match[1])
}

function tryRequiredDefine(text: string, name: string): number | null {
  try {
    return requiredDefine(text, name)
  } catch {
    return null
  }
}

/** Array nomeado qualquer (ex.: `stage1_enemy_x`, `stage1_decor_x`) — `arrayName` já vem com o
 * prefixo todo (baseName + categoria + campo), não só o nome do campo, pra servir tanto os arrays
 * de inimigo quanto os de decoração sem precisar saber de antemão qual categoria é. */
function parseNamedArray(text: string, arrayName: string): number[] {
  const pattern = new RegExp(`${arrayName}\\[\\d+\\]\\s*=\\s*\\{([^}]*)\\}`)
  const match = text.match(pattern)
  if (!match) throw new Error(`Não encontrei "${arrayName}" no header de entidades.`)
  return match[1]
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map(Number)
}

function tryParseNamedArray(text: string, arrayName: string): number[] | null {
  try {
    return parseNamedArray(text, arrayName)
  } catch {
    return null
  }
}

function parseEnemyArray(baseName: string, text: string, fieldName: string): number[] {
  return parseNamedArray(text, `${baseName}_enemy_${fieldName}`)
}

function tryParseEnemyArray(baseName: string, text: string, fieldName: string): number[] | null {
  return tryParseNamedArray(text, `${baseName}_enemy_${fieldName}`)
}

/** Inverso de `generateEntitiesHeader`. Lê o formato novo (patrulha relativa e opcional,
 * docs/DATA_FORMAT.md § 4, 2026-09-22); se não achar (`_enemy_has_patrol_limit` ausente — arquivo
 * de uma fase salva ANTES dessa mudança), migra do formato antigo (`_enemy_min_x`/`_max_x`
 * absolutos) em vez de lançar erro: toda fase antiga tinha a coleira sempre ativa, então
 * `hasPatrolLimit` vira `true` e os offsets saem de `minX/maxX - x`. Sem essa migração, reabrir
 * uma fase salva antes de hoje perderia os inimigos em silêncio (loadStage.ts trata qualquer erro
 * aqui como "sem entidades ainda", não como falha — bom pra arquivo ausente, ruim pra dado real
 * perdido sem aviso). */
export function parseEntitiesHeader(baseName: string, text: string): StageEntities {
  const upper = baseName.toUpperCase()
  const player: PlayerSpawn = {
    x: requiredDefine(text, `${upper}_PLAYER_SPAWN_X`),
    y: requiredDefine(text, `${upper}_PLAYER_SPAWN_Y`),
  }
  const count = requiredDefine(text, `${upper}_ENEMY_COUNT`)

  const types = parseEnemyArray(baseName, text, 'type')
  const xs = parseEnemyArray(baseName, text, 'x')
  const ys = parseEnemyArray(baseName, text, 'y')

  const hasPatrolLimits = tryParseEnemyArray(baseName, text, 'has_patrol_limit')
  const patrolMinXs = tryParseEnemyArray(baseName, text, 'patrol_min_x')
  const patrolMaxXs = tryParseEnemyArray(baseName, text, 'patrol_max_x')

  const enemies: EnemyInstance[] = []
  if (hasPatrolLimits && patrolMinXs && patrolMaxXs) {
    for (let i = 0; i < count; i++) {
      enemies.push({
        typeIndex: types[i],
        x: xs[i],
        y: ys[i],
        hasPatrolLimit: hasPatrolLimits[i] === 1,
        patrolMinOffsetX: sanitizeOffset(patrolMinXs[i]),
        patrolMaxOffsetX: sanitizeOffset(patrolMaxXs[i]),
      })
    }
  } else {
    // Formato antigo (absoluto) — migração, ver comentário da função.
    const minXs = parseEnemyArray(baseName, text, 'min_x')
    const maxXs = parseEnemyArray(baseName, text, 'max_x')
    for (let i = 0; i < count; i++) {
      enemies.push({
        typeIndex: types[i],
        x: xs[i],
        y: ys[i],
        hasPatrolLimit: true,
        patrolMinOffsetX: sanitizeOffset(minXs[i] - xs[i]),
        patrolMaxOffsetX: sanitizeOffset(maxXs[i] - xs[i]),
      })
    }
  }

  const decorations: DecorInstance[] = []
  const decorCount = tryRequiredDefine(text, `${upper}_DECOR_COUNT`)
  if (decorCount !== null) {
    const decorTypes = tryParseNamedArray(text, `${baseName}_decor_type`)
    const decorFrames = tryParseNamedArray(text, `${baseName}_decor_frame`)
    const decorXs = tryParseNamedArray(text, `${baseName}_decor_x`)
    const decorYs = tryParseNamedArray(text, `${baseName}_decor_y`)
    // `_DECOR_HAS_BEHAVIOR` ausente = export de ANTES de 2026-10-10 (ou objeto sem nenhum
    // comportamento marcado) — todo objeto cai no padrão de sempre: atravessável, sem propriedade
    // especial (docs/DATA_FORMAT.md § 3, "Sem ele (export antigo), todo objeto é atravessável e
    // sem propriedade").
    const hasBehavior = tryRequiredDefine(text, `${upper}_DECOR_HAS_BEHAVIOR`) !== null
    const decorCollisions = hasBehavior ? tryParseNamedArray(text, `${baseName}_decor_collision`) : null
    const decorSpecials = hasBehavior ? tryParseNamedArray(text, `${baseName}_decor_special`) : null
    if (decorTypes && decorFrames && decorXs && decorYs) {
      for (let i = 0; i < decorCount; i++) {
        decorations.push({
          typeIndex: decorTypes[i],
          frame: decorFrames[i],
          x: decorXs[i],
          y: decorYs[i],
          solid: decorCollisions?.[i] === 1,
          specialPropertyId: decorSpecials ? specialPropertyIdFromExportValue(decorSpecials[i]) : DEFAULT_SPECIAL_PROPERTY_ID,
        })
      }
    }
  }

  return { player, enemies, decorations }
}
