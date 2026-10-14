import { defineConfig } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Infra de teste E2E permanente (docs/PROGRESS.md, "infra de teste Playwright", 2026-09-25) —
// substitui os scripts soltos/descartáveis (`npx --yes -p playwright`) usados até aqui pra validar
// UI real, que nunca viravam regressão automática.
//
// ISOLAMENTO (regra de segurança real desta semana, ver "Cuidados" no pedido que motivou isso):
// os testes NUNCA podem escrever em `../jogo-plataforma-snes/assets/gfx/` (arquivos reais da
// Anubis, ex. `stage1_*`/`hero_*`) nem em `assets/tilesets/`/`assets/backgrounds/` deste projeto
// (tilesets/Fundos reais do usuário) — o servidor de dev usado pelos testes sobe com
// `PROMETEUS_E2E_GFX_DIR`/`PROMETEUS_E2E_TILESET_DIR`/`PROMETEUS_E2E_BACKGROUND_DIR` apontando pra
// pastas temporárias do SO (ver `e2e/global-setup.ts`), nunca pra dentro do repositório.
export const E2E_GFX_DIR = join(tmpdir(), 'prometeus-e2e-gfx')
export const E2E_TILESET_DIR = join(tmpdir(), 'prometeus-e2e-tilesets')
export const E2E_BACKGROUND_DIR = join(tmpdir(), 'prometeus-e2e-backgrounds')
export const E2E_PORT = 5183
// "localhost", não "127.0.0.1" (achado real, 2026-09-25): o dev server do Vite sem `--host` só
// aceita conexão em "localhost" nesta máquina — "127.0.0.1" dá connection refused mesmo com o
// servidor de pé, o que fazia o `webServer` do Playwright nunca considerar ele pronto.
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx vite --port ${E2E_PORT} --strictPort`,
    url: E2E_BASE_URL,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      PROMETEUS_E2E_GFX_DIR: E2E_GFX_DIR,
      PROMETEUS_E2E_TILESET_DIR: E2E_TILESET_DIR,
      PROMETEUS_E2E_BACKGROUND_DIR: E2E_BACKGROUND_DIR,
    },
  },
})
