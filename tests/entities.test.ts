import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateEntitiesHeader, parseEntitiesHeader } from '../src/lib/tilemap/exportEntities.ts'
import type { DecorInstance, EnemyInstance } from '../src/lib/tilemap/entities.ts'

test('generateEntitiesHeader + parseEntitiesHeader: round-trip com 2 inimigos, um com coleira e outro sem', () => {
  const player = { x: 120, y: 100 }
  const enemies: EnemyInstance[] = [
    { typeIndex: 0, x: 90, y: 192, hasPatrolLimit: true, patrolMinOffsetX: -40, patrolMaxOffsetX: 40 },
    { typeIndex: 0, x: 200, y: 150, hasPatrolLimit: false, patrolMinOffsetX: 0, patrolMaxOffsetX: 0 },
  ]
  const header = generateEntitiesHeader('stage1', 'stage1.png', player, enemies)

  assert.ok(header.includes('#define STAGE1_PLAYER_SPAWN_X 120'))
  assert.ok(header.includes('#define STAGE1_PLAYER_SPAWN_Y 100'))
  assert.ok(header.includes('#define STAGE1_ENEMY_COUNT 2'))
  assert.ok(header.includes('static const u8  stage1_enemy_type[2]  = { 0, 0 };'))
  assert.ok(header.includes('static const s16 stage1_enemy_x[2]     = { 90, 200 };'))
  assert.ok(/static const u8\s+stage1_enemy_has_patrol_limit\[2\]\s*=\s*\{\s*1,\s*0\s*\};/.test(header))
  assert.ok(/static const s16\s+stage1_enemy_patrol_min_x\[2\]\s*=\s*\{\s*-40,\s*0\s*\};/.test(header))
  assert.ok(/static const s16\s+stage1_enemy_patrol_max_x\[2\]\s*=\s*\{\s*40,\s*0\s*\};/.test(header))

  const parsed = parseEntitiesHeader('stage1', header)
  assert.deepEqual(parsed.player, player)
  assert.deepEqual(parsed.enemies, enemies)
})

test('generateEntitiesHeader: offset negativo (limite à esquerda de onde o inimigo foi colocado) sobrevive ao round-trip', () => {
  const enemies: EnemyInstance[] = [
    { typeIndex: 0, x: 100, y: 100, hasPatrolLimit: true, patrolMinOffsetX: -60, patrolMaxOffsetX: -10 },
  ]
  const header = generateEntitiesHeader('stage1', 'stage1.png', { x: 0, y: 0 }, enemies)
  const parsed = parseEntitiesHeader('stage1', header)
  assert.equal(parsed.enemies[0].patrolMinOffsetX, -60)
  assert.equal(parsed.enemies[0].patrolMaxOffsetX, -10)
})

test('generateEntitiesHeader: 0 inimigos ainda declara um array de 1 elemento (816-tcc não aceita [0]), mas ENEMY_COUNT fica 0', () => {
  const header = generateEntitiesHeader('stage1', 'stage1.png', { x: 50, y: 60 }, [])
  assert.ok(header.includes('#define STAGE1_ENEMY_COUNT 0'))
  assert.ok(header.includes('static const u8  stage1_enemy_type[1]  = { 0 };'))
  assert.ok(/static const u8\s+stage1_enemy_has_patrol_limit\[1\]\s*=\s*\{\s*0\s*\};/.test(header))

  const parsed = parseEntitiesHeader('stage1', header)
  assert.deepEqual(parsed.player, { x: 50, y: 60 })
  assert.deepEqual(parsed.enemies, [])
})

test('generateEntitiesHeader: cor de fundo (backdrop, docs/DATA_FORMAT.md § 4, 2026-10-01) — 3 defines convertidos pro nativo SNES (5 bits/canal)', () => {
  const header = generateEntitiesHeader('stage1', 'stage1.png', { x: 0, y: 0 }, [], [96, 160, 248])
  assert.ok(header.includes('#define STAGE1_BACKDROP_R 12'))
  assert.ok(header.includes('#define STAGE1_BACKDROP_G 20'))
  assert.ok(header.includes('#define STAGE1_BACKDROP_B 31'))
})

