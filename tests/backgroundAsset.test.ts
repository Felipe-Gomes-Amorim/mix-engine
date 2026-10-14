import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  generateBackgroundMeta,
  parseBackgroundMeta,
  sanitizeBackgroundFileName,
  validateBackgroundDimensions,
} from '../src/lib/tilemap/backgroundAsset.ts'

test('generateBackgroundMeta + parseBackgroundMeta: round-trip da versão', () => {
  const json = generateBackgroundMeta({ version: 3 })
  const parsed = parseBackgroundMeta(json)
  assert.equal(parsed.version, 3)
})

test('parseBackgroundMeta: metadados sem "version" (não deveria acontecer, mas cobre por segurança) caem pra versão 1', () => {
  const parsed = parseBackgroundMeta('{}')
  assert.equal(parsed.version, 1)
})

test('parseBackgroundMeta: JSON inválido ou formato inesperado lança erro em português', () => {
  assert.throws(() => parseBackgroundMeta('não é json'), /não é um JSON válido/)
  assert.throws(() => parseBackgroundMeta('42'), /formato esperado/)
  assert.throws(() => parseBackgroundMeta('null'), /formato esperado/)
})

test('sanitizeBackgroundFileName: reaproveita sanitizeTilesetFileName (minúsculas, espaço vira _, remove acento)', () => {
  assert.equal(sanitizeBackgroundFileName('Céu com Morros'), 'ceu_com_morros')
})

test('validateBackgroundDimensions: 256x256 (32 colunas) e 512x256 (64 colunas) são as ÚNICAS larguras válidas, altura sempre 256', () => {
  assert.equal(validateBackgroundDimensions(256, 256), null)
  assert.equal(validateBackgroundDimensions(512, 256), null)
})

test('validateBackgroundDimensions: altura diferente de 256px (32 linhas) é sempre rejeitada', () => {
  const error = validateBackgroundDimensions(256, 512)
  assert.match(error ?? '', /altura/)
  assert.match(error ?? '', /256px/)
})

test('validateBackgroundDimensions: largura que não é 256 nem 512 é rejeitada mesmo sendo múltipla de 32 — achado real: "múltiplo de 32 até 64" só tem 2 valores possíveis (32 e 64), não é um intervalo', () => {
  const error = validateBackgroundDimensions(768, 256) // 96 colunas, múltiplo de 32, mas > 64
  assert.match(error ?? '', /largura/)
  assert.match(error ?? '', /32 ou 64/)
})
