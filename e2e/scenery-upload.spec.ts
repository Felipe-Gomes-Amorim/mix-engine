import { expect, test } from '@playwright/test'
import { makeGridPng } from './fixtures/pixelImage.ts'
import { mockEngineBuild } from './helpers.ts'

// Fluxo central nº1, versão simplificada (docs/PROGRESS.md, "infra de teste Playwright",
// 2026-09-25): upload + validação + export de "cenário" — o caminho mais curto que já exercita
// `useImageUpload.ts`/`validateForExport` de ponta a ponta (compartilhado com o fluxo de
// personagem). A cobertura do fluxo completo de personagem (SpriteSheetEditor: pivô, hitbox, 5
// animações obrigatórias) fica documentada como próximo passo — ver docs/PROGRESS.md.
test('cenário: upload de imagem válida exporta com sucesso', async ({ page }) => {
  await page.goto('/')
  await mockEngineBuild(page)

  const png = await makeGridPng(page, 2, 2, 8, [
    ['#ff0000', '#00ff00'],
    ['#0000ff', '#ffffff'],
  ])
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'e2e_scenery.png', mimeType: 'image/png', buffer: png })

  await expect(page.getByText(/Imagem válida: usa \d+ de 16 cores possíveis/)).toBeVisible()

  await page.getByLabel('Cenário (a imagem inteira, sem editar)').check()
  await page.getByRole('button', { name: 'Salvar cenário no jogo' }).click()

  await expect(page.getByText(/^Salvo em /).first()).toBeVisible()
})
