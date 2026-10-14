// Cliente HTTP pros endpoints de listar/ler/apagar arquivos em assets/gfx/
// (vite-gfx-files.ts / vite-export-gfx-plugin.ts). Só funciona com
// "npm run dev" rodando.

export interface GfxFileEntry {
  name: string
  mtimeMs: number
}

export async function listGfxFiles(): Promise<GfxFileEntry[]> {
  try {
    const response = await fetch('/api/gfx-list')
    if (!response.ok) return []
    const data = (await response.json()) as { ok: boolean; files?: GfxFileEntry[] }
    return data.files ?? []
  } catch {
    return []
  }
}

async function fetchGfxFile(name: string): Promise<Response> {
  const response = await fetch(`/api/gfx-file?name=${encodeURIComponent(name)}`)
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

export async function readGfxFile(name: string): Promise<ArrayBuffer> {
  return (await fetchGfxFile(name)).arrayBuffer()
}

export async function readGfxFileText(name: string): Promise<string> {
  return (await fetchGfxFile(name)).text()
}

/** Nunca lança — falha vira `false` (apagar é best-effort, um arquivo por vez). */
export async function deleteGfxFile(name: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/gfx-file?name=${encodeURIComponent(name)}`, { method: 'DELETE' })
    return response.ok
  } catch {
    return false
  }
}
