# DATA_FORMAT.md — Contrato de Dados entre Prometeus e Anubis

> Este arquivo é a fonte de verdade sobre o formato dos arquivos trocados
> entre o **Prometeus** (chat 1 — ferramenta web de assets/fases) e o **Anubis**
> (chat 2 — código C/PVSnesLib). Copie este arquivo em `docs/` nos DOIS
> projetos e mantenha sincronizado — se um lado mudar o formato, o outro
> precisa saber. Qualquer mudança aqui deve ser refletida nos dois
> `PROGRESS.md`.

## Como usar este documento
Cada seção abaixo representa um tipo de asset. Preencha o "Status" conforme
for decidido (🔴 não definido / 🟡 rascunho / 🟢 fechado e implementado).
Não implemente um parser/exportador de uma seção enquanto ela não estiver 🟢.

---

## 1. Gráficos / Tiles
**Status:** 🟢 fechado e implementado (2026-09-19) — round-trip completo
confirmado: Prometeus exportou um `.bmp` real (`marioteste.bmp`, 64x64px, 13
cores) direto em `assets/gfx/` do Anubis, e o `make` do Anubis converteu e
linkou na ROM com sucesso (ver "Confirmado do lado da engine" abaixo).

- **Formato de exportação:** NÃO é um binário próprio — usamos o
  `gfx4snes` (ferramenta de linha de comando já bundlada na instalação da
  PVSnesLib, em `devkitsnes/tools/gfx4snes.exe`), que já é invocado pelo
  nosso `build/Makefile`. O Prometeus só precisa exportar uma **imagem
  indexada de até 256 cores** (`.bmp` ou `.png` — o `gfx4snes` aceita os
  dois via `-t bmp`/`-t png`, mas hoje só `.bmp` tem uma regra automática
  no Makefile da PVSnesLib; `.png` exigiria adicionar uma regra própria no
  nosso `build/Makefile` — ainda não feito). O `gfx4snes` converte essa
  imagem pra tile data (`.pic`), paleta (`.pal`) e tilemap (`.map`)
  nativos do SNES.
- **Resolução/tamanho de tile:** 8x8 (`gfx4snes -s 8`), consistente com o
  que já usamos hardcoded em `src/player.c`/`src/tilemap.c`/
  `src/sprites_gfx.c`.
- **Profundidade de cor / modo gráfico:** 4bpp, 16 cores por paleta
  (`gfx4snes -u 16`), modo BG_MODE1 (já usado em `src/tilemap.c`) — mesmo
  esquema que os sprites usam (`OBJ` também é 4bpp/16 cores no SNES).
- **Número máximo de tiles únicos por fase:** 🔴 ainda não decidido —
  depende do orçamento de VRAM (a engine só tem ~consumido uma fração
  mínima até agora, ver `docs/ARCHITECTURE.md` § Estrutura de memória).
- **Convenção de nomenclatura de arquivo:** ver seção 3 "Slot do personagem
  principal" — pelo menos o personagem do jogador já tem nome de base FIXO
  (`hero`), pra reexportar substituir sem precisar mudar código.
- **Confirmado do lado do Prometeus:** a tela Importar/Preview valida
  dimensões (múltiplas de 8) e contagem de cores (≤16, sem quantização
  automática — rejeita e pede pra reduzir num editor externo) e, se
  passar, exporta um `.bmp` indexado de verdade (8 bits/pixel, paleta
  BGR0 com só as cores realmente usadas — não preenchida até 16 —, linhas
  bottom-up com padding de 4 bytes). Escreve direto em `assets/gfx/` desta
  Anubis via `POST /api/export-gfx` no próprio Vite dev server do Prometeus
  (ver seção 6) — não é mais download manual.
- **Confirmado do lado da engine:** `build/Makefile` converte `.bmp` de
  `assets/gfx/` via `gfx4snes` automaticamente a cada `make`
  (`-s 8 -o 16 -u 16 -p -m`), e `src/gfxdata.asm` embute o `.pic`/`.pal`
  gerado na ROM via `.incbin` (mesmo padrão do exemplo oficial
  `mapandobjects` da PVSnesLib).
- **Round-trip real confirmado (2026-09-19):** o usuário exportou
  `marioteste.bmp` (64x64px, 13 cores) pela tela Importar/Preview de
  verdade — não um arquivo feito à mão. `gfx4snes` reduziu pra 35 tiles
  únicos (dedup automático) e gerou `.pic`/`.pal`/`.map` corretos; o build
  linkou sem erro. **Pegadinha achada nesse teste:** um símbolo de
  `.incbin` sem nenhuma referência no C é descartado pelo linker
  silenciosamente (sem erro/warning) — confirmado comparando bytes livres
  de ROM antes/depois e o `.symfull`. Qualquer asset novo precisa de pelo
  menos uma referência real do código (não só existir no `.incbin`) pra
  não sumir da ROM. Ver `docs/ARCHITECTURE.md` § Pipeline de assets.
- Achado técnico à parte: o binário `gfx4snes.exe` tem um bug de parsing
  de caminho (não aceita caminho relativo com `..` nem barra normal com
  subpasta) — contornado com `cygpath -w` no Makefile, ver
  `docs/ARCHITECTURE.md` § Toolchain.

## 2. Paletas
**Status:** 🟡 rascunho

- **Quantas paletas simultâneas:** BG e sprites (OBJ) usam bancos de
  CGRAM separados no hardware (BG: 0-127, OBJ: 128-255) — já é assim
  hoje (`src/tilemap.c` usa paleta de BG, `src/sprites_gfx.c` usa paleta
  de sprite, independentes). Quantas paletas de 16 cores cada lado pode
  ter simultaneamente: 🔴 não decidido (SNES suporta até 8 bancos de 16
  cores por lado).
- **Formato de exportação:** `.pal`, gerado pelo `gfx4snes -p` a partir
  da própria paleta indexada da imagem de origem — não é um arquivo
  separado que o Prometeus precisa desenhar à mão, é a paleta da imagem
  PNG/BMP exportada.
- **Limite de cores por paleta:** 16 cores (4bpp), confirmado — mesmo
  limite hardware do SNES.
- **Cor 0 = transparente (regra do Prometeus, 2026-09-19):** se a imagem
  importada tem qualquer pixel transparente (alpha < 128), o Prometeus
  reserva o índice 0 da paleta pra ele e numera as cores opacas de 1 em
  diante (a paleta exportada tem `[0]` = preto "transparente"). Isso conta
  como 1 das 16 cores — imagem com transparência aceita no máx. 15 cores
  opacas. Sem pixel transparente, nada muda (índices na ordem de
  aparição). **Correção de bug:** antes o Prometeus ignorava alpha e agrupava
  por RGB, então o fundo transparente `(0,0,0,0)` virava a mesma cor do
  contorno preto opaco `(0,0,0)` — no SNES o contorno sumiria (índice 0).
  O `assets/gfx/marioteste.bmp` já exportado sofria disso (13 "cores" =
  14 reais); precisa ser re-exportado.

## 3. Sprites e animação
**Status:** 🟢 fechado e implementado (2026-09-20) — round-trip completo
confirmado dos dois lados, pros dois slots que existem hoje: o Prometeus
exporta `hero_tiles.bmp`/`hero_metasprites.h`/`hero_anim.h` e
`enemy1_tiles.bmp`/`enemy1_metasprites.h`/`enemy1_anim.h` reais, e o Anubis
consome os dois de verdade (`src/player.c`, `src/enemy.c` — não são mais
placeholders), com o build compilando (`make` confirmado passando com os
arquivos reais dos dois personagens). Metasprites (fatiamento 8x8/16x16,
pivô, flip, dedup), hitbox por sheet e as 5 animações
`idle/walk/run/jump/fall` (obrigatórias só pro `hero`; só `walk` pro
`enemy1`) fazem parte do contrato fechado — ver "Metasprites", "Slot do
personagem principal" e "Slots de inimigo" abaixo pros detalhes exatos.
**Pendências conhecidas que NÃO bloqueiam esse fechamento** (residual,
documentado nas subseções abaixo): sprite do jogador ainda como
`OBJ_SMALL` (8x8) em vez de `OBJ_LARGE` (16x16) — só importa quando o
placeholder virar sprite de verdade; só existe 1 tipo de inimigo
instanciado (`enemy1`) — múltiplos tipos (`enemy2`, ...) e onde cada
instância entra numa fase é trabalho do editor de fases (seção 4, ainda
🟡/🔴); `PLAYER_HITBOX_W/H` em `player.h` é um **espelho manual** de
`HERO_HITBOX_W/H` (não um `#include` direto — `player.h` é incluído por
`enemy.c`/`main.c` também, e incluir `hero_metasprites.h` ali duplicaria a
arte do `hero` na ROM), então reexportar o `hero` com uma hitbox diferente
exige resincronizar esse espelho à mão no Anubis (documentado lá em
`player.h`) — não é 100% automático, mas já usa o valor real, não mais um
chute.

- **Fatiamento em frames (resolvido pelo `gfx4snes`):** testado de verdade
  com `marioteste.bmp` (sprite sheet real, 64x64px, conteúdo ocupando um
  bloco de 48x48px = 3x3 frames de 16x16). Rodando
  `gfx4snes -T -X 16 -Y 16 -s 8 ...`, ele fatia o canvas INTEIRO numa
  grade de blocos do tamanho pedido, em ordem raster (linha por linha,
  esquerda→direita, topo→baixo) — o frame 0 é sempre o bloco
  superior-esquerdo, frame 1 o próximo à direita, etc. **O Prometeus não
  precisa marcar retângulos de frame na mão** — só precisa deixar
  escolher o tamanho do frame (8/16/32px, os mesmos tamanhos que o
  `gfx4snes` aceita) e a exportação usar exatamente essa grade, na mesma
  ordem, pra o índice de frame combinar dos dois lados. Importante: o
  canvas exportado deveria ter dimensões múltiplas do tamanho do frame
  (ex.: 48x48 pra frames 16x16), não sobrar espaço vazio tipo o
  `marioteste.bmp` atual (64x64 gera 16 frames em vez de 9, com 7 vazios).
- **Sequência/timing de animação (NÃO resolvido pelo `gfx4snes`):** ele só
  sabe fatiar/compor frames, não sabe o que é "andar" ou "pular", nem a
  ordem/duração de cada frame. Proposta: em vez de inventar um formato
  binário ou usar JSON (exigiria um parser novo dos dois lados), o Prometeus
  exporta um **arquivo `.h` de C simples**, com um array por animação —
  puro dado estático, sem parser nenhum, o compilador já lê:
  ```c
  /* gerado pelo snes-asset-editor a partir de marioteste.bmp — não editar à mão */
  #define MARIOTESTE_FRAME_W 16
  #define MARIOTESTE_FRAME_H 16
  static const u8 marioteste_anim_idle[] = {0};
  static const u8 marioteste_anim_walk[] = {1, 2, 3, 2};
  #define MARIOTESTE_WALK_FRAME_DURATION 8 /* frames de jogo por frame de animação */
  ```
  O nome de cada animação (`idle`, `walk`, ...) e a duração por frame são
  definidos pelo usuário no Prometeus, numa tela de "sequência" simples:
  mostra os frames já fatiados (mesma grade acima) e deixa escolher quais
  entram, em que ordem, pra cada animação nomeada.
- **Hitbox do sprite (🟡 proposta do Anubis, 2026-09-19):** a hitbox NÃO é
  o tamanho do frame — é menor (comum em plataforma, pra colisão não parecer
  maior que o personagem). **Uma hitbox por sheet** (não por frame; evita o
  personagem "mudar de tamanho" ao animar), retângulo **ancorado nos pés**:
  a base fica no pivô e ela é centrada no pivô em X. O Prometeus exporta no
  `<base>_metasprites.h`: `<BASE>_HITBOX_W` e `<BASE>_HITBOX_H` (px, `u8`,
  múltiplos de 1, não precisam ser de 8) — hoje o Anubis usa 12x20
  provisórios pro `marioteste` (frame 16x32; arte medida: parado 20px de
  altura, andar 19-20, pulo 22; ~14-16px de largura). Dica pro Prometeus: o
  padrão pode ser calculado da arte real (linhas/colunas opacas do frame
  parado) em vez de % do frame.
  Sem offset por enquanto (sempre centrada em X). Anubis: `src/player.c`
  troca as constantes `PLAYER_HITBOX_W/H` (em `player.h`) por essas macros.
  Interface sugerida no Prometeus: retângulo arrastável/redimensionável sobre a
  prévia (que já tem o pivô), padrão = largura ~75% do frame e altura = do
  pivô ao topo da arte.
- **Nomes de animação que o Anubis procura (jogador):** `idle`, `walk`,
  `run`, `jump`, `fall` (o `marioteste` já exporta exatamente esses). O
  Prometeus pode oferecer esses como nomes sugeridos, mas nome livre continua
  valendo — o Anubis só ignora o que não conhece.
