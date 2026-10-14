import { expect, test } from '@playwright/test'
import { makeGridPng } from './fixtures/pixelImage.ts'
import { clickHardwareCell, createTileset, goToTab, mockEngineBuild } from './helpers.ts'

// Fluxo central nº3 (docs/PROGRESS.md, "infra de teste Playwright", 2026-09-25): pintar uma fase
// com um bloco avulso, posicionar o jogador e salvar.

test('pintar fase: escolher tileset, pintar um bloco, posicionar o jogador, salvar', async ({ page }) => {
  await page.goto('/')
  await mockEngineBuild(page)

  const png = await makeGridPng(page, 2, 1, 8, [['#ff0000', '#00ff00']])
  await createTileset(page, { name: 'e2e_paint', pngBuffer: png })

  await goToTab(page, 'Fases')
  await page.locator('li', { hasText: 'e2e_paint' }).getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Começar a pintar' }).click()

  await expect(page.locator('.stage-grid-canvas')).toBeVisible()
  await page.locator('.stage-cursor-step-select').selectOption('8')

  // Abre o modal do tileset e escolhe o bloco 1 (verde) em vez do padrão (bloco 0).
  await page.locator('[title*="clique pra escolher outro bloco deste conjunto"]').click()
  await expect(page.locator('.tile-picker-modal')).toBeVisible()
  await page.locator('.tile-picker-modal .tile-grid .tile-thumb').nth(1).click()
  await expect(page.locator('.tile-picker-modal')).toBeHidden()

  await clickHardwareCell(page.locator('.stage-grid-canvas'), 5, 5, 32)

  // Posiciona o jogador.
  await page.locator('[title="Personagens — posicionar jogador e inimigos"]').click()
  await page.locator('[title="Colocar jogador — clique e depois clique no mapa"]').click()
  await clickHardwareCell(page.locator('.stage-grid-canvas'), 16, 20, 32)
  await expect(page.getByText('Posicione o jogador antes de salvar.')).toHaveCount(0)

  await page.getByRole('button', { name: 'Salvar fase no jogo' }).click()
  await expect(page.getByText(/^Salvo em /).first()).toBeVisible()
})
