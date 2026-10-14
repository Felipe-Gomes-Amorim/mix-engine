import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_ENEMY_SLOT_ID, ENEMY_SLOTS } from '../src/features/import-preview/enemySlots.ts'

test('slots de inimigo: hoje só "enemy1" (typeIndex 0, batendo com ENEMY_TYPE_ENEMY1 do Anubis)', () => {
  assert.deepEqual(
    ENEMY_SLOTS.map((s) => ({ id: s.id, typeIndex: s.typeIndex })),
    [{ id: 'enemy1', typeIndex: 0 }],
  )
  assert.equal(DEFAULT_ENEMY_SLOT_ID, 'enemy1')
  assert.ok(ENEMY_SLOTS.every((slot) => slot.label.length > 0))
})
