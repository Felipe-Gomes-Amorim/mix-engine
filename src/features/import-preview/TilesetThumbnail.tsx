import { useEffect, useRef, useState } from 'react'
import { composedToRgba } from '../../lib/metasprite/render'
import { loadTilesetAsset } from './loadTileset'

interface TilesetThumbnailProps {
  name: string
}

/** Mesmo espírito de CharacterThumbnail.tsx (tamanho de exibição, upscale nearest-neighbor). */
const DISPLAY_SIZE = 40

type ThumbnailStatus = 'loading' | 'ready' | 'error'

/** Miniatura da imagem de um tileset já salvo, pra "Tilesets já salvos" (SavedTilesets.tsx). Cada
 * linha carrega a sua em paralelo; se a leitura falhar, cai pra um placeholder simples em vez de
 * quebrar a linha inteira. */
export function TilesetThumbnail({ name }: TilesetThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<ThumbnailStatus>('loading')

  useEffect(() => {
    let cancelled = false
    loadTilesetAsset(name).then(
      (tileset) => {
        if (cancelled) return
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx) return
        const rgba = composedToRgba(
          { width: tileset.width, height: tileset.height, originX: 0, originY: 0, pixels: tileset.indices },
          tileset.palette,
        )
        const offscreen = document.createElement('canvas')
        offscreen.width = tileset.width
        offscreen.height = tileset.height
        const offCtx = offscreen.getContext('2d')
        if (!offCtx) return
        offCtx.putImageData(new ImageData(rgba, tileset.width, tileset.height), 0, 0)

        const scale = Math.max(1, Math.round(DISPLAY_SIZE / Math.max(tileset.width, tileset.height)))
        canvas.width = tileset.width * scale
        canvas.height = tileset.height * scale
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(offscreen, 0, 0, tileset.width, tileset.height, 0, 0, canvas.width, canvas.height)
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