test('generateEntitiesHeader: sem cor de fundo (parâmetro omitido) não grava NENHUM define de backdrop — engine trata ausência como preto explícito', () => {
  const header = generateEntitiesHeader('stage1', 'stage1.png', { x: 0, y: 0 }, [])
  assert.ok(!header.includes('BACKDROP'))
})

test('parseEntitiesHeader: migra o formato antigo (min_x/max_x absolutos) — fase salva antes de 2026-09-22', () => {
  // arquivo real de ANTES da mudança pra patrulha relativa/opcional: só existiam min_x/max_x
  // absolutos, sempre ativos (não tinha como desativar a patrulha).
  const oldHeader = [
    '/* gerado pelo snes-asset-editor a partir de stage1.png — não editar à mão */',
    '#define STAGE1_PLAYER_SPAWN_X 120',
    '#define STAGE1_PLAYER_SPAWN_Y 100',
    '',
    '#define STAGE1_ENEMY_COUNT 1',
    'static const u8  stage1_enemy_type[1]  = { 0 };',
    'static const s16 stage1_enemy_x[1]     = { 100 };',
    'static const s16 stage1_enemy_y[1]     = { 150 };',
    'static const s16 stage1_enemy_min_x[1] = { 60 };',
    'static const s16 stage1_enemy_max_x[1] = { 180 };',
    '',
  ].join('\n')

  const parsed = parseEntitiesHeader('stage1', oldHeader)
  assert.equal(parsed.enemies.length, 1)
  assert.equal(parsed.enemies[0].x, 100)
  assert.equal(parsed.enemies[0].hasPatrolLimit, true, 'fase antiga sempre tinha a coleira ativa (não existia a opção de desligar)')
  assert.equal(parsed.enemies[0].patrolMinOffsetX, -40, 'min_x=60, x=100 -> offset relativo = -40')
  assert.equal(parsed.enemies[0].patrolMaxOffsetX, 80, 'max_x=180, x=100 -> offset relativo = 80')
})

test('generateEntitiesHeader: NaN/undefined em patrolMinOffsetX/patrolMaxOffsetX nunca vira token inválido de C', () => {
  // Achado real (2026-09-22): um campo numérico controlado sem cuidado deixou NaN entrar no
  // estado (Number('-') = NaN, digitando um offset negativo char a char) e o `.h` exportado saiu
  // com o literal `NaN` — quebrou o build de verdade da Anubis ("'NaN' undeclared"). Não importa
  // o que vier no EnemyInstance, o `.h` gerado precisa sempre ser C válido.
  const enemies = [
    { typeIndex: 0, x: 100, y: 100, hasPatrolLimit: true, patrolMinOffsetX: NaN, patrolMaxOffsetX: undefined },
  ] as unknown as EnemyInstance[]
  const header = generateEntitiesHeader('stage1', 'stage1.png', { x: 0, y: 0 }, enemies)
  assert.ok(!/\bNaN\b/.test(header), `header nunca contém o literal NaN (veio: ${header})`)
  assert.ok(/static const s16\s+stage1_enemy_patrol_min_x\[1\]\s*=\s*\{\s*0\s*\};/.test(header), 'NaN vira 0 (fallback seguro)')
  assert.ok(/static const s16\s+stage1_enemy_patrol_max_x\[1\]\s*=\s*\{\s*0\s*\};/.test(header), 'undefined vira 0 (fallback seguro), nunca um buraco vazio em { }')

  // e reabrir esse mesmo header (já "curado" na exportação) continua batendo 0/0
  const parsed = parseEntitiesHeader('stage1', header)
  assert.equal(parsed.enemies[0].patrolMinOffsetX, 0)
  assert.equal(parsed.enemies[0].patrolMaxOffsetX, 0)
})

