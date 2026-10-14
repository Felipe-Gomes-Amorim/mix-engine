import { useEffect, useState } from 'react'
import { listGfxFiles } from '../../lib/gfxFiles'
import { combineTilesets, type StageTilesetInput, type TilesetUpload } from '../../lib/tilemap/combineTilesets'
import { mergeTilesetMetaToHardware } from '../../lib/tilemap/mergeTilesetMeta'
import {
  HARDWARE_TILE_SIZE,
  MAX_TILESET_BANKS,
  STAGE_DEFAULT_WIDTH_TILES,
  STAGE_MAX_PAGES,
  STAGE_PAGE_TILES,
  stageWidthPixels,
  type CollisionKind,
  type TileLayer,
} from '../../lib/tilemap/types'
import { BackgroundEditor } from './BackgroundEditor'
import { backgroundFileNames, discoverBackgrounds, type BackgroundSummary } from './backgroundDiscovery'
import { deleteBackgroundFile, listBackgroundFiles } from './backgroundFiles'
import { checkStageStaleness, loadStageProject, type StageSeed, type TilesetStaleness } from './loadStage'
import { loadBackgroundAsset } from './loadBackground'
import { loadTilesetAsset } from './loadTileset'
import { SavedBackgrounds } from './SavedBackgrounds'
import { SavedStage } from './SavedStage'
import { SavedTilesets } from './SavedTilesets'
import { StageSession } from './StageSession'
import { stageExists } from './stageDiscovery'
import { discoverTilesets, tilesetFileNames, type TilesetSummary } from './tilesetDiscovery'
import { deleteTilesetFile, listTilesetFiles } from './tilesetFiles'
import { TilesetEditor } from './TilesetEditor'
import { useEngineBuild } from './useEngineBuild'

/** As três abas navegáveis que este componente cobre (nav de topo fica em App.tsx) — "tilesets" é
 * o cadastro de blocos (importar imagem, tamanho de bloco, colisão/camada por bloco, salvar com um
 * nome — recurso reutilizável entre fases, ver docs/PROGRESS.md, "tilesets como recurso salvo e
 * reutilizável", 2026-09-23), "backgrounds" é o cadastro de Fundos (imagem INTEIRA, sem bloco —
 * docs/PROGRESS.md, "Fundo como recurso salvo", 2026-09-30), "stages" é escolher entre os tilesets/
 * Fundo já salvos e pintar + posicionar entidades. */
export type StageWorkspaceTab = 'tilesets' | 'backgrounds' | 'stages'

interface StageWorkspaceProps {
  activeTab: StageWorkspaceTab
  onNavigate: (tab: StageWorkspaceTab) => void
}

/** Uma sessão de pintura pronta pra passar pro `StageSession` — tilesets ESCOLHIDOS da galeria
 * (colisão/camada mesclada de cada um, ver mergeTilesetMeta.ts) ou carregados de
 * `loadStageProject()` (referência por nome — ou fallback de reconstrução por pixel pra fase
 * salva antes desse recurso existir, ver loadStage.ts). */
interface ActiveSession {
  tilesets: StageTilesetInput[]
  tileCollision: ReadonlyMap<number, CollisionKind>
  tileLayer: ReadonlyMap<number, TileLayer>
  tilePriority: ReadonlyMap<number, boolean>
  /** Largura ESCOLHIDA desta fase, em tiles de hardware (docs/PROGRESS.md, "fases largas de
   * verdade", 2026-09-24) — fixa pra sempre depois de "Começar a pintar" (fase nova) ou recuperada
   * de `_tileset_refs.json`/`_collision.h` (fase reaberta, ver loadStage.ts). */
  widthTiles: number
  seed?: StageSeed
}

function toTilesetUpload(name: string, width: number, height: number, indices: Uint8Array, palette: TilesetUpload['palette']): TilesetUpload {
  return { width, height, indices, palette, label: name }
}

/**
 * Dono do estado de tilesets salvos (galeria) e de fase salva (Editar/Excluir) — reorganização de
 * UI (2026-09-23, "tilesets como recurso salvo e reutilizável" + "fase referencia tileset por
 * nome"): a aba "Tilesets" é um CRUD de verdade (criar/editar UM tileset por vez,
 * `TilesetEditor.tsx`); a aba "Fases" ESCOLHE entre tilesets já salvos (multi-seleção, até
 * `MAX_TILESET_BANKS`); reabrir uma fase salva lê `<base>_tileset_refs.json` (sem reconstrução
 * nenhuma) com fallback pra reconstrução por pixel só quando esse sidecar não existe/não serve
 * mais (`loadStage.ts` decide isso sozinho — aqui só se usa o resultado).
 */
