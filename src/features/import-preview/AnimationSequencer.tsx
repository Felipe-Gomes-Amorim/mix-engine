import { useEffect, useRef, useState } from 'react'
import type { ImportedImage } from '../../types/importedImage'
import { saveToEngine, type SaveResult } from '../../lib/saveToEngine'
import { BuildStatus } from './BuildStatus'
import { useEngineBuild } from './useEngineBuild'
import {
  formatDuration,
  generateAnimationHeader,
  SUGGESTED_ANIMATION_NAMES,
  isValidAnimationName,
  sanitizeIdentifier,
  type AnimationDraft,
  type AnimationEntry,
} from './animationSequence'

interface AnimationSequencerProps {
  image: ImportedImage
  /** Base fixa do slot (ex.: "hero") — ver characterSlots.ts. Não vem do nome do arquivo. */
  baseName: string
  /** Nomes que esse slot exige no `_anim.h` (ver `CharacterSlot.requiredAnimationNames`).
   * Vazio = esse slot ainda não tem contrato fixo de nomes — nada é bloqueado. */
  requiredAnimationNames: readonly string[]
  /** Se `<baseName>_tiles.bmp`/`_metasprites.h` já foram salvos pelo menos uma vez. O Makefile da
   * engine pode exigir `<base>_tiles.pic` incondicionalmente (é o caso hoje do `hero`, e pode virar
   * o caso de outros slots) — salvar só a animação sem o desenho existir quebra o build. */
  sheetSaved: boolean
  source: HTMLImageElement | null
  frameWidth: number
  frameHeight: number
  cols: number
  frameCount: number
  animations: AnimationEntry[]
  draft: AnimationDraft
  onDraftChange: (draft: AnimationDraft) => void
  onAdd: (animation: AnimationEntry) => void
  onRemove: (name: string) => void
  onPreview: (name: string) => void
  /** Chamado depois de salvar as animações no jogo, pra atualizar a galeria (a flag "com animação"). */
  onSaved?: () => void
}

function FrameThumb({
  source,
  frameWidth,
  frameHeight,
  col,
  row,
  index,
  onClick,
}: {
  source: HTMLImageElement | null
  frameWidth: number
  frameHeight: number
  col: number
  row: number
  index: number
  onClick: () => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const scale = Math.max(1, Math.round(64 / Math.max(frameWidth, frameHeight)))

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !source) return
    canvas.width = frameWidth * scale
    canvas.height = frameHeight * scale
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(
      source,
      col * frameWidth,
      row * frameHeight,
      frameWidth,
      frameHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    )
  }, [source, frameWidth, frameHeight, col, row, scale])

  return (
    <button type="button" className="frame-thumb" onClick={onClick} title={`Adicionar o quadro ${index}`}>
      <canvas ref={ref} />
      <span>{index}</span>
    </button>
  )
}

function sequenceText(frames: number[]): string {
  return frames.join(' → ')
}

/**
 * Animações (docs/DATA_FORMAT.md seção 3): o usuário clica nos quadros na
 * ordem desejada, dá um nome e um tempo; exporta um `.h` de C. A sequência
 * em montagem é tocada na prévia ao vivo.
 */
