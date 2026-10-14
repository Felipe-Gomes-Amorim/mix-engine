import { readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { basename, join } from 'node:path'

// Listar/ler/excluir arquivos dentro de assets/gfx/ da engine — usado pela
// galeria de "personagens salvos" (docs/DATA_FORMAT.md seção 3: recarregar
// um personagem a partir dos próprios arquivos exportados, sem formato de
// projeto à parte). Node puro, sem Vite — testável com um diretório
// temporário (mesmo padrão de vite-engine-build.ts).

/** Extensões que a galeria precisa ler ou pode apagar: as que o Editor grava
 * (.bmp/.h) mais as que o gfx4snes deriva delas (.pic/.pal/.inc/_data.as/.map
 * — este último só pra fase, via `gfx4snes -m`, ver stageDiscovery.ts). `.json`
 * é dos metadados de tileset salvo (docs/PROGRESS.md, "tilesets como recurso
 * salvo", 2026-09-23) — pasta própria, nunca lida pela Anubis, mas reaproveita
 * este mesmo módulo (já parametrizado por diretório) em vez de duplicar. `.txt`
 * é o `_tilemap_priority.txt` (docs/DATA_FORMAT.md § 4, "Bit de prioridade por
 * tile da Camada 1", 2026-10-02). */
export const READABLE_FILE_PATTERN = /^[\w.-]+\.(bmp|h|pic|pal|inc|as|map|json|txt)$/i

export interface GfxFileEntry {
  name: string
  mtimeMs: number
}

/** Lista simples (sem filtrar por tipo) — a galeria decide o que é um "personagem" do lado do cliente. */
export function listGfxDir(dir: string): GfxFileEntry[] {
  try {
    return readdirSync(dir)
      .filter((name) => !name.startsWith('.'))
      .map((name) => ({ name, mtimeMs: statSync(join(dir, name)).mtimeMs }))
  } catch {
    return []
  }
}

/** `basename(name) === name` barra `../` e caminho absoluto — nunca sai de `dir`. */
export function isReadableGfxFileName(name: string): boolean {
  return READABLE_FILE_PATTERN.test(name) && basename(name) === name
}

export function readGfxFile(dir: string, name: string): Buffer {
  if (!isReadableGfxFileName(name)) {
    throw new Error(`Nome de arquivo inválido: "${name}".`)
  }
  return readFileSync(join(dir, name))
}

/** `true` se apagou de verdade; `false` se o arquivo já não existia (não é erro). */
export function deleteGfxFile(dir: string, name: string): boolean {
  if (!isReadableGfxFileName(name)) {
    throw new Error(`Nome de arquivo inválido: "${name}".`)
  }
  try {
    unlinkSync(join(dir, name))
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw err
  }
}
