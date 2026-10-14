import { useEffect, useRef, useState } from 'react'
import { composedToRgba } from '../../lib/metasprite/render'
import { loadBackgroundAsset } from './loadBackground'

interface BackgroundThumbnailProps {
  name: string
}

/** Mesmo espírito de TilesetThumbnail.tsx (tamanho de exibição, upscale nearest-neighbor). */
const DISPLAY_SIZE = 40

type ThumbnailStatus = 'loading' | 'ready' | 'error'

/** Miniatura da imagem de um Fundo já salvo, pra "Fundos já salvos" (SavedBackgrounds.tsx). */
export function BackgroundThumbnail({ name }: BackgroundThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<ThumbnailStatus>('loading')

  useEffect(() => {
    let cancelled = false
    loadBackgroundAsset(name).then(
      (background) => {
        if (cancelled) return
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx) return
        const rgba = composedToRgba(
          { width: background.width, height: background.height, originX: 0, originY: 0, pixels: background.indices },
          background.palette,
        )
        const offscreen = document.createElement('canvas')
        offscreen.width = background.width
        offscreen.height = background.height
        const offCtx = offscreen.getContext('2d')
        if (!offCtx) return
        offCtx.putImageData(new ImageData(rgba, background.width, background.height), 0, 0)

        const scale = Math.max(1, Math.round(DISPLAY_SIZE / Math.max(background.width, background.height)))
        canvas.width = background.width * scale
        canvas.height = background.height * scale
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(offscreen, 0, 0, background.width, background.height, 0, 0, canvas.width, canvas.height)
        setStatus('ready')
      },
      () => {
        if (!cancelled) setStatus('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [name])

  if (status === 'error') {
    return <span className="character-thumb character-thumb-placeholder" aria-hidden="true" />
  }
  return <canvas ref={canvasRef} className="character-thumb" aria-hidden="true" />
}