export function AnimationSequencer({
  image,
  baseName,
  requiredAnimationNames,
  sheetSaved,
  source,
  frameWidth,
  frameHeight,
  cols,
  frameCount,
  animations,
  draft,
  onDraftChange,
  onAdd,
  onRemove,
  onPreview,
  onSaved,
}: AnimationSequencerProps) {
  const [formError, setFormError] = useState<string | null>(null)
  const [exportResult, setExportResult] = useState<SaveResult | null>(null)
  const [exporting, setExporting] = useState(false)
  const build = useEngineBuild()

  const missingRequired = requiredAnimationNames.filter(
    (name) => !animations.some((anim) => anim.name === name),
  )

  function handleAdd() {
    const name = sanitizeIdentifier(draft.name)
    if (!isValidAnimationName(name)) {
      setFormError('Dê um nome para a animação (letras e números, ex.: andar).')
      return
    }
    if (animations.some((anim) => anim.name === name)) {
      setFormError(`Já existe uma animação chamada "${name}".`)
      return
    }
    if (draft.frames.length === 0) {
      setFormError('Clique nos quadros acima para montar a sequência.')
      return
    }
    if (!Number.isInteger(draft.speed) || draft.speed <= 0) {
      setFormError('O tempo de cada quadro precisa ser um número maior que zero.')
      return
    }
    setFormError(null)
    setExportResult(null)
    build.reset()
    onAdd({ name, frameIndices: draft.frames, frameDuration: draft.speed })
  }

  async function handleExport() {
    if (!sheetSaved || missingRequired.length > 0) return
    setExporting(true)
    setExportResult(null)
    build.reset()
    const header = generateAnimationHeader(
      baseName,
      image.fileName,
      frameWidth,
      frameHeight,
      animations,
    )
    const saved = await saveToEngine(`${baseName}_anim.h`, new Blob([header], { type: 'text/plain' }))
    setExportResult(saved)
    setExporting(false)
    if (saved.ok) {
      onSaved?.()
      await build.run()
    }
  }

  return (
    <div className="sequencer">
      <h3>Animações</h3>
      <p className="hint">
        Uma animação é uma sequência de quadros. Clique nos quadros abaixo na ordem em que devem
        aparecer — a prévia toca a sequência enquanto você monta. Só precisa salvar quando quiser
        atualizar as animações no jogo; até lá, as animações salvas antes continuam valendo.
      </p>

      <datalist id="animation-name-suggestions">
        {SUGGESTED_ANIMATION_NAMES.map(({ name, label }) => (
          <option key={name} value={name} label={label} />
        ))}
      </datalist>

      <div className="frame-strip">
        {Array.from({ length: frameCount }, (_, index) => (
          <FrameThumb
            key={index}
            source={source}
            frameWidth={frameWidth}
            frameHeight={frameHeight}
            col={index % cols}
            row={Math.floor(index / cols)}
            index={index}
            onClick={() => {
              setFormError(null)
              onDraftChange({ ...draft, frames: [...draft.frames, index] })
            }}
          />
        ))}
      </div>

      <p className="draft-sequence">
        {draft.frames.length === 0
          ? 'Nenhum quadro escolhido ainda.'
          : `Sequência: ${sequenceText(draft.frames)}`}
      </p>
      <div className="animation-form">
        <button
          type="button"
          disabled={draft.frames.length === 0}
          onClick={() => onDraftChange({ ...draft, frames: draft.frames.slice(0, -1) })}
        >
          Desfazer último
        </button>
        <button
          type="button"
          disabled={draft.frames.length === 0}
          onClick={() => onDraftChange({ ...draft, frames: [] })}
        >
          Limpar
        </button>
      </div>

      {(() => {
        const nameChips = SUGGESTED_ANIMATION_NAMES.map(({ name, label }) => {
          const used = animations.some((anim) => anim.name === name)
          const required = requiredAnimationNames.includes(name)
          return (
            <button
              key={name}
              type="button"
              className="name-chip"
              disabled={used}
              title={used ? `Já existe uma animação "${name}"` : `${name} — ${label}`}
              onClick={() => onDraftChange({ ...draft, name })}
            >
              {name} ({label}){required ? '*' : ''}
              {used ? ' ✓' : ''}
            </button>
          )
        })
        if (requiredAnimationNames.length === 0) {
          return (
            <p className="hint">
              Esse tipo ainda não tem uma lista fixa de nomes de animação exigida pelo jogo —
              nomeie como quiser (ex.: idle, walk, ataque). Sugestões comuns: {nameChips}
            </p>
          )
        }
        const singular = requiredAnimationNames.length === 1
        return (
          <>
            <p className="hint">
              O jogo procura por {requiredAnimationNames.length}{' '}
              {singular ? 'animação fixa' : 'animações fixas'} pra esse tipo —{' '}
              <strong>{requiredAnimationNames.join(', ')}</strong> (marcada(s) com * abaixo) —{' '}
              {singular ? 'e ela precisa existir' : 'e todas precisam existir'} pra ele compilar
              (se ainda não tiver uma pose própria pra alguma, repita um quadro que já usou em
              outra, como o de "idle"). Clique pra usar um desses nomes: {nameChips} Outros nomes
              além desses também valem, mas são extras — o jogo só ignora os que não conhece.
            </p>
            {missingRequired.length > 0 ? (
              <p className="warn">
                Faltam {missingRequired.length} animação(ões) obrigatória(s): {missingRequired.join(', ')}
                . Sem elas, "Salvar animações no jogo" fica bloqueado.
              </p>
            ) : (
              <p className="success">
                {singular
                  ? 'A animação obrigatória já existe — pode salvar.'
                  : `As ${requiredAnimationNames.length} animações obrigatórias já existem — pode salvar.`}
              </p>
            )}
          </>
        )
      })()}
      <div className="animation-form">
        <input
          type="text"
          list="animation-name-suggestions"
          placeholder="Nome (ex.: walk)"
          aria-label="Nome da animação"
          value={draft.name}
          onChange={(e) => onDraftChange({ ...draft, name: e.target.value })}
        />
        <label>
          Tempo de cada quadro:{' '}
          <input
            type="number"
            min={1}
            aria-label="Tempo de cada quadro"
            value={draft.speed || ''}
            onChange={(e) => onDraftChange({ ...draft, speed: Number(e.target.value) })}
          />{' '}
          <span className="hint">
            (1/60 s cada — {draft.speed > 0 ? `≈ ${formatDuration(draft.speed)}` : '—'})
          </span>
        </label>
        <button type="button" onClick={handleAdd}>
          Salvar animação
        </button>
      </div>

      {formError && <p className="error">{formError}</p>}

      {animations.length > 0 && (
        <ul className="animation-list">
          {animations.map((anim) => (
            <li key={anim.name}>
              <span>
                <strong>{anim.name}</strong> — {sequenceText(anim.frameIndices)} ·{' '}
                {formatDuration(anim.frameDuration)} por quadro
              </span>
              <span className="row-actions">
                <button type="button" onClick={() => onPreview(anim.name)}>
                  Ver na prévia
                </button>
                <button type="button" onClick={() => {
                    build.reset()
                    onRemove(anim.name)
                  }}>
                  Remover
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {!sheetSaved && (
        <p className="warn">
          Salve o personagem primeiro ("Salvar personagem no jogo", acima) — o jogo precisa do
          desenho ({baseName}_tiles.bmp) já existir em disco antes das animações, senão o build
          quebra procurando um arquivo que ainda não existe.
        </p>
      )}

      {animations.length > 0 && (
        <div className="actions">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || build.state.status === 'running' || !sheetSaved || missingRequired.length > 0}
            title={
              !sheetSaved
                ? 'Salve o personagem (desenho) antes de salvar as animações.'
                : missingRequired.length > 0
                  ? `Faltam animações obrigatórias: ${missingRequired.join(', ')}.`
                  : undefined
            }
          >
            {exporting ? 'Salvando...' : 'Salvar animações no jogo'}
          </button>
        </div>
      )}

      {exportResult && exportResult.ok && <p className="success">Salvo em {exportResult.path}</p>}
      {exportResult && !exportResult.ok && <p className="error">{exportResult.message}</p>}
      <BuildStatus state={build.state} />
    </div>
  )
}
