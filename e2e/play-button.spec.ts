import { expect, test, type Page } from '@playwright/test'

// Botão "Jogar" na barra de topo (estilo Unity, docs/PROGRESS.md "botão Jogar") — compila e abre o
// ROM no emulador. Só testa a ORQUESTRAÇÃO do frontend (build -> escolher emulador se preciso ->
// salvar -> lançar), com TODOS os endpoints mockados — nunca roda `make` de verdade nem abre um
// seletor de arquivo/emulador real (isso travaria a suíte esperando um humano clicar numa janela
// nativa). A lógica de disco (ler/mesclar editor.local.json) já é coberta por tests/emulator.test.ts.

const ROM: { path: string; bytes: number; updated: boolean } = {
  path: 'build/jogo-plataforma-snes.sfc',
  bytes: 123456,
  updated: true,
}

/** `delayMs` segura a resposta um pouco — sem isso, todo o fluxo (build -> escolher emulador ->
 * salvar -> lançar) termina rápido demais pra dar tempo de observar um estado "Compilando…"/etc.
 * no meio do caminho (mock responde quase instantâneo, bem diferente de um `make` de verdade). */
async function mockBuild(page: Page, result: unknown = { ok: true, durationMs: 1, output: 'ok', rom: ROM }, delayMs = 0) {
  await page.route('**/api/build-engine', async (route) => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) })
  })
}

async function mockEmulatorPath(page: Page, path: string | null) {
  await page.route('**/api/emulator-path', (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, path }) })
  })
}

async function mockSavePath(page: Page) {
  await page.route('**/api/emulator-path', (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
}

async function mockLaunch(page: Page, result: unknown = { ok: true }) {
  await page.route('**/api/launch-emulator', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) }),
  )
}

test('1ª vez: compila, abre o seletor de emulador, salva a escolha e abre o jogo', async ({ page }) => {
  await page.goto('/')
  await mockBuild(page, undefined, 300)
  await mockEmulatorPath(page, null)
  await mockSavePath(page)
  await mockLaunch(page)

  let pickedPath: string | null = null
  await page.route('**/api/emulator-path/pick', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, path: 'C:/emus/snes9x.exe' }) }),
  )
  page.on('request', (req) => {
    if (req.url().endsWith('/api/emulator-path') && req.method() === 'POST') {
      pickedPath = req.postDataJSON()?.path ?? pickedPath
    }
  })

  await page.getByRole('button', { name: 'Jogar' }).click()
  await expect(page.getByRole('button', { name: 'Compilando…' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Jogar' })).toBeVisible({ timeout: 10000 })
  expect(pickedPath).toBe('C:/emus/snes9x.exe')
})

test('clique seguinte: caminho já salvo, abre direto sem perguntar de novo', async ({ page }) => {
  await page.goto('/')
  await mockBuild(page)
  await mockEmulatorPath(page, 'C:/emus/snes9x.exe')
  await mockLaunch(page)

  let pickCalled = false
  await page.route('**/api/emulator-path/pick', (route) => {
    pickCalled = true
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, path: null }) })
  })

  await page.getByRole('button', { name: 'Jogar' }).click()
  await expect(page.getByRole('button', { name: 'Jogar' })).toBeVisible({ timeout: 10000 })
  expect(pickCalled).toBe(false)
})

test('cancelar o seletor de emulador não mostra erro nem tenta lançar nada', async ({ page }) => {
  await page.goto('/')
  await mockBuild(page)
  await mockEmulatorPath(page, null)
  await page.route('**/api/emulator-path/pick', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, path: null }) }),
  )
  let launchCalled = false
  await page.route('**/api/launch-emulator', (route) => {
    launchCalled = true
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })

  await page.getByRole('button', { name: 'Jogar' }).click()
  await expect(page.getByRole('button', { name: 'Jogar' })).toBeVisible({ timeout: 10000 })
  await expect(page.locator('.play-status-error')).toHaveCount(0)
  expect(launchCalled).toBe(false)
})

test('build falhando mostra o erro perto do botão Jogar, com a saída disponível', async ({ page }) => {
  await page.goto('/')
  await mockBuild(page, { ok: false, phase: 'make', message: 'O build do jogo falhou.', output: 'erro: xyz' })

  await page.getByRole('button', { name: 'Jogar' }).click()
  await expect(page.locator('.play-status-error')).toBeVisible()
  await expect(page.locator('.play-status-error')).toContainText('O build do jogo falhou.')
  await page.getByText('Ver saída do build').click()
  await expect(page.locator('.play-status-error .build-output')).toContainText('erro: xyz')
})

test('"Trocar emulador" reabre o seletor mesmo já tendo um caminho salvo', async ({ page }) => {
  await page.goto('/')
  await mockEmulatorPath(page, 'C:/emus/antigo.exe')

  let pickCalled = false
  let savedPath: string | null = null
  await page.route('**/api/emulator-path/pick', (route) => {
    pickCalled = true
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, path: 'C:/emus/novo.exe' }) })
  })
  page.on('request', (req) => {
    if (req.url().endsWith('/api/emulator-path') && req.method() === 'POST') {
      savedPath = req.postDataJSON()?.path ?? savedPath
    }
  })
  await mockSavePath(page)

  await page.getByRole('button', { name: 'Trocar emulador' }).click()
  await expect(page.getByRole('button', { name: 'Trocar emulador' })).toBeEnabled({ timeout: 10000 })
  expect(pickCalled).toBe(true)
  expect(savedPath).toBe('C:/emus/novo.exe')
})
