// Modelo de dados do editor de fase (docs/DATA_FORMAT.md seção 4).
//
// O hardware do SNES só entende tile de BG 8x8 (`bgInitMapSet`/`SC_32x32`,
// `tilemapData` em src/tilemap.c da engine é u16[32*32] de tiles 8x8) — isso
// NÃO muda. Mas o Prometeus deixa o usuário PINTAR em "blocos" maiores
// (16x16, por exemplo — 2x2 tiles de 8x8), se o conjunto de imagens dele já
// foi desenhado nesse tamanho: é só conveniência de desenho, o hardware
// nem percebe a diferença (o array de colisão exportado sempre sai na
// granularidade fixa de 8x8/32x32 que a engine espera).

/** Base fixa da fase — hoje só existe uma (v1 do GDD: 1 fase, do início ao fim, sem seleção de
 * fases). Não modelada como "slot" com seletor (characterSlots.ts) porque não haveria opção B pra
 * escolher ainda; documentado em docs/DATA_FORMAT.md § 4 que isso pode crescer depois. */
export const STAGE_BASE_NAME = 'stage1'

/** Tile de BG nativo do SNES — sempre 8x8, é a granularidade do array de colisão exportado. */
export const HARDWARE_TILE_SIZE = 8

/** Altura da fase em TILES de hardware (8px) — SEMPRE 32, restrição real e definitiva da Anubis
 * (docs/DATA_FORMAT.md § 4, proposta v3 fechada em 2026-09-24: `src/tilemap.c` tem `#error` de
 * build pra qualquer altura diferente — o streaming de tilemap só existe no eixo horizontal, a
 * câmera cobre o eixo vertical inteiro sem precisar de janela). Diferente da largura (abaixo), isso
 * NÃO é configurável por fase. */
export const STAGE_HEIGHT_TILES = 32
export const STAGE_HEIGHT_PIXELS = STAGE_HEIGHT_TILES * HARDWARE_TILE_SIZE

/** Largura da fase — CONFIGURÁVEL por fase (docs/PROGRESS.md, "fases largas de verdade",
 * 2026-09-24, depois da Anubis fechar 🟢 a proposta v3 de streaming de tilemap): sempre um número
 * inteiro de "páginas" de `STAGE_PAGE_TILES` colunas (32 tiles = 1 tela, `SC_32x32`), de 1 até
 * `STAGE_MAX_PAGES` páginas. Limite máximo é da PRÓPRIA Anubis, não escolha nossa — a conta de
 * ponteiro `s16` do streaming de página (`docs/DATA_FORMAT.md` § 4) trava em 15 páginas (480
 * colunas = 3840px). Fora desses múltiplos/limite, o build da Anubis quebra de propósito com
 * `#error` (não desenha lixo em silêncio) — a UI (StageWorkspace.tsx) impede escolher um valor
 * inválido antes mesmo de chegar no export. */
export const STAGE_PAGE_TILES = 32
export const STAGE_MAX_PAGES = 15
export const STAGE_MIN_WIDTH_TILES = STAGE_PAGE_TILES
export const STAGE_MAX_WIDTH_TILES = STAGE_PAGE_TILES * STAGE_MAX_PAGES
/** Largura padrão pra uma fase nova — 1 página, mesmo tamanho de sempre antes dessa etapa. */
export const STAGE_DEFAULT_WIDTH_TILES = STAGE_PAGE_TILES

export function isValidStageWidthTiles(widthTiles: number): boolean {
  return (
    Number.isInteger(widthTiles) &&
    widthTiles >= STAGE_MIN_WIDTH_TILES &&
    widthTiles <= STAGE_MAX_WIDTH_TILES &&
    widthTiles % STAGE_PAGE_TILES === 0
  )
}

export function stageWidthPixels(widthTiles: number): number {
  return widthTiles * HARDWARE_TILE_SIZE
}

