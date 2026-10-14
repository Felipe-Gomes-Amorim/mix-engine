import { expect, test } from '@playwright/test'
import { makeGridPng } from './fixtures/pixelImage.ts'
import { goToTab } from './helpers.ts'

// Pedido do usuário, 2026-09-25: a lista de grupos de terreno cadastrados deveria mostrar um ícone
// quadrado (mesmo estilo da paleta de blocos/edição de fase) + o nome, em vez de um botão de texto
// solto — e o editor de grupo precisa mostrar as seções novas de autotile (blocos finos meio/ponta,
// entalhes de lado inteiro), não só as 9 variantes + cantos internos de antes.
test('lista de terrenos mostra ícone quadrado + nome, e o editor do grupo mostra as seções novas de autotile', async ({ page }) => {
  await page.goto('/')
  await goToTab(page, 'Tilesets')
  await page.getByRole('button', { name: 'Novo tileset' }).click()
  await page.getByPlaceholder('ex.: floresta').fill('e2e_terrain_list')

  const png = await makeGridPng(page, 3, 3, 8, [
    ['#ff0000', '#00ff00', '#0000ff'],
    ['#ffff00', '#ff00ff', '#00ffff'],
    ['#808080', '#a0522d', '#ffffff'],
  ])
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'e2e_terrain_list.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByText('O que é cada bloco?')).toBeVisible()

  await page.getByPlaceholder('nome do terreno (ex.: grama)').fill('grama')
  await page.getByRole('button', { name: 'Novo grupo' }).click()

  // Clica no slot de "Preenchimento" (5º da grade 3x3 principal, TERRAIN_EDGE_ROLES[4] = 'fill')
  // e escolhe o bloco 4 (o do meio, cor magenta) — só o suficiente pra aparecer um ícone
  // reconhecível na lista.
  await page.locator('.terrain-role-grid .terrain-role-slot-empty').nth(4).click()
  // Escopado a `.terrain-group-editor` — a grade principal "O que é cada bloco?" TAMBÉM usa a
  // classe `.tile-grid`, um seletor sem escopo pegaria o bloco errado (achado real ao rodar este
  // teste: sem o escopo, o clique caiu na grade principal, mudando a colisão de um bloco avulso
  // em vez de escolher o papel de preenchimento do terreno).
  await page.locator('.terrain-group-editor .tile-grid .tile-thumb').nth(5).click() // 0 = "Nenhum", 5 = bloco 4

  await page.getByRole('button', { name: 'Fechar' }).click()

  const row = page.locator('.terrain-group-item', { hasText: 'grama' })
  await expect(row).toBeVisible()
  await expect(row.locator('.terrain-group-icon canvas')).toBeVisible()
  await expect(row.locator('.terrain-group-name')).toHaveText('grama')

  await row.click()
  await expect(page.getByText('Blocos finos — meio (opcional)')).toBeVisible()
  await expect(page.getByText('Blocos finos — ponta/fim (opcional)')).toBeVisible()
  await expect(page.getByText('Blocos finos — canto/cotovelo (opcional)')).toBeVisible()
  await expect(page.getByText('Entalhes de lado inteiro (opcional)')).toBeVisible()
  await expect(page.getByText('Cruzamento de bloco fino (opcional)')).toBeVisible()

  // Contagem total de papéis (achado real, 2026-09-25: o usuário contou os slots na tela pra
  // conferir se batia com o esquema documentado) — 9 borda/canto/preenchimento + 4 cantos internos
  // + 2 blocos finos + 4 pontas + 4 cantos/cotovelo + 4 entalhes + 1 cruzamento = 28. Cada slot
  // (atribuído ou vazio) sempre carrega a classe `.tile-thumb`, então contar isso escopado às
  // grades de papel (não a grade de escolha de bloco avulso, que é `.tile-grid`, classe diferente)
  // dá o total exato.
  await expect(page.locator('.terrain-group-editor .terrain-role-grid .tile-thumb')).toHaveCount(28)
})
