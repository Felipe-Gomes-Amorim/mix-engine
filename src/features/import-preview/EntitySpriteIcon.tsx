import { useEffect, useRef, useState } from 'react'
import { loadCharacterFrame, loadCharacterIdleSprite, type CharacterThumbnail } from './loadCharacter'

interface EntitySpriteIconProps {
  baseName: string
  /** Mostrado enquanto o sprite carrega e se a reconstrução falhar (arquivo ausente/corrompido) —
   * mesmo texto que o marcador mostrava antes disso existir ("J", "1", "2"...). */
  fallbackLabel: string
  /** Mesma escala do canvas da fase (`GRID_DISPLAY_SCALE` em StageEditor.tsx) — desenha o sprite
   * no tamanho de EXIBIÇÃO verdadeiro (não encolhido pra caber num círculo pequeno), pra bater de
   * verdade com o tamanho que os blocos pintados aparecem ao lado. Achado do usuário: além da
   * posição, o sprite também precisa "corresponder perfeitamente" ao que aparece no jogo. */
  scale: number
  /** Quadro ESPECÍFICO a mostrar (decor1, docs/DATA_FORMAT.md § 3: "cada quadro da folha é uma
   * peça de decoração diferente") em vez do quadro "idle" — ausente pros marcadores de
   * jogador/inimigo, que continuam usando `loadCharacterIdleSprite`. */
  frame?: number
}

type IconResult =
  | { baseName: string; frame: number | undefined; status: 'ready'; thumb: CharacterThumbnail }
  | { baseName: string; frame: number | undefined; status: 'error' }

/**
 * Ícone do quadro "idle" de `baseName` (hero ou um slot de inimigo, ver
 * characterSlots.ts/enemySlots.ts) pros marcadores de jogador/inimigo no
 * editor de fase (StageEditor.tsx) — pedido do usuário: usar o sprite de
 * verdade em vez de um ícone com letra genérico. Mesmo padrão assíncrono de
 * `CharacterThumbnail.tsx` (usado na galeria "Personagens já salvos"), só
 * que reconstruindo o quadro "idle" (`loadCharacterIdleSprite`) em vez do
 * quadro 0 fixo, e cai pro texto de fallback (não um placeholder mudo) se a
 * reconstrução falhar, já que aqui o marcador precisa continuar
 * identificável mesmo sem sprite.
 *
 * `baseName` pode mudar num marcador de inimigo já montado (o usuário troca
 * o "Tipo:" no painel lateral sem soltar/reafundar o marcador) — por isso o
 * resultado guarda o `baseName` a que pertence: `isCurrent` (comparado
 * durante o render, não dentro do efeito) cobre a troca sem precisar de um
 * `setState` síncrono só pra "resetar pra loading".
 */
export function EntitySpriteIcon({ baseName, fallbackLabel, scale, frame }: EntitySpriteIconProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [result, setResult] = useState<IconResult | null>(null)
  const isCurrent = result?.baseName === baseName && result?.frame === frame

  useEffect(() => {
    let cancelled = false
    const promise = frame === undefined ? loadCharacterIdleSprite(baseName) : loadCharacterFrame(baseName, frame)
    promise.then(
      (thumb) => {
        if (!cancelled) setResult({ baseName, frame, status: 'ready', thumb })
      },
      () => {
        if (!cancelled) setResult({ baseName, frame, status: 'error' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [baseName, frame])

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

    // Tamanho de exibição VERDADEIRO (frame x escala do canvas da fase) — não encolhido pra caber
    // num círculo pequeno (era o que CharacterThumbnail faz, certo pra galeria, errado aqui: o
    // usuário precisa ver o sprite do mesmo jeito/tamanho que ele aparece plantado sobre os blocos
    // pintados ao lado, senão a posição "parece" errada mesmo estando certa).
    canvas.width = thumb.width * scale
    canvas.height = thumb.height * scale
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(offscreen, 0, 0, thumb.width, thumb.height, 0, 0, canvas.width, canvas.height)
  }, [isCurrent, result, scale])

  if (!isCurrent || result?.status !== 'ready') {
    return (
      <span className="entity-sprite-fallback" aria-hidden="true">
        {fallbackLabel}
      </span>
    )
  }
  return <canvas ref={canvasRef} className="entity-sprite-icon" aria-hidden="true" />
}
