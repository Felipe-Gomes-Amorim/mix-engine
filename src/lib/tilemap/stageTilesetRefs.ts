// Referência de uma fase salva aos tilesets salvos que ela usa, por NOME (docs/PROGRESS.md, "fase
// referencia tileset por nome", 2026-09-23) — arquivo `<base>_tileset_refs.json`, sidecar
// Prometeus-only (a Anubis nunca lê, mesmo espírito de `<nome>_tileset.json` em tilesetAsset.ts).
// Substitui a reconstrução por pixel (`reconstructStage.ts`/`reconstructLayer2`) como caminho
// PRINCIPAL de reabrir uma fase — essa reconstrução continua existindo só como FALLBACK, pra fases
// salvas antes deste arquivo existir (ver loadStage.ts).
//
// Guarda TUDO que a reconstrução por pixel tinha que adivinhar antes: em que ORDEM os tilesets
// foram combinados (define o espaço de índice de hardware — precisa ser a MESMA ordem na hora de
// recombinar ao reabrir), qual VERSÃO de cada um foi usada (pra detectar fase desatualizada, ver
// checkStageStaleness em loadStage.ts) e a própria grade pintada (`grid`/`gridLayer2`) — sem
// nenhuma perda: reabrir com este arquivo NÃO passa mais pelo dedup/reconstrução de tiles únicos,
// é leitura direta.

import type { RgbColor } from '../indexedBmp.ts'
import {
  HARDWARE_TILE_SIZE,
  isValidStageWidthTiles,
  NO_TILE,
  STAGE_DEFAULT_WIDTH_TILES,
  STAGE_HEIGHT_TILES,
  stageGridCols,
  stageGridRows,
  type StageGrid,
} from './types.ts'

export interface StageTilesetRef {
  name: string
  version: number
  /** `'background'` quando `name` referencia um Fundo salvo (`assets/backgrounds/`, ver
   * loadBackground.ts), não um tileset normal (`assets/tilesets/`) — docs/PROGRESS.md, "Fundo como
   * recurso salvo", 2026-09-30. Ausente/`undefined` nos sidecars de sempre = tileset normal (mesmo
   * espírito enxuto de outros campos opcionais deste arquivo: só grava quando não é o padrão). */
  kind?: 'background'
}

export interface StageTilesetRefs {
  /** MESMA ordem usada pra combinar os tilesets (`combineTilesets`) na hora de salvar — precisa
   * ser respeitada ao reabrir, senão os índices de `grid`/`gridLayer2` apontam pro bloco errado. */
  tilesets: StageTilesetRef[]
  /** Largura ESCOLHIDA da fase, em tiles de hardware (docs/PROGRESS.md, "fases largas de
   * verdade", 2026-09-24) — sidecars gravados ANTES desse campo existir não têm essa chave;
   * `parseStageTilesetRefs` assume `STAGE_DEFAULT_WIDTH_TILES` nesse caso (todas as fases salvas
   * até então só podiam ter esse tamanho mesmo). */
  widthTiles: number
  /** Sempre `hardwareCols(widthTiles) * hardwareRows` números (células de hardware da fase) —
   * índice de tile de hardware no tileset combinado a partir de `tilesets`, na mesma ordem. */
  grid: number[]
  /** Idem, mas pra Camada 2 — `NO_TILE` (0xffff) onde nunca foi pintado. TAMANHO PRÓPRIO,
   * independente de `grid`/`widthTiles` (docs/DATA_FORMAT.md § 4, "Camada 2 com parallax",
   * 2026-09-29): a largura dela vem só do PRÓPRIO comprimento deste array
   * (`gridLayer2.length / STAGE_HEIGHT_TILES`), nunca da largura da fase — ver
   * `stageTilesetRefs.test.ts`/`StageSession.tsx`. Sidecars salvos ANTES da Camada 2 ter largura
   * própria têm esse array do tamanho da fase inteira (histórico, continua sendo lido normalmente,
   * só desperdiça espaço). */
  gridLayer2: number[]
  /** Cor de fundo (backdrop) fixa atrás da Camada 2 — docs/PROGRESS.md, "seletor de cor de fundo",
   * 2026-09-30. RGB 0-255 (mesma convenção de `RgbColor`/paleta de tileset) — SÓ a escolha de qual
   * cor; a conversão pro formato que a Anubis vai consumir de verdade (provavelmente 5 bits por
   * canal) ainda não é feita aqui (formato não fechou do lado dela, ver docs/DATA_FORMAT.md § 4).
   * Ausente em sidecars salvos antes desse campo existir — `StageSession.tsx` cai pro padrão
   * (primeira cor da paleta combinada) nesse caso. */
  backdropColor?: RgbColor
}

