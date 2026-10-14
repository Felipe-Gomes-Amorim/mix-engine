import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { deleteGfxFile } from '../../lib/gfxFiles'
import { encodeIndexedBmp, type RgbColor } from '../../lib/indexedBmp'
import { saveToEngine, type SaveResult } from '../../lib/saveToEngine'
import { terrainCellsToReevaluate, terrainRoleAt, trimRoleForMapEdges } from '../../lib/tilemap/autotile'
import { backdropColorToSnes5Bit, roundTripBackdropColor, uniqueBackdropColors } from '../../lib/tilemap/backdropColor'
import { bandGlobalTileIndex, blockToHardwareTopLeft, combineTilesets, type StageTilesetInput } from '../../lib/tilemap/combineTilesets'
import { composeLevel } from '../../lib/tilemap/compose'
import {
  DEFAULT_SPECIAL_PROPERTY_ID,
  EMPTY_STAGE_ENTITIES,
  SPECIAL_PROPERTIES,
  type DecorInstance,
  type EnemyInstance,
  type StageEntities,
} from '../../lib/tilemap/entities'
import { generateEntitiesHeader } from '../../lib/tilemap/exportEntities'
import { generateCollisionHeader, generateTilePriorityText, summarizeCollision } from '../../lib/tilemap/exportTilemap'
import { adaptLegacyLayer2Grid, layer2GridHasContentFromColumn, resizeLayer2Grid } from '../../lib/tilemap/layer2Grid'
import { cellsOnLine } from '../../lib/tilemap/lineCells'
import { generateStageTilesetRefs } from '../../lib/tilemap/stageTilesetRefs'
import { buildTileset } from '../../lib/tilemap/tileset'
import {
  HARDWARE_TILE_SIZE,
  LAYER2_DEFAULT_WIDTH_TILES,
  LAYER2_MAX_USEFUL_WIDTH_TILES,
  LAYER2_WIDTH_OPTIONS,
  NO_TILE,
  SNES_VISIBLE_HEIGHT_PIXELS,
  STAGE_BASE_NAME,
  STAGE_BLOCK_SIZES,
  STAGE_HEIGHT_PIXELS,
  STAGE_HEIGHT_TILES,
  stageGridCols,
  stageGridRows,
  stageWidthPixels,
  TERRAIN_ROLES,
  VRAM_LAYER1_MAX_UNIQUE_TILES,
  VRAM_LAYER2_MAX_UNIQUE_TILES,
  type CollisionKind,
  type StageBlockSize,
  type StageGrid,
  type TerrainRole,
  type TileLayer,
  type Tileset,
} from '../../lib/tilemap/types'
import { countUniqueHardwareTiles } from '../../lib/tilemap/vramBudget'
import type { Hitbox } from '../../lib/metasprite/hitbox'
import { composedToRgba } from '../../lib/metasprite/render'
import { BuildStatus } from './BuildStatus'
import { DEFAULT_CHARACTER_SLOT_ID } from './characterSlots'
import { DEFAULT_DECOR_SLOT_ID, DECOR_SLOTS } from './decorSlots'
import { DEFAULT_ENEMY_SLOT_ID, ENEMY_SLOTS } from './enemySlots'
import { EntitySpriteIcon } from './EntitySpriteIcon'
import { useEngineBuild } from './useEngineBuild'
import { loadCharacterFrameCount, loadCharacterHitbox, loadCharacterIdleSprite, type CharacterThumbnail } from './loadCharacter'
import type { StageSeed } from './loadStage'

interface StageSessionProps {
  /** Até MAX_TILESET_BANKS tilesets escolhidos pra esta fase — cada um já pronto (ver comentário
   * de `StageTilesetInput`). */
  tilesets: StageTilesetInput[]
  /** Colisão/camada por bloco, JÁ MESCLADA e indexada por tile de HARDWARE (docs/PROGRESS.md,
   * "tilesets como recurso salvo e reutilizável", 2026-09-23) — vem de `mergeTilesetMetaToHardware`
   * (tilesets escolhidos da galeria) ou direto de `seed.tileCollision`/`seed.tileLayer`
   * (reconstrução por pixel de uma fase já salva, ver loadStage.ts — os dois já usam essa MESMA
   * convenção, sem precisar traduzir nada aqui). Colisão/camada não são mais editáveis aqui: isso
   * é definido uma vez por tileset, na aba "Tilesets".
   */
  tileCollision: ReadonlyMap<number, CollisionKind>
  tileLayer: ReadonlyMap<number, TileLayer>
  /** Hardware index -> `true` quando o bloco desenha NA FRENTE do jogador/inimigo (docs/
   * DATA_FORMAT.md § 4, "Bit de prioridade por tile da Camada 1", 2026-10-02) — mesma convenção de
   * mesclagem hardware-indexada de `tileCollision`/`tileLayer` acima. Vazio no fallback de
   * reconstrução por pixel (ver loadStage.ts). */
  tilePriority: ReadonlyMap<number, boolean>
  /** Largura ESCOLHIDA desta fase, em tiles de hardware (docs/PROGRESS.md, "fases largas de
   * verdade", 2026-09-24) — vinda de StageWorkspace.tsx (nova fase: escolhida na hora; fase
   * reaberta: recuperada de `_tileset_refs.json`/`_collision.h`). Altura continua sempre fixa
   * (STAGE_HEIGHT_TILES), essa é a única dimensão configurável por fase. */
  widthTiles: number
  /** Estado inicial ao reabrir a fase já salva (ver loadStage.ts) — só `grid`/`gridLayer2`/
   * `entities`/`backdropColor` (colisão/camada vêm por `tileCollision`/`tileLayer` acima agora). */
  seed?: Pick<StageSeed, 'grid' | 'gridLayer2' | 'entities' | 'backdropColor'>
  /** Chamado depois de um salvamento bem-sucedido, pra atualizar a seção "Fase salva". */
  onSaved?: () => void
}

type EditMode = 'paint' | 'layer2' | 'entities'
type SelectedEntity = { kind: 'player' } | { kind: 'enemy'; index: number } | { kind: 'decor'; index: number }
type DraggingEntity =
  | { kind: 'player' }
  | { kind: 'enemy'; index: number }
  | { kind: 'patrolMin'; index: number }
  | { kind: 'patrolMax'; index: number }
  | { kind: 'decor'; index: number }

const TILE_THUMB_SIZE = 32
const GRID_DISPLAY_SCALE = 2 // 256px nativo -> 512px na tela

/** % de cima do grid onde começa a faixa invisível no jogo (ver SNES_VISIBLE_HEIGHT_PIXELS) — eixo
 * Y, usa a altura da fase (docs/PROGRESS.md, "preparar o editor pra fases maiores", Fase B). */
const HIDDEN_ROWS_TOP_PERCENT = (SNES_VISIBLE_HEIGHT_PIXELS / STAGE_HEIGHT_PIXELS) * 100

/** Altura máxima (CSS) do viewport rolável de pintura — largura NÃO tem teto próprio (pedido do
 * usuário, 2026-09-24: "coloque o viewport pra cobrir horizontalmente toda a caixa de fases",
 * depois de testar com uma fase maior que a tela — cobre 100% da largura disponível no `.panel`,
 * só a altura fica limitada pra não empurrar o resto da tela pra baixo demais). Hoje a fase inteira
 * (256x256, Fase A ainda não mudou o tamanho real) cabe folgada aqui, sem precisar rolar; quando a
 * fase real crescer (depende do Anubis fechar 🟢 o streaming, `docs/DATA_FORMAT.md` § 4 v3), a
 * rolagem/minimapa entram em ação sozinhos, sem precisar mudar nada aqui. */
const VIEWPORT_MAX_HEIGHT_PX = 512

/** Minimapa (docs/PROGRESS.md, "preparar o editor pra fases maiores", Fase B) — miniatura da fase
 * inteira ao lado da área de pintura, com um retângulo mostrando o que está visível no viewport
 * rolável, estilo Lunar Magic. Largura fixa, altura proporcional ao formato da fase. */
const MINIMAP_WIDTH_PX = 128

/** Largura inicial da coleira quando o usuário MARCA "Limitar a patrulha" pela 1ª vez (só um
 * ponto de partida razoável pro arrasto — não é mais um intervalo pré-ativado, ver
 * EnemyInstance em entities.ts: por padrão a patrulha vem SEM coleira nenhuma). */
const DEFAULT_ENEMY_PATROL_HALF_WIDTH = 40

/** Acima de quantas células com colisão "bandeira" (das 1024 fixas) a exportação avisa antes de
 * salvar (docs/PROGRESS.md, "aviso de proporção alta de bandeira", 2026-09-23) — achado real de um
 * usuário jogando: um bloco marcado como bandeira sem querer (o bloco 0 do 1º tileset, que é o
 * valor implícito de TODA célula nunca pintada da Camada 1 — ela nunca tem "vazio" de verdade)
 * terminou a fase inteira assim que o jogador nascia. Um goalpost de verdade costuma ser uns
 * poucos blocos — 5% (~51 células) já é bem mais que isso, então um valor acima disso é quase
 * sempre sinal de erro de autoria, não uma fase de verdade. */
const GOAL_WARNING_RATIO = 0.05

/** Contorno de um bloco de Camada 2 (decoração) no pincel — cor própria, pra não confundir com o
 * verde/vermelho de colisão que já foi definido na aba "Tilesets" (docs/DATA_FORMAT.md § 4). */
const LAYER2_BORDER_COLOR = '#6b7fd7'

/** Contorno de uma variante de terreno inteligente no pincel (docs/PROGRESS.md, "tilesets
 * inteligentes", 2026-09-23) — cor própria (verde), não confunde com Camada 2 (azul) nem com as
 * cores de colisão usadas só na aba "Tilesets". */
const TERRAIN_BORDER_COLOR = '#3ee08a'

/** Contorno do bloco 0 do 1º tileset da fase — achado real (2026-09-23, ver GOAL_WARNING_RATIO):
 * é o valor implícito de TODA célula da Camada 1 nunca pintada (ela nunca tem "vazio" de verdade),
 * então a colisão marcada nele afeta silenciosamente o mapa inteiro fora do que foi pintado. Cor
 * própria (laranja de aviso), sobrepõe a de Camada 2/terreno se for o mesmo bloco. */
const DEFAULT_FILL_BORDER_COLOR = '#ff9800'

/** Contorno de um bloco "desenha na frente do jogador/inimigo" (docs/DATA_FORMAT.md § 4, "Bit de
 * prioridade por tile da Camada 1", 2026-10-02) — cor própria, pra não confundir com as cores de
 * colisão/Camada 2 já definidas. Só blocos de Camada 1 chegam a ter essa marcação. */
const PRIORITY_BORDER_COLOR = '#e040fb'

// Eixos independentes (docs/PROGRESS.md, "preparar o editor pra fases maiores", Fase B, 2026-09-23,
// e "fases largas de verdade", 2026-09-24) — X depende da largura ESCOLHIDA da fase (`widthTiles`,
// variável por fase agora), Y é sempre STAGE_HEIGHT_PIXELS (altura fixa) — cada um precisa do seu
// próprio limite. Antes disso era uma função só (`clampStagePixel`), assumindo os dois iguais —
// funcionava só porque a fase sempre foi quadrada até então.
function clampStagePixelX(value: number, widthPixels: number): number {
  return Math.min(Math.max(Math.round(value), 0), widthPixels - 1)
}

function clampStagePixelY(value: number): number {
  return Math.min(Math.max(Math.round(value), 0), STAGE_HEIGHT_PIXELS - 1)
}

function TileThumb({
  source,
  tileset,
  tileIndex,
  selected,
  borderColor,
  title,
  onClick,
}: {
  source: HTMLCanvasElement | null
  tileset: Tileset
  tileIndex: number
  selected: boolean
  borderColor?: string
  title: string
  onClick: () => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const col = tileIndex % tileset.cols
  const row = Math.floor(tileIndex / tileset.cols)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !source) return
    canvas.width = TILE_THUMB_SIZE
    canvas.height = TILE_THUMB_SIZE
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, TILE_THUMB_SIZE, TILE_THUMB_SIZE)
    ctx.drawImage(
      source,
      col * tileset.blockSize,
      row * tileset.blockSize,
      tileset.blockSize,
      tileset.blockSize,
      0,
      0,
      TILE_THUMB_SIZE,
      TILE_THUMB_SIZE,
    )
  }, [source, tileset.blockSize, col, row])

  return (
    <button
      type="button"
      className={`tile-thumb${selected ? ' tile-thumb-selected' : ''}`}
      style={borderColor ? { borderColor } : undefined}
      onClick={onClick}
      title={title}
    >
      <canvas ref={ref} />
    </button>
  )
}

/**
 * Ícone de personagem/inimigo no MESMO modelo visual de `TileThumb` (pedido do usuário,
 * 2026-09-24: "ao invés de botões amarelos genéricos, usa o mesmo modelo dos tiles mas com os
 * sprites") — pro pincel de "Personagens" na barra de ferramentas. Sprite "idle" (mesmo quadro que
 * os marcadores já usam no canvas, `EntitySpriteIcon`) ENCAIXADO (contain) dentro de um ícone de
 * `ENTITY_ICON_SIZE` — sprite maior que isso encolhe pra caber inteiro em vez de cortar, menor não
 * estica (mantém pixel-art nítido). Sem `source`/`tileset` porque não vem de um tileset combinado —
 * carrega o sprite do personagem sozinho (mesmo padrão assíncrono de `EntitySpriteIcon`).
 */
const ENTITY_ICON_SIZE = TILE_THUMB_SIZE

