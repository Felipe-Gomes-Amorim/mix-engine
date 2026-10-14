export type SaveResult = { ok: true; path: string } | { ok: false; message: string }

/**
 * Manda um arquivo (.bmp / .h) pro endpoint do dev server (vite-export-gfx-plugin.ts),
 * que escreve em ../jogo-plataforma-snes/assets/gfx/. Só existe com `npm run dev`.
 */
export async function saveToEngine(fileName: string, body: Blob): Promise<SaveResult> {
  try {
    const response = await fetch('/api/export-gfx', {
      method: 'POST',
      headers: { 'X-File-Name': fileName },
      body,
    })
    const result = await response.json()
    if (!response.ok || !result.ok) {
      return { ok: false, message: result.message ?? 'Falha ao salvar o arquivo.' }
    }
    return { ok: true, path: result.path }
  } catch {
    return {
      ok: false,
      message:
        'Não foi possível salvar direto em disco — isso só funciona com ' +
        '"npm run dev" rodando.',
    }
  }
}

/** Mesmo formato que `runEngineBuild` (vite-engine-build.ts) devolve em /api/build-engine. */
export type BuildResult =
  | {
      ok: true
      durationMs: number
      output: string
      rom?: { path: string; bytes: number; updated: boolean }
    }
  | {
      ok: false
      phase: 'config' | 'busy' | 'spawn' | 'make' | 'timeout' | 'network'
      message: string
      output?: string
      durationMs?: number
      exitCode?: number | null
    }

/**
 * Pede pro dev server rodar o `make` da engine (config em editor.local.json) e
 * espera terminar. Nunca lança: falha de rede vira `phase: 'network'`.
 */
export async function buildEngine(): Promise<BuildResult> {
  try {
    const response = await fetch('/api/build-engine', { method: 'POST' })
    return (await response.json()) as BuildResult
  } catch {
    return {
      ok: false,
      phase: 'network',
      message:
        'Não consegui falar com o servidor do editor para compilar o jogo — isso só funciona ' +
        'com "npm run dev" rodando.',
    }
  }
}
