import { expect, test } from '@playwright/test'
import { makeGridPng } from './fixtures/pixelImage.ts'
import { clickHardwareCell, createTileset, goToTab, mockEngineBuild } from './helpers.ts'

// Bit de prioridade por tile da Camada 1 — "desenha na frente do jogador/inimigo" (docs/
// DATA_FORMAT.md § 4, "Bit de prioridade por tile da Camada 1", 2026-10-01/02). Toggle por bloco no
// editor de Tileset, independente da colisão, exporta `stage1_tilemap_priority.txt` (32 linhas de
// `0`/`1` por célula de 8x8) sempre, mesmo sem marcação nenhuma.

test('toggle "Na frente": marcar no editor de Tileset, pintar na fase e exportar o .txt certo', async ({ page }) => {
  await page.goto('/')
  await mockEngineBuild(page)

  // Bloco 0 = normal (vermelho), bloco 1 = marcado "Na frente" (verde).
  const png = await makeGridPng(page, 2, 1, 8, [['#ff0000', '#00ff00']])
  await createTileset(page, { name: 'e2e_priority', pngBuffer: png, markPriority: [1] })

  await goToTab(page, 'Fases')
  await page.locator('li', { hasText: 'e2e_priority' }).getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Começar a pintar' }).click()
  await expect(page.locator('.stage-grid-canvas')).toBeVisible()
  await page.locator('.stage-cursor-step-select').selectOption('8')

  // Escolhe o bloco marcado (índice 1) no seletor — o contorno/título já avisam que é "na frente".
  await page.locator('[title*="clique pra escolher outro bloco deste conjunto"]').click()
  await expect(page.locator('.tile-picker-modal')).toBeVisible()
  const priorityThumb = page.locator('.tile-picker-modal .tile-grid .tile-thumb').nth(1)
  await expect(priorityThumb).toHaveAttribute('title', /desenha na frente do jogador\/inimigo/)
  await priorityThumb.click()
  await expect(page.locator('.tile-picker-modal')).toBeHidden()

  // Pinta a célula de hardware (5, 5) com o bloco marcado.
  await clickHardwareCell(page.locator('.stage-grid-canvas'), 5, 5, 32)

  // Posiciona o jogador (obrigatório pra salvar) e salva.
  await page.locator('[title="Personagens — posicionar jogador e inimigos"]').click()
  await page.locator('[title="Colocar jogador — clique e depois clique no mapa"]').click()
  await clickHardwareCell(page.locator('.stage-grid-canvas'), 16, 20, 32)
  await page.getByRole('button', { name: 'Salvar fase no jogo' }).click()
  await expect(page.getByText(/^Salvo em /).first()).toBeVisible()

  const priorityText = await page.evaluate(() =>
    fetch('/api/gfx-file?name=stage1_tilemap_priority.txt').then((r) => r.text()),
  )
  const lines = priorityText.split('\n').filter((line) => line.length > 0)
  expect(lines).toHaveLength(32)
  for (const line of lines) expect(line).toHaveLength(32)
  // Só a célula (5, 5) marcada — resto tudo "0".
  expect(lines[5][5]).toBe('1')
  expect(lines[5].replaceAll('1', '')).toBe('0'.repeat(31))
  expect(lines.filter((_, i) => i !== 5).every((line) => line === '0'.repeat(32))).toBe(true)
})

test('toggle "Na frente": nenhum bloco marcado ainda exporta o .txt inteiro (32 linhas de "0")', async ({ page }) => {
  await page.goto('/')
  await mockEngineBuild(page)

  const png = await makeGridPng(page, 2, 1, 8, [['#ff0000', '#00ff00']])
  await createTileset(page, { name: 'e2e_no_priority', pngBuffer: png })

  await goToTab(page, 'Fases')
  await page.locator('li', { hasText: 'e2e_no_priority' }).getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Começar a pintar' }).click()
  await expect(page.locator('.stage-grid-canvas')).toBeVisible()

  await page.locator('[title="Personagens — posicionar jogador e inimigos"]').click()
  await page.locator('[title="Colocar jogador — clique e depois clique no mapa"]').click()
  await clickHardwareCell(page.locator('.stage-grid-canvas'), 16, 20, 32)
  await page.getByRole('button', { name: 'Salvar fase no jogo' }).click()
  await expect(page.getByText(/^Salvo em /).first()).toBeVisible()

  const priorityText = await page.evaluate(() =>
    fetch('/api/gfx-file?name=stage1_tilemap_priority.txt').then((r) => r.text()),
  )
  const lines = priorityText.split('\n').filter((line) => line.length > 0)
  expect(lines).toHaveLength(32)
  expect(lines.every((line) => line === '0'.repeat(32))).toBe(true)
})
