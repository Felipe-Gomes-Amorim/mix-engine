// Cliente HTTP pros endpoints de tileset salvo (vite-tileset-files-plugin.ts) — mesmo formato de
// gfxFiles.ts/saveToEngine.ts, só que apontando pra `assets/tilesets/` DESTE projeto (Prometeus),
// nunca `jogo-plataforma-snes/`. Só funciona com "npm run dev" rodando.

import type { GfxFileEntry } from '../../lib/gfxFiles'
import type { SaveResult } from '../../lib/saveToEngine'

export async function listTilesetFiles(): Promise<GfxFileEntry[]> {
  try {
    const response = await fetch('/api/tileset-list')
    if (!response.ok) return []
    const data = (await response.json()) as { ok: boolean; files?: GfxFileEntry[] }
    return data.files ?? []
  } catch {
    return []
  }
}

async function fetchTilesetFile(name: string): Promise<Response> {
  const response = await fetch(`/api/tileset-file?name=${encodeURIComponent(name)}`)
  if (!response.ok) {
    let message = `Não consegui ler "${name}" (HTTP ${response.status}).`
    try {
      const body = (await response.json()) as { message?: string }
      if (body.message) message = body.message
    } catch {
      // resposta não era JSON — mantém a mensagem padrão
    }
    throw new Error(message)
  }
  return response
}

export async function readTilesetFile(name: string): Promise<ArrayBuffer> {
  return (await fetchTilesetFile(name)).arrayBuffer()
}

export async function readTilesetFileText(name: string): Promise<string> {
  return (await fetchTilesetFile(name)).text()
}

/** Nunca lança — falha vira `false` (apagar é best-effort, um arquivo por vez). */
export async function deleteTilesetFile(name: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/tileset-file?name=${encodeURIComponent(name)}`, { method: 'DELETE' })
    return response.ok
  } catch {
    return false
  }
}

/** Manda um arquivo (.bmp / .json) pro endpoint do dev server (vite-tileset-files-plugin.ts), que
 * escreve em `assets/tilesets/` deste projeto. Mesmo formato de retorno de `saveToEngine`. */
export async function saveTilesetFile(fileName: string, body: Blob): Promise<SaveResult> {
  try {
    const response = await fetch('/api/tileset-save', {
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
      message: 'Não foi possível salvar direto em disco — isso só funciona com "npm run dev" rodando.',
    }
  }
}
