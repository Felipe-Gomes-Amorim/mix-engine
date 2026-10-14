import { expect, test } from '@playwright/test'
import { makeGridPng } from './fixtures/pixelImage.ts'
import { clickHardwareCell, createTileset, goToTab, mockEngineBuild } from './helpers.ts'

// Regressão de um bug REAL encontrado pelo usuário jogando (não achado por nenhum teste na época,
// docs/PROGRESS.md "aviso de proporção alta de bandeira", 2026-09-23): a Camada 1 nunca tem
// "vazio" de verdade — toda célula nunca pintada guarda implicitamente o bloco 0 do 1º tileset. Se
// esse bloco estiver marcado como "bandeira" (goal) sem querer, a fase INTEIRA (o que não foi
// pintado) vira bandeira em silêncio — o usuário relatou 632 de 1024 células assim, sem aviso
// nenhum antes de salvar. Corrigido com um aviso (>5% da grade virando bandeira, GOAL_WARNING_RATIO
// em StageSession.tsx) que EXIGE confirmação explícita antes de deixar salvar.

test('bloco 0 marcado como bandeira: aviso de proporção alta aparece e bloqueia salvar até confirmar', async ({ page }) => {
  await page.goto('/')
  await mockEngineBuild(page)

  // 1 bloco só, marcado "bandeira" — como NADA vai ser pintado, toda a grade (1024 células, 100%)
  // herda esse valor implicitamente, bem acima dos 5% do limiar.
  const png = await makeGridPng(page, 1, 1, 8, [['#ff0000']])
  await createTileset(page, { name: 'e2e_goalwarn', pngBuffer: png, markGoal: [0] })

  await goToTab(page, 'Fases')
  await page.locator('li', { hasText: 'e2e_goalwarn' }).getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Começar a pintar' }).click()
  await expect(page.locator('.stage-grid-canvas')).toBeVisible()

  await expect(page.getByText(/vão exportar como/)).toBeVisible()
  await expect(page.getByText('1024 de 1024 células (100%) vão exportar como')).toBeVisible()

  const saveButton = page.getByRole('button', { name: 'Salvar fase no jogo' })
  await expect(saveButton).toBeDisabled()

  // Posiciona o jogador (também obrigatório pra salvar) — o aviso de bandeira continua bloqueando
  // sozinho, mesmo com o jogador já posicionado.
  await page.locator('[title="Personagens — posicionar jogador e inimigos"]').click()
  await page.locator('[title="Colocar jogador — clique e depois clique no mapa"]').click()
  await clickHardwareCell(page.locator('.stage-grid-canvas'), 16, 20, 32)
  await expect(saveButton).toBeDisabled()

  await page.getByLabel('Confirmo que é isso mesmo, salvar assim.').check()
  await expect(saveButton).toBeEnabled()

  await saveButton.click()
  await expect(page.getByText(/^Salvo em /).first()).toBeVisible()
})
