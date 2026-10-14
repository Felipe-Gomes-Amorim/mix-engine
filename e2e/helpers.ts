import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Intercepta `POST /api/build-engine` e devolve sucesso canned, sem rodar o `make` de verdade —
 * os testes E2E validam o FLUXO de salvar (grava os arquivos certos, mostra a mensagem certa),
 * não a toolchain de build (isso já é testado por `tests/*.test.ts` com fixtures, ver
 * `vite-engine-build.test.ts`). Evita depender de PVSNESLIB_HOME/Git Bash/make estarem
 * configurados em toda máquina que rodar `npm run test:e2e`, e mantém os testes rápidos.
 */
export async function mockEngineBuild(page: Page): Promise<void> {
  await page.route('**/api/build-engine', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, durationMs: 1, output: '(build real pulado — mock do teste E2E)' }),
    }),
  )
}

export async function goToTab(page: Page, tab: 'Personagens' | 'Tilesets' | 'Fundos' | 'Fases'): Promise<void> {
  await page.getByRole('button', { name: tab, exact: false }).click()
}

/**
 * Cria um tileset salvo do zero, pela UI de verdade (aba "Tilesets" -> "Novo tileset") — usado
 * como preparação por todo teste que precisa de um tileset pra escolher na aba "Fases", sem
 * depender de nenhum outro teste ter rodado antes (cada teste E2E é independente, mesmo espírito
 * de `tests/*.test.ts`). Volta pra galeria ao final (mesmo estado de quando termina de cadastrar
 * um tileset manualmente). `markSolid`/`markGoal` marcam blocos por índice (1 clique = sólido, 2 =
 * bandeira — ver `COLLISION_CYCLE`, types.ts); blocos não citados ficam vazios.
 */
export async function createTileset(
  page: Page,
  options: {
    name: string
    /** PNG já pronto (ver e2e/fixtures/pixelImage.ts) — dimensões múltiplas de 8, ≤16 cores. */
    pngBuffer: Buffer
    /** Só precisa ser passado quando != 8 (o padrão, `DEFAULT_STAGE_BLOCK_SIZE`) — só aparece
     * seletor de tamanho de bloco na tela quando a imagem aceita mais de um tamanho. */
    blockSize?: 8 | 16 | 32
    markSolid?: number[]
    markGoal?: number[]
    /** Marca o bloco como Camada 2 (checkbox "Camada 2" de cada célula, TilesetEditor.tsx) — vira
     * decoração sem colisão, vai pro `gridLayer2` na hora de pintar a fase. */
    markLayer2?: number[]
    /** Marca o bloco "Na frente" (checkbox "Na frente" de cada célula, TilesetEditor.tsx, docs/
     * DATA_FORMAT.md § 4 "Bit de prioridade por tile da Camada 1") — desenha na frente do jogador/
     * inimigo. Só faz sentido pra blocos de Camada 1 (não em `markLayer2`). */
    markPriority?: number[]
  },
): Promise<void> {
  await goToTab(page, 'Tilesets')
  await page.getByRole('button', { name: 'Novo tileset' }).click()
  await page.getByPlaceholder('ex.: floresta').fill(options.name)

  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: `${options.name}.png`, mimeType: 'image/png', buffer: options.pngBuffer })
  await expect(page.getByText('O que é cada bloco?')).toBeVisible()

  if (options.blockSize && options.blockSize !== 8) {
    await page.getByLabel('Tamanho do bloco').selectOption(String(options.blockSize))
  }

  const thumbs = page.locator('.tile-grid .tile-thumb')
  for (const tileIndex of options.markSolid ?? []) {
    await thumbs.nth(tileIndex).click()
  }
  for (const tileIndex of options.markGoal ?? []) {
    await thumbs.nth(tileIndex).click()
    await thumbs.nth(tileIndex).click()
  }
  const cells = page.locator('.stage-tile-cell')
  for (const tileIndex of options.markLayer2 ?? []) {
    await cells.nth(tileIndex).locator('.stage-tile-layer2-toggle input[type="checkbox"]').check()
  }
  for (const tileIndex of options.markPriority ?? []) {
    await cells.nth(tileIndex).locator('.stage-tile-priority-toggle input[type="checkbox"]').check()
  }

  await page.getByRole('button', { name: 'Salvar tileset' }).click()
  await expect(page.getByText('Tilesets já salvos')).toBeVisible()
}

/**
 * Cria um Fundo salvo do zero, pela UI de verdade (aba "Fundos" -> "Novo fundo") — docs/PROGRESS.md,
 * "Fundo como recurso salvo", 2026-09-30. Mesmo espírito de `createTileset`, bem mais simples (sem
 * tamanho de bloco, sem colisão/camada por bloco): a imagem precisa já respeitar as dimensões que a
 * Camada 2 aceita (256×256 ou 512×256px, `validateBackgroundDimensions`).
 */
export async function createBackground(page: Page, options: { name: string; pngBuffer: Buffer }): Promise<void> {
  await goToTab(page, 'Fundos')
  await page.getByRole('button', { name: 'Novo fundo' }).click()
  await page.getByPlaceholder('ex.: ceu_com_morros').fill(options.name)

  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: `${options.name}.png`, mimeType: 'image/png', buffer: options.pngBuffer })

  await page.getByRole('button', { name: 'Salvar fundo' }).click()
  await expect(page.getByText('Fundos já salvos')).toBeVisible()
}

/** Clica no centro da célula de HARDWARE `(col, row)` do canvas de pintura (`.stage-grid-canvas`)
 * — em FRAÇÃO do canvas (0..1), então funciona não importa a escala CSS real na tela (mesma
 * matemática de `cellFromClient`/`stagePixelFromClient` em StageSession.tsx: a posição só importa
 * em proporção da imagem composta, nunca em pixel de tela absoluto). `totalCols` é a largura da
 * fase em tiles de hardware (`widthTiles`); a altura é sempre 32 (`STAGE_HEIGHT_TILES`). */
export async function clickHardwareCell(canvas: Locator, col: number, row: number, totalCols: number): Promise<void> {
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas de pintura sem bounding box visível.')
  const totalRows = 32
  const fx = (col + 0.5) / totalCols
  const fy = (row + 0.5) / totalRows
  await canvas.click({ position: { x: fx * box.width, y: fy * box.height } })
}
