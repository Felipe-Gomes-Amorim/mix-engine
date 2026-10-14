import { useEffect, useMemo, useRef, useState } from 'react'
import type { RgbColor } from '../../lib/indexedBmp.ts'
import { encodeIndexedBmp } from '../../lib/indexedBmp.ts'
import { composedToRgba } from '../../lib/metasprite/render.ts'
import { buildTileset } from '../../lib/tilemap/tileset.ts'
import { generateTilesetMeta, sanitizeTilesetFileName } from '../../lib/tilemap/tilesetAsset.ts'
import {
  COLLISION_CYCLE,
  COLLISION_LABELS,
  DEFAULT_STAGE_BLOCK_SIZE,
  STAGE_BLOCK_SIZES,
  TERRAIN_EDGE_ROLES,
  TERRAIN_INNER_CORNER_ROLES,
  TERRAIN_NOTCH_ROLES,
  TERRAIN_THIN_CAP_ROLES,
  TERRAIN_THIN_CORNER_ROLES,
  TERRAIN_THIN_CROSS_ROLES,
  TERRAIN_THIN_ROLES,
  type CollisionKind,
  type StageBlockSize,
  type TerrainGroup,
  type TerrainRole,
  type TileLayer,
  type Tileset,
} from '../../lib/tilemap/types.ts'
import type { LoadedTileset } from './loadTileset'
import { detectQuantizeOffer, type QuantizeOffer } from './quantizeFlow'
import { QuantizeConfirmModal } from './QuantizeConfirmModal'
import { readImageFile } from './readImageFile'
import { saveTilesetFile } from './tilesetFiles'
import { validateForExport } from './validation'

interface TilesetEditorProps {
  /** Tileset sendo editado (`undefined` = criando um novo). */
  seed?: LoadedTileset
  /** Nomes de tilesets já salvos — só pra avisar antes de sobrescrever um por engano ao criar um
   * novo com o mesmo nome (não bloqueia, o usuário pode querer sobrescrever mesmo). */
  existingNames: string[]
  onSaved: () => void
  onCancel: () => void
}

const TILE_THUMB_SIZE = 32

const COLLISION_BORDER_COLOR: Record<CollisionKind, string> = {
  empty: 'transparent',
  solid: '#2e9e4f',
  goal: '#c0392b',
}

/** Mesma cor de StageSession.tsx pra bloco de Camada 2 (decoração) — mantém a mesma linguagem
 * visual entre editar um tileset e usá-lo numa fase. */
const LAYER2_BORDER_COLOR = '#6b7fd7'

/** Mesma cor de StageSession.tsx (`TERRAIN_BORDER_COLOR`) pro ícone de um grupo de terreno na
 * lista (pedido do usuário, 2026-09-25: "faz com que na lista seja um ícone... da mesma forma que
 * é feito na edição de fase") — mesma linguagem visual entre cadastrar um terreno e escolhê-lo pra
 * pintar. */
const TERRAIN_BORDER_COLOR = '#3ee08a'

/** Nome curto + glifo de cada papel do esquema de 24 variantes (9 de borda + 4 de canto interno +
 * 2 de bloco fino + 4 de ponta de bloco fino + 4 de entalhe de lado inteiro + 1 de cruzamento de
 * bloco fino — docs/PROGRESS.md, "tilesets inteligentes" + complemento "cantos internos" + "mais
 * casos de autotile", 2026-09-23/25) — glifo cabe no espaço pequeno de um slot vazio no mini-grid,
 * nome completo vai só no `title` (tooltip). Cantos internos usam um glifo de triângulo cheio (▤
 * etc.) só pra ficar visualmente diferente das setas dos cantos convexos — mesmo papel de "canto",
 * mas o oposto (recorte pra dentro, não pra fora). Entalhes de lado inteiro usam um glifo de "duas
 * setas" (mesma direção do lado que fica vazio) — mesma ideia dos cantos internos, só que o recorte
 * cobre o lado INTEIRO (as duas diagonais daquele lado), não só 1 canto. Blocos finos usam uma seta
 * na direção em que o bloco fino SE ESTENDE (↕ pra coluna vertical, ↔ pra faixa horizontal —
 * achado real, 2026-09-25: estavam trocados, o que confundiu o usuário a atribuir a arte errada em
 * cada slot). Pontas de bloco fino usam um glifo de "cap"/tampa (⊓⊔⊏⊐) — mostra que aquele lado é o
 * FIM do bloco fino, diferente dos cantos normais (que assumem mais terreno continuando pro lado).
 * Cruzamento de bloco fino usa uma cruz (✛, achado real: faltava a interseção entre uma faixa fina
 * horizontal e uma coluna fina vertical). */
