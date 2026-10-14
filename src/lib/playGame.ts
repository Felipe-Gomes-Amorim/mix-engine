// Cliente do botão "Jogar" (estilo Unity, docs/PROGRESS.md "botão Jogar") — fala com os endpoints
// de vite-emulator-plugin.ts. Mesmo padrão de saveToEngine.ts: nunca lança, falha de rede vira um
// resultado `ok: false` normal.

/** Caminho do emulador já salvo nesta máquina (editor.local.json), ou `null` se ainda não escolhido. */
export async function getEmulatorPath(): Promise<string | null> {
  try {
    const response = await fetch('/api/emulator-path')
    const result = (await response.json()) as { ok: boolean; path: string | null }
    return result.ok ? result.path : null
  } catch {
    return null
  }
}

export type PickEmulatorPathResult = { ok: true; path: string | null } | { ok: false; message: string }

/** Abre o seletor de arquivo NATIVO do Windows — `path: null` quando o usuário cancela (não é erro). */
export async function pickEmulatorPath(): Promise<PickEmulatorPathResult> {
  try {
    const response = await fetch('/api/emulator-path/pick', { method: 'POST' })
    return (await response.json()) as PickEmulatorPathResult
  } catch {
    return { ok: false, message: 'Não consegui falar com o servidor do editor para abrir o seletor de arquivo.' }
  }
}

export type SaveEmulatorPathResult = { ok: true } | { ok: false; message: string }

export async function saveEmulatorPath(path: string): Promise<SaveEmulatorPathResult> {
  try {
    const response = await fetch('/api/emulator-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    return (await response.json()) as SaveEmulatorPathResult
  } catch {
    return { ok: false, message: 'Não consegui falar com o servidor do editor para salvar o caminho do emulador.' }
  }
}

export type LaunchEmulatorResult =
  | { ok: true }
  | { ok: false; phase: 'config' | 'no-emulator' | 'spawn' | 'network'; message: string }

/** Pede pro dev server abrir `romPath` (ex.: o `rom.path` que `buildEngine()` devolveu) no
 * emulador já salvo. */
export async function launchEmulator(romPath: string): Promise<LaunchEmulatorResult> {
  try {
    const response = await fetch('/api/launch-emulator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ romPath }),
    })
    return (await response.json()) as LaunchEmulatorResult
  } catch {
    return {
      ok: false,
      phase: 'network',
      message: 'Não consegui falar com o servidor do editor para abrir o emulador — isso só funciona com "npm run dev" rodando.',
    }
  }
}
