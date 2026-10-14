import { useEffect, useRef, useState } from 'react'
import { loadCharacterThumbnail } from './loadCharacter'

interface CharacterThumbnailProps {
  baseName: string
}

/** Tamanho de exibição (px) — upscale nearest-neighbor, igual às miniaturas de quadro do editor (ver `FrameThumb` em `AnimationSequencer.tsx`). */
const DISPLAY_SIZE = 40

type ThumbnailStatus = 'loading' | 'ready' | 'error'

/**
 * Miniatura (quadro 0) de um personagem já salvo, pra "Personagens já
 * salvos" (`SavedCharacters.tsx`). Cada linha carrega a sua em paralelo,
 * sem travar a lista — mostra uma caixa vazia enquanto isso. Se a
 * reconstrução falhar (header de formato antigo/inesperado, arquivo
 * corrompido), cai pra um placeholder simples em vez de quebrar a linha
 * inteira (o nome e os botões continuam funcionando normalmente).
 */
export function CharacterThumbnail({ baseName }: CharacterThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<ThumbnailStatus>('loading')

  useEffect(() => {
    // `baseName` nunca muda pra uma instância montada (a `<li key={character.baseName}>` no
    // SavedCharacters.tsx já força um remount novo por personagem), então não precisa resetar
    // `status` aqui — o valor inicial 'loading' do useState já cobre o mount.
    let cancelled = false
    loadCharacterThumbnail(baseName).then(
      (thumb) => {
        if (cancelled) return
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx) return
        const offscreen = document.createElement('canvas')
        offscreen.width = thumb.width
        offscreen.height = thumb.height
        const offCtx = offscreen.getContext('2d')
        if (!offCtx) return
        offCtx.putImageData(new ImageData(thumb.rgba, thumb.width, thumb.height), 0, 0)

        const scale = Math.max(1, Math.round(DISPLAY_SIZE / Math.max(thumb.width, thumb.height)))
        canvas.width = thumb.width * scale
        canvas.height = thumb.height * scale
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(offscreen, 0, 0, thumb.width, thumb.height, 0, 0, canvas.width, canvas.height)
        setStatus('ready')
      },
      () => {
        if (!cancelled) setStatus('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [baseName])

  if (status === 'error') {
    return <span className="character-thumb character-thumb-placeholder" aria-hidden="true" />
  }
  return <canvas ref={canvasRef} className="character-thumb" aria-hidden="true" />
}