test('parseEntitiesHeader: array de patrulha mais curto que ENEMY_COUNT se autocura pra 0 em vez de propagar undefined', () => {
  // Simula um arquivo já corrompido de uma sessão anterior (patrol_max_x ficou com menos
  // elementos que ENEMY_COUNT) — reabrir não deve travar nem propagar `undefined` de novo.
  const corruptedHeader = [
    '#define STAGE1_PLAYER_SPAWN_X 0',
    '#define STAGE1_PLAYER_SPAWN_Y 0',
    '#define STAGE1_ENEMY_COUNT 1',
    'static const u8  stage1_enemy_type[1]  = { 0 };',
    'static const s16 stage1_enemy_x[1]     = { 100 };',
    'static const s16 stage1_enemy_y[1]     = { 100 };',
    'static const u8  stage1_enemy_has_patrol_limit[1] = { 1 };',
    'static const s16 stage1_enemy_patrol_min_x[1] = { -10 };',
    'static const s16 stage1_enemy_patrol_max_x[1] = {  };',
    '',
  ].join('\n')

  const parsed = parseEntitiesHeader('stage1', corruptedHeader)
  assert.equal(parsed.enemies[0].patrolMinOffsetX, -10)
  assert.equal(parsed.enemies[0].patrolMaxOffsetX, 0, 'array vazio (elemento ausente) vira 0, não undefined')

  // e reexportar isso já sai limpo, sem propagar a corrupção pra sempre
  const rewritten = generateEntitiesHeader('stage1', 'stage1.png', { x: 0, y: 0 }, parsed.enemies)
  assert.ok(!rewritten.includes('{  }'), 'reexportar depois de curar não deixa nenhum array vazio de novo')
})

test('generateEntitiesHeader + parseEntitiesHeader: round-trip com decorações (decor1, docs/DATA_FORMAT.md § 3, 2026-10-05)', () => {
  const decorations: DecorInstance[] = [
    { typeIndex: 0, frame: 0, x: 696, y: 64, solid: false, specialPropertyId: 'none' },
    { typeIndex: 0, frame: 2, x: 100, y: 50, solid: true, specialPropertyId: 'flag' },
  ]
  const header = generateEntitiesHeader('stage1', 'stage1.png', { x: 0, y: 0 }, [], undefined, decorations)

  assert.ok(header.includes('#define STAGE1_DECOR_COUNT 2'))
  assert.ok(header.includes('static const u8  stage1_decor_type[2]  = { 0, 0 };'))
  assert.ok(header.includes('static const u8  stage1_decor_frame[2] = { 0, 2 };'))
  assert.ok(header.includes('static const s16 stage1_decor_x[2]     = { 696, 100 };'))
  assert.ok(header.includes('static const s16 stage1_decor_y[2]     = { 64, 50 };'))
  assert.ok(header.includes('#define STAGE1_DECOR_HAS_BEHAVIOR 1'))
  assert.ok(header.includes('static const u8  stage1_decor_collision[2] = { 0, 1 };'))
  assert.ok(header.includes('static const u8  stage1_decor_special[2]   = { 0, 1 };'))

  const parsed = parseEntitiesHeader('stage1', header)
  assert.deepEqual(parsed.decorations, decorations)
})

test('generateEntitiesHeader + parseEntitiesHeader: round-trip com "trigger de morte" (exportValue 2) e objeto sem nenhum comportamento marcado', () => {
  const decorations: DecorInstance[] = [
    { typeIndex: 0, frame: 1, x: 50, y: 60, solid: true, specialPropertyId: 'death' },
    { typeIndex: 0, frame: 0, x: 0, y: 0, solid: false, specialPropertyId: 'none' },
  ]
  const header = generateEntitiesHeader('stage1', 'stage1.png', { x: 0, y: 0 }, [], undefined, decorations)
  assert.ok(header.includes('static const u8  stage1_decor_collision[2] = { 1, 0 };'))
  assert.ok(header.includes('static const u8  stage1_decor_special[2]   = { 2, 0 };'))

  const parsed = parseEntitiesHeader('stage1', header)
  assert.deepEqual(parsed.decorations, decorations)
})

test('parseEntitiesHeader: decoração exportada ANTES de "Comportamento de objeto" existir (sem STAGE1_DECOR_HAS_BEHAVIOR) cai no padrão — atravessável, sem propriedade especial', () => {
  const oldHeader = [
    '#define STAGE1_PLAYER_SPAWN_X 0',
    '#define STAGE1_PLAYER_SPAWN_Y 0',
    '#define STAGE1_ENEMY_COUNT 0',
    'static const u8  stage1_enemy_type[1]  = { 0 };',
    'static const s16 stage1_enemy_x[1]     = { 0 };',
    'static const s16 stage1_enemy_y[1]     = { 0 };',
    'static const u8  stage1_enemy_has_patrol_limit[1] = { 0 };',
    'static const s16 stage1_enemy_patrol_min_x[1] = { 0 };',
    'static const s16 stage1_enemy_patrol_max_x[1] = { 0 };',
    '#define STAGE1_DECOR_COUNT 1',
    'static const u8  stage1_decor_type[1]  = { 0 };',
    'static const u8  stage1_decor_frame[1] = { 0 };',
    'static const s16 stage1_decor_x[1]     = { 696 };',
    'static const s16 stage1_decor_y[1]     = { 64 };',
    '',
  ].join('\n')
  const parsed = parseEntitiesHeader('stage1', oldHeader)
  assert.deepEqual(parsed.decorations, [{ typeIndex: 0, frame: 0, x: 696, y: 64, solid: false, specialPropertyId: 'none' }])
})

