import { expect, test } from '@playwright/test'
import { makeGridPng } from './fixtures/pixelImage.ts'
import { goToTab } from './helpers.ts'

// Fluxo central nº2 (docs/PROGRESS.md, "infra de teste Playwright", 2026-09-25): CRUD de tileset —
// criar, marcar colisão, salvar, reabrir (confirma que a colisão persistiu de verdade).

test('CRUD de tileset: criar com um bloco sólido, salvar, aparece na galeria, reabrir preserva a colisão', async ({ page }) => {
  await page.goto('/')
  await goToTab(page, 'Tilesets')

  await page.getByRole('button', { name: 'Novo tileset' }).click()
  await page.getByPlaceholder('ex.: floresta').fill('e2e_crud')

  // 2x2 blocos de 8x8, 4 cores distintas — tileCount = 4.
  const png = await makeGridPng(page, 2, 2, 8, [
    ['#ff0000', '#00ff00'],
    ['#0000ff', '#ffff00'],
  ])
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'e2e_crud.png', mimeType: 'image/png', buffer: png })

  await expect(page.getByText('O que é cada bloco?')).toBeVisible()

  // Bloco 0: 1 clique (vazio -> sólido, ver COLLISION_CYCLE).
  await page.locator('.tile-grid .tile-thumb').first().click()
  await expect(page.getByText('1 bloco(s) sólido(s), 0 bandeira(s) marcada(s).')).toBeVisible()

  await page.getByRole('button', { name: 'Salvar tileset' }).click()

  // Salvar fecha o editor e volta pra galeria (handleTilesetSaved).
  await expect(page.getByText('Tilesets já salvos')).toBeVisible()
  const row = page.locator('li', { hasText: 'e2e_crud' })
  await expect(row).toBeVisible()

  await row.getByRole('button', { name: 'Editar' }).click()
  await expect(page.getByText('Editando "e2e_crud"')).toBeVisible()
  await expect(page.getByText('1 bloco(s) sólido(s), 0 bandeira(s) marcada(s).')).toBeVisible()

  await page.getByRole('button', { name: 'Cancelar' }).click()
})
