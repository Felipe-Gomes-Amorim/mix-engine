// Lê um File de imagem (input de upload) e devolve tanto os metadados pra exibir
// (`ImportedImage`) quanto o `ImageData` pra validar (`validateForExport`). Extraído de
// `useImageUpload.ts` pra ser reaproveitado também por StagesPage.tsx, que gerencia uma LISTA de
// uploads (até 8 tilesets, docs/DATA_FORMAT.md § 4) — não dá pra chamar o hook `useImageUpload`
// dentro de um loop de tamanho variável (regra dos hooks), então essa parte pura vira uma função
// simples, sem estado.

import type { ImportedImage } from '../../types/importedImage'

export interface ReadImageFileResult {
  image: ImportedImage
  imageData: ImageData
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'))
    reader.readAsDataURL(file)
  })
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Não foi possível ler essa imagem.'))
    img.src = dataUrl
  })
}

export async function readImageFile(file: File): Promise<ReadImageFileResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Escolha um arquivo de imagem (PNG, JPG, etc.).')
  }

  const dataUrl = await readFileAsDataUrl(file)
  const img = await loadImageElement(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível processar essa imagem.')
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

  const image: ImportedImage = {
    fileName: file.name,
    width: img.naturalWidth,
    height: img.naturalHeight,
    sizeBytes: file.size,
    dataUrl,
  }
  return { image, imageData }
}
