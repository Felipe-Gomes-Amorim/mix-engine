import { expect, test } from '@playwright/test'
import { makeGridPng } from './fixtures/pixelImage.ts'
import { mockEngineBuild } from './helpers.ts'

// Quantização automática de paleta (docs/PROGRESS.md, "quantização automática de paleta",
// 2026-09-25) — uma imagem com mais de 16 cores, até aqui, só podia ser REJEITADA (o usuário tinha
// que reduzir num editor externo). Agora existe uma oferta de reduzir automaticamente, sempre com
// prévia antes/depois e confirmação explícita (nunca automático/silencioso, é destrutivo/lossy).

function distinctColors(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const hue = Math.round((i * 360) / n)
    return `hsl(${hue}, 90%, 50%)`
  })
}

test('imagem com mais de 16 cores oferece reduzir automaticamente, com prévia antes/depois e confirmação explícita', async ({ page }) => {
  await page.goto('/')
  await mockEngineBuild(page)

  // 20 cores distintas (1 por coluna, blocos de 8x8) — estoura o limite de 16 do SNES.
  const colors = distinctColors(20)
  const png = await makeGridPng(page, 20, 1, 8, [colors])
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'e2e_quantize.png', mimeType: 'image/png', buffer: png })

  await expect(page.getByText(/cores.*mas o SNES aceita no máximo/).first()).toBeVisible()

  // Modal aparece sozinho (a oferta É o modal, com Cancelar/Confirmar — nunca aplica sem clique).
  await expect(page.locator('.quantize-modal')).toBeVisible()
  await expect(page.getByText('Reduzir cores automaticamente?')).toBeVisible()
  await expect(page.locator('.quantize-preview-pair canvas')).toHaveCount(2)

  // Cancelar não aplica nada — a imagem continua inválida.
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.locator('.quantize-modal')).toBeHidden()
  await expect(page.getByText(/cores.*mas o SNES aceita no máximo/).first()).toBeVisible()

  // Reabre a oferta trocando de arquivo de novo (mesmo PNG) e desta vez confirma.
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'e2e_quantize.png', mimeType: 'image/png', buffer: png })
  await expect(page.locator('.quantize-modal')).toBeVisible()
  await page.getByRole('button', { name: 'Reduzir e usar esta versão' }).click()

  await expect(page.locator('.quantize-modal')).toBeHidden()
  await expect(page.getByText(/Imagem válida: usa \d+ de 16 cores possíveis/)).toBeVisible()

  await page.getByLabel('Cenário (a imagem inteira, sem editar)').check()
  await page.getByRole('button', { name: 'Salvar cenário no jogo' }).click()
  await expect(page.getByText(/^Salvo em /).first()).toBeVisible()
})
