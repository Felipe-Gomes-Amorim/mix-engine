import assert from 'node:assert/strict'
import { test } from 'node:test'
import { REQUIRED_ANIMATION_NAMES } from '../src/features/import-preview/animationSequence.ts'
import { CHARACTER_SLOTS, DEFAULT_CHARACTER_SLOT_ID } from '../src/features/import-preview/characterSlots.ts'

test('slots de personagem: hero (padrão), inimigo e decoração estática, cada um com label e id únicos', () => {
  assert.deepEqual(
    CHARACTER_SLOTS.map((s) => s.id),
    ['hero', 'enemy1', 'decor1'],
  )
  assert.equal(DEFAULT_CHARACTER_SLOT_ID, 'hero')
  assert.ok(CHARACTER_SLOTS.every((slot) => slot.label.length > 0))
})

test('slot "hero" exige as 5 animações fixas do player.c; slot "enemy1" exige só "walk" (enemy.c)', () => {
  const hero = CHARACTER_SLOTS.find((s) => s.id === 'hero')
  const enemy = CHARACTER_SLOTS.find((s) => s.id === 'enemy1')
  assert.deepEqual([...(hero?.requiredAnimationNames ?? [])], [...REQUIRED_ANIMATION_NAMES])
  assert.deepEqual([...(enemy?.requiredAnimationNames ?? [])], ['walk'])
})

test('slot "decor1" (docs/DATA_FORMAT.md § 3, "Slot de decoração estática", 2026-10-05): sem animação exigida E `supportsAnimation: false` — diferente de um slot cujo contrato só ainda não foi fixado', () => {
  const decor = CHARACTER_SLOTS.find((s) => s.id === 'decor1')
  assert.deepEqual([...(decor?.requiredAnimationNames ?? [])], [])
  assert.equal(decor?.supportsAnimation, false)
})
