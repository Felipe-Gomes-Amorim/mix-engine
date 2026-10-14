import { useEffect, useMemo, useState } from 'react'
import type { ImportedImage } from '../../types/importedImage'
import { encodeIndexedBmp, type RgbColor } from '../../lib/indexedBmp'
import { buildMetasprites, clampPivot } from '../../lib/metasprite/builder'
import { generateMetaspriteHeader } from '../../lib/metasprite/exportHeader'
import { defaultHitbox, defaultHitboxWidth, validateHitbox, type Hitbox } from '../../lib/metasprite/hitbox'
import { findClippedEdges, type FrameEdge } from '../../lib/metasprite/slicer'
import { SLIVER_LIMIT, frameStats } from '../../lib/metasprite/stats'
import {
  DEFAULT_FRAME,
  FRAME_DIMENSIONS,
  FRAME_PRESETS,
  OBJ_TILES_PER_ROW,
  type Pivot,
} from '../../lib/metasprite/types'
import { saveToEngine, type SaveResult } from '../../lib/saveToEngine'
import {
  EMPTY_DRAFT,
  computeFrameGrid,
  type AnimationDraft,
  type AnimationEntry,
} from './animationSequence'
import { AnimationSequencer } from './AnimationSequencer'
import { CHARACTER_SLOTS, DEFAULT_CHARACTER_SLOT_ID } from './characterSlots'
import type { CharacterSummary } from './characterDiscovery'
import type { ProjectSeed } from './loadCharacter'
import { LivePreview, type PreviewAnimation, type PreviewTarget } from './LivePreview'
import { SheetCanvas } from './SheetCanvas'
import { BuildStatus } from './BuildStatus'
import { useEngineBuild } from './useEngineBuild'
import { useLoadedImage } from './useLoadedImage'

interface SpriteSheetEditorProps {
  image: ImportedImage
  /** Índices de cor do sheet (0 = transparente) e paleta — vindos da validação. */
  indices: Uint8Array
  palette: RgbColor[]
  /** Estado inicial ao reabrir um personagem já salvo (ver loadCharacter.ts). Ausente = novo upload. */
  seed?: ProjectSeed
  /** Galeria atual (assets/gfx/ já exportado) — usada só pra saber se o slot escolhido já tem
   * `<base>_tiles.bmp`/`_metasprites.h` salvos, e então liberar o salvamento de animações. */
  characters: CharacterSummary[]
  /** Chamado depois de um salvamento bem-sucedido (personagem ou animações), pra atualizar a galeria. */
  onSaved?: () => void
  /** Chamado sempre que o slot selecionado muda (inicial incluído) — pra `ImportPreview` saber
   * qual personagem excluir da galeria deve limpar esta tela. */
  onSlotChange?: (slotId: string) => void
}

const EDGE_LABEL: Record<FrameEdge, string> = {
  left: 'esquerda',
  right: 'direita',
  top: 'de cima',
  bottom: 'de baixo',
}

/** Cada "espaço de imagem" é um tile 8x8; o bloco básico de sprites do SNES tem 256. */
const MEMORY_CAPACITY = OBJ_TILES_PER_ROW * 16

const SAVINGS_OPTIONS = [
  { value: 1, label: 'Equilibrado (recomendado)' },
  { value: 0, label: 'Menos pedaços (usa mais memória)' },
  { value: 2, label: 'Economizar mais memória' },
  { value: 4, label: 'Máxima economia (mais pedaços)' },
]

/**
 * Editor de personagem animado (docs/DATA_FORMAT.md seção 3), em linguagem
 * simples: tamanho do quadro, ponto de apoio, prévia ao vivo, animações e
 * salvar. Os detalhes de hardware (peças 8x8/16x16, OAM, dedup) ficam em
 * "Opções avançadas".
 */
