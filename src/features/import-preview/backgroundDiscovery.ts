// Descoberta de Fundos já salvos em assets/backgrounds/ (deste projeto — ver
// vite-background-files-plugin.ts), a partir da própria listagem de arquivos (sem servidor/DOM —
// testável isolado, mesmo espírito de tilesetDiscovery.ts). Um Fundo salvo existe quando há
// `<nome>_fundo.bmp` + `<nome>_fundo.json` juntos — sem os dois não dá pra reconstruir.

export interface GfxFileEntry {
  name: string
  mtimeMs: number
}

export interface BackgroundSummary {
  name: string
  /** mtime mais recente entre os dois arquivos dele — pra ordenar "mais editado primeiro". */
  updatedAt: number
}

/** Arquivos que pertencem ao Fundo salvo `name` — usado pra descobrir e pra excluir. */
export function backgroundFileNames(name: string): string[] {
  return [`${name}_fundo.bmp`, `${name}_fundo.json`]
}

const BACKGROUND_BMP_SUFFIX = /^(.+)_fundo\.bmp$/

export function discoverBackgrounds(files: ReadonlyArray<GfxFileEntry>): BackgroundSummary[] {
  const byName = new Map(files.map((file) => [file.name, file]))
  const backgrounds: BackgroundSummary[] = []

  for (const file of files) {
    const match = BACKGROUND_BMP_SUFFIX.exec(file.name)
    if (!match) continue
    const name = match[1]
    const metaFile = byName.get(`${name}_fundo.json`)
    if (!metaFile) continue // incompleto: sem metadados não dá pra saber a versão

    backgrounds.push({ name, updatedAt: Math.max(file.mtimeMs, metaFile.mtimeMs) })
  }

  backgrounds.sort((a, b) => b.updatedAt - a.updatedAt)
  return backgrounds
}