/** Orçamento de VRAM (docs/PROGRESS.md, "fases largas de verdade", 2026-09-24; endereços de
 * `docs/ARCHITECTURE.md` da Anubis, § Estrutura de memória — VRAM é endereçada em PALAVRAS de 16
 * bits, não bytes, `0x0000`-`0x7FFF`) — cada tile de hardware 4bpp ocupa 32 bytes = 16 palavras. O
 * tileset de CADA camada fica INTEIRO residente (só o `.map`/mapa é que tem janela de streaming),
 * então o número de tiles ÚNICOS depois do dedup do `gfx4snes` não pode passar do espaço reservado
 * pra ele, senão a Anubis sobrescreve dado adjacente em silêncio (ela não detecta isso sozinha
 * hoje — o aviso tem que vir do lado do Prometeus, antes de exportar).
 * - Camada 1: `0x2000`-`0x3000` = 0x1000 palavras = 4096 palavras = 8192 bytes / 32 = 256 tiles.
 * - Camada 2: `0x4000`-`0x4800` = 0x800 palavras = 2048 palavras = 4096 bytes / 32 = 128 tiles.
 * As duas camadas continuam dividindo os mesmos 8 bancos de paleta de BG (docs/DATA_FORMAT.md § 4,
 * "múltiplos tilesets com paleta por bloco") — isso não muda, só o limite de tiles é novo. */
export const VRAM_LAYER1_MAX_UNIQUE_TILES = 256
export const VRAM_LAYER2_MAX_UNIQUE_TILES = 128

/** Largura da Camada 2 — INDEPENDENTE da largura da fase (`STAGE_*_WIDTH_TILES` acima), diferente
 * de tudo mais neste arquivo (docs/DATA_FORMAT.md § 4, "Camada 2 com parallax — padrão que se
 * repete", Anubis 2026-09-29): ela agora fica INTEIRA residente na VRAM e o hardware REPETE ela
 * sozinho (wraparound), rolando mais devagar que a Camada 1 (parallax) — não é mais um mapa do
 * comprimento da fase. Só 2 larguras fazem sentido pintar: `32` (repete a cada 256px de Camada 2 =
 * 512px de câmera) ou `64` (repete a cada 512px = 1024px de câmera, o MÁXIMO que a Anubis lê — o
 * que passar disso é aceito no build dela mas simplesmente ignorado, só as 64 primeiras colunas
 * aparecem no jogo). Altura continua sempre `STAGE_HEIGHT_TILES` (32), igual à Camada 1. */
export const LAYER2_WIDTH_OPTIONS = [32, 64] as const
export type Layer2WidthTiles = (typeof LAYER2_WIDTH_OPTIONS)[number]
export const LAYER2_DEFAULT_WIDTH_TILES: Layer2WidthTiles = 32
/** O que a Anubis efetivamente LÊ da Camada 2, não importa o quanto foi exportado (ver comentário
 * acima) — usado pra avisar antes de exportar se a Camada 2 pintada passar disso (desperdiça
 * espaço/VRAM.bmp em silêncio, sem isso). */
export const LAYER2_MAX_USEFUL_WIDTH_TILES = 64

/** O SNES (modo NTSC, o que a engine usa) só renderiza 224 linhas de altura por tela — as últimas
 * fileiras de 8px de uma tela de 32x32 tiles (linhas 28-31, 4 no total) existem no hardware e
 * contam pra colisão, mas nunca aparecem na tela. Achado real: um usuário pintou o chão da
 * stage1 exatamente nessa faixa e ele "sumiu" (colidível, invisível) — .bmp/.map/collision.h
 * batiam entre si, não era bug de import/export, só a área caindo fora da região visível. */
export const SNES_VISIBLE_HEIGHT_PIXELS = 224

/** Tamanhos de bloco que o usuário pode escolher pra desenhar (múltiplos do tile de hardware, que
 * sempre dividem STAGE_PAGE_TILES/STAGE_HEIGHT_TILES certinho, já que os dois são múltiplos de 32).
 * 16x16 = 2x2 tiles de 8x8; 32x32 = 4x4. */
export const STAGE_BLOCK_SIZES = [8, 16, 32] as const
export type StageBlockSize = (typeof STAGE_BLOCK_SIZES)[number]
export const DEFAULT_STAGE_BLOCK_SIZE: StageBlockSize = 8

/** CGRAM do lado BG do SNES: 8 bancos de 16 cores (docs/DATA_FORMAT.md § 4, "múltiplos
 * tilesets com paleta por bloco"). Cada tileset importado ocupa 1 banco inteiro — o número do
 * banco de cada tile vem do nibble alto do índice de cor do seu primeiro pixel (mecanismo real do
 * `gfx4snes`, confirmado por teste direto contra o binário em 2026-09-21, ver combineTilesets.ts). */
export const MAX_TILESET_BANKS = 8
export const COLORS_PER_BANK = 16

