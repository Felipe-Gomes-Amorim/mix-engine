import { expect, test } from '@playwright/test'
import { makeGridPng, makeUniqueBlocksPng } from './fixtures/pixelImage.ts'
import { clickHardwareCell, createBackground, createTileset, goToTab, mockEngineBuild } from './helpers.ts'

// Fundo como recurso salvo (docs/PROGRESS.md, "Fundo como recurso salvo", 2026-09-30) — imagem
// INTEIRA (256×256px = 32 colunas), escolhida junto com o(s) tileset(s) ao "Começar a pintar",
// carimbada de uma vez na Camada 2 (sem pintar bloco a bloco).

test('Fundo: criar, escolher junto com um tileset, carimbar na Camada 2 e salvar a fase', async ({ page }) => {
  await page.goto('/')
  await mockEngineBuild(page)

  const tilesetPng = await makeUniqueBlocksPng(page, 2, 1)
  await createTileset(page, { name: 'e2e_fundo_tileset', pngBuffer: tilesetPng })

  // 256x256px = 32 colunas x 32 linhas de 8px — largura válida mínima pra um Fundo. Xadrez de 2
  // cores (não `makeUniqueBlocksPng`, que gera ~1024 blocos ÚNICOS — estouraria de propósito o
  // orçamento de VRAM da Camada 2, 128 tiles únicos, e isso não é o que este teste quer exercitar).
  const checkerColors = Array.from({ length: 32 }, (_, row) =>
    Array.from({ length: 32 }, (_, col) => ((row + col) % 2 === 0 ? '#3355ff' : '#88ccff')),
  )
  const backgroundPng = await makeGridPng(page, 32, 32, 8, checkerColors)
  await createBackground(page, { name: 'e2e_ceu', pngBuffer: backgroundPng })

  await goToTab(page, 'Fases')
  await page.locator('li', { hasText: 'e2e_fundo_tileset' }).getByRole('checkbox').check()
  await page.locator('li', { hasText: 'e2e_ceu' }).getByRole('radio').check()
  await page.getByRole('button', { name: 'Começar a pintar' }).click()

  await expect(page.locator('.stage-grid-canvas')).toBeVisible()

  await page.locator('[title*="Camada 2 — padrão de fundo"]').click()
  await expect(page.locator('.stage-layer2-panel')).toBeVisible()

  const stampButton = page.getByRole('button', { name: 'Carimbar fundo "e2e_ceu" na Camada 2' })
  await expect(stampButton).toBeVisible()
  await stampButton.click()

  // Depois de carimbar, a largura da Camada 2 acompanha o Fundo (32 colunas) automaticamente.
  await expect(page.locator('.stage-layer2-panel select')).toHaveValue('32')

  // Posiciona o jogador (obrigatório pra salvar) e salva.
  await page.locator('[title="Personagens — posicionar jogador e inimigos"]').click()
  await page.locator('[title="Colocar jogador — clique e depois clique no mapa"]').click()
  await clickHardwareCell(page.locator('.stage-grid-canvas'), 16, 20, 32)

  await page.getByRole('button', { name: 'Salvar fase no jogo' }).click()
  await expect(page.getByText(/^Salvo em /).first()).toBeVisible()

  // Reabrir precisa continuar reconhecendo o Fundo (`_tileset_refs.json` guarda `kind: "background"`
  // por referência — ver stageTilesetRefs.ts/loadStage.ts) — sem isso, `gridLayer2` (carimbado com
  // índices da faixa do Fundo) ficaria sem a faixa correspondente na recombinação ao reabrir.
  await page.getByRole('button', { name: 'Fechar fase (trocar tilesets)' }).click()
  await page.getByRole('button', { name: 'Editar' }).click()
  await expect(page.locator('.stage-grid-canvas')).toBeVisible()
  await page.locator('[title*="Camada 2 — padrão de fundo"]').click()
  await expect(page.getByRole('button', { name: 'Carimbar fundo "e2e_ceu" na Camada 2' })).toBeVisible()
  await expect(page.locator('.stage-layer2-panel select')).toHaveValue('32')
})
