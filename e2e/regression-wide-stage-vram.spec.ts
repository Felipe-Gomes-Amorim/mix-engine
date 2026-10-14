import { expect, test } from '@playwright/test'
import { makeUniqueBlocksPng } from './fixtures/pixelImage.ts'
import { clickHardwareCell, createTileset, goToTab, mockEngineBuild } from './helpers.ts'

// Fluxo central nº4 + regressão da feature mais nova (docs/PROGRESS.md, "fases largas de
// verdade", 2026-09-24, e "infra de teste Playwright", 2026-09-25): fase larga com largura
// configurável, e o aviso de orçamento de VRAM (a Anubis não detecta sozinha se uma fase estourar
// o espaço fixo de tiles únicos reservado por camada — só sobrescreveria VRAM adjacente em
// silêncio) tem que aparecer ANTES de exportar e bloquear "Salvar" até confirmar.
test.setTimeout(120_000)

test('fase larga: escolher largura, pintar mais de 256 blocos únicos na Camada 1, aviso de VRAM bloqueia salvar', async ({ page }) => {
  await page.goto('/')
  await mockEngineBuild(page)

  // 32 colunas x 12 linhas de blocos de 8x8, TODOS distintos entre si (384 no total) — usando
  // blockSize=32 na hora de pintar, cada "bloco" carimbado de uma vez cobre 4x4=16 tiles de
  // hardware únicos. 24 blocos (todo o tileset) = 384 tiles únicos, bem acima do limite de 256 da
  // Camada 1 (VRAM_LAYER1_MAX_UNIQUE_TILES, types.ts).
  const png = await makeUniqueBlocksPng(page, 32, 12)
  await createTileset(page, { name: 'e2e_vram', pngBuffer: png, blockSize: 32 })

  await goToTab(page, 'Fases')
  await page.locator('li', { hasText: 'e2e_vram' }).getByRole('checkbox').check()
  // Exercita também o seletor de largura configurável (fase larga de verdade) — 64 colunas (2
  // páginas) já é mais que suficiente pra caber os 24 blocos de 32px lado a lado.
  await page.getByLabel('Largura da fase:').selectOption('64')
  await page.getByRole('button', { name: 'Começar a pintar' }).click()

  const canvas = page.locator('.stage-grid-canvas')
  await expect(canvas).toBeVisible()
  // Cursor em passos de 32px pra combinar com o blockSize do tileset — carimbo alinhado certinho
  // no destino escolhido abaixo (sem isso, o clique podia cair no meio de um bloco de 32px e
  // desalinhar o carimbo do vizinho).
  await page.locator('.stage-cursor-step-select').selectOption('32')

  const tileset = page.locator('[title*="clique pra escolher outro bloco deste conjunto"]')
  const tileCount = 24 // 8 cols x 3 rows de blocos de 32px (256x96 / 32)
  for (let i = 0; i < tileCount; i++) {
    await tileset.click()
    await expect(page.locator('.tile-picker-modal')).toBeVisible()
    await page.locator('.tile-picker-modal .tile-grid .tile-thumb').nth(i).click()
    await expect(page.locator('.tile-picker-modal')).toBeHidden()
    // Destino: espelha a posição de origem no tileset (col=i%8, row=floor(i/8), em unidades de
    // 32px = 4 tiles de hardware) — cada bloco cai num retângulo 4x4 de hardware próprio, sem
    // sobrepor o vizinho.
    const destCol = (i % 8) * 4
    const destRow = Math.floor(i / 8) * 4
    await clickHardwareCell(canvas, destCol, destRow, 64)
  }

  await expect(page.getByText(/blocos de hardware únicos, mas só cabem/)).toBeVisible()
  await expect(page.getByText(/Camada 1 usa \d+ blocos de hardware únicos/)).toBeVisible()

  const saveButton = page.getByRole('button', { name: 'Salvar fase no jogo' })
  await expect(saveButton).toBeDisabled()

  await page.locator('[title="Personagens — posicionar jogador e inimigos"]').click()
  await page.locator('[title="Colocar jogador — clique e depois clique no mapa"]').click()
  await clickHardwareCell(canvas, 50, 20, 64)

  await expect(saveButton).toBeDisabled()
  await page.getByLabel('Confirmo que é isso mesmo, salvar assim.').check()
  await expect(saveButton).toBeEnabled()

  await saveButton.click()
  await expect(page.getByText(/^Salvo em /).first()).toBeVisible()
})
