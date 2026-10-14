import { useEffect, useState } from 'react'

/** Carrega uma data URL num HTMLImageElement (null enquanto não terminou). */
export function useLoadedImage(dataUrl: string): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<{ url: string; img: HTMLImageElement } | null>(null)

  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (!cancelled) setLoaded({ url: dataUrl, img })
    }
    img.src = dataUrl
    return () => {
      cancelled = true
    }
  }, [dataUrl])

  return loaded && loaded.url === dataUrl ? loaded.img : null
}