- **Confirmado do lado do Prometeus (2026-09-19) — hitbox e nomes de animação:**
  - **UI:** passo "3. Caixa de colisão" na seção de personagem (em português
    "caixa de colisão"), campos Largura/Altura + contorno vermelho sobre a
    prévia ao vivo com alças brancas (meio do topo, meio dos lados, cantos de
    cima). A posição é fixa por definição (base no pivô, centrada em X), então
    "arrastar" = **redimensionar**: as bordas esquerda/direita mexem em
    simetria em torno do pivô (largura = 2 × distância ao pivô), o topo mexe
    na altura, os cantos mexem nos dois. Vale o pivô do quadro mostrado.
  - **Geometria exata:** esquerda = `pivô_x - floor(W / 2)` (divisão inteira,
    igual ao `PLAYER_HITBOX_W / 2` da engine), direita = esquerda + `W` (W
    ímpar fica com 1px a mais à direita), topo = `pivô_y - H`, base =
    `pivô_y`.
  - **Padrão:** `W` = 75% da largura do frame (16 → 12; sempre inteiro, pois
    o frame é múltiplo de 8); `H` = a maior distância "pivô → primeira linha
    com pixel opaco" entre os quadros com desenho (a pose mais alta manda; sem
    desenho nenhum = altura do frame; mínimo 1). A sugestão acompanha o pivô
    e o tamanho do quadro até o usuário editar; depois vale o valor dele
    ("Restaurar sugestão" volta). Trocar o tamanho do quadro descarta a
    edição. No `marioteste` 16×32 com pivô padrão (8, 32) sai 12 × 29; com o
    pivô nos pés reais da arte (y = 25) sai 12 × 22 — o Anubis decide o que
    usar (as constantes provisórias eram 12 × 24).
  - **Validação (mensagens em português, bloqueiam "Salvar"):** `W` e `H`
    inteiros, ≥ 1 e ≤ largura/altura do frame ("A largura da caixa de
    colisão (20 px) não pode ser maior que a largura do quadro (16 px)." etc.);
    o gerador do `.h` também recusa valores inválidos.
  - **Export:** no `<base>_metasprites.h`, logo depois de
    `<BASE>_MIRROR_DX`: `#define <BASE>_HITBOX_W <u8>` e
    `#define <BASE>_HITBOX_H <u8>` (ex.: `MARIOTESTE_HITBOX_W 12`), com o
    comentário da âncora no cabeçalho do arquivo. Anubis: trocar
    `PLAYER_HITBOX_W/H` por essas macros.
  - **Nomes de animação:** o campo de nome oferece `idle`, `walk`, `run`,
    `jump`, `fall` (botões clicáveis com rótulo em português + `datalist`),
    marca os já criados e mostra o que ainda falta; nome livre válido
    continua valendo (sanitizado pra identificador C).
- **Pendência do lado da engine (não bloqueia o Prometeus):** hoje
  `src/player.c`/`src/sprites_gfx.c` só sabem lidar com sprite 8x8
  (`OBJ_SMALL`, ver `oamSetEx` em `docs/ARCHITECTURE.md` § Sistema de
  sprites/OAM). Usar um frame 16x16 de verdade como sprite do jogador
  exige trocar pra `OBJ_LARGE` — mudança pequena, mas ainda não feita, e
  só é necessária quando formos trocar o placeholder pelo sprite real (não
  bloqueia o Prometeus implementar a seção 3 antes disso).
- **Confirmado do lado do Prometeus (2026-09-19):** a tela Importar/Preview
  ganhou uma seção "Sequência de animação" (aparece pra qualquer imagem já
  válida pra seção 1): uma grade visual desenhada num canvas mostrando os
  índices na mesma ordem raster do `gfx4snes -T` (valida que largura/altura
  são múltiplo EXATO do tamanho de frame escolhido — bloqueia com erro se
  não for, já que o comportamento do `gfx4snes` pra canvas não-múltiplo não
  foi testado), e um editor de
  animações nomeadas (nome + sequência de índices separados por vírgula +
  duração). Exporta um `.h` idêntico ao formato proposto acima (mesmo
  esquema de nomes: `<base>_anim_<nome>[]`, `<BASE>_<NOME>_FRAME_DURATION`)
  — nome da animação é sanitizado automaticamente pra virar um identificador
  C válido (minúsculo, `[a-z][a-z0-9_]*`). Escreve direto em `assets/gfx/`
  da engine via o mesmo endpoint `POST /api/export-gfx` da seção 1 (extensão
  `.h` liberada ali além de `.bmp`). **Mudança (2026-09-19):** o tamanho de
  frame agora é o "frame lógico" único do sheet, compartilhado com os
  metasprites abaixo (largura × altura independentes — ver "Frame lógico"
  abaixo; padrão 32 × 32). O formato do `_anim.h` não mudou: `_FRAME_W` e
  `_FRAME_H` continuam com esses nomes e agora valem a largura e a altura
  do frame lógico (antes eram sempre iguais). Ficaram com o nome antigo
  de propósito (contrato anterior); só o `_metasprites.h` usa
  `_FRAME_WIDTH`/`_FRAME_HEIGHT`.

### Metasprites (Prometeus, 2026-09-19)

O **frame lógico** (o "desenho" de uma pose) é independente do **sprite de
hardware**: o SNES só tem dois tamanhos de sprite ativos por vez (par do
OBSEL — usamos 8x8 pequeno + 16x16 grande, `OBJ_SIZE8_L16`, o mesmo de
`src/sprites_gfx.c`), então um personagem maior/irregular é montado com
várias peças (uma entrada de OAM cada). O Prometeus fatia sozinho; o
`gfx4snes -T` **não** é usado pra isso porque o `t_metasprite` da lib não
tem tamanho por peça (não dá pra misturar 8x8 e 16x16 no mesmo frame) nem
pivô.

- **Frame lógico (largura × altura independentes):** cada dimensão é
  múltiplo de 8 entre 8 e 64; padrão 32 × 32, escolhido por sheet. O Prometeus
  oferece presets (16×16, 16×32, 32×32, 32×48, 48×48, 64×64) e
  "Personalizado" (qualquer largura/altura válidas). A grade do sheet
  acompanha (ordem raster, mesmos índices do `_anim.h`; coluna = `índice %
  (sheet_w / frame_w)`, linha = `índice / (sheet_w / frame_w)`); a imagem
  precisa ser múltipla do frame nos DOIS eixos (senão o Prometeus bloqueia e
  sugere presets que servem). Caso de uso que motivou: poses de 16×32 =
  duas células de 16×16 empilhadas (`assets/gfx/marioteste.bmp`/`.png`,
  sheet 64×64 = 4 × 2 quadros, a 4ª coluna vazia).
- **Pivô:** por frame, em pixels a partir do canto sup. esq. do frame
  (`u8`; `x` de 0 a largura, `y` de 0 a altura — cada eixo com o seu
  limite). Padrão do sheet = centro horizontal e base: **`(largura / 2,
  altura)`**, os pés (16×32 → (8, 32)); editável por sheet e por frame
  (arrastar no canvas ou digitar). Peças guardam `dx = srcX - pivô.x`,
  `dy = srcY - pivô.y` (`s8`; sempre cabe: |valor| ≤ 64).
- **Fatiamento (automático):** (1) divide o frame em blocos 16x16
  alinhados ao canto sup. esq. do frame (se a largura/altura não for
  múltipla de 16 — 24, 40, 56 —, sobra uma faixa de 8px na borda direita/
  inferior; esses blocos parciais **só geram peças 8x8** por quadrante
  ocupado, porque uma 16x16 invadiria o frame vizinho); (2) descarta
  blocos 100% transparentes
  (índice 0) — não entram no OAM; (3) bloco não vazio: se o nº de
  quadrantes 8x8 **com pixels** for **≤ limiar** emite uma peça 8x8 por
  quadrante ocupado, senão uma única peça 16x16. **Limiar padrão = 1**
  (só "1 quadrante" vira 8x8 — ex.: ponta de braço que passa 2px); é
  configurável no Prometeus (0 = nunca 8x8 … 4 = sempre 8x8). Decisão: com 1
  quadrante a peça 8x8 gasta 1 tile em vez de 4 (economiza VRAM) e ainda
  é 1 entrada de OAM (empata com o 16x16); com 2+ quadrantes, 8x8 custaria
  2+ entradas de OAM e 2+ fatias por scanline a mais pra economizar só 1-2
  tiles, então prefere-se o 16x16. Limiar maior é escolha de quem está
  apertado de VRAM, não de OAM.
- **Layout dos tiles (`<base>_tiles.bmp`):** imagem indexada de **128px de
  largura** (= 16 tiles por linha, o layout da memória OBJ: peça 16x16 com
  tile N usa N, N+1, N+16, N+17). Peças 16x16 ocupam blocos 2x2 alinhados
  em coluna E linha pares; peças 8x8 ocupam células individuais (enchem os
  buracos que sobram depois dos 16x16). `tile` = `linha*16 + coluna` do
  canto sup. esq. da peça. Tiles idênticos são deduplicados entre frames,
  **inclusive espelhados** (H/V/HV — a peça vira flip no OAM; 16x16
  compara o bloco inteiro espelhado). Paleta = a do sheet original
  (cor 0 transparente, ≤16 cores). **Passar de 16 linhas (256 tiles) cai na
  2ª tabela de nomes do OBJ** — o Prometeus avisa (o upload pra VRAM precisa
  ser em dois blocos).
- **Conversão pelo `gfx4snes` — IMPORTANTE (testado com o binário real):**
  o `_tiles.bmp` precisa de uma regra **sem `-m`**:
  `gfx4snes -s 8 -o 16 -u 16 -p -t bmp -i <arquivo>`. Sem `-m` o `.pic`
  sai com todos os tiles em ordem raster (verificado tile a tile contra o
  que o Prometeus espera: 0 divergências); **com `-m`** (a regra genérica
  atual do `build/Makefile`) o `gfx4snes` deduplica e renumera tiles
  (64 → 32 no teste) e **quebra os índices** do `.h`. Ou seja: precisa de
  regra própria pra `*_tiles.bmp`.
- **Peça no `.h` (`<base>_metasprites.h`):** struct
  `metapiece_t { s8 dx; s8 dy; u16 tile; u8 flags; u8 size; }` (6 bytes):
  `flags` = byte de atributo do OAM **sem prioridade** (`OBJ_FLIPX` 0x40 |
  `OBJ_FLIPY` 0x80 | `OBJ_PAL(n)`; a prioridade fica com o engine),
  `size` = `OBJ_SMALL`/`OBJ_LARGE`; `tile` é relativo ao início do bloco
  carregado (some o offset base na VRAM). Frame:
  `metaframe_t { u8 pivot_x; u8 pivot_y; u8 piece_count; const metapiece_t
  *pieces; }` (frame sem peças: `piece_count 0`, `pieces 0`). Também gera
  `<BASE>_FRAME_WIDTH`, `<BASE>_FRAME_HEIGHT`, `<BASE>_FRAME_COUNT`,
  `<BASE>_TILE_ROWS` e o array `<base>_frames[]`. **`<BASE>_FRAME_SIZE`
  deixou de existir (2026-09-19)** — ver decisão no Histórico. Puro dado estático, sem parser — compilado com o
  `816-tcc` da engine (`-Wall`, sem avisos) e checado que os bytes emitidos
  batem com a struct.
- **Flip horizontal do personagem inteiro:** o hardware só espelha dentro
  do quadrado de cada peça, então o engine faz, **pra cada peça**,
  `dx' = -(dx + tamanho_da_peça)` (tamanho 8 ou 16; macro
  `<BASE>_MIRROR_DX(dx, size)` no `.h`) **e** `flags ^= OBJ_FLIPX`; o
  pivô fica fixo na tela. Documentado no comentário do `.h` gerado.
  Verificado: recompor com a fórmula reproduz o frame espelhado em torno
  do pivô pixel a pixel.
- **Desenho (engine):** pra cada peça, posição na tela = `(x + dx, y +
  dy)` onde `(x, y)` é o pivô na tela; `oamSet`/`oamSetEx` com `tile`
  (+ offset), `flags`, `size`. **Escrito do lado da engine (2026-09-19):**
  `src/metasprite.c` (`metaspriteDraw`, com flip pela fórmula acima) e
  `src/player.c` desenha `marioteste_frames[]` no lugar da cruz. Regra
  própria no `build/Makefile` pra `*_tiles.bmp` (sem `-m`, confirmado: `.pic`
  sai com 2048 bytes = 64 tiles, sem dedup). Tiles carregados na VRAM de OBJ
  no tile 16 (`SPR_MARIO_TILE_BASE`, alinhado à linha de 16) e paleta no
  banco OBJ 1, por DMA depois do `oamInitGfxSet` (só a 1ª chamada dele
  configura a base). **Ainda não testado no emulador.** Não consumido ainda:
  `_anim.h` (sequência de animação) — não foi exportado pelo Prometeus.
- **UI/validações do Prometeus:** overlay opcional das peças (8x8 laranja,
  16x16 verde), pivô arrastável, aviso de **pixels vazando do frame** (pixels
  opacos na borda do frame que continuam na célula vizinha — o sheet é uma
  grade, então "fora do canvas" = invadiu o vizinho, com contato de pelo
  menos 4 pixels ao longo da borda — poses vizinhas que só se encostam por
  1–3 linhas não contam), e estatísticas por
  frame: nº de peças (entradas de OAM), tiles 8x8 usados (16x16 = 4) e
  maior nº de fatias de 8px numa scanline (aviso se > 34, o limite de
  hardware). Edição manual de peças (mover/unir/dividir) **não** existe
  ainda; o modelo (`SlicedPiece` → `Piece`) já separa fatiar de empacotar
  pra permitir isso depois.
- **Ainda 🔴 / fora do escopo:** hitbox/colisão por frame; limite de 32
  sprites por scanline (só as 34 fatias são checadas); prioridade por peça;
  múltiplas sub-paletas por sheet (hoje uma paleta OBJ por sheet); tiles
  compartilhados entre sheets diferentes; `-T` do `gfx4snes` (não usado).

### Slot do personagem principal (Anubis, 2026-09-20)

**Objetivo:** editar o sprite/animações do personagem no Prometeus e ver a
mudança no jogo só reexportando e rodando `make` — sem pedir pra sessão do
Anubis mexer em código toda vez. Solução: um nome de base **fixo**, que o
Anubis sempre procura, independente do nome do arquivo que o usuário
importou.

- **Nome de base fixo: `hero`.** A tela de personagem do Prometeus precisa
  exportar sempre como `hero_tiles.bmp` / `hero_metasprites.h` /
  `hero_anim.h` em `assets/gfx/` — **não** o nome derivado do arquivo
  importado (ex.: importar `qualquercoisa.png` ainda assim gera
  `hero_*`). É por causa disso que os arquivos de teste desta sessão
  (`marioteste.png`) foram renomeados pra esse padrão no Anubis; o Prometeus
  precisa passar a exportar assim por conta própria daqui pra frente.
  Pensando no que o usuário comentou (futuro editor de inimigo/fase): o
  mesmo mecanismo dá pra repetir com outros nomes fixos por slot
  (`enemy1`, etc.) quando esse dia chegar — não implementar agora, só não
  fechar a porta.
- **Por que não usa `PLAYER_` como prefixo de macro:** o Anubis já tem
  várias constantes próprias com esse prefixo (`PLAYER_HITBOX_W`,
  `PLAYER_MAX_SPEED_X`, ...) — usar `<BASE>_` = `PLAYER_` colidiria (ex.:
  `PLAYER_HITBOX_W` exportado vs. o já existente em `player.h`). `hero`
  evita isso de propósito.
- **Contrato fixo do slot `hero` (o Anubis só compila se isso existir):**
  as 5 animações `hero_anim_idle`, `hero_anim_walk`, `hero_anim_run`,
  `hero_anim_jump`, `hero_anim_fall` (+ suas `HERO_<NOME>_FRAME_DURATION`)
  **precisam sempre existir no `hero_anim.h`**, mesmo que o personagem
  não tenha uma pose específica ainda (nesse caso, repetir o frame da
  `idle` ou de outra animação já é suficiente — o Anubis só troca de
  frame, não sabe que duas animações apontam pro mesmo desenho). Isso é
  uma limitação de propósito da abordagem "sem parser": os NOMES que o
  Anubis reconhece são fixos no código (`player.c`), só o CONTEÚDO
  (sequência de frames de cada um) é que vem do Prometeus. Adicionar uma
  animação com nome novo (ex.: "agachar") exige mudança de código no
  Anubis, não é automático.
- **O que É automático ao reexportar sob o nome `hero`, sem tocar em
  código do Anubis:** trocar o desenho/arte inteira, mudar quantos frames
  cada animação usa e em que ordem, mudar a duração de cada uma, mudar a
  quantidade total de frames do sheet, mudar o tamanho do quadro
  (16x32, 32x32, etc. — `metaspriteDraw` já é genérico pra tamanho de
  peça). **O que NÃO é 100% automático:** os 5 nomes de animação acima
  (fixos) e qualquer coisa que exija mais de 16 linhas de tiles (cruza a
  2ª tabela de nomes do OBJ, não suportado ainda). **Atualização
  (2026-09-20):** o tamanho/posição da hitbox **já lê o valor real**
  exportado (`player.c` usa `HERO_HITBOX_W/H` de `hero_metasprites.h`
  direto) — só o espelho público `PLAYER_HITBOX_W/H` em `player.h` (usado
  por `enemy.c`/`main.c`, que não podem incluir `hero_metasprites.h`
  diretamente) continua manual, precisa resincronizar à mão se o `hero`
  for reexportado com hitbox diferente.

### Slots de inimigo (2026-09-20 — implementado dos dois lados)

Mesmo mecanismo do slot `hero`, generalizado: o Prometeus já exporta um
inimigo sob a base fixa `enemy1` (`enemy1_tiles.bmp` / `enemy1_
metasprites.h` / `enemy1_anim.h`), e o Anubis já consome (`src/enemy.c`,
`SPR_ENEMY1_TILE_BASE`/`SPR_ENEMY1_PALETTE` em `sprites_gfx.h`).
**Diferenças em relação ao slot `hero`:**

- **Prefixo de macro:** `ENEMY1_` (ex.: `ENEMY1_FRAME_W`,
  `ENEMY1_HITBOX_W/H`, `ENEMY1_WALK_FRAME_DURATION`) — sem colisão com
  nada do Anubis (que usa `ENEMY_` sem número pras próprias constantes,
  ver `enemy.c`).
- **Animações obrigatórias: só `walk`.** O inimigo de patrulha nunca para
  de andar, então só `enemy1_anim_walk` é referenciado pelo código. O
  Prometeus pode (e já exporta) uma `idle` também, mas ela fica sem uso —
  isso é esperado, não é erro nem coisa faltando. Se um dia o inimigo
  ganhar um estado parado (ex.: esperando o jogador chegar perto), `idle`
  passa a ser consumida sem precisar mudar o `.h`.
- **Hitbox já é consumida de cara:** diferente do `hero` (que ainda usa
  constante fixa em `player.h`, pendente de reexport), `enemy.c` já lê
  `ENEMY1_HITBOX_W`/`ENEMY1_HITBOX_H` direto do `.h` exportado — porque o
  arquivo já veio com esses defines (o Prometeus implementou a hitbox exportável
  antes deste `enemy1` ser criado). Mesma convenção de âncora do `hero`
  (base no pivô, centrada no pivô em X).
- **Só existe UM tipo de inimigo instanciado hoje** (o da tela, "tipo 1" —
  daí o nome `enemy1`). Vários TIPOS (`enemy2`, `enemy3`, ...) e colocar
  instâncias deles numa fase é trabalho do editor de fases futuro — ainda
  não existe um mecanismo pro Anubis escolher "que tipo usar aqui", só o
  slot fixo de um inimigo só. Quando esse editor existir, o formato de
  posicionamento de entidades (seção 4, "Como entidades são posicionadas")
  provavelmente vai incluir qual TIPO de inimigo cada instância usa.
- **VRAM/OAM:** `enemy1` ganhou seu próprio bloco de tiles (linha 32 em
  diante), paleta (banco OBJ 2) e slots de OAM (4-7) — reservados com
  folga em relação ao `hero`, ver `docs/ARCHITECTURE.md` § Sistema de
  sprites/OAM.

### Slot de decoração estática `decor1` + lista de decorações por fase (🟡 aditivo — implementado e testado do lado da Anubis, 2026-10-05)

**Motivo:** a barra do gol como tile de Camada 1 ocupa a célula e corta o
poste de trás (1 tile por célula). Como **sprite**, ela desenha em
qualquer pixel sem ocupar célula nenhuma. Sem colisão, sem IA, sem
animação: só desenha parada no lugar.

**Aditivo:** um slot novo (arquivos novos) + arrays novos e opcionais no
`stage1_entities.h`. Nada do que já existe muda.

**1. Arte — slot `decor1`** (mesmo mecanismo de `hero`/`enemy1`):
- Arquivos: `decor1_tiles.bmp` + `decor1_metasprites.h` (mesmo formato
  de hoje). Prefixo de macro **`DECOR1_`** (não colide com `HERO_`,
  `ENEMY1_` nem com o `DECOR_` sem número que a Anubis usa em `decor.c`).
- **Cada FRAME da folha é uma peça de decoração diferente** (barra, placa,
  ...), não uma animação. Uma folha só serve pra várias decorações.
- Usados: `DECOR1_FRAME_WIDTH/HEIGHT/COUNT/TILE_ROWS` e `decor1_frames[]`.
  **Sem hitbox** (não precisa exportar `DECOR1_HITBOX_*`; se vier, é
  ignorado). **`decor1_anim.h` não é necessário**; se o Prometeus exportar
  por padrão, é ignorado (slot com `requiredAnimationNames: []`).
- **Limites (VRAM/OAM reservados na Anubis):** até **8 linhas de 16 tiles**
  na folha (`DECOR1_TILE_ROWS` ≤ 8, `#error` se passar); 1 banco de
  paleta de 16 cores (banco OBJ 3); peças 8x8/16x16 como hoje.
- Até o Prometeus exportar, a Anubis tem um **placeholder** escrito à mão
  (barra 32x8 no frame 0) com esses nomes, pra o build funcionar. O export
  real sobrescreve.

**2. Posicionamento — `stage1_entities.h`** (mesmo padrão de arrays
paralelos dos inimigos, sem patrulha nem hitbox):

```c
#define STAGE1_DECOR_COUNT 1
static const u8  stage1_decor_type[1]  = { 0 };   /* 0 = slot decor1 */
static const u8  stage1_decor_frame[1] = { 0 };   /* frame da folha decor1 */
static const s16 stage1_decor_x[1]     = { 696 }; /* canto sup. esq. do frame, px de mundo */
static const s16 stage1_decor_y[1]     = { 64 };
```
- **X/Y = canto superior esquerdo do retângulo do frame** (largura ×
  altura lógicos) em pixels de mundo — o que o editor mostra é o que o
  jogo desenha, independente do pivô. (Diferente dos inimigos, cujo X/Y é
  o canto da hitbox, porque decoração não tem hitbox.)
- Opcional: sem `STAGE1_DECOR_COUNT` = nenhuma decoração. Até **16**
  instâncias (`#error` acima disso). Instância com tipo/frame inexistente
  é ignorada.
- Orçamento de OAM: **32 peças somadas** entre todas as instâncias (a barra
  de teste tem 4). O que não couber é ignorado em silêncio; o Prometeus
  pode avisar somando `piece_count` dos frames usados.

**3. Como fica na tela:**
- Jogador e inimigos passam **na frente** da decoração.
- A decoração fica na frente de todo tile normal das duas camadas, e
  **atrás** dos tiles da Camada 1 marcados "na frente do sprite"
  (`stage1_tilemap_priority.txt`, § 4). Ex.: com o poste da frente
  marcado, a barra passa por trás dele.

**Sugestão pro Prometeus (NÃO implementado do lado dele):** slot
`{ id: 'decor1', label: 'Decoração', requiredAnimationNames: [] }` em
`characterSlots.ts`, e na tela de Fase uma ferramenta pra colocar
instâncias de decoração (escolhendo o frame) com arraste livre em pixel,
como os inimigos.

### Comportamento de objeto: colisão + propriedade especial (🟡 aditivo — implementado e testado do lado da Anubis, 2026-10-10)

Estende a subseção anterior (slot `decor1`): cada instância de objeto
ganha um **tipo de colisão** e, opcionalmente, uma **propriedade
especial**. Objeto sem nada disso continua sendo decoração pura.

**Formato — 2 arrays paralelos novos + 1 define, junto dos que já existem
em `stage1_entities.h`:**

```c
#define STAGE1_DECOR_COUNT 3
static const u8  stage1_decor_type[3]  = { 0, 0, 0 };
static const u8  stage1_decor_frame[3] = { 0, 1, 2 };
static const s16 stage1_decor_x[3]     = { 712, 300, 400 };
static const s16 stage1_decor_y[3]     = { 128, 184, 200 };
#define STAGE1_DECOR_HAS_BEHAVIOR 1
static const u8  stage1_decor_collision[3] = { 0, 1, 0 }; /* 0 atravessável, 1 sólido */
static const u8  stage1_decor_special[3]   = { 1, 0, 2 }; /* 0 nenhuma, 1 bandeira, 2 morte */
```
- **`STAGE1_DECOR_HAS_BEHAVIOR`** marca que os 2 arrays existem. Sem ele
  (export antigo), todo objeto é atravessável e sem propriedade, sem
  quebrar o build. Exportar os 3 juntos, sempre que houver objetos.
- **`collision`:** `0` = atravessável (padrão, o de hoje); `1` = sólido,
  pro **jogador**: não atravessa pelos lados nem por baixo, pode pisar em
  cima. Valores desconhecidos = atravessável.
- **`special`:** `0` = nenhuma; `1` = **bandeira** (tocar termina a fase);
  `2` = **trigger de morte** (tocar mata, igual encostar num inimigo).
  Lista extensível: valores novos virão aqui; a Anubis ignora o que não
  conhece.
- **Combinações valem:** sólido + bandeira (bloco que termina a fase ao
  encostar), sólido + morte (espinho que não dá pra atravessar). Com
  objeto sólido, "tocar" = encostar (a Anubis testa a caixa 1px maior,
  porque o jogador nunca entra nele).

**Caixa de colisão = o retângulo do FRAME** (`DECOR1_FRAME_WIDTH` ×
`DECOR1_FRAME_HEIGHT`, canto sup. esq. em `x, y`), igual ao que o editor
mostra. Simplificação de propósito: nenhum campo de hitbox novo. Se a arte
tiver margem transparente, a colisão inclui essa margem; recortar a
folha bem justa evita surpresa. (Uma hitbox própria por frame pode vir
depois, como campo aditivo.)

**Bandeira por objeto e bandeira por célula de colisão coexistem:** as
células `2` do `_collision.h` continuam terminando a fase; o
objeto-bandeira é só mais um jeito de disparar o mesmo "fase completa".
Nada muda pra fase que não usa objeto-bandeira.

**Limites atuais (lado da Anubis):** sólido vale só pro **jogador**
(inimigos atravessam objetos e só enxergam tiles); objetos não se mexem
(plataforma móvel é outra coisa).

**Sugestão pro Prometeus (NÃO implementado do lado dele):** na lista de
instâncias de objeto da fase, um seletor "Colisão: atravessável /
sólido" e "Especial: nenhuma / bandeira / morte" por instância, com
algum indicador visual no canvas (ex.: contorno sólido, ícone de
bandeira/caveira).

## 4. Tilemap / Layout de fase
**Status:** 🟢 fechado e implementado (2026-09-21) — mesmo critério das
seções 1 e 3: round-trip real confirmado dos dois lados. O Prometeus
exportou uma `stage1` de teste real (`stage1_tilemap.bmp`/
`stage1_collision.h`), e o Anubis já consome de verdade
(`src/tilemap.c` reescrito, `build/Makefile` com a regra `-m` pro
`*_tilemap.bmp`, build limpo e ROM linkada com a fase real substituindo o
nível de teste hardcoded). **Pendências residuais que NÃO bloqueiam o
fechamento** (documentadas nas subseções abaixo, ficam pra v2):
posicionamento de entidades (jogador/inimigo continuam hardcoded em
`main.c`); fases maiores que uma tela/scroll; múltiplas camadas de BG.

- **Escopo da v1 (decidido com o usuário, 2026-09-20):** só tilemap visual +
  colisão. Posicionamento de entidades (onde o jogador começa, onde o(s)
  inimigo(s) nascem) **fica de fora por enquanto** — continua hardcoded em
  `src/main.c` como hoje. Fica pra uma v2 do editor de fase.
- **Tamanho da fase (decidido):** fixo em **32×32 tiles, uma tela só, sem
  scroll** — bate exatamente com o que a engine já suporta hoje
  (`SC_32x32`, `docs/GDD.md` § 2/8 — v1 é vertical slice sem scroll). Não
  suporta fases maiores ainda; quando o Anubis implementar scroll, essa
  constante (`STAGE_GRID_COLS`/`STAGE_GRID_ROWS` no Prometeus) precisa
  crescer junto.
- **Tile de hardware sempre 8×8, mas o Prometeus deixa pintar em blocos
  maiores (2026-09-20 — pedido do usuário: "e se meus tiles tiverem 16x16
  de tamanho?"):** o hardware de BG do SNES só entende 8×8 de verdade
  (`bgInitMapSet`/`SC_32x32` em `src/tilemap.c`) — isso não muda. Mas se o
  conjunto de imagens do usuário já foi desenhado em blocos maiores (16×16
  ou 32×32), o Prometeus deixa escolher esse tamanho como unidade de
  pintura: um seletor "Tamanho de cada bloco" aparece quando a imagem
  importada é múltipla de mais de um tamanho (`STAGE_BLOCK_SIZES = [8, 16,
  32]`), e cada bloco maior simplesmente expande pros tiles de 8×8 que ele
  cobre na hora de exportar (um bloco 16×16 sólido em uma célula do grid
  de pintura vira um quadrado 2×2 de "sólido" no array de colisão final,
  que **continua sempre 32×32 tiles de 8×8**, fixo, independente do
  tamanho de bloco escolhido pra pintar).
  **Atualizado em 2026-09-23 — cursor de posicionamento sempre em passos
  de 8px, independente do tamanho de bloco (achado do usuário: o
  alinhamento em blocos maiores é regra de SPRITE do hardware, não de
  TILE de cenário — o SNES endereça cada célula do tilemap de BG
  individualmente, de 8 em 8px, sem exigir alinhamento entre vizinhas):**
  a grade de pintura (`grid`/`gridLayer2` em `StageEditor.tsx`) passou a
  guardar SEMPRE índice de tile de HARDWARE (32×32 células de 8px fixas),
  nunca mais índice de bloco na granularidade escolhida — o tamanho de
  bloco virou só o TAMANHO DO CARIMBO ("quantas células de 8px um clique
  preenche de uma vez"), decidido a partir de QUALQUER posição múltipla
  de 8, não mais só de múltiplos do próprio bloco.
  **Corrigido no mesmo dia (2026-09-23) — o passo do cursor virou uma
  ESCOLHA do usuário (8/16/32px, seletor "Passo do cursor"), não mais
  travado sempre em 8px:** a ideia original ("sempre 8px") tirava
  liberdade — às vezes o usuário QUER o clique travado num múltiplo maior
  (pintar área grande rápido, sem risco de clicar torto), só precisando de
  8px pontualmente (encaixar uma peça fina entre dois blocos maiores). O
  armazenamento interno (`grid`/`gridLayer2`) continua SEMPRE em índice de
  tile de hardware (isso não mudou, é o que garante que qualquer passo de
  cursor funcione sem reconverter nada); só o que MUDOU de novo é que
  `cellFromClient` agora usa um terceiro estado (`cursorStep`, independente
  de `blockSize`) pra decidir em que múltiplos o clique pode cair, e a
  grade desenhada no canvas mostra exatamente esse passo (um nível só, não
  mais dois sobrepostos — os dois juntos se mostraram "difícil de
  enxergar" na prática). **Trocar o tamanho de bloco NÃO reseta mais
  a pintura em andamento** (ela já nasce numa resolução fixa, independente
  do bloco) — só reseta a tabela de colisão/camada por bloco
  (`tileCollision`/`tileLayer`), porque a NUMERAÇÃO de bloco muda quando o
  tamanho muda (um índice de bloco do tileset fatiado em 16px não é o
  mesmo índice fatiado em 32px) e a definição de colisão continua por
  ÍNDICE DE BLOCO, sem mudar (decisão explícita, fora de escopo tentar
  preservar colisão através de uma troca de tamanho de bloco por
  enquanto). **Fora de escopo, sem mudança nenhuma:** o formato dos
  arquivos exportados — `<base>_tilemap.bmp`/`_collision.h` continuam
  saindo exatamente na mesma grade fixa de 32×32 tiles de 8×8 de sempre,
  isso é puramente uma melhora de ferramenta do lado do Prometeus; nenhum
  consumo do lado da Anubis muda.
- **Origem do conjunto de blocos (tileset):** reaproveita o fluxo de
  importação de "Cenário" já existente (mesma validação: dimensões
  múltiplas de 8, ≤16 cores) — a imagem inteira vira o conjunto de blocos,
  fatiada no tamanho de bloco escolhido (8/16/32, ver acima) em ordem
  raster (`buildTileset`, sem pivô/dedup — background não precisa disso, e
  o `gfx4snes -m` já deduplica tiles repetidos ao converter a fase
  composta, ver abaixo). Terceira opção "O que é essa imagem?" na tela:
  "Fase (usar os blocos dessa imagem pra desenhar o mapa)".
- **Colisão por TABELA DE ÍNDICE DE TILE, não por célula (decidido com o
  usuário):** o usuário marca, uma vez por conjunto de blocos, se cada
  tile é vazio/sólido/bandeira (clique cicla entre os 3; contorno verde =
  sólido, vermelho = bandeira, sem contorno = vazio). Pintar o mapa depois
  só escolhe QUAL tile vai em cada célula — a colisão de cada célula sai
  automática dessa tabela (célula com tile "grama" → sólido, sempre, não
  importa quantas vezes o tile "grama" apareça no mapa). Isso evita
  precisar de um segundo canal/arquivo sincronizado com o mapa visual: o
  Prometeus já sabe, da própria pintura, qual tile foi usado em cada
  célula, e resolve a colisão a partir da tabela na hora de exportar.
- **Dois arquivos exportados, independentes um do outro:**
  1. **`<base>_tilemap.bmp`**: a fase INTEIRA composta (256×256px = 32×32
     blocos de 8×8, cada célula com os pixels do tile escolhido pra ela) —
     é uma imagem só, não uma lista de índices. Do lado da engine, precisa
     de uma regra de Makefile que rode
     `gfx4snes -s 8 -o 16 -u 16 -p -m -y -t bmp` (**COM** `-m`/dedup dessa
     vez — ao contrário do `*_tiles.bmp` de metasprite da seção 3, aqui
     dedup é o comportamento CERTO: o `.pic` sai só com os tiles únicos, e
     o `.map` gerado referencia cada célula pelo índice deduplicado —
     exatamente o par de arquivos que `bgInitTileSet`/`bgInitMapSet` já
     esperam). O Prometeus não precisa saber a numeração final que o
     `gfx4snes` escolhe: a colisão (arquivo 2) é resolvida ANTES do dedup,
     a partir da própria grade que o usuário pintou.
  2. **`<base>_collision.h`**: `static const u8 <base>_collision[32*32]`
     com 0=vazio/1=sólido/2=bandeira, na MESMA ordem (`row*32+col`) que
     `tilemapData`/`tilemapBuildTestLevel()` já usam em `src/tilemap.c` —
     trocar o array hardcoded por esse só exige incluir o `.h`, sem mudar
     `tilemapIsSolidAtPixel`/`tilemapIsGoalAtPixel`. Puro dado estático em
     C, sem parser — mesmo padrão de todo o resto desta seção.
- **Nome de base fixo: `stage1`.** Só existe uma fase na v1 (`docs/GDD.md`
  § 5: "1 fase completa, do início ao fim"), então não tem por que ter um
  seletor de slot como o de personagem (`characterSlots.ts`) ainda — seria
  uma lista de 1 opção só, sem função. Quando existir uma segunda fase de
  verdade, o mesmo mecanismo de slot dá pra repetir (`stage2`, etc.) — não
  fechar a porta, mas não implementar antes de precisar.
- **Confirmado do lado do Prometeus (2026-09-20):** `src/lib/tilemap/`
  (puro: `buildTileset`/`tilePixels` — parametrizados por `blockSize` —,
  `composeLevel`, `generateCollisionHeader` — expande cada bloco pintado
  pro(s) tile(s) de 8×8 de hardware que ele cobre) e `StageEditor.tsx`
  (seletor de tamanho de bloco quando a imagem permite mais de uma opção;
  dois passos: "o que é cada bloco" e "escolha um bloco e pinte o mapa",
  canvas de 512×512px fixo — a resolução física da fase não muda com o
  tamanho de bloco escolhido pra pintar — clique/arrasto pra pintar).
  Testado com conjuntos sintéticos de blocos de cores distintas em 8×8,
  16×16 e 32×32: colisão por índice de bloco confirmada em todos os
  tamanhos (marcar 1 bloco como sólido faz TODAS as células com aquele
  bloco saírem sólidas no `.h`, célula nunca pintada sai vazia; bloco de
  16×16 sólido expande pra um quadrado 2×2 de "sólido" no array de 32×32
  final), pintura por clique e por arrasto confirmadas pixel a pixel
  (tanto no canvas quanto no `.bmp` exportado). **Pendências conhecidas,
  fora de escopo por ora:** posicionamento de entidades (ver "Escopo da
  v1" acima); fases maiores que uma tela/scroll; múltiplas camadas (só
  uma camada de BG, sem fundo distante separado do cenário).
- **Editar uma fase já salva (Prometeus, 2026-09-21):** diferente do
  personagem, os arquivos exportados (a imagem já composta + a colisão já
  resolvida por tile de hardware) não guardam qual bloco do conjunto
  original foi usado em cada célula. Mesmo assim dá pra reabrir sem
  nenhum arquivo novo: `reconstructStage` (`src/lib/tilemap/
  reconstructStage.ts`) deduplica os tiles 8×8 únicos da própria imagem
  composta num conjunto de blocos sintético, e a colisão de cada um vem
  da célula correspondente no array já resolvido. O layout final fica
  **idêntico** (`composeLevel` do reconstruído bate pixel a pixel com o
  original), só a granularidade de pintura escolhida originalmente (8/16/
  32) não é preservada — reabre sempre em blocos de 8×8. Seção "Fase já
  salva" na tela ganhou "Editar" (antes só tinha "Excluir").
- **Confirmado do lado do Anubis (2026-09-21):** `build/Makefile` ganhou a
  regra pra `*_tilemap.bmp` **com** `-m`/dedup (diferente da regra sem
  `-m` do `*_tiles.bmp` de personagem/inimigo da seção 3);
  `src/tilemap.c` reescrito pra usar `stage1_tilemap.pic/.pal/.map`
  (gerados) + `stage1_collision.h` direto, no lugar de
  `tilemapBuildTestLevel()`/`tilemapTiles` hardcoded (removidos, sem
  uso). Build limpo, ROM com a fase real linkada.
- **Anubis preparou o lado dele pro que vem a seguir (2026-09-21):**
  `main.c` não chama mais `playerInit()`/`enemyInit()` direto com números
  soltos — os spawns viraram dado (`PlayerSpawn`/`EnemySpawn`, arrays
  `kPlayerSpawn`/`kEnemySpawns[]`), com um `EnemyType` (enum, `enemy.h`)
  no lugar de um inimigo genérico sem tipo, e `restartGame()` percorre o
  array de inimigos num loop em vez de uma chamada fixa. Continua
  **hardcoded** (mesmos valores de sempre, só reorganizados — nenhum
  comportamento mudou) até o formato de posicionamento de entidades abaixo
  fechar; a ideia é que, quando fechar, só seja preciso trocar
  `kPlayerSpawn`/`kEnemySpawns[]` por dado incluído de um `.h` exportado,
  sem mexer de novo em como `restartGame()` inicializa as coisas.

### Proposta (v2, 🟡 aditivo — não muda o fechamento 🟢 acima): múltiplos tilesets com paleta por bloco

Como o Anubis prefere RECEBER isso, do ponto de vista de quem consome
(`bgInitTileSet`/`bgInitMapSet`). **Não é contrato, é ponto de partida —
quem decide o formato final é o Prometeus.**

- **Orçamento de CGRAM do lado BG (`docs/ARCHITECTURE.md` § Estrutura de
  memória):** o SNES reserva CGRAM 0-127 pro lado BG (8 bancos de 16 cores
  = 128 cores) e 128-255 pro lado OBJ/sprite (onde `hero`/`enemy1` já
  vivem, bancos 1 e 2 dos 8 disponíveis ali — sem relação com o lado BG).
  Hoje a `stage1` usa só o banco BG 0 (`paletteEntry=0` em
  `bgInitTileSet`, `src/tilemap.c`) — os outros 7 bancos (112 cores) estão
  livres. A tela de texto (`GAME OVER`/`FASE COMPLETA`,
  `consoleInitDefaultText`) reusa o mesmo endereço de VRAM da BG1 mas
  nunca ao mesmo tempo que o gameplay (estados mutuamente exclusivos,
  `main.c`), então não reserva banco nenhum de propósito — o orçamento
  real pro tilemap são os **8 bancos (128 cores) inteiros**, não só 7.
- **Achado (não testado ainda, a confirmar antes de fechar) — o formato
  atual já pode suportar isso sem mudar nada nos dois lados:** o `.map` do
  SNES já reserva 3 bits de paleta por célula (0-7, um por banco BG) —
  isso é HARDWARE, não uma extensão nossa. O `gfx4snes` já expõe `-e`
  (`--pal-entry`, soma um valor fixo aos bits de paleta do mapa) e
  `-a`/`--pal-rearrange` (reagrupa paleta preservando os números no
  tilemap), o que sugere que ele já sabe agrupar uma imagem de origem com
  MAIS de 16 cores em vários bancos de 16 e gravar o bit de paleta certo
  por tile no `.map` automaticamente — sem exigir nenhum arquivo novo.
  Se isso se confirmar, a proposta mais direta é: o Prometeus continua
  compondo **uma imagem só** pra fase (como já faz), só que aceitando até
  **128 cores** (8 blocos de paleta) em vez do limite de 16 de hoje, e
  exportando com `-u 128 -o 128` (ou o que for preciso) em vez de
  `-u 16 -o 16`. O trio de arquivos continua o mesmo
  (`<base>_tilemap.bmp/.pic/.pal/.map`) — só o `.pal` sai maior (até 8×16×2
  = 256 bytes) e o `.map` sai com os bits de paleta já certos por célula.
  Do lado do Anubis, **zero mudança de código esperada**: `tilemap.c` já
  calcula o tamanho da paleta a partir do próprio dado embutido
  (`&stage1TilemapPalEnd - &stage1TilemapPal`), não de um número fixo de
  16 cores — um `.pal` maior já seria carregado por inteiro do jeito que
  o código já está.
- **Se esse achado NÃO se confirmar** (o `gfx4snes` exigir alguma flag a
  mais, ou não agrupar do jeito esperado), a alternativa mais simples é o
  Prometeus continuar limitando a UMA paleta de 16 cores por fase (como
  hoje) até haver um pedido real de fase que precise de mais de 16 cores —
  não vale complicar o formato de antemão por uma necessidade hipotética.
- **Fora desse achado, nada mais muda:** tileset continua sendo "a imagem
  inteira vira o conjunto de blocos" (como já documentado acima), só a
  contagem de cores de exportação que precisaria subir.

### Proposta (v2, 🟡 aditivo): lista de entidades (spawn do jogador + inimigos)

Formato sugerido, pra bater com `PlayerSpawn`/`EnemySpawn`/`EnemyType` que
o Anubis já preparou (`src/main.c`, `src/enemy.h`) — **arrays paralelos de
tipos primitivos, sem struct exportada**, de propósito: evita ter que
manter uma `struct` com o mesmo layout de campos sincronizada nos dois
lados (o que quebraria silenciosamente se um lado mudasse a ordem dos
campos). Puro dado estático em `.h`, mesmo padrão de
`stage1_collision.h`/`hero_anim.h`, sem parser:

```c
/* <base>_entities.h (nome de arquivo sugestão, Prometeus decide) */
#define STAGE1_PLAYER_SPAWN_X 120
#define STAGE1_PLAYER_SPAWN_Y 100

#define STAGE1_ENEMY_COUNT 1
/* tipo: índice cru batendo com o enum EnemyType de src/enemy.h
 * (0 = ENEMY_TYPE_ENEMY1 hoje) — Prometeus não precisa conhecer o enum,
 * só emitir o número do slot na mesma ordem que characterSlots.ts usa. */
static const u8  stage1_enemy_type[STAGE1_ENEMY_COUNT]  = { 0 };
static const s16 stage1_enemy_x[STAGE1_ENEMY_COUNT]     = { 90 };
static const s16 stage1_enemy_y[STAGE1_ENEMY_COUNT]     = { 192 };
static const s16 stage1_enemy_min_x[STAGE1_ENEMY_COUNT] = { 30 };
static const s16 stage1_enemy_max_x[STAGE1_ENEMY_COUNT] = { 92 };
```

- **Por que X/Y do inimigo em pixels absolutos (não célula de tilemap):**
  mesma unidade que `enemyInit()`/`playerInit()` já usam hoje — evita
  qualquer conversão do lado do Anubis.
- **`minX`/`maxX` da patrulha:** só faz sentido pro comportamento de
  patrulha que `enemy.c` já implementa; se um tipo de inimigo futuro não
  patrulhar (parado, ou outro padrão de movimento), esses dois campos
  ficam sem uso pra esse tipo — o consumidor decide o que ler por tipo,
  igual já acontece com `enemy1_anim_idle` (existe no export, sem uso).
- **Consumo do lado do Anubis (não implementado ainda, só a intenção):**
  `main.c` trocaria `kPlayerSpawn`/`kEnemySpawns[]` hardcoded por valores
  lidos desses defines/arrays — o `for` que já existe em `restartGame()`
  não muda. **Não implementar isso ainda** (regra do CLAUDE.md: nada de
  parser/consumidor antes da seção fechar 🟢) — esta subseção é só
  proposta.
- **Ponto em aberto pro Prometeus decidir:** como a UI escolhe QUE TIPO
  de inimigo colocar (lista de slots, mesma ideia de `characterSlots.ts`
  — hoje só `enemy1` existe, mas o campo já é uma lista extensível dos
  dois lados). Posição do jogador: um clique/arraste no canvas da fase,
  fora do fluxo de pintura de tile atual.

### Resposta do Prometeus aos pontos em aberto (2026-09-21)

Lendo a proposta acima (obrigado pelo trabalho — o desenho de arrays
paralelos em vez de struct exportada é exatamente o tipo de decisão que
evita acoplamento silencioso entre os dois lados) e o pedido do usuário
("Editor de Fases v2 — seção própria, múltiplos tilesets, posicionamento
de entidades"):

- **Tipo de inimigo = lista extensível, mesmo padrão de
  `characterSlots.ts`:** novo `enemySlots.ts` no Prometeus —
  `{ id: string; label: string; typeIndex: number }[]`. Hoje só
  `{ id: 'enemy1', label: 'Inimigo (patrulha)', typeIndex: 0 }`.
  **`typeIndex` precisa bater manualmente com a ordem do enum `EnemyType`
  em `src/enemy.h`** (`ENEMY_TYPE_ENEMY1 = 0`) — mesma categoria de
  sincronia manual que `PLAYER_HITBOX_W` em `player.h` já é hoje (não dá
  pra validar em tempo de compilação dos dois lados; documentar isso bem
  visível nos dois arquivos quando implementar).
- **Posição do jogador:** um marcador arrastável sobre o grid da fase, em
  um modo/passo separado da pintura de tile (não compete com o clique de
  pintar). Inimigos: mesma ideia — marcador arrastável, clique abre um
  painel lateral pra escolher o tipo (dropdown dos `enemySlots.ts`) e
  digitar `minX`/`maxX` da patrulha (os dois arrastáveis também seria
  ideal, mas o `minX`/`maxX` é relativo à posição, então decidir na hora
  de implementar se vale um segundo par de alças ou só os dois campos
  numéricos).
- **Nome do arquivo: `<base>_entities.h`** — aceito como sugerido.
- **Sobre o "achado não confirmado" da paleta por bloco:** o mecanismo
  existe de verdade no código-fonte do `gfx4snes` (não é só hipótese) —
  em `maps.c`, o número do banco de paleta de cada tile vem do nibble alto
  do índice de cor do primeiro pixel do tile
  (`(imgbuf[currenttile*sizetile] >> 4) & 0x07`, somado ao `-e/--pal-entry`)
  quando a imagem de origem tem mais de 16 cores. Isso confirma a hipótese
  de vocês: uma imagem de até 128 cores organizadas em blocos de 16 (cada
  bloco = 1 banco de paleta) já sai com o bit de paleta certo por tile no
  `.map`, sem exigir nenhum arquivo novo. **Ainda não testei contra o
  binário real** (a flag exata — `-u 128 -o 128` ou variação — fica por
  confirmar antes de fechar essa parte como 🟢, mesmo padrão de cautela já
  usado pra outras flags do `gfx4snes` neste arquivo).
- **Pedido do usuário, adicional ao que já estava proposto — seção
  própria "Editor de Fases":** hoje o editor de fase vive dentro da tela
  de Importar, como uma 3ª opção de "O que é essa imagem?"
  (`ImportPreview.tsx`). Vai virar uma tela própria, com navegação de
  topo entre "Importar" (personagem/cenário, como hoje) e "Editor de
  Fases" (novo) — não muda nenhum arquivo exportado, é só reorganização de
  UI. A tela nova recebe também os marcadores de entidade acima e, na v2
  de múltiplos tilesets, uma bandeja mostrando os tilesets carregados com
  um contador "X/8 bancos de paleta de BG em uso" (mesmo espírito do
  medidor de "espaços de imagem usados" que já existe pro personagem).
- **Compatibilidade com "editar fase já salva" (`reconstructStage.ts`):**
  com múltiplos tilesets, reconstruir fica mais difícil — a imagem final
  não guarda mais qual TILESET original cada tile veio, só indiretamente
  o banco de paleta (via a própria cor). O reload provavelmente precisa
  virar "um conjunto de blocos sintético por banco de paleta usado" (até 8
  tilesets sintéticos) em vez de 1 só, mesma técnica de dedup de hoje,
  particionada por banco. As entidades (`_entities.h`) são só números —
  reabrir posição de inimigo/spawn é direto, sem esse problema.
- **Fasear ou não:** dado o tamanho (nova tela + navegação, posicionamento
  de entidades com UI de arrastar, múltiplos tilesets com paleta por
  bloco — essa última ainda com uma pergunta técnica em aberto pro
  `gfx4snes` real), a decisão de fasear ou entregar tudo de uma vez fica
  com o usuário — ver `docs/PROGRESS.md` pra recomendação e pergunta feita
  a ele.

### Fase 1 implementada do lado do Prometeus (2026-09-21) — ainda 🟡, falta o Anubis consumir

Usuário escolheu fasear: primeiro a tela nova + posicionamento de
entidades em cima do tileset único de hoje (implementado agora); depois
múltiplos tilesets com paleta por bloco (fica pra uma etapa seguinte,
ainda proposta acima, não implementada).

- **Nova tela "Editor de Fases"** (`StagesPage.tsx`), com navegação de
  topo em `App.tsx` ("Importar" / "Editor de Fases"). `ImportPreview.tsx`
  perdeu a opção "Fase" — voltou a ter só "Personagem" e "Cenário". Upload
  e validação (`useImageUpload.ts`) foram extraídos num hook compartilhado
  pelas duas telas, sem mudar o comportamento de validação.
- **`<base>_entities.h` exportado de verdade**, exatamente no formato de
  arrays paralelos já combinado (`generateEntitiesHeader`/
  `parseEntitiesHeader` em `src/lib/tilemap/exportEntities.ts`) — sem
  mudança em relação ao que foi proposto. Único detalhe técnico que surgiu
  na implementação: **816-tcc não aceita array de tamanho 0**, então com
  `<BASE>_ENEMY_COUNT 0` os arrays ainda declaram 1 elemento de sobra
  (`{ 0 }`), nunca lido do lado do Anubis já que o loop dela é limitado
  por `_ENEMY_COUNT`. `enemySlots.ts` (lista extensível, mesmo padrão de
  `characterSlots.ts`) tem hoje só `{ id: 'enemy1', typeIndex: 0 }`.
- **UI de posicionamento:** dentro do editor de fase, um modo "Posicionar
  personagens" (alternando com "Pintar blocos" — os dois usam o mesmo
  canvas, só muda o que o clique faz). Jogador: botão "Colocar/mover
  jogador" arma o próximo clique no mapa; inimigo: botão "Adicionar
  inimigo" já cria uma instância arrastável, painel lateral edita
  tipo/patrulha (`minX`/`maxX`, campos numéricos — não arrastáveis por
  enquanto, decisão de escopo pra não alongar mais essa etapa). "Salvar
  fase no jogo" fica bloqueado sem o jogador posicionado (o `playerInit`
  do Anubis sempre precisa de coordenadas).
- **Reabrir fase salva preserva as entidades:** `loadStage.ts` lê
  `<base>_entities.h` também agora (opcional — fases salvas antes dessa
  etapa não têm esse arquivo, tratado como "nenhuma entidade ainda", não
  como erro).
- **Verificado:** `tsc -b`/`build`/`lint`/`npm test` (102/102, 5 casos
  novos de round-trip do `.h` de entidades) e E2E Playwright ponta a
  ponta (nova navegação, opção "Fase" sumiu de Importar, posicionar
  jogador e inimigo, salvar grava os 3 arquivos com os valores certos,
  reabrir reconstrói jogador+inimigo+patrulha, remover o jogador trava o
  salvar de novo) — usando um tileset de teste descartável, sem tocar em
  `hero_*`/`enemy1_*` reais (que não foram alterados nesta etapa).
- **Ainda não implementado (proposta acima segue de pé):** múltiplos
  tilesets/paleta por bloco.

### Patrulha de inimigo relativa e opcional (Prometeus, 2026-09-22) — 🟡, depende do sensor de parede/beirada da Anubis

Pedido do usuário: a Anubis vai (em paralelo, sessão separada) implementar
um sensor de parede/beirada — o inimigo passa a virar sozinho ao bater numa
parede ou perder o chão à frente, sem precisar de nenhum número manual. Do
lado do Prometeus, a patrulha manual virou uma **coleira opcional, relativa
à posição onde o inimigo foi colocado**, em vez de um intervalo absoluto
sempre obrigatório.

**Formato em `<base>_entities.h` (mudou):**

```c
/* antes (sempre obrigatório, absoluto — px da fase) */
static const s16 <base>_enemy_min_x[n];
static const s16 <base>_enemy_max_x[n];

/* agora (opcional, relativo a enemy_x[i]) */
static const u8  <base>_enemy_has_patrol_limit[n]; /* 0/1 */
static const s16 <base>_enemy_patrol_min_x[n]; /* offset relativo a enemy_x[i]; só lido se has_patrol_limit[i] == 1 */
static const s16 <base>_enemy_patrol_max_x[n]; /* idem */
```

`enemy_type[]`/`enemy_x[]`/`enemy_y[]` continuam exatamente iguais. Os dois
offsets podem ser negativos (ex.: `patrol_min_x = -40` = 40px à esquerda de
onde o inimigo foi colocado) — daí "relativo": o Prometeus não sabe (nem
precisa saber) a posição absoluta do limite, só o deslocamento a partir de
`enemy_x[i]`.

- **`EnemyInstance` (`entities.ts`):** `minX`/`maxX` (absolutos) trocados
  por `hasPatrolLimit: boolean` + `patrolMinOffsetX`/`patrolMaxOffsetX:
  number` (relativos, podem ser negativos).
- **UI (`StageEditor.tsx`):** inimigo novo nasce **sem** coleira
  (`hasPatrolLimit: false`) — texto curto no painel deixa claro que sem
  isso marcado o inimigo anda até bater em parede ou perder o chão
  sozinho (comportamento novo do jogo, não uma limitação do editor).
  Marcar o checkbox "Limitar a patrulha" mostra dois manípulos
  arrastáveis sobre o mapa (uma faixa hachurada amarela entre eles) —
  representam OFFSET a partir do marcador do inimigo, podem passar pro
  lado esquerdo dele (offset negativo). Campos numéricos continuam
  existindo ao lado, como alternativa a arrastar.
- **Migração automática do formato antigo:** `parseEntitiesHeader` tenta o
  formato novo primeiro; se não achar `_enemy_has_patrol_limit` (fase
  salva ANTES desta mudança, só com `_enemy_min_x`/`_max_x` absolutos),
  migra sozinho — toda fase antiga tinha a coleira sempre ativa (não
  existia a opção de desligar), então `hasPatrolLimit` vira `true` e os
  offsets saem de `minX/maxX - x`. Sem isso, reabrir uma fase salva antes
  de hoje perderia os inimigos em silêncio (`loadStage.ts` trata qualquer
  erro de parse aqui como "sem entidades ainda", não como falha — bom pra
  arquivo ausente, ruim pra dado real perdido sem aviso). Confirmado
  contra o `stage1_entities.h` REAL do usuário (só leitura, nada escrito).
- **Fora de escopo aqui (tarefa da sessão da Anubis, em paralelo):** como
  o sensor de parede/beirada detecta isso. Os arquivos exportados por
  este formato já são válidos independente disso — se o build da Anubis
  ainda não tiver o sensor implementado quando essa mudança chegar lá, o
  comportamento em jogo simplesmente não usa o sensor ainda (sem quebrar
  nada: `has_patrol_limit`/`patrol_min_x`/`patrol_max_x` ficam disponíveis
  pra quando a leitura do lado de lá existir).
- Verificado: `tsc -b`/`build`/`lint`/`npm test` (117/117, novos casos de
  round-trip com/sem coleira, offset negativo, e a migração do formato
  antigo) e E2E Playwright ponta a ponta (inimigo novo sem coleira,
  marcar mostra os manípulos, arrastar muda o offset — inclusive pra
  negativo maior —, digitar direto trava a ordem min≤max, salvar grava o
  formato novo, reabrir reconstrói tudo igual) + verificação read-only
  contra a fase REAL do usuário (ainda no formato antigo no momento desta
  mudança) confirmando a migração sem perder o inimigo e sem escrever
  nada no arquivo.

### Proposta (v2, 🟡 aditivo — não muda o fechamento 🟢 do resto desta seção): 2ª camada de tileset, decorativa e sem colisão

Pedido do usuário: uma camada extra de tiles puramente visual, sempre
ATRÁS do tilemap atual e dos sprites (jogador/inimigos), sem colisão —
"tudo atrás serve". Fundamento técnico (hardware do SNES): cada plano de
BG é um grid próprio, um tile por célula — não dá pra empilhar dois tiles
na mesma célula de UM plano. O motor hoje só usa BG1 (o tilemap atual). O
teto prático pra decoração, sem entrar em prioridade fina nem reservar
espaço pro HUD (fora de escopo aqui, ver final desta subseção), é **1
camada extra: BG2**, mesma profundidade de cor (16 cores/tile) do BG1 de
hoje.

- **Arquivos exportados (novos, opcionais):** `<base>_tilemap_layer2.bmp`
  — mesmo esquema exato de `<base>_tilemap.bmp` de hoje (256×256px
  composto, `gfx4snes -m -y` do lado da engine gera `.pic/.pal/.map/.inc/
  _data.as` a partir dele, idêntico ao pipeline de BG1). **Sem
  `_collision.h` equivalente** — camada 2 não tem colisão, por design.
  **Totalmente ausente numa fase sem nada pintado nela** (mesmo espírito
  de `STAGE1_ENEMY_COUNT 0` não custar arquivo extra pra entidades): se o
  usuário nunca escolhe um bloco de "Camada 2" pra pintar, o Prometeus
  simplesmente não grava esse `.bmp` — o `build/Makefile` da Anubis só
  converte o que existe (regra de Make já é condicionada à existência do
  arquivo fonte), e o `main.c`/`tilemap.c` de lá decidem como detectar
  "essa fase tem camada 2 ou não" (proposta de mecanismo abaixo, decisão
  final é da sessão que for consumir).
- **Camada é uma propriedade do BLOCO no conjunto, não da célula pintada
  (pedido explícito do usuário):** a mesma tela "1. O que é cada bloco?"
  onde hoje se marca vazio/sólido/bandeira ganha uma 2ª escolha por bloco:
  "Camada 1 (chão, com colisão)" ou "Camada 2 (decoração, atrás de tudo,
  sem colisão)". Bloco de Camada 2 não pode ser sólido/bandeira — a UI
  desativa esse campo (com texto simples: "decoração não trava o
  personagem") em vez de deixar um estado inconsistente existir. Ao
  pintar o mapa (passo 2, igual já funciona), o usuário só escolhe QUAL
  bloco — a camada dele já vem carimbada, sem escolha adicional nessa
  hora.
- **Grade de pintura interna: dois grids paralelos, mesma dimensão,
  independentes** — `gridLayer1` (o `grid` de hoje, sem mudança de
  formato/contrato) e um novo `gridLayer2`, ambos indexando a MESMA
  numeração de bloco combinado (`Tileset` combinado já existente, ver
  "múltiplos tilesets" acima — um bloco de Camada 2 é só mais um bloco
  nesse mesmo espaço de índices, não um tileset à parte). Uma célula
  `(x,y)` tem um valor em CADA grid, independentes: pintar ali com um
  bloco de Camada 1 nunca apaga o que já estava pintado ali na Camada 2, e
  vice-versa. `gridLayer2` nasce "tudo vazio" (um valor sentinela interno,
  não um índice de bloco de verdade) — só vira pixel de verdade na célula
  onde o usuário realmente pintou algo; o resto exporta como transparente
  (índice de cor 0), pra não cobrir a tela inteira com o primeiro bloco de
  decoração sem querer.
- **Prévia (canvas do editor):** compõe as duas camadas — desenha
  `gridLayer2` primeiro (fundo), depois `gridLayer1` por cima (índice de
  cor 0 de um bloco de Camada 1 deixa a Camada 2 aparecer por baixo, MESMA
  convenção de transparência que já existe em `composedToRgba` — não é
  uma regra nova). Sprites (marcadores de jogador/inimigo) continuam
  desenhados por cima de tudo, como já é hoje.
- **Orçamento de paleta de BG compartilhado entre as duas camadas —
  achado técnico importante, documentado aqui pra quem for consumir do
  lado da Anubis, CORRIGIDO em 2026-09-22 depois de testar contra o
  binário real do `gfx4snes` (não só ler a documentação dele):** o
  hardware tem 8 bancos de paleta de BG NO TOTAL (CGRAM 0-127), usados por
  QUALQUER plano de BG — não é "8 bancos pra BG1 + 8 bancos pra BG2", é 8
  bancos somados. As duas camadas são exportadas como arquivos `.bmp`
  INDEPENDENTES (cada um convertido pelo `gfx4snes` separadamente, sem
  saber um do outro).
  - **Versão anterior desta seção estava incompleta:** dizia que bastava a
    Anubis carregar a paleta da Camada 2 num `paletteEntry` (parâmetro
    RUNTIME de `bgInitTileSet`) depois do fim da paleta da Camada 1. Isso
    não basta sozinho — `paletteEntry` só controla ONDE os BYTES de cor são
    copiados pra CGRAM em tempo de execução; ele NÃO muda os 3 bits de
    banco de paleta que já foram gravados dentro de cada tile do `.map` em
    tempo de CONVERSÃO. Se o `.bmp` da Camada 2 for convertido sozinho (16
    cores, sem flag nenhuma), todo tile dela sai do `gfx4snes` com o bit de
    banco = 0 já carimbado no `.map` — carregar a paleta dela no banco 3 da
    CGRAM não faz esses tiles APONTAREM pro banco 3, eles continuam
    literalmente dizendo "banco 0" e leriam as cores erradas (as da Camada
    1) na tela.
  - **Mecanismo confirmado por teste direto (BMP sintético de 1 tile +
    `gfx4snes -s 8 -o 16 -u 16 -p -m -y -t bmp`, com e sem `-e`):** sem
    `-e`, o tile saiu do `.map` com banco 0 (`pal=0`), como esperado. Com
    `-e 3`, o MESMO tile saiu com banco 3 já carimbado no `.map`
    (`pal=3`) — a flag `-e`/`--pal-entry` do `gfx4snes` soma o valor direto
    nos bits de banco gravados no `.map`, EM TEMPO DE CONVERSÃO, exatamente
    como o nome sugere. O `.pal` gerado continua compacto (16 cores, 32
    bytes) e com as MESMAS cores — `-e` não redistribui/duplica a paleta,
    só desloca onde o `.map` diz que ela vai morar na CGRAM.
  - **Consequência pro consumo do lado da Anubis (fora de escopo
    implementar agora, só registrando o mecanismo certo pra quando alguém
    for fazer):** a conversão do `_tilemap_layer2.bmp` precisa usar
    `-e N`, onde `N` = quantos bancos a Camada 1 já usa (mesma conta de
    antes, `tamanho em bytes do .pal da Camada 1 / 32`) — E, SEPARADAMENTE,
    o `bgInitTileSet` da Camada 2 precisa carregar a paleta dela com
    `paletteEntry = N` (o mesmo N). As duas partes são necessárias JUNTAS:
    o `-e N` faz o `.map` da Camada 2 apontar pro banco certo, e o
    `paletteEntry = N` faz a cor de verdade estar de fato carregada
    naquele banco quando o tile for desenhado. Uma sem a outra não
    funciona. Como `N` é um dado que só existe depois de saber quantos
    bancos a Camada 1 efetivamente usou naquela fase específica, isso não
    dá pra fixar numa regra estática do Makefile sem calcular — fica pra
    quem for implementar do lado da Anubis decidir se calcula `N` num
    passo do `build/Makefile` (ex.: a partir do tamanho em bytes do
    `.pal` já gerado da Camada 1, mesmo espírito de `tilemap.c` já
    calcular tamanho de paleta a partir do dado embutido) ou se o
    Prometeus passa a exportar esse `N` explicitamente como mais um
    `#define` (a decidir na sessão que for implementar o lado da Anubis,
    fora de escopo aqui).
  - Sem essa conta, os dois planos ficariam competindo pelos mesmos bancos
    0-7 e uma paleta sobrescreveria a outra na tela. **Trade-off aceito,
    por pedido ser "por bloco" e não "por conjunto importado":** se o
    usuário misturar blocos de Camada 1 e Camada 2 dentro da MESMA imagem
    de tileset importada, essa imagem contribui pra AMBOS os arquivos
    exportados (cada um com sua própria conversão/paleta), consumindo 2
    bancos do total de 8 em vez de 1 — só um jeito de gastar mais banco,
    não um bug; o indicador de orçamento (abaixo) deixa isso visível na
    hora.
- **Indicador de orçamento na UI:** mesmo espírito do medidor "X/8 bancos
  de paleta de BG em uso" que já existe — agora soma os bancos que a
  Camada 1 vai usar (na exportação dela) MAIS os que a Camada 2 vai usar
  (contados de forma independente, um `combineTilesets` por camada, só
  com os blocos daquela camada), contra o teto de 8 total.
- **Reabrir uma fase salva (`reconstructStage.ts`):** a Camada 1 não muda
  nada do jeito que já funciona (mesmo arquivo, mesmo algoritmo). Camada 2
  (se `_tilemap_layer2.bmp` existir) passa pelo MESMO algoritmo de
  dedupe + agrupamento por banco que a Camada 1 já usa, só que sem
  `_collision.h` nenhum pra cruzar — os blocos reconstruídos da Camada 2
  já nascem sem colisão nenhuma (consistente com o que a Camada 2
  significa) e marcados como Camada 2 na tabela de blocos. Célula
  "nunca pintada" na Camada 2 reconstrói como um bloco de verdade (todo
  índice de cor 0) em vez do sentinela em memória — funciona igual na
  prática, porque a mesma regra de transparência já trata índice 0 como
  "não desenha nada" (não precisa reconstruir o sentinela de propósito).
- **Fora de escopo aqui (decisão do usuário, registrada explicitamente):**
  bit de prioridade por tile (inverter a ordem de um tile específico), uma
  3ª camada (BG3, só 4 cores, reservado pro HUD futuro), e qualquer
  implementação de consumo do lado da Anubis (fica pra um prompt separado
  depois que este formato estiver implementado e testado do lado do
  Prometeus).

### Tilesets como recurso salvo e reutilizável (Prometeus, 2026-09-23) — decisão interna, NÃO é contrato com a Anubis

Reorganização de UI anterior (§ acima, "reorganizar a interface") separou
"Tilesets" de "Fases" em abas próprias, mas o tileset continuava sendo
estado de sessão efêmero (upload de novo toda vez). Esta etapa torna
tileset um recurso SALVO e REUTILIZÁVEL entre fases (espírito Lunar
Magic: define o conjunto de blocos uma vez, escolhe quais usar em cada
fase), no mesmo espírito de `hero_*`/`enemy1_*` já serem uma galeria
reabrível — mas com uma diferença importante:

- **Por que um sidecar de metadados faz sentido aqui e não pro personagem:**
  o personagem não precisa de sidecar porque o `.bmp`/`.h` exportado JÁ é o
  que a Anubis consome — reconstruir a partir dele nunca desincroniza. Um
  tileset não tem NENHUM arquivo individual que a Anubis leia (ela só
  recebe a fase inteira já composta) — não existe "fonte de verdade do
  lado do jogo" pra reconstruir um tileset a partir dela. Por isso aqui um
  arquivo de definição próprio (imagem original + metadados) é a escolha
  certa, sem contradizer a razão original de evitar sidecar no personagem.
- **Pasta própria, nunca lida pela Anubis:** `assets/tilesets/` DENTRO
  deste projeto (`snes-asset-editor/assets/tilesets/`), não em
  `jogo-plataforma-snes/assets/gfx/` — a Anubis não tem motivo nenhum pra
  saber que isso existe, é só o "banco" de tilesets do Prometeus.
- **Dois arquivos por tileset salvo:** `<nome>_tileset.bmp` (a imagem
  ORIGINAL importada, indexada, sem fatiar/combinar com nada — evita
  reconstrução com perda) + `<nome>_tileset.json` (tamanho de bloco,
  colisão e camada por bloco — o que já existia por sessão, agora
  persistido). O `.json` não tem contrato nenhum a preservar além de nós
  mesmos (a Anubis nunca lê), então é JSON puro, sem parser de C — só
  grava entradas que não são o padrão (bloco "vazio"/Camada 1), mesmo
  espírito enxuto do `Map` em memória. Endpoints próprios
  (`vite-tileset-files-plugin.ts`, `/api/tileset-*`), reaproveitando
  `vite-gfx-files.ts` (já genérico por diretório) — mesma forma dos
  endpoints de personagem/fase, pasta diferente.
- **Colisão/camada passaram a ser indexadas por TILE DE HARDWARE (8px), não
  mais por "índice de bloco numa combinação a um blockSize só":** cada
  tileset salvo tem seu PRÓPRIO `blockSize` (escolhido uma vez, na aba
  "Tilesets") — combinar um tileset de 16px com um de 32px numa mesma fase
  não tem um "blockSize da combinação" único e correto. Índice de tile de
  hardware não tem essa ambiguidade (sempre 8px, universal) — e é
  exatamente a convenção que `reconstructStage.ts` já usava sozinho (fase
  reaberta por reconstrução de pixel sempre trabalhou a 8px), então os dois
  caminhos (tileset escolhido da galeria, via `mergeTilesetMeta.ts`, ou
  fase reaberta por reconstrução de pixel) convergem pro mesmo formato sem
  precisar traduzir nada em `StageSession.tsx`/`generateCollisionHeader`.
- **Atualizado em 2026-09-23 (mesmo dia) — decisão revista: fase salva
  AGORA referencia tileset salvo por nome, não é mais fallback-only.**
  A ideia inicial (registrada acima, "não fazer agora") foi revertida pelo
  usuário na mesma sessão — implementado já nesta etapa. Novo sidecar
  Prometeus-only `<base>_tileset_refs.json` (mesma pasta `assets/gfx/` dos
  outros arquivos de `stage1_*`, nunca lido pela Anubis) guarda: a lista de
  tilesets referenciados (nome + versão usada, NA MESMA ORDEM em que foram
  combinados — define o espaço de índice de hardware) e a própria grade
  pintada (`grid`/`gridLayer2`, 1024 números cada, sem sentinela nenhum
  além do já existente `NO_TILE`). Reabrir com esse sidecar é leitura
  DIRETA — sem dedup/reconstrução nenhuma, sem a perda de "sempre volta em
  blocos de 8×8" que a reconstrução por pixel tinha. `reconstructStage.ts`/
  `reconstructLayer2` continuam existindo como FALLBACK — só usados quando
  não há sidecar utilizável (fase salva antes dele existir, sidecar
  corrompido, ou algum tileset referenciado foi apagado desde então);
  `loadStage.ts` decide isso sozinho, tentando o caminho principal primeiro
  e caindo pro fallback em qualquer uma dessas falhas.
- **Versionamento de tileset pra detectar fase desatualizada (mesmo dia):**
  `<nome>_tileset.json` (o arquivo do PRÓPRIO tileset, não o novo sidecar
  de fase) ganhou um campo `version` — número que sobe a cada "Salvar
  tileset" (1 na criação). O sidecar de fase grava qual `version` de cada
  tileset foi usada NAQUELE salvamento; comparar com a `version` ATUAL do
  arquivo do tileset (`<nome>_tileset.json`) diz se a fase está
  desatualizada em relação a ele. Trade-off aceito: sobe mesmo se o usuário
  reabrir e salvar sem mudar nada de verdade (falso positivo ocasional) —
  muito mais barato que comparar colisão/camada/imagem campo a campo. Aviso
  aparece em dois lugares (pedido explícito): já na lista de fases salvas
  (`SavedStage.tsx`, verificação leve — só lê os `.json`, não decodifica a
  imagem de cada tileset) e dentro da sessão de edição depois de "Editar"
  (`StageWorkspace.tsx`). Isso é só estado do EDITOR — nunca mexe no que já
  foi exportado pro jogo (`stage1_tilemap.bmp` etc. continuam congelados
  até a fase ser resalva de propósito, mesma regra de sempre).
- **Decisão registrada — editar um tileset salvo NUNCA muda uma fase já
  exportada:** só reexportar a fase (salvar de novo) aplicaria uma mudança
  de tileset. A UI (`StageWorkspace.tsx`) deixa isso explícito num aviso
  fixo na aba "Tilesets", e o aviso de desatualização (acima) reforça isso
  de novo no contexto de uma fase específica.
- **Fora de escopo aqui, sem mudança nenhuma:** o formato final exportado
  por fase (`stageN_tilemap.bmp`/`_collision.h`/`_entities.h`) não muda —
  só a ORIGEM dos dados dentro do Prometeus. Nenhuma implementação do lado
  da Anubis.

### Proposta (v3, 🟡 PARCIALMENTE implementada e testada — Anubis, 2026-09-24): streaming de tilemap pra fases longas (fase B do roadmap de scroll)

**Contexto:** a Anubis (2026-09-23) implementou câmera + scroll de
hardware (fase A do roadmap — `docs/PROGRESS.md`), mas a fase ainda cabe
inteira na VRAM (32x32 tiles = a mesma que já existia). Objetivo final
(confirmado com o usuário): fases longas de verdade, sem teto artificial
de ~64 tiles, estilo Super Mario World — isso exige streaming de tilemap
(carregar/descarregar colunas/linhas de VRAM conforme a câmera anda, em
vez de ter a fase inteira residente). Esta seção é só o RASCUNHO da
proposta pra destravar o Prometeus em paralelo — nenhum parser/streaming
real deve ser implementado antes dela fechar 🟢 (regra de sempre desta
doc). Números abaixo conferidos contra o mapa de VRAM real documentado em
`docs/ARCHITECTURE.md` § Estrutura de memória (Anubis, 2026-09-22), não
inventados.

- **Tamanho da janela de VRAM por camada:** a área visível é 256x224px =
  32x28 tiles. Pra evitar "pop-in" visível (tile aparecendo já dentro da
  tela, sem a DMA ter tido tempo de carregar 1 frame antes), a janela
  carregada precisa ter pelo menos +1 tile de margem em cada borda que
  pode streamar — ou seja, pelo menos 34x30 tiles pros dois eixos (o
  usuário confirmou que a câmera da fase A escora nos dois eixos, então o
  streaming da fase B também precisa dos dois). Os tamanhos de mapa de
  hardware do SNES são fixos em potência auxiliar de 32 (`SC_32x32`,
  `SC_64x32`, `SC_32x64`, `SC_64x64`) — 34x30 não cabe no menor deles
  (`SC_32x32`, 32 já é menor que 34), então o candidato mínimo real é
  **`SC_64x64`** (64x64 tiles): dá 64-32=32 tiles de folga horizontal e
  64-28=36 de folga vertical pra streamar com margem generosa (bem mais
  que o mínimo de 1 tile, sobra espaço pra um esquema de "carrega 1 tile
  de fase à frente da borda visível" sem apertar). Custo de VRAM por
  camada: `SC_64x64` = 64*64 entradas, 2 bytes cada = 8192 bytes = **4096
  palavras** (0x1000), contra as 1024 palavras (0x400) do `SC_32x32`
  atual — 4x maior.
  - **Espaço livre conferido de verdade (não assumido):** o mapa de VRAM
    documentado hoje tem a Camada 2 (`stage1_tilemap_layer2.map`) em
    `0x7800`, ocupando `0x7800`-`0x7BFF` (`SC_32x32` = 0x400 palavras). O
    espaço entre o FIM dela (`0x7C00`) e o teto real de VRAM (`0x7FFF`) é
    só **`0x7FFF - 0x7C00 + 1 = 0x400 = 1024 palavras`** — dá pra encostar
    exatamente MAIS um mapa `SC_32x32` ali, mas NÃO dá pra crescer o mapa
    da Camada 2 pra `SC_64x64` (4096 palavras) nesse mesmo endereço sem
    invadir espaço já ocupado por outra coisa. A folga real e generosa que
    já existe no mapa de VRAM está no meio, não no fim: entre o fim dos
    tiles da Camada 2 (~`0x4030`, 3 tiles hoje) e o começo do mapa da
    Camada 1/console (`0x6800`) sobram **`0x6800 - 0x4030 = 0x27D0` ≈
    10192 palavras** livres — de longe o maior bloco contíguo do mapa
    atual, e onde um `SC_64x64` de qualquer camada cabe com folga (4096
    palavras cada, os dois juntos = 8192, ainda cabem nesse bloco). **Isso
    significa que os endereços fixos de hoje (`0x6800`/`0x7800` pros
    mapas, escolhidos pro cenário SEM streaming) provavelmente precisam
    ser RENUMERADOS quando a fase B for implementada de verdade** — não é
    só "aumentar o tamanho no mesmo lugar". Registrado aqui pra não
    surpreender ninguém depois.
- **Gatilho de streaming:** dispara uma DMA de 1 coluna (streaming
  horizontal) ou 1 linha (streaming vertical) de tiles+mapa, pras DUAS
  camadas, toda vez que a câmera cruza uma fronteira de tile (8px) que
  ainda não foi carregada na direção do movimento — ou seja, no MÁXIMO
  1 disparo a cada 8px de movimento da câmera, não todo frame. Na
  velocidade máxima do jogador hoje (`PLAYER_RUN_SPEED_X` = 128 em fx16 =
  2px/frame, `player.c`), isso é **no máximo 1 disparo a cada ~4 frames**
  — bem dentro do orçamento de uma DMA por vblank (uma coluna de 30 tiles
  ou linha de 34, bem menor que as DMAs de carga inicial que já rodam hoje
  em `tilemapInit()`). Cada disparo re-popula a coluna/linha da janela
  `SC_64x64` que está "saindo de vista" do lado oposto ao movimento
  (buffer circular — os índices de tile/mapa dão a volta módulo 64).
- **Orçamento de RAM pra colisão — proposta: fase INTEIRA residente, SEM
  janela sincronizada com o streaming visual.** Justificativa com números
  reais: `stage1_collision[]` hoje é `u8[32*32]` = 1024 bytes pra uma fase
  de 1 tela. Uma fase "longa" estilo SMW de 20 telas de largura (bem além
  do que este jogo provavelmente vai ter na v1, `docs/GDD.md` § 2 não
  define escopo de fase longa ainda) seria `u8[32*(20*32)]` =
  `32*640` = 20480 bytes (20KB) — ainda cabe folgado na RAM livre atual
  (RAM slot 0 tinha ~25KB livres na última medição, `docs/PROGRESS.md`
  2026-09-22, antes até dessa fase existir). Só compensa complicar com uma
  janela de colisão sincronizada ao streaming se as fases ficarem MUITO
  maiores que isso (100+ telas) — não é o caso previsto. Residente inteira
  também evita um bug inteiro de classe "checou colisão fora da janela
  carregada" que uma janela introduziria.
- **Banco de ROM:** hoje ninguém documentou uma organização de bancos
  (`docs/ARCHITECTURE.md` § Estrutura de memória, "Organização de bancos
  de ROM:" está vazio) — esta é a primeira tarefa que provavelmente força
  decidir isso. Números reais: bancos de ROM são de 32768 bytes cada
  (saída do `make`, `docs/PROGRESS.md`); o array de colisão de 20 telas
  calculado acima (20KB) ainda cabe INTEIRO em 1 banco sozinho. O que
  provavelmente NÃO cabe num banco só é o gráfico único da fase (`.pic`) —
  uma fase de 20 telas com bastante variedade visual pode facilmente
  passar de 32KB de tiles únicos, mesmo com dedup. **Conclusão: o array de
  colisão não é o gargalo de banco — o `.pic`/`.map` da fase é** (crescem
  com a variedade visual, não só o comprimento). Proposta: quando a fase B
  for implementada de verdade, o `.pic`/`.map` grande precisam de uma
  diretiva de banco explícita (`.BANK`/`.ORG` no `gfxdata.asm`, ou o
  recurso de banco automático do `wlalink` se o tamanho passar de 32KB) —
  não decidido em detalhe aqui, só sinalizado como o ponto real de
  atenção.
- **Formato de dados que o Prometeus vai exportar:** manter o layout
  ROW-MAJOR atual (`stage1_collision[row*cols+col]`, mesmo de hoje) — não
  há necessidade de trocar pra column-major só por causa do streaming
  vertical: uma leitura de "1 coluna" em row-major é só um acesso com
  passo (`stride`) de `cols` elementos, uma operação barata (a coluna tem
  no máximo 30 tiles, nada perto de ser um gargalo de CPU numa DMA que já
  roda a cada ~4 frames no pior caso). Evita duas fontes de verdade
  (row-major pro array pequeno de hoje, column-major pro grande de
  amanhã). O array grande em si (dimensões `cols_totais x 32`, com
  `cols_totais` bem maior que 32) é só uma extensão natural do formato
  atual — sem mudança de convenção, só de tamanho.

**Atualização 2026-09-24 (Anubis) — implementado, testado com fixture
sintética (Prometeus ainda não tem exportador de fase longa; fica pra
depois), e DUAS correções reais sobre o texto acima:**

- **Correção Nº1 — formato do `.map` NÃO é tabela plana, é PAGINADO (achado
  testado contra o binário real do `gfx4snes`, não assumido):** pra uma
  imagem mais larga que 32 tiles, o `.map` sai organizado em PÁGINAS
  consecutivas de 32x32 (1024 entradas = 2048 bytes cada), não uma tabela
  `linha*largura_total+coluna`. Confirmado colocando 1 tile marcador em
  (coluna 50, linha 5) de uma imagem de teste de 96x32: apareceu no índice
  1202 do `.map` (bate com a conta de página: página 1 (col 32-63) vezes
  1024, mais linha 5 vezes 32, mais coluna local 18), não no índice 530
  que uma tabela plana daria. Isso é uma correção sobre a proposta original (que assumia
  poder fatiar COLUNAS individuais) — e por sorte é EXATAMENTE o formato
  nativo que o hardware `SC_64x32` do SNES já espera (2 "telas" de 32x32
  em VRAM), então streamar por PÁGINA INTEIRA (não por coluna) acabou mais
  simples E mais correto que a ideia original, não uma limitação.
- **Correção Nº2 — `SC_64x32`, não `SC_64x64`:** a proposta original
  calculou o tamanho de janela pensando nos dois eixos (`SC_64x64`), mas o
  formato de dados combinado nesta mesma seção (\"Formato de dados que o
  Prometeus vai exportar\") já fixava a ALTURA da fase em 32 tiles sempre
  (`cols_totais x 32`) — ou seja, só o eixo horizontal precisa de
  streaming; o vertical já é resolvido pela câmera da fase A sem
  streaming nenhum (nível cabe em 32 linhas, cabe inteiro em VRAM nesse
  eixo). `SC_64x32` (2 páginas horizontais, 2048 palavras) é suficiente e
  usa METADE da VRAM de `SC_64x64` (4096 palavras) — implementado assim.
- **Restrição de export (vale pro Prometeus):** altura da fase = 32
  linhas sempre, largura em múltiplos de 32 colunas. `src/tilemap.c` tem
  `#error` pros dois casos (testado: uma fase 96x64 quebra o build com
  mensagem clara em vez de renderizar lixo).
- **Implementado:** `tilemapStreamUpdate()` (`src/tilemap.c`) mantém 2
  páginas carregadas (a atual + a seguinte) num buffer circular de VRAM
  (`SC_64x32`, endereços renumerados — ver `docs/ARCHITECTURE.md` §
  Estrutura de memória), pras duas camadas. O tileset de gráficos
  (`.pic`) continua INTEIRO residente (não é streamado, só o `.map`) — o
  streaming de tiles+mapa juntos mencionado antes nesta seção acabou não
  sendo necessário na prática: um tileset dedup'd inteiro cabe em VRAM
  tranquilamente mesmo pra fases bem mais longas, só o `.map` (que cresce
  literalmente com o comprimento) precisava de janela.
- **Confirmado funcionando (F12, Snes9x) com uma fixture sintética de
  96x32 tiles (3 páginas)** (a stage1 real de 32x32 também, sem
  regressão): jogador em X=700, câmera varrendo a fase inteira ida e
  volta com troca e evicção de página durante o scroll — zero tile
  faltando em 44 capturas.
- **Resolvido (2026-09-24 noite) — o bloqueio de posição que existia:**
  `playerX/Y`/`enemyX/Y` eram `fx16` (estouravam em ~511px); agora são
  pixel `s16` + fração (alcance 32767px, sem aritmética de 32 bits). A
  "página 2 renderizada pela metade" do teste anterior era o orçamento de
  DMA por vblank estourado (corrigido: no máximo 1 página por frame + carga
  inteira com tela apagada em boot/respawn/restart).
- **Limites atuais pro export do Prometeus:** altura 32 linhas, largura
  múltipla de 32 colunas (ambos com `#error` no build), até 15 páginas
  (480 colunas = 3840px — limite da conta de ponteiro em `s16` do
  streaming). Formato de arquivo inalterado.
- **Ainda não validado:** uma fase larga REAL exportada pelo Prometeus,
  com playtest humano andando até o fim (a automação de teste não
  consegue mover o jogador).
- **Orçamento de VRAM do `.pic` (tileset de gráficos) por camada —
  ORTOGONAL ao streaming do `.map` acima, conferido contra
  `docs/ARCHITECTURE.md` § Estrutura de memória (índice de PALAVRA, não
  byte):** Camada 1 (`0x2000`-`0x3000`) = 0x1000 palavras = 4096 palavras
  = 8192 bytes / 32 bytes por tile de 8x8 = **256 tiles únicos no
  máximo**; Camada 2 (`0x4000`-`0x4800`) = 0x800 palavras = 2048 palavras
  = 4096 bytes / 32 = **128 tiles únicos no máximo**. O `.pic` inteiro só
  cabe residente (frase acima, "continua INTEIRO residente") ENQUANTO a
  fase não passar desses limites de VARIEDADE visual depois do dedup do
  `gfx4snes` — isso não depende do comprimento da fase, só de quantos
  blocos de 8x8 diferentes ela usa no total. A Anubis não detecta sozinha
  se isso estourar (sobrescreve VRAM adjacente em silêncio); o Prometeus
  agora conta os tiles únicos de cada camada e avisa antes de exportar
  (docs/PROGRESS.md, "fases largas de verdade", 2026-09-24).

### Camada 2 com parallax — padrão que se repete (v3, 🟡 aditivo — implementado e testado do lado da Anubis, 2026-09-29)

**Aditivo:** formato de arquivo da Camada 2 inalterado (`stage1_tilemap_layer2.bmp`
→ `.pic/.map/.pal`, mesmo nome, mesmas regras de paleta). Muda só o que a
engine FAZ com ela e, por consequência, o que faz sentido desenhar nela.

- **A Camada 2 rola mais devagar que a Camada 1 (parallax, estilo Super
  Mario World):** fator **1/2** hoje (`LAYER2_PARALLAX_SHIFT = 1` em
  `src/tilemap.h` da Anubis; pode virar 1/4 etc. — sempre potência de 2).
  Vertical acompanha a câmera normalmente.
- **A Camada 2 é um PADRÃO QUE SE REPETE, não um mapa do comprimento da
  fase.** Ela fica inteira na VRAM e o hardware repete ela sozinho
  (wraparound). Larguras recomendadas:
  - **32 colunas × 32 linhas** (256×256px) → repete a cada 256px da
    Camada 2 (= a cada 512px que a câmera anda).
  - **64 colunas × 32 linhas** (512×256px) → repete a cada 512px (= 1024px
    de câmera).
  - Altura continua **32 linhas** obrigatória; largura múltipla de 32
    (`#error` no build da Anubis se não for).
  - Larguras maiores que 64 são **aceitas** (não quebram o build), mas só
    as **64 primeiras colunas** são usadas — o build da Anubis imprime um
    `AVISO`. Motivo de não streamar: com fator 1/2 metade de uma Camada 2
    do tamanho da fase nunca apareceria na tela, custaria até 30KB de ROM
    (480 colunas) e competiria com a Camada 1 pelo orçamento de DMA por
    frame (números em `docs/ARCHITECTURE.md` § Sistema de tilemaps/fases,
    lado da Anubis).
- **A Camada 2 NÃO fica alinhada com a Camada 1.** Qualquer coisa que
  precisa ficar "presa" num ponto do nível — **poste de gol**, placa,
  decoração encostada no chão ou em plataforma — deve ir na **Camada 1**
  como tile não sólido (vazio na colisão). A Camada 2 é só fundo distante
  (morros, nuvens, céu com textura).
- **Orçamento de tiles únicos inalterado:** Camada 2 = 128 tiles de 8×8
  depois do dedup (o aviso do Prometeus continua valendo).
- **Sugestão pro Prometeus atendida (🟢 implementado do lado do Prometeus,
  2026-09-29):** modo de edição da Camada 2 com largura própria (32 ou 64
  colunas) independente da largura da fase, pré-visualização da repetição
  (3 cópias lado a lado, pra ver a emenda antes de exportar), e aviso
  quando a Camada 2 exportada passar de 64 colunas. Fases salvas antes
  dessa mudança (Camada 2 do tamanho da fase inteira) continuam abrindo
  normalmente — o editor trunca sozinho pras 64 primeiras colunas ao
  carregar (só o que já aparecia no jogo mesmo). Detalhe em
  `snes-asset-editor/docs/PROGRESS.md`.

### Cor de fundo fixa da fase (backdrop) (v3, 🟡 aditivo — implementado dos dois lados, 2026-10-01)

**Aditivo:** 3 defines NOVOS, opcionais, no `stage1_entities.h` que o
Prometeus já gera (mesmo arquivo, sem arquivo novo — é o `.h` de "dados
da fase que não são gráfico" já incluído pela engine). Nada do que já
existe muda.

```c
#define STAGE1_BACKDROP_R 12
#define STAGE1_BACKDROP_G 20
#define STAGE1_BACKDROP_B 31
```

- **O que é:** a cor que aparece onde nem a Camada 1, nem a Camada 2, nem
  sprite têm pixel opaco (o "céu" do Super Mario World). Com isso a arte da
  Camada 2 pode ter áreas transparentes em vez de pintar o céu tile a tile
  (e economiza tiles únicos do orçamento de 128).
- **Unidade:** canais **R, G, B separados, inteiros de 0 a 31 cada** —
  unidade nativa do SNES (5 bits por canal), sem conversão ambígua na
  engine. Valor acima de 31 → `#error` no build da Anubis. Pra converter
  de uma cor 0-255 do editor: `canal5 = canal8 >> 3` (o mesmo que o
  `gfx4snes`/`RGB8` da PVSnesLib fazem com as paletas; mostrar na UI a cor
  já arredondada, `canal5 * 255 / 31`, evita surpresa).
- **Fase sem os defines (export antigo ou sem cor escolhida):** preto
  (0,0,0) EXPLÍCITO na engine — nunca "o que estiver no hardware".
  Exportar os 3 ou nenhum (a engine aceita parcial, cada canal ausente
  vira 0, mas não há motivo pra isso).
- **Não é uma cor da paleta das camadas:** independe das cores dos `.pal`
  e não consome slot de paleta (a cor 0/transparente de cada banco
  continua transparente).
- **Telas de texto (GAME OVER/FASE COMPLETA):** usam preto fixo, não a cor
  da fase (legibilidade da fonte padrão) — não precisa configurar nada.

### Bit de prioridade por tile da Camada 1 — "na frente do sprite" (v3, 🟡 aditivo — implementado e testado do lado da Anubis, 2026-10-01)

**Aditivo:** 1 arquivo NOVO e opcional. Nada do que já existe muda (o
`.bmp`, a colisão e as entidades continuam iguais; fase sem o arquivo =
comportamento de hoje, nenhum tile na frente).

- **O que é:** um tile da Camada 1 marcado desenha NA FRENTE do jogador e
  dos inimigos (só nos pixels opacos do tile; o transparente continua
  mostrando o sprite). Sem marcação, a Camada 1 fica atrás dos sprites,
  como hoje. É o que o SMW usa pra moita/cano/poste que o Mario passa
  atrás. Agora que a Camada 2 é só fundo (subseção "Camada 2 com
  parallax"), toda decoração presa no nível vai na Camada 1, e esse bit é
  o jeito de colocar uma parte dela na frente do personagem.
- **Só Camada 1.** A Camada 2 fica sempre atrás dos sprites.
- **Independente da colisão:** a marcação não muda se o bloco é sólido,
  vazio ou bandeira (poste/moita = normalmente vazio + na frente).
- **Arquivo:** `assets/gfx/<base>_tilemap_priority.txt` (hoje
  `stage1_tilemap_priority.txt`), texto puro:
  - exatamente **32 linhas** (linhas de tiles 8x8, de cima pra baixo);
  - cada linha com exatamente **COLUNAS caracteres** (`STAGE1_COLLISION_COLS`,
    a mesma largura da fase em tiles), coluna da esquerda pra direita;
  - `1` = tile na frente do sprite, `0` = normal; nenhum outro caractere;
  - fim de linha LF ou CRLF, tanto faz; linha vazia no fim é ignorada.

  ```
  000000000000000000000000...   (32 linhas como esta)
  000000000000111000000000...
  ```
  Erro de formato (nº de linhas/colunas ou caractere inválido) faz o build
  da Anubis FALHAR com mensagem dizendo a linha (melhor que um bit errado
  em silêncio).
- **Por célula de 8x8, não por bloco:** mesmo critério da colisão. O
  metadado de verdade mora no BLOCO do tileset, no Prometeus ("este bloco
  desenha na frente"). No export, o Prometeus resolve bloco → as células
  que ele cobre na fase. A engine não precisa saber o tamanho do bloco.
- **Por que um arquivo separado e não um bit "reservado" no formato
  atual:** o `.map` não é exportado pelo Prometeus. Quem gera ele é o
  `gfx4snes` no build da Anubis, a partir do `.bmp`, e o `gfx4snes` só
  sabe ligar o bit no mapa inteiro. A Anubis aplica a grade no `.map`
  logo depois da conversão (`build/apply_tile_priority.pl`), sem custo
  nenhum em tempo de execução. Também não cabe no `_collision.h` sem
  mudar o significado dos valores que já existem.
- **Sugestão pro Prometeus (NÃO implementado do lado dele):** um toggle
  por bloco de tileset (Camada 1) "desenha na frente do jogador/inimigo",
  salvo junto com o tileset, uma visualização na fase (ex.: contorno nos
  blocos marcados) e exportar o `.txt` acima a cada save. Pode exportar
  sempre (tudo `0` quando nada está marcado) ou só quando houver
  marcação; a Anubis aceita os dois. Se for exportar só quando há
  marcação, **apagar** o `.txt` ao desmarcar tudo (lição da Camada 2:
  arquivo velho esquecido continua valendo; apagar o `.txt` também exige
  `make clean && make` pra refazer o `.map`).

## 5. Áudio
**Status:** 🔴 não definido

- Formato de música (conforme suportado pela PVSnesLib):
- Formato de efeitos sonoros:
- Convenção de nomenclatura:

## 6. Estrutura de pastas/arquivos exportados
**Status:** 🔴 não definido

Como o Prometeus organiza a pasta de saída que o Anubis vai consumir. A
engine já tem `assets/gfx/`, `assets/sfx/` e `assets/maps/` na raiz do
projeto (vazias por enquanto) — provável destino direto dos arquivos do
Prometeus, mas o mapeamento exato (subpastas por tipo, convenção de nome por
personagem/fase) ainda não foi decidido.

**Fluxo "salvar já altera a ROM" (decidido em 2026-09-19):** o Prometeus roda
localmente (Vite dev server) e usa o lado Node do próprio dev server pra:
(1) escrever o arquivo exportado dentro de `assets/` deste projeto — ✅
**implementado em 2026-09-19** (`vite-export-gfx-plugin.ts`, endpoint
`POST /api/export-gfx`, escreve direto em
`../jogo-plataforma-snes/assets/gfx/`, caminho hardcoded relativo — só
funciona com `npm run dev`); (2) rodar `make` aqui — ✅ **implementado em
2026-09-19** (ver abaixo); (3) avisar o navegador que terminou — a tela
mostra se o build passou ou falhou (com a saída), ver abaixo. Isso exige o
Prometeus saber o caminho desta pasta no disco (configuração local, não faz
parte do contrato de formato em si).

**Build automático depois de salvar (Prometeus, 2026-09-19) — nenhum formato de
arquivo muda, é só o fluxo:**
- Depois de cada "Salvar" (personagem = `_tiles.bmp` + `_metasprites.h`;
  animações = `_anim.h`; cenário = `.bmp`) o Prometeus chama
  `POST /api/build-engine` **uma vez** (não a cada arquivo) e mostra
  "Jogo compilado com sucesso (tempo, ROM)" ou "O jogo NÃO compilou" + a
  saída do `make`. Só compila se todos os arquivos daquele salvamento
  foram gravados; se o build falha, os arquivos continuam salvos.
- O endpoint roda, dentro do **Git Bash**, `cd <engine> && make 2>&1` (o
  `build/Makefile` do Anubis precisa de `cygpath` e `sh`), com
  `PVSNESLIB_HOME` e a pasta do `make` (winget/ezwinports) no PATH vindos
  do arquivo de config — **não** do ambiente em que o `npm run dev` foi
  aberto (testado num ambiente sem `PVSNESLIB_HOME`).
- **Config local:** `editor.local.json` na raiz do Prometeus, **fora do git**
  (`.gitignore`); modelo em `editor.local.example.json`. Chaves:
  `pvsneslibHome` (pasta com `devkitsnes/` dentro, barra normal),
  `gitBashPath` (bash.exe do Git), `makeDir` (pasta do make.exe; opcional),
  `engineDir` (padrão `../jogo-plataforma-snes`) e `timeoutSeconds` (padrão
  300). Lido a cada build (editar vale sem reiniciar). Se faltar/estiver
  errado, a tela explica o que fazer ("falta configurar o build neste
  computador…") em vez de um erro genérico.
- Só **um build por vez** (segundo pedido recebe "já existe um build em
  andamento"), com **timeout** (mata a árvore de processos) e botão de salvar
  desabilitado enquanto compila. O resultado some quando o usuário mexe em
  algo (não fica "compilado" com alteração não salva).
- Segurança: os dois endpoints (`/api/export-gfx`, `/api/build-engine`)
  recusam requisições de outra origem (`Origin` diferente do host do dev
  server) — o build dispara um processo local. O comando é fixo; caminhos da
  config vão entre aspas simples, nunca viram comando.
- **Não faz:** avisar o Anubis/emulador, recarregar a ROM, nem detectar
  arquivos que o `make` ignora (ex.: o `build/Makefile` só converte os
  `.bmp` que estão na lista de alvos — um `_tiles.bmp` novo ainda depende da
  regra sem `-m` que o Anubis precisa escrever, ver seção 3).

## 7. Versionamento do formato
**Status:** 🔴 não definido

- Como sinalizar que um arquivo exportado é de uma versão incompatível do
  formato (evita a engine tentar ler um arquivo de formato antigo/errado).

---

## Histórico de decisões
(registre aqui, com data, sempre que uma seção acima for fechada — ex.:
"2026-09-17: fechado formato de tilemap, ver seção 4")

- 2026-10-10 (Anubis): **comportamento de objeto** (seção 3, subseção
  "Comportamento de objeto", 🟡 aditivo). `STAGE1_DECOR_HAS_BEHAVIOR` +
  `stage1_decor_collision[]` (0 atravessável, 1 sólido) +
  `stage1_decor_special[]` (0 nenhuma, 1 bandeira, 2 morte). Caixa = frame.
  Bandeira por célula continua valendo. Engine pronta e testada no BizHawk;
  falta o Prometeus exportar.

- 2026-10-05 (Anubis): **slot de decoração estática `decor1` + lista de
  decorações por fase** (seção 3, subseção nova, 🟡 aditivo). Cada frame
  da folha é uma decoração; instâncias em `stage1_entities.h`
  (`STAGE1_DECOR_COUNT`, `stage1_decor_type/frame/x/y`, X/Y = canto sup.
  esq. do frame). Engine pronta e testada com placeholder; falta o
  Prometeus exportar.

- 2026-10-01 (Anubis): **bit de prioridade por tile da Camada 1** (seção
  4, subseção "Bit de prioridade por tile da Camada 1", 🟡 aditivo).
  Arquivo opcional `stage1_tilemap_priority.txt` (32 linhas × COLUNAS
  caracteres 0/1), aplicado no `.map` durante o build da Anubis. Engine
  pronta e testada; falta o Prometeus exportar. O item "bit de prioridade
  por tile", antes fora de escopo na subseção da 2ª camada, agora tem
  contrato.

- 2026-10-01 (Anubis): **cor de fundo fixa da fase** (seção 4, subseção
  "Cor de fundo fixa da fase (backdrop)", 🟡 aditivo). 3 defines opcionais
  `STAGE1_BACKDROP_R/G/B` (0-31 cada) no `stage1_entities.h`; ausentes =
  preto. Engine pronta e testada. Prometeus exportando desde o mesmo dia
  (seletor entre as cores já usadas na paleta da fase, `canal8 >> 3`).

- 2026-09-29 (Anubis): **Camada 2 com parallax vira padrão repetido
  residente** (seção 4, subseção "Camada 2 com parallax", 🟡 aditivo). Fator
  1/2; 32 ou 64 colunas × 32 linhas; mais largas são aceitas, mas só as 64
  primeiras colunas aparecem; o que precisa ficar preso no nível vai na
  Camada 1. Formato de arquivo inalterado.

- 2026-09-21: fechada a seção 4 (Tilemap / Layout de fase) como 🟢 —
  mesmo critério das seções 1 e 3. O Anubis confirmou consumindo uma
  `stage1` de teste real (`tilemap.c` reescrito, Makefile com a regra
  `-m`, build linkando a ROM com a fase de verdade). Do lado do
  Prometeus, fechado também o "editar fase já salva" (reconstrução
  determinística a partir só dos arquivos exportados, sem sidecar novo).
  Pendências residuais (posicionamento de entidades, scroll, múltiplas
  camadas) ficam documentadas na seção — não bloqueiam o fechamento, são
  trabalho de uma v2 do editor de fase.

- 2026-09-20: fechada a seção 3 (Sprites e animação) como 🟢 — mesmo
  critério da seção 1 (round-trip real confirmado dos dois lados, não
  "tudo 100% completo"). Motivo: os dois slots que existem hoje (`hero` e
  `enemy1`) já têm arte/hitbox/animação reais exportadas pelo Prometeus e
  consumidas de verdade pelo Anubis, com o build passando. Pendências
  residuais (hitbox do `hero` ainda hardcoded, sprite do jogador ainda
  8x8, só 1 tipo de inimigo) ficaram documentadas na própria seção — não
  bloqueiam o fechamento, só ficam de nota pra quando alguém for mexer
  nelas.

- 2026-09-20: Prometeus implementou o contrato "Slot do personagem principal"
  (§ 3) — a tela de personagem agora exporta sempre sob a base fixa `hero`
  (`hero_tiles.bmp`/`hero_metasprites.h`/`hero_anim.h`), não importa o nome
  do arquivo importado, e bloqueia "Salvar animações no jogo" enquanto as 5
  animações obrigatórias (`idle`/`walk`/`run`/`jump`/`fall`) não existirem
  no rascunho. O fluxo de Cenário continua usando o nome do arquivo (não é
  afetado). Modelado como uma lista de "slots" na UI (hoje só `hero`), não
  uma constante enterrada, preparando terreno pro futuro editor de
  inimigo/fase que o Anubis mencionou. Verificado em cima dos arquivos
  `hero_*` reais do usuário (com backup/restauração). Nenhum campo/formato
  novo — implementação confirma o contrato que o Anubis já havia proposto
  acima, sem alterá-lo.

- 2026-09-19: **Build automático depois de salvar (seção 6, parte 2/3 do fluxo
  "salvar já altera a ROM")**: o Prometeus roda o `make` do Anubis uma vez depois
  de cada salvamento e mostra na tela se passou (tempo + ROM) ou falhou (com
  a saída). Config em `editor.local.json` (fora do git; PVSnesLib, Git Bash,
  make, pasta da engine, timeout), escolhida com o usuário em vez de
  variáveis de ambiente. Nenhum formato de arquivo mudou; o Anubis não
  precisa fazer nada além de manter `make` na raiz funcionando.
- 2026-09-19: **Hitbox por sheet + nomes sugeridos no Prometeus (seção 3, continua
  🟡)**: o Prometeus implementou a proposta do Anubis — caixa de colisão única
  por sheet, ancorada nos pés (base no pivô, centrada em X), redimensionável
  na prévia, com validação (inteiros, ≥ 1, ≤ frame) e export de
  **`<BASE>_HITBOX_W` e `<BASE>_HITBOX_H`** no `_metasprites.h` (o Anubis pode
  trocar `PLAYER_HITBOX_W/H` por eles). Padrão: W = 75% do frame, H = do
  pivô ao topo da arte. Também: sugestões `idle/walk/run/jump/fall` no nome da
  animação (nome livre continua valendo). Formato do resto do `.h` intacto.
- 2026-09-19: **Quadros retangulares (seção 3, continua 🟡)**: o frame lógico
  deixou de ser quadrado — largura e altura independentes, múltiplos de 8
  entre 8 e 64 (presets 16×16, 16×32, 32×32, 32×48, 48×48, 64×64 + personalizado).
  Caso de uso: poses do Mario de 16×32 (duas células de 16×16 empilhadas).
  Pivô padrão = (largura/2, altura) → (8, 32) em 16×32; fatias por scanline
  usam a altura; blocos parciais (24/40/56) só geram peças 8×8. **Mudança no
  contrato do `_metasprites.h`: `<BASE>_FRAME_SIZE` foi REMOVIDO e entram
  `<BASE>_FRAME_WIDTH` e `<BASE>_FRAME_HEIGHT`.** Decisão: não manter
  `FRAME_SIZE` — com retângulo não há "o" tamanho (o que valeria em
  16×32?); um alias só pros quadrados faria o macro sumir justo nos
  retângulos (erro de compilação silencioso e confuso), e remover falha
  alto e cedo em qualquer código que use. Ninguém consome ainda (header
  gerado no mesmo dia, a engine não o usa), então o custo é zero. O
  `_anim.h` NÃO mudou de nomes (`_FRAME_W`/`_FRAME_H`, contrato antigo);
  só passam a refletir largura e altura. Também: o aviso de "pose
  cortada" agora exige ≥ 4 pixels de contato na borda (poses vizinhas que
  só se encostam por 1–3 linhas, como o braço do Mario, davam falso
  positivo). Verificado com o `gfx4snes` real (`.pic` do sheet 16×32 em
  ordem raster, 0 divergências) e o `816-tcc` (`-Wall`, sem avisos).
- 2026-09-19: **Metasprites no Prometeus (seção 3 continua 🟡)**: frame lógico
  configurável (16/32/48/64, padrão 32) independente do sprite de hardware,
  fatiado automaticamente em peças 8x8/16x16 (limiar padrão: 1 quadrante
  ocupado → 8x8, senão 16x16), pivô por frame (padrão: centro/base), tiles
  empacotados no layout de 16 colunas da memória OBJ com dedup (inclui
  espelhados) em `<base>_tiles.bmp`, tabela de peças em
  `<base>_metasprites.h` e fórmula de flip horizontal documentada
  (`dx' = -(dx + tamanho)` + `OBJ_FLIPX`). Verificado com o `gfx4snes` real
  (layout só se preserva **sem `-m`** → a engine precisa de regra própria
  no Makefile pra `*_tiles.bmp`) e com o `816-tcc` (header compila sem
  avisos). Também corrigido: alpha ignorado na extração de paleta (cor 0 =
  transparente agora é respeitada — ver seção 2). Quebra de compatibilidade:
  só o tamanho de frame 8 saiu do seletor; `_anim.h` e `<base>.bmp` mantêm
  o formato (mas `marioteste.bmp` precisa ser re-exportado por causa da
  correção de alpha). Falta a engine consumir.
- 2026-09-19: **Prometeus implementou a seção 3 (Sprites e animação)** em cima
  do rascunho da engine: nova seção "Sequência de animação" na tela
  Importar/Preview (seletor de tamanho de frame, grade visual com índices
  em ordem raster, editor de animações nomeadas com sequência de índices +
  duração), exportando um `.h` de C no formato exato proposto — reaproveita
  o endpoint `POST /api/export-gfx` da seção 1 (liberado pra aceitar `.h`
  além de `.bmp`). Validação nova: dimensões precisam ser múltiplo exato do
  tamanho de frame escolhido (bloqueia com erro, já que o `gfx4snes` nunca
  foi testado com canvas não-múltiplo). Falta a engine consumir um `.h`
  real gerado por esta tela (não um feito à mão) pra fechar a seção como
  🟢, mesmo padrão usado na seção 1.
- 2026-09-19: **Proposta de rascunho pra seção 3 (Sprites e animação)**,
  baseada em teste real do `gfx4snes -T` no `marioteste.bmp` (marioteste é
  uma sprite sheet real, 3x3 frames de 16x16 dentro de um canvas 64x64):
  o `gfx4snes` já fatia o canvas inteiro numa grade do tamanho de frame
  pedido, em ordem raster — o Prometeus só precisa deixar escolher o tamanho
  do frame e usar essa mesma grade/ordem, sem marcar retângulos na mão.
  Sequência/timing de animação não é resolvido pelo `gfx4snes` — proposta:
  Prometeus exporta um `.h` de C com um array por animação nomeada (índices
  de frame + duração), sem JSON nem parser novo. Ainda depende do Prometeus
  implementar e confirmar.
- 2026-09-19: **Seção 1 (Gráficos/Tiles) fechada como 🟢** — round-trip
  completo confirmado com arquivo real: Prometeus exportou `marioteste.bmp`
  (64x64px, 13 cores) direto em `assets/gfx/` do Anubis, `gfx4snes`
  converteu (35 tiles únicos após dedup) e o build linkou sem erro.
  Achado importante no processo: dado embutido via `.incbin` sem nenhuma
  referência no C é descartado pelo linker sem aviso — precisa de pelo
  menos uma leitura real do símbolo pra não sumir da ROM (ver
  `docs/ARCHITECTURE.md` § Pipeline de assets do lado do Anubis).
- 2026-09-19: **Prometeus implementou a parte 1/3 do fluxo "salvar já altera a
  ROM" (seção 6)**: o export da tela Importar/Preview agora escreve o
  `.bmp` direto em `../jogo-plataforma-snes/assets/gfx/` via um endpoint no
  próprio Vite dev server (`vite-export-gfx-plugin.ts`), sem precisar mais
  de download manual + cópia. Rodar `make` automaticamente depois de
  escrever (parte 2/3) ficou de fora de propósito — próxima etapa.
- 2026-09-19: **Anubis confirmou o pipeline de build do lado dela**:
  `build/Makefile` converte `.bmp` via `gfx4snes` automaticamente e o
  resultado (`.pic`/`.pal`) já linka na ROM (`src/gfxdata.asm`, padrão do
  exemplo oficial `mapandobjects`). Testado com BMPs feitos à mão (paleta
  cheia e paleta esparsa, essa última imitando o export real do Prometeus) —
  os dois funcionam. Falta só rodar um `.bmp` exportado de verdade pela
  tela Importar/Preview (não feito à mão) pra fechar o round-trip
  completo. Achado técnico: `gfx4snes.exe` tem um bug de parsing de
  caminho relativo/com `..` — contornado com `cygpath -w` no Makefile.
- 2026-09-19: **Prometeus confirmou capacidade de exportar no formato da
  seção 1**: a tela Importar/Preview agora valida dimensões (múltiplas de
  8px) e contagem de cores (máximo 16, sem quantização automática — só
  rejeita e orienta reduzir a paleta num editor externo) e exporta um
  `.bmp` indexado 8bpp de verdade a partir da imagem importada. Ainda não
  testado com o `gfx4snes` real (round-trip completo Prometeus → engine),
  isso fica pra próxima etapa antes de fechar a seção 1 como 🟢.
- 2026-09-19: **Achado técnico do lado da engine** (ainda não confirmado
  pelo Prometeus): a PVSnesLib já vem com uma ferramenta de conversão de
  assets, `gfx4snes` (`devkitsnes/tools/gfx4snes.exe`), que aceita PNG/BMP
  indexado (até 256 cores) e gera tile data, paleta, tilemap E metasprites
  com múltiplos frames — cobre praticamente tudo que as seções 1-4 deste
  documento previam como "a decidir". Não precisamos de um parser/formato
  binário próprio pra gráficos/sprites/tilemap — só precisamos fechar
  CONVENÇÕES em cima do que o `gfx4snes` já aceita (nome de arquivo,
  layout de sprite sheet pra animação, pasta de destino). Seções 1, 2 e 4
  passaram de 🔴 pra 🟡 com base nisso; seção 3 (sequência de animação)
  continua 🔴 porque o `gfx4snes` não resolve isso sozinho. Ver
  `docs/PROGRESS.md` do lado da engine pra mais contexto.
