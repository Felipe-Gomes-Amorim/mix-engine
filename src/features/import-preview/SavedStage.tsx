import { useEffect, useState } from 'react'
import { deleteGfxFile, readGfxFile } from '../../lib/gfxFiles'
import { STAGE_BASE_NAME } from '../../lib/tilemap/types'
import type { TilesetStaleness } from './loadStage'
import { STAGE_FILE_NAMES, STAGE_TILEMAP_FILE } from './stageDiscovery'

interface SavedStageProps {
  /** Nome do que está sendo carregado/excluído agora (desabilita os botões). */
  busy: boolean
  onEdit: () => void
  /** Chamado depois de excluir, pra atualizar a lista (ver ImportPreview.tsx). */
  onDeleted: () => void
  /** Tilesets referenciados por esta fase cuja versão salva já não bate com a atual (docs/
   * PROGRESS.md, "fase referencia tileset por nome", 2026-09-23) — vazio = sem divergência, ou
   * fase antiga sem referência nenhuma pra comparar (ver checkStageStaleness em loadStage.ts). */
  staleness: TilesetStaleness[]
}

/**
 * Mostra a fase já salva (se houver — ver `stageDiscovery.ts`), com uma prévia da imagem composta,
 * "Editar" e "Excluir". "Editar" lê `<base>_tileset_refs.json` (referência por nome, sem perda) —
 * só cai pra reconstrução por pixel (sempre em blocos de 8×8) se esse sidecar não existir ou algum
 * tileset referenciado tiver sido apagado (ver loadStage.ts).
 */
export function SavedStage({ busy, onEdit, onDeleted, staleness }: SavedStageProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    readGfxFile(STAGE_TILEMAP_FILE).then(
      (buffer) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(new Blob([buffer], { type: 'image/bmp' }))
        setPreviewUrl(objectUrl)
      },
      () => {
        // sem prévia (arquivo sumiu/corrompido) — a linha continua mostrando o nome e os botões
      },
    )
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [])

  async function handleDelete() {
    const confirmed = window.confirm(
      `Excluir a fase "${STAGE_BASE_NAME}"? Isso apaga os arquivos dela na pasta do jogo. Não pode ser desfeito.`,
    )
    if (!confirmed) return
    setDeleting(true)
    await Promise.all(STAGE_FILE_NAMES.map((name) => deleteGfxFile(name)))
    setDeleting(false)
    onDeleted()
  }

  return (
    <div className="saved-stage">
      <h3>Fase já salva</h3>
      <div className="saved-stage-row">
        {previewUrl ? (
          <img src={previewUrl} alt={`Prévia da fase ${STAGE_BASE_NAME}`} className="saved-stage-preview" />
        ) : (
          <span className="saved-stage-preview saved-stage-preview-placeholder" aria-hidden="true" />
        )}
        <span className="character-name">{STAGE_BASE_NAME}</span>
        <span className="row-actions">
          <button type="button" onClick={onEdit} disabled={busy || deleting}>
            {busy ? 'Carregando...' : 'Editar'}
          </button>
          <button type="button" onClick={handleDelete} disabled={busy || deleting}>
            {deleting ? 'Excluindo...' : 'Excluir'}
          </button>
        </span>
      </div>
      {staleness.length > 0 && (
        <p className="hint stage-staleness-warning">
          {staleness.length === 1 ? 'Este tileset mudou' : 'Estes tilesets mudaram'} desde que essa
          fase foi salva:{' '}
          {staleness.map((s, i) => (
            <span key={s.name}>
              {i > 0 && ', '}
              <strong>{s.name}</strong> (v{s.savedVersion} → v{s.currentVersion})
            </span>
          ))}
          . A fase salva no jogo continua igual — abra "Editar" e clique em "Salvar fase no jogo"
          se quiser atualizá-la pra versão atual, ou não faça nada pra manter como está.
        </p>
      )}
    </div>
  )
}
