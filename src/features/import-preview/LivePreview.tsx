import { useEffect, useMemo, useRef, useState } from 'react'
import type { RgbColor } from '../../lib/indexedBmp'
import { composeFrame } from '../../lib/metasprite/compose'
import { hitboxLeft, type Hitbox } from '../../lib/metasprite/hitbox'
import { composedToRgba } from '../../lib/metasprite/render'
import type { MetaspriteSheet } from '../../lib/metasprite/types'
import { formatDuration } from './animationSequence'

export interface PreviewAnimation {
  name: string
  frameIndices: number[]
  frameDuration: number
}

export interface PreviewTarget {
  value: string
  label: string
}

interface LivePreviewProps {
  sheet: MetaspriteSheet
  palette: RgbColor[]
  /** Quadro selecionado na grade (mostrado quando nenhuma animação está escolhida). */
  selectedFrame: number
  /** Opções do seletor "Mostrar" (primeira = quadro selecionado). */
  targets: PreviewTarget[]
  target: string
  onTargetChange: (value: string) => void
  /** Animação correspondente ao `target` (null = quadro parado). */
  animation: PreviewAnimation | null
  /** Caixa de colisão (1 por sheet), ancorada nos pés: base no ponto de apoio, centrada nele. */
  hitbox: Hitbox
  /** false = valores inválidos: o contorno vira vermelho tracejado (usa valores limitados ao quadro). */
  hitboxValid: boolean
  onHitboxChange: (hitbox: Hitbox) => void
}

const SKY = '#8fc9ff'
const GROUND = '#5f9a3d'
const GROUND_EDGE = '#3f6b25'
const HITBOX_COLOR = '#ff2d55'
const HANDLE_RADIUS = 9

/** Modo de arrasto: `w` = -1 (borda esquerda), +1 (direita), 0 (não muda a largura); `h` = muda a altura. */
interface DragMode {
  w: -1 | 0 | 1
  h: boolean
}

/** Alças da caixa de colisão (canto/meio das bordas de cima e dos lados; a base é o pivô e não muda). */
function hitboxHandles(left: number, right: number, top: number, bottom: number) {
  return [
    { x: (left + right) / 2, y: top, mode: { w: 0, h: true } as DragMode, cursor: 'ns-resize' },
    { x: right, y: (top + bottom) / 2, mode: { w: 1, h: false } as DragMode, cursor: 'ew-resize' },
    { x: left, y: (top + bottom) / 2, mode: { w: -1, h: false } as DragMode, cursor: 'ew-resize' },
    { x: right, y: top, mode: { w: 1, h: true } as DragMode, cursor: 'nesw-resize' },
    { x: left, y: top, mode: { w: -1, h: true } as DragMode, cursor: 'nwse-resize' },
  ]
}

/**
 * Prévia ao vivo: redesenha o personagem a partir das PEÇAS que vão pro
 * jogo (não da imagem original), então mostra exatamente o resultado do que
 * está sendo configurado — quadro, ponto de apoio, espelhamento, animação e
 * caixa de colisão. O ponto de apoio fica fixo no centro da tela de prévia,
 * sobre o "chão". A caixa de colisão é ancorada nele (não muda de posição,
 * só de tamanho): arraste as alças pra redimensionar.
 */