/**
 * Colisão de cada bloco — mesma convenção 0/1/2 já usada em
 * `tilemapBuildTestLevel()` (src/tilemap.c da engine): vazio (sem colisão),
 * sólido (chão/parede/plataforma) e bandeira (chegada, não sólida).
 */
export type CollisionKind = 'empty' | 'solid' | 'goal'

export const COLLISION_VALUES: Record<CollisionKind, number> = { empty: 0, solid: 1, goal: 2 }

export const COLLISION_LABELS: Record<CollisionKind, string> = {
  empty: 'Vazio',
  solid: 'Sólido',
  goal: 'Bandeira (chegada)',
}

/** Ordem de ciclo ao clicar num bloco do conjunto (ver StageEditor.tsx). */
export const COLLISION_CYCLE: readonly CollisionKind[] = ['empty', 'solid', 'goal']

/** Conjunto de blocos (tileset): a imagem de origem fatiada em blocos de `blockSize`, ordem raster. */
export interface Tileset {
  blockSize: StageBlockSize
  cols: number
  rows: number
  tileCount: number
  sourceWidth: number
  sourceHeight: number
  /** Índices de cor (0 = transparente) da imagem de origem inteira, não fatiada. */
  sourceIndices: Uint8Array
}

/** Um tileset combinado (ver combineTilesets.ts) empilha até 8 tilesets importados num só
 * `Tileset` raster — cada "faixa" é um deles, com seu próprio banco de paleta de BG. */
export interface TilesetBand {
  /** Banco de paleta de BG (0..MAX_TILESET_BANKS-1) — também a ordem de importação. */
  bankIndex: number
  /** Nome do arquivo de origem, só pra rotular a bandeja de blocos na UI. */
  label: string
  cols: number
  rows: number
  tileCount: number
  /** Offset (em blocos) no eixo Y dentro do raster combinado — os tilesets são empilhados
   * verticalmente; some com `localRow` pra achar a linha do bloco no `Tileset` combinado. */
  rowOffset: number
}

/** Qual bloco do tileset combinado (índice) está pintado em cada célula da grade — vazio (0) por
 * padrão. `Uint16Array` (não `Uint8Array`): com até 8 tilesets combinados o total de blocos
 * facilmente passa de 255. O comprimento depende do `blockSize` do tileset E da largura escolhida
 * da fase: `stageGridCols(blockSize, widthTiles) * stageGridRows(blockSize)`. */
export type StageGrid = Uint16Array

/** Valor sentinela pra "nada pintado ainda nessa célula" em `StageGrid` — só faz sentido pra
 * Camada 2 (docs/DATA_FORMAT.md § 4, "2ª camada de tileset"): a Camada 1 sempre cobre a tela
 * inteira (não muda, célula nunca pintada nela já usava o bloco 0 desde sempre), mas a Camada 2 é
 * esparsa por natureza (decoração) — sem isso, uma fase nova mostraria o primeiro bloco de
 * decoração cobrindo a tela toda antes do usuário pintar qualquer coisa. `0xffff` nunca é um
 * índice de bloco de verdade (combinar 8 tilesets nunca chega nem perto disso). */
export const NO_TILE = 0xffff

/** Camada de BG que um bloco do tileset ocupa (docs/DATA_FORMAT.md § 4, "2ª camada de tileset",
 * 2026-09-22) — propriedade do BLOCO no conjunto (marcada junto da colisão), não da célula
 * pintada: 1 = chão de sempre (com colisão), 2 = decoração atrás de tudo (sem colisão, sempre
 * atrás da Camada 1 e dos sprites). Bloco sem entrada na tabela conta como Camada 1 (compatível
 * com toda fase salva antes dessa mudança existir). */
export type TileLayer = 1 | 2

/** `widthTiles` (docs/PROGRESS.md, "fases largas de verdade", 2026-09-24) é a largura ESCOLHIDA da
 * fase, em tiles de hardware — sempre um múltiplo de `STAGE_PAGE_TILES`, validado por
 * `isValidStageWidthTiles` em quem monta esse valor (StageWorkspace.tsx), não recalidado aqui. */
export function stageGridCols(blockSize: StageBlockSize, widthTiles: number): number {
  return stageWidthPixels(widthTiles) / blockSize
}

export function stageGridRows(blockSize: StageBlockSize): number {
  return STAGE_HEIGHT_PIXELS / blockSize
}

