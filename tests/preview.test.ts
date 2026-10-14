import assert from 'node:assert/strict'
import { test } from 'node:test'
import { composedToRgba } from '../src/lib/metasprite/render.ts'
import {
  REQUIRED_ANIMATION_NAMES,
  SUGGESTED_ANIMATION_NAMES,
  computeFrameGrid,
  formatDuration,
  generateAnimationHeader,
  isValidAnimationName,
  sanitizeIdentifier,
} from '../src/features/import-preview/animationSequence.ts'

test('prévia: índice 0 vira transparente e os demais usam a paleta', () => {
  const composed = { width: 2, height: 2, originX: 1, originY: 1, pixels: new Uint8Array([0, 1, 2, 9]) }
  const rgba = composedToRgba(composed, [
    [0, 0, 0],
    [255, 0, 0],
    [0, 255, 0],
  ])
  assert.deepEqual([...rgba.slice(0, 4)], [0, 0, 0, 0]) // transparente
  assert.deepEqual([...rgba.slice(4, 8)], [255, 0, 0, 255])
  assert.deepEqual([...rgba.slice(8, 12)], [0, 255, 0, 255])
  assert.deepEqual([...rgba.slice(12, 16)], [255, 0, 255, 255]) // fora da paleta -> magenta
})

test('prévia: índice 0 DENTRO DO BANCO (16, 32...) também vira transparente, não só o índice global 0 — achado real (2026-09-22): tileset combinado (combineTilesets.ts) desloca todo índice pelo banco, inclusive o que era transparente na imagem original; um tileset que não fosse o 1º perdia a transparência (fundo preto no lugar) antes desse fix', () => {
  const palette = Array.from({ length: 32 }, (_, i): [number, number, number] => [i, i, i])
  palette[16] = [0, 0, 0] // cor que sobra no slot "índice 0 do banco 1" — não deve aparecer
  const composed = { width: 2, height: 1, originX: 0, originY: 0, pixels: new Uint8Array([16, 17]) }
  const rgba = composedToRgba(composed, palette)
  assert.deepEqual([...rgba.slice(0, 4)], [0, 0, 0, 0], 'índice 16 (0 do banco 1) transparente')
  assert.deepEqual([...rgba.slice(4, 8)], [17, 17, 17, 255], 'índice 17 (1 do banco 1) opaco, cor certa')
})

test('nome de animação em português vira identificador C válido', () => {
  assert.equal(sanitizeIdentifier('Andar'), 'andar')
  assert.equal(sanitizeIdentifier('pulão alto!'), 'pulao_alto')
  assert.equal(sanitizeIdentifier('  correr rápido '), 'correr_rapido')
  assert.equal(sanitizeIdentifier('123 idle'), 'idle')
  assert.equal(sanitizeIdentifier('???'), '')
})

test('duração em frames do jogo vira segundos amigáveis', () => {
  assert.equal(formatDuration(60), '1,00 s')
  assert.equal(formatDuration(8), '0,13 s')
})

test('grade de quadros retangulares: colunas, linhas e divisibilidade usam largura e altura', () => {
  assert.deepEqual(computeFrameGrid(64, 64, 16, 32), {
    frameWidth: 16,
    frameHeight: 32,
    cols: 4,
    rows: 2,
    frameCount: 8,
    divisible: true,
  })
  assert.equal(computeFrameGrid(96, 64, 32, 48).divisible, false) // altura 64 não divide por 48
  assert.equal(computeFrameGrid(96, 64, 32, 32).frameCount, 6)
  assert.equal(computeFrameGrid(64, 64, 24, 32).divisible, false)
})

test('.h de animação: FRAME_W/FRAME_H acompanham largura e altura do quadro', () => {
  const header = generateAnimationHeader('hero', 'hero.png', 16, 32, [
    { name: 'andar', frameIndices: [0, 1, 2, 1], frameDuration: 8 },
  ])
  assert.ok(header.includes('#define HERO_FRAME_W 16\n'))
  assert.ok(header.includes('#define HERO_FRAME_H 32\n'))
  assert.ok(header.includes('static const u8 hero_anim_andar[] = { 0, 1, 2, 1 };'))
  assert.ok(header.includes('#define HERO_ANDAR_FRAME_DURATION 8'))
})

test('nomes sugeridos de animação: exatamente os que a engine procura, todos identificadores válidos', () => {
  assert.deepEqual(
    SUGGESTED_ANIMATION_NAMES.map((s) => s.name),
    ['idle', 'walk', 'run', 'jump', 'fall'],
  )
  for (const { name, label } of SUGGESTED_ANIMATION_NAMES) {
    assert.ok(isValidAnimationName(name), name)
    assert.equal(sanitizeIdentifier(name), name) // usar a sugestão não altera o nome
    assert.ok(label.length > 0)
  }
  // nome livre continua valendo
  assert.ok(isValidAnimationName(sanitizeIdentifier('Andar rápido')))
  assert.equal(sanitizeIdentifier('Andar rápido'), 'andar_rapido')
})

test('nomes obrigatórios de animação são exatamente os mesmos 5 nomes sugeridos (uma só fonte de verdade)', () => {
  assert.deepEqual([...REQUIRED_ANIMATION_NAMES], SUGGESTED_ANIMATION_NAMES.map((s) => s.name))
  assert.deepEqual([...REQUIRED_ANIMATION_NAMES], ['idle', 'walk', 'run', 'jump', 'fall'])
})
