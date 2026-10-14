import { CharacterThumbnail } from './CharacterThumbnail'
import type { CharacterSummary } from './characterDiscovery'

interface SavedCharactersProps {
  characters: CharacterSummary[]
  loading: boolean
  error: string | null
  /** Nome do personagem sendo carregado/excluído agora (desabilita os botões dele). */
  busyBaseName: string | null
  onEdit: (baseName: string) => void
  onDelete: (baseName: string) => void
}

/**
 * Galeria de personagens já exportados (lidos de volta a partir dos próprios
 * arquivos em assets/gfx/ — ver loadCharacter.ts). Aparece assim que a tela
 * abre, antes de qualquer upload, pra continuar um trabalho já salvo.
 */
export function SavedCharacters({ characters, loading, error, busyBaseName, onEdit, onDelete }: SavedCharactersProps) {
  if (loading) {
    return <p className="hint">Procurando personagens já salvos no jogo...</p>
  }
  if (error) {
    return <p className="error">{error}</p>
  }
  if (characters.length === 0) {
    return null
  }

  function handleDelete(baseName: string, hasAnim: boolean) {
    const extra = hasAnim ? ' (incluindo as animações)' : ''
    const confirmed = window.confirm(
      `Excluir "${baseName}"${extra}? Isso apaga os arquivos dele na pasta do jogo. Não pode ser desfeito.`,
    )
    if (confirmed) onDelete(baseName)
  }

  return (
    <div className="saved-characters">
      <h3>Personagens já salvos</h3>
      <p className="hint">Escolha um para continuar editando ou excluir, ou importe um novo desenho abaixo.</p>
      <ul className="character-list">
        {characters.map((character) => {
          const busy = busyBaseName === character.baseName
          return (
            <li key={character.baseName}>
              <span className="character-name">
                <CharacterThumbnail baseName={character.baseName} />
                {character.baseName}
                {character.hasAnim && <span className="legend legend-16">com animação</span>}
              </span>
              <span className="row-actions">
                <button type="button" onClick={() => onEdit(character.baseName)} disabled={busy}>
                  {busy ? 'Carregando...' : 'Editar'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(character.baseName, character.hasAnim)}
                  disabled={busy}
                >
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
