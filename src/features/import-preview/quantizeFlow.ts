// Ponte entre a validação de import (validation.ts, só REJEITA) e a quantização automática
// (lib/quantizePalette.ts, pura) — docs/PROGRESS.md, "quantização automática de paleta",
// 2026-09-25. Compartilhado pelos dois pontos reais de upload fresco que podem estourar 16 cores:
// `useImageUpload.ts` (personagem/cenário, ImportPreview.tsx) e `TilesetEditor.tsx` (tileset).
// NÃO se aplica a `loadCharacter.ts`/`loadStage.ts` (reconstrução de algo já salvo — sempre válido
// por construção, nunca precisa disso).

import { extractPalette } from '../../lib/indexedBmp'

export interface QuantizeOffer {
  imageData: ImageData
  /** Cores opacas ÚNICAS que a imagem tem hoje (sempre > `maxColors`, é por isso que a validação
   * rejeitou). */
  colorCount: number
  hasTransparency: boolean
  /** Orçamento de cores OPACAS pra quantizar — 15 quando a imagem tem transparência (reserva o
   * índice 0 pra ela, mesma regra de `extractPalette`), 16 quando não tem. */
  maxColors: number
}

/**
 * Decide se vale oferecer "reduzir cores automaticamente" pra uma imagem que falhou a validação —
 * só faz sentido quando o problema é EXCLUSIVAMENTE cor demais (dimensão fora de múltiplo de 8 não
 * tem quantização que resolva; nesse caso devolve `null`, e a tela mostra só o erro normal pedindo
 * pra ajustar o tamanho num editor de imagem).
 */
export function detectQuantizeOffer(imageData: ImageData): QuantizeOffer | null {
  if (imageData.width % 8 !== 0 || imageData.height % 8 !== 0) return null
  const extraction = extractPalette(imageData, 16)
  if (extraction.ok) return null // não devia ter sido chamado se a validação passou, mas não trava
  const maxColors = extraction.hasTransparency ? 15 : 16
  return { imageData, colorCount: extraction.colorCount, hasTransparency: extraction.hasTransparency, maxColors }
}
