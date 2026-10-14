// Upload de imagem local + validação (docs/DATA_FORMAT.md seção 1) —
// compartilhado entre ImportPreview.tsx (personagem/cenário) e
// StagesPage.tsx (fase), que precisam exatamente do mesmo comportamento
// de validação. Expõe métodos (`hydrate`/`reportError`), não setters
// crus, mesmo espírito de `useEngineBuild` (`run`/`reset`) — evita
// mexer em `.current` de ref fora do próprio hook.

import { useRef, useState } from 'react'
import type { ImportedImage } from '../../types/importedImage'
import { detectQuantizeOffer, type QuantizeOffer } from './quantizeFlow'
import { readImageFile } from './readImageFile'
import { validateForExport, type ValidationResult } from './validation'

export interface ImageUpload {
  image: ImportedImage | null
  validation: ValidationResult | null
  error: string | null
  inputRef: React.RefObject<HTMLInputElement | null>
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  handleClear: () => void
  /** Hidrata o estado direto, sem passar por upload de verdade — usado pelos fluxos de "reabrir
   * salvo" (loadCharacterProject/loadStageProject). Também limpa o campo de arquivo. */
  hydrate: (image: ImportedImage, validation: ValidationResult) => void
  reportError: (message: string) => void
  /** Presente só quando a validação falhou EXCLUSIVAMENTE por cor demais (docs/PROGRESS.md,
   * "quantização automática de paleta", 2026-09-25) — a tela mostra a oferta de reduzir
   * automaticamente (com confirmação, ver QuantizeConfirmModal) só quando isso não é `null`. */
  quantizeOffer: QuantizeOffer | null
  /** Fecha a oferta sem aplicar nada (cancelar no modal) — a imagem/erro originais continuam. */
  cancelQuantize: () => void
  /** Aplica a imagem já quantizada (confirmada no modal) como se fosse o upload de verdade — troca
   * `image`/`validation`, sempre válida por construção (quantizeImageData garante ≤16 cores). */
  applyQuantized: (imageData: ImageData) => void
}

/** `onChange` roda depois de um upload bem-sucedido, de `hydrate` OU de "Limpar" — pra quem usa o
 * hook resetar o que for específico da tela dele (seed de personagem/fase, resultado de build). */
export function useImageUpload(onChange?: () => void): ImageUpload {
  const [image, setImage] = useState<ImportedImage | null>(null)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [quantizeOffer, setQuantizeOffer] = useState<QuantizeOffer | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    readImageFile(file).then(
      ({ image, imageData }) => {
        setError(null)
        setImage(image)
        const nextValidation = validateForExport(imageData)
        setValidation(nextValidation)
        setQuantizeOffer(nextValidation.ok ? null : detectQuantizeOffer(imageData))
        onChange?.()
      },
      (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
    )
  }

  function handleClear() {
    if (inputRef.current) inputRef.current.value = ''
    setImage(null)
    setValidation(null)
    setError(null)
    setQuantizeOffer(null)
    onChange?.()
  }

  function hydrate(nextImage: ImportedImage, nextValidation: ValidationResult) {
    if (inputRef.current) inputRef.current.value = ''
    setError(null)
    setImage(nextImage)
    setValidation(nextValidation)
    setQuantizeOffer(null)
    onChange?.()
  }

  function reportError(message: string) {
    setError(message)
  }

  function cancelQuantize() {
    setQuantizeOffer(null)
  }

  function applyQuantized(imageData: ImageData) {
    const nextValidation = validateForExport(imageData)
    const canvas = document.createElement('canvas')
    canvas.width = imageData.width
    canvas.height = imageData.height
    canvas.getContext('2d')?.putImageData(imageData, 0, 0)
    setImage((prev) => (prev ? { ...prev, width: imageData.width, height: imageData.height, dataUrl: canvas.toDataURL() } : prev))
    setValidation(nextValidation)
    setQuantizeOffer(null)
    onChange?.()
  }

  return {
    image,
    validation,
    error,
    inputRef,
    handleFileChange,
    handleClear,
    hydrate,
    reportError,
    quantizeOffer,
    cancelQuantize,
    applyQuantized,
  }
}