export function SpriteSheetEditor({
  image,
  indices,
  palette,
  seed,
  characters,
  onSaved,
  onSlotChange,
}: SpriteSheetEditorProps) {
  // Reabrir um personagem salvo (seed) precisa manter o slot de onde ele veio — senão "Salvar"
  // reescreveria o slot errado (ex.: abrir "enemy1" pra editar e acabar sobrescrevendo "hero").
  const [slotId, setSlotId] = useState(seed?.baseName ?? DEFAULT_CHARACTER_SLOT_ID)

  useEffect(() => {
    onSlotChange?.(slotId)
  }, [slotId, onSlotChange])
  // Rastreia só o "salvei agora" desta sessão — cobre o intervalo antes de `characters` (que vem
  // da galeria) atualizar depois do `onSaved()`. Precisa resetar ao trocar de slot: um "true"
  // daqui não pode vazar pra outro slot que ainda não tem `_tiles.bmp` salvo de verdade.
  const [justSavedSheet, setJustSavedSheet] = useState(false)
  const [frameWidth, setFrameWidth] = useState(seed?.frameWidth ?? DEFAULT_FRAME.width)
  const [frameHeight, setFrameHeight] = useState(seed?.frameHeight ?? DEFAULT_FRAME.height)
  const [customFrame, setCustomFrame] = useState(
    () => seed !== undefined && !FRAME_PRESETS.some((p) => p.width === seed.frameWidth && p.height === seed.frameHeight),
  )
  const [quadrantThreshold, setQuadrantThreshold] = useState(1)
  const [dedupe, setDedupe] = useState(true)
  const [objPalette, setObjPalette] = useState(seed?.objPalette ?? 0)
  const [showPieces, setShowPieces] = useState(false)
  const [defaultPivot, setDefaultPivot] = useState<Pivot | null>(null)
  const [pivotOverrides, setPivotOverrides] = useState<Record<number, Pivot>>(() => seed?.pivotOverrides ?? {})
  const [selectedFrame, setSelectedFrame] = useState(0)
  const [animations, setAnimations] = useState<AnimationEntry[]>(() => seed?.animations ?? [])
  const [draft, setDraft] = useState<AnimationDraft>(EMPTY_DRAFT)
  const [previewTarget, setPreviewTarget] = useState('frame')
  const [hitboxOverride, setHitboxOverride] = useState<Hitbox | null>(() => seed?.hitbox ?? null)
  const [saving, setSaving] = useState(false)
  const [saveResults, setSaveResults] = useState<Array<{ name: string; result: SaveResult }>>([])
  const build = useEngineBuild()

  const source = useLoadedImage(image.dataUrl)
  const grid = computeFrameGrid(image.width, image.height, frameWidth, frameHeight)
  // Base FIXA do slot (docs/DATA_FORMAT.md § 3 "Slot do personagem principal") — não vem do
  // nome do arquivo importado: reexportar sob qualquer nome de imagem sempre substitui o slot.
  const baseName = slotId
  const slot = CHARACTER_SLOTS.find((s) => s.id === slotId) ?? CHARACTER_SLOTS[0]
  // O jogo pode exigir `<base>_tiles.pic` incondicionalmente no Makefile (é o caso do `hero` e
  // pode passar a ser de outros slots, ex. `enemy1`) — sem o `_tiles.bmp`/`_metasprites.h` desse
  // slot salvos pelo menos uma vez, `make` quebra com "No rule to make target". Por isso
  // "Salvar animações no jogo" fica bloqueado até o personagem em si já ter sido salvo.
  const sheetSavedOnDisk = justSavedSheet || characters.some((c) => c.baseName === baseName)

  const sheet = useMemo(
    () =>
      grid.divisible
        ? buildMetasprites(indices, image.width, image.height, {
            frameWidth,
            frameHeight,
            slice: { quadrantThreshold },
            dedupe,
            palette: objPalette,
            defaultPivot: defaultPivot ?? undefined,
            pivotOverrides,
          })
        : null,
    [grid.divisible, indices, image.width, image.height, frameWidth, frameHeight, quadrantThreshold, dedupe, objPalette, defaultPivot, pivotOverrides],
  )

  const clipped = useMemo(() => {
    const map = new Map<number, FrameEdge[]>()
    if (!sheet) return map
    for (const frame of sheet.frames) {
      const edges = findClippedEdges(
        indices,
        image.width,
        image.height,
        frame.col * frameWidth,
        frame.row * frameHeight,
        frameWidth,
        frameHeight,
      )
      if (edges.length > 0) map.set(frame.index, edges)
    }
    return map
  }, [sheet, indices, image.width, image.height, frameWidth, frameHeight])
  const clippedFrames = useMemo(() => new Set(clipped.keys()), [clipped])

  const stats = useMemo(
    () => (sheet ? sheet.frames.map((frame) => frameStats(frame, frameHeight)) : []),
    [sheet, frameHeight],
  )

  const selected = sheet ? sheet.frames[Math.min(selectedFrame, sheet.frames.length - 1)] : null

  // Caixa de colisão: sugestão automática (largura ~75% do quadro; altura do ponto de apoio ao topo
  // do desenho) até o usuário mexer; depois vale o valor dele.
  const autoHitbox = useMemo<Hitbox>(
    () =>
      sheet
        ? defaultHitbox(indices, image.width, frameWidth, frameHeight, sheet.frames)
        : { width: defaultHitboxWidth(frameWidth), height: frameHeight },
    [sheet, indices, image.width, frameWidth, frameHeight],
  )
  const hitbox = hitboxOverride ?? autoHitbox
  const hitboxErrors = validateHitbox(hitbox, frameWidth, frameHeight)

  const targets: PreviewTarget[] = [
    { value: 'frame', label: `Quadro selecionado (${selected?.index ?? 0})` },
    ...(draft.frames.length > 0 ? [{ value: 'draft', label: 'Animação em montagem' }] : []),
    ...animations.map((anim) => ({ value: anim.name, label: `Animação: ${anim.name}` })),
  ]
  const target = targets.some((t) => t.value === previewTarget) ? previewTarget : 'frame'
  const previewAnimation: PreviewAnimation | null =
    target === 'draft'
      ? { name: 'em montagem', frameIndices: draft.frames, frameDuration: draft.speed > 0 ? draft.speed : 8 }
      : (animations.find((anim) => anim.name === target) ?? null)

  /** Mexeu em algo: o resultado do último salvamento/compilação já não vale. */
  function clearResults() {
    setSaveResults([])
    build.reset()
  }

  function handleFrameChange(width: number, height: number, custom: boolean) {
    setFrameWidth(width)
    setFrameHeight(height)
    setCustomFrame(custom)
    setDefaultPivot(null)
    setPivotOverrides({})
    setSelectedFrame(0)
    setAnimations([])
    setDraft(EMPTY_DRAFT)
    setPreviewTarget('frame')
    setHitboxOverride(null)
    clearResults()
  }

  function changeHitboxReset() {
    setHitboxOverride(null)
    clearResults()
  }

  function changeHitbox(next: Hitbox) {
    setHitboxOverride(next)
    clearResults()
  }

  function setFramePivot(index: number, pivot: Pivot) {
    setPivotOverrides((prev) => ({ ...prev, [index]: clampPivot(pivot, frameWidth, frameHeight) }))
    clearResults()
  }

  function handleDraftChange(next: AnimationDraft) {
    if (next.frames.length > draft.frames.length) setPreviewTarget('draft')
    if (next.frames.length === 0 && previewTarget === 'draft') setPreviewTarget('frame')
    setDraft(next)
  }

  async function handleSave() {
    if (!sheet || hitboxErrors.length > 0) return
    setSaving(true)
    clearResults()
    const tilesName = `${baseName}_tiles.bmp`
    const headerName = `${baseName}_metasprites.h`
    const bmp = encodeIndexedBmp(
      sheet.tileSheet.width,
      sheet.tileSheet.height,
      sheet.tileSheet.indices,
      palette,
    )
    const header = generateMetaspriteHeader(sheet, baseName, image.fileName, tilesName, hitbox)
    const results: Array<{ name: string; result: SaveResult }> = []
    results.push({ name: tilesName, result: await saveToEngine(tilesName, bmp) })
    results.push({
      name: headerName,
      result: await saveToEngine(headerName, new Blob([header], { type: 'text/plain' })),
    })
    setSaveResults(results)
    setSaving(false)
    if (results.every(({ result }) => result.ok)) {
      setJustSavedSheet(true)
      onSaved?.()
      await build.run()
    }
  }

  const warnings: string[] = []
  if (sheet) {
    for (const [index, edges] of clipped) {
      warnings.push(
        `Quadro ${index}: o desenho passa da borda ${edges.map((e) => EDGE_LABEL[e]).join(' e ')} ` +
          'e invade o quadro vizinho — a pose provavelmente está cortada. Escolha um tamanho de quadro maior.',
      )
    }
    stats.forEach((s, index) => {
      if (s.overSliverLimit) {
        warnings.push(
          `Quadro ${index}: sprites demais na mesma linha da tela (${s.maxSliversPerScanline} de no máximo ${SLIVER_LIMIT}) — o SNES pode fazer partes sumirem. Simplifique o desenho.`,
        )
      }
    })
    if (sheet.tilesUsed > MEMORY_CAPACITY) {
      warnings.push(
        `O personagem usa ${sheet.tilesUsed} espaços de imagem, mais que os ${MEMORY_CAPACITY} do bloco básico do SNES — o jogo precisará carregá-lo em duas partes.`,
      )
    }
  }

  const fittingPresets = FRAME_PRESETS.filter(
    (preset) => image.width % preset.width === 0 && image.height % preset.height === 0,
  )
  const presetValue = customFrame ? 'custom' : `${frameWidth}x${frameHeight}`
  const memoryPercent = sheet ? Math.round((sheet.tilesUsed / MEMORY_CAPACITY) * 100) : 0

  return (
    <div className="sequencer sheet-editor">
      <h3>Personagem animado</h3>
      <p className="hint">
        Seu desenho tem várias poses (quadros) lado a lado. Escolha o tamanho de cada quadro, ajuste
        o ponto de apoio e acompanhe a prévia ao lado — ela mostra como o personagem vai aparecer no
        jogo.
      </p>

      <div className="sheet-options">
        <label>
          Isso é o:{' '}
          <select
            aria-label="Personagem"
            value={slotId}
            onChange={(e) => {
              setSlotId(e.target.value)
              setJustSavedSheet(false)
            }}
          >
            {CHARACTER_SLOTS.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.label}
              </option>
            ))}
          </select>
        </label>
        <span className="hint">
          Salvar aqui sempre substitui esse personagem no jogo ({baseName}_*), não importa o nome do
          arquivo importado.
        </span>
      </div>

      <div className="editor-layout">
        <div className="editor-main">
      <h4>1. Tamanho de cada quadro</h4>
      <div className="sheet-options">
        <label>
          Cada pose ocupa um retângulo de:{' '}
          <select
            aria-label="Tamanho do quadro"
            value={presetValue}
            onChange={(e) => {
              if (e.target.value === 'custom') {
                handleFrameChange(frameWidth, frameHeight, true)
              } else {
                const [w, h] = e.target.value.split('x').map(Number)
                handleFrameChange(w, h, false)
              }
            }}
          >
            {FRAME_PRESETS.map((preset) => (
              <option key={`${preset.width}x${preset.height}`} value={`${preset.width}x${preset.height}`}>
                {preset.width} × {preset.height} pixels (largura × altura)
              </option>
            ))}
            <option value="custom">Personalizado…</option>
          </select>
        </label>
        {customFrame && (
          <>
            <label>
              Largura{' '}
              <select
                aria-label="Largura do quadro"
                value={frameWidth}
                onChange={(e) => handleFrameChange(Number(e.target.value), frameHeight, true)}
              >
                {FRAME_DIMENSIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} px
                  </option>
                ))}
              </select>
            </label>
            <label>
              Altura{' '}
              <select
                aria-label="Altura do quadro"
                value={frameHeight}
                onChange={(e) => handleFrameChange(frameWidth, Number(e.target.value), true)}
              >
                {FRAME_DIMENSIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} px
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      <p className="hint">
        Cada pose precisa caber inteira no seu quadro (largura × altura). Se aparecer cortada,
        escolha um quadro maior.
      </p>

      {!grid.divisible && (
        <p className="error">
          A imagem ({image.width}×{image.height} pixels) não se divide em quadros de {frameWidth}×
          {frameHeight} pixels certinhos.{' '}
          {fittingPresets.length > 0
            ? `Tamanhos prontos que servem para ela: ${fittingPresets.map((p) => `${p.width} × ${p.height}`).join(', ')}.`
            : 'Escolha "Personalizado…" para definir largura e altura que dividam a imagem, ou ajuste o tamanho da imagem num editor de imagem.'}
        </p>
      )}

          <SheetCanvas
            source={source}
            width={image.width}
            height={image.height}
            frameWidth={frameWidth}
            frameHeight={frameHeight}
            sheet={sheet}
            showPieces={showPieces}
            selectedFrame={selected?.index ?? 0}
            clippedFrames={clippedFrames}
            onSelectFrame={setSelectedFrame}
            onPivotChange={setFramePivot}
          />
          {sheet && (
            <>
              <p className="hint">
                {sheet.cols} × {sheet.rows} = {sheet.frames.length} quadro(s), numerados da esquerda
                para a direita, de cima para baixo. Clique num quadro para selecioná-lo.
              </p>
              <label className="inline-option">
                <input
                  type="checkbox"
                  checked={showPieces}
                  onChange={(e) => setShowPieces(e.target.checked)}
                />{' '}
                Mostrar como o desenho é dividido (
                <span className="legend legend-8">pedaço pequeno</span>{' '}
                <span className="legend legend-16">pedaço grande</span>)
              </label>
            </>
          )}

      {sheet && selected && (
        <>
          <h4>2. Ponto de apoio</h4>
          <p className="hint">
            É o ponto do personagem que fica na posição dele no jogo — normalmente os pés, no meio da
            base. Arraste a cruz amarela no desenho ou digite os valores (em pixels, a partir do
            canto superior esquerdo do quadro).
          </p>
          <div className="sheet-options">
            <strong>Quadro {selected.index}:</strong>
            <label>
              Horizontal{' '}
              <input
                type="number"
                min={0}
                max={frameWidth}
                value={selected.pivot.x}
                onChange={(e) => setFramePivot(selected.index, { ...selected.pivot, x: Number(e.target.value) })}
              />
            </label>
            <label>
              Vertical{' '}
              <input
                type="number"
                min={0}
                max={frameHeight}
                value={selected.pivot.y}
                onChange={(e) => setFramePivot(selected.index, { ...selected.pivot, y: Number(e.target.value) })}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setDefaultPivot(selected.pivot)
                setPivotOverrides({})
              }}
            >
              Usar este em todos os quadros
            </button>
            <button
              type="button"
              onClick={() => {
                setDefaultPivot(null)
                setPivotOverrides({})
              }}
            >
              Restaurar automático (pés no meio da base)
            </button>
          </div>

          <h4>3. Caixa de colisão</h4>
          <p className="hint">
            É a área que vale para as batidas do jogo (pisar em inimigo, andar no chão). Costuma ser
            menor que o desenho, para a colisão não parecer maior que o personagem. Ela fica com a
            base no ponto de apoio e centralizada nele — só o tamanho muda. Arraste as alças brancas
            na prévia ou digite os valores (em pixels).
          </p>
          <div className="sheet-options">
            <label>
              Largura{' '}
              <input
                type="number"
                aria-label="Largura da caixa de colisão"
                min={1}
                max={frameWidth}
                value={Number.isNaN(hitbox.width) ? '' : hitbox.width}
                onChange={(e) => changeHitbox({ ...hitbox, width: Number(e.target.value) })}
              />
            </label>
            <label>
              Altura{' '}
              <input
                type="number"
                aria-label="Altura da caixa de colisão"
                min={1}
                max={frameHeight}
                value={Number.isNaN(hitbox.height) ? '' : hitbox.height}
                onChange={(e) => changeHitbox({ ...hitbox, height: Number(e.target.value) })}
              />
            </label>
            <span className="hint">
              {hitboxOverride
                ? `(sugestão automática: ${autoHitbox.width} × ${autoHitbox.height})`
                : '(sugestão automática)'}
            </span>
            <button type="button" onClick={() => changeHitboxReset()} disabled={!hitboxOverride}>
              Restaurar sugestão
            </button>
          </div>
          {hitboxErrors.length > 0 && (
            <ul className="error-list">
              {hitboxErrors.map((message) => (
                <li key={message} className="error">
                  {message}
                </li>
              ))}
            </ul>
          )}

          {slot.supportsAnimation !== false && (
            <AnimationSequencer
              image={image}
              baseName={baseName}
              requiredAnimationNames={slot.requiredAnimationNames}
              sheetSaved={sheetSavedOnDisk}
              source={source}
              frameWidth={frameWidth}
              frameHeight={frameHeight}
              cols={sheet.cols}
              frameCount={sheet.frames.length}
              animations={animations}
              draft={draft}
              onDraftChange={handleDraftChange}
              onAdd={(animation) => {
                setAnimations((prev) => [...prev, animation])
                setDraft(EMPTY_DRAFT)
                setPreviewTarget(animation.name)
              }}
              onRemove={(name) => {
                setAnimations((prev) => prev.filter((anim) => anim.name !== name))
                if (previewTarget === name) setPreviewTarget('frame')
              }}
              onPreview={setPreviewTarget}
              onSaved={onSaved}
            />
          )}

          <h4>Memória usada</h4>
          <p className="hint">
            O personagem ocupa {sheet.tilesUsed} de {MEMORY_CAPACITY} espaços de imagem do SNES (
            {memoryPercent}%).
            {dedupe ? ' Pedaços repetidos ou espelhados são reaproveitados automaticamente.' : ''}
          </p>
          <progress className="memory-bar" value={sheet.tilesUsed} max={MEMORY_CAPACITY} />

          {warnings.length > 0 && (
            <ul className="error-list">
              {warnings.map((message) => (
                <li key={message} className="warn">
                  {message}
                </li>
              ))}
            </ul>
          )}
          {warnings.length === 0 && hitboxErrors.length === 0 && (
            <p className="success">Tudo certo: nenhum problema encontrado.</p>
          )}

          <div className="actions">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || build.state.status === 'running' || hitboxErrors.length > 0}
              title={hitboxErrors.length > 0 ? 'Corrija a caixa de colisão antes de salvar.' : undefined}
            >
              {saving ? 'Salvando...' : 'Salvar personagem no jogo'}
            </button>
            {hitboxErrors.length > 0 && (
              <span className="error">Corrija a caixa de colisão (passo 3) para poder salvar.</span>
            )}
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

          <details className="advanced">
            <summary>Opções avançadas e detalhes técnicos</summary>
            <div className="sheet-options">
              <label>
                Divisão do desenho em pedaços:{' '}
                <select
                  value={quadrantThreshold}
                  onChange={(e) => setQuadrantThreshold(Number(e.target.value))}
                >
                  {SAVINGS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} />{' '}
                Reaproveitar pedaços repetidos ou espelhados
              </label>
              <label>
                Grupo de cores no jogo:{' '}
                <select value={objPalette} onChange={(e) => setObjPalette(Number(e.target.value))}>
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="hint">
              O SNES desenha personagens juntando pedaços de 8×8 e 16×16 pixels (cada um é uma
              entrada de OAM). O editor divide cada quadro automaticamente: um bloco de 16×16 com
              conteúdo em poucos cantos vira pedaços pequenos (gasta menos memória); senão vira um
              pedaço grande (menos pedaços por quadro).
            </p>
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Quadro</th>
                  <th>Pedaços (OAM)</th>
                  <th>Tiles 8×8</th>
                  <th>Máx. fatias de 8px por linha (limite {SLIVER_LIMIT})</th>
                </tr>
              </thead>
              <tbody>
                {sheet.frames.map((frame, i) => (
                  <tr
                    key={frame.index}
                    className={frame.index === selected.index ? 'selected' : ''}
                    onClick={() => setSelectedFrame(frame.index)}
                  >
                    <td>{frame.index}</td>
                    <td>{stats[i].pieceCount}</td>
                    <td>{stats[i].tiles8x8}</td>
                    <td className={stats[i].overSliverLimit ? 'error' : ''}>
                      {stats[i].maxSliversPerScanline}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">
              Arquivos gerados: {baseName}_tiles.bmp ({sheet.uniqueShapes} forma(s) única(s),{' '}
              {sheet.tileSheet.tileRows} linha(s) de 16 tiles) e {baseName}_metasprites.h.
            </p>
          </details>
        </>
      )}
        </div>

        {sheet && selected && (
          <LivePreview
            sheet={sheet}
            palette={palette}
            selectedFrame={selected.index}
            targets={targets}
            target={target}
            onTargetChange={setPreviewTarget}
            animation={previewAnimation}
            hitbox={hitbox}
            hitboxValid={hitboxErrors.length === 0}
            onHitboxChange={changeHitbox}
          />
        )}
      </div>
    </div>
  )
}
