import { mkdirSync, rmSync } from 'node:fs'
import { E2E_BACKGROUND_DIR, E2E_GFX_DIR, E2E_TILESET_DIR } from '../playwright.config.ts'

/** Roda UMA vez antes de toda a suíte E2E — garante que as pastas isoladas (nunca as reais, ver
 * playwright.config.ts) começam vazias, sem sobra de uma rodada anterior interferindo nos
 * testes (ex. um `stage1_tileset_refs.json` velho referenciando um tileset já apagado). */
export default function globalSetup(): void {
  for (const dir of [E2E_GFX_DIR, E2E_TILESET_DIR, E2E_BACKGROUND_DIR]) {
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
  }
}
