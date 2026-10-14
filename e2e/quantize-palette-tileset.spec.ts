import { expect, test } from '@playwright/test'
import { makeGridPng } from './fixtures/pixelImage.ts'
import { goToTab } from './helpers.ts'

// Mesma oferta de quantização (docs/PROGRESS.md, "quantização automática de paleta", 2026-09-25),
// no OUTRO ponto real de upload fresco (achado ao conferir o código: não é só
// personagem/cenário) — TilesetEditor.tsx tem seu próprio handler de upload, sem usar
// useImageUpload.ts.
function distinctColors(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `hsl(${Math.round((i * 360) / n)}, 90%, 50%)`)
}

test('tileset: imagem com mais de 16 cores também oferece reduzir automaticamente', async ({ page }) => {
  await page.goto('/')
  await goToTab(page, 'Tilesets')
  await page.getByRole('button', { name: 'Novo tileset' }).click()
  await page.getByPlaceholder('ex.: floresta').fill('e2e_quantize_tileset')

  const png = await makeGridPng(page, 18, 1, 8, [distinctColors(18)])
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'e2e_quantize_tileset.png', mimeType: 'image/png', buffer: png })

  await expect(page.locator('.quantize-modal')).toBeVisible()
  await page.getByRole('button', { name: 'Reduzir e usar esta versão' }).click()
  await expect(page.locator('.quantize-modal')).toBeHidden()

  await expect(page.getByText('O que é cada bloco?')).toBeVisible()
  await page.getByRole('button', { name: 'Salvar tileset' }).click()
  await expect(page.getByText('Tilesets já salvos')).toBeVisible()
  await expect(page.locator('li', { hasText: 'e2e_quantize_tileset' })).toBeVisible()
})
