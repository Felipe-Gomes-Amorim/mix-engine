// Tipos de inimigo disponíveis pra posicionar numa fase (docs/DATA_FORMAT.md
// § 4, "Resposta do Prometeus aos pontos em aberto") — mesmo espírito de
// `characterSlots.ts`: uma lista extensível, não uma constante única, pra
// não fechar a porta a um `enemy2` quando ele existir de verdade do lado
// da engine.

export interface EnemySlot {
  id: string
  label: string
  /** Precisa bater manualmente com a ordem do enum `EnemyType` em
   * `src/enemy.h` do lado do Anubis (`ENEMY_TYPE_ENEMY1 = 0`) — mesma
   * categoria de sincronia manual que `PLAYER_HITBOX_W` já é hoje; não dá
   * pra validar em tempo de compilação dos dois lados. */
  typeIndex: number
}

export const ENEMY_SLOTS: readonly EnemySlot[] = [{ id: 'enemy1', label: 'Inimigo (patrulha)', typeIndex: 0 }]

export const DEFAULT_ENEMY_SLOT_ID: string = ENEMY_SLOTS[0].id