const TERRAIN_ROLE_LABELS: Record<TerrainRole, string> = {
  topLeft: 'Canto superior-esquerdo',
  top: 'Borda superior',
  topRight: 'Canto superior-direito',
  left: 'Borda esquerda',
  fill: 'Preenchimento',
  right: 'Borda direita',
  bottomLeft: 'Canto inferior-esquerdo',
  bottom: 'Borda inferior',
  bottomRight: 'Canto inferior-direito',
  innerTopLeft: 'Canto interno superior-esquerdo',
  innerTopRight: 'Canto interno superior-direito',
  innerBottomLeft: 'Canto interno inferior-esquerdo',
  innerBottomRight: 'Canto interno inferior-direito',
  thinHorizontal: 'Faixa fina horizontal (topo e base vazios, meio da faixa)',
  thinVertical: 'Coluna fina vertical (esquerda e direita vazias, meio da coluna)',
  thinVerticalTop: 'Topo da coluna fina vertical (fim de cima)',
  thinVerticalBottom: 'Base da coluna fina vertical (fim de baixo)',
  thinHorizontalLeft: 'Ponta esquerda da faixa fina horizontal (fim da esquerda)',
  thinHorizontalRight: 'Ponta direita da faixa fina horizontal (fim da direita)',
  notchTop: 'Entalhe de lado inteiro no topo',
  notchBottom: 'Entalhe de lado inteiro na base',
  notchLeft: 'Entalhe de lado inteiro à esquerda',
  notchRight: 'Entalhe de lado inteiro à direita',
  thinCross: 'Cruzamento entre faixa fina horizontal e coluna fina vertical',
  thinCornerTopLeft: 'Canto (cotovelo) superior-esquerdo de bloco fino',
  thinCornerTopRight: 'Canto (cotovelo) superior-direito de bloco fino',
  thinCornerBottomLeft: 'Canto (cotovelo) inferior-esquerdo de bloco fino',
  thinCornerBottomRight: 'Canto (cotovelo) inferior-direito de bloco fino',
}

const TERRAIN_ROLE_GLYPHS: Record<TerrainRole, string> = {
  topLeft: '↖',
  top: '↑',
  topRight: '↗',
  left: '←',
  fill: '▦',
  right: '→',
  bottomLeft: '↙',
  bottom: '↓',
  bottomRight: '↘',
  innerTopLeft: '◤',
  innerTopRight: '◥',
  innerBottomLeft: '◣',
  innerBottomRight: '◢',
  thinHorizontal: '↔',
  thinVertical: '↕',
  thinVerticalTop: '⊓',
  thinVerticalBottom: '⊔',
  thinHorizontalLeft: '⊏',
  thinHorizontalRight: '⊐',
  notchTop: '⇑',
  notchBottom: '⇓',
  notchLeft: '⇐',
  notchRight: '⇒',
  thinCross: '✛',
  thinCornerTopLeft: '⌜',
  thinCornerTopRight: '⌝',
  thinCornerBottomLeft: '⌞',
  thinCornerBottomRight: '⌟',
}

function nextCollisionKind(kind: CollisionKind): CollisionKind {
  const index = COLLISION_CYCLE.indexOf(kind)
  return COLLISION_CYCLE[(index + 1) % COLLISION_CYCLE.length]
}

