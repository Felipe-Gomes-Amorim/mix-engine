import { useRef, useState } from 'react'
import type { ImportedImage } from '../../types/importedImage'

interface ImportPreviewProps {
  image: ImportedImage | null
  onImageLoaded: (image: ImportedImage | null) => void
}

export function ImportPreview({ image, onImageLoaded }: ImportPreviewProps) {
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Selecione um arquivo de imagem (PNG, JPG, etc.).')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const img = new Image()
      img.onload = () => {
        setError(null)
        onImageLoaded({
          fileName: file.name,
          width: img.naturalWidth,
          height: img.naturalHeight,
          sizeBytes: file.size,
          dataUrl,
        })
      }
      img.onerror = () => setError('Não foi possível ler essa imagem.')
      img.src = dataUrl
    }
    reader.onerror = () => setError('Falha ao ler o arquivo.')
    reader.readAsDataURL(file)
  }

  function handleClear() {
    onImageLoaded(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <section className="panel">
      <h2>Importar imagem</h2>
      <p className="hint">
        Só valida o fluxo de arquivo local no navegador — nenhuma conversão
        para formato PVSnesLib acontece ainda (ver docs/DATA_FORMAT.md).
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
      />

      {error && <p className="error">{error}</p>}

      {image && (
        <div className="preview">
          <img src={image.dataUrl} alt={image.fileName} className="preview-img" />
          <dl className="meta">
            <dt>Arquivo</dt>
            <dd>{image.fileName}</dd>
            <dt>Dimensões</dt>
            <dd>
              {image.width} × {image.height} px
            </dd>
            <dt>Tamanho</dt>
            <dd>{(image.sizeBytes / 1024).toFixed(1)} KB</dd>
          </dl>
          <button type="button" onClick={handleClear}>
            Limpar
          </button>
        </div>
      )}
    </section>
  )
}
