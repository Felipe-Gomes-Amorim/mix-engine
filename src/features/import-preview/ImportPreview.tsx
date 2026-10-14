import { useEffect, useState } from 'react'
import { encodeIndexedBmp } from '../../lib/indexedBmp'
import { deleteGfxFile, listGfxFiles } from '../../lib/gfxFiles'
import { saveToEngine, type SaveResult } from '../../lib/saveToEngine'
import { toBmpFileName } from './validation'
import { DEFAULT_CHARACTER_SLOT_ID } from './characterSlots'
import { BuildStatus } from './BuildStatus'
import type { ProjectSeed } from './loadCharacter'
import { loadCharacterProject } from './loadCharacter'
import { characterFileNames, discoverCharacters, type CharacterSummary } from './characterDiscovery'
import { QuantizeConfirmModal } from './QuantizeConfirmModal'
import { SavedCharacters } from './SavedCharacters'
import { SpriteSheetEditor } from './SpriteSheetEditor'
import { useEngineBuild } from './useEngineBuild'
import { useImageUpload } from './useImageUpload'

type ImageKind = 'character' | 'scenery'

export function ImportPreview() {
  const [seed, setSeed] = useState<ProjectSeed | undefined>(undefined)
  const {
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
  } = useImageUpload(() => setSeed(undefined))
  // Espelha o slot ("Isso é o: ▾") selecionado dentro de SpriteSheetEditor — só pra saber, ao
  // excluir um personagem da galeria, se é o que está aberto na tela (e então limpar a edição).
  const [editingSlotId, setEditingSlotId] = useState(DEFAULT_CHARACTER_SLOT_ID)
  const [kind, setKind] = useState<ImageKind>('character')
  const [exportResult, setExportResult] = useState<SaveResult | null>(null)
  const [exporting, setExporting] = useState(false)
  const build = useEngineBuild()

  const [characters, setCharacters] = useState<CharacterSummary[]>([])
  const [charactersLoading, setCharactersLoading] = useState(true)
  const [busyBaseName, setBusyBaseName] = useState<string | null>(null)

  async function refreshCharacters() {
    const files = await listGfxFiles()
    setCharacters(discoverCharacters(files))
    setCharactersLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    listGfxFiles().then((files) => {
      if (cancelled) return
      setCharacters(discoverCharacters(files))
      setCharactersLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleEditCharacter(baseName: string) {
    setBusyBaseName(baseName)
    try {
      const character = characters.find((c) => c.baseName === baseName)
      const project = await loadCharacterProject(baseName, character?.hasAnim ?? false)
      hydrate(project.image, project.validation)
      setSeed(project.seed)
      setKind('character')
      setExportResult(null)
      build.reset()
    } catch (err) {
      reportError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyBaseName(null)
    }
  }

  async function handleDeleteCharacter(baseName: string) {
    setBusyBaseName(baseName)
    // Sempre tenta apagar o `_anim.h` também, mesmo que o `hasAnim` da galeria esteja
    // desatualizado (ex.: uma animação salva bem antes desta lista recarregar) — apagar um
    // arquivo que não existe não é erro (ver vite-gfx-files.ts), então o extra é inofensivo, e
    // evita deixar um `<base>_anim.h` órfão pra trás depois de "Excluir".
    const names = characterFileNames(baseName, true)
    await Promise.all(names.map((name) => deleteGfxFile(name)))
    setCharacters((prev) => prev.filter((c) => c.baseName !== baseName))
    setBusyBaseName(null)

    // Salvar no editor de personagem grava sob a base fixa do slot escolhido (ver
    // characterSlots.ts) — não importa o nome do arquivo importado. Então excluir o slot que está
    // aberto na tela limpa a edição em andamento; excluir outro personagem não mexe no que está
    // aberto.
    if (image && kind === 'character' && baseName === editingSlotId) {
      handleClear()
    }
  }

  async function handleExportBmp() {
    if (!image || !validation || !validation.ok) return
    setExporting(true)
    setExportResult(null)
    build.reset()
    const blob = encodeIndexedBmp(
      image.width,
      image.height,
      validation.indices,
      validation.palette,
    )
    const saved = await saveToEngine(toBmpFileName(image.fileName), blob)
    setExportResult(saved)
    setExporting(false)
    if (saved.ok) await build.run()
  }

  return (
    <section className="panel">
      <h2>Importar imagem</h2>
      <p className="hint">
        Escolha o desenho (PNG) do seu personagem ou cenário. O editor confere se ele segue as regras
        do SNES e prepara os arquivos para o jogo. (Os arquivos são salvos direto na pasta do jogo —
        isso só funciona com o editor aberto via &quot;npm run dev&quot;. Pra montar o mapa de uma
        fase, use as abas "Tilesets" e "Fases".)
      </p>

      <SavedCharacters
        characters={characters}
        loading={charactersLoading}
        error={null}
        busyBaseName={busyBaseName}
        onEdit={handleEditCharacter}
        onDelete={handleDeleteCharacter}
      />

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
            <dt>Tamanho</dt>
            <dd>
              {image.width} × {image.height} pixels
            </dd>
          </dl>

          {validation && !validation.ok && (
            <ul className="error-list">
              {validation.errors.map((message) => (
                <li key={message} className="error">
                  {message}
                </li>
              ))}
            </ul>
          )}

          {quantizeOffer && (
            <QuantizeConfirmModal offer={quantizeOffer} onConfirm={applyQuantized} onCancel={cancelQuantize} />
          )}

          {validation && validation.ok && (
            <p className="success">
              Imagem válida: usa {validation.palette.length} de 16 cores possíveis
              {validation.hasTransparency ? ' (uma delas é a transparência)' : ''}.
            </p>
          )}

          <div className="actions">
            <button type="button" onClick={handleClear}>
              Limpar
            </button>
          </div>

          {validation?.ok && (
            <>
              <fieldset className="kind-choice">
                <legend>O que é essa imagem?</legend>
                <label>
                  <input
                    type="radio"
                    name="kind"
                    checked={kind === 'character'}
                    onChange={() => setKind('character')}
                  />{' '}
                  Personagem ou objeto (uma ou várias poses, com animação)
                </label>
                <label>
                  <input
                    type="radio"
                    name="kind"
                    checked={kind === 'scenery'}
                    onChange={() => setKind('scenery')}
                  />{' '}
                  Cenário (a imagem inteira, sem editar)
                </label>
              </fieldset>

              {kind === 'scenery' && (
                <>
                  <p className="hint">
                    A imagem inteira vai para o jogo, que a converte em blocos de cenário.
                  </p>
                  <div className="actions">
                    <button
                      type="button"
                      onClick={handleExportBmp}
                      disabled={exporting || build.state.status === 'running'}
                    >
                      {exporting ? 'Salvando...' : 'Salvar cenário no jogo'}
                    </button>
                  </div>
                  {exportResult && exportResult.ok && (
                    <p className="success">Salvo em {exportResult.path}</p>
                  )}
                  {exportResult && !exportResult.ok && (
                    <p className="error">{exportResult.message}</p>
                  )}
                  <BuildStatus state={build.state} />
                </>
              )}

              {kind === 'character' && (
                <SpriteSheetEditor
                  key={image.dataUrl}
                  image={image}
                  indices={validation.indices}
                  palette={validation.palette}
                  seed={seed}
                  characters={characters}
                  onSaved={refreshCharacters}
                  onSlotChange={setEditingSlotId}
                />
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