/** Só o canvas de miniatura de um bloco — sem `<button>` em volta, pra dar pra usar dentro de OUTRO
 * elemento clicável (ex.: a linha inteira de um grupo de terreno na lista, pedido do usuário,
 * 2026-09-25) sem aninhar botão dentro de botão (HTML inválido, quebra o clique). `TileThumb`
 * abaixo é só isso + o botão em volta, pro uso normal (paleta de blocos avulsos). */
function TileCanvas({ source, tileset, tileIndex }: { source: HTMLCanvasElement | null; tileset: Tileset; tileIndex: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const col = tileIndex % tileset.cols
  const row = Math.floor(tileIndex / tileset.cols)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !source) return
    canvas.width = TILE_THUMB_SIZE
    canvas.height = TILE_THUMB_SIZE
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, TILE_THUMB_SIZE, TILE_THUMB_SIZE)
    ctx.drawImage(
      source,
      col * tileset.blockSize,
      row * tileset.blockSize,
      tileset.blockSize,
      tileset.blockSize,
      0,
      0,
      TILE_THUMB_SIZE,
      TILE_THUMB_SIZE,
    )
  }, [source, tileset.blockSize, col, row])

  return <canvas ref={ref} />
}

function TileThumb({
  source,
  tileset,
  tileIndex,
  selected,
  borderColor,
  title,
  onClick,
}: {
  source: HTMLCanvasElement | null
  tileset: Tileset
  tileIndex: number
  selected?: boolean
  borderColor?: string
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`tile-thumb${selected ? ' tile-thumb-selected' : ''}`}
      style={borderColor ? { borderColor } : undefined}
      onClick={onClick}
      title={title}
    >
      <TileCanvas source={source} tileset={tileset} tileIndex={tileIndex} />
    </button>
  )
}

interface UploadedImage {
  width: number
  height: number
  indices: Uint8Array
  palette: RgbColor[]
}

/**
 * Editor de UM grupo de terreno inteligente (docs/PROGRESS.md, "tilesets inteligentes",
 * 2026-09-23) — colisão/camada do grupo inteiro (um valor só, não por variante) + o mini-grid 3x3
 * de atribuição: clicar num papel abre a lista de blocos do tileset embaixo pra escolher qual
 * representa aquele papel (ou "Nenhum", pra desmarcar — cai no de preenchimento na hora de pintar,
 * ver autotile.ts). Papel sem bloco atribuído mostra um slot vazio com o glifo dele.
 */
