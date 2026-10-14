// "Slot" de personagem (docs/DATA_FORMAT.md seção 3, "Slot do personagem
// principal"): um nome de base FIXO que a engine sempre procura, não
// importa o nome do arquivo que o usuário importou — reexportar substitui
// a arte/animação no jogo sem precisar mudar código lá.

import { REQUIRED_ANIMATION_NAMES } from './animationSequence.ts'

export interface CharacterSlot {
  id: string
  label: string
  /** Nomes de animação que esse slot exige no `_anim.h` pra a engine compilar (contrato fixo,
   * sem parser em tempo de execução — ver `REQUIRED_ANIMATION_NAMES`). Vazio = a engine ainda
   * não fixou esse contrato pra esse slot — nomear as animações fica livre até isso mudar. */
  requiredAnimationNames: readonly string[]
  /** `false` = esse slot NUNCA anima por contrato (docs/DATA_FORMAT.md § 3, "Slot de decoração
   * estática `decor1`": "sem hitbox/animação — ignorados se presentes") — diferente de
   * `requiredAnimationNames: []`, que significa "a engine ainda não fixou os nomes exigidos, mas
   * o slot PODE animar". Ausente/`true` = comportamento de sempre (seção de animação visível). */
  supportsAnimation?: boolean
}

export const CHARACTER_SLOTS: readonly CharacterSlot[] = [
  { id: 'hero', label: 'Personagem principal', requiredAnimationNames: REQUIRED_ANIMATION_NAMES },
  // docs/DATA_FORMAT.md § 3 "Slots de inimigo": só `walk` é obrigatória — o inimigo de patrulha
  // nunca para de andar, então `enemy.c` só referencia `enemy1_anim_walk`. `idle` continua uma
  // sugestão válida (o Editor já exporta), só que sem uso do lado da engine por enquanto.
  { id: 'enemy1', label: 'Inimigo', requiredAnimationNames: ['walk'] },
  // docs/DATA_FORMAT.md § 3 "Slot de decoração estática `decor1`": sem hitbox/animação exigidos
  // pela engine — cada quadro da folha é uma peça de decoração DIFERENTE (não uma sequência).
  { id: 'decor1', label: 'Decoração (estática)', requiredAnimationNames: [], supportsAnimation: false },
]

export const DEFAULT_CHARACTER_SLOT_ID: string = CHARACTER_SLOTS[0].id
