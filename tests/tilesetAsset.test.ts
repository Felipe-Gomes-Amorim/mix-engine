import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateTilesetMeta, parseTilesetMeta, sanitizeTilesetFileName } from '../src/lib/tilemap/tilesetAsset.ts'
import type { CollisionKind, TerrainGroup, TileLayer } from '../src/lib/tilemap/types.ts'

test('generateTilesetMeta + parseTilesetMeta: round-trip com colisão, camada e prioridade', () => {
  const collision = new Map<number, CollisionKind>([
    [2, 'solid'],
    [5, 'goal'],
  ])
  const layer = new Map<number, TileLayer>([[7, 2]])
  const priority = new Map<number, boolean>([[3, true]])
  const json = generateTilesetMeta({ version: 3, blockSize: 16, collision, layer, priority, terrainGroups: [] })
  const parsed = parseTilesetMeta(json)

  assert.equal(parsed.version, 3)
  assert.equal(parsed.blockSize, 16)
  assert.deepEqual([...parsed.collision.entries()].sort(), [
    [2, 'solid'],
    [5, 'goal'],
  ])
  assert.deepEqual([...parsed.layer.entries()], [[7, 2]])
  assert.deepEqual([...parsed.priority.entries()], [[3, true]])
})

test('generateTilesetMeta: entradas "empty"/Camada 1/sem prioridade (padrão) não ficam gravadas no JSON — mesmo espírito enxuto do Map em memória', () => {
  const collision = new Map<number, CollisionKind>([[0, 'empty']])
  const layer = new Map<number, TileLayer>([[0, 1 as TileLayer]])
  const priority = new Map<number, boolean>([[0, false]])
  const json = generateTilesetMeta({ version: 1, blockSize: 8, collision, layer, priority, terrainGroups: [] })
  const parsed = JSON.parse(json)
  assert.deepEqual(parsed.collision, {})
  assert.deepEqual(parsed.layer, {})
  assert.deepEqual(parsed.priority, {})
})

test('generateTilesetMeta + parseTilesetMeta: tabela vazia (nenhum bloco marcado) faz round-trip sem lançar', () => {
  const json = generateTilesetMeta({
    version: 1,
    blockSize: 32,
    collision: new Map(),
    layer: new Map(),
    priority: new Map(),
    terrainGroups: [],
  })
  const parsed = parseTilesetMeta(json)
  assert.equal(parsed.blockSize, 32)
  assert.equal(parsed.collision.size, 0)
  assert.equal(parsed.layer.size, 0)
  assert.equal(parsed.priority.size, 0)
  assert.deepEqual(parsed.terrainGroups, [])
})

test('generateTilesetMeta + parseTilesetMeta: round-trip de grupos de terreno (papel esparso, cai no de fill se ausente)', () => {
  const terrainGroups: TerrainGroup[] = [
    { name: 'grama', collision: 'solid', layer: 1, roles: { fill: 0, top: 1, topLeft: 2 } },
    { name: 'nuvem', collision: 'empty', layer: 2, roles: {} },
  ]
  const json = generateTilesetMeta({
    version: 1,
    blockSize: 8,
    collision: new Map(),
    layer: new Map(),
    priority: new Map(),
    terrainGroups,
  })
  const parsed = parseTilesetMeta(json)
  assert.deepEqual(parsed.terrainGroups, terrainGroups)
})

test('parseTilesetMeta: metadados sem "version" (não deveria acontecer, mas cobre por segurança) caem pra versão 1', () => {
  const parsed = parseTilesetMeta(JSON.stringify({ blockSize: 8, collision: {}, layer: {} }))
  assert.equal(parsed.version, 1)
})

test('parseTilesetMeta: metadados sem "terrainGroups" (tileset salvo antes desse campo existir) cai pra lista vazia', () => {
  const parsed = parseTilesetMeta(JSON.stringify({ version: 2, blockSize: 8, collision: {}, layer: {} }))
  assert.deepEqual(parsed.terrainGroups, [])
})

test('parseTilesetMeta: metadados sem "priority" (tileset salvo antes desse campo existir, docs/DATA_FORMAT.md § 4 "Bit de prioridade", 2026-10-02) cai pra mapa vazio, sem lançar', () => {
  const parsed = parseTilesetMeta(JSON.stringify({ version: 2, blockSize: 8, collision: {}, layer: {} }))
  assert.equal(parsed.priority.size, 0)
})

test('parseTilesetMeta: JSON inválido ou formato inesperado lança erro em português', () => {
  assert.throws(() => parseTilesetMeta('não é json'), /JSON válido/)
  assert.throws(() => parseTilesetMeta('null'), /formato esperado/)
  assert.throws(() => parseTilesetMeta('{}'), /Tamanho de bloco inválido/)
  assert.throws(() => parseTilesetMeta('{"blockSize": 7}'), /Tamanho de bloco inválido/)
})

test('parseTilesetMeta: ignora entradas de colisão/camada/prioridade com valor inesperado, em vez de propagar lixo', () => {
  const parsed = parseTilesetMeta(
    JSON.stringify({
      blockSize: 8,
      collision: { '1': 'solid', '2': 'invalido' },
      layer: { '3': 2, '4': 1, '5': 'x' },
      priority: { '6': true, '7': false, '8': 'x', '9': 1 },
    }),
  )
  assert.deepEqual([...parsed.collision.entries()], [[1, 'solid']])
  assert.deepEqual([...parsed.layer.entries()], [[3, 2]])
  assert.deepEqual([...parsed.priority.entries()], [[6, true]])
})

test('parseTilesetMeta: ignora grupo de terreno corrompido/incompleto e papel inválido dentro de um grupo válido, em vez de propagar lixo', () => {
  const parsed = parseTilesetMeta(
    JSON.stringify({
      blockSize: 8,
      collision: {},
      layer: {},
      terrainGroups: [
        { name: 'grama', collision: 'solid', layer: 1, roles: { fill: 0, invalido: 9, top: 'x', left: -1 } },
        { name: '', collision: 'solid', layer: 1, roles: {} }, // nome vazio — descarta o grupo inteiro
        { name: 'sem colisão válida', collision: 'inexistente', layer: 1, roles: {} },
        { name: 'camada inválida', collision: 'solid', layer: 3, roles: {} },
        'não é um objeto',
      ],
    }),
  )
  assert.deepEqual(parsed.terrainGroups, [{ name: 'grama', collision: 'solid', layer: 1, roles: { fill: 0 } }])
})

test('sanitizeTilesetFileName: minúsculas, espaço vira _, remove acento e caractere especial', () => {
  assert.equal(sanitizeTilesetFileName('Floresta'), 'floresta')
  assert.equal(sanitizeTilesetFileName('Castelo Roxo!'), 'castelo_roxo')
  assert.equal(sanitizeTilesetFileName('Montanha Nevada'), 'montanha_nevada')
  assert.equal(sanitizeTilesetFileName('  espaços   nas  bordas  '), 'espacos_nas_bordas')
})

test('sanitizeTilesetFileName: nome vazio/só símbolo cai pro fallback "tileset", nunca gera arquivo sem nome', () => {
  assert.equal(sanitizeTilesetFileName(''), 'tileset')
  assert.equal(sanitizeTilesetFileName('???'), 'tileset')
})