/** Os 9 papéis "de borda" do esquema de autotile (docs/PROGRESS.md, "tilesets inteligentes",
 * 2026-09-23) — cobre borda + canto CONVEXO + preenchimento de um terreno (grama, terra etc.).
 * Ordem AQUI importa: é a ordem de varredura raster (esquerda->direita, cima->baixo) do mini-grid
 * 3x3 principal na UI de agrupamento (TilesetEditor.tsx) — ver autotile.ts pra como cada papel é
 * escolhido a partir dos vizinhos. */
export const TERRAIN_EDGE_ROLES = [
  'topLeft',
  'top',
  'topRight',
  'left',
  'fill',
  'right',
  'bottomLeft',
  'bottom',
  'bottomRight',
] as const

/** Os 4 papéis de canto CÔNCAVO/interno (docs/PROGRESS.md, complemento "cantos internos",
 * 2026-09-23) — só entram em jogo quando os 4 vizinhos cardeais já estão preenchidos (célula que
 * seria "preenchimento") mas EXATAMENTE 1 vizinho diagonal não está, ex.: chão sólido com um
 * recorte de 1 célula numa quina. Opcionais: grupo sem nenhum atribuído continua caindo no
 * preenchimento normal nesse caso (mesma regra de fallback dos outros papéis). Mais de 1 diagonal
 * vazia ao mesmo tempo não tem variante exata neste esquema de 13 (o blob completo de 47
 * resolveria) — cai em preenchimento por decisão de escopo, ver autotile.ts. Seção própria na UI
 * ("Cantos internos (opcional)"), separada do mini-grid 3x3 principal. */
export const TERRAIN_INNER_CORNER_ROLES = ['innerTopLeft', 'innerTopRight', 'innerBottomLeft', 'innerBottomRight'] as const

/** Bloco FINO (docs/PROGRESS.md, "mais casos de autotile", 2026-09-25) — os dois lados
 * PERPENDICULARES a um eixo fechados ao mesmo tempo, mas o eixo em si continuando nos dois
 * sentidos: uma coluna de 1 bloco de largura (`thinVertical`: leste E oeste vazios, norte E sul
 * preenchidos) ou uma faixa de 1 bloco de altura (`thinHorizontal`: norte E sul vazios, leste E
 * oeste preenchidos). O esquema de 9 variantes (`TERRAIN_EDGE_ROLES`) só decide UM lado por vez
 * (esquerda OU direita, nunca as duas ao mesmo tempo) — sem esses dois papéis, o lado oposto ficava
 * sem borda nenhuma (visualmente "sumindo"). Ver `autotile.ts` pra quando cada um é escolhido. */
export const TERRAIN_THIN_ROLES = ['thinHorizontal', 'thinVertical'] as const

/** PONTA (topo/base/extremo) de um bloco fino (docs/PROGRESS.md, "mais casos de autotile",
 * 2026-09-25, achado real: sem isso, o fim de uma coluna/faixa fina reaproveitava um canto
 * CONVEXO normal — `topLeft` etc. — que assume o lado "fechado" continuando com mais terreno; num
 * bloco fino de largura/altura 1 não existe nada pros dois lados, então esse canto mostrava só 1
 * borda certa e a outra errada, meio "sem fim"). Exatamente 1 cardeal preenchido (os outros 3
 * vazios) só é geometricamente possível na ponta de um bloco fino — os 4 papéis dizem qual
 * extremo é: `thinVerticalTop` (só o sul preenchido — a coluna desce a partir daqui),
 * `thinVerticalBottom` (só o norte), `thinHorizontalLeft` (só o leste — a faixa continua pra
 * direita a partir daqui) e `thinHorizontalRight` (só o oeste). Opcionais: sem bloco atribuído,
 * cai no preenchimento normal, mesma regra de sempre. */
export const TERRAIN_THIN_CAP_ROLES = ['thinVerticalTop', 'thinVerticalBottom', 'thinHorizontalLeft', 'thinHorizontalRight'] as const

/** Entalhe de LADO INTEIRO (docs/PROGRESS.md, "mais casos de autotile", 2026-09-25) — complemento
 * dos 4 cantos internos (`TERRAIN_INNER_CORNER_ROLES`, exatamente 1 diagonal vazia) pro caso de
 * exatamente 2 diagonais vazias ADJACENTES (compartilham um lado cardeal: as duas de cima
 * `notchTop`, as duas de baixo `notchBottom`, as duas da esquerda `notchLeft`, as duas da direita
 * `notchRight`) — ex.: uma coluna fina saindo pra cima do meio de uma base larga (as duas diagonais
 * de cima ficam vazias na célula onde a coluna nasce, mas os 4 cardeais continuam preenchidos).
 * Duas diagonais OPOSTAS vazias ao mesmo tempo (ex. noroeste+sudeste) não têm variante — combinação
 * rara, continua caindo em preenchimento por decisão explícita de escopo (esquema de 19 papéis, não
 * o blob completo de 47 — ver `autotile.ts`). */