export function StageWorkspace({ activeTab, onNavigate }: StageWorkspaceProps) {
  const [tilesetSummaries, setTilesetSummaries] = useState<TilesetSummary[]>([])
  const [tilesetsLoading, setTilesetsLoading] = useState(true)
  const [tilesetBusyName, setTilesetBusyName] = useState<string | null>(null)
  const [editingTileset, setEditingTileset] = useState<'new' | Awaited<ReturnType<typeof loadTilesetAsset>> | null>(null)
  const [tilesetError, setTilesetError] = useState<string | null>(null)

  const [backgroundSummaries, setBackgroundSummaries] = useState<BackgroundSummary[]>([])
  const [backgroundsLoading, setBackgroundsLoading] = useState(true)
  const [backgroundBusyName, setBackgroundBusyName] = useState<string | null>(null)
  const [editingBackground, setEditingBackground] = useState<'new' | Awaited<ReturnType<typeof loadBackgroundAsset>> | null>(
    null,
  )
  const [backgroundError, setBackgroundError] = useState<string | null>(null)
  // Fundo escolhido pro PRÓXIMO "Começar a pintar" (docs/PROGRESS.md, "Fundo como recurso salvo",
  // 2026-09-30) — no máximo 1 (a Camada 2 só tem 1 padrão residente por fase), `null` = nenhum.
  const [selectedBackgroundName, setSelectedBackgroundName] = useState<string | null>(null)

  const [hasSavedStage, setHasSavedStage] = useState(false)
  const [stageLoading, setStageLoading] = useState(true)
  const [stageBusy, setStageBusy] = useState(false)
  // Aviso "esta fase salva está desatualizada" — verificação LEVE (só lê os `.json`, não a imagem
  // de cada tileset), pra já mostrar na lista de fases salvas, antes de clicar "Editar" (pedido
  // explícito do usuário). Vazio = sem divergência, ou fase antiga sem `_tileset_refs.json` pra
  // comparar (ver checkStageStaleness em loadStage.ts).
  const [savedStageStaleness, setSavedStageStaleness] = useState<TilesetStaleness[]>([])
  const [selectedTilesetNames, setSelectedTilesetNames] = useState<string[]>([])
  // Largura escolhida pro PRÓXIMO "Começar a pintar" (fase nova, docs/PROGRESS.md, "fases largas
  // de verdade", 2026-09-24) — só um `<select>` com os múltiplos de STAGE_PAGE_TILES já válidos
  // (nunca um valor livre), pra impedir um tamanho inválido já na hora de escolher, em vez de só
  // avisar no export (pedido explícito do usuário).
  const [newStageWidthTiles, setNewStageWidthTiles] = useState(STAGE_DEFAULT_WIDTH_TILES)
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null)
  // Staleness da sessão ATIVA (depois de "Editar") — normalmente igual ao que já apareceu antes de
  // clicar Editar, só reafirmado aqui pra ficar visível durante a edição também (pedido explícito).
  const [sessionStaleness, setSessionStaleness] = useState<TilesetStaleness[]>([])
  const [sessionKey, setSessionKey] = useState(0)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [startingSession, setStartingSession] = useState(false)
  const build = useEngineBuild()

  async function refreshTilesets() {
    const files = await listTilesetFiles()
    setTilesetSummaries(discoverTilesets(files))
    setTilesetsLoading(false)
  }

  async function refreshBackgrounds() {
    const files = await listBackgroundFiles()
    setBackgroundSummaries(discoverBackgrounds(files))
    setBackgroundsLoading(false)
  }

  async function refreshStage() {
    const [files, staleness] = await Promise.all([listGfxFiles(), checkStageStaleness()])
    setHasSavedStage(stageExists(files))
    setSavedStageStaleness(staleness)
    setStageLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    listTilesetFiles().then((files) => {
      if (cancelled) return
      setTilesetSummaries(discoverTilesets(files))
      setTilesetsLoading(false)
    })
    listBackgroundFiles().then((files) => {
      if (cancelled) return
      setBackgroundSummaries(discoverBackgrounds(files))
      setBackgroundsLoading(false)
    })
    Promise.all([listGfxFiles(), checkStageStaleness()]).then(([files, staleness]) => {
      if (cancelled) return
      setHasSavedStage(stageExists(files))
      setSavedStageStaleness(staleness)
      setStageLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleEditTileset(name: string) {
    setTilesetBusyName(name)
    try {
      const loaded = await loadTilesetAsset(name)
      setEditingTileset(loaded)
      setTilesetError(null)
    } catch (err) {
      setTilesetError(err instanceof Error ? err.message : String(err))
    } finally {
      setTilesetBusyName(null)
    }
  }

  async function handleDeleteTileset(name: string) {
    setTilesetBusyName(name)
    await Promise.all(tilesetFileNames(name).map((fileName) => deleteTilesetFile(fileName)))
    setTilesetSummaries((prev) => prev.filter((t) => t.name !== name))
    setSelectedTilesetNames((prev) => prev.filter((n) => n !== name))
    setTilesetBusyName(null)
  }

  function handleTilesetSaved() {
    setEditingTileset(null)
    refreshTilesets()
  }

  async function handleEditBackground(name: string) {
    setBackgroundBusyName(name)
    try {
      const loaded = await loadBackgroundAsset(name)
      setEditingBackground(loaded)
      setBackgroundError(null)
    } catch (err) {
      setBackgroundError(err instanceof Error ? err.message : String(err))
    } finally {
      setBackgroundBusyName(null)
    }
  }

  async function handleDeleteBackground(name: string) {
    setBackgroundBusyName(name)
    await Promise.all(backgroundFileNames(name).map((fileName) => deleteBackgroundFile(fileName)))
    setBackgroundSummaries((prev) => prev.filter((b) => b.name !== name))
    setSelectedBackgroundName((prev) => (prev === name ? null : prev))
    setBackgroundBusyName(null)
  }

  function handleBackgroundSaved() {
    setEditingBackground(null)
    refreshBackgrounds()
  }

  // Um Fundo também ocupa 1 banco de paleta de BG inteiro (igual um tileset, ver
  // docs/PROGRESS.md "Fundo como recurso salvo") — conta pro mesmo orçamento de `MAX_TILESET_BANKS`.
  const banksUsed = selectedTilesetNames.length + (selectedBackgroundName ? 1 : 0)

  function toggleSelectedTileset(name: string, checked: boolean) {
    setSelectedTilesetNames((prev) => {
      if (checked) return banksUsed >= MAX_TILESET_BANKS ? prev : [...prev, name]
      return prev.filter((n) => n !== name)
    })
  }

  async function handleStartSession() {
    setStartingSession(true)
    setSessionError(null)
    try {
      const loadedTilesets = await Promise.all(selectedTilesetNames.map((name) => loadTilesetAsset(name)))
      // Fundo (docs/PROGRESS.md, "Fundo como recurso salvo", 2026-09-30) é carregado junto, no
      // mesmo instante — decisão explícita do usuário: escolher o Fundo AQUI (não dentro da sessão
      // de pintura já aberta) evita ter que recombinar `tilesets`/`hardwareCombined` em tempo real
      // enquanto StageSession.tsx já está pintando. Entra no FIM da lista (depois dos tilesets
      // normais) — ordem só importa pra bater com o que foi salvo antes, ver stageTilesetRefs.ts.
      const loadedBackground = selectedBackgroundName ? await loadBackgroundAsset(selectedBackgroundName) : null
      const loaded = loadedBackground ? [...loadedTilesets, loadedBackground] : loadedTilesets
      const tilesetInputs: StageTilesetInput[] = loaded.map((t) => ({
        upload: toTilesetUpload(t.name, t.width, t.height, t.indices, t.palette),
        blockSize: t.meta.blockSize,
        // Achado ao adicionar "tilesets inteligentes" (2026-09-23): faltava aqui — uma sessão NOVA
        // (ao contrário de reabrir uma já salva, ver loadStage.ts) nunca gravava `name`/`version`,
        // então `StageSession.handleSave` nunca conseguia escrever `_tileset_refs.json` pra uma
        // fase recém-iniciada (só funcionava depois de já ter sido salva e reaberta uma vez).
        name: t.name,
        version: t.meta.version,
        terrainGroups: t.meta.terrainGroups,
        kind: loadedBackground && t === loadedBackground ? 'background' : undefined,
      }))
      const hardwareCombined = combineTilesets(
        tilesetInputs.map((t) => t.upload),
        HARDWARE_TILE_SIZE,
      )
      const merged = mergeTilesetMetaToHardware(
        hardwareCombined,
        loaded.map((t) => ({ width: t.width, height: t.height, indices: t.indices, palette: t.palette, label: t.name, meta: t.meta })),
      )
      setActiveSession({
        tilesets: tilesetInputs,
        tileCollision: merged.collision,
        tileLayer: merged.layer,
        tilePriority: merged.priority,
        widthTiles: newStageWidthTiles,
      })
      setSessionStaleness([]) // sessão nova, ainda não salva — não há o que comparar
      setSessionKey((k) => k + 1)
      build.reset()
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : String(err))
    } finally {
      setStartingSession(false)
    }
  }

  function handleCloseSession() {
    setActiveSession(null)
    setSelectedTilesetNames([])
    setSelectedBackgroundName(null)
    setSessionError(null)
  }

  /** Recarrega os tilesets (pixels + metadados) de uma sessão de pintura JÁ ABERTA — achado real do
   * usuário, 2026-10-05: trocar de aba (aqui o mesmo `StageWorkspace` renderiza "Tilesets"/
   * "Fundos"/"Fases", nunca desmonta a sessão ativa) pra editar e SALVAR um tileset que a sessão já
   * estava usando (ex.: marcar um bloco como "Camada 2"/"Na frente" DEPOIS de já ter clicado
   * "Começar a pintar") não atualizava NADA na sessão em andamento — `tilesets`/`tileCollision`/
   * `tileLayer`/`tilePriority` só eram calculados UMA VEZ, em `handleStartSession`/`handleEditStage`.
   * O bloco recém-marcado ficava invisível em todo lugar (paleta, seletor, painel C2), porque pro
   * React a sessão ainda achava que ele era do jeito de ANTES do save.
   *
   * Recarrega por NOME (mesmo caminho de `handleStartSession`/`loadStage.ts`) e substitui
   * `tilesets`/`tileCollision`/`tileLayer`/`tilePriority` da sessão ativa — `grid`/`gridLayer2`/
   * `entities` continuam intocados (vivem dentro do próprio `StageSession.tsx`, não aqui), então
   * isso NUNCA perde pintura em andamento. Sessões sem nome (fallback de reconstrução por pixel,
   * tileset apagado nesse meio tempo) não têm como recarregar — ficam como estão, sem travar nada. */
  async function loadRefreshedSessionTilesets(
    sessionTilesets: readonly StageTilesetInput[],
  ): Promise<Pick<ActiveSession, 'tilesets' | 'tileCollision' | 'tileLayer' | 'tilePriority'> | null> {
    if (!sessionTilesets.every((t) => t.name !== undefined)) return null
    const loaded = await Promise.all(
      sessionTilesets.map((t) => (t.kind === 'background' ? loadBackgroundAsset(t.name!) : loadTilesetAsset(t.name!))),
    )
    const tilesetInputs: StageTilesetInput[] = loaded.map((t, i) => ({
      upload: toTilesetUpload(t.name, t.width, t.height, t.indices, t.palette),
      blockSize: t.meta.blockSize,
      name: sessionTilesets[i].name,
      version: t.meta.version,
      terrainGroups: t.meta.terrainGroups,
      kind: sessionTilesets[i].kind,
    }))
    const hardwareCombined = combineTilesets(
      tilesetInputs.map((t) => t.upload),
      HARDWARE_TILE_SIZE,
    )
    const merged = mergeTilesetMetaToHardware(
      hardwareCombined,
      loaded.map((t) => ({ width: t.width, height: t.height, indices: t.indices, palette: t.palette, label: t.name, meta: t.meta })),
    )
    return { tilesets: tilesetInputs, tileCollision: merged.collision, tileLayer: merged.layer, tilePriority: merged.priority }
  }

  // Dispara sempre que a aba "Fases" volta a ficar ativa — é exatamente o momento em que o usuário
  // pode ter acabado de editar e salvar um tileset que a sessão já aberta usa (ver comentário de
  // `loadRefreshedSessionTilesets` acima). Mesmo padrão de `cancelled` do efeito de montagem acima
  // (evita aplicar uma resposta atrasada depois que o componente desmontou ou a aba trocou nesse
  // meio tempo) — e, crucialmente, evita que isto vire um loop: depende só de `activeTab`, nunca de
  // `activeSession` (que esta própria chamada atualiza).
  useEffect(() => {
    if (activeTab !== 'stages' || !activeSession) return
    // Sessão sem nome nenhum (fallback de reconstrução por pixel) não tem como recarregar — nem
    // tenta, só continua com os dados que já tinha.
    if (!activeSession.tilesets.every((t) => t.name !== undefined)) return
    let cancelled = false
    loadRefreshedSessionTilesets(activeSession.tilesets)
      .then((refreshed) => {
        if (cancelled || !refreshed) return
        setActiveSession((prev) => (prev ? { ...prev, ...refreshed } : prev))
      })
      .catch(() => {
        // Algum tileset referenciado sumiu/corrompeu nesse meio tempo — mantém a sessão como
        // estava em vez de travar a tela; o usuário ainda consegue salvar com os dados de antes.
      })
    return () => {
      cancelled = true
    }
  }, [activeTab])

  async function handleEditStage() {
    setStageBusy(true)
    try {
      const project = await loadStageProject()
      setActiveSession({
        tilesets: project.tilesets,
        tileCollision: project.tileCollision,
        tileLayer: project.tileLayer,
        tilePriority: project.tilePriority,
        widthTiles: project.widthTiles,
        seed: project.seed,
      })
      setSessionStaleness(project.staleness)
      setSessionKey((k) => k + 1)
      setSessionError(null)
      build.reset()
      // "Editar" só faz sentido mostrar o resultado na aba de pintura.
      onNavigate('stages')
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : String(err))
    } finally {
      setStageBusy(false)
    }
  }

  function handleStageDeleted() {
    refreshStage()
    // Salvar a fase sempre grava sob a base fixa (hoje só existe uma — ver stageDiscovery.ts),
    // então excluí-la enquanto está aberta na tela limpa a edição em andamento.
    handleCloseSession()
  }

  return (
    <section className={`panel${activeTab === 'stages' && activeSession ? ' stage-workspace-wide' : ''}`}>
      <h2
        title={
          activeTab === 'tilesets'
            ? 'Cadastre conjuntos de blocos (imagem + tamanho de bloco + colisão/camada de cada um). Editar um tileset salvo não muda fases já exportadas com ele.'
            : activeTab === 'backgrounds'
              ? 'Cadastre Fundos (imagem inteira, sem bloco) pra carimbar de uma vez na Camada 2 de uma fase.'
              : 'Escolha tilesets/Fundo já cadastrados e pinte o mapa.'
        }
      >
        {activeTab === 'tilesets' ? 'Tilesets' : activeTab === 'backgrounds' ? 'Fundos' : 'Fases'}
      </h2>

      {activeTab === 'tilesets' && (
        <>
          {editingTileset ? (
            <TilesetEditor
              seed={editingTileset === 'new' ? undefined : editingTileset}
              existingNames={tilesetSummaries.map((t) => t.name)}
              onSaved={handleTilesetSaved}
              onCancel={() => setEditingTileset(null)}
            />
          ) : (
            <>
              <SavedTilesets
                tilesets={tilesetSummaries}
                loading={tilesetsLoading}
                busyName={tilesetBusyName}
                onEdit={handleEditTileset}
                onDelete={handleDeleteTileset}
              />
              {tilesetError && <p className="error">{tilesetError}</p>}
              <div className="actions">
                <button type="button" onClick={() => setEditingTileset('new')}>
                  Novo tileset
                </button>
              </div>
            </>
          )}
        </>
      )}

      {activeTab === 'backgrounds' && (
        <>
          {editingBackground ? (
            <BackgroundEditor
              seed={editingBackground === 'new' ? undefined : editingBackground}
              existingNames={backgroundSummaries.map((b) => b.name)}
              onSaved={handleBackgroundSaved}
              onCancel={() => setEditingBackground(null)}
            />
          ) : (
            <>
              <SavedBackgrounds
                backgrounds={backgroundSummaries}
                loading={backgroundsLoading}
                busyName={backgroundBusyName}
                onEdit={handleEditBackground}
                onDelete={handleDeleteBackground}
              />
              {backgroundError && <p className="error">{backgroundError}</p>}
              <div className="actions">
                <button type="button" onClick={() => setEditingBackground('new')}>
                  Novo fundo
                </button>
              </div>
            </>
          )}
        </>
      )}

      {activeTab === 'stages' && (
        <>
          {stageLoading ? (
            <p className="hint">Procurando fase já salva...</p>
          ) : (
            hasSavedStage && (
              <SavedStage busy={stageBusy} onEdit={handleEditStage} onDeleted={handleStageDeleted} staleness={savedStageStaleness} />
            )
          )}
          {sessionError && <p className="error">{sessionError}</p>}

          {activeSession ? (
            <>
              <div className="actions">
                <button type="button" onClick={handleCloseSession}>
                  Fechar fase (trocar tilesets)
                </button>
              </div>
              {sessionStaleness.length > 0 && (
                <p
                  className="hint stage-staleness-warning"
                  title='Você já está vendo a versão atual de cada um aqui — "Salvar fase no jogo" atualiza a referência gravada, ou não salve pra manter como está.'
                >
                  {sessionStaleness.length === 1 ? 'Tileset mudou' : 'Tilesets mudaram'} desde a
                  última vez que esta fase foi salva:{' '}
                  {sessionStaleness.map((s, i) => (
                    <span key={s.name}>
                      {i > 0 && ', '}
                      <strong>{s.name}</strong> (v{s.savedVersion} → v{s.currentVersion})
                    </span>
                  ))}
                </p>
              )}
              <StageSession
                key={sessionKey}
                tilesets={activeSession.tilesets}
                tileCollision={activeSession.tileCollision}
                tileLayer={activeSession.tileLayer}
                tilePriority={activeSession.tilePriority}
                widthTiles={activeSession.widthTiles}
                seed={activeSession.seed}
                onSaved={refreshStage}
              />
            </>
          ) : tilesetsLoading ? (
            <p className="hint">Procurando tilesets já salvos...</p>
          ) : tilesetSummaries.length === 0 ? (
            !stageLoading &&
            !hasSavedStage && (
              <p className="hint">
                Nenhum tileset cadastrado ainda.{' '}
                <button type="button" onClick={() => onNavigate('tilesets')}>
                  Ir pra aba Tilesets
                </button>
              </p>
            )
          ) : (
            <>
              <h4 title="Cada um ocupa um banco de paleta de BG inteiro (docs/DATA_FORMAT.md § 4)">
                Escolha até {MAX_TILESET_BANKS} tilesets pra esta fase
              </h4>
              <ul className="stage-tileset-list">
                {tilesetSummaries.map((t) => (
                  <li key={t.name}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedTilesetNames.includes(t.name)}
                        disabled={!selectedTilesetNames.includes(t.name) && banksUsed >= MAX_TILESET_BANKS}
                        onChange={(e) => toggleSelectedTileset(t.name, e.target.checked)}
                      />{' '}
                      {t.name}
                    </label>
                  </li>
                ))}
              </ul>

              {backgroundSummaries.length > 0 && (
                <>
                  <h4 title="Imagem inteira carimbada de uma vez na Camada 2 (docs/PROGRESS.md, 'Fundo como recurso salvo') — também ocupa 1 banco de paleta de BG, igual um tileset. No máximo 1 por fase (a Camada 2 só tem 1 padrão residente).">
                    Fundo pra Camada 2 (opcional, no máximo 1)
                  </h4>
                  <ul className="stage-tileset-list">
                    <li>
                      <label>
                        <input
                          type="radio"
                          name="stage-background"
                          checked={selectedBackgroundName === null}
                          onChange={() => setSelectedBackgroundName(null)}
                        />{' '}
                        Nenhum
                      </label>
                    </li>
                    {backgroundSummaries.map((b) => (
                      <li key={b.name}>
                        <label>
                          <input
                            type="radio"
                            name="stage-background"
                            checked={selectedBackgroundName === b.name}
                            disabled={selectedBackgroundName !== b.name && banksUsed >= MAX_TILESET_BANKS}
                            onChange={() => setSelectedBackgroundName(b.name)}
                          />{' '}
                          {b.name}
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className="stage-width-picker">
                <label title="Largura da fase, em colunas de 8px — sempre múltiplo de 32 (1 tela/página de streaming da Anubis). Altura é sempre fixa: o streaming da Anubis só funciona no eixo horizontal.">
                  Largura da fase:{' '}
                  <select value={newStageWidthTiles} onChange={(e) => setNewStageWidthTiles(Number(e.target.value))}>
                    {Array.from({ length: STAGE_MAX_PAGES }, (_, i) => (i + 1) * STAGE_PAGE_TILES).map((width) => (
                      <option key={width} value={width}>
                        {width} colunas — {width / STAGE_PAGE_TILES} tela{width / STAGE_PAGE_TILES > 1 ? 's' : ''} (
                        {stageWidthPixels(width)}px)
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="actions">
                <button type="button" onClick={handleStartSession} disabled={selectedTilesetNames.length === 0 || startingSession}>
                  {startingSession ? 'Carregando...' : 'Começar a pintar'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
