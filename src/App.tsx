import { useState } from 'react'
import { ImportPreview } from './features/import-preview/ImportPreview'
import { PlayButton } from './features/import-preview/PlayButton'
import { StageWorkspace, type StageWorkspaceTab } from './features/import-preview/StageWorkspace'

// Reorganização de UI (2026-09-23): "Editor de Fases" virou duas áreas próprias — "Tilesets"
// (cadastro de blocos: upload, tamanho de bloco, colisão/camada por bloco) e "Fases" (só pintar
// com blocos já cadastrados + posicionar entidades). Nenhuma mudou de formato/lógica, só de onde
// mora na navegação — ver docs/PROGRESS.md e StageWorkspace.tsx.
type Page = 'characters' | StageWorkspaceTab

/** Ícones da navegação de topo (docs/PROGRESS.md, "reestilizar no espírito Lunar Magic",
 * 2026-09-24) — desenhos originais simples e "quadriculados" (sem curva suave, mesmo espírito
 * pixel-art do resto da UI), não os ícones de verdade do Lunar Magic (são arte do jogo original).
 * `currentColor` herda a cor do texto do botão (já muda sozinho no hover/ativo). */
function CharacterNavIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <rect x="7" y="2" width="6" height="6" fill="currentColor" />
      <rect x="4" y="9" width="12" height="7" fill="currentColor" />
      <rect x="5" y="16" width="4" height="3" fill="currentColor" />
      <rect x="11" y="16" width="4" height="3" fill="currentColor" />
    </svg>
  )
}

function TilesetNavIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <rect x="2" y="2" width="7" height="7" fill="currentColor" />
      <rect x="11" y="2" width="7" height="7" fill="currentColor" />
      <rect x="2" y="11" width="7" height="7" fill="currentColor" />
      <rect x="11" y="11" width="7" height="7" fill="currentColor" />
    </svg>
  )
}

function StageNavIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <rect x="4" y="2" width="2" height="16" fill="currentColor" />
      <path d="M6 3 L16 6 L6 9 Z" fill="currentColor" />
    </svg>
  )
}

/** Imagem inteira (sem divisão em blocos, ao contrário de TilesetNavIcon) com um "morro" — mesmo
 * espírito pixel-art quadriculado dos outros ícones (docs/PROGRESS.md, "Fundo como recurso salvo",
 * 2026-09-30). */
function BackgroundNavIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <rect x="2" y="2" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M2 13 L7 7 L11 11 L14 8 L18 13 L18 16 L2 16 Z" fill="currentColor" />
    </svg>
  )
}

function App() {
  const [page, setPage] = useState<Page>('characters')

  return (
    <>
      {/* Fundo roxo estrelado (pedido do usuário, 2026-09-23 — vibe Lunar Magic/ZSNES): puramente
          decorativo, fixo atrás de tudo, `aria-hidden` porque não carrega informação nenhuma. Fica
          fora de `.app` pra cobrir a viewport inteira mesmo com o conteúdo rolando. */}
      <div className="starfield" aria-hidden="true">
        <div className="starfield-layer starfield-layer-1" />
        <div className="starfield-layer starfield-layer-2" />
        <div className="starfield-layer starfield-layer-3" />
      </div>
      <div className="app">
        <header className="app-header">
          <h1>SNES Asset Editor</h1>
          <p className="hint">Importar, validar e exportar assets gráficos.</p>
          <nav className="top-nav">
            <div className="top-nav-tabs">
              <button
                type="button"
                className={page === 'characters' ? 'top-nav-active' : undefined}
                onClick={() => setPage('characters')}
                title="Personagens — importar sprite, animação, personagem/inimigo"
              >
                <CharacterNavIcon />
                Personagens
              </button>
              <button
                type="button"
                className={page === 'tilesets' ? 'top-nav-active' : undefined}
                onClick={() => setPage('tilesets')}
                title="Tilesets — cadastrar conjuntos de blocos reutilizáveis"
              >
                <TilesetNavIcon />
                Tilesets
              </button>
              <button
                type="button"
                className={page === 'backgrounds' ? 'top-nav-active' : undefined}
                onClick={() => setPage('backgrounds')}
                title="Fundos — cadastrar imagens inteiras pra carimbar na Camada 2 de uma fase"
              >
                <BackgroundNavIcon />
                Fundos
              </button>
              <button
                type="button"
                className={page === 'stages' ? 'top-nav-active' : undefined}
                onClick={() => setPage('stages')}
                title="Fases — pintar o mapa e posicionar personagens"
              >
                <StageNavIcon />
                Fases
              </button>
            </div>
            <PlayButton />
          </nav>
        </header>

        <main>
          {page === 'characters' && <ImportPreview />}
          {(page === 'tilesets' || page === 'backgrounds' || page === 'stages') && (
            <StageWorkspace activeTab={page} onNavigate={setPage} />
          )}
        </main>
      </div>
    </>
  )
}

export default App
