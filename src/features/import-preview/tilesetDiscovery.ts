// Descoberta de tilesets já salvos em assets/tilesets/ (deste projeto — ver
// vite-tileset-files-plugin.ts), a partir da própria listagem de arquivos (sem servidor/DOM —
// testável isolado, mesmo espírito de characterDiscovery.ts). Um tileset salvo existe quando há
// `<nome>_tileset.bmp` + `<nome>_tileset.json` juntos — sem os dois não dá pra reconstruir (a
// imagem sozinha não diz o tamanho de bloco/colisão/camada; os metadados sozinhos não têm pixel
// nenhum pra desenhar).

export interface GfxFileEntry {
  name: string
  mtimeMs: number
}

export interface TilesetSummary {
  name: string
  /** mtime mais recente entre os dois arquivos dele — pra ordenar "mais editado primeiro". */
  updatedAt: number
}

/** Arquivos que pertencem ao tileset salvo `name` — usado pra descobrir e pra excluir. */
export function tilesetFileNames(name: string): string[] {
  return [`${name}_tileset.bmp`, `${name}_tileset.json`]
}

const TILESET_BMP_SUFFIX = /^(.+)_tileset\.bmp$/

export function discoverTilesets(files: ReadonlyArray<GfxFileEntry>): TilesetSummary[] {
  const byName = new Map(files.map((file) => [file.name, file]))
  const tilesets: TilesetSummary[] = []

  for (const file of files) {
    const match = TILESET_BMP_SUFFIX.exec(file.name)
    if (!match) continue
    const name = match[1]
    const metaFile = byName.get(`${name}_tileset.json`)
    if (!metaFile) continue // incompleto: sem metadados não dá pra saber tamanho de bloco/colisão

    tilesets.push({ name, updatedAt: Math.max(file.mtimeMs, metaFile.mtimeMs) })
  }

  tilesets.sort((a, b) => b.updatedAt - a.updatedAt)
  return tilesets
}
