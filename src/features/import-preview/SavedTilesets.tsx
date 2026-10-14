import type { TilesetSummary } from './tilesetDiscovery'
import { TilesetThumbnail } from './TilesetThumbnail'

interface SavedTilesetsProps {
  tilesets: TilesetSummary[]
  loading: boolean
  /** Nome do tileset sendo carregado/excluído agora (desabilita os botões dele). */
  busyName: string | null
  onEdit: (name: string) => void
  onDelete: (name: string) => void
}

/**
 * Galeria de tilesets já salvos (docs/PROGRESS.md, "tilesets como recurso salvo e reutilizável",
 * 2026-09-23) — mesmo espírito de SavedCharacters.tsx, mas pra tileset: aparece assim que a aba
 * "Tilesets" abre, antes de qualquer criação nova.
 */
export function SavedTilesets({ tilesets, loading, busyName, onEdit, onDelete }: SavedTilesetsProps) {
  if (loading) {
    return <p className="hint">Procurando tilesets já salvos...</p>
  }
  if (tilesets.length === 0) {
    return null
  }

  function handleDelete(name: string) {
    const confirmed = window.confirm(
      `Excluir o tileset "${name}"? Isso não muda nenhuma fase já salva com ele (a fase continua exportada do jeito que estava) — mas não vai mais aparecer pra escolher em fases novas. Não pode ser desfeito.`,
    )
    if (confirmed) onDelete(name)
  }

  return (
    <div className="saved-characters">
      <h3>Tilesets já salvos</h3>
      <p className="hint">Escolha um para continuar editando ou excluir, ou crie um novo abaixo.</p>
      <ul className="character-list">
        {tilesets.map((tileset) => {
          const busy = busyName === tileset.name
          return (
            <li key={tileset.name}>
              <span className="character-name">
                <TilesetThumbnail name={tileset.name} />
                {tileset.name}
              </span>
              <span className="row-actions">
                <button type="button" onClick={() => onEdit(tileset.name)} disabled={busy}>
                  {busy ? 'Carregando...' : 'Editar'}
                </button>
                <button type="button" onClick={() => handleDelete(tileset.name)} disabled={busy}>
                  Excluir
                </button>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
