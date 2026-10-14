// Descoberta de personagens já exportados em assets/gfx/, a partir da
// própria listagem de arquivos (sem servidor/DOM — testável isolado). Um
// "personagem" existe quando há `<base>_metasprites.h` + `<base>_tiles.bmp`
// juntos; sem os dois não dá pra reconstruir (ver importProject.ts).

export interface GfxFileEntry {
  name: string
  mtimeMs: number
}

export interface CharacterSummary {
  baseName: string
  hasAnim: boolean
  /** mtime mais recente entre os arquivos dele — pra ordenar "mais editado primeiro". */
  updatedAt: number
}

/** Arquivos que pertencem a `<baseName>` — usado pra descobrir e pra excluir. */
export function characterFileNames(baseName: string, hasAnim: boolean): string[] {
  const names = [
    `${baseName}_tiles.bmp`,
    `${baseName}_metasprites.h`,
    `${baseName}_tiles.pic`,
    `${baseName}_tiles.pal`,
    `${baseName}_tiles.inc`,
    `${baseName}_tiles_data.as`,
  ]
  if (hasAnim) names.push(`${baseName}_anim.h`)
  return names
}

const METASPRITES_SUFFIX = /^(.+)_metasprites\.h$/

export function discoverCharacters(files: ReadonlyArray<GfxFileEntry>): CharacterSummary[] {
  const byName = new Map(files.map((file) => [file.name, file]))
  const characters: CharacterSummary[] = []

  for (const file of files) {
    const match = METASPRITES_SUFFIX.exec(file.name)
    if (!match) continue
    const baseName = match[1]
    if (!byName.has(`${baseName}_tiles.bmp`)) continue // incompleto: não dá pra reconstruir

    const hasAnim = byName.has(`${baseName}_anim.h`)
    const updatedAt = characterFileNames(baseName, hasAnim).reduce((latest, name) => {
      const mtime = byName.get(name)?.mtimeMs
      return mtime !== undefined && mtime > latest ? mtime : latest
    }, file.mtimeMs)

    characters.push({ baseName, hasAnim, updatedAt })
  }

  characters.sort((a, b) => b.updatedAt - a.updatedAt)
  return characters
}