export const TERRAIN_NOTCH_ROLES = ['notchTop', 'notchBottom', 'notchLeft', 'notchRight'] as const

/** CRUZAMENTO de bloco fino (docs/PROGRESS.md, "mais casos de autotile", 2026-09-25, achado real:
 * faltava a interseção entre uma faixa fina horizontal e uma coluna fina vertical) — os 4 cardeais
 * preenchidos (as 4 pontas do "+") mas as 4 diagonais TODAS vazias ao mesmo tempo (os braços são
 * finos dos dois lados, então os 4 cantos do cruzamento ficam ocos). Diferente de "preenchimento"
 * de verdade (0 diagonais vazias) e diferente dos entalhes de lado inteiro (exatamente 2 diagonais
 * ADJACENTES vazias, `TERRAIN_NOTCH_ROLES`) — aqui são as 4 ao mesmo tempo, um caso à parte.
 * Continuam fora de escopo (caem em preenchimento): 3 diagonais vazias, ou 2 diagonais OPOSTAS
 * (ex. noroeste+sudeste) — combinações mais raras, ver `autotile.ts`. */
export const TERRAIN_THIN_CROSS_ROLES = ['thinCross'] as const

/** CANTO (cotovelo) de bloco fino (docs/PROGRESS.md, "mais casos de autotile", 2026-09-25, achado
 * real com print antes/depois: um caminho de 1 bloco de largura fazendo uma curva de 90° — ex.
 * vindo de baixo e virando pra direita — caía no canto CONVEXO normal (`topRight` etc.), que
 * assume que o "lado de dentro" da curva (a diagonal entre os 2 cardeais preenchidos) é MASSA
 * SÓLIDA continuando — errado aqui, porque num caminho de 1 bloco de largura não tem nada lá,
 * igual às pontas (`TERRAIN_THIN_CAP_ROLES`). Só dispara quando EXATAMENTE 2 cardeais ADJACENTES
 * estão preenchidos (não opostos — esse caso já é `thinVertical`/`thinHorizontal`) E a diagonal
 * "de dentro" da curva TAMBÉM está vazia — se ela estiver preenchida, é um canto de verdade de uma
 * massa mais larga, continua caindo no canto convexo normal sem mudança nenhuma (ver
 * `autotile.ts`). */
export const TERRAIN_THIN_CORNER_ROLES = ['thinCornerTopLeft', 'thinCornerTopRight', 'thinCornerBottomLeft', 'thinCornerBottomRight'] as const

export const TERRAIN_ROLES = [
  ...TERRAIN_EDGE_ROLES,
  ...TERRAIN_INNER_CORNER_ROLES,
  ...TERRAIN_THIN_ROLES,
  ...TERRAIN_THIN_CAP_ROLES,
  ...TERRAIN_THIN_CORNER_ROLES,
  ...TERRAIN_NOTCH_ROLES,
  ...TERRAIN_THIN_CROSS_ROLES,
] as const
export type TerrainRole = (typeof TERRAIN_ROLES)[number]

/** Um grupo de terreno nomeado dentro de um tileset (`<nome>_tileset.json`, campo `terrainGroups`)
 * — ex. "grama": até 13 variantes visuais da MESMA coisa de gameplay (9 de borda/canto/
 * preenchimento + 4 de canto interno opcionais). Colisão/camada são UM valor pro grupo inteiro (não
 * por variante — todas têm o mesmo comportamento, só mudam visualmente), diferente de
 * `collision`/`layer` em `TilesetMeta` (que são por bloco, usados pelo pincel avulso). `roles` é
 * esparso de propósito: papel sem bloco atribuído cai no de `fill` na hora de pintar (ver
 * autotile.ts) — não precisa preencher todos pra o grupo funcionar. */
export interface TerrainGroup {
  name: string
  collision: CollisionKind
  layer: TileLayer
  /** Papel -> índice do bloco (na numeração do PRÓPRIO tileset, mesma do pincel avulso) que
   * representa aquele papel. */
  roles: Partial<Record<TerrainRole, number>>
}
