import { expect, test } from '@playwright/test'
import { makeGridPng } from './fixtures/pixelImage.ts'
import { createTileset, goToTab, mockEngineBuild } from './helpers.ts'

// Achado real (Anubis investigando o poste sumido, 2026-10-01): salvar uma fase SEM Camada 2
// apagava `stage1_tilemap_layer2.bmp`, mas os arquivos CONVERTIDOS (.pic/.map/.pal, gerados pelo
// `make`/gfx4snes do lado da Anubis) não eram apagados junto — a regra de Make que os regenera
// depende do `.bmp` existir, então sem ele o jogo continuava rodando com uma Camada 2 antiga,
// desatualizada, sem erro nenhum. Corrigido: `_tilemap_layer2.bmp` agora é SEMPRE exportado, mesmo
// em branco, garantindo que o `make` sempre reconverte a partir do estado real atual.

test('Camada 2 sem conteúdo: "stage1_tilemap_layer2.bmp" ainda é exportado (em branco), nunca apagado', async ({
  page,
}) => {
  await page.goto('/')
  await mockEngineBuild(page)

  const png = await makeGridPng(page, 2, 1, 8, [['#ff0000', '#00ff00']])
  await createTileset(page, { name: 'e2e_no_layer2', pngBuffer: png })

  await goToTab(page, 'Fases')
  await page.locator('li', { hasText: 'e2e_no_layer2' }).getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Começar a pintar' }).click()

  // Nenhum bloco de Camada 2 pintado — só o jogador, pra poder salvar.
  await expect(page.locator('.stage-grid-canvas')).toBeVisible()
  await page.locator('[title="Personagens — posicionar jogador e inimigos"]').click()
  await page.locator('[title="Colocar jogador — clique e depois clique no mapa"]').click()
  await page.locator('.stage-grid-canvas').click({ position: { x: 20, y: 20 } })

  await page.getByRole('button', { name: 'Salvar fase no jogo' }).click()
  await expect(page.getByText(/^Salvo em /).first()).toBeVisible()

  const listed = await page.evaluate(() =>
    fetch('/api/gfx-list')
      .then((r) => r.json())
      .then((data: { files: { name: string }[] }) => data.files.map((f) => f.name)),
  )
  expect(listed).toContain('stage1_tilemap_layer2.bmp')
})
