import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cellsOnLine } from '../src/lib/tilemap/lineCells.ts'

test('cellsOnLine: ponto único (início == fim) devolve só ele', () => {
  assert.deepEqual(cellsOnLine(5, 5, 5, 5), [{ col: 5, row: 5 }])
})

test('cellsOnLine: linha horizontal cobre todas as colunas entre início e fim, sem buraco', () => {
  assert.deepEqual(cellsOnLine(2, 4, 6, 4), [
    { col: 2, row: 4 },
    { col: 3, row: 4 },
    { col: 4, row: 4 },
    { col: 5, row: 4 },
    { col: 6, row: 4 },
  ])
})

test('cellsOnLine: linha vertical cobre todas as linhas entre início e fim', () => {
  assert.deepEqual(cellsOnLine(3, 1, 3, 4), [
    { col: 3, row: 1 },
    { col: 3, row: 2 },
    { col: 3, row: 3 },
    { col: 3, row: 4 },
  ])
})

test('cellsOnLine: linha diagonal 45° não deixa buraco', () => {
  assert.deepEqual(cellsOnLine(0, 0, 3, 3), [
    { col: 0, row: 0 },
    { col: 1, row: 1 },
    { col: 2, row: 2 },
    { col: 3, row: 3 },
  ])
})

test('cellsOnLine: funciona igual de trás pra frente e em qualquer direção (negativa)', () => {
  assert.deepEqual(cellsOnLine(6, 4, 2, 4), [
    { col: 6, row: 4 },
    { col: 5, row: 4 },
    { col: 4, row: 4 },
    { col: 3, row: 4 },
    { col: 2, row: 4 },
  ])
})

test('cellsOnLine: linha não-alinhada (drag rápido) conecta início e fim sem pular nenhuma coluna', () => {
  const cells = cellsOnLine(0, 0, 10, 3)
  assert.equal(cells[0].col, 0)
  assert.equal(cells[cells.length - 1].col, 10)
  // toda coluna de 0 a 10 aparece pelo menos uma vez (é isso que evita o "buraco" ao arrastar rápido)
  const cols = new Set(cells.map((c) => c.col))
  for (let col = 0; col <= 10; col++) assert.ok(cols.has(col), `coluna ${col} deveria aparecer`)
})
