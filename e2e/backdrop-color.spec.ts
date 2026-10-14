import { expect, test } from '@playwright/test'
import { makeGridPng } from './fixtures/pixelImage.ts'
import { createTileset, goToTab, mockEngineBuild } from './helpers.ts'

// Seletor de cor de fundo (docs/PROGRESS.md, "seletor de cor de fundo", 2026-09-30) — amostras das
// cores JÁ usadas na fase (não um color picker livre), com padrão sensato (primeira cor da paleta)
// e persistência no sidecar `_tileset_refs.json`.

test('cor de fundo: amostras vêm da paleta do tileset, padrão é a 1ª cor, escolha persiste ao salvar e reabrir', async ({
  page,
}) => {
  await page.goto('/')
  await mockEngineBuild(page)

  // 2 cores conhecidas, em ordem — a paleta salva do tileset reproduz exatamente essa ordem.
  const png = await makeGridPng(page, 2, 1, 8, [['#ff0000', '#00ff00']])
  await createTileset(page, { name: 'e2e_backdrop', pngBuffer: png })

  await goToTab(page, 'Fases')
  await page.locator('li', { hasText: 'e2e_backdrop' }).getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Começar a pintar' }).click()

  await expect(page.locator('.stage-backdrop-picker')).toBeVisible()
  const swatches = page.locator('.stage-backdrop-swatch')
  await expect(swatches).toHaveCount(2)

  const red = page.locator('.stage-backdrop-swatch[title="rgb(255, 0, 0)"]')
  const green = page.locator('.stage-backdrop-swatch[title="rgb(0, 255, 0)"]')
  await expect(red).toBeVisible()
  await expect(green).toBeVisible()

  // Padrão sensato sem clicar em nada: a 1ª cor da paleta (vermelho, ordem de aparição no PNG).
  await expect(red).toHaveClass(/stage-backdrop-swatch-selected/)
  await expect(green).not.toHaveClass(/stage-backdrop-swatch-selected/)

  await green.click()
  await expect(green).toHaveClass(/stage-backdrop-swatch-selected/)
  await expect(red).not.toHaveClass(/stage-backdrop-swatch-selected/)

  // Posiciona o jogador (obrigatório pra salvar) e salva.
  await page.locator('[title="Personagens — posicionar jogador e inimigos"]').click()
  await page.locator('[title="Colocar jogador — clique e depois clique no mapa"]').click()
  await page.locator('.stage-grid-canvas').click({ position: { x: 20, y: 20 } })
  await page.getByRole('button', { name: 'Salvar fase no jogo' }).click()
  await expect(page.getByText(/^Salvo em /).first()).toBeVisible()

  // Export de verdade pro formato que a Anubis documentou (docs/DATA_FORMAT.md § 4, "Cor de fundo
  // fixa da fase (backdrop)", 2026-10-01): 3 defines em stage1_entities.h, 0-31 nativo do SNES
  // (verde puro [0,255,0] -> canal÷8 -> R=0, G=31, B=0).
  const entitiesHeader = await page.evaluate(() =>
    fetch('/api/gfx-file?name=stage1_entities.h').then((r) => r.text()),
  )
  expect(entitiesHeader).toContain('#define STAGE1_BACKDROP_R 0')
  expect(entitiesHeader).toContain('#define STAGE1_BACKDROP_G 31')
  expect(entitiesHeader).toContain('#define STAGE1_BACKDROP_B 0')

  // Reabrir precisa continuar mostrando a escolha salva (verde), não voltar pro padrão.
  await page.getByRole('button', { name: 'Fechar fase (trocar tilesets)' }).click()
  await page.getByRole('button', { name: 'Editar' }).click()
  await expect(page.locator('.stage-backdrop-picker')).toBeVisible()
  await expect(page.locator('.stage-backdrop-swatch[title="rgb(0, 255, 0)"]')).toHaveClass(/stage-backdrop-swatch-selected/)
})
