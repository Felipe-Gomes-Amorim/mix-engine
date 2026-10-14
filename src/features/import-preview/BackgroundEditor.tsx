import { useMemo, useState } from 'react'
import type { RgbColor } from '../../lib/indexedBmp.ts'
import { encodeIndexedBmp } from '../../lib/indexedBmp.ts'
import { composedToRgba } from '../../lib/metasprite/render.ts'
import { generateBackgroundMeta, sanitizeBackgroundFileName, validateBackgroundDimensions } from '../../lib/tilemap/backgroundAsset.ts'
import { saveBackgroundFile } from './backgroundFiles'
import type { LoadedTileset } from './loadTileset'
import { detectQuantizeOffer, type QuantizeOffer } from './quantizeFlow'
import { QuantizeConfirmModal } from './QuantizeConfirmModal'
import { readImageFile } from './readImageFile'
import { validateForExport } from './validation'

interface BackgroundEditorProps {
  /** Fundo sendo editado (`undefined` = criando um novo) — mesmo formato `LoadedTileset` de
   * loadBackgroundAsset.ts (ver comentário lá: um Fundo carregado "parece" um tileset carregado). */
  seed?: LoadedTileset
  /** Nomes de Fundos já salvos — só pra avisar antes de sobrescrever um por engano ao criar um novo
   * com o mesmo nome (não bloqueia, o usuário pode querer sobrescrever mesmo). */
  existingNames: string[]
  onSaved: () => void
  onCancel: () => void
}

interface UploadedImage {
  width: number
  height: number
  indices: Uint8Array
  palette: RgbColor[]
}

/**
 * Cria/edita UM Fundo salvo (docs/PROGRESS.md, "Fundo como recurso salvo", 2026-09-30) — importar a
 * imagem INTEIRA (sem fatiar em blocos, sem colisão/camada por bloco: isso não existe aqui, um Fundo
 * é carimbado inteiro de uma vez na Camada 2 de uma fase, ver StageSession.tsx), validar as
 * dimensões que a Camada 2 aceita (altura 32 linhas fixa, largura 32 ou 64 colunas —
 * `validateBackgroundDimensions`) e salvar com um nome. Bem mais simples que TilesetEditor.tsx: sem
 * tamanho de bloco, sem colisão/camada por bloco, sem terrenos inteligentes — mais perto do fluxo de
 * "Cenário" de ImportPreview.tsx (imagem inteira, sem editar) do que do de Tileset.
 */
