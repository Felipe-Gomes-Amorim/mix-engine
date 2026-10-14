import { BackgroundThumbnail } from './BackgroundThumbnail'
import type { BackgroundSummary } from './backgroundDiscovery'

interface SavedBackgroundsProps {
  backgrounds: BackgroundSummary[]
  loading: boolean
  /** Nome do Fundo sendo carregado/excluído agora (desabilita os botões dele). */
  busyName: string | null
  onEdit: (name: string) => void
  onDelete: (name: string) => void
}

/**
 * Galeria de Fundos já salvos (docs/PROGRESS.md, "Fundo como recurso salvo", 2026-09-30) — mesmo
 * espírito de SavedTilesets.tsx, mas pra Fundo: aparece assim que a aba "Fundos" abre, antes de
 * qualquer criação nova.
 */
export function SavedBackgrounds({ backgrounds, loading, busyName, onEdit, onDelete }: SavedBackgroundsProps) {
  if (loading) {
    return <p className="hint">Procurando Fundos já salvos...</p>
  }
  if (backgrounds.length === 0) {
    return null
  }

  function handleDelete(name: string) {
    const confirmed = window.confirm(
      `Excluir o Fundo "${name}"? Isso não muda nenhuma fase já salva que o carimbou (a Camada 2 dela já está gravada nos próprios arquivos exportados) — mas não vai mais aparecer pra escolher em fases novas. Não pode ser desfeito.`,
    )
    if (confirmed) onDelete(name)
  }

  return (
    <div className="saved-characters">
      <h3>Fundos já salvos</h3>
      <p className="hint">Escolha um para continuar editando ou excluir, ou crie um novo abaixo.</p>
      <ul className="character-list">
        {backgrounds.map((background) => {
          const busy = busyName === background.name
          return (
            <li key={background.name}>
              <span className="character-name">
                <BackgroundThumbnail name={background.name} />
                {background.name}
              </span>
              <span className="row-actions">
                <button type="button" onClick={() => onEdit(background.name)} disabled={busy}>
                  {busy ? 'Carregando...' : 'Editar'}
                </button>
                <button type="button" onClick={() => handleDelete(background.name)} disabled={busy}>
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
