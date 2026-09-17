import { useState } from 'react'
import { ImportPreview } from './features/import-preview/ImportPreview'
import { ExportTest } from './features/export-test/ExportTest'
import type { ImportedImage } from './types/importedImage'

type Tab = 'import' | 'export'

function App() {
  const [tab, setTab] = useState<Tab>('import')
  const [image, setImage] = useState<ImportedImage | null>(null)

  return (
    <div className="app">
      <header>
        <h1>SNES Asset Editor</h1>
        <p className="hint">Skeleton — importar/preview e export de teste.</p>
      </header>

      <nav className="tabs">
        <button
          type="button"
          className={tab === 'import' ? 'active' : ''}
          onClick={() => setTab('import')}
        >
          Importar / Preview
        </button>
        <button
          type="button"
          className={tab === 'export' ? 'active' : ''}
          onClick={() => setTab('export')}
        >
          Exportar teste
        </button>
      </nav>

      <main>
        {tab === 'import' && (
          <ImportPreview image={image} onImageLoaded={setImage} />
        )}
        {tab === 'export' && <ExportTest image={image} />}
      </main>
    </div>
  )
}

export default App
