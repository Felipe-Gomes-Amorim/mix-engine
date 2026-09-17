import { useState } from 'react'
import type { ImportedImage } from '../../types/importedImage'
import type { ExportManifest } from '../../types/exportManifest'

interface ExportTestProps {
  image: ImportedImage | null
}

export function ExportTest({ image }: ExportTestProps) {
  const [lastExport, setLastExport] = useState<ExportManifest | null>(null)

  function handleExport() {
    const manifest: ExportManifest = {
      formatVersion: '0.0.0-skeleton',
      generatedAt: new Date().toISOString(),
      tool: 'snes-asset-editor',
      note: 'Arquivo de teste — valida o pipeline de export, não é o formato final.',
      sourceImage: image
        ? {
            fileName: image.fileName,
            width: image.width,
            height: image.height,
            sizeBytes: image.sizeBytes,
          }
        : null,
    }

    const blob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'export-teste.json'
    a.click()
    URL.revokeObjectURL(url)

    setLastExport(manifest)
  }

  return (
    <section className="panel">
      <h2>Exportar arquivo de teste</h2>
      <p className="hint">
        Gera um JSON mínimo e dispara o download — valida o pipeline de export
        ponta a ponta antes de qualquer seção do DATA_FORMAT.md estar fechada
        (🟢).
      </p>

      <button type="button" onClick={handleExport}>
        Exportar export-teste.json
      </button>

      {lastExport && (
        <pre className="export-log">{JSON.stringify(lastExport, null, 2)}</pre>
      )}
    </section>
  )
}
