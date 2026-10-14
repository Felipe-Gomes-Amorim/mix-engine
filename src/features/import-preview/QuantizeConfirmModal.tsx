import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { quantizeImageData } from '../../lib/quantizePalette'
import type { QuantizeOffer } from './quantizeFlow'

/** Fator de ampliação da prévia (pixel-art pequena fica minúscula em 1:1) — mesmo espírito de
 * `TILE_THUMB_SIZE` em outros lugares do app, só que aqui o tamanho de origem varia (qualquer
 * imagem importada), então é um multiplicador, não um tamanho fixo. */
const PREVIEW_SCALE = 4
const PREVIEW_MAX_SIZE = 256

function PreviewCanvas({ width, height, data }: { width: number; height: number; data: Uint8ClampedArray }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const scale = Math.min(PREVIEW_SCALE, Math.max(1, Math.floor(PREVIEW_MAX_SIZE / Math.max(width, height))))
    canvas.width = width * scale
    canvas.height = height * scale
    ctx.imageSmoothingEnabled = false
    const offscreen = document.createElement('canvas')
    offscreen.width = width
    offscreen.height = height
    const offCtx = offscreen.getContext('2d')
    if (!offCtx) return
    offCtx.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0)
    ctx.drawImage(offscreen, 0, 0, width, height, 0, 0, canvas.width, canvas.height)
  }, [width, height, data])
  return <canvas ref={ref} />
}

/**
 * Modal de confirmação da quantização automática de paleta (docs/PROGRESS.md, "quantização
 * automática de paleta", 2026-09-25) — pedido explícito do usuário: NUNCA aplicar automático/
 * silencioso (é destrutivo/lossy), sempre com prévia antes/depois e confirmação explícita. Mesmo
 * padrão visual de modal de `TilePickerModal` (StageSession.tsx): portal pro `document.body`,
 * fecha clicando fora ou no "×" (equivalente a cancelar).
 */
export function QuantizeConfirmModal({
  offer,
  onConfirm,
  onCancel,
}: {
  offer: QuantizeOffer
  onConfirm: (imageData: ImageData) => void
  onCancel: () => void
}) {
  const result = useMemo(() => quantizeImageData(offer.imageData, offer.maxColors), [offer])

  return createPortal(
    <div className="tile-picker-backdrop" onClick={onCancel}>
      <div className="tile-picker-modal quantize-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="tile-picker-modal-close" onClick={onCancel} title="Cancelar">
          ×
        </button>
        <h3>Reduzir cores automaticamente?</h3>
        <p className="hint">
          Essa imagem usa {offer.colorCount} cores{offer.hasTransparency ? ' (contando a transparência)' : ''}, mas o
          SNES aceita no máximo 16. Reduzir automaticamente deixaria só {result.quantizedColorCount} cores opacas —
          é uma operação COM PERDA (cores parecidas viram uma só) e não pode ser desfeita depois de confirmada, mas
          a imagem original no seu disco não é alterada, só o que for importado agora.
        </p>
        <div className="quantize-preview-pair">
          <div>
            <p className="hint">Antes ({offer.colorCount} cores)</p>
            <PreviewCanvas width={offer.imageData.width} height={offer.imageData.height} data={offer.imageData.data} />
          </div>
          <div>
            <p className="hint">Depois ({result.quantizedColorCount} cores)</p>
            <PreviewCanvas width={result.width} height={result.height} data={result.data} />
          </div>
        </div>
        <div className="actions">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(new ImageData(result.data as Uint8ClampedArray<ArrayBuffer>, result.width, result.height))}
          >
            Reduzir e usar esta versão
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
