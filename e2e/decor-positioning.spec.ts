import { expect, test } from '@playwright/test'
import { makeGridPng } from './fixtures/pixelImage.ts'
import { createTileset, clickHardwareCell, goToTab, mockEngineBuild } from './helpers.ts'

// Slot de decoração estática `decor1` + posicionamento por fase (docs/DATA_FORMAT.md § 3, "Slot de
// decoração estática `decor1` + lista de decorações por fase", 2026-10-05) — sem colisão/hitbox/
// animação, cada quadro da folha é uma peça diferente. Exporta `stage1_decor_type/frame/x/y` em
// `stage1_entities.h`, OMITINDO o bloco inteiro (nem `STAGE1_DECOR_COUNT`) quando não há nenhuma
// decoração posicionada — diferente do array de inimigos, que sempre existe.

test('decoração: adicionar, escolher o quadro e salvar exporta STAGE1_DECOR_* em stage1_entities.h', async ({ page }) => {
  await page.goto('/')
  await mockEngineBuild(page)

  const png = await makeGridPng(page, 2, 1, 8, [['#ff0000', '#00ff00']])
  await createTileset(page, { name: 'e2e_decor_stage', pngBuffer: png })

  await goToTab(page, 'Fases')
  await page.locator('li', { hasText: 'e2e_decor_stage' }).getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Começar a pintar' }).click()
  await expect(page.locator('.stage-grid-canvas')).toBeVisible()

  await page.locator('[title="Personagens — posicionar jogador e inimigos"]').click()
  await page.locator('[title="Colocar jogador — clique e depois clique no mapa"]').click()
  await clickHardwareCell(page.locator('.stage-grid-canvas'), 16, 20, 32)

  await page.locator('[title="Adicionar Decoração"]').click()
  await expect(page.locator('.stage-entity-panel')).toContainText('Decoração 1')

  // Escolhe o quadro 2 da folha (cada quadro é uma peça de decoração diferente).
  await page.locator('.stage-entity-panel input[type="number"]').fill('2')
  await expect(page.locator('.stage-entity-panel')).toContainText('X ')

  await page.getByRole('button', { name: 'Salvar fase no jogo' }).click()
  await expect(page.getByText(/^Salvo em /).first()).toBeVisible()

  const entitiesText = await page.evaluate(() =>
    fetch('/api/gfx-file?name=stage1_entities.h').then((r) => r.text()),
  )
  expect(entitiesText).toMatch(/#define STAGE1_DECOR_COUNT 1/)
  expect(entitiesText).toMatch(/static const u8 {2}stage1_decor_type\[1\] {2}= \{ 0 \};/)
  expect(entitiesText).toMatch(/static const u8 {2}stage1_decor_frame\[1\] = \{ 2 \};/)
  expect(entitiesText).toMatch(/static const s16 stage1_decor_x\[1\] {5}= \{ \d+ \};/)
  expect(entitiesText).toMatch(/static const s16 stage1_decor_y\[1\] {5}= \{ \d+ \};/)
})

test('decoração: marcar "Sólido" + propriedade especial exporta STAGE1_DECOR_HAS_BEHAVIOR e os arrays de comportamento (docs/DATA_FORMAT.md § 3, "Comportamento de objeto", 2026-10-10)', async ({
  page,
}) => {
  await page.goto('/')
  await mockEngineBuild(page)

  const png = await makeGridPng(page, 2, 1, 8, [['#ff0000', '#00ff00']])
  await createTileset(page, { name: 'e2e_decor_behavior', pngBuffer: png })

  await goToTab(page, 'Fases')
  await page.locator('li', { hasText: 'e2e_decor_behavior' }).getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Começar a pintar' }).click()
  await expect(page.locator('.stage-grid-canvas')).toBeVisible()

  await page.locator('[title="Personagens — posicionar jogador e inimigos"]').click()
  await page.locator('[title="Colocar jogador — clique e depois clique no mapa"]').click()
  await clickHardwareCell(page.locator('.stage-grid-canvas'), 16, 20, 32)

  await page.locator('[title="Adicionar Decoração"]').click()
  await page.locator('.stage-entity-panel').getByLabel('Sólido (bloqueia o jogador)').check()
  await page.locator('.stage-entity-panel').getByLabel('Especial:').selectOption('flag')

  await page.getByRole('button', { name: 'Salvar fase no jogo' }).click()
  await expect(page.getByText(/^Salvo em /).first()).toBeVisible()

  const entitiesText = await page.evaluate(() =>
    fetch('/api/gfx-file?name=stage1_entities.h').then((r) => r.text()),
  )
  expect(entitiesText).toMatch(/#define STAGE1_DECOR_HAS_BEHAVIOR 1/)
  expect(entitiesText).toMatch(/static const u8 {2}stage1_decor_collision\[1\] = \{ 1 \};/)
  expect(entitiesText).toMatch(/static const u8 {2}stage1_decor_special\[1\] {3}= \{ 1 \};/)
})

test('decoração: remover a única instância volta a omitir STAGE1_DECOR_COUNT no export (nenhuma decoração = bloco inteiro ausente)', async ({
  page,
}) => {
  await page.goto('/')
  await mockEngineBuild(page)

  const png = await makeGridPng(page, 2, 1, 8, [['#ff0000', '#00ff00']])
  await createTileset(page, { name: 'e2e_decor_removed', pngBuffer: png })

  await goToTab(page, 'Fases')
  await page.locator('li', { hasText: 'e2e_decor_removed' }).getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Começar a pintar' }).click()
  await expect(page.locator('.stage-grid-canvas')).toBeVisible()

  await page.locator('[title="Personagens — posicionar jogador e inimigos"]').click()
  await page.locator('[title="Colocar jogador — clique e depois clique no mapa"]').click()
  await clickHardwareCell(page.locator('.stage-grid-canvas'), 16, 20, 32)

  await page.locator('[title="Adicionar Decoração"]').click()
  await page.getByRole('button', { name: 'Remover esta decoração' }).click()

  await page.getByRole('button', { name: 'Salvar fase no jogo' }).click()
  await expect(page.getByText(/^Salvo em /).first()).toBeVisible()

  const entitiesText = await page.evaluate(() =>
    fetch('/api/gfx-file?name=stage1_entities.h').then((r) => r.text()),
  )
  expect(entitiesText).not.toMatch(/DECOR/)
})
