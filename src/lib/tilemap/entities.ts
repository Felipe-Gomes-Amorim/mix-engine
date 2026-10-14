// Posicionamento de entidades (docs/DATA_FORMAT.md § 4, "Resposta do
// Prometeus aos pontos em aberto", 2026-09-21) — spawn do jogador (um
// ponto) e instâncias de inimigo (tipo + posição + patrulha). Fase 1 do
// editor de fase v2: entidades sobre o tileset único de hoje: múltiplos
// tilesets/paleta por bloco ficam pra uma etapa depois.

/** Um inimigo posicionado na fase: `typeIndex` precisa bater manualmente com o enum `EnemyType`
 * de `src/enemy.h` do lado do Anubis (mesma categoria de sincronia manual que `PLAYER_HITBOX_W`
 * já é hoje) — ver `enemySlots.ts` pra lista de tipos disponíveis no Prometeus.
 *
 * Patrulha (docs/DATA_FORMAT.md § 4, "patrulha relativa e opcional", 2026-09-22): por padrão o
 * inimigo NÃO tem coleira nenhuma — do lado da Anubis, um sensor de parede/beirada faz ele virar
 * sozinho ao bater numa parede ou perder o chão à frente, sem precisar de número nenhum aqui. A
 * coleira manual (`hasPatrolLimit`) é opcional, pra quando o usuário quer travar a patrulha num
 * trecho menor que isso — os dois offsets são RELATIVOS a `x` (podem ser negativos, ex.:
 * `patrolMinOffsetX = -40` = 40px à esquerda de onde o inimigo foi colocado), não posições
 * absolutas da fase. */
export interface EnemyInstance {
  typeIndex: number
  x: number
  y: number
  hasPatrolLimit: boolean
  patrolMinOffsetX: number
  patrolMaxOffsetX: number
}

export interface PlayerSpawn {
  x: number
  y: number
}

/** Propriedade especial de um objeto (docs/DATA_FORMAT.md § 3, "Comportamento de objeto: colisão
 * + propriedade especial", 2026-10-10) — lista EXTENSÍVEL (o próprio contrato avisa que mais
 * valores virão), por isso uma tabela em vez de um union type fixo de 2 opções. `exportValue`
 * precisa bater manualmente com o enum `special` do lado da Anubis — valor desconhecido lá é
 * ignorado (tratado como "nenhuma"), então um `id` novo aqui só funciona de verdade depois da
 * Anubis reconhecer o `exportValue` correspondente. */
export interface SpecialProperty {
  id: string
  label: string
  exportValue: number
}

export const SPECIAL_PROPERTIES: readonly SpecialProperty[] = [
  { id: 'none', label: 'Nenhuma', exportValue: 0 },
  { id: 'flag', label: 'Bandeira (termina a fase)', exportValue: 1 },
  { id: 'death', label: 'Trigger de morte', exportValue: 2 },
]

export const DEFAULT_SPECIAL_PROPERTY_ID: string = SPECIAL_PROPERTIES[0].id

/** Uma decoração/objeto posicionado na fase (docs/DATA_FORMAT.md § 3, "Slot de decoração
 * estática `decor1` + lista de decorações por fase", e "Comportamento de objeto: colisão +
 * propriedade especial") — `typeIndex` precisa bater manualmente com o enum de tipo de decoração
 * do lado do Anubis (ver `decorSlots.ts`). `frame` escolhe QUAL peça da folha (cada quadro é uma
 * decoração diferente, não uma sequência animada).
 *
 * `x`,`y` são o canto superior esquerdo do retângulo do quadro, em pixels de mundo —
 * DIFERENTE de `EnemyInstance`/`PlayerSpawn`: aqui NÃO existe conversão pivô-hitbox
 * (`pivotToSpawn`/`spawnToPivot` em StageSession.tsx), o ponto salvo é exatamente onde o quadro é
 * desenhado, não precisa de ajuste nenhum pra achar o pivô/pé do sprite. A caixa de colisão (só
 * importa quando `solid`) é o retângulo do FRAME inteiro — sem campo de hitbox próprio (decisão
 * deliberada do contrato: "nenhum campo de hitbox novo", recortar a folha bem justa evita
 * surpresa).
 *
 * `solid` (padrão `false`, o comportamento de sempre): só bloqueia o JOGADOR — inimigos atravessam
 * objetos (limite documentado do lado da Anubis). `specialPropertyId` (padrão `'none'`): ver
 * `SpecialProperty`/`SPECIAL_PROPERTIES` acima. As duas combinam livremente (ex.: sólido + morte =
 * espinho que não dá pra atravessar). */
export interface DecorInstance {
  typeIndex: number
  frame: number
  x: number
  y: number
  solid: boolean
  specialPropertyId: string
}

export interface StageEntities {
  /** `null` = nenhum ponto de partida marcado ainda (o usuário ainda não arrastou o marcador). */
  player: PlayerSpawn | null
  enemies: EnemyInstance[]
  decorations: DecorInstance[]
}

export const EMPTY_STAGE_ENTITIES: StageEntities = { player: null, enemies: [], decorations: [] }