function hardwareCellCount(widthTiles: number): number {
  return stageGridCols(HARDWARE_TILE_SIZE, widthTiles) * stageGridRows(HARDWARE_TILE_SIZE)
}

export function generateStageTilesetRefs(
  tilesets: readonly StageTilesetRef[],
  widthTiles: number,
  grid: StageGrid,
  gridLayer2: StageGrid,
  backdropColor?: RgbColor,
): string {
  return JSON.stringify(
    { tilesets, widthTiles, grid: Array.from(grid), gridLayer2: Array.from(gridLayer2), backdropColor },
    null,
    2,
  )
}

/** Inverso de `generateStageTilesetRefs`. Lança com mensagem em português se o JSON estiver
 * corrompido/num formato inesperado — quem chama (loadStage.ts) trata isso como "sem referência
 * utilizável" e cai pro fallback de reconstrução por pixel, não precisa travar a tela. */
export function parseStageTilesetRefs(text: string): StageTilesetRefs {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('O arquivo de referência de tilesets da fase não é um JSON válido.')
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('O arquivo de referência de tilesets da fase não tem o formato esperado.')
  }
  const obj = raw as Record<string, unknown>

  if (!Array.isArray(obj.tilesets) || obj.tilesets.length === 0) {
    throw new Error('O arquivo de referência de tilesets da fase não lista nenhum tileset.')
  }
  const tilesets: StageTilesetRef[] = obj.tilesets.map((entry, i) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`Referência de tileset #${i} num formato inesperado.`)
    }
    const { name, version, kind } = entry as Record<string, unknown>
    if (typeof name !== 'string' || !name) {
      throw new Error(`Referência de tileset #${i} sem nome válido.`)
    }
    if (typeof version !== 'number' || !Number.isInteger(version) || version <= 0) {
      throw new Error(`Referência de tileset "${name}" com versão inválida.`)
    }
    return kind === 'background' ? { name, version, kind: 'background' as const } : { name, version }
  })

  const widthTiles = obj.widthTiles === undefined ? STAGE_DEFAULT_WIDTH_TILES : obj.widthTiles
  if (typeof widthTiles !== 'number' || !isValidStageWidthTiles(widthTiles)) {
    throw new Error(`Campo "widthTiles" ausente ou com valor inválido (${String(widthTiles)}).`)
  }
  const cellCount = hardwareCellCount(widthTiles)

  function readGridWithLength(key: 'grid' | 'gridLayer2', expectedLength: number): number[] {
    const value = obj[key]
    if (!Array.isArray(value) || value.length !== expectedLength) {
      throw new Error(`Campo "${key}" ausente ou com tamanho errado (esperado ${expectedLength} células).`)
    }
    return value.map((v) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : NO_TILE))
  }

  const grid = readGridWithLength('grid', cellCount)

  // Camada 2 tem largura PRÓPRIA agora (ver comentário do campo acima) — só valida que o array
  // existe e forma linhas de 32 células completas (`STAGE_HEIGHT_TILES`), não que bate com o
  // tamanho da fase. Qualquer múltiplo de 32 é aceito (32/64 pras fases novas; um valor maior é um
  // sidecar salvo antes dessa mudança, continua lendo normal — StageSession.tsx decide se avisa).
  const rawGridLayer2 = obj.gridLayer2
  if (!Array.isArray(rawGridLayer2) || rawGridLayer2.length === 0 || rawGridLayer2.length % STAGE_HEIGHT_TILES !== 0) {
    throw new Error(
      `Campo "gridLayer2" ausente ou com tamanho inválido (esperado um múltiplo de ${STAGE_HEIGHT_TILES} células).`,
    )
  }
  const gridLayer2 = readGridWithLength('gridLayer2', rawGridLayer2.length)

  const rawBackdrop = obj.backdropColor
  const backdropColor: RgbColor | undefined =
    Array.isArray(rawBackdrop) &&
    rawBackdrop.length === 3 &&
    rawBackdrop.every((v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 255)
      ? (rawBackdrop as RgbColor)
      : undefined

  return { tilesets, widthTiles, grid, gridLayer2, backdropColor }
}
