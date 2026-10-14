// Tipos de decoração estática disponíveis pra posicionar numa fase
// (docs/DATA_FORMAT.md § 3, "Slot de decoração estática `decor1`") — mesmo
// espírito de `enemySlots.ts`: uma lista extensível, não uma constante
// única, pra não fechar a porta a um `decor2` quando ele existir de verdade
// do lado da engine.

export interface DecorSlot {
  id: string
  label: string
  /** Precisa bater manualmente com a ordem do enum de tipo de decoração do lado do Anubis — mesma
   * categoria de sincronia manual que `EnemySlot.typeIndex` já é hoje; não dá pra validar em
   * tempo de compilação dos dois lados. */
  typeIndex: number
}

export const DECOR_SLOTS: readonly DecorSlot[] = [{ id: 'decor1', label: 'Decoração', typeIndex: 0 }]

export const DEFAULT_DECOR_SLOT_ID: string = DECOR_SLOTS[0].id
