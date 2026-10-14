// Metadados de um FUNDO salvo (docs/PROGRESS.md, "Fundo como recurso salvo", 2026-09-30) — arquivo
// `<nome>_fundo.json`, irmão de `<nome>_fundo.bmp` (a imagem original importada, inteira, sem
// fatiar em blocos — diferente de tileset, aqui não existe "bloco": a imagem toda é carimbada de
// uma vez na Camada 2, ver StageSession.tsx). Mesmo espírito de tilesetAsset.ts: a Anubis NUNCA lê
// esse arquivo (fica em `assets/backgrounds/` deste projeto), então não tem contrato nenhum a
// preservar aqui além de nós mesmos.
//
// Deliberadamente SEM campo de largura/altura: a própria imagem (`<nome>_fundo.bmp`) já guarda as
// dimensões (cabeçalho de BMP) — guardar de novo aqui seria dado duplicado que poderia divergir do
// arquivo de verdade (mesmo raciocínio de não guardar a largura da Camada 2 em `_tileset_refs.json`
// além do próprio comprimento do array, ver stageTilesetRefs.ts).

import { LAYER2_WIDTH_OPTIONS, STAGE_HEIGHT_TILES } from './types.ts'

export interface BackgroundMeta {
  /** Incrementa a cada "Salvar fundo" (1 na criação) — mesmo mecanismo de staleness que tileset já
   * tem (docs/PROGRESS.md, "fase referencia tileset por nome", 2026-09-23): uma fase que carimbou
   * este fundo guarda a versão usada; reabrir avisa se a versão atual do fundo mudou desde então
   * (ver loadStage.ts). */
  version: number
}

export { sanitizeTilesetFileName as sanitizeBackgroundFileName } from './tilesetAsset.ts'

export function generateBackgroundMeta(meta: BackgroundMeta): string {
  return JSON.stringify({ version: meta.version }, null, 2)
}

/** Inverso de `generateBackgroundMeta`. Lança com mensagem em português se o JSON estiver
 * corrompido/num formato inesperado — mesmo padrão de erro de `parseTilesetMeta`. */
export function parseBackgroundMeta(text: string): BackgroundMeta {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('O arquivo de metadados do fundo não é um JSON válido.')
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('O arquivo de metadados do fundo não tem o formato esperado (objeto JSON).')
  }
  const obj = raw as Record<string, unknown>
  const version = typeof obj.version === 'number' && Number.isInteger(obj.version) && obj.version > 0 ? obj.version : 1
  return { version }
}

/**
 * Valida se uma imagem pode virar um Fundo — precisa respeitar o que a Camada 2 aceita hoje
 * (docs/DATA_FORMAT.md § 4, "Camada 2 com parallax"): altura SEMPRE 32 linhas (256px) e largura
 * EXATAMENTE 32 ou 64 colunas (256 ou 512px) — não "qualquer múltiplo de 32 até 64", porque entre
 * 32 e 64 não existe outro múltiplo (são os 2 únicos valores válidos, `LAYER2_WIDTH_OPTIONS`).
 * Validado aqui (na hora de SALVAR o fundo), não só na hora de usar numa fase — pedido explícito:
 * "não só na hora de usar na fase".
 */
export function validateBackgroundDimensions(widthPx: number, heightPx: number): string | null {
  const heightTiles = heightPx / 8
  const widthTiles = widthPx / 8
  if (heightTiles !== STAGE_HEIGHT_TILES) {
    return `Um Fundo precisa ter exatamente ${STAGE_HEIGHT_TILES * 8}px de altura (a Camada 2 sempre tem ${STAGE_HEIGHT_TILES} linhas) — essa imagem tem ${heightPx}px.`
  }
  if (!LAYER2_WIDTH_OPTIONS.includes(widthTiles as (typeof LAYER2_WIDTH_OPTIONS)[number])) {
    return `Um Fundo precisa ter ${LAYER2_WIDTH_OPTIONS.map((w) => w * 8).join('px ou ')}px de largura (${LAYER2_WIDTH_OPTIONS.join(' ou ')} colunas — o que a Camada 2 repete de verdade) — essa imagem tem ${widthPx}px.`
  }
  return null
}
