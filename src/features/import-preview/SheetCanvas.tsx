import { useEffect, useRef } from 'react'
import type { MetaspriteSheet, Pivot } from '../../lib/metasprite/types'

interface SheetCanvasProps {
  /** Imagem já carregada (null enquanto carrega). */
  source: HTMLImageElement | null
  width: number
  height: number
  frameWidth: number
  frameHeight: number
  /** null = imagem não é múltiplo do frame: só mostra a imagem, sem grade. */
  sheet: MetaspriteSheet | null
  showPieces: boolean
  selectedFrame: number
  /** Frames com pixels vazando pra célula vizinha (contorno vermelho). */
  clippedFrames: ReadonlySet<number>
  onSelectFrame: (index: number) => void
  onPivotChange: (index: number, pivot: Pivot) => void
}

const PIECE_COLORS = {
  8: { stroke: 'rgba(255, 160, 0, 0.95)', fill: 'rgba(255, 160, 0, 0.18)' },
  16: { stroke: 'rgba(0, 220, 90, 0.95)', fill: 'rgba(0, 220, 90, 0.16)' },
} as const

const PIVOT_GRAB_RADIUS = 9

function zoomFor(width: number, height: number): number {
  return Math.max(1, Math.min(8, Math.floor(512 / Math.max(width, height))))
}

/**
 * Sheet com a grade de frames (índices), overlay opcional das peças geradas
 * (8x8 laranja / 16x16 verde) e pivô arrastável de cada frame.
 */
export function SheetCanvas({
  source,
  width,
  height,
  frameWidth,
  frameHeight,
  sheet,
  showPieces,
  selectedFrame,
  clippedFrames,
  onSelectFrame,
  onPivotChange,
}: SheetCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragFrame = useRef<number | null>(null)
  const zoom = zoomFor(width, height)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !source) return

    canvas.width = width * zoom
    canvas.height = height * zoom
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(source, 0, 0, width, height, 0, 0, canvas.width, canvas.height)
    if (!sheet) return

    const sideX = frameWidth * zoom
    const sideY = frameHeight * zoom
    ctx.font = `${Math.max(10, zoom * 3)}px monospace`
    for (const frame of sheet.frames) {
      const ox = frame.col * sideX
      const oy = frame.row * sideY
      const clipped = clippedFrames.has(frame.index)
      const selected = frame.index === selectedFrame

      if (showPieces) {
        for (const piece of frame.pieces) {
          const colors = PIECE_COLORS[piece.size]
          const px = ox + piece.srcX * zoom
          const py = oy + piece.srcY * zoom
          const ps = piece.size * zoom
          ctx.fillStyle = colors.fill
          ctx.fillRect(px, py, ps, ps)
          ctx.strokeStyle = colors.stroke
          ctx.lineWidth = 1
          ctx.strokeRect(px + 0.5, py + 0.5, ps - 1, ps - 1)
        }
      }

      ctx.lineWidth = selected || clipped ? 2 : 1
      ctx.strokeStyle = clipped
        ? 'rgba(255, 40, 40, 0.95)'
        : selected
          ? 'rgba(0, 200, 255, 0.95)'
          : 'rgba(255, 0, 255, 0.85)'
      ctx.strokeRect(ox + 0.5, oy + 0.5, sideX - 1, sideY - 1)
      ctx.fillStyle = ctx.strokeStyle
      ctx.fillText(String(frame.index), ox + 3, oy + 12)

      const cx = ox + frame.pivot.x * zoom
      const cy = oy + frame.pivot.y * zoom
      const arm = selected ? 7 : 5
      for (const [color, stroke] of [
        ['rgba(0, 0, 0, 0.9)', 4],
        [selected ? '#ffffff' : '#ffe600', 2],
      ] as const) {
        ctx.strokeStyle = color
        ctx.lineWidth = stroke
        ctx.beginPath()
        ctx.moveTo(cx - arm, cy)
        ctx.lineTo(cx + arm, cy)
        ctx.moveTo(cx, cy - arm)
        ctx.lineTo(cx, cy + arm)
        ctx.stroke()
      }
    }
  }, [source, width, height, zoom, frameWidth, frameHeight, sheet, showPieces, selectedFrame, clippedFrames])

  function toCanvasPoint(event: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    return [
      ((event.clientX - rect.left) * canvas.width) / rect.width,
      ((event.clientY - rect.top) * canvas.height) / rect.height,
    ]
  }

  function frameAt(x: number, y: number): number | null {
    if (!sheet) return null
    const col = Math.floor(x / (frameWidth * zoom))
    const row = Math.floor(y / (frameHeight * zoom))
    if (col < 0 || row < 0 || col >= sheet.cols || row >= sheet.rows) return null
    return row * sheet.cols + col
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!sheet) return
    const [x, y] = toCanvasPoint(event)
    const index = frameAt(x, y)
    if (index === null) return
    onSelectFrame(index)

    const frame = sheet.frames[index]
    const cx = frame.col * frameWidth * zoom + frame.pivot.x * zoom
    const cy = frame.row * frameHeight * zoom + frame.pivot.y * zoom
    if (Math.hypot(x - cx, y - cy) <= PIVOT_GRAB_RADIUS) {
      dragFrame.current = index
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const index = dragFrame.current
    if (index === null || !sheet) return
    const frame = sheet.frames[index]
    const [x, y] = toCanvasPoint(event)
    const clamp = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v)))
    onPivotChange(index, {
      x: clamp((x - frame.col * frameWidth * zoom) / zoom, frameWidth),
      y: clamp((y - frame.row * frameHeight * zoom) / zoom, frameHeight),
    })
  }

  function handlePointerUp() {
    dragFrame.current = null
  }

  return (
    <canvas
      ref={canvasRef}
      className="frame-grid-canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  )
}
