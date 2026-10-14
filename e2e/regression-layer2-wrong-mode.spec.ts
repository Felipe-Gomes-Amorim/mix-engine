import { expect, test } from '@playwright/test'
import { makeGridPng } from './fixtures/pixelImage.ts'
import { clickHardwareCell, createTileset, goToTab, mockEngineBuild } from './helpers.ts'

// Achado real do usuário (2026-10-01): pintar com um bloco marcado "Camada 2" enquanto ainda no
// modo normal "Pintar blocos" corrompia `gridLayer2` — a escrita usava a largura da FASE inteira
// (`HARDWARE_COLS`), mas `gridLayer2` só tem a largura PRÓPRIA, bem menor, da Camada 2. Resultado
// relatado: blocos aparecendo cortados/repetidos na 1ª tentativa, e simplesmente não pintando mais
// na 2ª (depois que o guard anti-corrupção passou a bloquear silenciosamente). Corrigido nos dois
// lados: o seletor de bloco agora SÓ mostra blocos da camada certa pro modo atual (não dá mais pra
// nem escolher um bloco de Camada 2 estando no modo "Pintar blocos"), e os 3 pontos que escrevem na
// grade (`paintCell`/`floodFillAt`/`applyTerrainAt`) bloqueiam explicitamente qualquer combinação
// camada/modo errada, como rede de segurança.

test('bloco de Camada 2 fica invisível no seletor do modo "Pintar blocos", e vice-versa', async ({ page }) => {
  await page.goto('/')
  await mockEngineBuild(page)

  // Bloco 0 = Camada 1 (padrão), bloco 1 = marcado Camada 2.
  const png = await makeGridPng(page, 2, 1, 8, [['#ff0000', '#00ff00']])
  await createTileset(page, { name: 'e2e_layer_mismatch', pngBuffer: png, markLayer2: [1] })

  await goToTab(page, 'Fases')
  await page.locator('li', { hasText: 'e2e_layer_mismatch' }).getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Começar a pintar' }).click()
  await expect(page.locator('.stage-grid-canvas')).toBeVisible()

  const openPickerButton = page.locator('[title*="clique pra escolher outro bloco deste conjunto"]')

  // Modo "Pintar blocos" (padrão): só o bloco de Camada 1 aparece no seletor.
  await openPickerButton.click()
  await expect(page.locator('.tile-picker-modal')).toBeVisible()
  await expect(page.locator('.tile-picker-modal .tile-grid .tile-thumb')).toHaveCount(1)
  await page.locator('.tile-picker-modal-close').click()

  // Modo "C2": só o bloco de Camada 2 aparece.
  await page.locator('[title*="Camada 2 — padrão de fundo"]').click()
  await openPickerButton.click()
  await expect(page.locator('.tile-picker-modal')).toBeVisible()
  await expect(page.locator('.tile-picker-modal .tile-grid .tile-thumb')).toHaveCount(1)
  await page.locator('.tile-picker-modal .tile-grid .tile-thumb').click()
  await expect(page.locator('.tile-picker-modal')).toBeHidden()

  // Pinta com o bloco de Camada 2 dentro do painel certo — precisa funcionar sem corromper nada.
  await clickHardwareCell(page.locator('.stage-layer2-panel .stage-grid-canvas').first(), 5, 5, 32)

  // Salva e reabre — a célula pintada precisa continuar lá (prova que a grade não corrompeu).
  await page.locator('[title="Personagens — posicionar jogador e inimigos"]').click()
  await page.locator('[title="Colocar jogador — clique e depois clique no mapa"]').click()
  await clickHardwareCell(page.locator('.stage-grid-canvas'), 16, 20, 32)
  await page.getByRole('button', { name: 'Salvar fase no jogo' }).click()
  await expect(page.getByText(/^Salvo em /).first()).toBeVisible()

  await page.getByRole('button', { name: 'Fechar fase (trocar tilesets)' }).click()
  await page.getByRole('button', { name: 'Editar' }).click()
  await expect(page.locator('.stage-grid-canvas')).toBeVisible()
  await page.locator('[title*="Camada 2 — padrão de fundo"]').click()
  await expect(page.locator('.stage-layer2-panel select')).toHaveValue('32')
})
