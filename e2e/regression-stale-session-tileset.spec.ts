import { expect, test } from '@playwright/test'
import { makeGridPng } from './fixtures/pixelImage.ts'
import { createTileset, goToTab, mockEngineBuild } from './helpers.ts'

// Achado real do usuário (2026-10-05): editar e salvar um tileset ENQUANTO uma sessão de pintura já
// estava aberta (ex.: marcar um bloco como "Camada 2" depois de já ter clicado "Começar a pintar")
// não atualizava nada na sessão em andamento — o bloco recém-marcado ficava invisível em todo
// lugar (paleta, seletor de bloco, painel "C2"). Causa: trocar de aba ("Tilesets" <-> "Fases") não
// desmonta a sessão ativa (o mesmo StageWorkspace.tsx renderiza as duas abas), mas
// `tilesets`/`tileCollision`/`tileLayer`/`tilePriority` só eram calculados UMA VEZ, em
// handleStartSession/handleEditStage — nunca recarregados depois. Corrigido recarregando por nome
// sempre que a aba "Fases" volta a ficar ativa.

test('editar e salvar um tileset com a sessão de pintura já aberta atualiza a paleta ao voltar pra Fases', async ({
  page,
}) => {
  await page.goto('/')
  await mockEngineBuild(page)

  // 2 blocos, nenhum marcado Camada 2 ainda — simula "já comecei a pintar antes de marcar".
  const png = await makeGridPng(page, 2, 1, 8, [['#ff0000', '#00ff00']])
  await createTileset(page, { name: 'e2e_stale_session', pngBuffer: png })

  await goToTab(page, 'Fases')
  await page.locator('li', { hasText: 'e2e_stale_session' }).getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Começar a pintar' }).click()
  await expect(page.locator('.stage-grid-canvas')).toBeVisible()

  // Sem fechar a sessão: vai pra "Tilesets", edita o MESMO tileset, marca o bloco 1 como Camada 2.
  await page.locator('nav.top-nav').getByRole('button', { name: 'Tilesets' }).click()
  await page.locator('li', { hasText: 'e2e_stale_session' }).getByRole('button', { name: 'Editar' }).click()
  await expect(page.getByText('Editando "e2e_stale_session"')).toBeVisible()
  await page.locator('.stage-tile-cell').nth(1).locator('.stage-tile-layer2-toggle input[type="checkbox"]').check()
  await page.getByRole('button', { name: 'Salvar tileset' }).click()
  await expect(page.getByText('Tilesets já salvos')).toBeVisible()

  // Volta pra "Fases" (mesma sessão, nunca fechada) — o bloco marcado precisa aparecer no painel C2.
  await goToTab(page, 'Fases')
  await expect(page.locator('.stage-grid-canvas')).toBeVisible()
  await page.locator('[title*="Camada 2 — padrão de fundo"]').click()
  await expect(page.locator('.stage-layer2-panel')).toBeVisible()

  const square = page.locator('.stage-toolbar [title*="e2e_stale_session"]')
  await expect(square).toHaveCount(1)
  await square.click()
  await expect(page.locator('.tile-picker-modal')).toBeVisible()
  await expect(page.locator('.tile-picker-modal .tile-grid .tile-thumb')).toHaveCount(1)
  await expect(page.locator('.tile-picker-modal .tile-grid .tile-thumb').first()).toHaveAttribute('title', /Camada 2/)
})