function TerrainGroupEditor({
  group,
  tileset,
  tilesetPreview,
  onChange,
  onRemove,
  onClose,
}: {
  group: TerrainGroup
  tileset: Tileset
  tilesetPreview: HTMLCanvasElement | null
  onChange: (next: TerrainGroup) => void
  onRemove: () => void
  onClose: () => void
}) {
  const [pickingRole, setPickingRole] = useState<TerrainRole | null>(null)

  function setRole(role: TerrainRole, blockIndex: number | undefined) {
    const roles = { ...group.roles }
    if (blockIndex === undefined) delete roles[role]
    else roles[role] = blockIndex
    onChange({ ...group, roles })
    setPickingRole(null)
  }

  /** Um slot do mini-grid (borda/canto convexo OU canto interno, mesmo tratamento pros dois) —
   * bloco já atribuído mostra a miniatura dele, senão um placeholder vazio com o glifo do papel;
   * clicar em qualquer um abre/fecha a lista de blocos do tileset pra escolher. */
  function renderRoleSlot(role: TerrainRole) {
    const blockIndex = group.roles[role]
    const picking = pickingRole === role
    return blockIndex !== undefined ? (
      <TileThumb
        key={role}
        source={tilesetPreview}
        tileset={tileset}
        tileIndex={blockIndex}
        selected={picking}
        title={`${TERRAIN_ROLE_LABELS[role]}: bloco ${blockIndex} (clique pra trocar)`}
        onClick={() => setPickingRole(picking ? null : role)}
      />
    ) : (
      <button
        key={role}
        type="button"
        className={`tile-thumb terrain-role-slot-empty${picking ? ' tile-thumb-selected' : ''}`}
        title={`${TERRAIN_ROLE_LABELS[role]}: nenhum bloco (cai no de preenchimento) — clique pra escolher`}
        onClick={() => setPickingRole(picking ? null : role)}
      >
        {TERRAIN_ROLE_GLYPHS[role]}
      </button>
    )
  }

  return (
    <div className="terrain-group-editor">
      <div className="sheet-options">
        <strong>{group.name}</strong>
        <label>
          Colisão:{' '}
          <select
            value={group.collision}
            onChange={(e) => onChange({ ...group, collision: e.target.value as CollisionKind })}
          >
            {COLLISION_CYCLE.map((kind) => (
              <option key={kind} value={kind}>
                {COLLISION_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={group.layer === 2}
            onChange={(e) => onChange({ ...group, layer: e.target.checked ? 2 : 1 })}
          />{' '}
          Camada 2
        </label>
        <button type="button" onClick={onRemove}>
          Remover grupo
        </button>
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </div>

      <div className="terrain-role-grid">{TERRAIN_EDGE_ROLES.map(renderRoleSlot)}</div>

      <p
        className="hint"
        title="Só entra em jogo quando os 4 lados (não diagonal) já estão preenchidos pelo MESMO terreno — aí a diagonal decide se aparece um recorte aqui. Opcional: sem bloco atribuído, continua caindo no preenchimento normal."
      >
        Cantos internos (opcional)
      </p>
      <div className="terrain-role-grid terrain-role-grid-inner">{TERRAIN_INNER_CORNER_ROLES.map(renderRoleSlot)}</div>

      <p
        className="hint"
        title="Uma célula com esse terreno em cima/embaixo mas SEM NADA dos dois lados (uma coluna de 1 bloco de largura), ou dos lados mas SEM NADA em cima/embaixo (uma faixa de 1 bloco de altura) — o esquema normal só sabe desenhar 1 borda por vez, então sem isso um dos dois lados ficava sem borda nenhuma. Opcional: sem bloco atribuído, cai no preenchimento normal (mesmo bug de antes)."
      >
        Blocos finos — meio (opcional)
      </p>
      <div className="terrain-role-grid">{TERRAIN_THIN_ROLES.map(renderRoleSlot)}</div>

      <p
        className="hint"
        title="O FIM de uma coluna/faixa fina (só 1 lado com terreno, os outros 3 vazios) — sem isso, o fim reaproveitava um canto normal, que assume MAIS terreno continuando pro lado (errado aqui, não tem nada pros dois lados). Opcional: sem bloco atribuído, cai no preenchimento normal."
      >
        Blocos finos — ponta/fim (opcional)
      </p>
      <div className="terrain-role-grid">{TERRAIN_THIN_CAP_ROLES.map(renderRoleSlot)}</div>

      <p
        className="hint"
        title="Uma curva de 90° num caminho de 1 bloco de largura (ex.: vindo de baixo e virando pra direita) — sem isso, a curva reaproveitava um canto normal, que assume MAIS terreno preenchendo o lado de dentro da curva (errado aqui, não tem nada lá). Só se aplica quando o lado de dentro da curva está vazio — um canto de uma forma mais larga continua usando o canto normal de sempre. Opcional: sem bloco atribuído, cai no preenchimento normal."
      >
        Blocos finos — canto/cotovelo (opcional)
      </p>
      <div className="terrain-role-grid">{TERRAIN_THIN_CORNER_ROLES.map(renderRoleSlot)}</div>

      <p
        className="hint"
        title="Como os cantos internos, mas o recorte cobre o lado INTEIRO (as duas diagonais daquele lado vazias ao mesmo tempo) — acontece por exemplo numa coluna fina saindo do meio de uma base larga. Diagonais opostas vazias (ex. noroeste+sudeste) continuam sem variante, caem no preenchimento. Opcional: sem bloco atribuído, cai no preenchimento normal."
      >
        Entalhes de lado inteiro (opcional)
      </p>
      <div className="terrain-role-grid">{TERRAIN_NOTCH_ROLES.map(renderRoleSlot)}</div>

      <p
        className="hint"
        title="A interseção entre uma faixa fina horizontal e uma coluna fina vertical (os 4 cardeais preenchidos, mas os 4 cantos ao mesmo tempo vazios, já que os braços são finos dos dois lados) — ex.: um cruzamento tipo '+' de corredores de 1 bloco de largura. Opcional: sem bloco atribuído, cai no preenchimento normal."
      >
        Cruzamento de bloco fino (opcional)
      </p>
      <div className="terrain-role-grid">{TERRAIN_THIN_CROSS_ROLES.map(renderRoleSlot)}</div>

      {pickingRole && (
        <div className="tile-grid">
          <button type="button" className="tile-thumb terrain-role-slot-empty" onClick={() => setRole(pickingRole, undefined)}>
            Nenhum
          </button>
          {Array.from({ length: tileset.tileCount }, (_, tileIndex) => (
            <TileThumb
              key={tileIndex}
              source={tilesetPreview}
              tileset={tileset}
              tileIndex={tileIndex}
              selected={group.roles[pickingRole] === tileIndex}
              title={`Usar bloco ${tileIndex} pra "${TERRAIN_ROLE_LABELS[pickingRole]}"`}
              onClick={() => setRole(pickingRole, tileIndex)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Cria/edita UM tileset salvo (docs/PROGRESS.md, "tilesets como recurso salvo e reutilizável",
 * 2026-09-23) — importar imagem, escolher tamanho de bloco, marcar colisão e camada por bloco,
 * salvar com um nome. Migrado do que já existia dentro do fluxo de fase (StageEditor.tsx antigo) —
 * a diferença é que aqui trabalha com UM tileset só (`buildTileset`), não vários combinados
 * (`combineTilesets`) — isso só faz sentido depois de escolher QUAIS tilesets uma fase usa, na aba
 * "Fases".
 */
export function TilesetEditor({ seed, existingNames, onSaved, onCancel }: TilesetEditorProps) {
  const [name, setName] = useState(seed?.name ?? '')
  const [upload, setUpload] = useState<UploadedImage | null>(
    seed ? { width: seed.width, height: seed.height, indices: seed.indices, palette: seed.palette } : null,
  )
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [quantizeOffer, setQuantizeOffer] = useState<QuantizeOffer | null>(null)
  const [blockSize, setBlockSize] = useState<StageBlockSize>(seed?.meta.blockSize ?? DEFAULT_STAGE_BLOCK_SIZE)
  const [tileCollision, setTileCollision] = useState<Map<number, CollisionKind>>(() => new Map(seed?.meta.collision))
  const [tileLayer, setTileLayer] = useState<Map<number, TileLayer>>(() => new Map(seed?.meta.layer))
  const [tilePriority, setTilePriority] = useState<Map<number, boolean>>(() => new Map(seed?.meta.priority))
  const [terrainGroups, setTerrainGroups] = useState<TerrainGroup[]>(() => seed?.meta.terrainGroups ?? [])
  const [editingGroupIndex, setEditingGroupIndex] = useState<number | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const availableBlockSizes = useMemo(
    () => (upload ? STAGE_BLOCK_SIZES.filter((size) => upload.width % size === 0 && upload.height % size === 0) : []),
    [upload],
  )

  const tileset = useMemo(() => {
    if (!upload) return null
    try {
      return buildTileset(upload.width, upload.height, upload.indices, blockSize)
    } catch {
      return null // não deveria acontecer (availableBlockSizes já filtra), mas não trava a tela
    }
  }, [upload, blockSize])

  const tilesetPreview = useMemo(() => {
    if (!tileset || !upload) return null
    const canvas = document.createElement('canvas')
    canvas.width = tileset.sourceWidth
    canvas.height = tileset.sourceHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const rgba = composedToRgba(
      { width: tileset.sourceWidth, height: tileset.sourceHeight, originX: 0, originY: 0, pixels: tileset.sourceIndices },
      upload.palette,
    )
    ctx.putImageData(new ImageData(rgba, tileset.sourceWidth, tileset.sourceHeight), 0, 0)
    return canvas
  }, [tileset, upload])

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
      setUpload({ width: imageData.width, height: imageData.height, indices: validation.indices, palette: validation.palette })
      setBlockSize(DEFAULT_STAGE_BLOCK_SIZE)
      setTileCollision(new Map())
      setTileLayer(new Map())
      setTilePriority(new Map())
      setTerrainGroups([])
      setEditingGroupIndex(null)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err))
    }
  }

  /** Confirmado no QuantizeConfirmModal (docs/PROGRESS.md, "quantização automática de paleta",
   * 2026-09-25) — sempre válida por construção (quantizeImageData garante ≤16 cores), mesmo
   * caminho de estado de um upload que passou de primeira. */
  function applyQuantized(imageData: ImageData) {
    const validation = validateForExport(imageData)
    if (!validation.ok) return // não deveria acontecer — quantizeImageData garante ≤16 cores
    setUpload({ width: imageData.width, height: imageData.height, indices: validation.indices, palette: validation.palette })
    setBlockSize(DEFAULT_STAGE_BLOCK_SIZE)
    setTileCollision(new Map())
    setTileLayer(new Map())
    setTilePriority(new Map())
    setTerrainGroups([])
    setEditingGroupIndex(null)
    setUploadError(null)
    setQuantizeOffer(null)
  }

  function handleBlockSizeChange(next: StageBlockSize) {
    setBlockSize(next)
    // Numeração de bloco muda com o tamanho — entradas antigas (colisão/camada/prioridade POR
    // BLOCO e também os papéis de cada grupo de terreno, que também apontam pra um índice de
    // bloco) apontariam pro bloco errado (mesma decisão de StageSession.tsx pro seletor de tamanho
    // de bloco durante a pintura).
    setTileCollision(new Map())
    setTileLayer(new Map())
    setTilePriority(new Map())
    setTerrainGroups([])
    setEditingGroupIndex(null)
  }

  function addTerrainGroup() {
    const name = newGroupName.trim()
    if (!name) return
    const newIndex = terrainGroups.length
    setTerrainGroups((prev) => [...prev, { name, collision: 'solid', layer: 1, roles: {} }])
    setEditingGroupIndex(newIndex)
    setNewGroupName('')
  }

  function updateTerrainGroup(index: number, next: TerrainGroup) {
    setTerrainGroups((prev) => prev.map((g, i) => (i === index ? next : g)))
  }

  function removeTerrainGroup(index: number) {
    setTerrainGroups((prev) => prev.filter((_, i) => i !== index))
    setEditingGroupIndex(null)
  }

  function cycleCollision(tileIndex: number) {
    setTileCollision((prev) => {
      const next = new Map(prev)
      next.set(tileIndex, nextCollisionKind(prev.get(tileIndex) ?? 'empty'))
      return next
    })
  }

  function layerOf(tileIndex: number): TileLayer {
    return tileLayer.get(tileIndex) ?? 1
  }

  function setLayerFor(tileIndex: number, layer: TileLayer) {
    setTileLayer((prev) => {
      const next = new Map(prev)
      if (layer === 1) next.delete(tileIndex)
      else next.set(tileIndex, 2)
      return next
    })
    if (layer === 2) {
      setTileCollision((prev) => {
        if (!prev.has(tileIndex)) return prev
        const next = new Map(prev)
        next.delete(tileIndex)
        return next
      })
      // Prioridade só faz sentido pra Camada 1 (docs/DATA_FORMAT.md § 4, "Bit de prioridade por
      // tile da Camada 1") — virar Camada 2 limpa a marcação, mesma lógica da colisão acima.
      setTilePriority((prev) => {
        if (!prev.has(tileIndex)) return prev
        const next = new Map(prev)
        next.delete(tileIndex)
        return next
      })
    }
  }

  function hasPriority(tileIndex: number): boolean {
    return tilePriority.get(tileIndex) ?? false
  }

  function togglePriority(tileIndex: number) {
    setTilePriority((prev) => {
      const next = new Map(prev)
      if (next.has(tileIndex)) next.delete(tileIndex)
      else next.set(tileIndex, true)
      return next
    })
  }

  const sanitizedName = sanitizeTilesetFileName(name)
  const nameCollides = !seed && existingNames.includes(sanitizedName)

  async function handleSave() {
    if (!tileset || !upload || !name.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      const bmp = encodeIndexedBmp(upload.width, upload.height, upload.indices, upload.palette)
      // Sobe a cada save (docs/PROGRESS.md, "fase referencia tileset por nome", 2026-09-23) — é
      // isso que deixa uma fase salva saber se este tileset mudou desde que ela foi salva.
      const version = (seed?.meta.version ?? 0) + 1
      const metaJson = generateTilesetMeta({
        version,
        blockSize,
        collision: tileCollision,
        layer: tileLayer,
        priority: tilePriority,
        terrainGroups,
      })
      const bmpResult = await saveTilesetFile(`${sanitizedName}_tileset.bmp`, bmp)
      if (!bmpResult.ok) {
        setSaveError(bmpResult.message)
        return
      }
      const metaResult = await saveTilesetFile(
        `${sanitizedName}_tileset.json`,
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

  const solidCount = [...tileCollision.values()].filter((k) => k === 'solid').length
  const goalCount = [...tileCollision.values()].filter((k) => k === 'goal').length

  return (
    <div className="sequencer">
      <h3>{seed ? `Editando "${seed.name}"` : 'Novo tileset'}</h3>

      <label className="sheet-options">
        Nome do tileset:{' '}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!!seed}
          placeholder="ex.: floresta"
        />
      </label>
      {!seed && sanitizedName && <p className="hint">Vai salvar como "{sanitizedName}_tileset.bmp/.json".</p>}
      {nameCollides && (
        <p className="hint">Já existe um tileset chamado "{sanitizedName}" — salvar vai SUBSTITUIR ele.</p>
      )}
      {seed && <p className="hint">O nome não pode ser trocado depois de criado.</p>}

      {!upload && (
        <>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            title="Mesmas regras de Cenário: dimensões múltiplas de 8, no máximo 16 cores"
          />
          {uploadError && <p className="error">{uploadError}</p>}
          {quantizeOffer && (
            <QuantizeConfirmModal offer={quantizeOffer} onConfirm={applyQuantized} onCancel={() => setQuantizeOffer(null)} />
          )}
        </>
      )}

      {upload && tileset && (
        <>
          <div className="actions">
            <label className="stage-add-tileset">
              Trocar imagem
              <input type="file" accept="image/*" onChange={handleFileChange} />
            </label>
          </div>
          {uploadError && <p className="error">{uploadError}</p>}

          {availableBlockSizes.length > 1 && (
            <div className="sheet-options">
              <label>
                Tamanho de cada bloco:{' '}
                <select
                  aria-label="Tamanho do bloco"
                  value={blockSize}
                  onChange={(e) => handleBlockSizeChange(Number(e.target.value) as StageBlockSize)}
                >
                  {availableBlockSizes.map((size) => (
                    <option key={size} value={size}>
                      {size} × {size} pixels
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <h4 title='Clique num bloco pra alternar entre vazio, sólido (verde) e bandeira (vermelho, chegada da fase). "Camada 2" = decoração sem colisão, desenhada atrás do resto.'>
            O que é cada bloco?
          </h4>
          <div className="tile-grid">
            {Array.from({ length: tileset.tileCount }, (_, tileIndex) => {
              const layer = layerOf(tileIndex)
              const kind = tileCollision.get(tileIndex) ?? 'empty'
              return (
                <div className="stage-tile-cell" key={tileIndex}>
                  <TileThumb
                    source={tilesetPreview}
                    tileset={tileset}
                    tileIndex={tileIndex}
                    borderColor={layer === 2 ? LAYER2_BORDER_COLOR : COLLISION_BORDER_COLOR[kind]}
                    title={
                      layer === 2
                        ? `Bloco ${tileIndex}: Camada 2 (decoração, sem colisão)`
                        : `Bloco ${tileIndex}: ${COLLISION_LABELS[kind]} (clique pra mudar)`
                    }
                    onClick={() => {
                      if (layer === 1) cycleCollision(tileIndex)
                    }}
                  />
                  <label className="hint stage-tile-layer-toggle stage-tile-layer2-toggle">
                    <input
                      type="checkbox"
                      checked={layer === 2}
                      onChange={(e) => setLayerFor(tileIndex, e.target.checked ? 2 : 1)}
                    />{' '}
                    Camada 2
                  </label>
                  <label
                    className="hint stage-tile-layer-toggle stage-tile-priority-toggle"
                    title={
                      layer === 2
                        ? 'Só faz sentido pra blocos de Camada 1 — a Camada 2 sempre fica atrás dos sprites.'
                        : 'Desenha este bloco NA FRENTE do jogador/inimigo (só os pixels opacos — o resto do tile continua transparente pro sprite). Independente da colisão (docs/DATA_FORMAT.md § 4, "Bit de prioridade por tile da Camada 1").'
                    }
                  >
                    <input
                      type="checkbox"
                      checked={hasPriority(tileIndex)}
                      disabled={layer === 2}
                      onChange={() => togglePriority(tileIndex)}
                    />{' '}
                    Na frente
                  </label>
                </div>
              )
            })}
          </div>
          <p className="hint">
            {solidCount} bloco(s) sólido(s), {goalCount} bandeira(s) marcada(s).
          </p>

          <h4 title="Agrupe blocos JÁ existentes acima como as 9 variantes (borda/canto/preenchimento) de um mesmo terreno — na aba Fases, um pincel escolhe a variante certa sozinho pelos vizinhos, em vez de você escolher bloco a bloco.">
            Terrenos inteligentes
          </h4>
          {terrainGroups.length > 0 && (
            <ul className="terrain-group-list">
              {terrainGroups.map((group, index) => {
                const previewBlockIndex = group.roles.fill ?? Object.values(group.roles)[0]
                return (
                  <li key={index}>
                    <button
                      type="button"
                      className={`terrain-group-item${editingGroupIndex === index ? ' terrain-group-item-active' : ''}`}
                      onClick={() => setEditingGroupIndex(editingGroupIndex === index ? null : index)}
                      title={`Editar o terreno "${group.name}"`}
                    >
                      <span className="tile-thumb terrain-group-icon" style={{ borderColor: TERRAIN_BORDER_COLOR }}>
                        {previewBlockIndex !== undefined ? (
                          <TileCanvas source={tilesetPreview} tileset={tileset} tileIndex={previewBlockIndex} />
                        ) : (
                          '?'
                        )}
                      </span>
                      <span className="terrain-group-name">{group.name}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="sheet-options">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="nome do terreno (ex.: grama)"
            />
            <button type="button" onClick={addTerrainGroup} disabled={!newGroupName.trim()}>
              Novo grupo
            </button>
          </div>
          {editingGroupIndex !== null && terrainGroups[editingGroupIndex] && (
            <TerrainGroupEditor
              group={terrainGroups[editingGroupIndex]}
              tileset={tileset}
              tilesetPreview={tilesetPreview}
              onChange={(next) => updateTerrainGroup(editingGroupIndex, next)}
              onRemove={() => removeTerrainGroup(editingGroupIndex)}
              onClose={() => setEditingGroupIndex(null)}
            />
          )}
        </>
      )}

      <div className="actions">
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
        <button type="button" onClick={handleSave} disabled={saving || !upload || !tileset || !name.trim()}>
          {saving ? 'Salvando...' : 'Salvar tileset'}
        </button>
      </div>
      {saveError && <p className="error">{saveError}</p>}
    </div>
  )
}