export function BackgroundEditor({ seed, existingNames, onSaved, onCancel }: BackgroundEditorProps) {
  const [name, setName] = useState(seed?.name ?? '')
  const [upload, setUpload] = useState<UploadedImage | null>(
    seed ? { width: seed.width, height: seed.height, indices: seed.indices, palette: seed.palette } : null,
  )
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [quantizeOffer, setQuantizeOffer] = useState<QuantizeOffer | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const preview = useMemo(() => {
    if (!upload) return null
    const canvas = document.createElement('canvas')
    canvas.width = upload.width
    canvas.height = upload.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const rgba = composedToRgba(
      { width: upload.width, height: upload.height, originX: 0, originY: 0, pixels: upload.indices },
      upload.palette,
    )
    ctx.putImageData(new ImageData(rgba, upload.width, upload.height), 0, 0)
    return canvas
  }, [upload])

  function acceptUpload(width: number, height: number, indices: Uint8Array, palette: RgbColor[]) {
    const dimensionError = validateBackgroundDimensions(width, height)
    if (dimensionError) {
      setUploadError(dimensionError)
      setQuantizeOffer(null)
      return
    }
    setUpload({ width, height, indices, palette })
    setUploadError(null)
    setQuantizeOffer(null)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadError(null)
    setQuantizeOffer(null)
    try {
      const { imageData } = await readImageFile(file)
      const validation = validateForExport(imageData)
      if (!validation.ok) {
        setUploadError(validation.errors.join(' '))
        setQuantizeOffer(detectQuantizeOffer(imageData))
        return
      }
      acceptUpload(imageData.width, imageData.height, validation.indices, validation.palette)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err))
    }
  }

  /** Confirmado no QuantizeConfirmModal (docs/PROGRESS.md, "quantização automática de paleta",
   * 2026-09-25) — sempre válida por construção (quantizeImageData garante ≤16 cores), mesmo caminho
   * de estado de um upload que passou de primeira. */
  function applyQuantized(imageData: ImageData) {
    const validation = validateForExport(imageData)
    if (!validation.ok) return // não deveria acontecer — quantizeImageData garante ≤16 cores
    acceptUpload(imageData.width, imageData.height, validation.indices, validation.palette)
  }

  const sanitizedName = sanitizeBackgroundFileName(name)
  const nameCollides = !seed && existingNames.includes(sanitizedName)

  async function handleSave() {
    if (!upload || !name.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      const bmp = encodeIndexedBmp(upload.width, upload.height, upload.indices, upload.palette)
      // Sobe a cada save (mesmo mecanismo de staleness de tileset salvo, docs/PROGRESS.md "fase
      // referencia tileset por nome", 2026-09-23) — é isso que deixa uma fase que carimbou este
      // Fundo saber se ele mudou desde então.
      const version = (seed?.meta.version ?? 0) + 1
      const metaJson = generateBackgroundMeta({ version })
      const bmpResult = await saveBackgroundFile(`${sanitizedName}_fundo.bmp`, bmp)
      if (!bmpResult.ok) {
        setSaveError(bmpResult.message)
        return
      }
      const metaResult = await saveBackgroundFile(
        `${sanitizedName}_fundo.json`,
        new Blob([metaJson], { type: 'application/json' }),
      )
      if (!metaResult.ok) {
        setSaveError(metaResult.message)
        return
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sequencer">
      <h3>{seed ? `Editando "${seed.name}"` : 'Novo fundo'}</h3>
      <p className="hint">
        Uma imagem única, carimbada inteira na Camada 2 de uma fase de uma vez (sem pintar bloco a
        bloco) — pra uma cena contínua (céu com morros etc.), não pra decoração feita de peças
        soltas repetíveis (isso continua sendo um tileset normal com blocos marcados "Camada 2").
      </p>

      <label className="sheet-options">
        Nome do fundo:{' '}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!!seed}
          placeholder="ex.: ceu_com_morros"
        />
      </label>
      {!seed && sanitizedName && <p className="hint">Vai salvar como "{sanitizedName}_fundo.bmp/.json".</p>}
      {nameCollides && <p className="hint">Já existe um fundo chamado "{sanitizedName}" — salvar vai SUBSTITUIR ele.</p>}
      {seed && <p className="hint">O nome não pode ser trocado depois de criado.</p>}

      {!upload && (
        <>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            title="256×256px (32 colunas) ou 512×256px (64 colunas) — o que a Camada 2 repete de verdade, no máximo 16 cores"
          />
          {uploadError && <p className="error">{uploadError}</p>}
          {quantizeOffer && (
            <QuantizeConfirmModal offer={quantizeOffer} onConfirm={applyQuantized} onCancel={() => setQuantizeOffer(null)} />
          )}
        </>
      )}

      {upload && preview && (
        <>
          <div className="actions">
            <label className="stage-add-tileset">
              Trocar imagem
              <input type="file" accept="image/*" onChange={handleFileChange} />
            </label>
          </div>
          {uploadError && <p className="error">{uploadError}</p>}

          <img
            src={preview.toDataURL()}
            alt={`Prévia do fundo "${name || sanitizedName}"`}
            className="preview-img"
            style={{ imageRendering: 'pixelated' }}
          />
          <p className="hint">
            {upload.width}×{upload.height}px ({upload.width / 8}×{upload.height / 8} tiles de
            hardware) — usa {upload.palette.length} de 16 cores possíveis.
          </p>
        </>
      )}

      {saveError && <p className="error">{saveError}</p>}

      <div className="actions">
        <button type="button" onClick={handleSave} disabled={saving || !upload || !name.trim()}>
          {saving ? 'Salvando...' : 'Salvar fundo'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