function EntityPickerThumb({
  baseName,
  fallbackLabel,
  selected,
  title,
  onClick,
}: {
  baseName: string
  fallbackLabel: string
  selected?: boolean
  title: string
  onClick: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [result, setResult] = useState<
    { baseName: string; status: 'ready'; thumb: CharacterThumbnail } | { baseName: string; status: 'error' } | null
  >(null)
  const isCurrent = result?.baseName === baseName

  useEffect(() => {
    let cancelled = false
    loadCharacterIdleSprite(baseName).then(
      (thumb) => {
        if (!cancelled) setResult({ baseName, status: 'ready', thumb })
      },
      () => {
        if (!cancelled) setResult({ baseName, status: 'error' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [baseName])

  useEffect(() => {
    if (!isCurrent || result?.status !== 'ready') return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const { thumb } = result
    const offscreen = document.createElement('canvas')
    offscreen.width = thumb.width
    offscreen.height = thumb.height
    const offCtx = offscreen.getContext('2d')
    if (!offCtx) return
    offCtx.putImageData(new ImageData(thumb.rgba, thumb.width, thumb.height), 0, 0)

    canvas.width = ENTITY_ICON_SIZE
    canvas.height = ENTITY_ICON_SIZE
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, ENTITY_ICON_SIZE, ENTITY_ICON_SIZE)
    const fitScale = Math.min(ENTITY_ICON_SIZE / thumb.width, ENTITY_ICON_SIZE / thumb.height)
    const drawWidth = thumb.width * fitScale
    const drawHeight = thumb.height * fitScale
    ctx.drawImage(
      offscreen,
      0,
      0,
      thumb.width,
      thumb.height,
      (ENTITY_ICON_SIZE - drawWidth) / 2,
      (ENTITY_ICON_SIZE - drawHeight) / 2,
      drawWidth,
      drawHeight,
    )
  }, [isCurrent, result])

  return (
    <button type="button" className={`tile-thumb${selected ? ' tile-thumb-selected' : ''}`} onClick={onClick} title={title}>
      {isCurrent && result?.status === 'ready' ? (
        <canvas ref={canvasRef} />
      ) : (
        <span className="entity-picker-fallback">{fallbackLabel}</span>
      )}
    </button>
  )
}

/**
 * Campo numérico de offset de patrulha — achado real (2026-09-22): um `<input type="number">`
 * totalmente controlado (`value={estado}`, sem rascunho próprio) não dá pra digitar um número
 * negativo char a char, porque o estado só vira número DEPOIS de `Number(e.target.value)` — e
 * `Number('-')` (só o sinal, sem dígito ainda) é `NaN`. Sem guarda nenhuma, isso ia direto pro
 * `EnemyInstance` e, dali, pro `.h` exportado como o token `NaN` (erro de compilação real na
 * Anubis: "'NaN' undeclared" — aconteceu de verdade com o usuário). Este componente guarda um
 * RASCUNHO de texto próprio (mostra o que foi digitado, incluindo um "-" sozinho no meio do
 * caminho) e só chama `onCommit` quando o texto digitado já é um número válido e completo —
 * nunca deixa `NaN`/vazio virar estado de verdade. Resincroniza o rascunho com `value` quando ele
 * muda por fora (arrastar o manípulo, ou o outro campo travando a ordem min≤max).
 */
function PatrolOffsetInput({
  value,
  widthPixels,
  onCommit,
}: {
  value: number
  widthPixels: number
  onCommit: (next: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(String(value))
  }

  return (
    <input
      type="number"
      min={-(widthPixels - 1)}
      max={widthPixels - 1}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value)
        const parsed = Number(e.target.value)
        if (e.target.value.trim() !== '' && Number.isFinite(parsed)) onCommit(parsed)
      }}
    />
  )
}

/**
 * Campo numérico do quadro de uma decoração — mesmo achado/padrão de `PatrolOffsetInput` (rascunho
 * de texto próprio, só confirma no estado quando o texto já é um número válido e completo) pra
 * nunca deixar `NaN` virar o token exportado em `stage1_decor_frame`. `maxFrame` (quadros da folha
 * - 1) vem de `decorFrameCountBySlotId` — `undefined` enquanto não carregou ainda, sem limite
 * superior até lá (não trava o campo por causa disso).
 */
function FrameIndexInput({
  value,
  maxFrame,
  onCommit,
}: {
  value: number
  maxFrame: number | undefined
  onCommit: (next: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(String(value))
  }

  return (
    <input
      type="number"
      min={0}
      max={maxFrame}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value)
        const parsed = Number(e.target.value)
        if (e.target.value.trim() !== '' && Number.isInteger(parsed) && parsed >= 0) onCommit(parsed)
      }}
    />
  )
}

/**
 * Modal de escolha de bloco (pedido do usuário, 2026-09-24) — abre por cima de tudo (React portal
 * pro `document.body`, escapa do `overflow-y: auto` da `.stage-toolbar`) em vez de expandir inline
 * na barra de ferramentas, que ficava com layout quebrado quando o tileset tinha muitos blocos (ex.
 * um "grama" com 13 variantes de terreno). Fecha clicando fora, no "×", ou escolhendo um bloco.
 */
function TilePickerModal({
  tileset,
  source,
  selectedBlockIndex,
  borderColorFor,
  titleFor,
  visibleIf,
  onSelect,
  onClose,
}: {
  tileset: Tileset
  source: HTMLCanvasElement | null
  selectedBlockIndex: number | null
  borderColorFor: (blockIndex: number) => string | undefined
  titleFor: (blockIndex: number) => string
  /** Ausente = mostra todos. Usado por StageSession.tsx pra esconder blocos da CAMADA errada pro
   * modo atual (docs/PROGRESS.md, "camada errada ao pintar", 2026-10-01) — sem isso, dava pra
   * escolher um bloco de Camada 2 estando no modo "Pintar blocos" (ou vice-versa) e pintar com ele
   * de qualquer jeito, corrompendo a grade (a largura usada pra escrever é a do canvas ATIVO, não a
   * da camada do bloco). */
  visibleIf?: (blockIndex: number) => boolean
  onSelect: (blockIndex: number) => void
  onClose: () => void
}) {
  return createPortal(
    <div className="tile-picker-backdrop" onClick={onClose}>
      <div className="tile-picker-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="tile-picker-modal-close" onClick={onClose} title="Fechar">
          ×
        </button>
        <div className="tile-grid">
          {Array.from({ length: tileset.tileCount }, (_, blockIndex) => blockIndex)
            .filter((blockIndex) => !visibleIf || visibleIf(blockIndex))
            .map((blockIndex) => (
              <TileThumb
                key={blockIndex}
                source={source}
                tileset={tileset}
                tileIndex={blockIndex}
                selected={selectedBlockIndex === blockIndex}
                borderColor={borderColorFor(blockIndex)}
                title={titleFor(blockIndex)}
                onClick={() => onSelect(blockIndex)}
              />
            ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Sessão de pintura de uma fase (docs/DATA_FORMAT.md seção 4) — reorganização de UI (2026-09-23,
 * "tilesets como recurso salvo e reutilizável"): só cobre a aba "Fases" agora. Tileset (imagem,
 * tamanho de bloco, colisão, camada por bloco) já vem PRONTO — escolhido da galeria salva ou
 * reconstruído de uma fase já existente (StageWorkspace.tsx decide qual dos dois e monta
 * `tilesets`/`tileCollision`/`tileLayer`). Aqui só resta: escolher um bloco e pintar, posicionar o
 * jogador e os inimigos, salvar. Salva `<base>_tilemap.bmp` + `<base>_collision.h` +
 * `<base>_entities.h` (+ `_tilemap_layer2.bmp` opcional).
 */
export function StageSession({ tilesets, tileCollision, tileLayer, tilePriority, widthTiles, seed, onSaved }: StageSessionProps) {
  const stageWidthPx = stageWidthPixels(widthTiles)
  // Tileset combinado a 8px — SEMPRE hardware, independente do blockSize de cada tileset de
  // origem (docs/DATA_FORMAT.md § 4, "cursor de posicionamento sempre em 8px"). É nele que
  // `grid`/`gridLayer2` guardam índice — a única representação sem ambiguidade quando os tilesets
  // combinados têm blockSize DIFERENTE entre si (ver mergeTilesetMeta.ts).
  const hardwareCombined = useMemo(() => {
    try {
      return { ok: true as const, ...combineTilesets(tilesets.map((t) => t.upload), HARDWARE_TILE_SIZE) }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  }, [tilesets])
  const hardwareTileset = hardwareCombined.ok ? hardwareCombined.tileset : null

  // Fundo escolhido pra esta sessão (docs/PROGRESS.md, "Fundo como recurso salvo", 2026-09-30) —
  // no máximo 1 (StageWorkspace.tsx só deixa escolher 1), ausente/-1 quando nenhum foi selecionado
  // ao "Começar a pintar"/"Editar". Usado só pelo botão "Carimbar" do painel da Camada 2.
  const backgroundTilesetIndex = tilesets.findIndex((t) => t.kind === 'background')
  const backgroundTileset = backgroundTilesetIndex >= 0 ? tilesets[backgroundTilesetIndex] : null

  // Cor de fundo (backdrop) fixa atrás da Camada 2 — docs/PROGRESS.md, "seletor de cor de fundo",
  // 2026-09-30. NÃO é um color picker livre (pedido explícito do usuário): só deixa escolher entre
  // as cores que já existem na paleta dos tilesets desta fase (Camada 1 + Camada 2 combinadas,
  // deduplicadas — `uniqueBackdropColors`), pra garantir consistência visual.
  const backdropPaletteOptions = useMemo(() => uniqueBackdropColors(tilesets), [tilesets])
  // `null` = "usuário não clicou em nenhuma amostra ainda" — padrão sensato (não bloqueia salvar):
  // a PRIMEIRA cor da paleta combinada (ordem de `uniqueBackdropColors`, ligada ao conteúdo real da
  // fase), caindo pra preto só se a fase não tiver tileset nenhum ainda (não deveria acontecer na
  // prática, mas evita `undefined` chegando no canvas/export).
  const [backdropColor, setBackdropColor] = useState<RgbColor | null>(() => seed?.backdropColor ?? null)
  const effectiveBackdropColor = useMemo<RgbColor>(
    () => backdropColor ?? backdropPaletteOptions[0] ?? [0, 0, 0],
    [backdropColor, backdropPaletteOptions],
  )

  // Um `Tileset` (buildTileset) e uma prévia renderizada por tileset de ORIGEM (não combinados —
  // cada um mantém seu próprio blockSize pra agrupar os thumbnails do pincel de um jeito sensato,
  // ver seção "Escolha um bloco e pinte o mapa" abaixo).
  const ownTilesets = useMemo(
    () =>
      tilesets.map((t) => {
        try {
          return { ok: true as const, tileset: buildTileset(t.upload.width, t.upload.height, t.upload.indices, t.blockSize) }
        } catch (err) {
          return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
        }
      }),
    [tilesets],
  )
  const ownTilesetPreviews = useMemo(
    () =>
      ownTilesets.map((entry, i) => {
        if (!entry.ok) return null
        const { tileset } = entry
        const canvas = document.createElement('canvas')
        canvas.width = tileset.sourceWidth
        canvas.height = tileset.sourceHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) return null
        const rgba = composedToRgba(
          { width: tileset.sourceWidth, height: tileset.sourceHeight, originX: 0, originY: 0, pixels: tileset.sourceIndices },
          tilesets[i].upload.palette,
        )
        ctx.putImageData(new ImageData(rgba, tileset.sourceWidth, tileset.sourceHeight), 0, 0)
        return canvas
      }),
    [ownTilesets, tilesets],
  )

  // Grade de células de 8px — largura ESCOLHIDA por fase (`widthTiles`, prop), altura sempre fixa
  // (docs/PROGRESS.md, "fases largas de verdade", 2026-09-24 — streaming da Anubis só funciona no
  // eixo horizontal, ver docs/DATA_FORMAT.md § 4 v3).
  const HARDWARE_COLS = stageGridCols(HARDWARE_TILE_SIZE, widthTiles)
  const HARDWARE_ROWS = stageGridRows(HARDWARE_TILE_SIZE)

  const [mode, setMode] = useState<EditMode>('paint')
  const [grid, setGrid] = useState<StageGrid>(() => seed?.grid ?? new Uint16Array(HARDWARE_COLS * HARDWARE_ROWS))

  // Camada 2 (docs/DATA_FORMAT.md § 4, "2ª camada de tileset") — grid PRÓPRIO, com largura
  // INDEPENDENTE da fase agora (docs/PROGRESS.md, "Camada 2 como padrão repetível", 2026-09-29:
  // ela virou um padrão que REPETE sozinho — parallax residente na VRAM, não acompanha mais o
  // comprimento da fase). Altura continua sempre `STAGE_HEIGHT_TILES`, igual à Camada 1. Nasce todo
  // `NO_TILE` (nada pintado ainda) — só vira bloco de verdade onde o usuário realmente escolher um
  // bloco marcado como Camada 2 e pintar ali (ver paintCell). `adaptLegacyLayer2Grid` cuida de fase
  // salva ANTES dessa mudança (Camada 2 do tamanho da fase inteira) — corta pras 64 primeiras
  // colunas sem perguntar, porque só essas já apareciam no jogo mesmo (ver layer2Grid.ts); calculada
  // uma vez só, fora dos dois `useState` abaixo, pra alimentar os dois com o MESMO resultado.
  const adaptedSeedLayer2 = seed?.gridLayer2 ? adaptLegacyLayer2Grid(seed.gridLayer2) : null
  const [layer2WidthTiles, setLayer2WidthTiles] = useState<number>(
    () => adaptedSeedLayer2?.widthTiles ?? LAYER2_DEFAULT_WIDTH_TILES,
  )
  const [gridLayer2, setGridLayer2] = useState<StageGrid>(
    () => adaptedSeedLayer2?.grid ?? new Uint16Array(LAYER2_DEFAULT_WIDTH_TILES * STAGE_HEIGHT_TILES).fill(NO_TILE),
  )
  // Pincel: QUAL tileset (posição em `tilesets`) + QUAL bloco DELE (índice local, na granularidade
  // própria daquele tileset) — não mais um índice "global" numa combinação a um blockSize só (ver
  // comentário de `hardwareCombined` acima).
  const [brush, setBrush] = useState({ tilesetIndex: 0, blockIndex: 0 })
  // Ferramenta de borracha (pedido do usuário, 2026-09-22): só afeta a Camada 2, de propósito —
  // ela é esparsa por natureza (`NO_TILE`), sem essa ferramenta só dava pra "limpar" uma célula
  // dela se o tileset tivesse um bloco totalmente vazio pra pintar por cima (nem sempre existe).
  // A Camada 1 NÃO tem um "vazio" de verdade (o hardware sempre desenha ALGUM bloco em toda
  // célula do BG1) — tentamos fazer a borracha resetar ela pro bloco 0 também, mas isso confundiu
  // mais do que ajudou na prática (bloco 0 não é necessariamente "em branco", virava uma troca de
  // bloco inesperada) — decisão do usuário: deixar a Camada 1 fora da borracha, trocar o bloco
  // dela é só escolher outro normalmente. Ativa junto do modo pintura; escolher um bloco desativa
  // ela de novo (ver onClick dos thumbnails).
  const [eraser, setEraser] = useState(false)
  // Lata de tinta (pedido do usuário, 2026-09-24) — pinta com o `brush` atual (bloco avulso, NÃO
  // terreno inteligente nem borracha) em todos os blocos ADJACENTES iguais ao clicado, tipo balde
  // de tinta de editor de imagem. Mutuamente exclusivo com `eraser`/`terrainBrush`, mesmo espírito
  // dos outros — escolher um bloco novo desativa (ver onClick dos thumbnails).
  const [bucketFill, setBucketFill] = useState(false)
  // Pincel de terreno inteligente (autotile, docs/PROGRESS.md "tilesets inteligentes", 2026-09-23)
  // — QUAL tileset + QUAL grupo dele. Mutuamente exclusivo com `brush` (escolher um bloco avulso
  // ou este pincel desativa o outro, ver onClick dos thumbnails). Combina com `eraser`: apagar com
  // este pincel ativo também reavalia os vizinhos do grupo (só faz sentido pra grupo de Camada 2 —
  // Camada 1 nunca tem "vazio", mesma regra do pincel avulso).
  const [terrainBrush, setTerrainBrush] = useState<{ tilesetIndex: number; groupIndex: number } | null>(null)
  // Paleta de bloco avulso recolhida por padrão (pedido do usuário, 2026-09-24, depois de testar
  // com uma fase maior: com muitos blocos por tileset — ex. um "grama" de 13 variantes de terreno —
  // mostrar todos de uma vez na barra de ferramentas horizontal ficava poluído/quebrado
  // visualmente). Só o bloco ATUALMENTE selecionado daquele tileset aparece (1 ícone); clicar nele
  // expande a grade inteira pra escolher outro, e escolher um já recolhe de novo. `null` = nenhum
  // tileset expandido agora. Terrenos NÃO usam isso — continuam sempre mostrando todos os grupos
  // (são poucos, não têm o mesmo problema de volume).
  const [openTilesetPicker, setOpenTilesetPicker] = useState<number | null>(null)
  // Passo do cursor — pedido do usuário (2026-09-23): onde o clique PODE cair no mapa, em
  // múltiplos de 8/16/32px, independente do tamanho de cada bloco. Os dois são ortogonais: dá pra
  // carimbar um bloco de 32px com o cursor travado em passos de 8px (encaixe fino, ex.: emendar um
  // elemento fino entre dois blocos maiores) OU pintar com um bloco de 8px mas o cursor só andando
  // de 16 em 16px (pintura rápida de área grande, sem risco de clicar torto). A grade desenhada no
  // canvas segue o mesmo valor — mostra exatamente onde o clique vai cair, não é só estética.
  // Também usado pra encaixar a posição de jogador/inimigo na mesma grade (ver snapGridCenter).
  const [cursorStep, setCursorStep] = useState<StageBlockSize>(16)
  // Viewport rolável + minimapa (docs/PROGRESS.md, "preparar o editor pra fases maiores", Fase B,
  // 2026-09-23) — `viewportRect` guarda o que está visível AGORA dentro do canvas cheio, em FRAÇÃO
  // (0..1) de `canvas.width`/`canvas.height` (não em pixel do minimapa nem da fase) — conversão pra
  // % de cada um fica só na hora de desenhar (ver JSX). Começa em "tudo visível" (1,1) — estado
  // transitório correto até o 1º efeito de desenho medir o viewport de verdade.
  const [viewportRect, setViewportRect] = useState({ left: 0, top: 0, width: 1, height: 1 })
  const viewportRef = useRef<HTMLDivElement>(null)
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null)
  const [entities, setEntities] = useState<StageEntities>(() => seed?.entities ?? EMPTY_STAGE_ENTITIES)
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null)
  const [armPlacePlayer, setArmPlacePlayer] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveResults, setSaveResults] = useState<Array<{ name: string; result: SaveResult }>>([])
  const build = useEngineBuild()
  const paintingRef = useRef(false)
  // Última célula pintada durante o arrasto atual — usada só pra interpolar a linha entre ela e a
  // célula nova (ver cellsOnLine), porque o `mousemove` do navegador não garante um evento por
  // célula percorrida (mouse rápido pula direto, deixando buraco na pintura sem isso).
  const lastPaintedCellRef = useRef<{ col: number; row: number } | null>(null)
  const draggingEntityRef = useRef<DraggingEntity | null>(null)

  const gridCanvasRef = useRef<HTMLCanvasElement>(null)
  const layer2CanvasRef = useRef<HTMLCanvasElement>(null)
  const layer2PreviewCanvasRef = useRef<HTMLCanvasElement>(null)
  // Em qual grid/largura a pintura ATUAL mira — a Camada 1 usa a largura da FASE
  // (`HARDWARE_COLS`), a Camada 2 usa a largura PRÓPRIA dela (`layer2WidthTiles`, docs/PROGRESS.md,
  // "Camada 2 como padrão repetível", 2026-09-29). Só a largura muda entre as duas — a altura
  // (`HARDWARE_ROWS`) é sempre `STAGE_HEIGHT_TILES` nos dois casos, não precisa de uma 2ª variável.
  const activeCols = mode === 'layer2' ? layer2WidthTiles : HARDWARE_COLS
  const activeCanvasRef = mode === 'layer2' ? layer2CanvasRef : gridCanvasRef

  // Composição usa SEMPRE o tileset combinado a 8px — `grid`/`gridLayer2` guardam índice de tile
  // de HARDWARE. `composeLevel` já é genérico o bastante (funciona pra qualquer `tileset.blockSize`,
  // incluindo 8) — não precisou mudar, só o que passamos pra ele.
  const composed = useMemo(
    () => (hardwareTileset ? composeLevel(hardwareTileset, grid, widthTiles) : null),
    [hardwareTileset, grid, widthTiles],
  )
  // `skipValue: NO_TILE` deixa célula nunca pintada transparente (índice de cor 0) em vez de
  // mostrar o bloco 0 cobrindo a tela toda — só a Camada 2 usa isso (ver compose.ts). Composta na
  // largura PRÓPRIA da Camada 2 (`layer2WidthTiles`), NUNCA na largura da fase (`widthTiles`) —
  // esse é o "1 padrão" que se repete sozinho no jogo (ver comentário de `gridLayer2` acima); quem
  // precisa dele "esticado" pela fase inteira (só pra pré-visualizar o repeat no canvas principal)
  // monta isso à parte, com `ctx.createPattern` (ver useEffect de desenho abaixo).
  const composedLayer2Pattern = useMemo(
    () => (hardwareTileset ? composeLevel(hardwareTileset, gridLayer2, layer2WidthTiles, NO_TILE) : null),
    [hardwareTileset, gridLayer2, layer2WidthTiles],
  )
  // Aviso de proporção alta de "bandeira" (docs/PROGRESS.md, 2026-09-23) — ver GOAL_WARNING_RATIO.
  const collisionSummary = useMemo(() => summarizeCollision(grid, tileCollision), [grid, tileCollision])
  const goalWarning = collisionSummary.goal / (HARDWARE_COLS * HARDWARE_ROWS) > GOAL_WARNING_RATIO
  const [confirmGoalWarning, setConfirmGoalWarning] = useState(false)

  // Orçamento de VRAM por camada (docs/PROGRESS.md, "fases largas de verdade", 2026-09-24) — a
  // Anubis não detecta sozinha se uma fase larga/variada estourou o espaço fixo reservado pro
  // tileset de cada camada na VRAM (ver VRAM_LAYER1_MAX_UNIQUE_TILES/VRAM_LAYER2_MAX_UNIQUE_TILES,
  // types.ts) — só sobrescreve dado adjacente em silêncio. Conta os tiles de hardware ÚNICOS que a
  // imagem já composta teria depois do dedup do gfx4snes (mesmo algoritmo, ver vramBudget.ts) pra
  // avisar ANTES de exportar.
  const layer1UniqueTiles = useMemo(() => (composed ? countUniqueHardwareTiles(composed) : 0), [composed])
  const layer2UniqueTiles = useMemo(
    () => (composedLayer2Pattern ? countUniqueHardwareTiles(composedLayer2Pattern) : 0),
    [composedLayer2Pattern],
  )
  const layer1VramWarning = layer1UniqueTiles > VRAM_LAYER1_MAX_UNIQUE_TILES
  const layer2VramWarning = layer2UniqueTiles > VRAM_LAYER2_MAX_UNIQUE_TILES
  const [confirmVramWarning, setConfirmVramWarning] = useState(false)

  // Aviso de Camada 2 passando do que a Anubis realmente lê (docs/PROGRESS.md, "Camada 2 como
  // padrão repetível", 2026-09-29) — o seletor da UI só oferece 32/64 (nunca produz isso sozinho),
  // mas uma fase salva ANTES dessa mudança pode chegar aqui maior (ver `adaptLegacyLayer2Grid` —
  // hoje ela já corta pra 64 ao carregar, então isso é um cinto-de-segurança, não o caminho comum).
  const layer2WidthWarning = layer2WidthTiles > LAYER2_MAX_USEFUL_WIDTH_TILES
  const [confirmLayer2WidthWarning, setConfirmLayer2WidthWarning] = useState(false)

  // Passo efetivo do cursor: o pincel de terreno inteligente IGNORA o "Passo do cursor" escolhido
  // pelo usuário e trava sempre no blockSize do PRÓPRIO tileset do grupo — teria que estar sempre
  // alinhado ao grid de blocos daquele tileset pra a checagem de vizinhança fazer sentido (um
  // carimbo desalinhado quebraria a lógica de "vizinho pertence ao mesmo grupo", ver autotile.ts).
  const activeStep: StageBlockSize = terrainBrush ? tilesets[terrainBrush.tilesetIndex].blockSize : cursorStep

  // Hitbox de cada personagem (hero + cada slot de inimigo) — achado real do usuário: o marcador
  // desenhava centrado no ponto salvo (x,y), mas a engine trata esse ponto como o canto superior
  // esquerdo da HITBOX, não o pivô/pé do sprite (ver pivotToSpawn/spawnToPivot abaixo) — o inimigo
  // sempre aparecia mais embaixo no jogo do que o marcador mostrava no editor. Lista pequena e fixa
  // (hoje só hero + enemy1), busca tudo uma vez só ao montar.
  const [hitboxByBaseName, setHitboxByBaseName] = useState<Record<string, Hitbox | null>>({})
  useEffect(() => {
    let cancelled = false
    const baseNames = [DEFAULT_CHARACTER_SLOT_ID, ...ENEMY_SLOTS.map((s) => s.id)]
    Promise.all(
      baseNames.map((baseName) =>
        loadCharacterHitbox(baseName)
          .then((hitbox) => [baseName, hitbox] as const)
          .catch(() => [baseName, null] as const),
      ),
    ).then((pairs) => {
      if (!cancelled) setHitboxByBaseName(Object.fromEntries(pairs))
    })
    return () => {
      cancelled = true
    }
  }, [])
  // Mesmo padrão de ref "sempre atualizada" de cima — quem arrasta um marcador roda dentro do
  // efeito de mouse a nível de window, montado uma vez só, então precisa da versão mais recente
  // do cache sem que isso o obrigue a reanexar os listeners a cada fetch resolvido.
  const hitboxByBaseNameRef = useRef(hitboxByBaseName)
  useEffect(() => {
    hitboxByBaseNameRef.current = hitboxByBaseName
  })

  // Quantos quadros cada slot de decoração tem (docs/DATA_FORMAT.md § 3: "cada quadro da folha é
  // uma peça de decoração diferente") — pro seletor de quadro no painel lateral saber até onde o
  // usuário pode escolher. Mesmo padrão de busca única de `hitboxByBaseName` acima (lista pequena
  // e fixa, hoje só `decor1`). `0` = ainda não carregou/arquivo ausente — painel trata como "sem
  // limite conhecido ainda" (não trava o campo, só não mostra a dica "de N").
  const [decorFrameCountBySlotId, setDecorFrameCountBySlotId] = useState<Record<string, number>>({})
  useEffect(() => {
    let cancelled = false
    Promise.all(
      DECOR_SLOTS.map((slot) =>
        loadCharacterFrameCount(slot.id)
          .then((count) => [slot.id, count] as const)
          .catch(() => [slot.id, 0] as const),
      ),
    ).then((pairs) => {
      if (!cancelled) setDecorFrameCountBySlotId(Object.fromEntries(pairs))
    })
    return () => {
      cancelled = true
    }
  }, [])

  function enemyBaseName(enemy: EnemyInstance): string {
    return ENEMY_SLOTS.find((s) => s.typeIndex === enemy.typeIndex)?.id ?? DEFAULT_ENEMY_SLOT_ID
  }

  function decorBaseName(decor: DecorInstance): string {
    return DECOR_SLOTS.find((s) => s.typeIndex === decor.typeIndex)?.id ?? DEFAULT_DECOR_SLOT_ID
  }

  /** Converte onde o usuário aponta na tela (o pivô/pé do sprite, que é o que faz sentido pra
   * encaixar na grade — ver snapGridCenter/snapGridBottomEdge) pro valor que precisa ser SALVO
   * (`x`,`y` = canto superior esquerdo da hitbox, convenção da engine). Sem hitbox conhecida ainda
   * (cache não carregou), devolve o próprio ponto sem deslocar — comportamento antigo, não trava. */
  function pivotToSpawn(pivot: { x: number; y: number }, hitbox: Hitbox | null | undefined): { x: number; y: number } {
    if (!hitbox) return pivot
    return { x: clampStagePixelX(pivot.x - hitbox.width / 2, stageWidthPx), y: clampStagePixelY(pivot.y - hitbox.height) }
  }

  /** Inverso de `pivotToSpawn` — de onde foi SALVO pra onde o sprite REALMENTE aparece (usado só
   * pra desenhar o marcador no lugar certo). */
  function spawnToPivot(spawn: { x: number; y: number }, hitbox: Hitbox | null | undefined): { x: number; y: number } {
    if (!hitbox) return spawn
    return { x: spawn.x + hitbox.width / 2, y: spawn.y + hitbox.height }
  }

  function clearResults() {
    setSaveResults([])
    build.reset()
  }
  const clearResultsRef = useRef(clearResults)
  useEffect(() => {
    clearResultsRef.current = clearResults
  })
  const paintAtRef = useRef<(clientX: number, clientY: number) => void>(() => {})
  useEffect(() => {
    paintAtRef.current = paintAt
  })
  const stagePixelFromClientRef = useRef<(clientX: number, clientY: number) => { x: number; y: number } | null>(
    () => null,
  )
  useEffect(() => {
    stagePixelFromClientRef.current = stagePixelFromClient
  })
  const stagePixelFromClientTopLeftRef = useRef<(clientX: number, clientY: number) => { x: number; y: number } | null>(
    () => null,
  )
  useEffect(() => {
    stagePixelFromClientTopLeftRef.current = stagePixelFromClientTopLeft
  })

  useEffect(() => {
    // Só roda com o canvas principal de fato MONTADO (docs/PROGRESS.md, "Camada 2 como padrão
    // repetível", 2026-09-29: o painel de Camada 2 ocupa o lugar dele, então `.stage-viewport-area`
    // fica fora do DOM enquanto `mode === 'layer2'` — desmonta e REMONTA um canvas novo, em branco,
    // ao voltar. Sem `mode` nas dependências, esse efeito não tinha motivo pra rodar de novo nesse
    // retorno — a fase sumia até qualquer OUTRA dependência mudar de valor, achado real reportado
    // pelo usuário com print).
    if (mode === 'layer2') return
    const canvas = gridCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !composed || !hardwareCombined.ok) return
    const offscreen = document.createElement('canvas')
    offscreen.width = composed.width
    offscreen.height = composed.height
    const offCtx = offscreen.getContext('2d')
    if (!offCtx) return

    // Cor de fundo (backdrop) por baixo de tudo — docs/PROGRESS.md, "seletor de cor de fundo",
    // 2026-09-30/2026-10-01. Prévia simplificada: preenche o canvas inteiro antes de desenhar as
    // camadas por cima (que respeitam alpha, ver comentário logo abaixo) — mostra onde nem Camada 1
    // nem Camada 2 cobrem (célula nunca pintada). Usa a cor JÁ ARREDONDADA pelo corte de 5 bits do
    // SNES (`roundTripBackdropColor`, docs/DATA_FORMAT.md § 4: "evita surpresa") — o que aparece
    // aqui é o que vai aparecer de verdade no jogo, não a cor exata 0-255 escolhida na paleta.
    const previewBackdropColor = roundTripBackdropColor(effectiveBackdropColor)
    offCtx.fillStyle = `rgb(${previewBackdropColor[0]}, ${previewBackdropColor[1]}, ${previewBackdropColor[2]})`
    offCtx.fillRect(0, 0, composed.width, composed.height)

    // Camada 2 primeiro (fundo) — REPETIDA (`createPattern`, "repeat-x") ao longo da largura
    // INTEIRA da fase, nunca esticada/cortada pra caber (docs/PROGRESS.md, "Camada 2 como padrão
    // repetível", 2026-09-29: ela agora é um padrão de largura PRÓPRIA — `composedLayer2Pattern`,
    // `layer2WidthTiles` — que o hardware repete sozinho, não um mapa do comprimento da fase). Isso
    // já é a pré-visualização ao vivo do repeat na tela principal, sem precisar de nada especial.
    if (composedLayer2Pattern) {
      const patternCanvas = document.createElement('canvas')
      patternCanvas.width = composedLayer2Pattern.width
      patternCanvas.height = composedLayer2Pattern.height
      const patternCtx = patternCanvas.getContext('2d')
      if (patternCtx) {
        const rgba2 = composedToRgba(
          {
            width: composedLayer2Pattern.width,
            height: composedLayer2Pattern.height,
            originX: 0,
            originY: 0,
            pixels: composedLayer2Pattern.indices,
          },
          hardwareCombined.palette,
        )
        patternCtx.putImageData(new ImageData(rgba2, composedLayer2Pattern.width, composedLayer2Pattern.height), 0, 0)
        const pattern = offCtx.createPattern(patternCanvas, 'repeat-x')
        if (pattern) {
          offCtx.fillStyle = pattern
          offCtx.fillRect(0, 0, composed.width, composed.height)
        }
      }
    }

    // Camada 1 por cima, via `drawImage` (não `putImageData`) — só `drawImage` respeita alpha/
    // mistura, deixando os pixels transparentes da Camada 1 (índice de cor 0, mesma convenção de
    // `composedToRgba`) mostrarem a Camada 2 por baixo em vez de apagá-la.
    const layer1Canvas = document.createElement('canvas')
    layer1Canvas.width = composed.width
    layer1Canvas.height = composed.height
    const layer1Ctx = layer1Canvas.getContext('2d')
    if (!layer1Ctx) return
    const rgba = composedToRgba(
      { width: composed.width, height: composed.height, originX: 0, originY: 0, pixels: composed.indices },
      hardwareCombined.palette,
    )
    layer1Ctx.putImageData(new ImageData(rgba, composed.width, composed.height), 0, 0)
    offCtx.drawImage(layer1Canvas, 0, 0)

    canvas.width = composed.width * GRID_DISPLAY_SCALE
    canvas.height = composed.height * GRID_DISPLAY_SCALE
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(offscreen, 0, 0, composed.width, composed.height, 0, 0, canvas.width, canvas.height)

    // Grade visível acompanha o `cursorStep` de verdade (não é só estética — mostra exatamente
    // onde o clique vai cair). Recebe `context`/`canvasEl` por parâmetro (em vez de fechar sobre
    // `ctx`/`canvas` do escopo de fora) só pra o TypeScript não perder a checagem de nulo deles
    // dentro de uma função aninhada.
    function drawGridLines(context: CanvasRenderingContext2D, canvasEl: HTMLCanvasElement, stepPx: number, color: string) {
      context.strokeStyle = color
      context.lineWidth = 1
      for (let x = stepPx; x < canvasEl.width; x += stepPx) {
        context.beginPath()
        context.moveTo(x + 0.5, 0)
        context.lineTo(x + 0.5, canvasEl.height)
        context.stroke()
      }
      for (let y = stepPx; y < canvasEl.height; y += stepPx) {
        context.beginPath()
        context.moveTo(0, y + 0.5)
        context.lineTo(canvasEl.width, y + 0.5)
        context.stroke()
      }
    }
    drawGridLines(ctx, canvas, activeStep * GRID_DISPLAY_SCALE, 'rgba(255, 255, 255, 0.25)')

    // Indicador visual dos blocos "na frente do jogador" (docs/DATA_FORMAT.md § 4, "Bit de
    // prioridade por tile da Camada 1", 2026-10-02) — sem isso, a marcação fica invisível na hora
    // de montar a composição (pedido explícito do usuário), já que ela não muda nenhum pixel
    // desenhado. Contorno na MESMA cor do pincel (`PRIORITY_BORDER_COLOR`), desenhado DEPOIS do
    // upscale pra ficar nítido (um stroke na resolução nativa de 8px ficaria borrado/sumindo).
    ctx.strokeStyle = PRIORITY_BORDER_COLOR
    ctx.lineWidth = 2
    const cellPx = HARDWARE_TILE_SIZE * GRID_DISPLAY_SCALE
    for (let row = 0; row < HARDWARE_ROWS; row++) {
      for (let col = 0; col < HARDWARE_COLS; col++) {
        if (!tilePriority.get(grid[row * HARDWARE_COLS + col])) continue
        ctx.strokeRect(col * cellPx + 1, row * cellPx + 1, cellPx - 2, cellPx - 2)
      }
    }

    // Minimapa (docs/PROGRESS.md, "preparar o editor pra fases maiores", Fase B) — miniatura da
    // fase inteira já renderizada no canvas principal (grade incluída — em escala pequena isso só
    // vira uma textura fina, não atrapalha). Desenhado no MESMO efeito (não um separado) pra não
    // depender de ordem de execução entre dois `useEffect` com as mesmas dependências.
    const minimapCanvas = minimapCanvasRef.current
    const minimapCtx = minimapCanvas?.getContext('2d')
    if (minimapCanvas && minimapCtx) {
      minimapCanvas.width = MINIMAP_WIDTH_PX
      minimapCanvas.height = Math.round((MINIMAP_WIDTH_PX * canvas.height) / canvas.width)
      minimapCtx.imageSmoothingEnabled = false
      minimapCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, minimapCanvas.width, minimapCanvas.height)
    }
    updateViewportRect()
  }, [
    mode,
    composed,
    composedLayer2Pattern,
    hardwareCombined,
    activeStep,
    effectiveBackdropColor,
    grid,
    tilePriority,
    HARDWARE_COLS,
    HARDWARE_ROWS,
  ])

  /** Painel dedicado da Camada 2 (docs/PROGRESS.md, "Camada 2 como padrão repetível", 2026-09-29)
   * — canvas PRÓPRIO, do tamanho da Camada 2 (`layer2WidthTiles`, não da fase), pra pintar; e uma
   * PRÉ-VISUALIZAÇÃO ao lado mostrando o padrão se repetindo 3x, pra dar pra ver a emenda ANTES de
   * exportar (pedido explícito do usuário — "é fácil desenhar algo que quebra visivelmente na
   * emenda sem ver isso antes"). Efeito PRÓPRIO (não reaproveita o de cima) porque só roda quando o
   * modo 'layer2' está de fato visível/montado. */
  useEffect(() => {
    if (mode !== 'layer2') return
    const canvas = layer2CanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !composedLayer2Pattern || !hardwareCombined.ok) return

    const patternCanvas = document.createElement('canvas')
    patternCanvas.width = composedLayer2Pattern.width
    patternCanvas.height = composedLayer2Pattern.height
    const patternCtx = patternCanvas.getContext('2d')
    if (!patternCtx) return
    const rgba = composedToRgba(
      {
        width: composedLayer2Pattern.width,
        height: composedLayer2Pattern.height,
        originX: 0,
        originY: 0,
        pixels: composedLayer2Pattern.indices,
      },
      hardwareCombined.palette,
    )
    patternCtx.putImageData(new ImageData(rgba, composedLayer2Pattern.width, composedLayer2Pattern.height), 0, 0)

    canvas.width = composedLayer2Pattern.width * GRID_DISPLAY_SCALE
    canvas.height = composedLayer2Pattern.height * GRID_DISPLAY_SCALE
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(patternCanvas, 0, 0, patternCanvas.width, patternCanvas.height, 0, 0, canvas.width, canvas.height)

    // Grade acompanha o mesmo `cursorStep` do resto (mostra onde o clique cai de verdade aqui
    // também).
    const stepPx = activeStep * GRID_DISPLAY_SCALE
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
    ctx.lineWidth = 1
    for (let x = stepPx; x < canvas.width; x += stepPx) {
      ctx.beginPath()
      ctx.moveTo(x + 0.5, 0)
      ctx.lineTo(x + 0.5, canvas.height)
      ctx.stroke()
    }
    for (let y = stepPx; y < canvas.height; y += stepPx) {
      ctx.beginPath()
      ctx.moveTo(0, y + 0.5)
      ctx.lineTo(canvas.width, y + 0.5)
      ctx.stroke()
    }

    // Pré-visualização da repetição — 3 cópias lado a lado, SÓ LEITURA (nenhum clique aqui pinta
    // nada, ver `handleCanvasMouseDown`), pra mostrar a emenda antes de exportar.
    const previewCanvas = layer2PreviewCanvasRef.current
    const previewCtx = previewCanvas?.getContext('2d')
    if (previewCanvas && previewCtx) {
      const REPEAT_COUNT = 3
      previewCanvas.width = canvas.width * REPEAT_COUNT
      previewCanvas.height = canvas.height
      previewCtx.imageSmoothingEnabled = false
      for (let i = 0; i < REPEAT_COUNT; i++) {
        previewCtx.drawImage(patternCanvas, 0, 0, patternCanvas.width, patternCanvas.height, i * canvas.width, 0, canvas.width, canvas.height)
      }
    }
  }, [mode, composedLayer2Pattern, hardwareCombined, activeStep])

  /** Recalcula o retângulo do minimapa a partir do scroll/tamanho ATUAIS do viewport rolável (ver
   * `.stage-viewport` no JSX) — chamado no `onScroll` dele e sempre que o canvas principal é
   * redesenhado (mudança de tamanho da fase mudaria o que "100% visível" significa). */
  function updateViewportRect() {
    const viewport = viewportRef.current
    const canvas = gridCanvasRef.current
    if (!viewport || !canvas || !canvas.width || !canvas.height) return
    setViewportRect({
      left: viewport.scrollLeft / canvas.width,
      top: viewport.scrollTop / canvas.height,
      width: Math.min(1, viewport.clientWidth / canvas.width),
      height: Math.min(1, viewport.clientHeight / canvas.height),
    })
  }

  /** Clique no minimapa pula o viewport rolável pra aquele ponto da fase (centralizado) — mesmo
   * espírito do "vá pra aqui" de um minimapa de editor de nível (Lunar Magic etc.). `scrollLeft`/
   * `scrollTop` já saem clampados pro navegador sozinho (não passam do conteúdo), não precisa
   * calcular limite manualmente aqui. */
  function handleMinimapClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const minimapCanvas = minimapCanvasRef.current
    const viewport = viewportRef.current
    const canvas = gridCanvasRef.current
    if (!minimapCanvas || !viewport || !canvas) return
    const rect = minimapCanvas.getBoundingClientRect()
    const fx = (e.clientX - rect.left) / rect.width
    const fy = (e.clientY - rect.top) / rect.height
    viewport.scrollLeft = fx * canvas.width - viewport.clientWidth / 2
    viewport.scrollTop = fy * canvas.height - viewport.clientHeight / 2
    updateViewportRect()
  }

  function layerOfBrush(tilesetIndex: number, blockIndex: number): TileLayer {
    const entry = ownTilesets[tilesetIndex]
    if (!entry.ok) return 1
    const topLeft = brushTopLeftHardware(tilesetIndex, blockIndex)
    if (!topLeft) return 1
    const hardwareIndex = topLeft.row * (hardwareCombined.ok ? hardwareCombined.tileset.cols : 1) + topLeft.col
    return tileLayer.get(hardwareIndex) ?? 1
  }

  /** `true` quando o bloco desenha NA FRENTE do jogador/inimigo (docs/DATA_FORMAT.md § 4, "Bit de
   * prioridade por tile da Camada 1", 2026-10-02) — mesmo padrão de `layerOfBrush`. */
  function priorityOfBrush(tilesetIndex: number, blockIndex: number): boolean {
    const entry = ownTilesets[tilesetIndex]
    if (!entry.ok) return false
    const topLeft = brushTopLeftHardware(tilesetIndex, blockIndex)
    if (!topLeft) return false
    const hardwareIndex = topLeft.row * (hardwareCombined.ok ? hardwareCombined.tileset.cols : 1) + topLeft.col
    return tilePriority.get(hardwareIndex) ?? false
  }

  /** Cor de contorno de um bloco avulso na paleta/modal — verde-do-bloco-padrão sobrepõe tudo (é o
   * caso mais sério, ver GOAL_WARNING_RATIO), senão roxo de prioridade ("na frente"), senão azul de
   * Camada 2, senão nenhuma. */
  function blockBorderColor(tilesetIndex: number, blockIndex: number, layer: TileLayer, priority: boolean): string | undefined {
    return tilesetIndex === 0 && blockIndex === 0
      ? DEFAULT_FILL_BORDER_COLOR
      : priority
        ? PRIORITY_BORDER_COLOR
        : layer === 2
          ? LAYER2_BORDER_COLOR
          : undefined
  }

  function blockTitle(tilesetLabel: string, tilesetIndex: number, blockIndex: number, layer: TileLayer, priority: boolean): string {
    return `Bloco ${blockIndex} de "${tilesetLabel}"${layer === 2 ? ' (Camada 2)' : ''}${
      priority ? ' (desenha na frente do jogador/inimigo)' : ''
    }${
      tilesetIndex === 0 && blockIndex === 0
        ? ' — bloco PADRÃO: cobre toda célula da Camada 1 nunca pintada (cuidado com a colisão marcada nele)'
        : ''
    }`
  }

  /** Canto superior esquerdo (em célula de HARDWARE, já no espaço do tileset COMBINADO da fase —
   * não do tileset de origem sozinho) do bloco `blockIndex` do tileset `tilesetIndex`. Mesma
   * matemática de `mergeTilesetMeta.ts` (tradução bloco -> tile de hardware -> posição na banda
   * combinada), só que calculada aqui pra UM bloco de cada vez (pintar/mostrar cor da borda),
   * em vez de todos de uma vez (mesclar toda a tabela de colisão). */
  function brushTopLeftHardware(tilesetIndex: number, blockIndex: number): { col: number; row: number } | null {
    if (!hardwareCombined.ok) return null
    const entry = ownTilesets[tilesetIndex]
    const band = hardwareCombined.bands[tilesetIndex]
    if (!entry.ok || !band) return null
    const local = blockToHardwareTopLeft(entry.tileset, blockIndex)
    return { col: local.col, row: band.rowOffset + local.row }
  }

  function cellFromClient(clientX: number, clientY: number): { col: number; row: number } | null {
    const canvas = activeCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    // Fator de escala X e Y calculados SEPARADAMENTE (docs/PROGRESS.md, "preparar o editor pra
    // fases maiores", Fase B) — hoje sempre iguais (CSS nunca distorce o canvas), mas não dá pra
    // assumir isso de propósito só porque largura/altura da fase podem ser diferentes agora.
    const stepPxX = (activeStep * GRID_DISPLAY_SCALE * rect.width) / canvas.width
    const stepPxY = (activeStep * GRID_DISPLAY_SCALE * rect.height) / canvas.height
    const stepHardwareCells = activeStep / HARDWARE_TILE_SIZE
    return {
      col: Math.floor((clientX - rect.left) / stepPxX) * stepHardwareCells,
      row: Math.floor((clientY - rect.top) / stepPxY) * stepHardwareCells,
    }
  }

  /** Carimba o bloco escolhido a partir da célula de HARDWARE (8px) `(col,row)` — o bloco cobre
   * `blockSize/8` células de 8px de cada lado a partir dali. Carimbo parcialmente fora da grade
   * (perto da borda) só escreve a parte que cabe, sem lançar.
   *
   * Com a borracha ativa, ignora o bloco escolhido e limpa SÓ a célula de 8px sob o cursor na
   * Camada 2 (volta pro sentinela `NO_TILE`) — não mexe na Camada 1 de propósito (decisão do
   * usuário, 2026-09-22): ela nunca tem "vazio" de verdade. */
  function paintCell(col: number, row: number) {
    if (col < 0 || col >= activeCols || row < 0 || row >= HARDWARE_ROWS) return
    if (eraser) {
      const idx = row * activeCols + col
      setGridLayer2((prev) => {
        if (prev[idx] === NO_TILE) return prev
        const next = new Uint16Array(prev)
        next[idx] = NO_TILE
        return next
      })
      return
    }
    if (!hardwareCombined.ok) return
    const topLeft = brushTopLeftHardware(brush.tilesetIndex, brush.blockIndex)
    if (!topLeft) return
    const stampCells = tilesets[brush.tilesetIndex].blockSize / HARDWARE_TILE_SIZE
    const layer = layerOfBrush(brush.tilesetIndex, brush.blockIndex)
    // `activeCols` é a largura do canvas ATIVO (a própria da Camada 2 no painel dedicado, a da fase
    // inteira no normal) — carimbar um bloco da OUTRA camada usaria a largura errada pro array que
    // de verdade recebe o carimbo, corrompendo a grade (achado real, 2026-10-01: blocos de Camada 2
    // pintados no modo "Pintar blocos" apareciam cortados/repetidos — a escrita usava a largura da
    // fase inteira, mas `gridLayer2` só tem a largura PRÓPRIA dela, bem menor). Bloqueado nos dois
    // sentidos — a paleta já destaca/filtra por camada (ver `blockBorderColor`/`TilePickerModal`
    // `visibleIf`), mas isso aqui é quem garante que nunca corrompe de verdade.
    if ((mode === 'layer2') !== (layer === 2)) return
    const setTargetGrid = layer === 2 ? setGridLayer2 : setGrid
    setTargetGrid((prev) => {
      const next = new Uint16Array(prev)
      let changed = false
      for (let dy = 0; dy < stampCells; dy++) {
        const targetRow = row + dy
        if (targetRow >= HARDWARE_ROWS) break
        for (let dx = 0; dx < stampCells; dx++) {
          const targetCol = col + dx
          if (targetCol >= activeCols) break
          const hardwareIndex = (topLeft.row + dy) * hardwareCombined.tileset.cols + (topLeft.col + dx)
          const targetIdx = targetRow * activeCols + targetCol
          if (next[targetIdx] !== hardwareIndex) {
            next[targetIdx] = hardwareIndex
            changed = true
          }
        }
      }
      return changed ? next : prev
    })
  }

  /** Lata de tinta (pedido do usuário, 2026-09-24) — a partir da célula de HARDWARE `(hardwareCol,
   * hardwareRow)`, pinta com o `brush` ATUAL todos os blocos ADJACENTES que são IGUAIS ao clicado
   * (flood fill clássico de editor de imagem, 4-conectado).
   *
   * Granularidade: SEMPRE o blockSize do bloco selecionado (`brush`), com uma grade alinhada a
   * partir da origem (0,0) — mesmo padrão de `applyTerrainAt`/`isMember`, não é coincidência: um
   * bloco de 16/32px tem sub-tiles DIFERENTES entre si (canto ≠ meio), então "célula de hardware
   * individual" não é uma unidade de comparação válida pra "mesmo bloco" nesses tamanhos — só a
   * granularidade do bloco INTEIRO é. "Igual" é decidido pelo valor gravado no canto superior
   * esquerdo de cada célula (mesma convenção de `applyTerrainAt`), comparado contra o valor
   * ORIGINAL da célula clicada (antes de qualquer troca desta operação — por isso `startValue` é
   * capturado uma vez só, no início, não recalculado a cada célula visitada). */
  function floodFillAt(hardwareCol: number, hardwareRow: number) {
    if (!hardwareCombined.ok) return
    const tilesetEntry = tilesets[brush.tilesetIndex]
    if (!tilesetEntry) return
    const topLeft = brushTopLeftHardware(brush.tilesetIndex, brush.blockIndex)
    if (!topLeft) return
    const combinedCols = hardwareCombined.tileset.cols
    const cellsPerBlock = tilesetEntry.blockSize / HARDWARE_TILE_SIZE
    const blockCols = activeCols / cellsPerBlock
    const blockRows = HARDWARE_ROWS / cellsPerBlock
    const blockCol = Math.floor(hardwareCol / cellsPerBlock)
    const blockRow = Math.floor(hardwareRow / cellsPerBlock)
    if (blockCol < 0 || blockCol >= blockCols || blockRow < 0 || blockRow >= blockRows) return

    const layer = layerOfBrush(brush.tilesetIndex, brush.blockIndex)
    if ((mode === 'layer2') !== (layer === 2)) return // ver mesmo bloqueio/motivo em `paintCell`
    // Cópia local em número puro (não o objeto `topLeft`) só pra TypeScript não perder a checagem
    // de nulo dentro da função aninhada mais abaixo — mesmo motivo de `combinedCols` em
    // `applyTerrainAt`: narrowing de union/nulo não atravessa uma `function` aninhada.
    const topLeftRow = topLeft.row
    const topLeftCol = topLeft.col
    const newValue = topLeftRow * combinedCols + topLeftCol
    const setTargetGrid = layer === 2 ? setGridLayer2 : setGrid

    setTargetGrid((prev) => {
      const stageIndexOf = (bc: number, br: number) => br * cellsPerBlock * activeCols + bc * cellsPerBlock
      const startValue = prev[stageIndexOf(blockCol, blockRow)]
      if (startValue === newValue) return prev // já é esse bloco — nada a preencher

      const next = new Uint16Array(prev)
      function stampBlockAt(bc: number, br: number) {
        for (let dy = 0; dy < cellsPerBlock; dy++) {
          const targetRow = br * cellsPerBlock + dy
          if (targetRow >= HARDWARE_ROWS) break
          for (let dx = 0; dx < cellsPerBlock; dx++) {
            const targetCol = bc * cellsPerBlock + dx
            if (targetCol >= activeCols) break
            next[targetRow * activeCols + targetCol] = (topLeftRow + dy) * combinedCols + (topLeftCol + dx)
          }
        }
      }

      const visited = new Set<number>()
      const stack: Array<{ col: number; row: number }> = [{ col: blockCol, row: blockRow }]
      while (stack.length > 0) {
        const cell = stack.pop()!
        if (cell.col < 0 || cell.col >= blockCols || cell.row < 0 || cell.row >= blockRows) continue
        const key = cell.row * blockCols + cell.col
        if (visited.has(key)) continue
        visited.add(key)
        if (next[stageIndexOf(cell.col, cell.row)] !== startValue) continue

        stampBlockAt(cell.col, cell.row)
        stack.push({ col: cell.col - 1, row: cell.row })
        stack.push({ col: cell.col + 1, row: cell.row })
        stack.push({ col: cell.col, row: cell.row - 1 })
        stack.push({ col: cell.col, row: cell.row + 1 })
      }

      return next
    })
  }

  /** Pinta/apaga com o pincel de TERRENO INTELIGENTE (autotile, docs/PROGRESS.md "tilesets
   * inteligentes", 2026-09-23) a partir da célula de HARDWARE `(hardwareCol, hardwareRow)` — ao
   * contrário de `paintCell` (carimba sempre o MESMO bloco escolhido), aqui a variante concreta é
   * resolvida sozinha a partir dos vizinhos (ver autotile.ts), tanto pra célula clicada quanto pra
   * quem for afetado por ela. Sempre alinhado ao blockSize do PRÓPRIO tileset do grupo (ver
   * `activeStep`), nunca ao "Passo do cursor" livre.
   *
   * Algoritmo (2 passos dentro de UMA atualização de estado só, pra `isMember` já enxergar o
   * resultado do passo 1 ao resolver o passo 2 — duas chamadas de `setState` separadas não
   * garantiriam isso, por causa de batching):
   * 1. Marca a célula clicada como MEMBRO do grupo (pintando) ou remove ela (apagando).
   * 2. Recalcula o papel dela + dos vizinhos ortogonais que ainda são deste grupo, escrevendo o
   *    bloco certo de cada um.
   *
   * "Pertencer ao grupo" é decidido pelo VALOR gravado na grade (célula por célula, sempre a
   * sub-célula de hardware do CANTO SUPERIOR ESQUERDO de cada célula do grupo) bater com o de
   * alguma das variantes já atribuídas — não existe um "mapa de pertencimento" separado gravado em
   * lugar nenhum (nem precisa: a grade pintada já é a fonte da verdade). */
  function applyTerrainAt(hardwareCol: number, hardwareRow: number, erasing: boolean) {
    if (!terrainBrush || !hardwareCombined.ok) return
    const tilesetEntry = tilesets[terrainBrush.tilesetIndex]
    const group = tilesetEntry?.terrainGroups?.[terrainBrush.groupIndex]
    if (!tilesetEntry || !group) return
    if ((mode === 'layer2') !== (group.layer === 2)) return // ver mesmo bloqueio/motivo em `paintCell`
    // Só Camada 2 tem "vazio" de verdade (mesma regra da borracha do pincel avulso, 2026-09-22).
    if (erasing && group.layer !== 2) return

    // Cópia local só pra TypeScript não perder a checagem de nulo de `hardwareCombined.ok` (feita
    // lá em cima) dentro das funções aninhadas mais abaixo (mesmo motivo do comentário de
    // `brushTopLeftHardware`/`layerOfBrush`) — narrowing de union não atravessa uma `function`
    // aninhada (só uma arrow function direta), diferente de `const`.
    const combinedCols = hardwareCombined.tileset.cols
    const cellsPerBlock = tilesetEntry.blockSize / HARDWARE_TILE_SIZE
    const blockCols = activeCols / cellsPerBlock
    const blockRows = HARDWARE_ROWS / cellsPerBlock
    const blockCol = Math.floor(hardwareCol / cellsPerBlock)
    const blockRow = Math.floor(hardwareRow / cellsPerBlock)
    if (blockCol < 0 || blockCol >= blockCols || blockRow < 0 || blockRow >= blockRows) return

    // Canto superior esquerdo (célula de hardware, espaço do tileset combinado) de cada papel JÁ
    // atribuído neste grupo — usado tanto pra "pertence ao grupo?" (groupValues) quanto pra saber
    // que bloco carimbar de fato (roleTopLeft).
    const roleTopLeft: Partial<Record<TerrainRole, { col: number; row: number }>> = {}
    const groupValues = new Set<number>()
    for (const role of TERRAIN_ROLES) {
      const blockIndex = group.roles[role]
      if (blockIndex === undefined) continue
      const topLeft = brushTopLeftHardware(terrainBrush.tilesetIndex, blockIndex)
      if (!topLeft) continue
      roleTopLeft[role] = topLeft
      groupValues.add(topLeft.row * combinedCols + topLeft.col)
    }
    // Papel usado só pra "existir alguma coisa ali" no passo 1 (preferindo o de preenchimento,
    // mesma regra de fallback de "papel sem bloco atribuído" — ver types.ts) — o passo 2 já
    // corrige o papel de verdade da célula clicada logo em seguida, olhando os vizinhos.
    const anyRole: TerrainRole | undefined = roleTopLeft.fill ? 'fill' : (Object.keys(roleTopLeft)[0] as TerrainRole | undefined)
    if (!erasing && !anyRole) return // grupo sem NENHUM papel atribuído — nada pra pintar

    const setTargetGrid = group.layer === 2 ? setGridLayer2 : setGrid
    setTargetGrid((prev) => {
      const next = new Uint16Array(prev)
      let changed = false
      const stageIndexOf = (bc: number, br: number) => br * cellsPerBlock * activeCols + bc * cellsPerBlock

      function stampRoleAt(bc: number, br: number, role: TerrainRole) {
        const topLeft = roleTopLeft[role]
        if (!topLeft) return
        for (let dy = 0; dy < cellsPerBlock; dy++) {
          const targetRow = br * cellsPerBlock + dy
          if (targetRow >= HARDWARE_ROWS) break
          for (let dx = 0; dx < cellsPerBlock; dx++) {
            const targetCol = bc * cellsPerBlock + dx
            if (targetCol >= activeCols) break
            const hardwareIndex = (topLeft.row + dy) * combinedCols + (topLeft.col + dx)
            const targetIdx = targetRow * activeCols + targetCol
            if (next[targetIdx] !== hardwareIndex) {
              next[targetIdx] = hardwareIndex
              changed = true
            }
          }
        }
      }
      function clearAt(bc: number, br: number) {
        for (let dy = 0; dy < cellsPerBlock; dy++) {
          const targetRow = br * cellsPerBlock + dy
          if (targetRow >= HARDWARE_ROWS) break
          for (let dx = 0; dx < cellsPerBlock; dx++) {
            const targetCol = bc * cellsPerBlock + dx
            if (targetCol >= activeCols) break
            const targetIdx = targetRow * activeCols + targetCol
            if (next[targetIdx] !== NO_TILE) {
              next[targetIdx] = NO_TILE
              changed = true
            }
          }
        }
      }

      if (erasing) {
        clearAt(blockCol, blockRow)
      } else if (anyRole) {
        stampRoleAt(blockCol, blockRow, anyRole)
      }

      function isMember(bc: number, br: number): boolean {
        if (bc < 0 || bc >= blockCols || br < 0 || br >= blockRows) return false
        return groupValues.has(next[stageIndexOf(bc, br)])
      }

      for (const cell of terrainCellsToReevaluate(isMember, { col: blockCol, row: blockRow })) {
        // O papel sempre usa pertencimento REAL (nunca a borda do mapa) — achado real, 2026-09-25:
        // uma versão anterior deste ajuste fazia a vizinhança "enxergar" a borda do mapa como
        // pertencente DIRETO dentro de `terrainRoleAt`, e isso quebrava formas côncavas/finas perto
        // da borda (um canto de verdade de uma moldura oca virava canto interno, porque os 4
        // cardeais "pareciam" preenchidos). Corrigido separando os dois passos: resolve o papel
        // certo primeiro, e só DEPOIS corta a borda que toca o limite do mapa (`trimRoleForMapEdges`
        // — ex.: `topLeft` tocando a borda esquerda vira só `top`, parecendo chão contínuo).
        const role = trimRoleForMapEdges(terrainRoleAt(isMember, cell), {
          top: cell.row === 0,
          bottom: cell.row === blockRows - 1,
          left: cell.col === 0,
          right: cell.col === blockCols - 1,
        })
        if (!anyRole) continue // impossível na prática (isMember só é true se algum papel existe), mas não trava
        stampRoleAt(cell.col, cell.row, roleTopLeft[role] ? role : anyRole)
      }

      return changed ? next : prev
    })
  }

  /** Pinta a célula sob o cursor; se já vinha pintando (arrasto), também preenche a linha reta
   * desde a última célula pintada, pra não deixar buraco quando o mouse anda rápido. Não limpa o
   * resultado do build sozinho — quem chama decide (single click vs. efeito de mousemove).
   *
   * `cellsOnLine` interpola em passos de 1 célula de HARDWARE (8px) — com `activeStep` > 8, isso
   * preenchia posições intermediárias DESALINHADAS (achado real, 2026-09-23). Corrigido convertendo
   * pra "unidade de passo" antes de interpolar e voltando pra célula de hardware só na hora de
   * chamar `paintCell`/`applyTerrainAt`. */
  function paintAt(clientX: number, clientY: number) {
    const cell = cellFromClient(clientX, clientY)
    if (!cell) return
    const stepHardwareCells = activeStep / HARDWARE_TILE_SIZE
    const last = lastPaintedCellRef.current
    const cellStep = { col: cell.col / stepHardwareCells, row: cell.row / stepHardwareCells }
    const lastStep = last ? { col: last.col / stepHardwareCells, row: last.row / stepHardwareCells } : null
    const steps = lastStep ? cellsOnLine(lastStep.col, lastStep.row, cellStep.col, cellStep.row) : [cellStep]
    for (const s of steps) {
      const hc = s.col * stepHardwareCells
      const hr = s.row * stepHardwareCells
      if (terrainBrush) applyTerrainAt(hc, hr, eraser)
      else paintCell(hc, hr)
    }
    lastPaintedCellRef.current = cell
  }

  /** Encaixa X na MESMA grade do "Passo do cursor" — pedido do usuário: posicionar jogador/inimigo
   * "à mão" (clique/arrasto) deixava a posição torta, sem relação com os blocos pintados. Vai pro
   * CENTRO da coluna mais próxima (não no canto/linha da grade) — mesma convenção já documentada em
   * `hitbox.ts` ("centrada no pivô em X"). */
  function snapGridCenter(value: number): number {
    const cell = Math.floor(value / cursorStep)
    return clampStagePixelX(cell * cursorStep + cursorStep / 2, stageWidthPx)
  }

  /** Encaixa Y na BORDA DE BAIXO da célula mais próxima (não no centro) — é essa borda que
   * representa "em cima do chão". Mesma convenção de `hitbox.ts` ("ancorado nos pés"). */
  function snapGridBottomEdge(value: number): number {
    const cell = Math.floor(value / cursorStep)
    return clampStagePixelY((cell + 1) * cursorStep)
  }

  /** Converte uma posição de mouse na tela pra coordenada em pixel da fase (já encaixada na grade
   * de pintura — X no centro da coluna, Y na borda de baixo da célula, ver acima), resolução
   * independente do tamanho exibido do canvas (funciona igual em telas menores/roladas). */
  function stagePixelFromClient(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = gridCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const nx = (clientX - rect.left) / rect.width
    const ny = (clientY - rect.top) / rect.height
    return {
      x: snapGridCenter(nx * (stageWidthPx - 1)),
      y: snapGridBottomEdge(ny * (STAGE_HEIGHT_PIXELS - 1)),
    }
  }

  /** Encaixa na BORDA ESQUERDA/DE CIMA da célula mais próxima — diferente de
   * `snapGridCenter`/`snapGridBottomEdge` (convenção de pivô/pé usada por jogador/inimigo): uma
   * decoração não tem pivô, `x`,`y` É diretamente o canto superior esquerdo do quadro
   * (docs/DATA_FORMAT.md § 3, "X/Y = canto superior esquerdo do retângulo do frame... independente
   * do pivô"), então encaixar no CENTRO/na BORDA DE BAIXO desalinharia o quadro da grade de
   * pintura em vez de alinhar. */
  function snapGridLeftEdge(value: number): number {
    const cell = Math.floor(value / cursorStep)
    return clampStagePixelX(cell * cursorStep, stageWidthPx)
  }

  function snapGridTopEdge(value: number): number {
    const cell = Math.floor(value / cursorStep)
    return clampStagePixelY(cell * cursorStep)
  }

  /** Mesma conversão de `stagePixelFromClient`, mas com o encaixe canto-superior-esquerdo acima —
   * usada só pra decoração (ver `snapGridLeftEdge`/`snapGridTopEdge`). */
  function stagePixelFromClientTopLeft(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = gridCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const nx = (clientX - rect.left) / rect.width
    const ny = (clientY - rect.top) / rect.height
    return {
      x: snapGridLeftEdge(nx * (stageWidthPx - 1)),
      y: snapGridTopEdge(ny * (STAGE_HEIGHT_PIXELS - 1)),
    }
  }

  useEffect(() => {
    function stopPainting() {
      paintingRef.current = false
      lastPaintedCellRef.current = null
    }
    function handleWindowMouseMove(e: MouseEvent) {
      if (e.buttons !== 1) {
        if (paintingRef.current) {
          paintingRef.current = false
          lastPaintedCellRef.current = null
        }
        draggingEntityRef.current = null
        return
      }
      if (paintingRef.current) {
        paintAtRef.current(e.clientX, e.clientY)
        clearResultsRef.current()
        return
      }
      const target = draggingEntityRef.current
      if (!target) return
      if (target.kind === 'decor') {
        const topLeft = stagePixelFromClientTopLeftRef.current(e.clientX, e.clientY)
        if (!topLeft) return
        setEntities((prev) => {
          const decorations = [...prev.decorations]
          decorations[target.index] = { ...decorations[target.index], x: topLeft.x, y: topLeft.y }
          return { ...prev, decorations }
        })
        clearResultsRef.current()
        return
      }
      const pivot = stagePixelFromClientRef.current(e.clientX, e.clientY)
      if (!pivot) return
      if (target.kind === 'player') {
        const spawn = pivotToSpawn(pivot, hitboxByBaseNameRef.current[DEFAULT_CHARACTER_SLOT_ID])
        setEntities((prev) => ({ ...prev, player: spawn }))
      } else if (target.kind === 'enemy') {
        setEntities((prev) => {
          const enemies = [...prev.enemies]
          const enemy = enemies[target.index]
          const spawn = pivotToSpawn(pivot, hitboxByBaseNameRef.current[enemyBaseName(enemy)])
          enemies[target.index] = { ...enemy, x: spawn.x, y: spawn.y }
          return { ...prev, enemies }
        })
      } else {
        setEntities((prev) => {
          const enemies = [...prev.enemies]
          const enemy = enemies[target.index]
          const offset = pivot.x - enemy.x
          if (target.kind === 'patrolMin') {
            enemies[target.index] = { ...enemy, patrolMinOffsetX: Math.min(offset, enemy.patrolMaxOffsetX) }
          } else {
            enemies[target.index] = { ...enemy, patrolMaxOffsetX: Math.max(offset, enemy.patrolMinOffsetX) }
          }
          return { ...prev, enemies }
        })
      }
      clearResultsRef.current()
    }
    function handleWindowMouseUp() {
      draggingEntityRef.current = null
    }
    window.addEventListener('mouseup', stopPainting)
    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp)
    return () => {
      window.removeEventListener('mouseup', stopPainting)
      window.removeEventListener('mousemove', handleWindowMouseMove)
      window.removeEventListener('mouseup', handleWindowMouseUp)
    }
  }, [])

  function handleCanvasMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (mode === 'paint' || mode === 'layer2') {
      e.preventDefault()
      // Lata de tinta é sempre 1 clique só — nunca arrasta/continua como o pincel normal (ver
      // `paintAt`), senão um arrasto acidental de 1px já disparava vários flood fills em sequência.
      if (bucketFill) {
        const cell = cellFromClient(e.clientX, e.clientY)
        if (cell) floodFillAt(cell.col, cell.row)
        clearResults()
        return
      }
      paintingRef.current = true
      lastPaintedCellRef.current = null
      paintAt(e.clientX, e.clientY)
      clearResults()
      return
    }
    if (armPlacePlayer) {
      const pivot = stagePixelFromClient(e.clientX, e.clientY)
      if (pivot) {
        const spawn = pivotToSpawn(pivot, hitboxByBaseName[DEFAULT_CHARACTER_SLOT_ID])
        setEntities((prev) => ({ ...prev, player: spawn }))
        setSelectedEntity({ kind: 'player' })
        clearResults()
      }
      setArmPlacePlayer(false)
    }
  }

  /** `slotId` opcional (pedido do usuário, 2026-09-24: ícone por tipo de inimigo na barra de
   * ferramentas em vez de um botão genérico único) — cai no padrão de sempre se omitido. */
  function handleAddEnemy(slotId: string = DEFAULT_ENEMY_SLOT_ID) {
    const slot = ENEMY_SLOTS.find((s) => s.id === slotId) ?? ENEMY_SLOTS[0]
    const pivot = { x: snapGridCenter(stageWidthPx / 2), y: snapGridBottomEdge(STAGE_HEIGHT_PIXELS / 2) }
    const spawn = pivotToSpawn(pivot, hitboxByBaseName[slot.id])
    const newEnemy: EnemyInstance = {
      typeIndex: slot.typeIndex,
      x: spawn.x,
      y: spawn.y,
      hasPatrolLimit: false,
      patrolMinOffsetX: -DEFAULT_ENEMY_PATROL_HALF_WIDTH,
      patrolMaxOffsetX: DEFAULT_ENEMY_PATROL_HALF_WIDTH,
    }
    const newIndex = entities.enemies.length
    setEntities((prev) => ({ ...prev, enemies: [...prev.enemies, newEnemy] }))
    setSelectedEntity({ kind: 'enemy', index: newIndex })
    clearResults()
  }

  function updateEnemy(index: number, patch: Partial<EnemyInstance>) {
    setEntities((prev) => {
      const enemies = [...prev.enemies]
      enemies[index] = { ...enemies[index], ...patch }
      return { ...prev, enemies }
    })
    clearResults()
  }

  function removeEnemy(index: number) {
    setEntities((prev) => ({ ...prev, enemies: prev.enemies.filter((_, i) => i !== index) }))
    setSelectedEntity(null)
    clearResults()
  }

  /** `slotId` opcional, mesmo espírito de `handleAddEnemy` — cai no padrão de sempre se omitido.
   * Sem `pivotToSpawn`: decoração não tem hitbox/pivô, o ponto encaixado na grade (canto superior
   * esquerdo, ver `snapGridLeftEdge`/`snapGridTopEdge`) JÁ é o valor a salvar. */
  function handleAddDecor(slotId: string = DEFAULT_DECOR_SLOT_ID) {
    const slot = DECOR_SLOTS.find((s) => s.id === slotId) ?? DECOR_SLOTS[0]
    const x = snapGridLeftEdge(stageWidthPx / 2)
    const y = snapGridTopEdge(STAGE_HEIGHT_PIXELS / 2)
    const newDecor: DecorInstance = {
      typeIndex: slot.typeIndex,
      frame: 0,
      x,
      y,
      solid: false,
      specialPropertyId: DEFAULT_SPECIAL_PROPERTY_ID,
    }
    const newIndex = entities.decorations.length
    setEntities((prev) => ({ ...prev, decorations: [...prev.decorations, newDecor] }))
    setSelectedEntity({ kind: 'decor', index: newIndex })
    clearResults()
  }

  function updateDecor(index: number, patch: Partial<DecorInstance>) {
    setEntities((prev) => {
      const decorations = [...prev.decorations]
      decorations[index] = { ...decorations[index], ...patch }
      return { ...prev, decorations }
    })
    clearResults()
  }

  function removeDecor(index: number) {
    setEntities((prev) => ({ ...prev, decorations: prev.decorations.filter((_, i) => i !== index) }))
    setSelectedEntity(null)
    clearResults()
  }

  function removePlayer() {
    setEntities((prev) => ({ ...prev, player: null }))
    setSelectedEntity(null)
    clearResults()
  }

  /** Carimba o Fundo escolhido pra esta sessão (docs/PROGRESS.md, "Fundo como recurso salvo",
   * 2026-09-30) inteiro, de uma vez, na Camada 2 — substitui TUDO que estava em `gridLayer2`
   * (pedido explícito do usuário: "sobrescreve o que colidir", mas a troca aqui é da grade INTEIRA,
   * não célula a célula). Reaproveita a MESMA faixa (`band`) que `hardwareCombined` já calculou pra
   * esse Fundo (ele entrou na combinação igual qualquer outro tileset, ver StageWorkspace.tsx) —
   * sem recombinar nada, só traduz cada célula do raster do Fundo (ordem já raster, mesma de
   * `buildTileset`/`tilePixels`) pro índice de hardware global dela (`bandGlobalTileIndex`). */
  function handleStampBackground() {
    if (backgroundTilesetIndex < 0 || !backgroundTileset || !hardwareCombined.ok) return
    const band = hardwareCombined.bands[backgroundTilesetIndex]
    const hasContent = gridLayer2.some((v) => v !== NO_TILE)
    if (hasContent) {
      const ok = window.confirm(
        `Carimbar "${backgroundTileset.name}" substitui TUDO que já está pintado na Camada 2 agora (inclusive outro fundo carimbado antes). Continuar?`,
      )
      if (!ok) return
    }
    const stamped = new Uint16Array(band.cols * band.rows)
    for (let i = 0; i < stamped.length; i++) {
      stamped[i] = bandGlobalTileIndex(band, i, hardwareCombined.tileset.cols)
    }
    setGridLayer2(stamped)
    setLayer2WidthTiles(band.cols)
    clearResults()
  }

  async function handleSave() {
    if (!entities.player || !hardwareTileset || !composed || !hardwareCombined.ok) return
    setSaving(true)
    clearResults()
    const sourceFileNames = tilesets.map((t) => t.upload.label).join(' + ')
    const tilemapName = `${STAGE_BASE_NAME}_tilemap.bmp`
    const collisionName = `${STAGE_BASE_NAME}_collision.h`
    const priorityName = `${STAGE_BASE_NAME}_tilemap_priority.txt`
    const entitiesName = `${STAGE_BASE_NAME}_entities.h`
    const bmp = encodeIndexedBmp(composed.width, composed.height, composed.indices, hardwareCombined.palette)
    const collisionHeader = generateCollisionHeader(STAGE_BASE_NAME, sourceFileNames, grid, tileCollision, widthTiles)
    const priorityText = generateTilePriorityText(grid, tilePriority, widthTiles)
    const entitiesHeader = generateEntitiesHeader(
      STAGE_BASE_NAME,
      sourceFileNames,
      entities.player,
      entities.enemies,
      effectiveBackdropColor,
      entities.decorations,
    )

    const results: Array<{ name: string; result: SaveResult }> = []
    results.push({ name: tilemapName, result: await saveToEngine(tilemapName, bmp) })
    results.push({
      name: collisionName,
      result: await saveToEngine(collisionName, new Blob([collisionHeader], { type: 'text/plain' })),
    })
    results.push({
      name: priorityName,
      result: await saveToEngine(priorityName, new Blob([priorityText], { type: 'text/plain' })),
    })
    results.push({
      name: entitiesName,
      result: await saveToEngine(entitiesName, new Blob([entitiesHeader], { type: 'text/plain' })),
    })

    // Camada 2 (docs/DATA_FORMAT.md § 4) — SEMPRE grava, mesmo vazia/em branco (achado real,
    // 2026-10-01: Anubis reportou um save sem Camada 2 rodando com a Camada 2 ANTIGA, de um save
    // anterior). Causa raiz: a versão anterior daqui APAGAVA `_tilemap_layer2.bmp` quando vazia —
    // mas o `.pic`/`.map`/`.pal` CONVERTIDOS (gerados pelo `make`/`gfx4snes` do lado da Anubis) não
    // são apagados junto, e a regra de Make que os gera depende do `.bmp` existir; sem o `.bmp`,
    // `make` não tem como reconverter, então os arquivos derivados antigos ficam órfãos — sem erro
    // nenhum (o alvo já existe, `make` só pula), e o jogo roda com uma Camada 2 desatualizada em
    // silêncio. Sempre exportar garante que `make` SEMPRE reconverte a partir do estado real atual
    // (vazia = imagem em branco, `composedLayer2Pattern` já cobre isso — toda célula nunca pintada
    // fica no índice 0/transparente, ver `composeLevel`/`NO_TILE`). Opção escolhida deliberadamente
    // em vez de apagar os arquivos derivados do lado da Anubis (mais frágil: dependeria de saber
    // exatamente quais arquivos apagar lá, e duplicaria essa lista de nomes entre os dois projetos).
    const layer2Name = `${STAGE_BASE_NAME}_tilemap_layer2.bmp`
    if (composedLayer2Pattern) {
      const layer2Bmp = encodeIndexedBmp(
        composedLayer2Pattern.width,
        composedLayer2Pattern.height,
        composedLayer2Pattern.indices,
        hardwareCombined.palette,
      )
      results.push({ name: layer2Name, result: await saveToEngine(layer2Name, layer2Bmp) })
    }

    // Referência por nome (docs/PROGRESS.md, "fase referencia tileset por nome", 2026-09-23) — só
    // grava quando TODOS os tilesets da sessão vieram de um tileset salvo de verdade (`name`/
    // `version` presentes). Uma sessão nunca mistura os dois casos (ver StageWorkspace.tsx): ou
    // vieram todos da galeria, ou todos de reconstrução por pixel de uma fase antiga (sem nome
    // nenhum pra referenciar) — nesse 2º caso, apaga um `_tileset_refs.json` velho se existir, pra
    // não deixar uma referência desatualizada apontando pro conteúdo errado.
    const refsName = `${STAGE_BASE_NAME}_tileset_refs.json`
    const refs = tilesets.every((t) => t.name !== undefined && t.version !== undefined)
      ? tilesets.map((t) => ({ name: t.name!, version: t.version!, kind: t.kind }))
      : null
    if (refs) {
      const refsJson = generateStageTilesetRefs(refs, widthTiles, grid, gridLayer2, effectiveBackdropColor)
      results.push({ name: refsName, result: await saveToEngine(refsName, new Blob([refsJson], { type: 'application/json' })) })
    } else {
      await deleteGfxFile(refsName)
    }
    setSaveResults(results)
    setSaving(false)
    if (results.every(({ result }) => result.ok)) {
      onSaved?.()
      await build.run()
    }
  }

  const selectedEnemy = selectedEntity?.kind === 'enemy' ? entities.enemies[selectedEntity.index] : null
  const selectedDecor = selectedEntity?.kind === 'decor' ? entities.decorations[selectedEntity.index] : null

  return (
    <div className="stage-editor">
      {seed && <p className="success">Fase salva reaberta — pinte por cima ou continue de onde parou.</p>}

      <div className="stage-toolbar">
        <div className="tile-grid">
          {(() => {
            const firstTileset = ownTilesets[0]
            return firstTileset?.ok ? (
              <TileThumb
                source={ownTilesetPreviews[0]}
                tileset={firstTileset.tileset}
                tileIndex={0}
                selected={mode === 'paint'}
                title="Pintar blocos"
                onClick={() => setMode('paint')}
              />
            ) : (
              <button
                type="button"
                className={`tile-thumb stage-eraser-button${mode === 'paint' ? ' tile-thumb-selected' : ''}`}
                title="Pintar blocos"
                onClick={() => setMode('paint')}
              >
                P
              </button>
            )
          })()}
          <button
            type="button"
            className={`tile-thumb stage-eraser-button${mode === 'layer2' ? ' tile-thumb-selected' : ''}`}
            title="Camada 2 — padrão de fundo que se repete sozinho (parallax), largura própria independente da fase"
            onClick={() => setMode('layer2')}
          >
            C2
          </button>
          <EntityPickerThumb
            baseName={ENEMY_SLOTS[0].id}
            fallbackLabel={ENEMY_SLOTS[0].label.charAt(0)}
            selected={mode === 'entities'}
            title="Personagens — posicionar jogador e inimigos"
            onClick={() => setMode('entities')}
          />
        </div>

        <div className="tile-grid">
          <select
            className="stage-cursor-step-select"
            aria-label="Passo do cursor"
            title="Passo do cursor — onde o clique pode cair no mapa, independente do tamanho do bloco escolhido pra carimbar"
            value={cursorStep}
            onChange={(e) => setCursorStep(Number(e.target.value) as StageBlockSize)}
          >
            {STAGE_BLOCK_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        {(mode === 'paint' || mode === 'layer2') && (
          <>
            <div className="tile-grid">
              <button
                type="button"
                className={`tile-thumb stage-eraser-button${eraser ? ' tile-thumb-selected' : ''}`}
                title="Borracha — apaga o bloco de Camada 2 daquela célula (não mexe na Camada 1)"
                onClick={() => {
                  setEraser(true)
                  setBucketFill(false)
                }}
              >
                Borracha
              </button>
              <button
                type="button"
                className={`tile-thumb stage-eraser-button${bucketFill ? ' tile-thumb-selected' : ''}`}
                title="Lata de tinta — pinta com o bloco selecionado todos os blocos adjacentes iguais ao clicado"
                onClick={() => {
                  setBucketFill(true)
                  setEraser(false)
                }}
              >
                Balde
              </button>
            </div>
            {tilesets.map((t, tilesetIndex) => {
              // Um Fundo (docs/PROGRESS.md, "Fundo como recurso salvo", 2026-09-30) não se escolhe
              // bloco a bloco — ele é carimbado inteiro de uma vez, num botão próprio dentro do
              // painel da Camada 2 (ver `backgroundTileset` abaixo). Escondido da paleta avulsa pra
              // não aparecer como um "bloco" gigante (32/64×32 tiles) sem sentido nenhum pra clicar.
              if (t.kind === 'background') return null
              const entry = ownTilesets[tilesetIndex]
              if (!entry.ok) return <p key={tilesetIndex} className="error">{entry.error}</p>
              const { tileset } = entry
              // Primeiro bloco deste tileset da camada do modo atual — `undefined` quando nenhum
              // bloco bate (esconde o quadrado inteiro: abrir o seletor só mostraria uma grade
              // vazia, já filtrada por `visibleIf` abaixo).
              const firstBlockForMode = Array.from({ length: tileset.tileCount }, (_, i) => i).find(
                (i) => (layerOfBrush(tilesetIndex, i) === 2) === (mode === 'layer2'),
              )
              if (firstBlockForMode === undefined) return null
              const isActiveBrush = !eraser && !terrainBrush && brush.tilesetIndex === tilesetIndex
              const currentBlockIndex = isActiveBrush ? brush.blockIndex : firstBlockForMode
              const layer = layerOfBrush(tilesetIndex, currentBlockIndex)
              const priority = priorityOfBrush(tilesetIndex, currentBlockIndex)
              return (
                <div key={tilesetIndex} className="tile-grid">
                  <TileThumb
                    source={ownTilesetPreviews[tilesetIndex]}
                    tileset={tileset}
                    tileIndex={currentBlockIndex}
                    selected={isActiveBrush}
                    borderColor={blockBorderColor(tilesetIndex, currentBlockIndex, layer, priority)}
                    title={`${blockTitle(t.upload.label, tilesetIndex, currentBlockIndex, layer, priority)} — clique pra escolher outro bloco deste conjunto`}
                    onClick={() => setOpenTilesetPicker(tilesetIndex)}
                  />
                </div>
              )
            })}
            {tilesets.map((t, tilesetIndex) => {
              const entry = ownTilesets[tilesetIndex]
              if (!entry.ok || !t.terrainGroups || t.terrainGroups.length === 0) return null
              const { tileset } = entry
              return (
                <div key={`terrain-${tilesetIndex}`} className="stage-tileset-band">
                  <div className="tile-grid">
                    {t.terrainGroups.map((group, groupIndex) => {
                      // Mostra só o grupo de terreno da camada CERTA pro modo atual — nos dois
                      // sentidos (achado real, 2026-10-01: faltava o sentido "Camada 2 escondida no
                      // modo 'Pintar blocos'", que deixava escolher e pintar com ele, corrompendo a
                      // grade — ver mesmo bloqueio/motivo em `applyTerrainAt`).
                      if ((mode === 'layer2') !== (group.layer === 2)) return null
                      const previewBlockIndex = group.roles.fill ?? Object.values(group.roles)[0]
                      if (previewBlockIndex === undefined) return null
                      const selected =
                        !eraser && terrainBrush?.tilesetIndex === tilesetIndex && terrainBrush?.groupIndex === groupIndex
                      return (
                        <TileThumb
                          key={groupIndex}
                          source={ownTilesetPreviews[tilesetIndex]}
                          tileset={tileset}
                          tileIndex={previewBlockIndex}
                          selected={selected}
                          borderColor={TERRAIN_BORDER_COLOR}
                          title={`Terreno "${group.name}" de "${t.upload.label}" — pinte/arraste, a variante certa (borda/canto/preenchimento) é escolhida sozinha pelos vizinhos`}
                          onClick={() => {
                            setTerrainBrush({ tilesetIndex, groupIndex })
                            setEraser(false)
                            setBucketFill(false)
                          }}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </>
        )}

        {mode === 'entities' && (
          <div className="tile-grid">
            <EntityPickerThumb
              baseName={DEFAULT_CHARACTER_SLOT_ID}
              fallbackLabel="J"
              selected={armPlacePlayer}
              title={
                armPlacePlayer
                  ? 'Clique no mapa pra escolher a posição'
                  : entities.player
                    ? 'Mover jogador — clique e depois clique no mapa'
                    : 'Colocar jogador — clique e depois clique no mapa'
              }
              onClick={() => setArmPlacePlayer(true)}
            />
            {ENEMY_SLOTS.map((slot) => (
              <EntityPickerThumb
                key={slot.id}
                baseName={slot.id}
                fallbackLabel={slot.label.charAt(0)}
                title={`Adicionar ${slot.label}`}
                onClick={() => handleAddEnemy(slot.id)}
              />
            ))}
            {DECOR_SLOTS.map((slot) => (
              <EntityPickerThumb
                key={slot.id}
                baseName={slot.id}
                fallbackLabel={slot.label.charAt(0)}
                title={`Adicionar ${slot.label}`}
                onClick={() => handleAddDecor(slot.id)}
              />
            ))}
          </div>
        )}
      </div>

      {backdropPaletteOptions.length > 0 && (
        <div className="stage-backdrop-picker">
          <h4 title="Cor fixa atrás da Camada 2 — só entre as cores que já existem na paleta dos tilesets desta fase, pra garantir consistência visual (não é uma cor livre).">
            Cor de fundo
          </h4>
          <div className="stage-backdrop-swatches">
            {backdropPaletteOptions.map((color, i) => {
              const selected = color[0] === effectiveBackdropColor[0] && color[1] === effectiveBackdropColor[1] && color[2] === effectiveBackdropColor[2]
              return (
                <button
                  key={i}
                  type="button"
                  className={`stage-backdrop-swatch${selected ? ' stage-backdrop-swatch-selected' : ''}`}
                  style={{ backgroundColor: `rgb(${color[0]}, ${color[1]}, ${color[2]})` }}
                  title={`rgb(${color[0]}, ${color[1]}, ${color[2]})`}
                  onClick={() => setBackdropColor(color)}
                />
              )
            })}
          </div>
          <p className="hint">
            O SNES só tem 32 tons por canal (0-31), bem menos que os 256 da paleta web — a cor
            exporta como rgb({backdropColorToSnes5Bit(effectiveBackdropColor).join(', ')}) nativo do
            hardware (canal÷8), arredondado pra rgb({roundTripBackdropColor(effectiveBackdropColor).join(', ')}
            ) na prévia acima, pra não ter surpresa entre o editor e o jogo.
          </p>
        </div>
      )}

      {openTilesetPicker !== null &&
        (() => {
          const tilesetIndex = openTilesetPicker
          const entry = ownTilesets[tilesetIndex]
          if (!entry.ok) return null
          const isActiveBrush =
            (mode === 'paint' || mode === 'layer2') && !eraser && !terrainBrush && brush.tilesetIndex === tilesetIndex
          return (
            <TilePickerModal
              tileset={entry.tileset}
              source={ownTilesetPreviews[tilesetIndex]}
              selectedBlockIndex={isActiveBrush ? brush.blockIndex : null}
              borderColorFor={(blockIndex) =>
                blockBorderColor(tilesetIndex, blockIndex, layerOfBrush(tilesetIndex, blockIndex), priorityOfBrush(tilesetIndex, blockIndex))
              }
              titleFor={(blockIndex) =>
                blockTitle(
                  tilesets[tilesetIndex].upload.label,
                  tilesetIndex,
                  blockIndex,
                  layerOfBrush(tilesetIndex, blockIndex),
                  priorityOfBrush(tilesetIndex, blockIndex),
                )
              }
              visibleIf={(blockIndex) => (mode === 'layer2') === (layerOfBrush(tilesetIndex, blockIndex) === 2)}
              onSelect={(blockIndex) => {
                setBrush({ tilesetIndex, blockIndex })
                setEraser(false)
                setBucketFill(false)
                setTerrainBrush(null)
                // Mantém o modo atual ('paint' OU 'layer2' — este picker só abre a partir de um
                // desses dois, ver o `tile-grid` acima) em vez de forçar 'paint' sempre; senão
                // escolher um bloco no painel da Camada 2 te chutava de volta pro painel principal.
                setOpenTilesetPicker(null)
              }}
              onClose={() => setOpenTilesetPicker(null)}
            />
          )
        })()}

      {mode !== 'layer2' && (
      <div className="stage-viewport-area">
        <div
          ref={viewportRef}
          className="stage-viewport"
          style={{ maxHeight: VIEWPORT_MAX_HEIGHT_PX }}
          onScroll={updateViewportRect}
        >
          <div
            className={`stage-grid-wrapper${mode === 'entities' ? ' stage-grid-wrapper-entities' : ''}`}
            title={
              mode === 'paint'
                ? `Clique/arraste pra pintar — passo do cursor independente do tamanho do bloco. A faixa hachurada nas últimas ${STAGE_HEIGHT_PIXELS - SNES_VISIBLE_HEIGHT_PIXELS}px conta pra colisão, mas o SNES nunca desenha essas linhas.`
                : 'Arraste os marcadores pra mover. Clique num marcador pra editar no painel abaixo.'
            }
          >
            <canvas
              ref={gridCanvasRef}
              className="stage-grid-canvas"
              onMouseDown={handleCanvasMouseDown}
            />
            <div
              className="stage-hidden-region"
              style={{ top: `${HIDDEN_ROWS_TOP_PERCENT}%` }}
              title={`O SNES só mostra ${SNES_VISIBLE_HEIGHT_PIXELS} das ${STAGE_HEIGHT_PIXELS} linhas de altura — o que for pintado aqui embaixo existe pra colisão, mas fica invisível no jogo.`}
            >
              fora da área visível
            </div>
            {entities.player &&
              (() => {
                const pivot = spawnToPivot(entities.player, hitboxByBaseName[DEFAULT_CHARACTER_SLOT_ID])
                return (
                  <button
                    type="button"
                    className={`stage-marker stage-marker-player${
                      selectedEntity?.kind === 'player' ? ' stage-marker-selected' : ''
                    }`}
                    style={{
                      left: `${(pivot.x / stageWidthPx) * 100}%`,
                      top: `${(pivot.y / STAGE_HEIGHT_PIXELS) * 100}%`,
                    }}
                    title="Jogador — arraste pra mover, clique pra editar"
                    onMouseDown={(e) => {
                      if (mode !== 'entities') return
                      e.preventDefault()
                      draggingEntityRef.current = { kind: 'player' }
                      setSelectedEntity({ kind: 'player' })
                    }}
                  >
                    <EntitySpriteIcon
                      baseName={DEFAULT_CHARACTER_SLOT_ID}
                      fallbackLabel="J"
                      scale={GRID_DISPLAY_SCALE}
                    />
                  </button>
                )
              })()}
            {entities.enemies.map((enemy, index) => {
              const baseName = enemyBaseName(enemy)
              const pivot = spawnToPivot(enemy, hitboxByBaseName[baseName])
              return (
                <button
                  key={index}
                  type="button"
                  className={`stage-marker stage-marker-enemy${
                    selectedEntity?.kind === 'enemy' && selectedEntity.index === index ? ' stage-marker-selected' : ''
                  }`}
                  style={{
                    left: `${(pivot.x / stageWidthPx) * 100}%`,
                    top: `${(pivot.y / STAGE_HEIGHT_PIXELS) * 100}%`,
                  }}
                  title={`Inimigo ${index + 1} — arraste pra mover, clique pra editar`}
                  onMouseDown={(e) => {
                    if (mode !== 'entities') return
                    e.preventDefault()
                    draggingEntityRef.current = { kind: 'enemy', index }
                    setSelectedEntity({ kind: 'enemy', index })
                  }}
                >
                  <EntitySpriteIcon baseName={baseName} fallbackLabel={String(index + 1)} scale={GRID_DISPLAY_SCALE} />
                </button>
              )
            })}
            {entities.decorations.map((decor, index) => {
              const baseName = decorBaseName(decor)
              const special = SPECIAL_PROPERTIES.find((s) => s.id === decor.specialPropertyId)
              const specialBadge = special && special.id !== 'none' ? special.label.charAt(0) : null
              const titleBits = [
                `Decoração ${index + 1}`,
                decor.solid ? 'sólido' : null,
                special && special.id !== 'none' ? special.label.toLowerCase() : null,
              ].filter(Boolean)
              return (
                <button
                  key={index}
                  type="button"
                  className={`stage-marker stage-marker-decor${decor.solid ? ' stage-marker-decor-solid' : ''}${
                    selectedEntity?.kind === 'decor' && selectedEntity.index === index ? ' stage-marker-selected' : ''
                  }`}
                  style={{
                    left: `${(decor.x / stageWidthPx) * 100}%`,
                    top: `${(decor.y / STAGE_HEIGHT_PIXELS) * 100}%`,
                  }}
                  title={`${titleBits.join(' — ')} — arraste pra mover, clique pra editar`}
                  onMouseDown={(e) => {
                    if (mode !== 'entities') return
                    e.preventDefault()
                    draggingEntityRef.current = { kind: 'decor', index }
                    setSelectedEntity({ kind: 'decor', index })
                  }}
                >
                  <EntitySpriteIcon
                    baseName={baseName}
                    fallbackLabel={String(index + 1)}
                    scale={GRID_DISPLAY_SCALE}
                    frame={decor.frame}
                  />
                  {specialBadge && (
                    <span className={`stage-marker-special-badge stage-marker-special-badge-${special!.id}`} aria-hidden="true">
                      {specialBadge}
                    </span>
                  )}
                </button>
              )
            })}
            {selectedEntity?.kind === 'enemy' &&
              selectedEnemy?.hasPatrolLimit &&
              (() => {
                const index = selectedEntity.index
                const pivot = spawnToPivot(selectedEnemy, hitboxByBaseName[enemyBaseName(selectedEnemy)])
                const minX = selectedEnemy.x + selectedEnemy.patrolMinOffsetX
                const maxX = selectedEnemy.x + selectedEnemy.patrolMaxOffsetX
                const topPercent = (pivot.y / STAGE_HEIGHT_PIXELS) * 100
                return (
                  <>
                    <div
                      className="stage-patrol-band"
                      style={{
                        left: `${(Math.min(minX, maxX) / stageWidthPx) * 100}%`,
                        top: `${topPercent}%`,
                        width: `${(Math.abs(maxX - minX) / stageWidthPx) * 100}%`,
                      }}
                    />
                    <button
                      type="button"
                      className="stage-patrol-handle"
                      style={{ left: `${(minX / stageWidthPx) * 100}%`, top: `${topPercent}%` }}
                      title="Limite esquerdo da patrulha — arraste (pode passar do inimigo pro outro lado)"
                      onMouseDown={(e) => {
                        if (mode !== 'entities') return
                        e.preventDefault()
                        draggingEntityRef.current = { kind: 'patrolMin', index }
                      }}
                    />
                    <button
                      type="button"
                      className="stage-patrol-handle"
                      style={{ left: `${(maxX / stageWidthPx) * 100}%`, top: `${topPercent}%` }}
                      title="Limite direito da patrulha — arraste"
                      onMouseDown={(e) => {
                        if (mode !== 'entities') return
                        e.preventDefault()
                        draggingEntityRef.current = { kind: 'patrolMax', index }
                      }}
                    />
                  </>
                )
              })()}
          </div>
        </div>
        {(viewportRect.width < 1 || viewportRect.height < 1) && (
          <div className="stage-minimap-wrap">
            <canvas
              ref={minimapCanvasRef}
              className="stage-minimap"
              onClick={handleMinimapClick}
              title="Minimapa da fase inteira — clique pra pular pra essa parte"
            />
            <div
              className="stage-minimap-viewport"
              style={{
                left: `${viewportRect.left * 100}%`,
                top: `${viewportRect.top * 100}%`,
                width: `${viewportRect.width * 100}%`,
                height: `${viewportRect.height * 100}%`,
              }}
            />
          </div>
        )}
      </div>
      )}

      {mode === 'layer2' && (
        <div className="stage-layer2-panel">
          <p className="hint">
            A Camada 2 é só um padrão de fundo (nuvens, morros, decoração) que o hardware REPETE
            sozinho — ela não fica presa numa posição fixa da fase, então não dá pra alinhar nada
            dela com algo específico no chão. Se precisa de algo numa posição EXATA (um poste, uma
            placa), pinte na Camada 1 mesmo, usando um bloco marcado como não-sólido.
          </p>
          <div className="tile-grid">
            <label>
              Largura da Camada 2:{' '}
              <select
                value={layer2WidthTiles}
                onChange={(e) => {
                  const newWidth = Number(e.target.value) as (typeof LAYER2_WIDTH_OPTIONS)[number]
                  if (newWidth < layer2WidthTiles && layer2GridHasContentFromColumn(gridLayer2, layer2WidthTiles, newWidth)) {
                    const ok = window.confirm(
                      `Reduzir de ${layer2WidthTiles} pra ${newWidth} colunas descarta o que foi pintado além da coluna ${newWidth}. Continuar?`,
                    )
                    if (!ok) return
                  }
                  setGridLayer2((prev) => resizeLayer2Grid(prev, layer2WidthTiles, newWidth))
                  setLayer2WidthTiles(newWidth)
                }}
              >
                {LAYER2_WIDTH_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size} colunas
                  </option>
                ))}
              </select>
            </label>
          </div>

          {backgroundTileset && (
            <div className="stage-layer2-background-stamp">
              <p className="hint">
                Fundo salvo pra esta fase: <strong>{backgroundTileset.name}</strong>. Carimbar
                substitui TUDO que já estiver pintado na Camada 2 pela imagem inteira dele. Depois de
                carimbar dá pra continuar pintando por cima com os blocos normais — os dois escrevem
                na MESMA grade, então o que for pintado depois sobrescreve o fundo nesse ponto.
              </p>
              <div className="actions">
                <button type="button" onClick={handleStampBackground}>
                  Carimbar fundo "{backgroundTileset.name}" na Camada 2
                </button>
              </div>
            </div>
          )}

          <div className="stage-viewport-area">
            <div className="stage-viewport" style={{ maxHeight: VIEWPORT_MAX_HEIGHT_PX }}>
              <div className="stage-grid-wrapper" title="Clique/arraste pra pintar o padrão da Camada 2.">
                <canvas ref={layer2CanvasRef} className="stage-grid-canvas" onMouseDown={handleCanvasMouseDown} />
              </div>
            </div>
          </div>

          <p className="hint">Pré-visualização da repetição (o jogo repete esse padrão indefinidamente lado a lado):</p>
          <div className="stage-viewport-area">
            <div className="stage-viewport" style={{ maxHeight: VIEWPORT_MAX_HEIGHT_PX }}>
              <div className="stage-grid-wrapper">
                <canvas ref={layer2PreviewCanvasRef} className="stage-grid-canvas stage-layer2-preview-canvas" />
              </div>
            </div>
          </div>
        </div>
      )}

      {mode === 'entities' && (
        <div className="stage-entity-panel">
          {selectedEntity?.kind === 'player' && entities.player && (
            <div className="sheet-options">
              <strong>Jogador</strong>
              <span className="hint">
                X {entities.player.x}, Y {entities.player.y}
              </span>
              <button type="button" onClick={removePlayer}>
                Remover
              </button>
            </div>
          )}

          {selectedEntity?.kind === 'enemy' && selectedEnemy && (
            <div className="sheet-options">
              <strong>Inimigo {selectedEntity.index + 1}</strong>
              <label>
                Tipo:{' '}
                <select
                  value={
                    ENEMY_SLOTS.find((s) => s.typeIndex === selectedEnemy.typeIndex)?.id ?? DEFAULT_ENEMY_SLOT_ID
                  }
                  onChange={(e) => {
                    const slot = ENEMY_SLOTS.find((s) => s.id === e.target.value)
                    if (slot) updateEnemy(selectedEntity.index, { typeIndex: slot.typeIndex })
                  }}
                >
                  {ENEMY_SLOTS.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.label}
                    </option>
                  ))}
                </select>
              </label>
              <label
                title="Deslocamento em pixels a partir de onde o inimigo foi colocado (pode ser negativo, pro lado esquerdo). Sem isso marcado, o inimigo vira sozinho ao bater numa parede ou perder o chão."
              >
                <input
                  type="checkbox"
                  checked={selectedEnemy.hasPatrolLimit}
                  onChange={(e) => updateEnemy(selectedEntity.index, { hasPatrolLimit: e.target.checked })}
                />{' '}
                Limitar a patrulha
              </label>
              {selectedEnemy.hasPatrolLimit && (
                <>
                  <label>
                    De{' '}
                    <PatrolOffsetInput
                      value={selectedEnemy.patrolMinOffsetX}
                      widthPixels={stageWidthPx}
                      onCommit={(next) =>
                        updateEnemy(selectedEntity.index, {
                          patrolMinOffsetX: Math.min(next, selectedEnemy.patrolMaxOffsetX),
                        })
                      }
                    />
                  </label>
                  <label>
                    até{' '}
                    <PatrolOffsetInput
                      value={selectedEnemy.patrolMaxOffsetX}
                      widthPixels={stageWidthPx}
                      onCommit={(next) =>
                        updateEnemy(selectedEntity.index, {
                          patrolMaxOffsetX: Math.max(next, selectedEnemy.patrolMinOffsetX),
                        })
                      }
                    />
                  </label>
                </>
              )}
              <button type="button" onClick={() => removeEnemy(selectedEntity.index)}>
                Remover este inimigo
              </button>
            </div>
          )}

          {selectedEntity?.kind === 'decor' && selectedDecor && (
            <div className="sheet-options">
              <strong>Decoração {selectedEntity.index + 1}</strong>
              <label>
                Tipo:{' '}
                <select
                  value={DECOR_SLOTS.find((s) => s.typeIndex === selectedDecor.typeIndex)?.id ?? DEFAULT_DECOR_SLOT_ID}
                  onChange={(e) => {
                    const slot = DECOR_SLOTS.find((s) => s.id === e.target.value)
                    if (slot) updateDecor(selectedEntity.index, { typeIndex: slot.typeIndex })
                  }}
                >
                  {DECOR_SLOTS.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.label}
                    </option>
                  ))}
                </select>
              </label>
              <label title="Qual quadro da folha desenhar — cada quadro é uma peça de decoração diferente (ver docs/DATA_FORMAT.md § 3).">
                Quadro:{' '}
                <FrameIndexInput
                  value={selectedDecor.frame}
                  maxFrame={
                    decorFrameCountBySlotId[decorBaseName(selectedDecor)]
                      ? decorFrameCountBySlotId[decorBaseName(selectedDecor)] - 1
                      : undefined
                  }
                  onCommit={(next) => updateDecor(selectedEntity.index, { frame: next })}
                />
                {decorFrameCountBySlotId[decorBaseName(selectedDecor)] > 0 && (
                  <span className="hint"> (de {decorFrameCountBySlotId[decorBaseName(selectedDecor)]})</span>
                )}
              </label>
              <label title="Bloqueia o JOGADOR encostando no retângulo do quadro inteiro (inimigos atravessam — docs/DATA_FORMAT.md § 3, 'Comportamento de objeto'). Sem isso marcado, é decoração pura de sempre.">
                <input
                  type="checkbox"
                  checked={selectedDecor.solid}
                  onChange={(e) => updateDecor(selectedEntity.index, { solid: e.target.checked })}
                />{' '}
                Sólido (bloqueia o jogador)
              </label>
              <label title="Diferente da bandeira POR BLOCO (marcada no editor de Tileset, bloco de Camada 1) — essa aqui é por OBJETO, dispara tocando o retângulo da decoração/sprite. As duas fazem a mesma coisa (terminar a fase) e coexistem; use a que fizer mais sentido pra cada caso.">
                Especial:{' '}
                <select
                  value={selectedDecor.specialPropertyId}
                  onChange={(e) => updateDecor(selectedEntity.index, { specialPropertyId: e.target.value })}
                >
                  {SPECIAL_PROPERTIES.map((special) => (
                    <option key={special.id} value={special.id}>
                      {special.label}
                    </option>
                  ))}
                </select>
              </label>
              <span className="hint">
                X {selectedDecor.x}, Y {selectedDecor.y} (canto superior esquerdo do quadro)
              </span>
              <button type="button" onClick={() => removeDecor(selectedEntity.index)}>
                Remover esta decoração
              </button>
            </div>
          )}
        </div>
      )}

      {!entities.player && <p className="error">Posicione o jogador antes de salvar.</p>}

      {goalWarning && (
        <div className="stage-goal-warning">
          <p className="error">
            {collisionSummary.goal} de {HARDWARE_COLS * HARDWARE_ROWS} células (
            {Math.round((100 * collisionSummary.goal) / (HARDWARE_COLS * HARDWARE_ROWS))}%) vão exportar como
            "bandeira" — isso é bem mais que um goalpost de verdade costuma ocupar. Provavelmente algum
            bloco (talvez o próprio "chão padrão" da fase, usado em toda célula nunca pintada) ficou marcado
            como bandeira sem querer. Confira a aba "Tilesets" antes de salvar.
          </p>
          <label>
            <input
              type="checkbox"
              checked={confirmGoalWarning}
              onChange={(e) => setConfirmGoalWarning(e.target.checked)}
            />{' '}
            Confirmo que é isso mesmo, salvar assim.
          </label>
        </div>
      )}

      {(layer1VramWarning || layer2VramWarning) && (
        <div className="stage-goal-warning">
          <p className="error">
            {layer1VramWarning && (
              <>
                Camada 1 usa {layer1UniqueTiles} blocos de hardware únicos, mas só cabem{' '}
                {VRAM_LAYER1_MAX_UNIQUE_TILES} na VRAM da Anubis para essa camada.{' '}
              </>
            )}
            {layer2VramWarning && (
              <>
                Camada 2 usa {layer2UniqueTiles} blocos de hardware únicos, mas só cabem{' '}
                {VRAM_LAYER2_MAX_UNIQUE_TILES} na VRAM da Anubis para essa camada.{' '}
              </>
            )}
            A Anubis não detecta isso sozinha — os blocos que excederem o limite vão sobrescrever dado
            adjacente em silêncio dentro do jogo. Reduza a variedade de blocos únicos (reaproveite blocos
            entre trechos da fase) antes de salvar.
          </p>
          <label>
            <input
              type="checkbox"
              checked={confirmVramWarning}
              onChange={(e) => setConfirmVramWarning(e.target.checked)}
            />{' '}
            Confirmo que é isso mesmo, salvar assim.
          </label>
        </div>
      )}

      {layer2WidthWarning && (
        <div className="stage-goal-warning">
          <p className="error">
            A Camada 2 está com {layer2WidthTiles} colunas de largura, mas a Anubis só repete as primeiras{' '}
            {LAYER2_MAX_USEFUL_WIDTH_TILES} colunas dentro do jogo — o resto nunca vai aparecer, é espaço
            desperdiçado. Reduza a largura pra {LAYER2_MAX_USEFUL_WIDTH_TILES} colunas (ou menos) na aba da
            Camada 2 antes de salvar.
          </p>
          <label>
            <input
              type="checkbox"
              checked={confirmLayer2WidthWarning}
              onChange={(e) => setConfirmLayer2WidthWarning(e.target.checked)}
            />{' '}
            Confirmo que é isso mesmo, salvar assim.
          </label>
        </div>
      )}

      <div className="actions">
        <button
          type="button"
          onClick={handleSave}
          disabled={
            saving ||
            build.state.status === 'running' ||
            !entities.player ||
            !hardwareCombined.ok ||
            (goalWarning && !confirmGoalWarning) ||
            ((layer1VramWarning || layer2VramWarning) && !confirmVramWarning) ||
            (layer2WidthWarning && !confirmLayer2WidthWarning)
          }
          title={
            !entities.player
              ? 'Posicione o jogador antes de salvar.'
              : !hardwareCombined.ok
                ? 'Resolva o erro nos tilesets antes de salvar.'
                : goalWarning && !confirmGoalWarning
                  ? 'Marque a confirmação acima antes de salvar com essa proporção de bandeira.'
                  : (layer1VramWarning || layer2VramWarning) && !confirmVramWarning
                    ? 'Marque a confirmação acima antes de salvar excedendo o orçamento de VRAM.'
                    : layer2WidthWarning && !confirmLayer2WidthWarning
                      ? 'Marque a confirmação acima antes de salvar com a Camada 2 mais larga que o útil.'
                      : undefined
          }
        >
          {saving ? 'Salvando...' : 'Salvar fase no jogo'}
        </button>
      </div>
      {saveResults.map(({ name, result }) =>
        result.ok ? (
          <p key={name} className="success">
            Salvo em {result.path}
          </p>
        ) : (
          <p key={name} className="error">
            {name}: {result.message}
          </p>
        ),
      )}
      <BuildStatus state={build.state} />
    </div>
  )
}
