import { expect, test } from '@playwright/test'
import { makeGridPng } from './fixtures/pixelImage.ts'
import { clickHardwareCell, createTileset, goToTab, mockEngineBuild } from './helpers.ts'

// Painel dedicado da Camada 2 (docs/PROGRESS.md, "Camada 2 como padrão repetível", 2026-09-29) —
// largura própria (32/64), independente da largura da fase, com pré-visualização da repetição.

test('Camada 2: painel próprio, largura independente da fase, pré-visualização da repetição e salvar', async ({
  page,
}) => {
  await page.goto('/')
  await mockEngineBuild(page)

  const png = await makeGridPng(page, 2, 1, 8, [['#ff0000', '#00ff00']])
  await createTileset(page, { name: 'e2e_layer2', pngBuffer: png, markLayer2: [1] })

  await goToTab(page, 'Fases')
  await page.locator('li', { hasText: 'e2e_layer2' }).getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Começar a pintar' }).click()

  await expect(page.locator('.stage-grid-canvas')).toBeVisible()
  const mainCanvasSizeBefore = await page
    .locator('.stage-grid-canvas')
    .evaluate((el) => [(el as HTMLCanvasElement).width, (el as HTMLCanvasElement).height])

  await page.locator('[title*="Camada 2 — padrão de fundo"]').click()
  await expect(page.locator('.stage-layer2-panel')).toBeVisible()
  await expect(page.getByText(/não fica presa numa posição fixa da fase/)).toBeVisible()

  // Largura própria da Camada 2, independente da largura da fase (32 por padrão).
  const widthSelect = page.locator('.stage-layer2-panel select')
  await expect(widthSelect).toHaveValue('32')
  await widthSelect.selectOption('64')
  await expect(widthSelect).toHaveValue('64')

  // Só o bloco marcado como Camada 2 (índice 1, verde) aparece na paleta deste painel — o seletor
  // filtra por camada (docs/PROGRESS.md, "camada errada ao pintar", 2026-10-01), então o bloco de
  // Camada 1 (índice 0, vermelho) nem aparece aqui: só 1 tile-thumb no total.
  await page.locator('[title*="clique pra escolher outro bloco deste conjunto"]').click()
  await expect(page.locator('.tile-picker-modal')).toBeVisible()
  await expect(page.locator('.tile-picker-modal .tile-grid .tile-thumb')).toHaveCount(1)
  await page.locator('.tile-picker-modal .tile-grid .tile-thumb').first().click()
  await expect(page.locator('.tile-picker-modal')).toBeHidden()

  await clickHardwareCell(page.locator('.stage-layer2-panel .stage-grid-canvas').first(), 5, 5, 64)

  // Pré-visualização da repetição (3x lado a lado) renderiza sozinha, só leitura.
  await expect(page.locator('.stage-layer2-preview-canvas')).toBeVisible()

  // Voltar pro modo "Pintar blocos" precisa REDESENHAR o canvas principal — achado real (usuário
  // reportou com print): o painel da Camada 2 desmonta `.stage-viewport-area` (o canvas some do
  // DOM), então reabrir a fase normal remonta um canvas NOVO, em branco (300x150, tamanho padrão do
  // HTMLCanvasElement) até algo mais disparar o efeito de desenho de novo — o efeito não tinha
  // `mode` nas dependências, então nada o fazia rodar de novo só por causa dessa troca.
  await page.locator('[title="Pintar blocos"]').click()
  await expect(page.locator('.stage-grid-canvas')).toBeVisible()
  await expect(async () => {
    const size = await page
      .locator('.stage-grid-canvas')
      .evaluate((el) => [(el as HTMLCanvasElement).width, (el as HTMLCanvasElement).height])
    expect(size).toEqual(mainCanvasSizeBefore)
  }).toPass()

  // Posiciona o jogador (obrigatório pra salvar) e volta pra Camada 2 só pra confirmar que o
  // conteúdo pintado continua lá depois de trocar de modo e voltar.
  await page.locator('[title="Personagens — posicionar jogador e inimigos"]').click()
  await page.locator('[title="Colocar jogador — clique e depois clique no mapa"]').click()
  await clickHardwareCell(page.locator('.stage-grid-canvas'), 16, 20, 32)

  await page.getByRole('button', { name: 'Salvar fase no jogo' }).click()
  await expect(page.getByText(/^Salvo em /).first()).toBeVisible()
})