test('parseEntitiesHeader: valor de "special" desconhecido (export mais novo, ou arquivo corrompido) cai em "none" em vez de propagar lixo', () => {
  const header = [
    '#define STAGE1_PLAYER_SPAWN_X 0',
    '#define STAGE1_PLAYER_SPAWN_Y 0',
    '#define STAGE1_ENEMY_COUNT 0',
    'static const u8  stage1_enemy_type[1]  = { 0 };',
    'static const s16 stage1_enemy_x[1]     = { 0 };',
    'static const s16 stage1_enemy_y[1]     = { 0 };',
    'static const u8  stage1_enemy_has_patrol_limit[1] = { 0 };',
    'static const s16 stage1_enemy_patrol_min_x[1] = { 0 };',
    'static const s16 stage1_enemy_patrol_max_x[1] = { 0 };',
    '#define STAGE1_DECOR_COUNT 1',
    'static const u8  stage1_decor_type[1]  = { 0 };',
    'static const u8  stage1_decor_frame[1] = { 0 };',
    'static const s16 stage1_decor_x[1]     = { 0 };',
    'static const s16 stage1_decor_y[1]     = { 0 };',
    '#define STAGE1_DECOR_HAS_BEHAVIOR 1',
    'static const u8  stage1_decor_collision[1] = { 0 };',
    'static const u8  stage1_decor_special[1]   = { 99 };',
    '',
  ].join('\n')
  const parsed = parseEntitiesHeader('stage1', header)
  assert.equal(parsed.decorations[0].specialPropertyId, 'none')
})

test('generateEntitiesHeader: sem decorações (parâmetro omitido ou vazio) não grava STAGE1_DECOR_COUNT nem os arrays — DIFERENTE dos inimigos, que sempre declaram um array de sobra', () => {
  const header = generateEntitiesHeader('stage1', 'stage1.png', { x: 0, y: 0 }, [])
  assert.ok(!header.includes('DECOR'))

  const parsed = parseEntitiesHeader('stage1', header)
  assert.deepEqual(parsed.decorations, [])
})

test('parseEntitiesHeader: fase salva ANTES de decor1 existir (sem STAGE1_DECOR_COUNT no arquivo) reabre com decorations: [] em vez de travar', () => {
  const oldHeader = [
    '#define STAGE1_PLAYER_SPAWN_X 0',
    '#define STAGE1_PLAYER_SPAWN_Y 0',
    '#define STAGE1_ENEMY_COUNT 0',
    'static const u8  stage1_enemy_type[1]  = { 0 };',
    'static const s16 stage1_enemy_x[1]     = { 0 };',
    'static const s16 stage1_enemy_y[1]     = { 0 };',
    'static const u8  stage1_enemy_has_patrol_limit[1] = { 0 };',
    'static const s16 stage1_enemy_patrol_min_x[1] = { 0 };',
    'static const s16 stage1_enemy_patrol_max_x[1] = { 0 };',
    '',
  ].join('\n')
  const parsed = parseEntitiesHeader('stage1', oldHeader)
  assert.deepEqual(parsed.decorations, [])
})

test('parseEntitiesHeader: erro em português quando falta um #define ou um array', () => {
  assert.throws(() => parseEntitiesHeader('stage1', ''), /STAGE1_PLAYER_SPAWN_X/)
  const missingArray = [
    '#define STAGE1_PLAYER_SPAWN_X 0',
    '#define STAGE1_PLAYER_SPAWN_Y 0',
    '#define STAGE1_ENEMY_COUNT 1',
  ].join('\n')
  assert.throws(() => parseEntitiesHeader('stage1', missingArray), /stage1_enemy_type/)
})