export function LivePreview({
  sheet,
  palette,
  selectedFrame,
  targets,
  target,
  onTargetChange,
  animation,
  hitbox,
  hitboxValid,
  onHitboxChange,
}: LivePreviewProps) {
  const [mirror, setMirror] = useState(false)
  const [guides, setGuides] = useState(true)
  const [showHitbox, setShowHitbox] = useState(true)
  const [playing, setPlaying] = useState(true)
  const [stepState, setStepState] = useState({ target, step: 0 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drag = useRef<DragMode | null>(null)

  const length = animation ? animation.frameIndices.length : 0
  const step = animation && stepState.target === target ? stepState.step % length : 0

  useEffect(() => {
    if (!animation || !playing || length < 2) return
    const ms = Math.max(16, (animation.frameDuration * 1000) / 60)
    const id = setInterval(() => {
      setStepState((prev) => ({
        target,
        step: ((prev.target === target ? prev.step : 0) + 1) % length,
      }))
    }, ms)
    return () => clearInterval(id)
  }, [animation, playing, length, target])

  const frameIndex = animation ? animation.frameIndices[step] : selectedFrame
  const frame = sheet.frames[frameIndex] ?? sheet.frames[0]

  const rgba = useMemo(
    () => composedToRgba(composeFrame(frame, sheet.tileSheet, sheet.frameWidth, sheet.frameHeight, mirror), palette),
    [frame, sheet.tileSheet, sheet.frameWidth, sheet.frameHeight, mirror, palette],
  )

  const bufferW = sheet.frameWidth * 2
  const bufferH = sheet.frameHeight * 2
  const zoom = Math.max(2, Math.floor(256 / Math.max(bufferW, bufferH)))
  const midX = (bufferW * zoom) / 2
  const midY = (bufferH * zoom) / 2

  // Caixa de colisão em coordenadas do canvas (valores limitados ao quadro, pra desenhar mesmo inválida).
  const boxW = Math.min(sheet.frameWidth, Math.max(1, Math.round(hitbox.width) || 1))
  const boxH = Math.min(sheet.frameHeight, Math.max(1, Math.round(hitbox.height) || 1))
  const boxLeftPx = midX + hitboxLeft(boxW) * zoom
  const boxRightPx = boxLeftPx + boxW * zoom
  const boxTopPx = midY - boxH * zoom
  const handles = hitboxHandles(boxLeftPx, boxRightPx, boxTopPx, midY)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    canvas.width = bufferW * zoom
    canvas.height = bufferH * zoom

    ctx.fillStyle = SKY
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = GROUND
    ctx.fillRect(0, midY, canvas.width, canvas.height - midY)
    ctx.fillStyle = GROUND_EDGE
    ctx.fillRect(0, midY, canvas.width, Math.max(2, zoom))

    const buffer = document.createElement('canvas')
    buffer.width = bufferW
    buffer.height = bufferH
    buffer
      .getContext('2d')
      ?.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, bufferW, bufferH), 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(buffer, 0, 0, canvas.width, canvas.height)

    if (showHitbox) {
      ctx.strokeStyle = HITBOX_COLOR
      ctx.fillStyle = 'rgba(255, 45, 85, 0.12)'
      ctx.lineWidth = 2
      ctx.setLineDash(hitboxValid ? [] : [5, 4])
      ctx.fillRect(boxLeftPx, boxTopPx, boxW * zoom, boxH * zoom)
      ctx.strokeRect(boxLeftPx, boxTopPx, boxW * zoom, boxH * zoom)
      ctx.setLineDash([])
      for (const handle of hitboxHandles(boxLeftPx, boxRightPx, boxTopPx, midY)) {
        ctx.fillStyle = '#ffffff'
        ctx.strokeStyle = '#000000'
        ctx.lineWidth = 1
        ctx.fillRect(handle.x - 4, handle.y - 4, 8, 8)
        ctx.strokeRect(handle.x - 4.5, handle.y - 4.5, 9, 9)
      }
    }

    if (guides) {
      for (const [color, stroke] of [
        ['rgba(0, 0, 0, 0.85)', 4],
        ['#ffe600', 2],
      ] as const) {
        ctx.strokeStyle = color
        ctx.lineWidth = stroke
        ctx.beginPath()
        ctx.moveTo(midX - 9, midY)
        ctx.lineTo(midX + 9, midY)
        ctx.moveTo(midX, midY - 9)
        ctx.lineTo(midX, midY + 9)
        ctx.stroke()
      }
    }
  }, [rgba, bufferW, bufferH, zoom, midX, midY, guides, showHitbox, hitboxValid, boxW, boxH, boxLeftPx, boxRightPx, boxTopPx])

  function toCanvasPoint(event: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    return [
      ((event.clientX - rect.left) * canvas.width) / rect.width,
      ((event.clientY - rect.top) * canvas.height) / rect.height,
    ]
  }

  function handleAt(x: number, y: number) {
    if (!showHitbox) return null
    return handles.find((h) => Math.hypot(x - h.x, y - h.y) <= HANDLE_RADIUS) ?? null
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const [x, y] = toCanvasPoint(event)
    const handle = handleAt(x, y)
    if (!handle) return
    drag.current = handle.mode
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const [x, y] = toCanvasPoint(event)
    const mode = drag.current
    if (!mode) {
      event.currentTarget.style.cursor = handleAt(x, y)?.cursor ?? 'default'
      return
    }
    const clamp = (v: number, max: number) => Math.min(max, Math.max(1, Math.round(v)))
    onHitboxChange({
      width: mode.w === 0 ? boxW : clamp((2 * mode.w * (x - midX)) / zoom, sheet.frameWidth),
      height: mode.h ? clamp((midY - y) / zoom, sheet.frameHeight) : boxH,
    })
  }

  function handlePointerUp() {
    drag.current = null
  }

  return (
    <div className="live-preview">
      <h3>Prévia — como fica no jogo</h3>
      <canvas
        ref={canvasRef}
        className="live-preview-canvas"
        aria-label="Prévia do personagem"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <p className="hint">
        {animation
          ? `Quadro ${frame.index} (${step + 1} de ${length}) · ${formatDuration(animation.frameDuration)} por quadro`
          : `Quadro ${frame.index}`}
      </p>

      <div className="preview-controls">
        <label>
          Mostrar:{' '}
          <select value={target} onChange={(e) => onTargetChange(e.target.value)}>
            {targets.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {animation && length > 1 && (
          <button type="button" onClick={() => setPlaying((p) => !p)}>
            {playing ? '⏸ Pausar' : '▶ Reproduzir'}
          </button>
        )}
        <label>
          <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />{' '}
          Virar para o outro lado
        </label>
        <label>
          <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} />{' '}
          Mostrar ponto de apoio e chão
        </label>
        <label>
          <input
            type="checkbox"
            checked={showHitbox}
            onChange={(e) => setShowHitbox(e.target.checked)}
          />{' '}
          Mostrar caixa de colisão (<span className="legend legend-hitbox">vermelho</span>)
        </label>
      </div>
      <p className="hint">
        Se o personagem aparecer cortado ou fora do lugar aqui, ajuste o tamanho do quadro ou o
        ponto de apoio — a prévia atualiza na hora. Arraste as alças brancas da caixa de colisão
        para mudar o tamanho dela.
      </p>
    </div>
  )
}
