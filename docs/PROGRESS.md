# Progresso do Projeto

> Atualizado a cada sessão de trabalho. É a principal fonte de "memória"
> entre sessões do Claude Code — mantenha objetivo e recente no topo.

## Status atual

**✅ Repositório pronto pro primeiro commit público — Mario removido dos testes, LICENSE (MIT),
conteúdo real do usuário fora do git (2026-10-14, Prometeus).** Continuação da avaliação "dá pra
publicar?" desta mesma sessão (ver entrada "`engineDir` unificado" logo abaixo).
- **Fixtures de teste do Mario substituídos por formas sintéticas**: `tests/fixtures/
  marioSheet16x32.ts`/`marioSheet32.ts` (pixel art real do Mario codificada como hex — achado
  crítico de IP, não só estético) viraram `syntheticSheet16x32.ts`/`syntheticSheet32.ts`
  (retângulos abstratos, gerados programaticamente e validados contra a MESMA suíte de testes
  antes de substituir — frame count, peças 8x8/16x16, ausência/presença de corte etc. são todos
  estruturais, recalculados do conteúdo real do array, não hardcoded, então qualquer pixel art
  não-degenerada do tamanho certo serviria). Identificadores (`MARIO16_SHEET_*` etc.), nomes de
  teste e base-names de exemplo (`'marioteste'`→`'testchar'`, `'mario'`→`'hero'`) também
  renomeados em `tests/hitbox.test.ts`/`tests/metasprite.test.ts`/`tests/preview.test.ts`/
  `tests/characterDiscovery.test.ts`/`src/lib/metasprite/slicer.ts` (comentário). As imagens
  `samples/marioteste-*.png` (nunca comitadas) foram deixadas no disco, só excluídas do git (ver
  abaixo) — não fazem mais falta: nenhum teste automatizado depende delas, só eram úteis pra
  upload manual exploratório.
- **`.gitignore`** ganhou `assets/tilesets/`, `assets/backgrounds/` e `samples/` — conteúdo real
  do usuário (tilesets/fundos salvos, imagens de exemplo) continua no disco desta máquina, nunca
  vai pro repositório público. Pedido explícito do usuário: um clone novo começa **vazio** (sem
  personagem/inimigo/sprite/tileset/fase nenhum pré-pronto), o próprio usuário importa a arte dele.
- **`LICENSE`** (MIT, escolhida pelo usuário entre MIT/Apache-2.0/GPL-3.0/nenhuma) + campo
  `license` em `package.json` + seção no README.
- **1º commit de verdade criado** (`6b7bfb6`, em cima do skeleton inicial único que existia) —
  149 arquivos, todo o trabalho de sessões anteriores que nunca tinha sido commitado. Revisão
  manual do que seria incluído antes de comitar (sem `editor.local.json`, sem `assets/tilesets`/
  `assets/backgrounds`/`samples`, sem segredo/token/chave em nenhum arquivo — scan específico
  feito). **Nada foi pushado** — repositório ainda não tem remote configurado, isso fica pro
  usuário decidir quando/onde (GitHub, privado/público).
Verificado: `npx tsc -b`, `npm test` (264/264, com os fixtures sintéticos), `npm run build`,
`npm run lint`, `npm run test:e2e` (24/24) — todos limpos antes do commit.

**✅ `engineDir` unificado entre export de arquivos e build/"Jogar" (2026-10-14, Prometeus).**
Contexto: avaliando deixar este repo público, notei que `/api/export-gfx`
(`vite-export-gfx-plugin.ts`) usava uma constante própria, hardcoded
(`../jogo-plataforma-snes/assets/gfx`), SEPARADA do `engineDir` que `editor.local.json` já deixava
configurável só pro `/api/build-engine` — configurar `engineDir` não tinha efeito nenhum no export,
um verdadeiro "item preso no código" em vez de ponto de integração de verdade.
- **Corrigido** com uma função nova e tolerante, `readEngineDir` (`vite-engine-build.ts`) — lê só
  `engineDir` de `editor.local.json` (nunca lança, cai no padrão `../jogo-plataforma-snes` se
  ausente/inválido, igual sempre foi), usada agora tanto por `readBuildConfig` (que ainda valida
  Makefile/demais campos pra build) quanto por `resolveEngineGfxDir` em
  `vite-export-gfx-plugin.ts` (recalculada a cada requisição, não mais uma constante de módulo —
  editar `editor.local.json` passa a valer pro export também sem reiniciar o dev server). A
  mensagem "Salvo em ..." mostrada na UI também passou a refletir o caminho REAL resolvido (via
  `path.relative`), em vez do texto fixo de antes.
- **README atualizado** pra deixar claro que o editor funciona sozinho (sem engine nenhuma por
  perto) pra importar/fatiar/animar/montar fase, e que a integração com uma engine (export em
  disco/build/"Jogar") é opcional, configurável e segue o contrato documentado em
  `docs/DATA_FORMAT.md` — não precisa ser especificamente o projeto Anubis.
- **5 testes novos** (`tests/engineBuild.test.ts`, `readEngineDir`). Suíte de e2e inteira (24/24)
  já depende do caminho de export funcionar certo via `PROMETEUS_E2E_GFX_DIR` — serviu de
  regressão de verdade pro refactor, sem precisar de teste novo dedicado só pra isso.
Verificado: `npx tsc -b`, `npm test` (264/264), `npm run build`, `npm run lint` (só os 2 avisos
pré-existentes/intencionais de sempre), `npm run test:e2e` (24/24) — todos limpos.

**✅ Objeto (decoração) com colisão + propriedade especial — implementado de ponta a ponta
(2026-10-10, Prometeus), depois da Anubis fechar o contrato.** Pedido retomado: a mesma tarefa
ficou pausada mais cedo hoje (sem código nenhum, ver Log) porque `docs/DATA_FORMAT.md` § 3 ainda
não documentava a generalização — a Anubis fechou em seguida ("Comportamento de objeto: colisão +
propriedade especial", 2026-10-10), reli a seção inteira antes de codar.
- **Investigação do item 1 (unificar Player/Inimigo/Decoração num só "Objeto"?):** mantive os TRÊS
  mecanismos de posicionamento SEPARADOS como já eram — Jogador continua estruturalmente diferente
  (instância única, "arme e clique", sem seletor de tipo), não fazia sentido forçá-lo num sistema
  pensado pra múltiplas instâncias. Inimigo e Decoração já COMPARTILHAVAM a mesma mecânica de
  posicionamento antes desta tarefa (adiciona no centro + arrasta + "Tipo:" no painel) — decidi
  NÃO fundi-los numa única estrutura de dados também: o contrato fechado é aditivo só em cima de
  `decor1` (`stage1_decor_collision`/`stage1_decor_special`), a Anubis documentou "sólido vale só
  pro jogador" e "inimigos atravessam objetos" como limites atuais — misturar os dois tipos token
  por token exigiria também um "zero-effort" pra enemy (que não tem/usa colisão nem especial),
  mais complexidade sem ganho real hoje. Documentado aqui pra próxima vez que a pergunta aparecer.
- **`DecorInstance`** ganhou `solid: boolean` (padrão `false`, igual sempre foi) e
  `specialPropertyId: string` (padrão `'none'`) — modelado como lista EXTENSÍVEL
  (`SpecialProperty`/`SPECIAL_PROPERTIES` em `entities.ts`, mesmo padrão de `decorSlots.ts`/
  `enemySlots.ts`), não um union type fixo de 2 valores, porque o próprio contrato avisa "mais
  valores virão" e a Anubis "ignora o que não conhece".
- **UI** (`StageSession.tsx`, painel da decoração selecionada): checkbox "Sólido (bloqueia o
  jogador)" + `<select>` "Especial:" (Nenhuma/Bandeira/Trigger de morte, populado de
  `SPECIAL_PROPERTIES` — nova entrada na lista não precisa de código novo aqui). Tooltip do
  seletor "Especial:" deixa explícito que é DIFERENTE da bandeira por tile (editor de Tileset) —
  item 4 do pedido: "deixar claro que são dois jeitos diferentes de fazer a mesma coisa".
- **Indicador visual no canvas:** anel verde externo (`.stage-marker-decor-solid`, mesma cor de
  "sólido" do editor de Tileset) quando marcado sólido, e um selo colorido no canto (vermelho "B"
  pra bandeira — mesma cor do tile-bandeira — ou preto "T" pra trigger de morte) quando há
  propriedade especial.
- **Export** (`exportEntities.ts`): `STAGE1_DECOR_HAS_BEHAVIOR` + `stage1_decor_collision`/
  `stage1_decor_special` sempre juntos quando há QUALQUER decoração (nunca parcial — mesma lição
  de sempre deste projeto), nunca sozinhos. Fase salva ANTES desta tarefa (sem
  `STAGE1_DECOR_HAS_BEHAVIOR`) reabre com `solid: false`/`specialPropertyId: 'none'` em todo
  objeto, sem travar. Valor de `special` desconhecido (export futuro, ou arquivo corrompido) cai
  em `'none'` ao reabrir, nunca propaga lixo.
- **8 testes novos** (`tests/entities.test.ts`) + 1 E2E novo (`e2e/decor-positioning.spec.ts`).
Verificado: `npx tsc -b`, `npm test` (259/259), `npm run build`, `npm run lint` (só os 2 avisos
pré-existentes/intencionais de sempre), `npm run test:e2e` (24/24) — todos limpos.

**✅ Botão "Jogar" na barra de topo (estilo Unity) — compila e abre o ROM no emulador com 1 clique
(2026-10-10, Prometeus).** Pedido do usuário: um botão único no topo que builda e já abre o jogo no
emulador certo; 1ª vez pede onde o emulador fica, depois disso abre direto.
- **Fluxo** (`usePlayGame.ts`): clique em "Jogar" → reaproveita o MESMO `buildEngine()`/`/api/build-engine`
  que o fluxo de salvar já usa (nenhuma duplicação de lógica de build) → se `editor.local.json`
  ainda não tem `emulatorPath`, abre o seletor de arquivo NATIVO do Windows (`OpenFileDialog` via
  PowerShell, `vite-emulator.ts`/`pickEmulatorPathNative`) pedindo o executável do emulador → salva
  a escolha (mesclando com o resto da config, nunca sobrescrevendo `pvsneslibHome`/`gitBashPath`/
  etc.) → abre o emulador com o ROM como argumento (`spawn` destacado — o dev server nunca espera o
  emulador fechar). Da 2ª vez em diante pula direto pro lançamento, sem perguntar de novo.
- **Novo endpoint/plugin** `vite-emulator-plugin.ts` (`GET /api/emulator-path`,
  `POST /api/emulator-path/pick`, `POST /api/emulator-path`, `POST /api/launch-emulator`) — mesmo
  padrão de sempre (1 arquivo por assunto, registrado em `vite.config.ts`, `isSameOrigin`/`sendJson`
  próprios). `emulatorPath` mora no MESMO `editor.local.json` do build (campo novo e opcional —
  `readBuildConfig` já ignora chaves que não conhece, então não quebrou nada do build existente).
- **UI** (`PlayButton.tsx`): botão destacado (cor de aceite) encostado no canto direito da barra de
  abas (`.top-nav` virou flex com `justify-content: space-between`; as 4 abas entraram num
  `.top-nav-tabs` próprio pra não herdar o estilo novo). Link secundário "Trocar emulador" sempre
  disponível, pra reapontar sem precisar editar `editor.local.json` à mão. Erro de build/emulador
  aparece num painel flutuante embaixo do botão (não empurra o resto do cabeçalho), com a mesma
  saída de build colapsável do `BuildStatus.tsx`.
- **Não automatizável por natureza, documentado em vez de testado**: abrir um seletor de arquivo
  nativo de verdade e abrir um emulador de verdade dependem de uma janela do SO/um humano clicando
  — só a lógica pura (ler/mesclar `editor.local.json`, montar o script do PowerShell) tem teste
  unitário; a orquestração do frontend (build → perguntar só na 1ª vez → salvar → lançar →
  cancelar não é erro) tem E2E com TODOS os 4 endpoints novos mockados.
- **12 testes novos** (`tests/emulator.test.ts`) + 5 E2E novos (`e2e/play-button.spec.ts`).
- **Ação pendente do USUÁRIO:** testar o botão "Jogar" de verdade — escolher o emulador real na 1ª
  vez e confirmar que ele abre com o ROM certo, e no clique seguinte que NÃO pergunta de novo.
Verificado: `npx tsc -b`, `npm test` (256/256), `npm run build`, `npm run lint` (só os 2 avisos
pré-existentes/intencionais de sempre), `npm run test:e2e` (23/23) — todos limpos.

**✅ Slot de sprite decorativo estático `decor1` + posicionamento na fase — implementado de ponta a
ponta (2026-10-05, Prometeus), depois da Anubis fechar o contrato.** Pedido retomado do usuário:
mesmo pedido que ficou pausado antes (ver Log), agora com `docs/DATA_FORMAT.md` § 3 fechado do lado
da Anubis (reli a seção inteira antes de codar, não confiei só no resumo do pedido).
- **Slot `decor1`** em `characterSlots.ts` — `requiredAnimationNames: []` igual sempre existiu pra
  slot sem contrato de animação fixo, mas agora com um campo NOVO, `supportsAnimation?: boolean`
  (`false` pra `decor1`), pra distinguir "esse slot nunca anima por contrato" de "a engine ainda não
  fixou os nomes exigidos, mas pode animar" (`enemy1` antes de `walk` virar obrigatório, por
  exemplo) — a mensagem antiga de `AnimationSequencer.tsx` ("ainda não tem uma lista fixa...") era
  semanticamente ERRADA pro caso novo. `SpriteSheetEditor.tsx` esconde a seção "Sequência de
  animação" inteira quando `supportsAnimation === false`, em vez de mostrar a mensagem errada.
- **`DecorInstance`** novo em `entities.ts` (`typeIndex`, `frame`, `x`, `y`) — `x`,`y` são o canto
  superior esquerdo do quadro, SEM conversão pivô-hitbox (`pivotToSpawn`/`spawnToPivot` não se
  aplicam — decoração não tem hitbox, ver docs/DATA_FORMAT.md § 3: "independente do pivô"). Isso
  também mudou o encaixe na grade ao arrastar: `snapGridLeftEdge`/`snapGridTopEdge` novos (canto,
  não centro/borda-de-baixo como jogador/inimigo), com uma conversão de clique própria
  (`stagePixelFromClientTopLeft`) espelhando `stagePixelFromClient`.
- **Posicionamento na fase** (`StageSession.tsx`) reaproveita o MESMO mecanismo de inimigo
  (adicionar no centro da fase, arrastar marcador, clicar pra selecionar e editar no painel
  lateral), mas SEM os campos de patrulha/hitbox — painel próprio só com "Tipo:", "Quadro:" (campo
  numérico com o mesmo cuidado anti-`NaN` de `PatrolOffsetInput`, componente novo
  `FrameIndexInput`) e X/Y somente leitura. Marcador usa uma classe CSS nova,
  `.stage-marker-decor` (`transform: translate(0, 0)`, ancorado no canto — não no centro-base como
  `.stage-marker` padrão), com cor própria (verde) pra não confundir com jogador (azul)/inimigo
  (rosa).
- **Reconstrução de quadro específico** — `EntitySpriteIcon.tsx` ganhou uma prop `frame?: number`
  opcional (ausente = comportamento de sempre, mostra o quadro "idle"); quando presente, usa uma
  função nova, `loadCharacterFrame`/`reconstructFrameAt` (extraído como núcleo compartilhado de
  `reconstructThumbnail`/`reconstructIdleFrame`, que agora delegam pra ele com frame 0/"idle"). Novo
  `loadCharacterFrameCount` (só lê o header de texto, não decodifica o `.bmp`) alimenta a dica "de N
  quadros" no painel lateral.
- **Export** (`exportEntities.ts`) — `generateEntitiesHeader` ganhou um parâmetro opcional
  `decorations`, emitindo `STAGE1_DECOR_COUNT`/`stage1_decor_type/frame/x/y` SÓ quando a lista não
  está vazia (DIFERENTE do array de inimigos, que sempre declara pelo menos 1 elemento de sobra —
  aqui "sem decoração nenhuma" precisa OMITIR o bloco inteiro, conforme o § 3: "Opcional: sem
  STAGE1_DECOR_COUNT = nenhuma decoração"). `parseEnemyArray` generalizado num `parseNamedArray`
  compartilhado, reaproveitado pros arrays de decoração; fase salva ANTES de `decor1` existir
  reabre com `decorations: []` em vez de travar.
- **Não implementado de propósito** (optativo pelo § 3, "o Prometeus pode avisar"): aviso de
  orçamento de OAM (32 peças somadas entre as instâncias) — não é obrigatório, fica pra depois se
  vier a ser um problema real.
- **7 testes novos** (`entities.test.ts`: round-trip com decoração, omissão quando vazio, migração
  de fase salva sem o bloco; `importProject.test.ts`: `reconstructFrameAt` por índice e fallback pro
  quadro 0; `characterSlots.test.ts` atualizado pro slot novo) + 2 E2E novos
  (`e2e/decor-positioning.spec.ts`: adicionar, escolher quadro, salvar e conferir o `.h` exportado;
  e remover a única instância volta a omitir o bloco inteiro).
- **Ação de CONTEÚDO pendente do usuário** (não nossa): desenhar a arte da barra do gol, importar no
  slot `decor1` e posicionar na `stage1` de verdade, pra fechar o caso de uso real que motivou a
  tarefa (buraco no poste de trás). Ver "Próximo passo".
Verificado: `npx tsc -b`, `npm test` (244/244), `npm run build`, `npm run lint` (só os 2 avisos
pré-existentes/intencionais de sempre), `npm run test:e2e` (18/18) — todos limpos.

**✅ Bug real corrigido: editar e salvar um tileset COM uma sessão de pintura já aberta não
atualizava nada na sessão em andamento (2026-10-05, Prometeus).** Reportado pelo usuário tentando
usar a feature "Na frente" recém-implementada: marcou um bloco do `goalpost_tileset` como "Camada
2"/"Na frente" no editor, mas o bloco simplesmente não aparecia pra pintar na fase.
- **Causa raiz, achada reproduzindo o fluxo exato (não só lendo os prints):** `StageWorkspace.tsx`
  renderiza as 3 abas ("Tilesets"/"Fundos"/"Fases") no MESMO componente — trocar de aba NUNCA
  desmonta uma sessão de pintura ativa. Mas `activeSession.tilesets`/`tileCollision`/`tileLayer`/
  `tilePriority` só eram calculados UMA VEZ, em `handleStartSession`/`handleEditStage` — editar e
  salvar um tileset que a sessão já estava usando (sem fechar a fase) deixava a sessão presa nos
  dados de ANTES do save, em qualquer camada/colisão/prioridade nova.
- **Corrigido com um `useEffect` que recarrega por NOME** (mesmo caminho de carregamento de
  `handleStartSession`) sempre que a aba "Fases" volta a ficar ativa — substitui só `tilesets`/
  `tileCollision`/`tileLayer`/`tilePriority` da sessão; `grid`/`gridLayer2`/`entities` continuam
  intocados (vivem dentro do próprio `StageSession.tsx`), então isso NUNCA perde pintura em
  andamento. Sessão sem nome (fallback de reconstrução por pixel) não tenta recarregar.
- **1 E2E novo** (`e2e/regression-stale-session-tileset.spec.ts`), confirmado que pega a regressão
  (desabilitado o efeito de propósito antes de reaplicar — voltou a falhar exatamente como o
  usuário relatou, bloco marcado invisível no painel C2).
Verificado: `npx tsc -b`, `npm test` (238/238), `npm run build`, `npm run lint`, `npm run test:e2e`
(16/16) — todos limpos.

**🟡 Bit de prioridade por tile da Camada 1 ("na frente do sprite") — implementado e testado de
ponta a ponta; falta só 1 ação de CONTEÚDO do usuário pra fechar o caso de uso real (2026-10-02,
Prometeus).** `docs/DATA_FORMAT.md` § 4 fechou o formato (conferido antes de codar, como
instruído) — toggle por bloco (só Camada 1, independente da colisão), persistido no tileset salvo,
indicador visual na fase, export `stage1_tilemap_priority.txt`.
- **Toggle "Na frente"** no editor de Tileset (`TilesetEditor.tsx`), ao lado do checkbox "Camada 2"
  já existente — desabilitado pra blocos de Camada 2 (limpa a marcação sozinho se o bloco virar
  Camada 2 depois de já ter sido marcado, mesma lógica que já existia pra colisão).
- **Persistência**: `TilesetMeta`/`generateTilesetMeta`/`parseTilesetMeta` ganharam `priority: Map<number,
  boolean>` (mesmo espírito enxuto de `collision`/`layer` — só grava entradas `true`).
  `mergeTilesetMetaToHardware` ganhou o mesmo tratamento hardware-indexado que colisão/camada já
  tinham (`MergedTilesetMeta.priority`), passado de StageWorkspace.tsx/loadStage.ts até
  StageSession.tsx como mais um `ReadonlyMap` prop (`tilePriority`), igual `tileCollision`/`tileLayer`.
- **Indicador visual na fase:** contorno roxo (`PRIORITY_BORDER_COLOR`) nos blocos marcados, tanto
  na paleta/seletor (`blockBorderColor`/`blockTitle` ganharam parâmetro `priority`) quanto — pedido
  explícito do usuário, "pra não ficar invisível na hora de montar a composição" — um contorno
  desenhado em CIMA de cada célula marcada no canvas principal já pintado (depois do upscale, pra
  ficar nítido).
- **Export sempre, nunca condicional** (`generateTilePriorityText`, novo em `exportTilemap.ts`) —
  32 linhas × COLUNAS caracteres `0`/`1`, resolvido por índice de tile de HARDWARE a partir de
  `grid` (mesma técnica de `generateCollisionHeader`). Decisão deliberada de exportar sempre (mesmo
  tudo `0`), não condicionalmente: a Anubis aceita os dois jeitos, mas a lição da Camada 2 (entrada
  anterior deste Log) é clara — sempre exportar evita qualquer categoria de "arquivo órfão
  desatualizado silenciosamente".
- **Achado real ao testar de ponta a ponta (não previsto antes de codar):** o endpoint
  `POST /api/export-gfx` (`vite-export-gfx-plugin.ts`) e o helper de leitura
  (`vite-gfx-files.ts`) só aceitavam `.bmp`/`.h`/`.json` — o `.txt` novo era REJEITADO com HTTP 400,
  o que silenciosamente fazia `handleSave` nunca chamar `onSaved()` (porque exige TODOS os saves
  `ok`), quebrando a atualização da tela depois de salvar. Pego pelo e2e (não imaginei isso de
  antemão) — corrigido estendendo os dois padrões de nome de arquivo pra incluir `txt`.
- **17 testes novos** (`tilesetAsset.test.ts`, `mergeTilesetMeta.test.ts`, `tilemap.test.ts`) + 2 E2E
  novos (`e2e/tile-priority.spec.ts`: marcar no editor, pintar, exportar o `.txt` certo; e o caso
  "nada marcado ainda exporta as 32 linhas de 0").
- **Pendência real, não técnica:** o pedido pedia marcar o poste da FRENTE do gol na `stage1` de
  verdade com essa flag, pra fechar o visual que motivou a tarefa. Abri `goalpost_tileset.bmp`
  (único tileset de gol salvo) — ele tem um poste CLARO (blocos 0/1, ainda Camada 2) e um poste
  ESCURO (blocos 2/3, já Camada 1 + colisão "goal", sem a flag) lado a lado, mais um bloco 4
  (barra clara, também "goal"). A descrição do pedido ("o de trás já foi movido pra Camada 1 ...
  fica atrás, correto") não bate com certeza visual qual dos dois é "o da frente" sem contexto que
  só o usuário tem (como os dois aparecem de verdade no jogo) — marcar o bloco ERRADO estragaria o
  visual que essa tarefa queria consertar, em arquivos reais (tileset salvo + `stage1`). Preferi
  perguntar a adivinhar — ver pergunta feita ao usuário nesta mesma conversa.
Verificado: `npx tsc -b`, `npm test` (238/238), `npm run build`, `npm run lint`, `npm run test:e2e`
(15/15) — todos limpos.

**✅ Bug real corrigido: pintar com bloco/terreno de Camada 2 no modo normal "Pintar blocos"
corrompia `gridLayer2` (2026-10-01, Prometeus).** Reportado pelo usuário: blocos de Camada 2
pintados fora do painel "C2" apareciam cortados/repetidos na 1ª tentativa, e simplesmente paravam de
pintar na 2ª.
- **Causa raiz:** `paintCell`/`floodFillAt`/`applyTerrainAt` escrevem usando `activeCols` (a largura
  do CANVAS ativo — a da fase inteira no modo "Pintar blocos", a PRÓPRIA e bem menor da Camada 2 no
  modo "C2"). Mas o seletor de bloco (`TilePickerModal`) não filtrava por camada — dava pra abrir o
  modo normal, escolher um bloco marcado "Camada 2" e pintar com ele, escrevendo em `gridLayer2`
  (array pequeno) usando a largura ERRADA (a da fase inteira, bem maior) — um clássico bug de
  "stride errado": a linha 2 em diante do array ficava desalinhada, exatamente o padrão
  "cortado/repetindo a cada N tiles" relatado. O guard anti-corrupção que já existia (da tarefa do
  Fundo) só bloqueava o sentido OPOSTO (Camada 1 dentro do painel C2) — faltava o espelho.
- **Corrigido nos dois lados, dos dois sentidos:**
  1. `TilePickerModal` ganhou `visibleIf` — o seletor de bloco agora só mostra blocos da CAMADA
     certa pro modo atual (nunca mais dá pra nem ESCOLHER a combinação errada). O quadrado-resumo de
     cada tileset na barra de ferramentas também soma isso: tileset sem nenhum bloco da camada do
     modo atual fica escondido inteiro.
  2. O filtro de grupos de terreno (já existia, mas só filtrava num sentido) virou simétrico.
  3. Os 3 guards de `paintCell`/`floodFillAt`/`applyTerrainAt` (checagem `mode === 'layer2' &&
     layer !== 2`) viraram comparação simétrica (`(mode === 'layer2') !== (layer === 2)`) — rede de
     segurança pros dois sentidos, não só um.
- **1 E2E novo** (`e2e/regression-layer2-wrong-mode.spec.ts`) — tileset com 1 bloco de cada camada,
  confirma que cada modo só mostra o bloco certo no seletor, pinta com o de Camada 2 dentro do
  painel certo, salva e reabre sem corromper. Confirmado que pega a regressão (revertido de
  propósito o `visibleIf` antes de reaplicar — voltou a mostrar os 2 blocos misturados). 1 teste
  E2E pré-existente (`layer2-panel.spec.ts`) precisou de ajuste: antes contava com o seletor
  (incorretamente) mostrando os 2 blocos misturados pra escolher o `.nth(1)` — agora só mostra 1
  (o certo), `.first()`.
Verificado: `npx tsc -b`, `npm test` (232/232), `npm run build`, `npm run lint`, `npm run test:e2e`
(13/13) — todos limpos.

**✅ Bug real corrigido: export de Camada 2 ficando desatualizado em silêncio (2026-10-01,
Prometeus).** Achado pelo Anubis investigando o poste sumido: um save sem Camada 2 (vazia nesse
save) não exportava `stage1_tilemap_layer2.bmp` — mas o `.pic`/`.map`/`.pal` CONVERTIDOS de um save
ANTERIOR continuavam em `assets/gfx/`, e o `make` não reclamava.
- **Causa raiz, confirmada lendo `build/Makefile` do lado da Anubis antes de corrigir:** a regra que
  gera `.pic`/`.map`/`.pal` da Camada 2 depende do `.bmp` existir
  (`$(ASSETS_GFX)/%_tilemap_layer2.pic ...: $(ASSETS_GFX)/%_tilemap_layer2.bmp ...`). `handleSave`
  (`StageSession.tsx`) APAGAVA esse `.bmp` quando a Camada 2 estava vazia — sem o `.bmp`, `make` não
  tem como reconverter (sem regra pro prerequisito ausente), mas como os arquivos derivados JÁ
  EXISTEM de um build anterior, `make` simplesmente os usa como estão, sem erro — o jogo roda com
  Camada 2 desatualizada, indefinidamente, até alguém notar visualmente (o poste sumido).
- **Opção escolhida (das 2 propostas no pedido): SEMPRE exportar `stage1_tilemap_layer2.bmp`,
  mesmo vazio/em branco** — nunca mais apaga esse arquivo. Garante que `make` SEMPRE tem o que
  reconverter, refletindo o estado REAL atual (vazio = toda célula no índice 0/transparente,
  `composeLevel`/`NO_TILE` já cobrem isso, não precisou de nenhuma lógica nova pra "imagem em
  branco"). Não escolhida: apagar os arquivos derivados do lado da Anubis — mais frágil (precisaria
  saber exatamente quais arquivos apagar lá, duplicando essa lista de nomes entre os dois projetos).
- `hasLayer2Content` (useMemo que só existia pra essa checagem) removido — ficou morto depois da
  mudança.
- **1 E2E novo** (`e2e/regression-layer2-stale-export.spec.ts`) — fase SEM nenhum bloco de Camada 2
  pintado, salva, confere via `/api/gfx-list` que `stage1_tilemap_layer2.bmp` aparece mesmo assim.
  Confirmado que esse teste pega a regressão (revertido de propósito antes de reaplicar a correção —
  voltou a falhar exatamente como o bug relatado, arquivo ausente da lista).
Verificado: `npx tsc -b`, `npm test` (232/232), `npm run build`, `npm run lint`, `npm run test:e2e`
(12/12) — todos limpos.

**🟡 Pedido também trazia o toggle de bloco "desenha na frente do jogador" (Camada 1) — NÃO
implementado AINDA, formato JÁ FECHOU do lado da Anubis depois de eu ter parado (2026-10-01).**
Conferi `docs/DATA_FORMAT.md` § 4 (e as entradas recentes de `docs/PROGRESS.md`/`docs/DATA_FORMAT.md`
do lado da Anubis, pro caso de ter chegado no meio da sessão como aconteceu com o backdrop na tarefa
anterior) — na hora, a proposta ainda não estava documentada em lugar nenhum, então segui a
instrução explícita do pedido pra esse caso e não implementei nada (nem UI). **O formato fechou
pouco depois, ainda na mesma sessão** (`docs/DATA_FORMAT.md` § 4, "Bit de prioridade por tile da
Camada 1" — export: `stage1_tilemap_priority.txt`, 32 linhas × colunas de `0`/`1` por célula de
8×8, só Camada 1, independente da colisão) — não implementei desta vez porque não era o que foi
pedido nesta rodada (o pedido desta vez era só a correção dos 2 bugs de Camada 2), mas fica pronto
pra pegar na próxima. Ver pendência atualizada em "Próximo passo".

**✅ Seletor de cor de fundo (backdrop) — seleção, prévia e EXPORT completos, de ponta a ponta
(2026-09-30/2026-10-01, Prometeus).** Pedido do usuário: o Anubis está implementando uma cor de
fundo fixa atrás da Camada 2, mas ele quer escolher entre as cores que JÁ existem na paleta da fase
(não um color picker livre), pra garantir consistência visual.
- **Checagem obrigatória do pedido, feita ANTES de codar — e de novo depois:** na 1ª checagem,
  `docs/DATA_FORMAT.md` § 4 não tinha NADA sobre backdrop ainda, então comecei só pela parte de
  UI/seleção/persistência, seguindo a instrução explícita do pedido pra esse caso. **O formato
  fechou do lado da Anubis NO MEIO desta mesma sessão** (`docs/DATA_FORMAT.md` § 4, "Cor de fundo
  fixa da fase (backdrop)", 2026-10-01, achado ao reler o arquivo antes de escrever esta entrada do
  Log) — então o export foi implementado também, na mesma rodada, em vez de ficar pendente.
- **Paleta de amostras** (`uniqueBackdropColors`, novo `backdropColor.ts`, puro/testado) — dedupe
  por VALOR rgb (não por índice) entre as paletas de TODOS os tilesets da sessão (Camada 1 + Camada
  2 combinadas, sem distinção — pedido explícito), ordem = primeira aparição.
- **Nova seção "Cor de fundo"** na tela de Fase (`StageSession.tsx`, sempre visível, não depende do
  modo "Pintar blocos"/"C2"/"Personagens") — amostras clicáveis (`.stage-backdrop-swatch`), nunca um
  `<input type="color">` livre.
- **Padrão sensato, não bloqueia salvar:** `null` (nada escolhido ainda) cai pra PRIMEIRA cor da
  paleta deduplicada (`backdropPaletteOptions[0]`) — decisão documentada no código: ligada ao
  conteúdo real da fase, mais previsível que preto fixo; preto só é usado se a fase não tiver
  tileset nenhum ainda (não deveria acontecer na prática).
- **Formato fechado (`docs/DATA_FORMAT.md` § 4): 3 `#define` opcionais em `stage1_entities.h`**
  (`<BASE>_BACKDROP_R/G/B`, 0-31, 5 bits por canal — unidade nativa do SNES, `canal8 >> 3`, mesmo
  bit-shift do `gfx4snes`/`RGB8`). Implementado em `exportEntities.ts`
  (`backdropColorToSnes5Bit`/`channel8To5Bit` em `backdropColor.ts`) — os 3 juntos quando há cor
  escolhida (sempre há, ver "padrão sensato" acima), nenhum quando `undefined` (engine trata
  ausência como preto explícito, já documentado do lado dela).
- **Prévia ao vivo "sem surpresa":** o canvas principal preenche o fundo inteiro ANTES de desenhar
  Camada 2/Camada 1 por cima — mas com a cor **já arredondada pelo corte de 5 bits**
  (`roundTripBackdropColor`, ida e volta pelo valor nativo SNES), não a cor exata 0-255 da amostra
  clicada, pra mostrar de verdade o que vai aparecer no jogo (o SNES só tem 32 tons por canal, não
  256). Hint de texto ao lado do seletor mostra os dois valores (nativo SNES e arredondado de
  volta), pra não confundir com a cor "crua" da amostra.
- **Persistência:** `_tileset_refs.json` ganhou `backdropColor?: [r,g,b]` (0-255, mesma convenção de
  `RgbColor`) — fonte da verdade pro ROUND-TRIP do editor (reabrir recupera a escolha EXATA, não a
  arredondada); o `.h` exportado é só o destino final pra engine, nunca lido de volta pelo
  Prometeus. Ausente em sidecars salvos antes desse campo existir, sem lançar.
- **13 testes novos** (`tests/backdropColor.test.ts` incl. conversão 8↔5 bits, 3 em
  `tests/stageTilesetRefs.test.ts` pro round-trip/corrupção de `backdropColor`, 2 em
  `tests/entities.test.ts` pros `#define` de backdrop) + 1 E2E novo (`e2e/backdrop-color.spec.ts`:
  amostras vêm da paleta certa, padrão é a 1ª cor, escolha persiste salvando e reabrindo, E o
  `stage1_entities.h` exportado de verdade tem os 3 `#define` certos).
Verificado: `npx tsc -b`, `npm test` (232/232), `npm run build`, `npm run lint`, `npm run test:e2e`
(11/11) — todos limpos.

**✅ Novo recurso salvo "Fundo" — imagem inteira carimbada de uma vez na Camada 2, sem pintar bloco
a bloco (2026-09-30, Prometeus).** Pedido do usuário: reconstruir uma cena CONTÍNUA (céu com morros
desenhado como uma peça só) bloco a bloco era tedioso e sem propósito — o pincel de blocos soltos
continua existindo pra decoração feita de peças repetíveis, mas agora também dá pra importar uma
imagem já pronta do tamanho exato da Camada 2 e carimbar ela inteira de uma vez.
- **Decisão de escopo tomada com o usuário antes de codar** (pedido explícito do próprio pedido:
  "proponha fasear se for maior que parece"): investigando a arquitetura, ficou claro que `tilesets`
  (a combinação de blocos de uma sessão de pintura) é FIXADA no momento de "Começar a
  pintar"/"Editar" — `StageSession.tsx` nunca recalcula isso depois. Um Fundo precisa entrar nessa
  MESMA combinação (consome 1 banco de paleta, igual um tileset). Duas opções: deixar escolher o
  Fundo DENTRO do painel C2 a qualquer momento (exigiria tornar a combinação recomputável em tempo
  real — refatoração grande, mais risco) ou escolher o Fundo JUNTO com o(s) tileset(s), antes de
  "Começar a pintar" (menor risco, encaixa na arquitetura atual). Usuário escolheu a 2ª — dentro da
  sessão de pintura, o painel C2 só tem um botão "Carimbar" (ação de 1 clique, sem recombinar nada).
- **Novo tipo de recurso salvo, "Fundo"** (`<nome>_fundo.bmp` + `<nome>_fundo.json`, pasta própria
  `assets/backgrounds/` — nunca lida pela Anubis, mesmo espírito de tileset salvo): nova aba "Fundos"
  na navegação de topo (`BackgroundEditor.tsx`/`SavedBackgrounds.tsx`, bem mais simples que
  TilesetEditor.tsx — sem tamanho de bloco, sem colisão/camada por bloco, sem terrenos inteligentes,
  mais perto do fluxo "Cenário" de ImportPreview.tsx). Dimensões validadas na hora de SALVAR (não só
  de usar): altura sempre 256px (32 linhas, fixo), largura EXATAMENTE 256 ou 512px (32 ou 64 colunas
  — `LAYER2_WIDTH_OPTIONS`, as únicas larguras que a Camada 2 repete de verdade; "múltiplo de 32 até
  64" só tem esses 2 valores, não é um intervalo). Mesmo mecanismo de `version`/staleness que
  tileset salvo já tinha (incrementa a cada save).
- **`loadBackgroundAsset` devolve o MESMO formato de `loadTilesetAsset`** (`LoadedTileset`) — um
  Fundo carregado "parece" um tileset carregado pra efeito de combinar/mesclar metadados: metadados
  SINTETIZADOS em vez de editados (blockSize sempre 8, TODO bloco já marcado Camada 2, sem colisão,
  sem terrenos) — evita duplicar a lógica de `combineTilesets`/`mergeTilesetMetaToHardware` pra um
  2º tipo de recurso.
- **`StageTilesetInput`/`StageTilesetRef` ganharam `kind?: 'background'`** (combineTilesets.ts,
  stageTilesetRefs.ts) — distingue um Fundo de um tileset normal dentro da MESMA lista combinada.
  Crítico pra reabrir uma fase salva funcionar direito: `loadStage.ts` agora despacha
  `loadTilesetAsset` ou `loadBackgroundAsset` por referência conforme `ref.kind` (`loadRefAsset`),
  senão a faixa de hardware que o `gridLayer2` carimbado aponta não existiria mais na recombinação
  ao reabrir. Ausente/`undefined` nos sidecars de sempre = tileset normal (zero mudança nas fases já
  salvas antes disso existir).
- **Tela "Fases" — seleção ganhou um 2º grupo, "Fundo pra Camada 2" (opcional, no máximo 1 — a
  Camada 2 só tem 1 padrão residente por fase)** — rádio em vez de checkbox, orçamento de banco de
  paleta compartilhado com os tilesets (`banksUsed = tilesets selecionados + 1 se tiver Fundo`).
- **Painel C2 — botão "Carimbar"**: acha a faixa (`band`) que o Fundo já ocupa em `hardwareCombined`
  (ele entrou na combinação igual qualquer outro tileset) e traduz cada célula do raster do Fundo
  (ordem raster, mesma de `buildTileset`/`tilePixels`) pro índice de hardware global dela
  (`bandGlobalTileIndex`) — SUBSTITUI `gridLayer2` inteiro (não é um merge célula a célula) e ajusta
  `layer2WidthTiles` pro tamanho nativo do Fundo. `window.confirm` se já havia algo pintado (mesmo
  padrão de confirmação de ação destrutiva já usado no resto do editor). Depois de carimbar, o
  pincel bloco-a-bloco continua funcionando por cima (ambos escrevem na MESMA grade — texto
  explicativo na UI deixa isso claro).
- **Fundo escondido da paleta de pincel avulso** (`tilesets.map` do modo "Pintar blocos"/"Camada
  2") — não faz sentido escolher "um bloco" de um Fundo de 32×32/64×32 tiles manualmente; só aparece
  via o botão "Carimbar".
- **12 testes novos** (`tests/backgroundAsset.test.ts`, `tests/backgroundDiscovery.test.ts`, +1 em
  `tests/stageTilesetRefs.test.ts` pro round-trip de `kind: "background"`) + 1 E2E novo
  (`e2e/background-stamp.spec.ts`: criar Fundo, escolher junto com um tileset, carimbar, salvar E
  reabrir — confirma que o caminho mais arriscado, `kind` sobrevivendo a `_tileset_refs.json`,
  funciona de ponta a ponta).
Verificado: `npx tsc -b`, `npm test` (221/221), `npm run build`, `npm run lint`, `npm run test:e2e`
(10/10) — todos limpos.

**✅ Achado real (print do usuário) na mesma sessão do editor de Camada 2: voltar da Camada 2 pra
"Pintar blocos" deixava a fase em branco (2026-09-29, Prometeus).** O painel da Camada 2 ocupa o
lugar do `.stage-viewport-area` principal enquanto está aberto (`{mode !== 'layer2' && (...)}`) —
ao voltar, esse bloco é REMONTADO do zero, com um canvas NOVO (em branco, 300x150 = tamanho padrão
de um `<canvas>` sem `width`/`height` setados). O efeito que desenha nele
(`composed`/`composedLayer2Pattern`/`hardwareCombined`/`activeStep`) não tinha `mode` nas
dependências, então nada o mandava rodar de novo só por causa dessa troca — a fase sumia até
qualquer OUTRA dependência mudar de valor. Corrigido adicionando `mode` às dependências do efeito
(e um `if (mode === 'layer2') return` no início dele, já que enquanto esse modo está ativo o canvas
principal nem existe no DOM). `e2e/layer2-panel.spec.ts` ganhou uma asserção que compara o
`width`/`height` do canvas antes e depois de entrar/sair da Camada 2 — reproduzi o bug de propósito
(removendo `mode` de novo, temporariamente) pra confirmar que esse teste pega a regressão antes de
reaplicar a correção.
Verificado: `npx tsc -b`, `npm test` (209/209), `npm run build`, `npm run lint`, `npm run test:e2e`
(9/9) — todos limpos.

**✅ Editor de Camada 2 virou um padrão repetível de verdade, com largura própria (32/64) —
implementada a sugestão que a Anubis tinha deixado em aberto em `docs/DATA_FORMAT.md` § 4
(2026-09-29, Prometeus).** Até aqui a Camada 2 era pintada do TAMANHO DA FASE inteira, embora a
Anubis (desde a mudança de 2026-09-29 registrada no `## Log` abaixo) só leia as primeiras 32/64
colunas dela e as repita sozinha em VRAM (parallax fixo em 1/2, sem streaming) — o resto do que
fosse pintado nunca aparecia no jogo, só desperdiçava tempo de pintura.
- **Painel dedicado da Camada 2** (`StageSession.tsx`, novo `EditMode` `'layer2'`, botão "C2" na
  barra de ferramentas) — canvas PRÓPRIO (`layer2CanvasRef`), do tamanho ESCOLHIDO da Camada 2
  (`layer2WidthTiles`, seletor 32/64 colunas — `LAYER2_WIDTH_OPTIONS`), nunca da largura da fase.
  As funções de pintura compartilhadas (`paintCell`/`floodFillAt`/`applyTerrainAt`) agora recebem a
  largura certa por `activeCols` (`layer2WidthTiles` no painel da Camada 2, `HARDWARE_COLS` no
  resto) em vez de assumir sempre a largura da fase.
- **Pré-visualização da repetição** — o canvas principal (Camada 1) passou a compor a Camada 2
  como um PADRÃO repetido via `CanvasPattern` (`repeat-x`) em vez de colar 1:1, e o painel da
  Camada 2 ganhou uma prévia extra mostrando o padrão 3x lado a lado (`layer2PreviewCanvasRef`), só
  leitura — pra ver a emenda ANTES de exportar.
- **Aviso acima de 64 colunas** (`layer2WidthWarning`, mesmo padrão de confirmação dos avisos de
  bandeira/VRAM já existentes) — só alcançável reabrindo uma fase antiga sem reduzir a largura, já
  que o seletor da UI só oferece 32/64. O texto do painel deixa claro que a Camada 2 não fica presa
  a nenhuma posição da fase — algo que precise de alinhamento exato (poste, placa) vai na Camada 1
  como bloco não-sólido.
- **Segurança contra corrupção de dados:** pintar um bloco de Camada 1 enquanto o painel da Camada
  2 está aberto (ou vice-versa) é bloqueado direto em `paintCell`/`floodFillAt`/`applyTerrainAt` —
  sem isso, escrever em `grid` (indexado pela largura da FASE) usando a largura da Camada 2 por
  engano corromperia os índices.
- **Fases antigas** (Camada 2 salva do tamanho da fase inteira, de antes desta mudança) continuam
  abrindo normalmente — `adaptLegacyLayer2Grid` (`layer2Grid.ts`, novo arquivo) corta
  automaticamente pras 64 primeiras colunas ao carregar (só o que a Anubis já lia mesmo, então não
  perde nada que já funcionasse). `stageTilesetRefs.ts` também parou de validar o tamanho do
  `gridLayer2` contra a largura da fase — só exige um múltiplo de `STAGE_HEIGHT_TILES` (32).
- Sem migração de formato de arquivo nenhuma (igual a Anubis já tinha decidido) — só muda como o
  Prometeus PINTA/edita, o `.bmp` exportado da Camada 2 continua sendo só o padrão (32/64 colunas),
  nunca a fase inteira.
- **6 testes novos** em `tests/layer2Grid.test.ts` (resize preservando estrutura de linha, detecção
  de conteúdo além de uma coluna, truncamento de grade legado) + 1 E2E novo
  (`e2e/layer2-panel.spec.ts`: abrir o painel, trocar largura, pintar, ver a prévia, salvar).
Verificado: `npx tsc -b`, `npm test` (209/209), `npm run build`, `npm run lint`, `npm run test:e2e`
(9/9) — todos limpos.

**✅ Mais 1 caso real de autotile faltando, confirmado com print antes/depois pelo usuário: o
CANTO (cotovelo) de bloco fino — esquema 24 → 28 (2026-09-25, Prometeus).** Uma curva de 90° num
caminho de 1 bloco de largura (ex.: vindo de baixo, virando pra direita) tem exatamente o MESMO
padrão de 2 cardeais adjacentes que um canto normal (`topLeft` etc.) — mas reaproveitar o canto
normal aqui tem o MESMO problema das pontas de bloco fino já corrigidas antes: ele assume que o
lado "de dentro" da curva (a diagonal entre os 2 cardeais preenchidos) é massa sólida continuando,
e num caminho de 1 bloco de largura não tem nada lá. O print "como está" vs "como deveria ser" do
usuário mostrava exatamente isso: o cotovelo usando o canto normal (arte errada, assumindo massa
que não existe) em vez de uma arte própria de cotovelo fino.
- **4 papéis novos** (`thinCornerTopLeft`/`thinCornerTopRight`/`thinCornerBottomLeft`/
  `thinCornerBottomRight`, `types.ts`/`autotile.ts`) — só disparam quando EXATAMENTE 2 cardeais
  ADJACENTES estão preenchidos (não opostos, já é bloco fino de meio) E a diagonal "de dentro" da
  curva TAMBÉM está vazia. Se essa diagonal estiver preenchida (canto de verdade de uma massa mais
  larga, ex. um retângulo sólido), continua caindo no canto normal de sempre — **zero mudança nos
  testes já existentes pra formas sólidas** (verificado, não só assumido).
- **Achado ao reescrever os testes:** a "moldura oca encostada na borda do mapa" da entrada
  anterior tem os cantos REDEFINIDOS por este ajuste — como a moldura é 1 bloco de espessura, cada
  canto dela SEMPRE foi um cotovelo de bloco fino de verdade, só que antes não existia esse papel
  ainda. Agora os 4 cantos da moldura corretamente viram `thinCornerTopLeft` etc. (não mais `fill`,
  que era o resultado do corte de borda de mapa na ausência desse papel) — o corte de borda de mapa
  não se aplica a cantos de bloco fino, mesma regra de cantos internos/entalhes (não têm entrada em
  `ROLE_MAP_EDGE_SIDES`).
- Nova seção "Blocos finos — canto/cotovelo (opcional)" no editor de grupo de terreno.
- **6 testes novos/atualizados** em `tests/autotile.test.ts` (35 no total) — inclusive a reescrita
  do teste de "formação em L de 1 bloco de largura" (o cotovelo dele, que antes eu tinha
  documentado incorretamente como "canto normal", agora reflete o comportamento certo).
Verificado: `npx tsc -b`, `npm test` (203/203), `npm run build`, `npm run lint`, `npm run test:e2e`
(8/8, contagem de slots atualizada pra 28) — todos limpos.

**✅ Faltava mesmo 1 caso de autotile: o CRUZAMENTO entre bloco fino horizontal e vertical —
esquema 23 → 24 (2026-09-25, Prometeus).** O usuário contou os slots na tela (achado válido — a
lista de terrenos redesenhada da entrada anterior facilitou contar) e confirmou que os 23 já
existiam, mas faltava um caso de verdade: a interseção onde uma faixa fina horizontal cruza uma
coluna fina vertical (tipo um "+"), com os 4 cardeais preenchidos mas os 4 cantos ocos ao mesmo
tempo (os 4 braços são finos) — diferente de preenchimento normal (0 cantos ocos) e diferente de um
entalhe de lado inteiro (exatamente 2 cantos ocos ADJACENTES).
- **Novo papel `thinCross`** (`types.ts`/`autotile.ts`) — 4 diagonais vazias ao mesmo tempo com os
  4 cardeais preenchidos. Continuam de fora, sem variante (decisão de escopo mantida): 3 diagonais
  vazias, ou 2 diagonais OPOSTAS (ex. noroeste+sudeste). Nova seção opcional "Cruzamento de bloco
  fino" no editor de grupo de terreno (`TilesetEditor.tsx`).
- **`e2e/terrain-group-list.spec.ts` ganhou uma assertion de CONTAGEM total** (24 slots, não só
  checar se cada seção existe) — mesma verificação que o usuário fez manualmente na tela, agora
  automatizada, pra não precisar contar de novo numa próxima rodada.
- **3 testes novos/atualizados** em `tests/autotile.test.ts` (33 no total) — inclusive um teste de
  integração com um cruzamento "+" de verdade (faixa horizontal + coluna vertical se cruzando),
  confirmando que só a célula exata da interseção vira `thinCross`, o resto de cada braço continua
  bloco fino normal.
Verificado: `npx tsc -b`, `npm test` (201/201), `npm run build`, `npm run lint`, `npm run test:e2e`
(8/8) — todos limpos.

**✅ Lista de terrenos inteligentes redesenhada (ícone + nome, estilo da página) — e confirmado por
teste automatizado que as seções novas de autotile JÁ estavam funcionando (2026-09-25, Prometeus).**
Pedido do usuário depois de reportar "não vejo os casos novos" com um print da lista de terrenos:
- **Achado ao investigar:** o print do usuário JÁ mostrava as 3 seções novas ("Blocos finos —
  meio", "Blocos finos — ponta/fim", "Entalhes de lado inteiro") com arte atribuída — a lógica
  nunca esteve quebrada. Pra confirmar isso sem depender só de leitura de código, escrevi um teste
  E2E de verdade (`e2e/terrain-group-list.spec.ts`) que cria um tileset, cadastra um terreno, e
  confirma que as 3 seções aparecem — passou de primeira. **Suspeita mais provável pro que o
  usuário via:** o servidor de dev não recarregou a mudança mais recente (precisa de um refresh
  forçado da página), ou o tileset com a arte nova ainda não tinha sido resalvo (atribuir papel só
  muda o estado da tela — precisa clicar "Salvar tileset" pra persistir, e reabrir/recomeçar a
  sessão de pintura na aba Fases pra usar a versão salva mais nova).
- **Ajuste de UI que era pedido de verdade, feito:** a lista de terrenos cadastrados
  (`TilesetEditor.tsx`) mostrava só um botão de texto solto — agora mostra um ícone quadrado
  (`TileCanvas`, novo — extraído de `TileThumb` pra não aninhar botão dentro de botão) com o bloco
  de "preenchimento" do grupo (mesmo espírito do preview usado em `StageSession.tsx`/
  `StageWorkspace.tsx` na aba Fases) + o nome ao lado, no mesmo estilo visual de
  `.character-list`/`.tile-thumb` já usado no resto da página (`index.css`, novo
  `.terrain-group-item`/`.terrain-group-icon`/`.terrain-group-name`).
Verificado: `npx tsc -b`, `npm test` (199/199), `npm run build`, `npm run lint`, `npm run test:e2e`
(8/8, 1 spec novo) — todos limpos.

**✅ Regressão real corrigida: o próprio ajuste de "borda do mapa seamless" quebrava formas
côncavas/finas perto da borda (moldura oca virava canto interno) — 2026-09-25, Prometeus.**
Reportado pelo usuário com print de uma moldura de terreno (1 bloco de espessura) encostada na
borda do mapa, com cantos e paredes finas saindo "bugados". **Causa raiz encontrada por
reprodução isolada** (script com `resolveTerrainRole`/`terrainRoleAt` direto, sem precisar do
navegador): a versão anterior do ajuste de borda (`isMemberOrEdge`, StageSession.tsx) fazia a
vizinhança de uma célula "enxergar" a borda do mapa como pertencente ao grupo DIRETO dentro de
`terrainRoleAt` — funcionava pra formas sólidas simples (o caso original que motivou o ajuste),
mas quebrava qualquer forma côncava/fina perto da borda: um canto de verdade de uma moldura oca
de repente "parecia" ter os 4 cardeais preenchidos, e a lógica de diagonal (pensada pra recortes
de 1 célula num chão sólido) classificava errado como canto INTERNO.
- **Corrigido separando os dois passos** (arquitetura mais correta, não só um patch): `autotile.ts`
  ganhou `trimRoleForMapEdges(role, {top,bottom,left,right})`, pura e testável — `terrainRoleAt`
  volta a usar SEMPRE pertencimento REAL (nunca a borda do mapa) pra resolver o papel certo
  primeiro; só DEPOIS, `trimRoleForMapEdges` corta do papel já resolvido o(s) lado(s) que tocam o
  limite do mapa (ex.: `topLeft` tocando a borda esquerda vira `top`; `thinVertical` tocando a
  borda esquerda vira `right`). `StageSession.tsx`/`applyTerrainAt` chama os dois em sequência no
  lugar do antigo `isMemberOrEdge`.
- **Confirmado que os DOIS casos funcionam agora** (testado via reprodução isolada + novo teste
  automatizado): o caso ORIGINAL (chão largo/grama tocando a borda, motivação do primeiro pedido)
  continua parecendo contínuo; e o caso NOVO (moldura oca com cantos/blocos finos tocando a borda)
  agora resolve certo — os 4 cantos da moldura exatamente nos 4 cantos do mapa viram `fill`
  (nenhum lado sobra pra mostrar), o meio das paredes perde só o lado que toca o limite,
  NENHUMA célula vira canto interno por engano.
- **6 testes novos** em `tests/autotile.test.ts` (31 no total) — inclusive um teste de regressão
  que reproduz a moldura oca exata do bug e afirma que nenhuma célula vira canto interno.
Verificado: `npx tsc -b`, `npm test` (199/199), `npm run build`, `npm run lint`, `npm run test:e2e`
(7/7) — todos limpos. Mudança visual — usuário deve conferir a moldura da print de novo.

**✅ Correção de 2 bugs reais reportados pelo usuário na rodada anterior de autotile (2026-09-25,
Prometeus): glifos de bloco fino invertidos + faltava a PONTA do bloco fino (esquema de 19 → 23).**
- **Glifos trocados (achado real, print em mãos):** `thinHorizontal`/`thinVertical` tinham os
  glifos ↕/↔ ATRIBUÍDOS AO CONTRÁRIO do que sugerem visualmente (↕ parece vertical mas era o
  papel horizontal, e vice-versa) — a LÓGICA (`autotile.ts`) sempre esteve certa, mas o glifo
  enganoso levou o usuário a atribuir a arte de coluna vertical no slot horizontal (e vice-versa),
  parecendo "invertido" no jogo. Corrigido: `thinHorizontal` agora usa ↔ (parece largo/horizontal),
  `thinVertical` usa ↕ (parece alto/vertical) — **ação do usuário: reatribuir a arte certa em cada
  slot agora que os glifos fazem sentido** (só trocar de slot na aba Tilesets, não precisa redesenhar
  nada).
- **Faltava a PONTA/fim de um bloco fino — bug real, não só falta de arte:** o fim de uma
  coluna/faixa fina (só 1 vizinho cardeal preenchido, os outros 3 vazios) reaproveitava um canto
  CONVEXO normal (`topLeft` etc.), que assume o lado "fechado" continuando com MAIS terreno —
  errado aqui, porque não tem nada pros dois lados num bloco de 1 de largura/altura. Resolvido com
  4 papéis novos (`thinVerticalTop`/`thinVerticalBottom`/`thinHorizontalLeft`/
  `thinHorizontalRight`, checados com a MAIOR prioridade — exatamente 1 cardeal preenchido só é
  geometricamente possível na ponta de um bloco fino, nunca faz parte de nenhuma outra forma).
  `TilesetEditor.tsx` ganhou uma 3ª seção opcional ("Blocos finos — ponta/fim") separada da de
  "meio" já existente. **12 testes atualizados/novos** em `tests/autotile.test.ts` (25 no total) —
  3 deles (linha/coluna isolada de 3 células, formação em L de 1 bloco de largura) tinham a MESMA
  expectativa errada documentada (ponta virando canto normal) e foram corrigidos.
- **Esquema agora tem 23 casos** (9 borda/canto/preenchimento + 4 cantos internos + 2 blocos finos
  "meio" + 4 blocos finos "ponta" + 4 entalhes de lado inteiro). Ainda fora de escopo, sem mudança
  (documentado, não é bug): 2 diagonais OPOSTAS ou 3/4 diagonais vazias ao mesmo tempo (caem em
  preenchimento) — o blob completo de 47 resolveria, decisão explícita de não ir até lá.
Verificado: `npx tsc -b`, `npm test` (193/193), `npm run build`, `npm run lint`, `npm run test:e2e`
(7/7) — todos limpos. Mudança visual — usuário deve conferir na UI real de novo, reatribuindo a
arte de bloco fino nos slots certos e desenhando as 4 novas pontas.

**✅ Ajustes de autotile pedidos pelo usuário depois de testar de verdade (2026-09-25, Prometeus):
borda do mapa "seamless" + 6 papéis novos (esquema de 13 → 19).**
- **Borda do mapa conta como se o terreno continuasse além dela** — achado real reportado pelo
  usuário com print: grama encostada na borda esquerda da fase desenhava a variante de "beira"
  ali, dando impressão de fase flutuando (sem chão nenhum além do que foi pintado). Corrigido em
  `StageSession.tsx`/`applyTerrainAt`: nova função `isMemberOrEdge` (fora da grade = "pertence",
  ao contrário de `isMember` normal) usada só pra RESOLVER O PAPEL de uma célula (a vizinhança
  "enxerga" a borda como preenchida) — `terrainCellsToReevaluate` continua usando `isMember` puro
  (uma posição fora da grade nunca é uma célula de verdade pra revisar). Vale pras 4 bordas do
  mapa, qualquer grupo de terreno. Mudança de comportamento em código de UI — não dá pra testar
  isolado (mesma convenção de sempre, `applyTerrainAt` não é unit-testado), usuário deve confirmar
  visualmente.
- **6 papéis novos no motor de autotile (`autotile.ts`/`types.ts`), esquema de 13 → 19 variantes**
  — 2 bugs reais mostrados em print pelo usuário: (1) **bloco fino** (`thinVertical`/
  `thinHorizontal`): uma coluna de 1 bloco de largura (ou faixa de 1 de altura) só tinha UMA borda
  desenhada (ex. esquerda), a outra "sumia" — o esquema de 9 só decide 1 lado por vez em cada
  eixo, nunca os 2 opostos ao mesmo tempo. Agora checado ANTES do esquema de 9: os 2 cardeais
  OPOSTOS vazios ao mesmo tempo (eixo perpendicular todo preenchido) viram um papel dedicado. (2)
  **entalhe de lado inteiro** (`notchTop`/`notchBottom`/`notchLeft`/`notchRight`): complemento dos
  4 cantos internos pro caso de exatamente 2 diagonais vazias ADJACENTES (mesmo lado cardeal, ex.
  uma coluna fina saindo do meio de uma base larga — junção em T) — antes caía tudo em
  "preenchimento" (escondia o recorte). **Decisão de escopo mantida e mais estreita:** 2 diagonais
  OPOSTAS (ex. noroeste+sudeste, combinação rara tipo xadrez) e 3/4 diagonais vazias ao mesmo
  tempo continuam sem variante, caem em preenchimento (documentado, não é bug — o blob completo de
  47 resolveria, fora de escopo aqui). `TilesetEditor.tsx` ganhou 2 novas seções opcionais
  ("Blocos finos", "Entalhes de lado inteiro") no editor de grupo de terreno, mesmo padrão visual
  das outras. Grupos salvos ANTES desses papéis existirem continuam funcionando sem mudança nenhuma
  (roles é esparso — papel sem bloco atribuído cai no de preenchimento, mesma regra de sempre).
  **13 testes de autotile ATUALIZADOS ou NOVOS** (`tests/autotile.test.ts`, 23 no total) —
  inclusive 2 testes PRÉ-EXISTENTES cuja expectativa estava documentando o próprio bug (linha/
  coluna isolada de 3 células virava "top"/"left" escondendo a borda oposta) foram corrigidos pra
  refletir o comportamento certo agora, com um teste NOVO ao lado confirmando que o caso comum
  "chão de verdade embaixo" (não deveria virar bloco fino) continua funcionando igual.
Verificado: `npx tsc -b`, `npm test` (191/191), `npm run build`, `npm run lint`, `npm run test:e2e`
(7/7, nenhum specificamente pra esses dois ajustes — ver "Próximo passo") — todos limpos.

**✅ Duas dívidas técnicas antigas pagas (2026-09-25, Prometeus): infra de teste E2E permanente +
quantização automática de paleta.** Nenhuma das duas dependia da Anubis; nenhuma mudou
`docs/DATA_FORMAT.md`.
- **Infra de teste Playwright (`e2e/`, `npm run test:e2e`):** substitui os scripts soltos/
  descartáveis usados até aqui pra validar UI real (nunca viravam regressão automática).
  `playwright.config.ts` sobe o PRÓPRIO dev server numa porta separada (5183, não a 5173 de
  `npm run dev`) com `PROMETEUS_E2E_GFX_DIR`/`PROMETEUS_E2E_TILESET_DIR` apontando pra pastas
  TEMPORÁRIAS do SO — os testes NUNCA escrevem nos arquivos reais (`../jogo-plataforma-snes/
  assets/gfx/stage1_*`/`hero_*`, ou `assets/tilesets/` deste projeto), confirmado na prática (as
  pastas reais continuam intocadas depois de rodar a suíte inteira). `vite-export-gfx-plugin.ts`/
  `vite-tileset-files-plugin.ts` ganharam esse override de diretório (zero mudança de
  comportamento sem a variável, `npm run dev` normal continua igual). 7 specs, todos passando:
  CRUD de tileset, pintar uma fase e salvar, upload de "cenário", e regressão dos DOIS bugs reais
  encontrados pelo usuário jogando (bloco 0 marcado como bandeira herdado por toda célula não
  pintada; orçamento de VRAM de uma fase larga — essa também exercita o seletor de largura
  configurável da entrada anterior). `POST /api/build-engine` é interceptado (nunca roda o `make`
  de verdade — já tem cobertura própria em `tests/*.test.ts`). Documentado em `README.md`
  ("Testes E2E") e `CLAUDE.md`. **Fasing explícito, documentado como próximo passo:** o fluxo
  completo de personagem (`SpriteSheetEditor` — pivô, hitbox, 5 animações obrigatórias) ainda não
  tem E2E dedicado; a versão simplificada de "cenário" já cobre o upload/validação compartilhados.
- **Quantização automática de paleta (`lib/quantizePalette.ts`, median-cut):** até aqui, uma
  imagem com mais de 16 cores só era REJEITADA (`validation.ts`), pedindo pra reduzir num editor
  externo. Agora existe uma oferta de reduzir automaticamente — SEMPRE com confirmação explícita
  (nunca automático/silencioso, é lossy) e prévia antes/depois lado a lado
  (`QuantizeConfirmModal.tsx`, portal igual ao `TilePickerModal` de StageSession.tsx). Achado ao
  conferir o código de verdade (não presumido): existem exatamente 2 pontos reais de upload fresco
  que podem estourar 16 cores — `useImageUpload.ts` (compartilhado por personagem E cenário,
  `ImportPreview.tsx`) e `TilesetEditor.tsx` (handler próprio, não usa o hook) — os dois agora
  oferecem a redução (`quantizeFlow.ts` decide quando oferecer: só quando o problema é
  EXCLUSIVAMENTE cor demais, dimensão fora de múltiplo de 8 não tem quantização que resolva).
  `loadCharacter.ts`/`loadStage.ts` (reconstrução de algo já salvo) não precisam disso — são
  sempre válidos por construção. Algoritmo: median-cut sobre o histograma de cores OPACAS únicas
  (pixels transparentes preservados, mesmo critério de `extractPalette`), dividindo sempre o
  "bucket" de maior alcance de cor — 6 testes unitários (`tests/quantizePalette.test.ts`, inclusive
  um caso de 2 clusters bem separados confirmando que cada um vira um representante coerente) +
  2 testes E2E (upload com >16 cores → modal aparece → cancelar não aplica nada → confirmar reduz
  de verdade e o upload segue válido, num fluxo de cenário e um de tileset).
Verificado: `npx tsc -b`, `npm test` (185/185), `npm run build`, `npm run lint` (só o warning
`react-hooks/exhaustive-deps` pré-existente, não relacionado), `npm run test:e2e` (7/7) — todos
limpos.

**✅ Largura de fase agora é CONFIGURÁVEL de verdade, por fase — viewport
grande e minimapa liberados de propósito (2026-09-24/25, Prometeus).**
Anubis fechou 🟡 o streaming de tilemap (`docs/DATA_FORMAT.md` § 4 v3) e
pediu pra este lado destravar fases largas de verdade — implementado
ponta a ponta, substituindo o revert temporário da entrada anterior
(histórico completo dela agora só no `## Log`).
- **`types.ts`:** removida a constante fixa de largura; entram
  `STAGE_PAGE_TILES` (32), `STAGE_MAX_PAGES` (15), `STAGE_MIN/MAX/DEFAULT_
  WIDTH_TILES`, `isValidStageWidthTiles()` (múltiplo de 32, 32-480) e
  `stageWidthPixels()`. Altura (`STAGE_HEIGHT_TILES` = 32) continua fixa
  de propósito — o streaming da Anubis só existe no eixo horizontal.
  `stageGridCols`/`composeLevel`/`generateCollisionHeader` agora recebem
  `widthTiles` como parâmetro em vez de ler uma constante global.
- **`reconstructStage.ts` (fallback de reabrir fase antiga):** a checagem
  de tamanho que antes comparava contra um `HARDWARE_ROWS/COLS` fixo agora
  valida em duas camadas — (1) o tamanho salvo é um tamanho de fase
  VÁLIDO hoje (altura sempre 32, largura múltipla de 32 até 480) e (2) o
  `.h` de colisão bate com o tamanho real da imagem `.bmp` exportada
  (arquivos desencontrados = mensagem própria, achado novo: antes os dois
  eram checados junto contra a mesma constante, então esse caso nunca
  tinha uma mensagem dedicada). Fase larga válida (ex. 96 colunas) agora
  RECONSTRÓI normalmente em vez de ser rejeitada — só altura ≠32 ou
  largura fora da regra continuam rejeitadas, com mensagem clara.
- **`stageTilesetRefs.ts` (sidecar `_tileset_refs.json`, caminho
  principal de reabrir fase):** novo campo `widthTiles` persistido junto
  da referência de tilesets — sidecars antigos (sem esse campo) assumem
  `STAGE_DEFAULT_WIDTH_TILES` (32), mantendo compatibilidade com toda fase
  já salva antes disso existir.
- **`loadStage.ts`:** `LoadedStageProject.widthTiles` recuperado dos dois
  caminhos (refs ou reconstrução por pixel) e repassado pra sessão.
- **`StageSession.tsx`:** recebe `widthTiles` como prop (não mais uma
  constante); todo cálculo de grade/composição/clamp de posição de
  entidade passa a depender dele. **Novo aviso de orçamento de VRAM**
  (`vramBudget.ts`, `countUniqueHardwareTiles` — mesmo algoritmo de dedup
  já provado contra o `gfx4snes` real em `reconstructStage.ts`, extraído
  como função pura e testada): conta os tiles de hardware únicos de cada
  camada depois de compor e avisa (com checkbox de confirmação, mesmo
  padrão do aviso de "bandeira") se a Camada 1 passar de 256 ou a Camada 2
  de 128 — números conferidos contra `docs/ARCHITECTURE.md` (endereços de
  VRAM em ÍNDICE DE PALAVRA, não byte; erro de conversão bytes/palavras
  cometido e autocorrigido durante esta sessão antes de chegar no código).
  A Anubis não detecta isso sozinha — só sobrescreveria VRAM adjacente em
  silêncio.
- **`StageWorkspace.tsx`:** novo seletor de largura (`<select>` só com os
  múltiplos válidos de 32, até 480) antes de "Começar a pintar" — **UI
  impede um valor inválido já na escolha**, não só avisa no export
  (pedido explícito do usuário). Fase reaberta recupera a largura salva
  automaticamente, sem seletor nenhum (não é mais escolha do usuário
  nesse caso).
- **`docs/DATA_FORMAT.md` § 4 v3:** nova entrada documentando o orçamento
  de VRAM do `.pic` por camada (256/128 tiles únicos) — ortogonal ao
  streaming do `.map` já documentado ali, sincronizado byte-idêntico com
  `../jogo-plataforma-snes/docs/DATA_FORMAT.md`.
- **Cuidados respeitados:** nenhum arquivo em `assets/tilesets/`/
  `assets/gfx/stage1_*` foi tocado por este trabalho; dev server não ficou
  rodando sem fase selecionada durante o trabalho.
- **Ainda pendente (não é trabalho deste lado):** exportar uma fase larga
  REAL (ex. 96 colunas) com conteúdo nas duas camadas e um humano jogar
  até o fim no emulador — a automação de teste não move o jogador. Sugestão
  registrada no `docs/DATA_FORMAT.md`: algo visualmente único perto do fim
  (a bandeira, por exemplo) confirma que a última página carregou certo.
Verificado: `npx tsc -b`, `npm test` (179/179, todos os casos novos
passando), `npm run build`, `npm run lint` (só 1 warning
`react-hooks/exhaustive-deps` pré-existente, não relacionado a esta
mudança) — todos limpos.

**Revert anterior (96x64, histórico completo no `## Log`) agora
SUPERADO** pelo trabalho acima — a stage1 salva errada na sessão passada
ainda precisa ser repintada/resalva pelo usuário (ver "Próximo passo"),
mas o motivo já não é "tamanho não suportado": 96 colunas já seria válido
hoje, só a ALTURA 64 continua inválida pra sempre (restrição real e
permanente da Anubis).

**Lata de tinta (flood fill) no pincel de bloco avulso — feature NOVA de
verdade (2026-09-24, Prometeus), não reorganização visual como as etapas
anteriores.** Pedido do usuário: "ao lado da borracha, uma ferramenta que
pinta todos os blocos adjacentes iguais ao clicado com o bloco
selecionado" — flood fill clássico de editor de imagem (4-conectado).
- **`StageSession.tsx`, novo estado `bucketFill`** (mutuamente exclusivo
  com `eraser`/`terrainBrush`, mesmo padrão dos outros — escolher um
  bloco novo ou outra ferramenta desativa) + nova função `floodFillAt`.
  Só funciona com o pincel de BLOCO AVULSO (não terreno inteligente, não
  borracha) — usa o `brush` atual como "tinta".
- **Granularidade — decisão importante:** opera sempre no blockSize do
  bloco selecionado, numa grade alinhada a partir da origem (0,0) — mesmo
  padrão já usado por `applyTerrainAt`/terrenos inteligentes, não é
  coincidência: um bloco de 16/32px tem sub-tiles DIFERENTES entre si
  (canto ≠ meio, ver docs/PROGRESS.md "tilesets inteligentes"), então
  "célula de hardware individual" não é uma unidade de comparação válida
  pra "é o mesmo bloco?" nesses tamanhos — só a granularidade do bloco
  INTEIRO é. Limitação aceita conscientemente: um bloco pintado numa
  posição NÃO alinhada a esse grid (possível já que "Passo do cursor" é
  independente do blockSize, docs/PROGRESS.md "cursor de posicionamento")
  pode não ser identificado corretamente pelo flood fill — cenário de
  borda, não o caso comum (a maioria pinta com o passo do cursor igual ao
  tamanho do bloco).
- **1 clique só, nunca arrasta** (diferente do pincel normal) — clicar e
  segurar/arrastar não dispara vários flood fills em sequência, só o
  clique inicial conta.
- **UI:** botão "Balde" ao lado de "Borracha" na barra de ferramentas,
  mesmo tamanho/modelo visual (40px).
- **Não testado com unidade** — a lógica vive dentro do componente React
  (não extraída pra um módulo puro), mesmo padrão já estabelecido de
  `paintCell`/`applyTerrainAt` nesta sessão (a parte pura e reutilizável
  do autotile JÁ está isolada em `autotile.ts`/testada; o flood fill em
  si é simples o bastante e específico o bastante da representação de
  grade deste componente pra não justificar extração nesta etapa).
Verificado: `tsc -b`, `npm run build`, `npm run lint` — limpos (`npm
test` ainda não rodado por causa do estado de teste temporário acima).
Não testado num navegador de verdade por nós — usuário testando
interativamente na própria sessão.

**Reestilizar a interface no espírito Lunar Magic — Fase 1: navegação +
barra de ferramentas de Fases (2026-09-24, Prometeus, reorganização
visual pura — zero funcionalidade nova, por instrução explícita do
usuário).** Antes de mexer em qualquer coisa, levantei um inventário
completo de TUDO que a interface permite fazer hoje, tela por tela,
direto do código (não do `PROGRESS.md`, que podia estar desatualizado) —
confirmou que NÃO existe hoje: toggle de visibilidade de Camada 2 durante
a pintura, zoom no canvas (`GRID_DISPLAY_SCALE` é uma constante fixa, não
ajustável), desfazer/refazer genérico (só um "Desfazer último" bem
específico do rascunho de animação, não confundir), ou qualquer botão de
testar/rodar a fase num emulador (`BuildStatus`/`useEngineBuild` só
reportam status de compilação da ROM). Nenhuma dessas quatro coisas entrou
no redesign, por instrução explícita ("não adicione... funcionalidade
nova").
Escopo desta etapa (usuário escolheu fasear — reorganizar TAMBÉM
Tilesets e principalmente Personagens/editor de sprite sheet, um
formulário longo de várias etapas com bastante estado interdependente,
ficou pra decidir depois):
- **Navegação de topo** (`App.tsx`): os 3 botões (Personagens/Tilesets/
  Fases) ganharam um ícone SVG original simples ("quadriculado", sem
  curva suave — mesmo espírito pixel-art do resto da UI, NÃO os ícones de
  verdade do Lunar Magic, que são arte do jogo original) ao lado do texto
  — mesma navegação/lógica de sempre, só visual.
- **Barra de ferramentas de "Fases"** (`StageSession.tsx`): "Colocar/
  Mover jogador" e "Adicionar inimigo" — antes só apareciam DENTRO de um
  painel que só existia depois de trocar manualmente pro modo
  "Personagens" — agora vivem na MESMA barra sempre visível do topo,
  junto com o pincel de bloco avulso/terreno/borracha (pedido explícito:
  "modo de pincel" vira um grupo sempre visível, não escondido atrás de
  um modo). Clicar em qualquer um dos dois agora troca pro modo
  "Personagens" sozinho (antes precisava trocar primeiro, manualmente) —
  o rádio explícito Pintar/Personagens continua existindo do lado, de
  propósito: é o único jeito de entrar no modo "Personagens" SEM
  efeito colateral nenhum (só pra arrastar um marcador já existente, sem
  adicionar/mover nada) — removê-lo tiraria uma capacidade que existe
  hoje, contra a regra de "zero funcionalidade nova/removida" desta
  etapa.
- **Refinamento depois do 1º teste do usuário (mesmo dia):** a barra
  agora mostra só o que é relevante pro modo atual — em "Pintar" some o
  grupo de personagens, em "Personagens" some a borracha/blocos/terrenos
  (antes tudo ficava visível o tempo todo, misturado). "Colocar jogador"/
  "Adicionar inimigo" deixaram de ser botões amarelos genéricos e viraram
  ícones no MESMO modelo visual dos blocos de tileset (`TileThumb`) — novo
  `EntityPickerThumb`, mostra o sprite "idle" de verdade do personagem/
  inimigo (mesmo quadro que os marcadores no canvas já usam) ENCAIXADO
  (contain) num ícone de 32px: sprite maior que isso encolhe pra caber
  inteiro, sem cortar (pedido explícito do usuário). Um ícone por tipo de
  inimigo cadastrado em `enemySlots.ts` (hoje só existe 1, "enemy1", mas
  já pronto pra quando existir um 2º) — clicar adiciona um inimigo DAQUELE
  tipo (antes só existia um botão único, sempre adicionando o tipo padrão;
  o tipo dava pra trocar depois pelo seletor "Tipo:", que continua
  existindo — não é capacidade nova, só um atalho mais direto pra uma
  ação que já era possível). Também corrigido: o quadrado da "Borracha"
  estava menor que os blocos de tileset ao lado (`width/height: 32px`
  sem contar que `box-sizing: border-box` já inclui borda+padding nesse
  32px, sobrando menos espaço de conteúdo que um `.tile-thumb` normal,
  que não define largura/altura fixa e por isso não tem esse desconto) —
  agora usa 40px, o mesmo tamanho TOTAL de um `.tile-thumb`.
- **2º refinamento (mesmo dia):** "Pintar"/"Personagens" deixaram de ser
  rádios com texto — viraram 2 quadrados de 40px no início da barra
  (mesmo modelo visual de tudo mais): o de "Pintar" mostra o bloco 0 do
  1º tileset da sessão (`TileThumb`, só representativo — não muda a
  seleção de pincel, só troca de modo), o de "Personagens" mostra o
  sprite do 1º tipo de inimigo cadastrado (`EntityPickerThumb`,
  `ENEMY_SLOTS[0]`). "Passo do cursor" perdeu o rótulo de texto e virou
  um `<select>` quadrado de 40px mostrando só o número (8/16/32, sem
  "px") — continua sendo um `<select>` de verdade (dropdown nativo com as
  3 opções, não um botão que cicla), só reestilizado pra caber no mesmo
  tamanho dos outros ícones.
Verificado: `tsc -b`, `npm run build`, `npm run lint` — limpos (`npm
test` não rodado nesta etapa por causa do estado de teste temporário
acima, que quebra 1 teste esperado). Não testado num navegador de
verdade por nós (usuário testando interativamente nesta sessão).

**Preparação pra fases maiores — Fase A E Fase B feitas (2026-09-23,
Prometeus).** Objetivo final confirmado com o usuário: fase longa de
verdade, sem teto artificial de ~1 tela — continua dependendo do Anubis
fechar 🟢 a proposta de streaming de tilemap (`docs/DATA_FORMAT.md` § 4,
v3, ainda 🟡 rascunho; nenhum parser/exportador do formato final foi
implementado, por design).

- **Fase A (modelo de dados):** `types.ts` trocou `STAGE_LEVEL_PIXELS`
  (constante única, assumia fase quadrada) por `STAGE_WIDTH_TILES`/
  `STAGE_HEIGHT_TILES` independentes (hoje ambos 32, cada um deve
  continuar múltiplo de 32) + `STAGE_WIDTH_PIXELS`/`STAGE_HEIGHT_PIXELS`
  derivados; nova `stageGridRows` ao lado da já existente `stageGridCols`,
  cada uma lendo seu próprio eixo. `compose.ts`/`exportTilemap.ts`/
  `reconstructStage.ts` pararam de reusar a MESMA variável "HARDWARE_COLS"
  pra linhas E colunas (achado real: um bug latente que nunca apareceu só
  porque largura e altura sempre foram iguais até agora) — cada um ganhou
  seu par `HARDWARE_COLS`/`HARDWARE_ROWS`, usado no eixo certo.
  `stageTilesetRefs.ts` generalizado do mesmo jeito.
- **Fase B (`StageSession.tsx`, feita a seguir na mesma sessão):** migrado
  TODO uso do antigo `STAGE_LEVEL_PIXELS` pros eixos independentes de
  verdade — marcador de jogador/inimigo, coleira de patrulha (só eixo X,
  ela é horizontal), limites do pincel avulso e do pincel de terreno
  inteligente, faixa "fora da área visível", aviso de proporção de
  bandeira. `STAGE_LEVEL_PIXELS` foi REMOVIDO de `types.ts` (não é mais
  usado por ninguém, incluindo os testes — atualizados junto pra usar os
  eixos novos direto). **Viewport rolável + minimapa** (pedido explícito,
  estilo Lunar Magic): a área de pintura virou um `.stage-viewport` com
  `overflow: auto`, tamanho máximo capado em `VIEWPORT_MAX_SIZE_PX`
  (512px, hoje a fase inteira cabe folgada aí sem barra de rolagem
  nenhuma — só quando a fase real crescer isso passa a rolar de
  verdade, sem precisar mudar nada). Minimapa (miniatura da fase +
  retângulo mostrando o que está visível + clique pra pular pra lá) só
  aparece quando sobrar algo fora do viewport (`viewportRect.width < 1 ||
  height < 1`) — hoje nunca aparece, por decisão de UX (minimapa sem
  nada pra navegar seria só poluição visual), mas o mecanismo já existe
  pronto. Posicionamento de entidade "fora do range de uma tela só" (item
  3 do pedido) saiu de graça da correção dos limites do pincel — os
  clamps de posição já usam `STAGE_WIDTH_PIXELS`/`STAGE_HEIGHT_PIXELS`
  reais, não mais um número fixo.
  **Limitação conhecida, não implementada de propósito:** não há
  auto-scroll ao arrastar uma entidade/pintar perto da borda do viewport
  (precisa rolar manualmente primeiro) — deixado de fora por decisão de
  escopo, sem necessidade prática ainda com a fase do tamanho atual.
  Também não há listener de resize da janela — o retângulo do minimapa só
  se atualiza no scroll ou quando o canvas principal é redesenhado, então
  pode ficar levemente desatualizado por um instante depois de redimensionar
  a janela do navegador.
- Verificado: `tsc -b`, `npm test` (166/166), `npm run build`, `npm run
  lint` — zero mudança visual/de comportamento pro usuário na fase atual
  (256x256 continua cabendo inteira, sem scroll/minimapa aparente) —
  a infraestrutura só entra em ação quando a fase real crescer.

**Bug real relatado pelo usuário JOGANDO — "FASE COMPLETA" instantânea por
célula nunca pintada herdando colisão do bloco 0 (2026-09-23, corrigido —
Prometeus). Confirmação visual na UI real ainda PENDENTE do usuário.**
Reautorou a `stage1` do zero (dados tinham sumido do disco antes) e a fase
passou a terminar sozinha assim que o jogador nascia. Evidência concreta:
`stage1_collision.h` com 632 de 1024 células como bandeira, ZERO como
vazio. Investigado a fundo (não presumi a hipótese do usuário de "default
errado ao criar bloco novo"): todo fallback de colisão no código já era
`?? 'empty'`, sem bug de default nenhum. Causa real, confirmada com as
contas batendo exatas (632 = 1024 − 392): a Camada 1 nunca tem "vazio" de
verdade — célula nunca pintada guarda implicitamente o bloco 0 do 1º
tileset da fase; se esse bloco específico estiver marcado bandeira (ou
sólido) sem querer, TODA a área não pintada herda essa colisão em
silêncio.

- **Corrigido:** nova `summarizeCollision` (`exportTilemap.ts`, pura,
  testada com o cenário real reproduzido) + aviso vermelho em
  `StageSession.tsx` sempre que mais de 5% da grade sairia como bandeira,
  com checkbox de confirmação explícita obrigatória antes do botão
  "Salvar fase no jogo" habilitar; o bloco 0 do 1º tileset da fase ganhou
  contorno laranja + tooltip ("bloco PADRÃO: cobre toda célula da Camada
  1 nunca pintada") na paleta de pintura da aba Fases.
- **Pendente:** o usuário confirmar visualmente na UI real (clicando, não
  só nos testes automatizados) que o aviso e o indicador aparecem e
  funcionam como esperado — sem ferramenta de automação de navegador
  disponível nas sessões que implementaram isso.

**Fase salva agora REFERENCIA tileset por nome, não é mais só reconstrução
por pixel (2026-09-23, implementado — Prometeus, complemento à etapa
anterior).** Os dois pontos que tinham ficado em aberto na etapa de
"tilesets como recurso salvo" (abaixo) foram decididos pelo usuário e
implementados no mesmo dia — **não são mais perguntas em aberto:**

1. **Fase salva referencia tileset por nome (decisão revertida: a ideia
   inicial era "não fazer agora"; o usuário pediu pra fazer já).** Novo
   sidecar Prometeus-only `stage1_tileset_refs.json` (mesma pasta
   `assets/gfx/` dos outros arquivos de `stage1_*`) guarda a lista de
   tilesets referenciados (nome + versão usada, na MESMA ordem da
   combinação) e a própria grade pintada (`grid`/`gridLayer2`, 1024
   números cada) — reabrir vira leitura DIRETA, sem dedup/reconstrução
   nenhuma. `reconstructStage.ts`/`reconstructLayer2` continuam existindo
   como FALLBACK (fase salva antes desse sidecar existir, sidecar
   corrompido, ou tileset referenciado apagado) — `loadStage.ts`
   (`loadStageProjectFromRefs` → `loadStageProjectFromPixels`) decide
   sozinho qual caminho usar, tentando o principal primeiro.
2. **Aviso de fase desatualizada em relação ao tileset que ela referencia.**
   `<nome>_tileset.json` ganhou um campo `version` (sobe a cada "Salvar
   tileset", 1 na criação — sobe mesmo sem mudança real, trade-off aceito
   por simplicidade). O sidecar da fase grava qual versão foi usada;
   `checkStageStaleness()` (verificação leve, só lê `.json`) compara com a
   versão atual. Aviso aparece nos dois lugares pedidos: na lista de fases
   salvas (`SavedStage.tsx`, antes de clicar "Editar") e dentro da sessão
   de edição depois de "Editar" (`StageWorkspace.tsx`) — nome do tileset
   específico, versão salva → versão atual, nunca um "algo mudou" genérico.
   Isso é só estado do editor — nunca mexe no que já foi exportado pro
   jogo.

- **Arquivos novos:** `src/lib/tilemap/stageTilesetRefs.ts` (sidecar de
  fase, puro, testado). `TilesetMeta` (`tilesetAsset.ts`) ganhou o campo
  `version`. `StageTilesetInput` (agora em `combineTilesets.ts`, pra evitar
  import circular entre `StageSession.tsx` e `loadStage.ts`) ganhou
  `name?`/`version?` opcionais — ausentes só no caminho de fallback
  (reconstrução por pixel não tem nome nenhum pra referenciar). `.json`
  também liberado no endpoint de escrita `/api/export-gfx`
  (`vite-export-gfx-plugin.ts`), que já aceitava `.json` só pra leitura.
- `npx tsc -b`, `npm run build`, `npm run lint` e `npm test` (143/143)
  passam — testes novos cobrendo o round-trip do sidecar de fase e casos de
  corrupção/formato inesperado. **Não verificado ainda:** teste manual
  clicando pela UI real (salvar fase com tileset nomeado, editar o
  tileset, reabrir a fase e ver o aviso de desatualização) — sem navegador
  nesta sessão.

**Tilesets viraram um recurso SALVO e reutilizável entre fases (2026-09-23,
implementado — Prometeus).** Continuação direta da reorganização de UI
anterior (abaixo): "Tilesets" era só uma aba separada, mas o tileset
continuava sendo upload efêmero preso à sessão — virou um CRUD de verdade
(criar/editar UM tileset, salvar com um nome; "Fases" agora ESCOLHE entre
tilesets salvos, multi-seleção até `MAX_TILESET_BANKS`).

- **Formato novo, só do Prometeus:** `assets/tilesets/` DENTRO deste
  projeto (nunca em `jogo-plataforma-snes/`) — `<nome>_tileset.bmp`
  (imagem original) + `<nome>_tileset.json` (tamanho de bloco, colisão e
  camada por bloco). Endpoints próprios (`vite-tileset-files-plugin.ts`,
  `/api/tileset-*`), reaproveitando `vite-gfx-files.ts` (já genérico por
  diretório) — só precisou adicionar `.json` ao padrão de extensão aceito.
- **Mudança de representação interna importante:** colisão/camada
  passaram a ser indexadas por TILE DE HARDWARE (8px), não mais por
  "índice de bloco numa combinação a um blockSize só" — necessário porque
  cada tileset salvo tem seu PRÓPRIO blockSize, e combinar um de 16px com
  um de 32px não tem um "blockSize da combinação" único e correto. Isso
  bateu direto com o que `reconstructStage.ts` já fazia sozinho (sempre
  trabalhou a 8px) — os dois caminhos (tileset da galeria, via novo
  `mergeTilesetMeta.ts`, ou fase reaberta por reconstrução de pixel)
  convergem pro mesmo formato sem tradução nenhuma em `StageSession.tsx`/
  `generateCollisionHeader` (que ficou mais simples: perdeu 2 parâmetros).
- **Dois pontos em aberto da tarefa, decididos e registrados em
  `docs/DATA_FORMAT.md` § 4:**
  1. Fase salva CONTINUA reconstruindo por pixel (`reconstructStage.ts`/
     `loadStage.ts` inalterados) — NÃO passou a referenciar tileset salvo
     por nome nesta etapa. Decisão explícita pra não aumentar o tamanho da
     tarefa; migrar pra referência por nome (resolveria de brinde o
     "sempre reabre em blocos de 8×8") fica pra uma etapa futura.
  2. Editar um tileset salvo nunca muda uma fase já exportada — só
     reexportar aplicaria a mudança; aviso fixo disso na aba "Tilesets".
- **Arquivos novos:** `vite-tileset-files-plugin.ts`,
  `src/lib/tilemap/tilesetAsset.ts` (metadados JSON, puro),
  `src/lib/tilemap/mergeTilesetMeta.ts` (tradução bloco→hardware ao
  combinar vários tilesets, puro), `tilesetFiles.ts`/`tilesetDiscovery.ts`/
  `loadTileset.ts` (cliente), `TilesetEditor.tsx` (criar/editar UM
  tileset — extraído e simplificado do que vivia dentro do fluxo de fase,
  agora usa `buildTileset` em vez de `combineTilesets`, já que edita um só
  por vez), `SavedTilesets.tsx`/`TilesetThumbnail.tsx` (galeria, mesmo
  espírito de `SavedCharacters.tsx`). `StageSession.tsx`/
  `StageWorkspace.tsx` reescritos: colisão/camada não são mais editáveis
  na aba Fases (propriedade do tileset agora), pincel virou "qual tileset
  e qual bloco dele" em vez de um índice global numa combinação a um
  blockSize só.
- `npx tsc -b`, `npm run build`, `npm run lint` e `npm test` (138/138)
  passam — testes novos cobrindo o round-trip do JSON de metadados, a
  descoberta de tileset salvo, e a tradução bloco→hardware (incluindo o
  caso central: dois tilesets com blockSize DIFERENTE combinados). **Não
  verificado ainda:** teste manual clicando pela UI real (criar/editar
  tileset, escolher vários numa fase, salvar, reabrir a fase) — sem
  navegador nesta sessão.

**Reorganização de UI: "Editor de Fases" virou duas áreas próprias,
"Tilesets" e "Fases" (2026-09-23, implementado — Prometeus, sem mudança
nenhuma de formato/lógica).** Pedido do usuário: a tela de fase tinha
crescido demais (tileset, colisão por tile, camadas, entidade, tudo numa
página só). Investigação feita ANTES de desenhar a navegação (pedido
explícito): **hoje não existe um "tileset" como recurso independente e
persistido** — o que existe é estado de upload efêmero (`TilesetUpload[]`)
dentro da sessão de edição, "cozido" direto na imagem composta da fase ao
salvar; reabrir uma fase salva reconstrói um conjunto SINTÉTICO a partir
da própria imagem já composta (sempre em blocos de 8×8, perdendo o tamanho
de bloco original — comportamento antigo, não mudou aqui). E só existe UMA
fase hoje (`stage1`, fixo), então "reutilizar tileset entre fases" não é
um cenário que existe pra testar ainda. Apresentado ao usuário: só
reorganização de UI (Fase A) vs. tileset virar recurso independente/
reutilizável de verdade (Fase B, mudança de modelo de dados bem maior,
precisaria de proposta 🟡 própria em `docs/DATA_FORMAT.md`) — **usuário
escolheu só a Fase A**, que é o que foi implementado. Fase B fica
registrada aqui como possível próximo passo, não decidida ainda.

- **Nova estrutura de arquivos:** `StagesPage.tsx` + `StageEditor.tsx`
  (uma tela só) viraram `StageWorkspace.tsx` (dono do estado de
  upload/descoberta de fase salva — praticamente o `StagesPage.tsx` de
  antes, ganhou as props `activeTab`/`onNavigate`) envolvendo
  `StageSession.tsx` (todo o estado de pintura/colisão/camada/entidade —
  o `StageEditor.tsx` de antes, ganhou a prop `activeTab` e a JSX foi
  dividida em dois blocos condicionais). O estado É UM SÓ nos dois — trocar
  de aba Tilesets↔Fases não perde nada (nenhum unmount acontece); só
  "Limpar" ou reabrir outra fase salva (`sessionKey` em
  `StageWorkspace.tsx`, igual antes) reseta de verdade.
- **Navegação de topo em `App.tsx`: 3 abas** — "Personagens" (era
  "Importar", conteúdo idêntico: galeria de personagens + editor de
  personagem + fluxo de "Cenário", que continua junto — não fazia sentido
  isolar um upload de imagem plana que não vira tileset nem fase numa 4ª
  aba); "Tilesets" (novo — upload, tamanho de bloco, "O que é cada
  bloco?"); "Fases" (novo — passo do cursor, escolher bloco e pintar,
  posicionar entidades, salvar). Clicar "Editar" numa fase salva
  (`SavedStage`) pousa automaticamente na aba "Fases" (`onNavigate`), já
  que é lá que o resultado aparece.
- **Nenhum aviso/validação existente sumiu**, só mudou de aba: orçamento de
  paleta de BG (Tilesets), limite de 16 cores/corte de quadro (Personagens,
  inalterado), contagem de sólido/bandeira (Tilesets). Aba "Fases" vazia
  (sem tileset cadastrado ainda) mostra um aviso com botão direto pra aba
  "Tilesets" em vez de tela em branco.
- Fora de escopo desta etapa (igual já estava): auto-tile e fase maior que
  uma tela (scroll) — a separação em abas foi pensada pra já deixar espaço
  de UI pra essas duas depois, sem precisar de outra reforma.
- `npx tsc -b`, `npm run build`, `npm run lint` e `npm test` (124/124)
  passam. **Não verificado ainda:** teste manual clicando pela UI real
  (trocar de aba Tilesets↔Fases preservando pintura, editar fase salva
  pousando na aba certa, "Cenário"/galeria de personagens continuam
  acessíveis) — só validado por leitura/tipos/testes automatizados, sem
  abrir navegador nesta sessão.

**Bug real achado pelo usuário: arrasto rápido pintava em 8px mesmo com
"Passo do cursor" em 16px (2026-09-23, corrigido).** Causa: `cellsOnLine`
(interpolação de linha do arrasto, pra não deixar buraco quando o mouse
anda rápido) sempre andava em passos de 1 célula de HARDWARE (8px) —
independente do `cursorStep` escolhido, então uma linha entre duas
células válidas "de 2 em 2" (cursorStep=16) passava por cima das células
ÍMPARES no meio do caminho, pintando ali também. Só aparecia em arrasto
rápido porque com poucos eventos de `mousemove` a distância entre `last`
e a célula atual fica maior, dando mais espaço pra interpolação "pisar"
em posições desalinhadas; devagar, os eventos já chegavam quase célula a
célula, mascarando o bug. Corrigido em `paintAt` (`StageEditor.tsx`):
converte a célula atual/última pra "unidade de passo" (divide por
`cursorStep/8`) ANTES de chamar `cellsOnLine`, e só volta pra célula de
hardware no fim, na hora de chamar `paintCell` — a interpolação passa a
visitar só posições realmente alinhadas ao passo escolhido.

**"Passo do cursor" virou uma escolha de verdade do usuário, não só
visual (2026-09-23, pedido explícito depois de testar).** A 1ª versão do
seletor "grade visível" só mudava as linhas desenhadas (puramente
estético); o usuário pediu pra ele TAMBÉM controlar onde o clique pode
cair, com a opção de pintar em passos de 8px OU 16px (ou 32px). Novo
estado `cursorStep` (independente de `blockSize`, o tamanho do carimbo) —
`cellFromClient` snapeia o clique nos múltiplos de `cursorStep`, sempre
devolvendo célula de HARDWARE (o armazenamento interno continua igual,
sempre 8px, só o que MUDOU é em quais múltiplos o clique pode cair). Os
dois continuam ortogonais: dá pra carimbar um bloco de 32px com passo de
cursor 8px (encaixe fino) ou pintar com bloco de 8px mas passo de cursor
16px (pintura rápida, menos risco de clicar torto). A grade desenhada
segue o mesmo valor, mostrando exatamente onde o clique cai. Seletor
renomeado de "Grade visível no mapa" pra "Passo do cursor" pra refletir o
efeito real. Detalhe em `docs/DATA_FORMAT.md` § 4 (correção sobre a versão
anterior, que dizia "sempre 8px" — não é mais bem assim).

**Dois ajustes rápidos em cima do cursor de 8px, achados pelo usuário
testando (2026-09-23):**
- **Bug real de CSS: botão "Borracha" ficava quase invisível.**
  `.stage-eraser-button` só sobrescrevia `border-style: dashed`, sem
  `border-color` — herdava o `border-color: transparent` de `.tile-thumb`,
  então o contorno tracejado nunca aparecia (só ficava visível depois de
  selecionado, quando `.tile-thumb-selected` entrava). Corrigido dando um
  `border-color`/fundo próprios sempre visíveis, e uma regra
  `.stage-eraser-button.tile-thumb-selected` (especificidade maior) pra
  continuar mostrando a cor de destaque quando ativo.
- **Grade visível virou uma OPÇÃO própria, independente do tamanho de
  bloco.** A ideia original (linha fina de 8px sempre + linha mais forte
  no tamanho de bloco atual) ficou "difícil de enxergar" com bloco de 8px
  (só a grade fina densa, sem contraste nenhum). Agora um seletor "Grade
  visível no mapa" (8/16/32px) escolhe UM nível só pra desenhar — não
  muda a resolução real do cursor (`paintCell` continua sempre 8px), é só
  o que fica desenhado por cima pra facilitar de enxergar.

**Editor de Fases: cursor de posicionamento sempre em passos de 8px,
independente do tamanho de bloco (2026-09-23, implementado).** Achado real
do usuário: com bloco de 16px escolhido, só dava pra clicar em múltiplos de
16 — restrição da FERRAMENTA, não do hardware (o SNES endereça cada célula
do tilemap de BG de 8 em 8px, sem exigir alinhamento entre vizinhas; a
regra de alinhamento em blocos maiores é só de SPRITE). Impedia posicionar
um elemento fino (ex.: uma barra de 8px) no meio do vão entre dois blocos
maiores. **Mudança:** `grid`/`gridLayer2` (`StageEditor.tsx`) passaram a
guardar SEMPRE índice de tile de HARDWARE (32×32 células de 8px fixas,
igual à granularidade que já era exportada) — o `blockSize` escolhido virou
só o tamanho do CARIMBO (`paintCell` decompõe o bloco escolhido nos
tiles de hardware que ele cobre via dois helpers novos e puros em
`combineTilesets.ts`, `blockToHardwareTopLeft`/`hardwareTileToBlockIndex`,
inversos um do outro — os dois tilesets combinados, a `blockSize` e a 8px,
vêm dos MESMOS uploads e compartilham o MESMO raster de pixels, só
fatiado diferente, então a tradução é aritmética pura de posição). Grade
visível mostra os dois níveis (linhas finas de 8px + linhas mais fortes no
tamanho de bloco atual). `generateCollisionHeader` simplificou (não precisa
mais de "repeat" — o grid já vem na resolução de hardware 1:1, só traduz
cada tile de hardware pro bloco que o contém antes de consultar a tabela de
colisão). **Trocar o tamanho de bloco não reseta mais a pintura em
andamento** (agora numa resolução fixa) — continua resetando
`tileCollision`/`tileLayer` (a numeração de bloco muda com o tamanho, e a
definição de colisão continua por índice de BLOCO, sem mudar — pedido
explícito do usuário). Fora de escopo, sem mudança: formato exportado
(`.bmp`/`_collision.h` continuam saindo na mesma grade fixa de 32×32 de
sempre) e qualquer consumo do lado da Anubis. Detalhe completo em
`docs/DATA_FORMAT.md` § 4. Testes atualizados (`tests/tilemap.test.ts`,
`tests/reconstructStage.test.ts`, novo `tests/combineTilesets.test.ts` pro
round-trip dos dois helpers) — `npx tsc -b`, `npm run build`, `npm run
lint` e `npm test` (124/124) passam.

**Editor de Fases: 2ª camada de tileset (decorativa, sem colisão) — 🟡
proposta escrita E implementada do lado do Prometeus (2026-09-22); consumo
do lado da Anubis continua fora de escopo, por isso a seção 4 do
`docs/DATA_FORMAT.md` não fecha 🟢 ainda.** Implementado: `tileLayer:
Map<número do bloco, 1|2>` (estado em `StageEditor.tsx`) marca a camada de
cada bloco no passo "1. O que é cada bloco?" (contorno azul, campo de
colisão zerado ao marcar Camada 2); `gridLayer2` (paralelo a `grid`,
sentinela `NO_TILE`) recebe a pintura automaticamente quando o pincel
escolhido é um bloco de Camada 2 (`paintCell` decide sozinho, usuário só
escolhe o bloco); prévia do canvas compõe as duas camadas (Camada 2 via
`putImageData`, Camada 1 por cima via `drawImage` — só `drawImage`
preserva alpha, deixando a Camada 2 aparecer nos buracos transparentes da
Camada 1); indicador "Camada 1 usa N banco(s), Camada 2 usa M banco(s)"
somando o orçamento real de paleta de BG; exporta
`stage1_tilemap_layer2.bmp` só se algo foi pintado nela (`hasLayer2Content`
— `gridLayer2.some(v => v !== NO_TILE)`), apagando o arquivo velho se a
fase tinha Camada 2 antes e o usuário limpou tudo. Reabrir uma fase salva
(`loadStage.ts`) reconstrói as duas camadas independentemente
(`reconstructStage`/`reconstructLayer2`, cada uma com sua própria
numeração de banco) e remapeia o `grid` da Camada 2 pro índice global do
tileset combinado FINAL (Camada 1 + Camada 2 concatenadas,
`findBandLocalIndex`/`bandGlobalTileIndex` em `combineTilesets.ts` fazem a
tradução) — testes novos: `findBandLocalIndex` (round-trip com
`bandGlobalTileIndex` pra todo bloco de todo banco, `tests/
combineTilesets.test.ts`) e os 2 testes de `reconstructLayer2` já
existentes (`tests/reconstructStage.test.ts`). `npx tsc -b`, `npm run
build`, `npm run lint` e `npm test` (124/124) passam. **Não verificado
ainda:** teste manual completo na UI real (pintar as duas camadas, salvar,
reabrir) nem E2E automatizado — não há harness de E2E no repo hoje (a
infraestrutura `withStageBackup`/`stage-test-safety.mjs` citada em entradas
anteriores deste arquivo não está presente na árvore atual do projeto).

**Bug real encontrado e corrigido durante o teste manual do usuário
(2026-09-22): transparência quebrada em qualquer tileset que não fosse o
1º importado.** `combineTilesets.ts` desloca todo índice de cor pelo banco
do tileset (`bankIndex*16`), inclusive o índice 0 (transparente) da
imagem original — `composedToRgba` (`lib/metasprite/render.ts`) só tratava
o índice GLOBAL 0 como transparente, então qualquer tileset em banco > 0
perdia a transparência (fundo virava opaco, cor que sobrava naquele slot
da paleta — foi assim que o usuário percebeu, um fundo preto no 2º
tileset importado). Corrigido trocando `value === 0` por
`value % COLORS_PER_BANK === 0` — pra quem só usa 1 paleta de 16 cores
(personagem/animação) o comportamento é idêntico a antes (`value` nunca
passa de 15 nesses casos). Só afeta a PRÉVIA no navegador — o `.bmp`
exportado nunca teve esse problema (a transparência real no hardware
depende do valor de 4 bits LOCAL do pixel, que já sai correto do
`gfx4snes`/`combineTilesets` independente do banco). Teste de regressão
novo em `tests/preview.test.ts`.

**Investigação de um 2º relato do usuário (pintar Camada 1 por cima de
Camada 2 na mesma célula "sumia" com a Camada 2) não achou bug — era
dado errado do próprio usuário (um PNG teve a altura alterada de 16 pra
14px em algum momento, o que forçava o bloco pra 8×8 sem ele perceber,
deixando fácil pintar sprites de várias células por engano).** Verificado
com um teste isolado (fora do React, só as funções puras de composição)
que a matemática de "Camada 2 atrás + Camada 1 na frente com alpha"
funciona certinho quando os dados estão certos.

**Pedido do usuário direto dessa investigação: ferramenta de borracha pra
Camada 2 (2026-09-22, implementado, testado pelo usuário).** Novo botão
"Borracha" ao lado dos blocos no passo 2: ativa um modo onde
clicar/arrastar no mapa volta a célula da Camada 2 pro sentinela
`NO_TILE` (`gridLayer2`), sem precisar que o tileset tenha um bloco vazio
de propósito pra "apagar" pintando por cima (frágil — o usuário relatou
que o 2º tileset dele não tinha bloco vazio nenhum). **Decisão tomada e
revertida no mesmo dia:** o usuário pediu pra borracha também mexer na
Camada 1; implementei resetando pro bloco 0 (único jeito possível, já que
a Camada 1 nunca tem "vazio" de verdade — hardware sempre desenha algo no
BG1), mas na prática isso confundiu mais do que ajudou (bloco 0 não é
necessariamente "em branco" no tileset do usuário, virava uma troca de
bloco inesperada em vez de "apagar"). Perguntei ao usuário e a escolha
final foi deixar a Camada 1 FORA da borracha — pra trocar o bloco da
Camada 1 o jeito é escolher outro bloco normalmente (`paintCell` só toca
em `gridLayer2` quando a borracha está ativa).

Tarefa formal do usuário: uma camada extra (BG2) atrás
do tilemap atual e dos sprites, puramente visual (sem colisão), pra
decoração — "tudo atrás serve". Proposta completa escrita ANTES de
codar (pedido explícito), sincronizada com
`../jogo-plataforma-snes/docs/DATA_FORMAT.md`. Pontos principais:
`<base>_tilemap_layer2.bmp` (mesmo esquema do BG1 de hoje, sem
`_collision.h` equivalente, totalmente ausente se a camada não for usada);
camada é escolha POR BLOCO no tileset (não por célula pintada, pedido
explícito do usuário) — bloco de camada 2 não pode ter colisão; dois grids
paralelos independentes por trás dos panos (`gridLayer1`/`gridLayer2`);
achado técnico importante documentado na proposta: as duas camadas
competem pelo MESMO orçamento de 8 bancos de paleta de BG do hardware
(não 8 cada). **Correção feita no mesmo dia, depois de testar contra o
binário real do `gfx4snes`:** a ideia inicial (resolver só com o
`paletteEntry` RUNTIME de `bgInitTileSet`) estava incompleta — testei com
um BMP sintético e confirmei que `paletteEntry` só desloca ONDE a cor é
carregada na CGRAM, não muda os 3 bits de banco já gravados dentro de
cada tile do `.map` em tempo de CONVERSÃO. O mecanismo certo é a flag
`-e`/`--pal-entry` do `gfx4snes` (confirmado: `-e 3` faz um tile sair do
`.map` com banco 3 já carimbado, em vez de 0) — a Camada 2 precisa ser
convertida com `-e N` (N = bancos que a Camada 1 usa) E carregada em
runtime com `paletteEntry = N` (o mesmo N), as duas partes juntas.
Detalhe completo em `docs/DATA_FORMAT.md` § 4. Fora de escopo (decisão do
usuário): bit de prioridade por tile, uma 3ª camada (BG3/HUD), e qualquer
consumo do lado da Anubis (fica pra depois que este lado estiver pronto e
testado).

**🔴→🟢 Bug real quebrou o build da Anubis: campo de offset de patrulha
vazava `NaN` pro `.h` exportado (2026-09-22, corrigido no mesmo dia da
tarefa da patrulha relativa).** Usuário rodou `make` e recebeu
`stage1_entities.h:10: error: 'NaN' undeclared`.

- **Causa raiz:** `PatrolOffsetInput` (então um `<input type="number">`
  totalmente controlado, sem rascunho próprio) chamava `Number(e.target.
  value)` a cada tecla. Digitar um offset negativo char a char passa por
  um estado intermediário só com o sinal ("-"), e `Number('-')` é `NaN` —
  isso ia direto pro `EnemyInstance` em memória e, dali, sem checagem
  nenhuma, pro `.h` exportado como o token literal `NaN` (`patrol_min_x`)
  e como um buraco vazio em `{ }` (`patrol_max_x`, porque `Array.
  join` trata `undefined` como string vazia — os dois campos são
  independentes, um ficou `NaN` de verdade e o outro ficou `undefined`,
  aparentemente por um ciclo salvar→reabrir→salvar anterior já ter
  corrompido o arquivo e o parser ter propagado o problema).
- **Fix em 2 camadas (defesa em profundidade, não só remendar o sintoma):**
  1. **Na origem (UI):** novo componente `PatrolOffsetInput`
     (`StageEditor.tsx`) guarda um RASCUNHO de texto próprio (mostra o que
     foi digitado, incluindo um "-" sozinho no meio do caminho) e só chama
     `onCommit` quando o texto já é um número válido e completo — nunca
     deixa `NaN`/vazio virar estado de verdade. Resincroniza o rascunho
     com a prop `value` ajustando o estado DURANTE o render (padrão
     recomendado pela documentação do React pra "resetar estado quando uma
     prop muda"), não um `useEffect` — evita o aviso `react(set-state-in-
     effect)` do oxlint E evita a UI mostrar o rascunho velho por 1 frame.
  2. **Na fronteira (export/parse):** `sanitizeOffset()` em
     `exportEntities.ts` — nunca deixa `NaN`/`Infinity`/`undefined` virar
     token de C, nem na exportação nem ao REABRIR um arquivo já
     corrompido ou com array mais curto que `_ENEMY_COUNT` (em vez de
     propagar o problema pra sempre a cada ciclo salvar/reabrir, ele se
     autocura pra `0` na próxima vez que passar por essas duas funções).
- **Corrigido também o build já quebrado do usuário:** `assets/gfx/
  stage1_entities.h` real tinha `NaN`/vazio — corrigido na mão pra `0`/`0`
  (`has_patrol_limit` desse inimigo era `0`, então esses dois valores não
  são lidos pelo jogo de qualquer forma — seguro zerar). `make` confirmado
  limpo depois.
- **Achado separado, também corrigido (fora do escopo original da tarefa,
  mas quebrava o build igual):** `main.c` (Anubis) já tinha consumo REAL
  de `stage1_entities.h` funcionando com os nomes de campo ANTIGOS
  (`stage1_enemy_min_x`/`_max_x`) — a nota de bloqueio no `PROGRESS.md` de
  lá ("main.c não foi alterado") estava desatualizada, referia-se só à
  parte NOVA (coleira opcional/sensor), não à leitura básica de posição,
  que já existia e funcionava. Renomear os campos sem avisar quebrou esse
  consumo já funcionando. Ver log de hoje no `PROGRESS.md` da Anubis pro
  fix (`main.c`, feito por esta sessão já que foi o câmbio de formato
  desta sessão que causou a quebra — escopo mínimo: só traduzir os nomes
  novos pro que `enemyInit()` já esperava, sem mexer no sensor de
  parede/beirada em si, que continua tarefa da sessão de lá).
- Verificado: `npx tsc -b`, `npm run build`, `npm run lint`, `npm test`
  (119/119 — 2 casos novos: NaN/undefined nunca vira C inválido, array
  mais curto que ENEMY_COUNT se autocura) e E2E dedicado reproduzindo o
  bug exato (digitar um offset negativo CHAR A CHAR, com delay entre
  teclas, passando pelo estado intermediário "-") confirmando que não
  quebra mais nada e o arquivo final nunca contém `NaN` — usando
  `withStageBackup`, sem afetar o `stage1_*` real do usuário além do
  reparo manual já descrito acima. Build real da Anubis confirmado limpo
  (`make -C build`, sem erros).

**Editor de Fases: patrulha de inimigo virou coleira opcional e relativa
(2026-09-22).** Tarefa formal do usuário, em paralelo com a sessão da
Anubis implementando um sensor de parede/beirada do lado do jogo (o
inimigo vira sozinho ao bater/perder o chão, sem precisar de número
manual nenhum). Formato combinado entre as duas sessões, documentado em
`docs/DATA_FORMAT.md` § 4 (nova subseção "Patrulha de inimigo relativa e
opcional", sincronizado com `../jogo-plataforma-snes/docs/DATA_FORMAT.md`).

- **`<base>_entities.h`:** `enemy_min_x[]`/`enemy_max_x[]` (absolutos,
  sempre obrigatórios) trocados por `enemy_has_patrol_limit[]` (0/1) +
  `enemy_patrol_min_x[]`/`enemy_patrol_max_x[]` (offsets RELATIVOS a
  `enemy_x[i]`, podem ser negativos). `EnemyInstance` (`entities.ts`)
  ganhou `hasPatrolLimit: boolean` + `patrolMinOffsetX`/`patrolMaxOffsetX:
  number` no lugar de `minX`/`maxX`.
- **UI (`StageEditor.tsx`):** inimigo novo nasce SEM coleira por padrão —
  hint deixa claro que sem isso marcado ele anda até bater em parede ou
  perder o chão sozinho (comportamento novo do jogo, não limitação do
  editor). Checkbox "Limitar a patrulha" revela 2 manípulos arrastáveis
  no mapa (faixa hachurada entre eles) + campos numéricos como
  alternativa — os manípulos representam offset, podem passar pro lado
  esquerdo do inimigo (negativo). `DEFAULT_ENEMY_PATROL_HALF_WIDTH`
  deixou de ser um intervalo pré-ativado, virou só o ponto de partida
  (-40/+40) pronto pra quando o usuário marcar o checkbox.
- **Achado real de migração (não estava no pedido, mas achei essencial
  não pular):** a fase REAL do usuário ainda estava salva no formato
  ANTIGO (`enemy_min_x`/`max_x`) no momento desta mudança. Sem cuidado, o
  parser novo (que só reconhece os campos novos) lançaria erro ao tentar
  reabri-la — e como `loadStage.ts` trata QUALQUER erro de parse do
  `_entities.h` como "sem entidades ainda" (pensado pra arquivo AUSENTE,
  não corrompido/formato antigo), isso apagaria o inimigo/jogador da fase
  real em silêncio na próxima vez que o usuário clicasse "Editar".
  `parseEntitiesHeader` agora tenta o formato novo primeiro e, se não
  achar, migra sozinho do formato antigo (toda fase antiga tinha a
  coleira sempre ativa, então `hasPatrolLimit` vira `true`, offsets saem
  de `minX/maxX - x`). Confirmado com um E2E SÓ LEITURA direto contra o
  `stage1_entities.h` real (nunca chama Salvar/Excluir): abre, confirma
  jogador+inimigo reconstruídos com a coleira migrada certinha, e
  confirma que o arquivo real ficou byte a byte igual ao início.
- Verificado: `npx tsc -b`, `npm run build`, `npm run lint`, `npm test`
  (117/117 — round-trip com/sem coleira, offset negativo, migração do
  formato antigo, mensagens de erro) e E2E dedicado (checkbox
  desmarcado por padrão, manípulos aparecem/desaparecem com o checkbox,
  arrastar muda o offset pra mais negativo, digitar direto trava a ordem
  min≤max, salvar grava o formato novo, reabrir reconstrói tudo) +
  regressão dos outros fluxos de fase — usando `withStageBackup`
  (`stage-test-safety.mjs`), sem tocar em dado real do usuário além da
  verificação read-only acima.
- **Fora de escopo aqui (tarefa da sessão da Anubis, em paralelo):** como
  o sensor de parede/beirada detecta parede/beirada de verdade. Os
  arquivos exportados já são válidos independente disso — se o build de
  lá ainda não consumir `has_patrol_limit`/`patrol_min_x`/`patrol_max_x`
  quando estiver lendo isso, nada quebra, só o comportamento em jogo não
  usa o sensor ainda.

**Editor de Fases: 2ª rodada do fix de posição de entidade — sprite ainda
flutuava, snap-to-grid "parecia" quebrado (2026-09-22).** Usuário mandou
novos screenshots: mesmo depois do fix anterior (hitbox), o inimigo
continuava aparecendo bem acima do chão no editor (correto no jogo), e
reportou que o encaixe na grade "tinha se perdido".

- **Causa real (não uma regressão no snap — o dado já estava certo, era só
  visual):** o marcador continuava com `transform: translate(-50%, -50%)`
  — centrado no ponto, e não ANCORADO nele. Um marcador de 28px centrado
  deixa a metade da própria altura "pra cima" do ponto, então mesmo com o
  ponto (pivô) matematicamente certo (confirmado por teste antes desta
  rodada), o sprite ainda parecia flutuar. Corrigido: `transform:
  translate(-50%, -100%)` — a BASE do marcador (o pé/pivô) fica exatamente
  no ponto, não o centro.
- **Pedido novo, junto: "o sprite... corresponde perfeitamente"** — o
  ícone também estava sendo encolhido pra caber num círculo de 28px
  (`CharacterThumbnail`-style), então mesmo com a posição certa, o TAMANHO
  do sprite não batia com a escala dos blocos pintados ao lado.
  `EntitySpriteIcon` ganhou uma prop `scale` (mesma `GRID_DISPLAY_SCALE=2`
  do canvas da fase) e desenha o sprite no tamanho de exibição VERDADEIRO
  (`frameWidth*scale x frameHeight*scale`), não mais encolhido. O
  badge circular colorido (fundo azul/rosa) saiu do marcador — virou um
  contorno fino (`box-shadow`) direto na borda do sprite real, pra não
  distorcer o "formato" visual dele; o badge circular com letra continua
  existindo só como fallback (enquanto carrega ou se a reconstrução
  falhar — aí sim sem dimensão real pra ancorar, então mantém o círculo).
- **Snap-to-grid revisado (não era regressão, mas dava pra ficar melhor
  dado o que se descobriu aqui):** X continua encaixando no CENTRO da
  coluna; Y passou a encaixar na BORDA DE BAIXO da célula (não no centro)
  — é essa borda que representa "em cima do chão" de verdade (antes, com
  o pé no centro vertical de uma célula, sobrava meio bloco de ar embaixo
  mesmo se tudo mais estivesse certo). `snapToGrid` virou
  `snapGridCenter`/`snapGridBottomEdge`.
- **Achado de processo — quase repeti o incidente de ontem:** o teste
  E2E completo (save → auto-build real → reload) falhou ao rebuildar a
  ROM depois de restaurar o `stage1_*` real (`withStageBackup`,
  ontem) — não por bug de lógica, e sim uma corrida de arquivo: o
  `make` que o PRÓPRIO teste dispara ao salvar (via auto-build) ainda
  podia estar liberando handles de arquivo no Windows quando o `make` de
  restauração do wrapper tentava rodar em seguida. Confirmado rodando
  `make` manualmente segundos depois (build limpo, `stage1_*`/ROM reais
  intactos) — não foi um bug real de build, só timing. `stage-test-
  safety.mjs` ganhou retry (3x, 1.5s de intervalo) nesse rebuild.
- Verificado: `npx tsc -b`, `npm run build`, `npm run lint`, `npm test`
  (115/115) e E2E dedicado (screenshot visual confirmando os pés dos
  sprites tocando uma faixa de chão pintada, em escala real; testes de
  snap atualizados pra borda-de-baixo em Y; round-trip do pivô/hitbox
  continua batendo) + regressão completa do fluxo de fase (com o retry
  novo, sem tocar no `stage1_*` real do usuário). Sem mudança de formato
  de arquivo — não mexe em `DATA_FORMAT.md`, não precisa sincronizar com
  a Anubis (nenhum arquivo do lado de lá foi tocado nesta rodada,
  diferente do que o usuário sugeriu ser necessário).

**Editor de Fases: corrigido inimigo/jogador aparecendo mais embaixo no
jogo do que no editor (2026-09-22).** Usuário mandou 2 screenshots (editor
vs. emulador): o inimigo aparecia visivelmente mais baixo no jogo de
verdade do que o marcador mostrava no editor.

- **Causa raiz confirmada lendo o código real da Anubis** (`player.c`/
  `enemy.c`): `(x,y)` salvo em `stage1_entities.h` é o canto SUPERIOR
  ESQUERDO da hitbox pra engine (comentário no próprio `enemy.c`:
  "enemyX/enemyY guardam o canto superior esquerdo da hitbox, não o
  pivô") — o sprite é desenhado ancorado no PÉ, que fica em
  `x + hitboxW/2, y + hitboxH` (hitbox inteira pra baixo, metade pra
  direita). O marcador do editor, porém, desenhava centrado direto em
  `(x,y)` — sempre um `hitboxH` inteiro mais alto (e um pouco pro lado) do
  que a posição real no jogo. Confirmado com os valores reais
  (`HERO_HITBOX_W/H` = 12/22, `ENEMY1_HITBOX_W/H` = 16/16, de
  `hero_metasprites.h`/`enemy1_metasprites.h`).
- **Fix, só do lado do Prometeus** (o formato salvo NÃO muda — `(x,y)`
  continua sendo o canto da hitbox, exatamente como a engine espera):
  novo `loadCharacterHitbox(baseName)` (`loadCharacter.ts`, leitura leve —
  só o `_metasprites.h`, não precisa do `.bmp`) + cache
  `hitboxByBaseName` em `StageEditor.tsx` (hero + cada slot de inimigo,
  buscado uma vez ao montar). `pivotToSpawn`/`spawnToPivot` convertem
  entre "onde o usuário aponta/o marcador mostra" (o pivô/pé, que é o que
  faz sentido encaixar na grade — ver fix de snap abaixo) e "o que é
  salvo" (canto da hitbox) — aplicado no clique de posicionar, no
  arrasto, na posição padrão de inimigo novo, e (invertido) no desenho do
  marcador. Sem hitbox conhecida ainda (cache não carregou, ou header
  antigo sem hitbox), cai pro comportamento anterior (sem deslocamento) —
  não trava.
- **Achado de lint da mesma categoria de sempre nesse arquivo:** o cache
  de hitbox é `useState`, mas quem arrasta um marcador roda dentro do
  efeito de mouse a nível de `window` (montado uma vez só) — mesmo padrão
  de ref "sempre atualizada" (`hitboxByBaseNameRef`) de `paintAtRef`/
  `stagePixelFromClientRef` já documentados aqui.
- Verificado: `npx tsc -b`, `npm run build`, `npm run lint`, `npm test`
  (115/115, sem mudança nos testes de unidade — é só UI) e E2E dedicado
  lendo o `HERO_HITBOX_W/H` REAL de `hero_metasprites.h` (só leitura):
  confirma que o valor SALVO (painel "Ponto de partida") continua sendo
  `pivô - hitboxOffset` (contrato inalterado) e que o marcador desenha de
  volta no pivô exato que o usuário clicou (round-trip `pivotToSpawn` ->
  `spawnToPivot` bate exato) — mais a regressão do fix de grid-snap
  anterior (continuam compondo certo: os dois se cancelam matematicamente
  no ponto clicado) e do fluxo completo de fase (`withStageBackup`, sem
  tocar no `stage1_*` real). Sem mudança de formato de arquivo — não mexe
  em `DATA_FORMAT.md`, não precisa sincronizar com a Anubis (achado só
  confirma um contrato que já existia, não muda ele).

**Editor de Fases: posicionamento de jogador/inimigo encaixa na grade de
pintura (2026-09-22).** Pedido do usuário: "os tilesets já funcionam em uma
forma de grid, faça com que o posicionamento de personagens e objetos
também fique, pra evitar que fique torto ou longe do chão ao tentar
colocar" — clique/arrasto iam pro pixel exato do mouse, sem relação com os
blocos pintados.

- `StageEditor.tsx`: novo `snapToGrid(value)` — encaixa no CENTRO da célula
  mais próxima da grade de pintura atual (`blockSize`: 8/16/32px), não no
  canto/linha (o marcador, desenhado centrado no ponto, fica visualmente
  "dentro" de um bloco em vez de em cima da linha entre dois).
  `stagePixelFromClient` (usada tanto pelo clique de "Colocar jogador"
  quanto pelo arrasto de marcador) passou a aplicar isso sempre; a posição
  padrão de um inimigo novo (`handleAddEnemy`) também.
- **Achado de lint da mesma categoria de sempre nesse arquivo:**
  `stagePixelFromClient` agora fecha sobre `blockSize` (via `snapToGrid`),
  que muda — mas quem arrasta um marcador roda dentro do efeito de mouse a
  nível de `window` montado uma vez só (mesmo motivo de `paintAtRef`/
  `clearResultsRef` já documentados aqui). Resolvido com o mesmo padrão de
  ref "sempre atualizada" (`stagePixelFromClientRef`).
- Verificado: `npx tsc -b`, `npm run build`, `npm run lint`, `npm test`
  (115/115, sem mudança nos testes de unidade — é só UI) e E2E dedicado
  (clique deslocado dentro de uma célula encaixa no centro dela; arrastar
  encaixa continuamente, célula a célula; inimigo novo já nasce numa
  posição encaixada) + regressão do fluxo completo de fase (posicionar,
  salvar, reabrir — usa `withStageBackup`, não toca no `stage1_*` real do
  usuário). Sem mudança de formato de arquivo (a posição salva continua
  pixel absoluto, só a UI de escolher ela mudou) — não mexe em
  `DATA_FORMAT.md`, não precisa sincronizar com a Anubis.

**Editor de Fases: marcadores de entidade usam o sprite "idle" real em vez
de ícone com letra (2026-09-22).** Pedido do usuário: trocar os marcadores
de jogador/inimigo (antes só "J" e números num círculo colorido) pelos
sprites já exportados (hero/enemy1).

- Novo `reconstructIdleFrame` em `lib/metasprite/importProject.ts` (ao lado
  de `reconstructThumbnail`, que já existia pra galeria "Personagens já
  salvos" — usa sempre o quadro 0). A diferença: lê `_anim.h` (opcional —
  `enemy1` só exige `walk`, `idle` é só sugestão, pode não existir) e usa o
  primeiro frame da animação **"idle"** de verdade, caindo pro quadro 0 se
  não achar (mesmo fallback de sempre pra dado antigo/ausente).
  `loadCharacterIdleSprite` (`loadCharacter.ts`) é o wrapper com DOM (lê os
  arquivos + `composedToRgba`), espelhando `loadCharacterThumbnail`.
- Novo componente `EntitySpriteIcon.tsx`, usado nos marcadores de
  `StageEditor.tsx` (jogador = `DEFAULT_CHARACTER_SLOT_ID`/"hero", inimigo =
  o `id` do `EnemySlot` cujo `typeIndex` bate com o da instância). Cai pro
  texto de fallback (a letra/número de antes) se a reconstrução falhar
  (arquivo ausente/corrompido) — o marcador nunca fica "quebrado". Cuidado
  de lint real: `baseName` pode mudar num marcador de INIMIGO já montado (o
  usuário troca o "Tipo:" sem soltar o marcador) sem remontar o componente
  — resolvido guardando o `baseName` a que o resultado pertence e comparando
  durante o render (`isCurrent`), em vez de um `setState` síncrono só pra
  "resetar pra loading" dentro do efeito (oxlint `react(set-state-in-effect)`
  pegou isso already na primeira versão).
- `.stage-marker` (CSS) cresceu de 22px pra 28px (sprite real precisa de
  mais espaço que uma letra) e ganhou `overflow: hidden` (recorta o sprite
  na forma circular do marcador).
- Verificado: `npx tsc -b`, `npm run build`, `npm run lint`, `npm test`
  (115/115) e E2E dedicado (posiciona jogador+inimigo, confirma que o
  marcador renderiza um `<canvas>` com pixels reais do hero/enemy1 — não a
  letra antiga —, screenshot conferido visualmente) **sem tocar em
  `stage1_*`** (só lê `hero_*`/`enemy1_*` reais pra desenhar o ícone, mesmo
  jeito só-leitura que a galeria já fazia — nenhum save/editar/excluir de
  fase acionado pelo teste). Sem mudança de formato de arquivo — não mexe
  em `DATA_FORMAT.md`, não precisa sincronizar com a Anubis.

**Editor de Fases: marcada visualmente a faixa invisível no jogo
(2026-09-21).** Achado real reportado pelo usuário (confirmado do lado da
Anubis: `.bmp`/`.map`/`stage1_collision.h` batiam entre si — não era bug de
import/export): o SNES (NTSC, o modo que a engine usa) só renderiza 224 das
256 linhas de altura de um tilemap de 32×32 tiles — as últimas 4 fileiras de
8px (linhas 28-31) existem no hardware e contam pra colisão, mas nunca
aparecem na tela. Um usuário pintou o chão da stage1 exatamente nessa faixa
e ele "sumiu" (colidível, invisível).

- Novo `SNES_VISIBLE_HEIGHT_PIXELS = 224` em `lib/tilemap/types.ts`
  (documentado com o achado acima direto no comentário).
- `StageEditor.tsx`: overlay absoluto (`.stage-hidden-region`, CSS novo)
  cobrindo os últimos `256-224=32px` do grid de pintura — hachurado laranja,
  borda tracejada e rótulo "fora da área visível", com `pointer-events:
  none` (não bloqueia pintar ali — pode ser útil pra colisão fora de tela em
  casos raros, só avisa). Texto de dica do modo "Pintar blocos" também
  menciona a faixa. Não trava nada, é só aviso visual.
- Verificado: `npx tsc -b`, `npm run build`, `npm run lint`, `npm test`
  (108/108, sem mudança nos testes de unidade — é só UI) e E2E dedicado
  (`e2e-stage-hidden-region.mjs`: overlay presente, posicionado nos
  últimos 32/256 do grid, não bloqueia clique/pintura por baixo,
  screenshot conferido visualmente) + regressão do fluxo completo de fase.
  Sem mudança de formato de arquivo — não mexe em `DATA_FORMAT.md`, não
  precisa sincronizar com a Anubis (é só uma indicação visual do lado do
  editor; o "achado" em si — 224/256 — já tinha sido confirmado do lado de
  lá, não é uma decisão de formato nova).

**Editor de Fases: corrigido arrasto "preso" que pintava sozinho (2026-09-21,
follow-up do fix acima).** Usuário reportou, em uso real: "alguns tiles
acabam voltando ao padrão aleatoriamente enquanto tento arrastar". O fix
anterior (arrasto por interpolação + tracking em nível de `window`) tinha um
bug novo, clássico dessa técnica: `paintingRef`/`draggingEntityRef` só eram
zerados no evento `mouseup`. Só que se o usuário solta o botão do mouse
**fora da janela do navegador** (muito comum num arrasto rápido até a borda
da tela), esse `mouseup` nunca chega à página — o ref fica "preso" em true
pra sempre, e depois disso **qualquer** `mousemove` seguinte (só passando o
mouse por cima do mapa, sem clicar) continua pintando sozinho com o brush
selecionado, sobrescrevendo tiles ao acaso conforme o cursor passeia. Isso
bate exatamente com "aleatoriamente" do relato.

- **Diagnóstico:** só foi confirmado depois que um teste automatizado com
  saltos grandes de mouse (`e2e-stage-drag-repro.mjs`, ~120-200 passos por
  arrasto) não reproduziu nada — a pintura em si sempre esteve correta. A
  causa raiz só apareceu ao simular de propósito um `mouseup` "perdido":
  fazer um arrasto de verdade e nunca soltar (`page.mouse.up()`), depois
  despachar manualmente `mousemove` com `buttons: 0` (é isso que o
  navegador manda quando o botão real já foi solto em outro lugar).
  **Achado de teste:** a primeira tentativa desse teste "colou" mesmo sem o
  fix, porque trocar de brush usava um `.click()` de verdade do Playwright
  no meio do teste — e um clique é down+up, então o `mouseup` desse clique
  resetava o estado preso por conta própria, mascarando o bug. Corrigido
  despachando o "clique" de troca de brush manualmente (`dispatchEvent`
  direto, sem gerar mouseup real) pra manter o cenário de fato "preso".
- **Fix:** `handleWindowMouseMove` agora confere `e.buttons` logo no
  início — se o botão principal não está mais pressionado (`!== 1`), zera
  `paintingRef`/`lastPaintedCellRef`/`draggingEntityRef` e sai, em vez de
  confiar cegamente em já ter recebido um `mouseup`. Autocorrige o estado
  no primeiro movimento de mouse depois que ele "escapou".
- Verificado: `npx tsc -b`, `npm run build`, `npm run lint`, `npm test`
  (108/108, sem mudança nos testes de unidade — é um bug só de DOM/evento)
  e E2E dedicado (`e2e-stage-drag-stuck.mjs`, verificado tanto que
  reproduz o bug com o fix desligado quanto que passa com ele ligado) +
  regressão dos outros E2E de fase (arrasto normal, entidades, save/reload)
  sem tocar em arquivos reais do usuário. Sem mudança de formato de
  arquivo — não mexe em `DATA_FORMAT.md`, não precisa sincronizar com a
  Anubis.

**Editor de Fases: pintura por arrasto sem buracos (2026-09-21).** Pedido do
usuário: além de clicar, poder arrastar e ir pintando com o tile
selecionado. A pintura por arrasto já existia (`paintingRef`), mas tinha
dois bugs reais: (1) o `mousemove` só estava ligado no próprio `<canvas>`,
então um arrasto rápido que saísse da área do elemento parava de pintar até
voltar; (2) não havia interpolação entre amostras de `mousemove`, então um
arrasto rápido (mouse pulando várias células por evento) deixava buracos na
linha pintada. Corrigido:

- Novo módulo puro `src/lib/tilemap/lineCells.ts` (`cellsOnLine`,
  Bresenham) — dado a célula anterior e a nova, devolve todas as células no
  meio. Testado em `tests/lineCells.test.ts` (6 casos: ponto único,
  horizontal, vertical, diagonal 45°, direção invertida, e um caso de
  "arrasto rápido" checando que nenhuma coluna intermediária fica de fora).
- `StageEditor.tsx`: `paintAt` agora usa `lastPaintedCellRef` +
  `cellsOnLine` pra preencher a linha inteira desde a última célula pintada
  (resetado a cada novo `mousedown`, pra não interpolar a partir de uma
  posição de arrasto anterior). O tracking de mouse pra pintura moveu do
  `onMouseMove` do `<canvas>` pra o mesmo efeito de `window`-level já usado
  pro arrasto de marcador de entidade (`mousemove`/`mouseup` no `window`),
  então agora a pintura continua mesmo se o cursor sair da área do canvas
  durante o arrasto — mesmo padrão, resolve os dois bugs de uma vez.
- **Achado de lint parecido com o de `useImageUpload`:** o efeito de mouse é
  montado uma vez só (deps `[]`) pra não reanexar os listeners a cada
  render, mas `paintAt` fecha sobre estado que muda (`blockSize`,
  `gridCols`, `brushTile`); resolvido com uma ref "sempre atualizada"
  (`paintAtRef`, atualizada num `useEffect` sem deps) — mesmo padrão já
  usado pra `clearResultsRef`.
- Verificado: `npx tsc -b`, `npm run build`, `npm run lint`, `npm test`
  (**108/108**, 6 novos) e E2E Playwright dedicado (arrasto rápido pulando
  8 colunas de uma vez pinta todas sem buraco; pintura continua depois do
  cursor sair da área do canvas; soltar o botão fora do canvas encerra o
  arrasto corretamente) + regressão completa do fluxo de fase (pintar,
  posicionar entidades, salvar, reabrir, remover jogador trava salvar) sem
  tocar em arquivos reais do usuário. Sem mudança de formato de arquivo —
  não mexe em `DATA_FORMAT.md`, não precisa sincronizar com a Anubis.

**Editor de Fases v2 — Fase 1 implementada (2026-09-21): nova tela +
posicionamento de entidades.** Usuário escolheu fasear (recomendação
aceita): tela nova + entidades primeiro, múltiplos tilesets depois.
- **`App.tsx`** ganhou navegação de topo ("Importar" / "Editor de Fases").
  `ImportPreview.tsx` perdeu a opção "Fase" (voltou a só "Personagem"/
  "Cenário"); o upload+validação compartilhado virou um hook
  (`useImageUpload.ts`) usado pelas duas telas. **Achado no processo:**
  a primeira versão manteve as duas páginas sempre montadas (`display:
  none` na inativa) pra não perder o que estava em andamento ao trocar de
  aba — só que isso duplicava o `<input type="file">` no DOM (um por
  página), e um teste automatizado com seletor genérico acabou fazendo
  upload na aba ERRADA (escondida). Corrigido voltando pra renderização
  condicional simples (só a aba ativa fica montada) — mais simples,
  evita essa classe de bug, e trocar de aba resetar o que estava em
  andamento é comportamento padrão de UI com abas.
- **`src/lib/tilemap/entities.ts` + `exportEntities.ts`** (puro):
  `generateEntitiesHeader`/`parseEntitiesHeader` — arrays paralelos (sem
  struct exportada), exatamente o formato combinado com a Anubis (ver
  "Resposta do Prometeus" em `DATA_FORMAT.md` § 4). Achado na
  implementação: 816-tcc não aceita array de tamanho 0, então
  `_ENEMY_COUNT 0` ainda declara 1 elemento de sobra nos arrays (`{ 0 }`),
  nunca lido porque o loop do lado de lá é limitado por `_ENEMY_COUNT`.
- **`enemySlots.ts`** (lista extensível, mesmo padrão de
  `characterSlots.ts`): hoje só `{ id: 'enemy1', typeIndex: 0 }` —
  `typeIndex` sincronizado à mão com o enum `EnemyType` de `enemy.h`.
- **`StageEditor.tsx`** ganhou um modo "Posicionar personagens" (alterna
  com "Pintar blocos" no mesmo canvas): botão "Colocar/mover jogador"
  arma o próximo clique no mapa; "Adicionar inimigo" cria uma instância
  já arrastável, com painel lateral pra tipo (dropdown) e patrulha
  (`minX`/`maxX`, campos numéricos — decisão de escopo: não fiz alças de
  arrastar pra patrulha nesta etapa, pra não alongar mais). "Salvar fase
  no jogo" agora escreve 3 arquivos (`_tilemap.bmp`/`_collision.h`/
  `_entities.h`) e fica bloqueado sem o jogador posicionado.
- **`loadStage.ts`** passou a ler `<base>_entities.h` também (opcional —
  fases salvas antes desta etapa não têm esse arquivo, tratado como
  "nenhuma entidade ainda", não como erro), reconstruindo jogador e
  inimigos ao reabrir uma fase salva.
- **Achado de lint interessante:** extrair `useImageUpload` inicialmente
  fez o oxlint acusar "acessando ref durante o render" e "modificando
  valor de hook" em vários pontos que eram só `onClick={upload.handleX}`
  normais — o oxlint parece tratar qualquer acesso por `objeto.propriedade`
  num objeto retornado de hook customizado como suspeito. Resolvido
  desestruturando o retorno do hook em variáveis locais na chamada (`const
  { image, ... } = useImageUpload(...)` em vez de `const upload =
  useImageUpload(...)` seguido de `upload.image`) — mesmo comportamento,
  lint limpo. Também troquei os setters crus (`setImage`/`setValidation`/
  `setError`) que o hook expunha por métodos (`hydrate`/`reportError`),
  mesmo espírito de `useEngineBuild` (`run`/`reset`) — evita expor
  setState direto pra fora do hook.
- Verificado: `npx tsc -b`, `npm run build`, `npm run lint`, `npm test`
  (**102/102** — 5 casos novos em `entities.test.ts`: round-trip completo,
  o caso de 0 inimigos com o array de sobra, erros em português) e E2E
  Playwright ponta a ponta (navegação nova, opção "Fase" sumiu de
  Importar, posicionar jogador+inimigo, salvar grava os 3 arquivos com os
  valores certos, reabrir reconstrói tudo incluindo patrulha, remover o
  jogador trava "Salvar" de novo) + regressão da aba Importar (galeria do
  `hero` real continua funcionando, slot certo ao reabrir) — sem tocar em
  nenhum arquivo real do usuário (`hero_*`/`enemy1_*`), usando tileset de
  teste descartável, limpo ao final.
- `docs/DATA_FORMAT.md` § 4 atualizado (nova subseção confirmando a
  implementação, ainda 🟡 até o Anubis consumir `_entities.h`) e
  sincronizado com `../jogo-plataforma-snes/docs/DATA_FORMAT.md` + log lá.
- **Ainda não implementado (fica pra próxima etapa, se o usuário quiser):**
  múltiplos tilesets com paleta por bloco.

**Editor de Fases v2 — proposta de formato (2026-09-21):** pedido do usuário: seção própria "Editor de Fases"
(navegação de topo, separada de Importar), múltiplos tilesets por fase
(respeitando os 8 bancos de paleta de BG do hardware), posicionamento de
inimigos (tipo + posição + patrulha) e do spawn do jogador, UI no espírito
Lunar Magic/SMM2. Pedido explícito do usuário: **propor o formato antes de
codar**, e **fasear se ficar grande** — decisão dele, não minha.
- Antes de desenhar do zero, li o `PROGRESS.md`/`DATA_FORMAT.md` da Anubis
  e achei que a sessão de lá **já tinha adiantado uma proposta completa**
  em `docs/DATA_FORMAT.md` § 4 (duas subseções 🟡 novas: paleta por bloco
  pra múltiplos tilesets via os 3 bits de paleta que o `.map` do SNES já
  reserva por célula, e arrays paralelos pra entidades — `type[]`/`x[]`/
  `y[]`/`minX[]`/`maxX[]` em vez de struct exportada, decisão boa: evita
  layout de struct sincronizado a mão entre os dois lados) — e já tinha
  preparado o lado dela (`PlayerSpawn`/`EnemySpawn`/`EnemyType` em
  `main.c`/`enemy.h`) sem mudar nenhum comportamento, esperando o formato
  fechar. Em vez de propor algo independente, respondi os pontos que a
  proposta deles deixou em aberto pro Prometeus decidir (nova subseção
  "Resposta do Prometeus" em § 4):
  - **Tipo de inimigo = lista extensível** (`enemySlots.ts`, mesmo padrão
    de `characterSlots.ts`): `{ id, label, typeIndex }`, com `typeIndex`
    sincronizado à mão com o enum `EnemyType` de `enemy.h` (mesma
    categoria de sincronia manual que `PLAYER_HITBOX_W` já é hoje).
  - **Confirmei o mecanismo de paleta por bloco no código-fonte real do
    `gfx4snes`** (não fiquei só na hipótese deles): em `maps.c`, o banco
    de paleta de cada tile vem do nibble alto do índice de cor do
    primeiro pixel do tile, quando a imagem de origem tem mais de 16
    cores — bate exatamente com a hipótese da Anubis. Ainda não testei
    contra o binário real (a flag exata, tipo `-u 128`, fica por
    confirmar antes de fechar).
  - Nome do arquivo de entidades (`<base>_entities.h`), posição do
    jogador/inimigo como marcadores arrastáveis num modo separado da
    pintura de tile, e a bandeja de tilesets com contador "X/8 bancos de
    paleta em uso" (pedido explícito do usuário, mesmo espírito do
    medidor de espaço de imagem do personagem).
  - Nova tela "Editor de Fases" (navegação de topo) — reorganização de UI,
    não muda nenhum arquivo exportado.
- **Compatibilidade com "editar fase já salva" sinalizada, não resolvida
  ainda:** com múltiplos tilesets, `reconstructStage.ts` provavelmente
  precisa virar "um conjunto sintético por banco de paleta" em vez de um
  só — fica documentado como trabalho futuro, não bloqueia a v2 de
  entidades (que não muda o reload).
- `docs/DATA_FORMAT.md` § 4 atualizado (continua 🟡 nas subseções novas —
  a seção geral permanece 🟢 pelo que já foi fechado na v1) e sincronizado
  com `../jogo-plataforma-snes/docs/DATA_FORMAT.md` + log lá.
- **Nada foi implementado ainda** — só o formato foi proposto/refinado,
  conforme pedido. Ver "Próximo passo" pra recomendação de fase e a
  pergunta que fiz ao usuário sobre como quer dividir o trabalho.
- **Observação à parte, não resolvida por mim:** a Anubis sinalizou (no
  `PROGRESS.md` dela) que `assets/gfx/stage1_tilemap.bmp`/
  `stage1_collision.h` sumiram do disco de novo — o usuário excluiu a
  `stage1` antes de pedir essa v2 (mensagem anterior desta sessão). Isso
  quebra o `make` da engine até o usuário desenhar e salvar uma fase nova
  pelo Editor; não é algo que eu deva resolver sozinho (é conteúdo dele),
  só reforçando que fica pendente.

**Editar fase já salva + seção 4 fechada como 🟢 (2026-09-21):** usuário
excluiu a `stage1` sem querer e pediu a função de editar fase salva, que
ainda não existia (na etapa anterior eu tinha só implementado "mostrar +
excluir", porque reabrir pra editar parecia exigir mudar o formato
exportado). Descobri que não precisa: dá pra reconstruir sem sidecar novo.
- **`src/lib/tilemap/reconstructStage.ts`** (novo, puro):
  `parseCollisionHeader` (inverso de `generateCollisionHeader`) +
  `reconstructStage(tilemapBmp, collisionHeaderText, baseName)` —
  deduplica os tiles 8×8 ÚNICOS da própria imagem já composta (a
  `<base>_tilemap.bmp` exportada), monta um conjunto de blocos sintético
  com eles, e resolve a colisão de cada tile reconstruído a partir da
  célula correspondente no array de colisão já resolvido
  (`<base>_collision.h`). Garantia forte testada: `composeLevel` do
  conjunto+grade reconstruídos reproduz **pixel a pixel** a mesma imagem
  final do original, pros três tamanhos de bloco (8/16/32) usados na
  pintura original — só essa granularidade de pintura (não o layout) se
  perde no reload, sempre volta em blocos de 8×8. Limite de segurança:
  lança erro em português se a fase tiver mais de 256 blocos únicos de
  8×8 (o índice de bloco é `Uint8Array`, só vai até 255).
- **`loadStage.ts`** (novo, browser): a parte com fetch/canvas — lê os 2
  arquivos, chama `reconstructStage`, monta uma imagem PNG sintética e
  passa pelo MESMO `validateForExport` de um upload normal. Extraí
  `indicesToPngDataUrl`/`decodeImageData` de `loadCharacter.ts` pra um
  módulo compartilhado novo (`src/lib/synthesizeImage.ts`), já que agora
  os dois fluxos (personagem e fase) precisam exatamente da mesma lógica.
- **UI:** `SavedStage.tsx` ganhou o botão "Editar" (antes só tinha
  "Excluir"); `StageEditor.tsx` ganhou `seed?: StageSeed` (hidrata
  `grid`/`tileCollision` do reload) e mostra um aviso "Reabrindo a fase
  que já estava salva..." quando aplicável.
- **Achado ao testar (bug real, não do reload):** ao excluir a fase
  antiga, sobraram órfãos `stage1_tilemap.inc`/`stage1_tilemap_data.as`
  em disco — a lista de arquivos que o "Excluir" apaga
  (`STAGE_FILE_NAMES`) tinha sido copiada da v1 sem incluir os dois
  arquivos que o build da Anubis passou a gerar depois (mesmo esquema de
  `hero`/`enemy1`: `.inc`/`_data.as` do embutimento em assembly).
  Corrigido; os órfãos que já existiam em disco foram apagados também.
- **[DATA] Seção 4 do `DATA_FORMAT.md` fechada como 🟢:** mesmo critério
  das seções 1 e 3 — a Anubis já confirmou consumindo uma `stage1` real
  (`docs/PROGRESS.md` dela: `tilemap.c` reescrito, Makefile com a regra
  `-m`, build linkando a ROM com a fase de verdade, não mais o teste
  hardcoded). Atualizado e sincronizado com
  `../jogo-plataforma-snes/docs/DATA_FORMAT.md` + log lá.
- Verificado: `npx tsc -b`, `npm run build`, `npm run lint`, `npm test`
  (**98/98** — 6 casos novos: round-trip de `parseCollisionHeader`, e
  `reconstructStage` pros 3 tamanhos de bloco com verificação pixel a
  pixel + o limite de 256 blocos) e E2E Playwright ponta a ponta: criar
  uma fase de teste, salvar, limpar a tela, "Editar" na galeria, confirmar
  que o canvas reaberto é pixel-a-pixel idêntico ao que foi pintado antes
  de salvar, excluir e confirmar que TODOS os arquivos (inclusive os
  `.inc`/`.as` que antes ficavam órfãos) somem. Zero erros de console.

**Seção "Fase já salva" (2026-09-21):** usuário notou que uma fase salva
(`stage1_tilemap.bmp`/`stage1_collision.h`, confirmados existentes em
disco) não aparecia em lugar nenhum ao reabrir o Editor — só a galeria de
personagens existia. Diferente de personagem, os arquivos exportados da
fase (a imagem já composta + a colisão já resolvida) **não guardam qual
bloco do conjunto original foi usado em cada célula**, então não dá pra
reconstruir a pintura e reabrir pra editar como o personagem faz. Perguntei
ao usuário o escopo e ele confirmou a opção mais simples: só mostrar que
existe + permitir excluir, sem "Editar".
- **`stageDiscovery.ts`** (novo, puro): `stageExists(files)` — true quando
  `stage1_tilemap.bmp` E `stage1_collision.h` estão os dois presentes
  (mesmo espírito de `characterDiscovery.ts`, bem mais simples porque só
  existe uma fase possível hoje). `STAGE_BASE_NAME` foi movido de dentro
  de `StageEditor.tsx` pra `lib/tilemap/types.ts`, já que agora duas
  partes da UI precisam dele.
- **`SavedStage.tsx`** (novo componente): mostra "Fase já salva", uma
  prévia e um botão "Excluir". A prévia é só o `<img>` apontando pro
  `stage1_tilemap.bmp` de verdade (via `URL.createObjectURL` — diferente
  do personagem, aqui não precisa reconstruir nada por canvas: o arquivo
  exportado já É a imagem completa da fase, o navegador decodifica BMP
  nativamente). "Excluir" pede confirmação e apaga os dois arquivos (+
  `.pic`/`.pal`/`.map` derivados, se existirem).
- **`ImportPreview.tsx`:** `refreshCharacters` virou `refreshSavedAssets`
  (agora atualiza personagens E o status da fase a partir da MESMA
  listagem de arquivos, sem fetch duplicado); `StageEditor` ganhou
  `onSaved`, chamado depois de salvar com sucesso pra atualizar a seção na
  hora, sem precisar recarregar a página.
- **Achado ao testar:** o endpoint de apagar arquivo (`vite-gfx-files.ts`)
  tinha uma lista de extensões permitidas pensada só pra personagem
  (`bmp/h/pic/pal/inc/as`) — não incluía `.map`, que é exatamente o que o
  `gfx4snes -m` vai gerar pra fase (documentado em `DATA_FORMAT.md` § 4
  desde a v1). Tentar apagar um `.map` batia num 400 (inofensivo hoje
  porque o arquivo nem existe ainda do lado da engine, mas apareceria como
  erro de console). Adicionado `map` à lista de extensões permitidas
  (`READABLE_FILE_PATTERN`); teste antigo que checava `.map` como
  "rejeitado" foi atualizado pra checar o contrário.
- Verificado: `npx tsc -b`, `npm run build`, `npm run lint`, `npm test`
  (**94/94** — 3 casos novos em `stageDiscovery.test.ts`, mais o teste de
  `isReadableGfxFileName` atualizado) e E2E Playwright contra a fase
  **real** do usuário: seção aparece ao abrir, prévia carrega como `<img>`
  de verdade (256×256, a resolução real da fase composta), excluir apaga
  os dois arquivos de fato — feito com backup/restauração dos arquivos
  reais (únicos existentes hoje), restaurados byte a byte ao final. Nenhum
  formato de arquivo mudou (`docs/DATA_FORMAT.md` intacto) — é só a lista
  de extensões que o servidor local aceita apagar, e uma tela nova pra
  mostrar o que já existe.

**Tamanho de bloco configurável no editor de fase (2026-09-20):** usuário
perguntou "e se meus tiles tiverem 16x16 de tamanho? da pra colocar essa
opção?" logo depois do editor de fase v1 (abaixo) ficar pronto. O hardware
de BG do SNES só entende tile de 8×8 de verdade (isso não muda), mas dava
pra deixar o usuário PINTAR em blocos maiores (16×16, 32×32) quando o
conjunto de imagens dele já foi desenhado assim — cada bloco maior vira
vários tiles de 8×8 por baixo na hora de exportar, sem o usuário precisar
pensar nisso.
- Generalizei `src/lib/tilemap/` (que na v1 só suportava 8×8 fixo) pra
  aceitar qualquer `StageBlockSize` de `[8, 16, 32]`: `Tileset` ganhou o
  campo `blockSize`, `buildTileset`/`tilePixels` usam esse valor em vez da
  constante fixa antiga, `composeLevel` monta a mesma imagem física de
  256×256 não importa o bloco (só muda a granularidade da grade de
  pintura). A parte mais delicada foi `generateCollisionHeader`: o array
  de colisão exportado pra engine **precisa continuar fixo em 32×32
  tiles de 8×8** (é o que `tilemapData` da engine espera, independente de
  como o usuário pintou) — então um bloco de 16×16 marcado sólido numa
  célula do grid de pintura precisa expandir pra um quadrado 2×2 de "1" no
  array de hardware final (`repeat = blockSize / 8`).
- **UI:** `StageEditor.tsx` ganhou um seletor "Tamanho de cada bloco" que
  só aparece quando a imagem importada permite mais de um tamanho (ex.:
  uma imagem 64×32 permite 8, 16 E 32; uma 24×16 só permite 8). Trocar o
  tamanho reseta a colisão e a pintura em andamento — os índices de um
  tileset não fazem sentido pro outro.
- Verificado: `npx tsc -b`, `npm run build`, `npm run lint`, `npm test`
  (**91/91** — os 5 casos de `tilemap.test.ts` viraram testes
  parametrizados rodando pra 8/16/32px, mais 2 casos novos específicos de
  16×16: colisão expandindo pro quadrado 2×2 certo, tabela vazia sem
  lançar) e 2 E2E Playwright: um repetindo o fluxo original (8×8, sem
  regressão) e outro com um tileset sintético 16×16 (gerado na hora via
  canvas) confirmando o seletor aparecendo com as 3 opções, a troca pra
  16×16 recalculando o conjunto de blocos (32 → 8 blocos numa imagem de
  64×32) e o `.h` de colisão final batendo exatamente com a expansão 2×2
  esperada. **Achado nos meus próprios testes (não da aplicação):** o
  primeiro E2E de 16×16 falhou porque o canvas de pintura ficou fora da
  viewport configurada no script (1400px de altura não bastava mais com o
  seletor novo ocupando espaço) — `page.mouse.click` não rola a página
  sozinho como `locator.click()` faz, então o clique caiu fora do
  elemento; corrigido aumentando a viewport e chamando
  `scrollIntoViewIfNeeded()` antes de clicar, nos dois scripts de teste.
  `docs/DATA_FORMAT.md` § 4 atualizado com a generalização, copiado pro
  `../jogo-plataforma-snes/docs/DATA_FORMAT.md` + log lá — a seção
  continua 🟡 (mesma pendência de antes: falta o Anubis consumir os
  arquivos reais).

**Editor de fase v1 (2026-09-20):** pedido do usuário ("vamos começar
planejando o item 2" — o editor de tilemap era o maior item pendente do
escopo original do projeto). Antes de implementar, perguntei 4 coisas pra
fechar o desenho (todas respondidas com a opção recomendada):
1. **Colisão por tabela de índice de tile** (não uma camada separada por
   célula) — o usuário marca uma vez, por tile do conjunto de blocos, se é
   vazio/sólido/bandeira; pintar o mapa só escolhe qual tile vai em cada
   célula, a colisão sai automática da tabela.
2. **Escopo v1 = só tilemap + colisão** — posicionamento de entidades
   (jogador, inimigo) fica de fora, continua hardcoded no `main.c` do
   Anubis por enquanto.
3. **Tamanho fixo: 32×32 tiles, uma tela, sem scroll** — bate exatamente
   com o que a engine já suporta hoje.
4. **Tileset reaproveita o fluxo de "Cenário"** — a mesma validação de
   imagem (múltiplo de 8, ≤16 cores) já existente vira a fonte dos blocos.

- **`src/lib/tilemap/`** (novo, puro): `types.ts` (`STAGE_TILE_SIZE = 8`
  fixo — é o tile de BG nativo do SNES, não configurável como o frame do
  personagem; `STAGE_GRID_COLS/ROWS = 32`; `CollisionKind` = vazio/sólido/
  bandeira, mesma convenção 0/1/2 que `tilemapBuildTestLevel()` já usa em
  `src/tilemap.c` do Anubis), `tileset.ts` (`buildTileset` fatia a imagem
  em blocos 8×8 em ordem raster, sem pivô/dedup — background não precisa
  disso), `compose.ts` (`composeLevel` monta a imagem completa da fase,
  256×256px, a partir da grade de índices de tile — o `gfx4snes -m` do
  lado da engine é quem vai deduplicar tiles repetidos, não fazemos isso
  aqui), `exportTilemap.ts` (`generateCollisionHeader` resolve, célula a
  célula, a colisão a partir da tabela por tile — puro dado C estático,
  sem parser, mesmo padrão dos outros exports desta tela).
- **`StageEditor.tsx`** (novo componente, terceira opção em "O que é essa
  imagem?": "Fase (usar os blocos dessa imagem pra desenhar o mapa)"):
  passo 1 mostra cada bloco do conjunto com um clique que cicla
  vazio/sólido (contorno verde)/bandeira (contorno vermelho); passo 2
  deixa escolher um bloco (pincel) e pintar um canvas de 512×512px (32×32
  células de 16px) por clique ou arrasto — o canvas desenha a composição
  real (`composeLevel` → `composedToRgba`, o mesmo helper que a prévia do
  personagem já usa), então a pintura já é a prévia. Salva
  `stage1_tilemap.bmp` (a fase composta) + `stage1_collision.h` (array
  32×32) e roda o build automático, igual às outras telas.
- **Nome de base fixo `stage1`, sem seletor de slot:** só existe 1 fase na
  v1 (`docs/GDD.md` § 5), então um dropdown de 1 opção não teria função —
  decisão consciente de NÃO repetir o padrão `characterSlots.ts` aqui
  ainda (documentado em `DATA_FORMAT.md` § 4 que o mesmo mecanismo dá pra
  crescer quando existir uma 2ª fase de verdade).
- **Fora de escopo por ora** (documentado): editar uma fase já salva (sem
  galeria/reload, sempre começa do zero — diferente do personagem);
  posicionamento de entidades; fases maiores que uma tela/scroll; múltiplas
  camadas de BG.
- Verificado: `npx tsc -b`, `npm run build`, `npm run lint`, `npm test`
  (**84/84** — 5 casos novos em `tilemap.test.ts`: fatiamento em blocos
  8×8 com rejeição de dimensão não múltipla de 8, pixels de um bloco sem
  misturar vizinhos, composição da fase célula a célula no lugar certo,
  colisão resolvida pela tabela por tile — não por valor fixo por célula
  — inclusive com tabela vazia sem lançar) e E2E Playwright com um
  conjunto sintético de 8 blocos de cores distintas (gerado na hora via
  canvas do navegador): 8 blocos detectados numa imagem 32×16; marcar 1
  bloco sólido e outro bandeira reflete no contorno certo e no resumo
  ("1 bloco(s) sólido(s), 1 bandeira(s)"); pintar por clique e por
  arrasto confirmado pixel a pixel no canvas; arquivos salvos de verdade
  em `assets/gfx/`, com o `.h` de colisão batendo exatamente com o que foi
  pintado (células com o bloco marcado sólido saem `1`, célula nunca
  pintada sai `0`); zero erros de console. `docs/DATA_FORMAT.md` § 4
  atualizado com todas as decisões acima, copiado pro
  `../jogo-plataforma-snes/docs/DATA_FORMAT.md` + log lá — segue 🟡 (falta
  o Anubis consumir os arquivos reais e a regra de Makefile COM `-m` pra
  `*_tilemap.bmp`, diferente da regra SEM `-m` que a seção 3 já usa pro
  `*_tiles.bmp` do personagem).

**[DATA] Seção 3 do `DATA_FORMAT.md` fechada como 🟢 (2026-09-20):**
housekeeping puro, sem código novo — pedido do usuário depois de eu
apontar que a seção ainda dizia "🟡, falta a engine consumir de verdade",
o que já não era mais verdade (confirmado nas duas etapas anteriores: o
Anubis consome `hero_*` e `enemy1_*` reais, com o `make` passando).
Atualizado o status + uma entrada no "Histórico de decisões", copiado pro
`../jogo-plataforma-snes/docs/DATA_FORMAT.md` + log lá também. Ao revisar
achei outro trecho desatualizado na mesma seção: dizia que a hitbox do
`hero` ainda era hardcoded em `player.h` — mas o Anubis já tinha trocado
isso pelo valor real exportado (`HERO_HITBOX_W/H`) numa etapa anterior
(só o espelho `PLAYER_HITBOX_W/H`, usado por `enemy.c`/`main.c`, continua
manual). Corrigido também. Pendências residuais que continuam de verdade:
sprite do jogador ainda 8x8, só 1 tipo de inimigo instanciado.

**Miniatura na galeria de personagens salvos (2026-09-20):** item pendente
fechado (ver "Próximo passo" antigo item 2) — pedido do usuário: mostrar o
quadro 0 de cada personagem ao lado do nome em "Personagens já salvos",
sem precisar abrir cada um pra saber qual é qual. Confirmado o
codinome dos dois projetos no CLAUDE.md deste (Prometeus): este editor =
**Prometeus**, `../jogo-plataforma-snes` = **Anubis** — usando os dois daqui
pra frente onde fizer sentido.
- **Abordagem (verificada no código antes de assumir, como o pedido
  sugeriu):** a rota óbvia seria reaproveitar `loadCharacterProject`
  (usado pelo "Editar") direto, mas ela monta a imagem sintética com
  TODOS os quadros, faz um round-trip por `<canvas>`→PNG dataURL→decode, e
  roda o `validateForExport` inteiro — caro demais pra só pegar 1 quadro
  de cada personagem da lista. Em vez disso, `src/lib/metasprite/
  importProject.ts` (puro, sem DOM) ganhou `reconstructThumbnail(tilesBmp,
  metaspritesHeader, baseName)`: decodifica o `.bmp`, faz parse do `.h`,
  pega só `frames[0]` e chama o já existente `reconstructFramePixels` —
  lança erro em português (`"<base>" não tem nenhum quadro...`) se não
  houver nenhum quadro. `loadCharacter.ts` ganhou `loadCharacterThumbnail`
  (a parte com DOM/fetch: lê os 2 arquivos, chama a função pura acima,
  e usa `composedToRgba` — o MESMO helper que a prévia ao vivo usa, como
  sugerido — pra virar RGBA).
- **`CharacterThumbnail.tsx`** (novo componente): busca a miniatura no
  `useEffect` (padrão "cancelled flag" já usado no mount de
  `ImportPreview.tsx`, não async-direto, por causa do lint
  `set-state-in-effect`); desenha num `<canvas>` pequeno com upscale
  nearest-neighbor (mesmo padrão de escala do `FrameThumb` em
  `AnimationSequencer.tsx`: canvas offscreen 1:1 → `putImageData` →
  `drawImage` escalado com `imageSmoothingEnabled = false`). Três estados:
  carregando (canvas vazio, tamanho reservado por CSS — não pisca/pula
  layout), pronto (canvas desenhado) e erro (cai num `<span>` placeholder
  cinza, mesmo tamanho — a linha continua com nome/"Editar"/"Excluir"
  funcionando normal). Carregamento é por linha, em paralelo, sem travar a
  lista (cada `CharacterThumbnail` busca a sua independente).
- **CSS:** `.character-thumb` (40×40px, `image-rendering: pixelated`,
  fundo quadriculado igual ao resto do editor pra pixel transparente ficar
  visível) e `.character-thumb-placeholder` (caixa neutra do tamanho do
  token `--border`).
- **Fora do escopo** (conforme o pedido): editar a miniatura, mudar a
  ordenação da galeria, `docs/DATA_FORMAT.md` (nenhum formato de arquivo
  muda — é só leitura do que já existe).
- Verificado: `npx tsc -b` (achou e corrigiu um problema de tipos do TS
  6.0 — `Uint8ClampedArray` sem o genérico pinado em `<ArrayBuffer>` não
  bate com o construtor de `ImageData`; `composedToRgba`/
  `loadCharacterThumbnail` tiveram a assinatura ajustada), `npm run
  build`, `npm run lint`, `npm test` (**79/79** — 3 casos novos em
  `importProject.test.ts`: round-trip pixel a pixel do quadro 0 contra o
  export real em várias dimensões, header sem nenhum quadro lança erro
  citando o nome, header corrompido propaga o erro em vez de devolver
  lixo). E2E Playwright contra os personagens REAIS do usuário: **hero**
  (miniatura desenhada, canvas com tamanho > 0, sem cair no placeholder) e
  **enemy1** (idem — nesse meio-tempo o usuário terminou de salvar o
  personagem do "Inimigo" pela tela, então o build da Anubis, que estava
  quebrado na etapa anterior, **já está passando de novo**, confirmado
  rodando `make` direto); e um caso de erro simulado (personagem descartável
  `zztest_thumb_*`, escrito direto no disco com um `.h` corrompido de
  propósito, fora do fluxo normal de slots — hoje só hero/enemy1 têm
  seletor — pra forçar o cenário de reconstrução falhando): aparece na
  galeria, cai no placeholder, e "Editar"/"Excluir" continuam visíveis e
  funcionando; zero erros de console não tratados nos dois testes. Nenhum
  arquivo real do usuário foi tocado (só leitura); o personagem de teste
  foi apagado ao final.

**Correção — build da engine quebrava se você salvasse animação antes do
personagem (2026-09-20):** usuário relatou: excluiu o "Inimigo", tentou criar
outro, e o build automático falhou com `make[1]: *** No rule to make target
'../assets/gfx/enemy1_tiles.pic', needed by 'gfxassets'.` **Causa raiz:**
a engine já tinha adicionado `enemy1_tiles.pic` como dependência
INCONDICIONAL de `gfxassets` no `build/Makefile` (mesmo tratamento que
`hero_tiles.pic` já recebia), antecipando este slot — mas o usuário clicou
em "Salvar animações no jogo" (grava só `enemy1_anim.h`) antes de "Salvar
personagem no jogo" (grava `enemy1_tiles.bmp`/`_metasprites.h`), então o
`.bmp` que o `gfx4snes` precisaria converter nunca existiu, e o `make`
falha até pra qualquer save (não só o do inimigo) — confirmado no disco:
`assets/gfx/enemy1_anim.h` existia (com `walk`/`idle` reais, de
`goombateste.png`) mas `enemy1_tiles.bmp`/`_metasprites.h` não. Esse risco
já existia em teoria pro `hero` também (só nunca aconteceu na prática
porque `hero_tiles.bmp` sempre existiu). **Correção:**
`AnimationSequencer` ganhou uma prop `sheetSaved` (calculada em
`SpriteSheetEditor` como `characters.some(c => c.baseName === baseName) ||
"salvei agora nesta sessão"`) — enquanto o desenho do personagem ainda não
foi salvo pelo menos uma vez, "Salvar animações no jogo" fica desabilitado
com o aviso "Salve o personagem primeiro...". **Bug relacionado encontrado
ao investigar:** reabrir um personagem salvo num slot que não é o padrão
(ex.: editar "enemy1" pela galeria) resetava o seletor "Isso é o: ▾" de
volta pra "Personagem principal" — clicar "Salvar personagem no jogo" sem
notar isso teria sobrescrito o `hero` real com os dados do inimigo!
Corrigido: `ProjectSeed` ganhou `baseName`, e `SpriteSheetEditor` inicializa
`slotId` a partir dele (`seed?.baseName ?? DEFAULT_CHARACTER_SLOT_ID`) em
vez de sempre assumir o padrão. Também endurecido `handleDeleteCharacter`
(`ImportPreview.tsx`) pra sempre tentar apagar `<base>_anim.h` ao excluir
(apagar um arquivo ausente não é erro), evitando um `_anim.h` órfão pra
trás se a lista da galeria estiver momentaneamente desatualizada; e trocada
a checagem "excluir isso deve limpar a tela?" de uma constante fixa
(`DEFAULT_CHARACTER_SLOT_ID`) por um `editingSlotId` espelhado via callback
(`onSlotChange`) do slot de fato selecionado no editor. Verificado:
`tsc -b`/`build`/`lint`/`npm test` (76/76) e E2E Playwright reproduzindo o
bug exato do usuário (animação sem sheet salvo → bloqueado; sheet salvo →
libera; reabrir "enemy1" da galeria mantém o slot certo) — feito com
backup/restauração do `enemy1_anim.h` real do usuário (único arquivo real
que existia pro slot `enemy1` no momento), restaurado byte a byte ao final.
**Ação sugerida pro usuário:** reabra a criação do "Inimigo" (mesma imagem
`goombateste.png`, quadro 16×16) e desta vez clique em "Salvar personagem
no jogo" primeiro — isso recria `enemy1_tiles.bmp`/`_metasprites.h` e o
`enemy1_anim.h` que já existe (com `walk`/`idle`) deve voltar a bater com o
sheet, sem precisar redigitar as animações. **Confirmado direto com `make`
na pasta `build/` (sem passar pelo Prometeus) que o build da engine está
QUEBRADO agora mesmo** por esse motivo — `enemy1_tiles.bmp` não existe em
`assets/gfx/`, e é uma dependência incondicional de `gfxassets` no
Makefile deles. Não fabriquei um sprite de inimigo placeholder pra
"resolver" isso por conta própria (é uma decisão de conteúdo do usuário,
e não tenho o `goombateste.png` original — não está em nenhum dos dois
projetos) — fica pro usuário terminar esse salvamento pelo Prometeus.

**Slot "Inimigo" (2026-09-20):** pedido do usuário — "hora de criar o
inimigo... já tem uma caixa de pergunta que pergunta o que é isso, mas a
única opção é player, então adicione inimigo". `characterSlots.ts` ganhou
`{ id: 'enemy1', label: 'Inimigo', requiredAnimationNames: ['walk'] }` ao
lado do `hero`; o seletor "Isso é o: ▾" no editor de personagem agora
mostra as duas opções. **Correção sobre o valor de `requiredAnimationNames`:**
na primeira versão desta etapa eu deixei `[]` (achando que a engine ainda
não tinha um contrato pro inimigo, ver `jogo-plataforma-snes/docs/
PROGRESS.md` item 4 antigo) — mas a sessão da engine sincronizou
`docs/DATA_FORMAT.md` § 3 "Slots de inimigo" logo depois confirmando que
ela **já consome `enemy1_*` de verdade** (`src/enemy.c`) e que **só
`enemy1_anim_walk` é referenciado no código** (o inimigo de patrulha nunca
para, `idle` fica exportada mas sem uso — esperado, não é erro). Corrigido
pra `['walk']` antes de fechar a etapa. `CharacterSlot.requiredAnimationNames`
virou um campo por slot (antes era a constante única `REQUIRED_ANIMATION_NAMES`
usada direto): `AnimationSequencer` recebe essa lista como prop, calcula
`missingRequired` a partir dela (não mais fixo em 5), e o texto lida com
singular/plural (1 → "animação fixa"/"ela precisa"/"A animação obrigatória
já existe"; N → "animações fixas"/"todas precisam"/"As N ... já existem").
Os chips de nome sugerido (`idle/walk/run/jump/fall`) aparecem sempre pra
qualquer slot, mas só os que estão em `requiredAnimationNames` ganham um
`*` (marcador visual de obrigatório) — antes a lista de chips era filtrada
pra só mostrar os obrigatórios, o que teria escondido `idle` como opção
pro inimigo (ele é válido, só não obrigatório). Salvar com o slot
`Inimigo` selecionado grava `enemy1_tiles.bmp`/`enemy1_metasprites.h` (e
`_anim.h` se houver animação), nunca `hero_*` — os dois slots convivem na
galeria independentemente. Verificado: `npx tsc -b`, `npm run build`, `npm
run lint`, `npm test` (76/76, incluindo `characterSlots.test.ts` cobrindo
`['walk']`) e dois E2E Playwright: um confirmando o seletor/export básico
(sheet descartável, arquivos de teste apagados ao final, `hero_*` real
intocado) e outro confirmando o contrato real (`walk` sozinha bloqueia até
existir, independente de `idle` estar presente ou não; texto no singular
"1 animação fixa"; chip "walk (andando)\*" com o marcador, "idle (parado)"
sem) — feito com backup/restauração do `enemy1_anim.h` real do usuário
(único arquivo real do slot no momento), restaurado byte a byte ao final
nas duas rodadas.

**Slot fixo do personagem principal + animações obrigatórias (2026-09-20):**
pedido da sessão da engine (`docs/DATA_FORMAT.md` § 3 "Slot do personagem
principal") — o `player.c` da engine agora procura sempre por `hero_*`, não
pelo nome do arquivo que o usuário importou. Implementado:
- **`characterSlots.ts`** (novo, puro): `CHARACTER_SLOTS` (hoje só
  `{ id: 'hero', label: 'Personagem principal' }`) e
  `DEFAULT_CHARACTER_SLOT_ID`. Modelado como lista de opções (não uma
  constante enterrada) por sugestão do próprio usuário, pensando num editor
  de inimigo/fase futuro com múltiplos slots (ex.: `enemy1`) — hoje só existe
  a opção principal, mas trocar exige só adicionar um item na lista.
- **`SpriteSheetEditor.tsx`:** novo seletor "Isso é o: [Personagem
  principal ▾]" antes do passo 1, com aviso explícito de que salvar
  sobrescreve `hero_*` "não importa o nome do arquivo importado". `baseName`
  deixou de vir de `toBaseIdentifier(image.fileName)` (função removida, sem
  mais uso) e passou a ser o `slotId` escolhido — hoje sempre `hero`. Esse
  `baseName` é repassado para `AnimationSequencer` (que antes derivava o seu
  próprio, separadamente, do nome do arquivo — os dois podiam divergir).
- **Fluxo de Cenário não muda:** continua exportando com o nome do arquivo
  importado (é um export separado, por design — confirmado no pedido do
  usuário desta etapa).
- **`animationSequence.ts`:** `REQUIRED_ANIMATION_NAMES` (mesmos 5 nomes de
  `SUGGESTED_ANIMATION_NAMES`, uma só fonte de verdade) — o `player.c` inclui
  o `_anim.h` gerado em tempo de **compilação** (não é um parser em tempo de
  execução), então faltar qualquer uma das 5 quebra o link do lado da
  engine. `AnimationSequencer.tsx` calcula `missingRequired` e: mostra
  "Faltam N animação(ões) obrigatória(s): ..." ou "As 5 animações
  obrigatórias já existem — pode salvar."; desabilita "Salvar animações no
  jogo" (com tooltip listando o que falta) enquanto faltar alguma. Repetir o
  frame de outra animação (ex.: usar o quadro 0 de `idle` também em `fall`)
  é aceito como placeholder — a UI não exige pose própria por animação.
- **`ImportPreview.tsx`:** `handleDeleteCharacter` agora só limpa a edição
  em andamento quando o personagem excluído é o slot atualmente aberto
  (`baseName === DEFAULT_CHARACTER_SLOT_ID`), não mais por comparação com o
  nome do arquivo (que não existe mais como base).
- **Personagens antigos/com outro nome continuam** visíveis/editáveis/
  excluíveis na galeria (a leitura não mudou) — só o *salvar* que agora
  sempre grava em `hero_*`, então reabrir um personagem antigo e salvar
  "migra" seu conteúdo para o slot principal.

**Galeria de personagens salvos (2026-09-20):** pedido do usuário — "ao abrir
já carregue os sprites que temos, pra eu editar ou excluir". Ao abrir a tela
(antes de qualquer upload), o Prometeus lista os personagens já exportados em
`assets/gfx/` da engine e mostra cada um com "Editar"/"Excluir". Não existe
um formato de "projeto" à parte — carregar de volta é o **inverso exato** do
export: reconstrói o personagem a partir dos próprios arquivos que a engine
já consome (`<base>_tiles.bmp` + `<base>_metasprites.h`, e `<base>_anim.h`
se existir). Decisão importante: não inventar um sidecar (tipo
`_project.json`) — os arquivos-contrato já são a única fonte de verdade,
então não tem como os dois lados desincronizarem, e personagens salvos
*antes* dessa funcionalidade existir (como o `hero` real do usuário) já
aparecem na galeria sem precisar reexportar nada.

- **`src/lib/metasprite/importProject.ts`** (puro): `decodeIndexedBmp`
  (inverso de `encodeIndexedBmp`), `parseMetaspriteHeader` (inverso de
  `generateMetaspriteHeader` — regex sobre o `.h`, recupera frame
  width/height, hitbox, paleta OBJ a partir do byte de flags da 1ª peça, e
  pivô+peças por quadro), `parseAnimationHeader` (inverso de
  `generateAnimationHeader`), `reconstructFramePixels` (desenha um quadro a
  partir das peças + tiles — o inverso do fatiamento: `srcX = pivô.x + dx`)
  e `buildSyntheticSheet` (reflui os quadros reconstruídos numa imagem em
  grade de 1 linha — não precisa bater com o layout do sheet original, só a
  ORDEM dos índices de frame importa, e essa vem da tabela do header).
- **Achado real ao testar contra o `hero` de verdade:** o `hero_metasprites.h`
  em disco é de *antes* da hitbox existir (sem `_HITBOX_W/H`) — o parser
  **não lança** nesse caso (`hitbox: null`), e `loadCharacter.ts` calcula a
  mesma sugestão automática que um upload novo receberia
  (`defaultHitbox`). Sem esse fallback, "Editar" no personagem real do
  usuário quebraria.
- **`loadCharacter.ts`** (browser): junta o reconstruído numa imagem PNG
  sintética (canvas) e passa pelo **mesmo** `validateForExport` de um
  upload normal — garante índices/paleta consistentes sem duplicar lógica
  de validação. Devolve também um `ProjectSeed` (frame, paleta OBJ, pivô
  por quadro, hitbox, animações) que `SpriteSheetEditor` usa pra inicializar
  o estado (em vez dos padrões) quando `seed` é passado.
- **Servidor:** `vite-gfx-files.ts` (puro, testável com diretório temp) +
  3 rotas novas em `vite-export-gfx-plugin.ts`: `GET /api/gfx-list` (lista
  `assets/gfx/`), `GET /api/gfx-file?name=` (lê um arquivo — `.bmp/.h` do
  Prometeus + `.pic/.pal/.inc/.as` derivados pelo gfx4snes), `DELETE
  /api/gfx-file?name=` (apaga um arquivo; ausente não é erro). Mesma
  checagem de origem dos outros endpoints (`isSameOrigin`) e mesma defesa
  contra path traversal (`basename(name) === name`).
- **`characterDiscovery.ts`** (puro): um personagem existe quando há
  `<base>_metasprites.h` **e** `<base>_tiles.bmp` juntos (sem os dois não
  dá pra reconstruir — assim `test_sprite.*`/cenários soltos nunca
  aparecem); `hasAnim` reflete se `<base>_anim.h` existe; lista ordenada
  pelo mais editado primeiro (maior mtime entre os arquivos do personagem).
- **UI:** `SavedCharacters.tsx` (lista simples, sem miniatura — ver "fora do
  escopo" abaixo). "Excluir" pede confirmação (`window.confirm`, cita o
  nome) e apaga os arquivos do Prometeus + os derivados do gfx4snes; se o
  personagem excluído era o que estava aberto na tela, limpa a edição.
  Salvar (personagem ou só animações) chama `onSaved()`, que atualiza a
  galeria **sem precisar recarregar a página** — testado: um personagem
  novo aparece na lista imediatamente após salvar.
- **Fora do escopo desta etapa:** miniatura visual de cada personagem na
  galeria (só o nome + "com animação"); qualquer coisa envolvendo o "slot
  fixo `hero`" que a sessão da engine propôs em `docs/DATA_FORMAT.md` §
  "Slot do personagem principal" (exportar sempre como `hero_*` em vez do
  nome do arquivo importado) — pendente, ver "Próximo passo".

Uma tela só agora: **Importar / Preview** (`src/features/import-preview/`)
— upload de imagem local, preview com fundo de transparência (checkerboard),
metadados (nome, dimensões, tamanho), **validação** (dimensões múltiplas de
8px; contagem de cores únicas ≤16, sem quantização automática — rejeita e
orienta reduzir a paleta num editor externo) e, se a imagem passar, **export
real**: `.bmp` indexado 8bpp de verdade (header + paleta BGR0 + pixels
bottom-up com padding de linha em múltiplo de 4 bytes).

O export **não baixa mais pelo navegador** — o botão "Salvar em assets/gfx/"
manda os bytes pra um endpoint (`POST /api/export-gfx`) rodando no próprio
Vite dev server (`vite-export-gfx-plugin.ts`), que escreve o arquivo direto
em `../jogo-plataforma-snes/assets/gfx/`. Isso fecha a parte 1/3 do fluxo
"salvar já altera a ROM" da seção 6 do `docs/DATA_FORMAT.md`. Só funciona
com `npm run dev` rodando (o plugin usa `configureServer`, que não roda em
`vite build`/`vite preview`); a tela mostra erro claro se o endpoint não
responder. Rodar `make` automaticamente depois de escrever (parte 2/3) e
avisar quando a ROM ficar pronta (parte 3/3, já quase de graça já que a
resposta HTTP do POST poderia carregar isso) ficaram de fora de propósito
nesta etapa.

A tela "Exportar teste" (JSON placeholder, `src/features/export-test/`) foi
**removida** — sua única função (provar que o pipeline de export funciona
ponta a ponta) foi superada pelo export real acima. `src/types/exportManifest.ts`
também removido. `App.tsx` não tem mais abas (só uma tela agora, então a
navegação por tabs virou complexidade sem uso — removida junto com o CSS
`.tabs*`).

**Metasprites (2026-09-19):** a seção "Personagem animado"
(`SpriteSheetEditor.tsx`, `SheetCanvas.tsx`) substituiu o seletor de frame
da animação. Frame lógico (hoje retangular, ver "Quadros retangulares" abaixo) independente do sprite de
hardware; fatiamento automático em peças 8x8/16x16 (par OBJ_SIZE8_L16),
pivô por frame (arrastável no canvas, padrão centro/base), overlay das
peças, avisos (pixels vazando pra célula vizinha, >34 fatias/scanline,
>16 linhas de tiles) e estatísticas por frame; salva
`<base>_tiles.bmp` (128px de largura, layout OBJ de 16 colunas, dedup
inclusive espelhado) + `<base>_metasprites.h` em `assets/gfx/`. A lógica é
pura e fica em `src/lib/metasprite/` (`slicer`, `tilePacker`, `builder`,
`stats`, `compose`, `exportHeader`); o modelo separa `SlicedPiece`
(fatiar) de `Piece` (empacotar) pra edição manual futura. Formato, limiar
8x8 vs 16x16 e fórmula de flip: `docs/DATA_FORMAT.md` § 3 "Metasprites".
Correção junto: `extractPalette` agora respeita alpha (cor 0 =
transparente; antes o fundo `(0,0,0,0)` colidia com contorno preto opaco).
Helper único `src/lib/saveToEngine.ts` (os 3 exports usavam fetch duplicado).
Sheet de teste em `samples/marioteste-32x32.png` (as 6 poses do
`marioteste.png` re-arranjadas numa grade de 32x32 — o original tem passo
~16x20 e as poses vazam da célula).

**Build automático depois de salvar (2026-09-19) — parte 2/3 do fluxo "salvar já
altera a ROM":** depois de cada "Salvar" (personagem, animações, cenário) a tela
chama `POST /api/build-engine` **uma vez** e mostra "Jogo compilado com
sucesso (2,0 s — build/….sfc, 256 KB)" ou "O jogo NÃO compilou" + saída do
`make` (aberta na falha). Decisões do usuário: **config em arquivo local**
(`editor.local.json`, no `.gitignore`; modelo `editor.local.example.json`; já
criado com os caminhos detectados desta máquina) e **um build por salvamento**.
`vite-engine-build.ts` (Node, sem Vite, testável): `readBuildConfig` (valida
tudo com mensagem em português, relê a cada build), `runEngineBuild` (Git Bash
`-lc "cd <engine> && make 2>&1"`, `PVSNESLIB_HOME` e pasta do make vindos da
config, um build por vez, timeout com `taskkill /T`, ROM mais recente em
`build/`). Plugin: `/api/build-engine` + **checagem de origem** nos dois
endpoints (recusa `Origin` de outro host: o build dispara um processo).
Cliente: `buildEngine()`, `useEngineBuild`, `BuildStatus` (resultado some ao
editar; botão de salvar desabilitado enquanto compila). **Bug pego pelo E2E:**
ao trocar `setSaveResults([])` por `clearResults()` em todo o arquivo, a troca
atingiu o corpo da própria `clearResults` (recursão infinita, "Maximum call
stack" ao salvar) — o TypeScript não acusa; corrigido.

**Caixa de colisão (hitbox) + nomes sugeridos (2026-09-19):** pedido da sessão
da engine (`docs/DATA_FORMAT.md` § 3). Um retângulo **por sheet**, ancorado
nos pés (base no pivô, centrado em X; esquerda = `pivô_x - floor(W/2)`).
`src/lib/metasprite/hitbox.ts` (puro): `defaultHitbox` (largura 75% do
frame; altura = do pivô ao topo da arte, a pose mais alta manda),
`validateHitbox` (inteiros, ≥ 1, ≤ frame, mensagens em português),
`hitboxLeft`. UI: passo "3. Caixa de colisão" (campos Largura/Altura, "Restaurar
sugestão"), contorno vermelho + alças brancas na `LivePreview` (checkbox
"Mostrar caixa de colisão"); como a posição é fixa por definição, "arrastar"
= **redimensionar** (lados simétricos em torno do pivô, topo, cantos), sempre
limitado ao quadro. A sugestão acompanha pivô/tamanho do quadro até o usuário
editar; valores inválidos (digitados) mostram erro, desenham tracejado e
**bloqueiam o botão de salvar**. Export: `<BASE>_HITBOX_W` /
`<BASE>_HITBOX_H` no `_metasprites.h` (`generateMetaspriteHeader` ganhou o
parâmetro `hitbox`, obrigatório, e recusa valores inválidos). Nomes de
animação: chips clicáveis + `datalist` com idle/walk/run/jump/fall (marca os
criados, mostra o que falta; nome livre continua). Correção junto:
`SpriteSheetEditor` agora é remontado a cada imagem nova (`key` = dataUrl) —
antes tamanho de quadro/animações/pivôs da imagem anterior vazavam pra nova.

**Quadros retangulares (2026-09-19):** `frameSize` virou `frameWidth` +
`frameHeight` em todo o código (`types`, `slicer`, `builder`, `stats`,
`compose`, `exportHeader`, `animationSequence`, `SheetCanvas`,
`AnimationSequencer`, `LivePreview`, `SpriteSheetEditor`). Cada dimensão é
múltiplo de 8 entre 8 e 64. UI: seletor com presets 16×16, 16×32, 32×32,
32×48, 48×48, 64×64 + "Personalizado…" (dois seletores, largura e altura;
padrão continua 32×32). Detalhes: grade/numeração usam largura E altura;
validação "imagem múltipla do quadro" nos dois eixos (o erro sugere os
presets que servem); pivô automático `(largura/2, altura)` (16×32 → (8, 32)),
`clampPivot` e arrasto da cruz limitam cada eixo no seu tamanho; fatias por
scanline usam a altura; `composeFrame` usa um buffer 2L × 2A; prévia ao vivo
e miniaturas do sequenciador respeitam a proporção do quadro; blocos
parciais (largura/altura 24/40/56) só geram peças 8×8 (uma 16×16 invadiria
o quadro vizinho). **Export:** `<BASE>_FRAME_SIZE` removido do
`_metasprites.h`, entram `<BASE>_FRAME_WIDTH`/`<BASE>_FRAME_HEIGHT`
(decisão e justificativa em `docs/DATA_FORMAT.md` § Histórico: com retângulo
não existe "o" tamanho, um alias só pros quadrados sumiria justo nos
retângulos, e ninguém consumia ainda). O `_anim.h` manteve
`_FRAME_W`/`_FRAME_H` (contrato antigo), agora com largura/altura reais.
**Aviso de corte mais tolerante:** exige ≥ `MIN_CLIP_CONTACT` = 4 pixels de
contato na borda; com o `marioteste.png` real (atualizado em Downloads:
64×64, poses 16×32 em 4 × 2 quadros, 4ª coluna vazia) o braço de uma pose
encostava por 2 linhas na vizinha e o detector dava falso positivo nos
quadros 1 e 2, reprovando o critério "sem avisos". Sheet real copiado pra
`samples/marioteste-16x32.png` (+ `tests/fixtures/marioSheet16x32.ts`); o
`samples/marioteste-32x32.png` (poses re-arranjadas em 32×32) continua.

**Interface em linguagem simples + prévia ao vivo (2026-09-19):** pedido do
usuário — os termos técnicos (quadrante, OAM, pivô, fatias/scanline, dedup,
metasprite) saíram da tela principal. Vocabulário: "quadro" (frame lógico),
"ponto de apoio" (pivô), "pedaços" (peças), "espaços de imagem" (tiles);
erros/avisos em frases completas (ex.: "o desenho passa da borda de baixo e
invade o quadro vizinho"). Tudo técnico (limiar 8x8, dedup, grupo de cores,
tabela por quadro com OAM/fatias) ficou em "Opções avançadas e detalhes
técnicos" (`<details>`, fechado por padrão). Depois de validar a imagem o
usuário escolhe "Personagem ou objeto" (editor de personagem) ou "Cenário"
(salva o .bmp inteiro, fluxo da seção 1) — antes eram dois botões de salvar
concorrentes. `LivePreview.tsx`: prévia que redesenha o personagem **a partir
das peças exportadas** (`composeFrame` → `composedToRgba`, não da imagem
original) sobre céu/chão, com o ponto de apoio fixo no centro; atualiza na
hora ao mudar tamanho do quadro, ponto de apoio (digitando ou arrastando),
"Virar para o outro lado" (usa a fórmula de espelhamento do export) e
animações; toca a animação em montagem/salva no ritmo escolhido
(pausar/reproduzir) e fica presa no topo da tela (`position: sticky`) durante
toda a edição (no celular vira uma faixa compacta). Animações agora são
montadas **clicando nas miniaturas dos quadros** (em vez de digitar
"0,1,2,1"), com nome livre em português (acentos viram identificador C:
"Andar rápido" → `andar_rapido`) e tempo em segundos aproximados. Helpers
novos: `useLoadedImage`, `lib/metasprite/render.ts`; `parseFrameIndices`
removido (sem uso).

**Testes automatizados:** `npm test` roda vários arquivos com `node:test`
(zero dependências; Node 24 executa TS direto; tsconfig próprio em
`tsconfig.test.json`) — **76 casos** ao todo (`characterSlots.test.ts`
cobre os 2 slots e seus `requiredAnimationNames`; mais uma asserção em
`preview.test.ts` pro contrato fixo do `hero`), incluindo os anteriores:
`importProject.test.ts` (round-trip completo export→reconstrução:
`decodeIndexedBmp`, `parseMetaspriteHeader`/`parseAnimationHeader` contra a
saída real de `generateMetaspriteHeader`/`generateAnimationHeader`,
`reconstructFramePixels` pixel a pixel pra várias dimensões/seeds/dedup,
header antigo sem hitbox não lança), `characterDiscovery.test.ts` (agrupar
arquivos em personagens, ignorar incompletos/estranhos, ordenar por mtime),
`gfxFilesServer.test.ts` (listar/ler/apagar num diretório temp, path
traversal). Os demais (fatiador retangular, sheets do Mario 32×32 e 16×32,
hitbox, build/Git Bash/make reais, prévia/nomes/duração/grade) continuam
como antes: bloco vazio, 1 quadrante, bloco cheio, limiar, pivô
(padrão/override/int8), layout de tiles, dedup com flips, recomposição
pixel a pixel (16/32/48/64 × limiares × dedup), espelhamento pela fórmula,
estatísticas, vazamento, alpha, export (.h + .bmp parseados) e o sheet do
Mario. Verificado à parte (scripts soltos, não commitados): `gfx4snes` real
converte o `_tiles.bmp` sem `-m` em ordem raster (0 divergências) e o
`816-tcc -Wall` compila o `.h` sem avisos; E2E Playwright do editor
(overlay, pivô arrastado, export em disco, avisos, galeria de personagens
salvos contra o `hero` real).

Lógica de paleta/BMP isolada em `src/lib/indexedBmp.ts` (genérico,
sem depender de React) e a validação específica do fluxo de import em
`src/features/import-preview/validation.ts`.

**Seção 3 (Sprites e animação) implementada:** nova seção "Sequência de
animação" (`src/features/import-preview/AnimationSequencer.tsx`), que
aparece embaixo do preview pra qualquer imagem já válida — seletor de
tamanho de frame (8/16/32px), uma grade desenhada num `<canvas>` mostrando
os índices de frame na mesma ordem raster do `gfx4snes -T` (bloqueia com
erro se largura/altura não forem múltiplo exato do tamanho de frame
escolhido), e um editor de animações nomeadas (nome + índices separados por
vírgula + duração por frame). Exporta um `.h` de C no formato exato
proposto pela engine (`src/features/import-preview/animationSequence.ts`
gera o texto), reaproveitando o mesmo endpoint `POST /api/export-gfx` da
seção 1 — a extensão `.h` foi liberada ali além de `.bmp`. Nome de animação
é sanitizado automaticamente pra virar identificador C válido (ex.:
espaços/hífen viram `_`).

Testado com Playwright (build, lint, e fluxo completo no navegador via
scripts ad-hoc — não commitados, ver nota abaixo). Três rodadas:
1. Validação/export (feita antes de mudar pra escrita em disco): PNG 8×8/3
   cores válido → mensagem de sucesso; PNG 10×6 (dimensão inválida) → erro
   certo, botão de exportar some; PNG 8×8 com 20 cores → erro com contagem
   certa, botão de exportar some; zero erros de console nos três casos.
2. Escrita em disco (depois da mudança pro endpoint `/api/export-gfx`):
   upload de PNG 8×8/3 cores válido → clique em "Salvar em assets/gfx/" →
   mensagem "Salvo em ../jogo-plataforma-snes/assets/gfx/e2e-probe.bmp" →
   confirmado por fora do navegador que o arquivo existe de verdade nesse
   caminho, com assinatura `BM` e dimensões 8×8 corretas; zero erros de
   console. Também testado via `curl` direto (sem navegador): nome de
   arquivo com `../` ou sem extensão `.bmp` é rejeitado com HTTP 400 antes
   de tocar no disco.
3. Sequência de animação: PNG 32×32 com 4 quadrantes de cor sólida (frame
   16×16) → grade mostra corretamente "2×2 = 4 frames"; tentar adicionar
   animação com índice fora do range (0,1,99) é rejeitado com erro, nenhuma
   animação é criada; duas animações válidas adicionadas ("walk"
   [0,1,2,1]@10, "idle" [0]@30) aparecem na lista; export do `.h` confirma
   por fora do navegador que o arquivo existe em `assets/gfx/` com o
   conteúdo exato esperado (`#define`s de tamanho de frame, arrays `u8` por
   animação, macros de duração — formato idêntico ao proposto no
   `DATA_FORMAT.md`); zero erros de console.

**Nota sobre testes:** não há suíte Playwright commitada neste repo (não
está em `package.json`/`devDependencies`, não há pasta `tests/`). A
validação acima rodou via script solto usando `npx --yes -p playwright`
(baixa o pacote sob demanda) — cobre o fluxo real no navegador, mas não é
reexecutável via `npm test`. Se quisermos testes de regressão permanentes,
falta decidir/commitar essa infra (`@playwright/test` + config + pasta
`tests/`).

## Próximo passo
(Reescrito do zero em 2026-09-23 — a versão anterior estava desatualizada,
listando como "fora de escopo"/"fase 2 futura" coisas que já foram
implementadas há várias etapas: múltiplos tilesets com paleta por bloco,
Camada 2, terrenos inteligentes, CRUD de tileset salvo, referência por
nome, cursor de 8px, preparação de fase maior. Histórico completo de tudo
isso está no `## Log` abaixo, não repetido aqui.)

1. **Ação pendente do USUÁRIO** (não nossa — ver "Status atual"): testar
   no EMULADOR um objeto marcado "Sólido" (o jogador não deveria
   atravessar) e um marcado "Bandeira"/"Trigger de morte" (tocar deveria
   terminar a fase/matar, igual um inimigo) — a automação de teste só
   confirma que os arrays saem certos no `.h` exportado, não que a Anubis
   lê isso certo no hardware/emulador de verdade.
2. **Ação pendente do USUÁRIO** (não nossa): testar o botão "Jogar" de
   verdade (ver "Status atual") — clicar, escolher o emulador real na 1ª
   vez (seletor nativo do Windows) e confirmar que ele abre com o ROM
   certo; no clique seguinte, confirmar que NÃO pergunta de novo (usa o
   caminho já salvo em `editor.local.json`).
3. **Ação pendente do USUÁRIO** (não nossa — slot/posicionamento/export já
   implementados, ver "Status atual"): desenhar a arte da barra do gol
   (frame 0 de uma folha `decor1`, até 8 linhas de 16 tiles), importar no
   slot "Decoração (estática)" (aba Personagens) e posicionar na `stage1`
   de verdade (aba Fases, modo "Personagens", botão "Adicionar
   Decoração") no lugar do poste de trás — fecha o caso de uso real que
   motivou a tarefa inteira (buraco que a barra deixava como tile de
   Camada 1).
4. **Ação pendente do USUÁRIO** (não nossa, item anterior): decidir
   QUAL bloco do `goalpost_tileset` é "o poste da frente" e marcar ele com
   o toggle "Na frente" (feature pronta, ver "Status atual") — depois
   disso, resalvar o tileset e reabrir+resalvar a `stage1` (o `.txt` só
   sai atualizado no próximo "Salvar fase no jogo"). Pesquisei o tileset
   (`assets/tilesets/goalpost_tileset.bmp/.json`) antes de perguntar: ele
   tem um poste CLARO (blocos 0/1, ainda Camada 2) e um poste ESCURO
   (blocos 2/3, já Camada 1 + colisão "goal", sem a flag), mais um bloco 4
   (barra clara, também "goal") — não dava pra saber com certeza qual é
   "o da frente" sem ver como os dois aparecem de verdade no jogo (contexto
   que só o usuário tem), e marcar o errado estragaria o visual que essa
   tarefa queria consertar, em arquivos reais. Perguntei em vez de
   adivinhar.
5. **Ação pendente do USUÁRIO** (não nossa, item anterior): confirmar
   no EMULADOR (não só na UI do editor) que a cor de fundo (backdrop, ver
   "Status atual") aparece certa no jogo — escolher uma amostra, salvar,
   rodar a fase e comparar com a prévia do editor. A automação de teste
   (Playwright) só confirma que os 3 `#define ..._BACKDROP_R/G/B` saem
   certos no `.h` exportado, não que o hardware de verdade desenha a cor
   esperada (isso depende do lado da Anubis ler esses defines — ela
   documentou o formato, mas o Prometeus nunca testou contra o emulador
   real, só contra o arquivo texto gerado).
6. **Ação pendente do USUÁRIO** (não nossa, item anterior): confirmar
   clicando na UI real o recurso novo "Fundo" (ver "Status atual") —
   cadastrar um Fundo na aba "Fundos" (imagem 256×256 ou 512×256px),
   escolhê-lo junto com um tileset ao "Começar a pintar" (rádio "Fundo pra
   Camada 2"), carimbar no painel "C2", confirmar que o botão some quando
   nenhum Fundo foi escolhido, e salvar + reabrir a fase pra confirmar que
   a Camada 2 carimbada continua lá.
7. **Ação pendente do USUÁRIO** (não nossa, item anterior): confirmar
   clicando na UI real o painel novo da Camada 2 ("Editor de Camada 2 como
   padrão repetível", ver "Status atual") — abrir o modo "C2", trocar a
   largura entre 32/64, pintar um padrão, conferir que a pré-visualização
   3x lado a lado mostra a emenda direito, confirmar que reabrir a
   `stage1` antiga (Camada 2 do tamanho da fase inteira) trunca sozinha
   pras 64 primeiras colunas sem perder o que já era visível no jogo, e
   salvar de ponta a ponta.
8. **Ação pendente do USUÁRIO** (não nossa, item anterior): desenhar/
   atribuir arte pros 4 papéis novos de canto/cotovelo de bloco fino
   ("Blocos finos — canto/cotovelo") e confirmar na UI real que uma curva
   de 90° num caminho de 1 bloco de largura desenha direito agora (não
   mais reaproveitando o canto normal, que assumia massa sólida que não
   existe do lado de dentro da curva) — esquema 24 → 28 papéis no total.
9. **Ação pendente do USUÁRIO** (item anterior de autotile): desenhar/
   atribuir arte pro papel `thinCross` ("Cruzamento de bloco fino") e
   confirmar na UI real que o cruzamento "+" entre uma faixa fina
   horizontal e uma coluna fina vertical desenha direito.
10. **Ação pendente do USUÁRIO** (não nossa, item mais antigo de autotile):
   (a) reatribuir a arte de "faixa fina horizontal"/"coluna fina vertical"
   nos slots certos (os glifos ↔/↕ estavam trocados, causando a
   confusão — já corrigido, mas as atribuições que o usuário já fez com
   base nos glifos errados continuam invertidas até serem refeitas na
   UI); (b) desenhar/atribuir arte pros 4 papéis novos de PONTA ("Blocos
   finos — ponta/fim") — sem isso, o fim de uma coluna/faixa fina continua
   caindo no preenchimento normal (mesma regra de sempre pra papel sem
   bloco atribuído, não é mais um bug, só falta a arte); (c) confirmar que
   o entalhe de lado inteiro (junção em T) continua bom.
11. **URGENTE — ação do USUÁRIO, não nossa:** reabrir a `stage1` (hoje
   ainda em 96x64 no disco) e repintar/resalvar dentro de um tamanho
   VÁLIDO (altura sempre 32, largura múltipla de 32 até 480 — ex.: 32,
   64, 96...). Importante: 96 colunas já seria uma largura válida hoje —
   só a ALTURA 64 continua inválida pra sempre (restrição real e
   permanente da Anubis, streaming só no eixo horizontal). Reabrir no
   editor agora mostra essa mensagem exata em vez de travar, mas
   repintar/resalvar continua sendo ação do usuário.
12. **Ação pendente do USUÁRIO** (não nossa): confirmar clicando na UI
   real que o trabalho desta sessão funciona de ponta a ponta — escolher
   uma largura larga (ex. 96 colunas) ao "Começar a pintar", pintar as
   duas camadas, ver o viewport rolável + minimapa aparecerem de verdade
   (só aparecem quando a fase não cabe inteira na tela), forçar o aviso
   de orçamento de VRAM (pintar >256 blocos únicos na Camada 1 ou >128 na
   Camada 2) e salvar. **Depois disso, a validação final que fica de fora
   deste projeto:** exportar essa fase larga de verdade e jogar até o fim
   no emulador (a automação de teste não move o jogador) — sugestão: pôr
   algo visualmente único (a bandeira, por exemplo) perto do fim pra
   confirmar que a última página carregou certo.
13. **Ação pendente do USUÁRIO** (não nossa, item mais antigo): confirmar
   clicando na UI real que a reorganização "espírito Lunar Magic" (ícones
   da navegação, barra de ferramentas de Fases unificada, quadrados de
   modo/passo do cursor) e a lata de tinta (flood fill) ficaram boas.
   **Já confirmados funcionando pelo usuário** (não são mais pendência):
   o aviso de "proporção alta de bandeira" + indicador de "bloco padrão",
   o modal de escolha de bloco, e os terrenos inteligentes.
14. **Reestilizar Tilesets e Personagens no espírito Lunar Magic** — fora
   de escopo por decisão do usuário (fasear). Personagens
   (`SpriteSheetEditor.tsx`) é o maior risco: formulário longo de várias
   etapas (tamanho de quadro → ponto de apoio → caixa de colisão →
   sequência de animação → prévia → opções avançadas) com bastante estado
   interdependente — comprimir isso numa barra compacta é uma reescrita
   bem maior que a de Fases.
15. Auto-scroll do viewport ao arrastar uma entidade ou pintar perto da
   borda (deixado de fora de propósito na Fase B, ver "Status atual") —
   avaliar se vale a pena agora que fases largas de verdade já são
   possíveis (aumenta a chance disso incomodar na prática).
16. **Ação pendente do USUÁRIO** (não nossa): rodar `npm run test:e2e`
   pelo menos uma vez localmente pra ver a suíte passando fora desta
   sessão, e considerar torná-lo parte do checklist padrão antes de
   considerar uma tarefa "pronta" (junto de `tsc -b`/`npm test`/`npm run
   build`/`npm run lint`) — ainda não é uma regra permanente registrada,
   só uma sugestão desta entrada.
17. **Cobertura E2E ainda faltando (fasing explícito, ver "Status atual"):**
   fluxo completo de personagem (`SpriteSheetEditor.tsx` — escolher
   pivô/hitbox, sequenciar as 5 animações obrigatórias, ver aviso de corte
   de sprite) não tem teste E2E dedicado ainda, só a versão simplificada de
   "cenário" (mesmo upload/validação compartilhados). Também faltam casos
   de borda do CRUD de tileset (terrenos inteligentes, Camada 2) e o fluxo
   de reabrir/editar uma fase já salva (hoje só "criar nova" tem E2E).
   Avaliar se vale a pena antes de continuar adicionando feature nova, pra
   não deixar a defasagem crescer.
18. **Escolher/trocar o Fundo DENTRO do painel C2, a qualquer momento**
   (opção B não escolhida desta vez, ver "Status atual") — exigiria tornar
   `tilesets`/`hardwareCombined` recomputáveis dentro de StageSession.tsx
   em vez de fixos desde "Começar a pintar". Ganho real: trocar de Fundo
   sem perder o progresso de pintura da Camada 1. Só vale a pena se o
   usuário sentir falta de verdade de reabrir a sessão pra trocar de
   Fundo — não implementar especulativamente.

## Log
- 2026-10-14 (Prometeus): **`engineDir` unificado entre export de arquivos e build/"Jogar".**
  Detalhe completo em "Status atual" (topo). Surgiu avaliando deixar o repo público — `/api/
  export-gfx` escrevia num caminho hardcoded próprio, nunca lendo `editor.local.json`, então
  configurar `engineDir` só afetava o build, não o export. Nova função `readEngineDir`
  (`vite-engine-build.ts`, tolerante, nunca lança) virou o único ponto que decide "onde fica a
  pasta da engine", usada pelos dois lados agora. README ganhou uma seção deixando claro que o
  editor funciona sozinho sem engine nenhuma, e que a integração é opcional/configurável/segue um
  contrato documentado (não hardcoded pro projeto Anubis especificamente). 5 testes novos.
  Verificado: `tsc -b`, `npm test` (264/264), `npm run build`, `npm run lint`, `npm run test:e2e`
  (24/24).
- 2026-10-10 (Prometeus): **Objeto (decoração) com colisão + propriedade especial, implementado de
  ponta a ponta — pedido retomado depois da Anubis fechar o contrato.** Detalhe completo em
  "Status atual" (topo). Reli `docs/DATA_FORMAT.md` § 3 inteira antes de codar. Decidi NÃO
  unificar Player/Inimigo/Decoração numa única estrutura (Jogador é estruturalmente diferente;
  Inimigo e Decoração já compartilhavam a mecânica de posicionamento, mas misturar os dados
  também não trazia ganho real hoje — documentado o raciocínio pra próxima vez). `DecorInstance`
  ganhou `solid: boolean` + `specialPropertyId: string` (lista extensível,
  `SpecialProperty`/`SPECIAL_PROPERTIES` em `entities.ts`, mesmo padrão de `decorSlots.ts`). UI:
  checkbox "Sólido" + select "Especial:" no painel da decoração, com tooltip deixando claro que é
  diferente da bandeira por tile. Indicador visual no canvas (anel verde pra sólido, selo colorido
  pra bandeira/morte). Export sempre os 3 campos novos juntos quando há decoração (nunca parcial);
  fase salva antes desta tarefa reabre com os padrões de sempre (atravessável, sem propriedade),
  sem travar. 8 testes novos + 1 E2E. Verificado: `tsc -b`, `npm test` (259/259), `npm run build`,
  `npm run lint`, `npm run test:e2e` (24/24).
- 2026-10-10 (registrado pela Anubis, nada implementado do lado do Prometeus): **comportamento de
  objeto — contrato fechado do lado da Anubis em `docs/DATA_FORMAT.md` § 3 ("Comportamento de
  objeto", 🟡 aditivo).** Destrava o pedido pausado logo abaixo. Export: junto dos arrays de
  `decor1` em `stage1_entities.h`, `#define STAGE1_DECOR_HAS_BEHAVIOR 1` +
  `stage1_decor_collision[]` (0 atravessável, 1 sólido) + `stage1_decor_special[]` (0 nenhuma,
  1 bandeira, 2 morte), um valor por instância. Caixa de colisão = retângulo do frame. Bandeira
  por célula da colisão continua valendo. Engine pronta e testada no BizHawk.
- 2026-10-10 (Prometeus): **Pedido pausado sem código de produto: generalizar `decor1` pra
  "Objeto" com colisão + propriedade especial (bandeira/trigger de morte).** Detalhe completo em
  "Status atual" (topo). Conferi `docs/DATA_FORMAT.md` § 3 inteira e o `docs/PROGRESS.md` da
  Anubis procurando qualquer menção a essa generalização — nenhuma das duas fontes documenta
  ainda (§ 3 segue igual à versão de 2026-10-05, "sem colisão, sem IA"). Fiz só a investigação
  pedida (item 1, não bloqueada pelo formato): Inimigo e Decoração já compartilham a MESMA mecânica
  de posicionamento em `StageSession.tsx` (adiciona no centro + arrasta + "Tipo:" no painel
  lateral) — bons candidatos a unificar quando o formato fechar. Jogador é estruturalmente
  diferente (instância única, "arme e clique", sem seletor de tipo) — recomendo NÃO misturá-lo
  nesse sistema. Não toquei no modelo de dados/UI/export — esperar a Anubis fechar os nomes de
  array/macro e a codificação da propriedade especial antes de codar.
- 2026-10-10 (Prometeus): **Botão "Jogar" na barra de topo (estilo Unity) — compila e abre o ROM
  no emulador com 1 clique.** Detalhe completo em "Status atual" (topo). Reaproveita o MESMO
  `buildEngine()`/`/api/build-engine` que o fluxo de salvar já usa — nenhuma lógica de build
  duplicada. 1ª vez sem `emulatorPath` salvo: abre o seletor de arquivo NATIVO do Windows
  (`OpenFileDialog` via PowerShell, já que o projeto não tem Electron/dependência de diálogo nativo
  nenhuma) pedindo o executável do emulador, salva a escolha em `editor.local.json` (mesclando com o
  resto da config do build, nunca sobrescrevendo) e abre o emulador com o ROM como argumento
  (processo destacado — o dev server nunca espera o emulador fechar). Da 2ª vez em diante pula
  direto pro lançamento. Novo plugin `vite-emulator-plugin.ts` com 4 endpoints
  (`GET /api/emulator-path`, `POST /api/emulator-path/pick`, `POST /api/emulator-path`,
  `POST /api/launch-emulator`), mesmo padrão de sempre (1 arquivo por assunto). UI nova
  (`PlayButton.tsx`) encostada no canto direito da barra de abas, com link "Trocar emulador" sempre
  disponível. Abrir um seletor nativo de verdade e abrir um emulador de verdade não são
  automatizáveis (dependem de SO/humano) — só a lógica pura tem teste unitário, a orquestração do
  frontend tem E2E com os 4 endpoints mockados. 12 testes novos + 5 E2E. Verificado: `tsc -b`, `npm
  test` (256/256), `npm run build`, `npm run lint`, `npm run test:e2e` (23/23).
- 2026-10-05 (Prometeus): **Slot de sprite decorativo estático `decor1` + posicionamento na fase,
  implementado de ponta a ponta — pedido retomado depois da Anubis fechar o contrato.** Detalhe
  completo em "Status atual" (topo). Reli `docs/DATA_FORMAT.md` § 3 inteira antes de codar (não só o
  resumo do pedido). Novo campo `CharacterSlot.supportsAnimation` (distingue "nunca anima por
  contrato" de "contrato de animação ainda não fixado"); `DecorInstance` novo (x,y = canto superior
  esquerdo do quadro, sem conversão pivô-hitbox — decoração não tem hitbox); posicionamento na fase
  reaproveita o mecanismo de inimigo sem os campos de patrulha/hitbox, com encaixe de grade e
  marcador próprios (canto, não centro-base) por causa da convenção de posição diferente;
  `reconstructFrameAt`/`loadCharacterFrame` novos pra mostrar um quadro ESPECÍFICO da folha (não só
  "idle"/quadro 0); export omite o bloco `STAGE1_DECOR_*` inteiro quando vazio, diferente do array
  de inimigos. 7 testes novos + 2 E2E. Pendência de CONTEÚDO (não técnica): desenhar a arte, importar
  e posicionar na `stage1` real continua com o usuário. Verificado: `tsc -b`, `npm test` (244/244),
  `npm run build`, `npm run lint`, `npm run test:e2e` (18/18).
- 2026-10-05 (registrado pela Anubis, nada implementado do lado do Prometeus): **slot de
  decoração estática — contrato fechado do lado da Anubis em `docs/DATA_FORMAT.md` § 3 ("Slot de
  decoração estática `decor1` + lista de decorações por fase", 🟡 aditivo).** Destrava o pedido
  pausado logo abaixo. Arte: slot `decor1` (`decor1_tiles.bmp` + `decor1_metasprites.h`, prefixo
  `DECOR1_`, sem hitbox, `_anim.h` dispensável, até 8 linhas de 16 tiles); cada FRAME da folha é
  uma decoração diferente. Posição: arrays opcionais no `stage1_entities.h` —
  `STAGE1_DECOR_COUNT` (até 16), `stage1_decor_type/frame/x/y`, X/Y = canto sup. esq. do frame em
  px de mundo; até 32 peças somadas. A Anubis tem um placeholder `decor1_*` (barra 32x8) até o
  export real sobrescrever.
- 2026-10-05 (Prometeus): **Pedido pausado sem nenhum código: slot de sprite decorativo estático +
  posicionamento na fase.** Detalhe completo em "Status atual" (topo). Pedido do usuário pra
  resolver o buraco que a barra do gol deixava como tile de Camada 1 — novo slot de personagem
  (sem animação/colisão/IA), reaproveitando o componente de posicionar inimigo (sem
  patrulha/hitbox). Conferi `docs/DATA_FORMAT.md` § 3 e as entradas recentes do lado da Anubis
  (mesma checagem dupla das tarefas da cor de fundo/bit de prioridade) — formato ainda não fechou.
  Diferente das duas tarefas anteriores, esta não deu a opção de implementar só a UI enquanto
  espera — parei por completo, sem tocar em `characterSlots.ts` nem em nenhuma tela.
- 2026-10-05 (Prometeus): **Bug real corrigido: editar e salvar um tileset com uma sessão de
  pintura já aberta não atualizava nada na sessão em andamento.** Detalhe completo em "Status
  atual" (topo). Reportado pelo usuário tentando usar a feature "Na frente" recém-implementada
  (bloco marcado não aparecia pra pintar). Reproduzi o fluxo exato antes de mexer em qualquer
  código (2 tentativas de diagnóstico via e2e descartável até achar a causa real — a 1ª, combinando
  2 tilesets, não reproduziu nada; a 2ª, editando o MESMO tileset já usado por uma sessão aberta
  sem fechar a fase, reproduziu na hora). Causa: `StageWorkspace.tsx` nunca desmonta a sessão ativa
  ao trocar de aba (Tilesets/Fundos/Fases são o mesmo componente), mas `tilesets`/`tileCollision`/
  `tileLayer`/`tilePriority` da sessão só eram calculados uma vez, em `handleStartSession`/
  `handleEditStage`. Corrigido com um `useEffect` que recarrega por nome sempre que a aba "Fases"
  volta a ficar ativa — `grid`/`gridLayer2`/`entities` (que vivem em `StageSession.tsx`) nunca são
  tocados, então pintura em andamento nunca se perde. 1 E2E novo, confirmado que pega a regressão
  (efeito desabilitado de propósito antes de reaplicar a correção). Verificado: `tsc -b`, `npm
  test` (238/238), `npm run build`, `npm run lint`, `npm run test:e2e` (16/16).
- 2026-10-02 (Prometeus): **Bit de prioridade por tile da Camada 1 ("na frente do sprite")
  implementado e testado de ponta a ponta — falta só o usuário marcar o bloco certo na `stage1`
  real.** Detalhe completo em "Status atual" (topo). Resumo: `docs/DATA_FORMAT.md` § 4 fechou
  (conferido antes de codar); toggle "Na frente" no editor de Tileset (só Camada 1, independente da
  colisão), persistido no `TilesetMeta`/mesclado hardware-indexado (mesmo padrão de
  colisão/camada), indicador visual (contorno roxo) na paleta E desenhado em cima de cada célula
  pintada no canvas da fase, export `stage1_tilemap_priority.txt` SEMPRE (32 linhas de `0`/`1`,
  nunca condicional — mesma lição da Camada 2). Achado real ao testar: o endpoint de export só
  aceitava `.bmp`/`.h`/`.json`, rejeitando o `.txt` novo com HTTP 400 — isso silenciosamente
  impedia `onSaved()` de disparar depois de salvar (quebrando a volta pra tela de fase salva),
  pego pelo e2e e corrigido estendendo os padrões de nome de arquivo aceitos. 17 testes novos + 2
  E2E. Pendência de CONTEÚDO (não técnica): pesquisei `goalpost_tileset` pra tentar já marcar o
  poste da frente sozinho, mas achei 2 candidatos plausíveis (poste claro em Camada 2, poste escuro
  já em Camada 1+colisão "goal") sem contexto suficiente pra saber qual é "da frente" de verdade no
  jogo — perguntei ao usuário em vez de arriscar marcar o errado em arquivos reais. Verificado:
  `tsc -b`, `npm test` (238/238), `npm run build`, `npm run lint`, `npm run test:e2e` (15/15).
- 2026-10-01 (Prometeus): **Bug real corrigido: pintar com bloco/terreno de Camada 2 no modo
  normal "Pintar blocos" corrompia `gridLayer2`.** Detalhe completo em "Status atual" (topo).
  Reportado pelo usuário direto (blocos aparecendo cortados/repetindo, depois simplesmente parando
  de pintar). Causa raiz: `TilePickerModal` não filtrava bloco por camada, então dava pra escolher
  um bloco de Camada 2 estando no modo normal e pintar com ele — a escrita usa a largura do CANVAS
  ativo (a da fase inteira no modo normal), não a da CAMADA do bloco (bem menor pra Camada 2),
  stride errado desalinhando tudo a partir da 2ª linha. Corrigido nos dois sentidos: seletor de
  bloco e grupos de terreno agora filtram por camada (`visibleIf` novo em `TilePickerModal`), e os 3
  guards de escrita (`paintCell`/`floodFillAt`/`applyTerrainAt`) viraram comparação simétrica em vez
  de só bloquear um sentido. 1 E2E novo, confirmado que pega a regressão; 1 E2E pré-existente
  ajustado (contava com o seletor mostrando blocos da camada errada misturados, comportamento que
  era o próprio bug). Verificado: `tsc -b`, `npm test` (232/232), `npm run build`, `npm run lint`,
  `npm run test:e2e` (13/13).
- 2026-10-01 (registrado pela Anubis, nada implementado do lado do Prometeus): **bit de
  prioridade por tile da Camada 1 — contrato fechado do lado da Anubis em `docs/DATA_FORMAT.md` § 4
  ("Bit de prioridade por tile da Camada 1", 🟡 aditivo).** Destrava o toggle "desenha na frente
  do jogador" que ficou parado no Log acima por falta de formato. Export pedido: arquivo opcional
  `stage1_tilemap_priority.txt`, 32 linhas × COLUNAS caracteres `0`/`1` (por célula de 8x8; o
  Prometeus resolve bloco → células, como na colisão), só Camada 1, independente da colisão. A
  engine aplica o bit no `.map` durante o build (o `gfx4snes` não faz isso por célula) e já foi
  testada no emulador com a moita da fase real. Se exportar só quando houver marcação, apagar o
  `.txt` ao desmarcar tudo.
- 2026-10-01 (Prometeus): **Bug real corrigido: export de Camada 2 ficando desatualizado em
  silêncio quando a fase não usa mais Camada 2.** Detalhe completo em "Status atual" (topo). Achado
  pelo Anubis investigando o poste sumido. Causa raiz, confirmada lendo `build/Makefile` dela antes
  de corrigir: `handleSave` apagava `stage1_tilemap_layer2.bmp` quando a Camada 2 estava vazia, mas
  a regra de Make que gera `.pic`/`.map`/`.pal` depende desse `.bmp` existir — sem ele, `make` não
  reconverte (e não reclama, porque os arquivos derivados já existem de um build anterior), e o jogo
  roda com Camada 2 desatualizada, sem erro nenhum. Corrigido escolhendo a opção recomendada pelo
  próprio pedido: SEMPRE exportar `_tilemap_layer2.bmp`, mesmo em branco — garante que `make` sempre
  tem o que reconverter a partir do estado real. 1 E2E novo, confirmado que pega a regressão
  (revertido de propósito antes de reaplicar a correção). Também investigado (2ª parte do mesmo
  pedido): toggle de bloco "desenha na frente do jogador" pra Camada 1 — `docs/DATA_FORMAT.md` § 4
  ainda não documentava esse formato do lado da Anubis NA HORA, então parado aí por instrução
  explícita do pedido, sem implementar nada. **Formato fechou pouco depois, entrada de Log acima**
  (mesmo dia) — ainda não implementado do lado do Prometeus, ver "Próximo passo".
- 2026-10-01 (Prometeus): **Seletor de cor de fundo — implementado de ponta a ponta na mesma
  rodada que o pedido do usuário chegou, incluindo o export (formato da Anubis fechou NO MEIO da
  sessão).** Detalhe completo em "Status atual" (topo). Resumo: comecei pela checagem obrigatória
  (`docs/DATA_FORMAT.md` § 4 ainda sem nada sobre backdrop) e implementei só UI/seleção/persistência
  como o pedido instruía pra esse caso; ao reler o arquivo antes de fechar a tarefa, achei a entrada
  de Log logo abaixo (registrada pela Anubis, mesmo dia) com o formato fechado — voltei e
  implementei o export também, na mesma sessão, em vez de deixar pendente à toa. Paleta de amostras
  deduplicada entre os tilesets da fase (`uniqueBackdropColors`), nunca um color picker livre
  (pedido explícito). Export: 3 `#define ..._BACKDROP_R/G/B` em `stage1_entities.h`
  (`exportEntities.ts`), convertidos pro nativo SNES (5 bits/canal, `channel8To5Bit`). Prévia ao
  vivo usa a cor JÁ ARREDONDADA pelo corte de 5 bits (`roundTripBackdropColor`) — o editor mostra
  exatamente o que o jogo vai desenhar, não a cor "crua" 0-255 da amostra. 13 testes novos + 1 E2E
  (inclusive lendo o `stage1_entities.h` exportado de verdade pra conferir os 3 defines certos).
  Verificado: `tsc -b`, `npm test` (232/232), `npm run build`, `npm run lint`, `npm run test:e2e`
  (11/11).
- 2026-10-01 (registrado pela Anubis, nada implementado do lado do Prometeus): **cor de fundo
  fixa da fase — contrato novo em `docs/DATA_FORMAT.md` § 4 ("Cor de fundo fixa da fase
  (backdrop)", 🟡 aditivo).** Pedido pro exportador: 3 defines opcionais no
  `stage1_entities.h`, `STAGE1_BACKDROP_R/G/B`, canais 0-31 (5 bits do SNES; de 0-255 é
  `>> 3`). Sem os defines a engine usa preto. Engine já pronta e testada no emulador. Uso
  pretendido: céu estilo SMW, com a arte da Camada 2 deixando áreas transparentes.
- 2026-09-30 (Prometeus): **Novo recurso salvo "Fundo" — imagem inteira carimbada de uma vez na
  Camada 2, sem pintar bloco a bloco.** Detalhe completo em "Status atual" (topo). Resumo: pedido do
  usuário (reconstruir uma cena contínua bloco a bloco era tedioso) com uma decisão de escopo feita
  COM o usuário antes de codar (`AskUserQuestion`) — Fundo escolhido junto com o(s) tileset(s) antes
  de "Começar a pintar" (não dentro do painel C2 em tempo real), pra evitar ter que tornar
  `tilesets`/`hardwareCombined` recomputáveis dentro de uma sessão de pintura já aberta. Novo tipo
  de recurso salvo (`<nome>_fundo.bmp`/`.json`, `assets/backgrounds/`, aba "Fundos" própria,
  `BackgroundEditor.tsx`/`SavedBackgrounds.tsx`), validado contra o que a Camada 2 aceita (altura
  256px fixa, largura EXATAMENTE 256 ou 512px). `loadBackgroundAsset` devolve o mesmo formato de
  `loadTilesetAsset` (metadados sintetizados: todo bloco já Camada 2, sem colisão) — reaproveita
  `combineTilesets`/`mergeTilesetMetaToHardware` sem mudar nenhum dos dois.
  `StageTilesetInput`/`StageTilesetRef` ganharam `kind?: 'background'` pra reabrir uma fase salva
  continuar reconstruindo a faixa certa (`loadStage.ts` despacha o loader certo por `ref.kind`).
  Painel C2 ganhou um botão "Carimbar" que substitui `gridLayer2` inteiro pela faixa do Fundo
  (`bandGlobalTileIndex`), com `window.confirm` se já havia algo pintado. 12 testes novos + 1 E2E
  novo (`e2e/background-stamp.spec.ts`, cobrindo inclusive reabrir a fase depois de salvar — o
  caminho mais arriscado desta mudança). Verificado: `tsc -b`, `npm test` (221/221), `npm run
  build`, `npm run lint`, `npm run test:e2e` (10/10).
- 2026-09-29 (Prometeus): **Bug real reportado por print: voltar da Camada 2 pra "Pintar blocos"
  deixava a fase em branco.** Detalhe completo em "Status atual" (topo). Causa: o painel da Camada
  2 desmonta `.stage-viewport-area` (canvas principal incluído) enquanto está aberto; voltar
  remonta um canvas NOVO, em branco, mas o efeito de desenho não tinha `mode` nas dependências, então
  nada o mandava redesenhar nesse canvas novo. Corrigido com `mode` na lista de dependências +
  early return quando `mode === 'layer2'`. Confirmado que `e2e/layer2-panel.spec.ts` pega essa
  regressão (reproduzido de propósito antes de reaplicar a correção, removendo `mode` das
  dependências temporariamente — voltou a falhar exatamente como o print mostrava, canvas 300x150
  em vez do tamanho real da fase).
- 2026-09-29 (Prometeus): **Editor de Camada 2 virou um padrão repetível de verdade, com largura
  própria (32/64) — atendendo a sugestão que a Anubis tinha deixado em aberto na entrada anterior
  deste Log.** Detalhe completo em "Status atual" (topo). Resumo: novo `EditMode` `'layer2'` em
  `StageSession.tsx` com painel/canvas dedicado (`layer2CanvasRef`) do tamanho ESCOLHIDO da Camada
  2 (`layer2WidthTiles`, seletor 32/64), nunca mais da largura da fase; `paintCell`/`floodFillAt`/
  `applyTerrainAt` parametrizados por `activeCols` em vez de assumir sempre `HARDWARE_COLS`, com
  bloqueio explícito contra pintar um bloco da camada errada enquanto um painel está aberto (evita
  corromper índices); pré-visualização da repetição em dois lugares (canvas principal via
  `CanvasPattern` `repeat-x`, e uma prévia 3x dedicada no painel da Camada 2); aviso acima de 64
  colunas com o mesmo padrão de confirmação dos avisos de bandeira/VRAM; fases antigas (Camada 2 do
  tamanho da fase inteira) truncadas automaticamente pras 64 primeiras colunas ao reabrir
  (`adaptLegacyLayer2Grid`, novo `layer2Grid.ts`), sem perder nada que já aparecesse no jogo. Sem
  mudança de formato de arquivo. 6 testes novos (`tests/layer2Grid.test.ts`) + 1 E2E novo
  (`e2e/layer2-panel.spec.ts`). Verificado: `tsc -b`, `npm test` (209/209), `npm run build`, `npm
  run lint`, `npm run test:e2e` (9/9) — todos limpos.
- 2026-09-29 (registrado pela Anubis, nada implementado do lado do Prometeus): **Camada 2 com
  parallax — contrato novo em `docs/DATA_FORMAT.md` § 4 ("Camada 2 com parallax", 🟡 aditivo).**
  A Anubis faz a Camada 2 rolar a 1/2 da velocidade da câmera e trata ela como PADRÃO QUE SE
  REPETE, residente em VRAM (sem streaming): 32 ou 64 colunas × 32 linhas. Exportar mais largo
  continua funcionando, mas só as 64 primeiras colunas aparecem (o build da Anubis dá AVISO).
  A Camada 2 não fica mais alinhada com a Camada 1: poste de gol e qualquer decoração presa
  ao nível vão na Camada 1 como tile vazio na colisão. Formato de arquivo inalterado. Sugestão
  em aberto pro Prometeus (não pedida ainda): largura própria da Camada 2 (32/64) na UI,
  pré-visualização da repetição e aviso acima de 64 colunas.
- 2026-09-25 (mais 1 rodada de autotile, com print antes/depois desta vez): **Faltava o CANTO
  (cotovelo) de bloco fino — esquema 24 → 28 (Prometeus).** Detalhe completo em "Status atual"
  (topo). Resumo: uma curva de 90° num caminho de 1 bloco de largura tem o mesmo padrão de 2
  cardeais adjacentes que um canto normal, mas reaproveitar o canto normal (que assume massa
  sólida do lado de dentro da curva) está errado pro mesmo motivo já corrigido nas pontas. 4 papéis
  novos (`thinCornerTopLeft` etc.), só disparam quando a diagonal "de dentro" da curva TAMBÉM está
  vazia — zero mudança nos testes de formas sólidas já existentes (verificado). Achado colateral ao
  reescrever os testes: os 4 cantos da "moldura oca na borda do mapa" da entrada anterior sempre
  foram cotovelos de bloco fino de verdade (a moldura é 1 bloco de espessura) — agora resolvem
  como tal em vez de `fill`. 6 testes novos/atualizados (35 no total). Verificado: `tsc -b`,
  `npm test` (203/203), `npm run build`, `npm run lint`, `npm run test:e2e` (8/8, contagem 28).
- 2026-09-25 (a última rodada de autotile, de verdade desta vez): **Faltava mesmo 1 caso: o
  cruzamento entre bloco fino horizontal e vertical — esquema 23 → 24 (Prometeus).** Detalhe
  completo em "Status atual" (topo). Resumo: usuário contou os 23 slots na tela (facilitado pela
  lista redesenhada da entrada anterior) e confirmou faltar a interseção "+" entre uma faixa fina
  horizontal e uma coluna fina vertical (4 cardeais preenchidos, 4 diagonais vazias ao mesmo tempo
  — caso novo, diferente de preenchimento normal ou de um entalhe de 2 diagonais). Novo papel
  `thinCross` em `types.ts`/`autotile.ts`, nova seção no editor de grupo de terreno, 3 testes
  novos/atualizados (33 no total) incluindo um cruzamento "+" de verdade construído célula a
  célula. `e2e/terrain-group-list.spec.ts` ganhou uma assertion de contagem total (24), pra não
  precisar contar de novo manualmente numa próxima rodada. Verificado: `tsc -b`, `npm test`
  (201/201), `npm run build`, `npm run lint`, `npm run test:e2e` (8/8) — todos limpos.
- 2026-09-25 (mais uma rodada, a última desta sessão): **Lista de terrenos redesenhada (ícone +
  nome) + confirmado por teste E2E que as seções novas de autotile já funcionavam (Prometeus).**
  Detalhe completo em "Status atual" (topo). Resumo: usuário reportou "não vejo os casos novos"
  com print da lista de terrenos — investigado com um teste E2E de verdade
  (`e2e/terrain-group-list.spec.ts`, cria tileset + terreno + confere as 3 seções), que passou de
  primeira, confirmando que a lógica sempre esteve certa (suspeita: servidor de dev não recarregou,
  ou tileset não foi resalvo/sessão de pintura não foi reaberta). O pedido de UI em si (ícone
  quadrado + nome na lista, no lugar do botão de texto solto) foi implementado —
  `TileCanvas` novo (extraído de `TileThumb`, sem `<button>` embutido, pra caber dentro de outro
  botão sem aninhar) + `.terrain-group-item`/`.terrain-group-icon`/`.terrain-group-name` em
  `index.css`, mesmo estilo de `.character-list` já usado no resto da página. Verificado: `tsc -b`,
  `npm test` (199/199), `npm run build`, `npm run lint`, `npm run test:e2e` (8/8) — todos limpos.
- 2026-09-25 (mais uma rodada ainda): **Regressão real: o próprio ajuste de "borda do mapa
  seamless" quebrava formas côncavas/finas perto da borda — corrigido separando resolução de papel
  e corte de borda (Prometeus).** Detalhe completo em "Status atual" (topo). Resumo: reportado com
  print de uma moldura oca de terreno encostada na borda, com cantos "bugados" — reproduzido
  isoladamente com um script usando `resolveTerrainRole`/`terrainRoleAt` direto (sem precisar do
  navegador), confirmando a causa raiz: o `isMemberOrEdge` da entrada anterior fazia a vizinhança
  "enxergar" a borda do mapa como pertencente DIRETO dentro de `terrainRoleAt`, o que fazia um
  canto de verdade de uma moldura oca virar canto INTERNO (os 4 cardeais "pareciam" preenchidos).
  Corrigido com `trimRoleForMapEdges` (novo, `autotile.ts`, pura/testada) — resolve o papel com
  pertencimento REAL primeiro, corta a borda que toca o mapa DEPOIS. 6 testes novos (31 no total),
  inclusive um de regressão reproduzindo a moldura oca exata. Verificado: `tsc -b`, `npm test`
  (199/199), `npm run build`, `npm run lint`, `npm run test:e2e` (7/7) — todos limpos.
- 2026-09-25 (mais uma rodada): **2 bugs reais reportados pelo usuário testando a rodada anterior
  de autotile: glifos de bloco fino invertidos + faltava a ponta do bloco fino (esquema de 19 → 23,
  Prometeus).** Detalhe completo em "Status atual" (topo). Resumo: glifos ↕/↔ de
  `thinHorizontal`/`thinVertical` estavam trocados (a lógica sempre esteve certa, só o ícone
  enganava o usuário a atribuir a arte no slot errado) — corrigido, mas o usuário precisa
  reatribuir a arte já feita. 4 papéis novos (`thinVerticalTop`/`thinVerticalBottom`/
  `thinHorizontalLeft`/`thinHorizontalRight`) pro FIM de uma coluna/faixa fina, que antes
  reaproveitava um canto normal (assumia terreno que não existe pros dois lados). 12 testes
  atualizados/novos em `tests/autotile.test.ts` (25 no total, 3 deles corrigindo a mesma
  expectativa errada documentada). Verificado: `tsc -b`, `npm test` (193/193), `npm run build`,
  `npm run lint`, `npm run test:e2e` (7/7) — todos limpos.
- 2026-09-25 (ainda mais tarde): **Dois ajustes de autotile pedidos pelo usuário depois de testar
  a fase real (prints em mãos): borda do mapa "seamless" + esquema de 13 → 19 papéis (Prometeus).**
  Detalhe completo em "Status atual" (topo). Resumo: `StageSession.tsx`/`applyTerrainAt` ganhou
  `isMemberOrEdge` (fora da grade = "pertence ao terreno", só pra RESOLVER PAPEL — não pra decidir
  quais células revisar) pras 4 bordas do mapa pararem de desenhar uma "beira" onde deveria parecer
  chão contínuo; `autotile.ts`/`types.ts` ganharam 6 papéis novos —
  `thinVertical`/`thinHorizontal` (bloco fino: coluna/faixa de 1 célula só tinha 1 borda desenhada,
  a oposta "sumia") e `notchTop`/`notchBottom`/`notchLeft`/`notchRight` (2 diagonais ADJACENTES
  vazias ao mesmo tempo, ex. junção em T — antes caía tudo em preenchimento, escondendo o recorte).
  2 diagonais OPOSTAS ou 3/4 vazias continuam sem variante (decisão de escopo, documentado).
  `TilesetEditor.tsx` ganhou 2 seções novas opcionais no editor de grupo de terreno. 13 testes de
  `tests/autotile.test.ts` atualizados/adicionados (23 no total, 2 deles corrigindo uma expectativa
  que documentava o próprio bug). Verificado: `tsc -b`, `npm test` (191/191), `npm run build`,
  `npm run lint`, `npm run test:e2e` (7/7) — todos limpos. **Fasing explícito:** nenhum E2E
  dedicado pra esses dois ajustes ainda (difícil de asserir sem comparação de pixel; usuário deve
  confirmar visualmente, ver "Próximo passo").
- 2026-09-25 (mais tarde): **Duas dívidas técnicas antigas pagas: infra de teste Playwright
  permanente + quantização automática de paleta (Prometeus).** Detalhe completo em "Status atual"
  (topo). Resumo: `e2e/` (Playwright, `npm run test:e2e`) sobe o próprio dev server isolado em
  pastas temporárias (`PROMETEUS_E2E_GFX_DIR`/`PROMETEUS_E2E_TILESET_DIR`, nunca os arquivos reais
  — incidente real evitado de propósito), 7 specs cobrindo CRUD de tileset, pintar+salvar fase,
  upload de cenário, quantização de paleta (2 specs) e regressão dos 2 bugs reais (bandeira herdada
  do bloco 0; orçamento de VRAM de fase larga). `lib/quantizePalette.ts` (median-cut, 6 testes
  unitários) + `QuantizeConfirmModal.tsx` reduzem automaticamente uma imagem com mais de 16 cores,
  sempre com prévia antes/depois e confirmação explícita — ligado nos 2 pontos reais de upload
  fresco (`useImageUpload.ts`, `TilesetEditor.tsx`). Nenhuma mudança em `docs/DATA_FORMAT.md`.
  Verificado: `tsc -b`, `npm test` (185/185), `npm run build`, `npm run lint`, `npm run test:e2e`
  (7/7) — todos limpos. **Fasing explícito** (documentado em "Próximo passo"): E2E do fluxo
  completo de personagem (SpriteSheetEditor) e de reabrir/editar fase salva ainda não existem.
- 2026-09-25: **Largura de fase virou configurável de verdade, por fase
  (Prometeus) — resposta ao pedido da Anubis de "trazer de volta a
  viewport/minimapa grande e liberar fases largas de verdade" depois dela
  fechar 🟡 o streaming do lado dela.** Detalhe completo em "Status atual"
  (topo). Resumo: `types.ts` trocou a constante fixa de largura por
  `isValidStageWidthTiles()`/`stageWidthPixels()` (múltiplo de 32, até
  480 — altura continua fixa em 32, restrição real e permanente da
  Anubis); `stageGridCols`/`composeLevel`/`generateCollisionHeader`
  passam a receber a largura como parâmetro; `reconstructStage.ts` e
  `stageTilesetRefs.ts` foram atualizados pra validar/persistir/recuperar
  essa largura ao reabrir uma fase salva (sidecar antigo sem o campo
  assume 32, mantendo compatibilidade); `StageSession.tsx` ganhou um
  aviso de orçamento de VRAM por camada (256 tiles únicos na Camada 1,
  128 na Camada 2 — números conferidos em `docs/ARCHITECTURE.md` da
  Anubis, índice de PALAVRA); `StageWorkspace.tsx` ganhou um seletor de
  largura que só lista valores válidos (impede escolha inválida na hora,
  não só avisa no export). `docs/DATA_FORMAT.md` § 4 ganhou uma entrada
  sobre esse orçamento de VRAM (sincronizada com a Anubis). Formato de
  arquivo exportado inalterado. Verificado: `tsc -b`, `npm test`
  (179/179), `npm run build`, `npm run lint` limpos. **Ainda falta**
  (fora deste projeto): exportar uma fase larga real e um humano jogar
  até o fim no emulador.
- 2026-09-24 (noite): **Anubis destravou fases largas de verdade — o
  "bloqueio do lado da Anubis" da entrada abaixo (posição estourando em
  ~511px) foi resolvido e testado.** Nada implementado deste lado. O jogo
  agora aceita e anda por fases de até 480 colunas (15 páginas), com as
  mesmas restrições de sempre: **altura 32 linhas, largura múltipla de
  32** (o build da Anubis quebra com `#error` claro se não). Formato de
  arquivo inalterado. Destrava a viewport/minimapa grande deste lado —
  falta só uma fase larga REAL exportada daqui pra o usuário jogar até o
  fim (validação final). Detalhe: `docs/PROGRESS.md` da Anubis e
  `docs/DATA_FORMAT.md` § 4 (sincronizado).
- 2026-09-24: **Anubis implementou o consumo de streaming de tilemap (fase
  B, proposta v3 de `docs/DATA_FORMAT.md` § 4 — seção atualizada e
  sincronizada nos dois projetos, marcada 🟡 PARCIALMENTE implementada).**
  Nada implementado deste lado. **Restrições de export que o Prometeus
  precisa respeitar quando a fase B dele existir:** (1) altura da fase =
  32 linhas SEMPRE (o streaming da Anubis só pagina no eixo X; uma fase
  96x64 como a do teste de hoje agora QUEBRA o build da Anubis com uma
  mensagem `#error` clara, em vez de renderizar lixo em silêncio); (2)
  largura em múltiplos de 32 colunas (mesmo `#error`). O formato em si
  (`stageN_tilemap.bmp`/`_collision.h`/`_entities.h`, linha-major) NÃO
  muda — o `gfx4snes` já reorganiza o `.map` em páginas de 32x32
  sozinho (achado testado, detalhe na seção). **Bloqueio do lado da
  Anubis, não deste:** posição de jogador/inimigo estoura acima de ~511px
  (`fx16`), então fases largas ainda não são jogáveis até lá — ver
  `docs/PROGRESS.md` da Anubis. **Atenção:** o dev server deste projeto,
  aberto sem fase selecionada, reescreveu os `stage1_*` da Anubis no meio
  dos testes dela — vale evitar deixá-lo rodando enquanto a Anubis testa.
- 2026-09-24: **Bug real relatado pelo usuário JOGANDO — fase salva com
  96x64, Anubis não consegue exibir (só `SC_32x32`).** O estado de teste
  temporário registrado desde a sessão anterior (`STAGE_WIDTH_TILES`/
  `HEIGHT_TILES` = 96/64 em `types.ts`, pra testar viewport/minimapa)
  nunca foi revertido, e uma fase real chegou a ser salva nesse tamanho —
  o usuário confirmou em `../jogo-plataforma-snes/assets/gfx/
  stage1_collision.h` que `STAGE1_COLLISION_COLS`/`ROWS` estavam 96/64.
  **Corrigido:** revertido `STAGE_WIDTH_TILES`/`HEIGHT_TILES` pra 32/32.
  Investigado (não presumido) o que acontece ao reabrir essa `stage1`
  96x64 depois do revert — os dois caminhos de carregamento
  (`loadStage.ts`: referência por nome, e fallback de reconstrução por
  pixel) JÁ tinham checagem de tamanho que lança ANTES de ler qualquer
  dado fora da faixa (`stageTilesetRefs.ts`/`reconstructStage.ts`) — só a
  mensagem do fallback (`reconstructStage.ts`) estava crua/técnica,
  trocada por uma que explica o que fazer ("repinte a fase inteira dentro
  desse tamanho e salve de novo"). `StageWorkspace.tsx` já tinha
  `try/catch` mostrando esse erro na tela (`sessionError`) — não trava,
  não corrompe, não mostra tela branca. Novo teste de regressão
  reproduzindo o cenário exato em `tests/reconstructStage.test.ts`. Nada
  em `assets/tilesets/`/`assets/gfx/stage1_*` foi tocado — só código,
  teste e este documento; repintar/resalvar a `stage1` dentro de 32×32
  continua sendo ação do usuário, registrada em "Próximo passo".
  Verificado: `tsc -b`, `npm test` (167/167), `npm run build`, `npm run
  lint` — todos limpos.
- 2026-09-24: **Lata de tinta (flood fill) no pincel de bloco avulso —
  feature NOVA de verdade** (diferente das etapas anteriores do mesmo
  dia, que foram só reorganização visual). Novo botão "Balde" ao lado da
  "Borracha" na barra de ferramentas de Fases; pinta com o bloco
  selecionado todos os blocos ADJACENTES iguais ao clicado (flood fill
  4-conectado, 1 clique só, nunca arrasta). Opera na granularidade do
  blockSize do bloco selecionado (não célula de hardware individual —
  mesmo motivo de `applyTerrainAt`/terrenos inteligentes: sub-tiles de um
  bloco de 16/32px são diferentes entre si). Ver "Status atual" pro
  detalhe completo, incluindo a limitação aceita conscientemente (blocos
  pintados fora do grid alinhado ao blockSize podem não ser identificados
  certinho). Verificado: `tsc -b`, `npm run build`, `npm run lint` —
  limpos. Não testado num navegador de verdade por nós.
- 2026-09-24: **Reestilizar a interface no espírito Lunar Magic — Fase 1
  (navegação + barra de ferramentas de Fases), reorganização visual pura,
  zero funcionalidade nova/removida (instrução explícita do usuário).**
  Feito em cima do pedido anterior de testar o viewport com uma fase
  maior (`STAGE_WIDTH_TILES`/`HEIGHT_TILES` ainda em 96/64, estado de
  teste temporário — ver "⚠️" no topo de "Status atual", NÃO revertido
  ainda). Também fruto de 2 pedidos menores de ajuste de UI logo antes
  desta etapa maior, todos já aplicados: (a) espaçamento entre o canvas e
  "Salvar fase no jogo" (estavam grudados); (b) paleta de bloco avulso
  recolhida — só o bloco ATUALMENTE selecionado aparece na barra (não a
  grade inteira, que ficava com layout quebrado com tilesets de muitos
  blocos, ex. um "grama" de 13 variantes de terreno); clicar abre um
  MODAL (`TilePickerModal`, React portal pro `document.body`, escapa do
  `overflow-y: auto` da barra — fade + leve "pop" de escala ao abrir,
  respeitando `prefers-reduced-motion`) com a grade completa pra escolher
  outro bloco; rótulos de texto acima dos ícones de tileset/terreno
  removidos (pedido explícito: "eu vou entender só com os ícones mesmo"
  — a informação continua no `title`/tooltip de cada ícone, só não fica
  mais sempre visível).
  **Antes de redesenhar qualquer coisa, inventário completo** de tudo que
  a interface permite fazer hoje, tela por tela, direto do código-fonte
  (não do `PROGRESS.md`, que podia estar desatualizado) — delegado a um
  agente de exploração dedicado pra não arriscar esquecer algo pequeno.
  Confirmou que NÃO existe hoje: toggle de visibilidade de Camada 2
  durante a pintura, zoom no canvas (`GRID_DISPLAY_SCALE` é constante
  fixa), desfazer/refazer genérico (só "Desfazer último" bem específico
  do rascunho de animação em `AnimationSequencer.tsx`, não é undo de
  verdade), ou botão de testar/rodar a fase num emulador
  (`BuildStatus.tsx`/`useEngineBuild.ts` só reportam status de compilação
  da ROM, nunca lançam nada). Nenhuma dessas 4 coisas entrou no redesign.
  **Mudanças:**
  1. `App.tsx` — os 3 botões de navegação (Personagens/Tilesets/Fases)
     ganharam um ícone SVG original simples (retangular/"quadriculado",
     sem curva suave — mesmo espírito pixel-art do resto da UI, `fill:
     currentColor` herda a cor do botão) ao lado do texto — mesma
     navegação/lógica de sempre, só visual.
  2. `StageSession.tsx` — "Colocar/Mover jogador" e "Adicionar inimigo"
     saíram de dentro do painel que só existia depois de trocar
     manualmente pro modo "Personagens" e foram pra dentro da MESMA barra
     de ferramentas sempre visível do topo, junto com bloco avulso/
     terreno/borracha (pedido explícito: "modo de pincel" vira um grupo
     sempre visível, não escondido atrás de um modo). Clicar em qualquer
     um dos dois agora troca pro modo "Personagens" sozinho. O rádio
     Pintar/Personagens explícito continua do lado, de propósito: é o
     único jeito de entrar em "Personagens" SEM efeito colateral nenhum
     (só arrastar um marcador já existente) — removê-lo tiraria uma
     capacidade que existe hoje.
  **Escopo decidido com o usuário (fasear):** Tilesets e Personagens
  ficam de fora desta etapa — Personagens (`SpriteSheetEditor.tsx`) é
  identificado como o maior risco (formulário longo de várias etapas,
  bastante estado interdependente), fica pra uma decisão futura.
  Verificado: `tsc -b`, `npm run build`, `npm run lint` — limpos. `npm
  test` NÃO rodado nesta etapa (o estado de teste temporário de
  `STAGE_WIDTH_TILES`/`HEIGHT_TILES` quebra 1 teste esperado — reverter
  antes de rodar de novo). Não testado num navegador de verdade por nós —
  usuário testando interativamente na própria sessão.
  **Refinamento no mesmo dia, depois do 1º teste do usuário:** barra
  agora esconde/mostra por modo (Pintar vs Personagens, em vez de
  misturar tudo sempre visível); "Colocar jogador"/"Adicionar inimigo"
  viraram ícones `EntityPickerThumb` no mesmo modelo do `TileThumb`
  (sprite idle de verdade, encaixado/contain num ícone 32px — não mais
  botões amarelos genéricos); 1 ícone por tipo de inimigo cadastrado
  (`enemySlots.ts`) em vez de um botão único sempre com o tipo padrão;
  tamanho do botão "Borracha" corrigido pra bater com os blocos de
  tileset ao lado (40px total, não 32px). Ver "Status atual" pro detalhe
  completo.
- 2026-09-23: **Preparar o editor pra fases maiores — Fase B
  (`StageSession.tsx`), pedido do usuário depois de revisar a
  documentação atualizada.** Continuação direta da Fase A (abaixo) — os
  eixos independentes `STAGE_WIDTH_TILES`/`STAGE_HEIGHT_TILES` já
  existiam em `types.ts`, faltava `StageSession.tsx` (o único lugar ainda
  usando o alias quadrado `STAGE_LEVEL_PIXELS`) migrar de verdade e a UI
  ganhar viewport rolável + minimapa.
  **Migração de eixos:** todo uso de `STAGE_LEVEL_PIXELS` trocado pelo
  eixo certo — `clampStagePixel` virou duas funções (`clampStagePixelX`/
  `clampStagePixelY`, já que X e Y agora podem ter limites diferentes),
  `HIDDEN_ROWS_TOP_PERCENT` (faixa fora da área visível) usa altura,
  coleira de patrulha usa largura (ela é sempre horizontal), marcador de
  jogador/inimigo usa cada eixo pro seu próprio `left`/`top`, limites do
  pincel avulso e do pincel de terreno inteligente (`paintCell`/
  `applyTerrainAt`) ganharam `HARDWARE_ROWS` ao lado do já existente
  `HARDWARE_COLS`, `cellFromClient` calcula o fator de escala X e Y
  SEPARADAMENTE (achado ao revisar: usava só um fator pros dois eixos,
  funcionava só por coincidência de a fase sempre ter sido quadrada).
  `STAGE_LEVEL_PIXELS` foi REMOVIDO de `types.ts` de vez (não sobrou
  nenhum uso, nem em produção nem em teste — `tests/tilemap.test.ts` e
  `tests/reconstructStage.test.ts` migrados pros eixos novos também).
  **Viewport rolável + minimapa (pedido explícito do usuário, item 2 da
  tarefa original):** a área de pintura agora é um `.stage-viewport`
  (`overflow: auto`) em volta do `.stage-grid-wrapper` de sempre — o
  canvas passou a renderizar sempre no tamanho NATIVO dele (removido o
  `width: 512px; height: 512px` fixo do CSS, que forçava quadrado), quem
  decide o que fica visível é o viewport ao redor. Tamanho máximo do
  viewport é uma constante só (`VIEWPORT_MAX_SIZE_PX`, 512px) passada como
  estilo inline — hoje a fase inteira cabe dentro disso sem rolar nada;
  só quando a fase real crescer (Anubis fechar 🟢 o streaming) que a
  rolagem entra em ação de verdade, sem precisar mudar código nenhum.
  Minimapa: miniatura do canvas principal (mesmo `useEffect` de desenho,
  evita depender de ordem entre dois efeitos) + retângulo mostrando o
  que está visível agora (`viewportRect`, atualizado no `onScroll`) +
  clique pra pular o viewport pra ali. Só renderiza quando sobra algo
  fora do viewport (`viewportRect.width < 1 || height < 1`) — decisão de
  UX: com a fase do tamanho atual isso nunca acontece, então o minimapa
  fica invisível por enquanto (mecanismo pronto, sem poluir a tela à
  toa).
  **Posicionamento de entidade "fora de uma tela só" (item 3 da tarefa)
  saiu de graça** da migração de eixos — os clamps de posição já usam os
  limites reais (`STAGE_WIDTH_PIXELS`/`STAGE_HEIGHT_PIXELS`), não um
  número fixo, então não tem mais nada hardcoded em 256px esperando pra
  quebrar quando a fase crescer.
  **Deixado de fora de propósito (documentado, não é dívida técnica
  escondida):** auto-scroll do viewport ao arrastar entidade/pintar perto
  da borda (sem necessidade prática ainda), e não há listener de resize
  de janela pro retângulo do minimapa (só atualiza no scroll ou quando o
  canvas é redesenhado).
  Verificado: `tsc -b`, `npm test` (166/166), `npm run build`, `npm run
  lint` — todos limpos, zero mudança visual/de comportamento observável
  hoje (a fase 256x256 continua cabendo inteira, sem barra de rolagem
  nem minimapa aparente) — a infraestrutura só entra em ação quando a
  fase real crescer. Não testado num navegador de verdade (sem
  ferramenta de automação disponível nesta sessão) — pendência registrada
  em "Próximo passo".
- 2026-09-23: **Preparar o editor pra fases maiores — Fase A (modelo de
  dados), decisão explícita do usuário de fasear.** Objetivo final
  (confirmado com o usuário): fase longa de verdade, sem teto artificial —
  depende da Anubis fechar 🟢 a proposta de streaming de tilemap
  (`docs/DATA_FORMAT.md` § 4, v3, ainda 🟡 rascunho — **não implementei
  parser/export nenhum pro formato final**, só confirmei o status antes de
  mexer em qualquer coisa, regra de sempre desta doc). Antes de codar,
  levantei o escopo real (`grep` de `STAGE_LEVEL_PIXELS`/`HARDWARE_COLS`/
  `32*32` no repo): achei a suposição de "fase sempre quadrada 32x32"
  espalhada por 5 arquivos da lib (`types.ts`, `compose.ts`,
  `exportTilemap.ts`, `reconstructStage.ts`, `stageTilesetRefs.ts`) E mais
  de 30 lugares dentro de `StageSession.tsx` (matemática de porcentagem
  pra posição de marcador/coleira de patrulha, limites de pincel, aviso de
  proporção de bandeira, faixa invisível do SNES) — bem maior do que
  parecia à primeira vista, exatamente o tipo de achado que a tarefa pediu
  pra reportar e propor fasear em vez de assumir sozinho. Perguntei ao
  usuário: ele escolheu **só a Fase A agora** (modelo de dados, sem mexer
  em `StageSession.tsx`) — viewport rolável + minimapa (item 2 do pedido)
  e a generalização do cálculo de posição/limite que hoje assume fase
  quadrada (parte do item 3) ficam pra uma etapa futura.
  **O que foi generalizado (Fase A):** `types.ts` trocou o `STAGE_LEVEL_PIXELS`
  único (assumia fase quadrada) por `STAGE_WIDTH_TILES`/`STAGE_HEIGHT_TILES`
  independentes (hoje ambos 32, cada um deve continuar múltiplo de 32 — "1
  tela" — pra quando o streaming da Anubis decidir o tamanho real) +
  `STAGE_WIDTH_PIXELS`/`STAGE_HEIGHT_PIXELS` derivados; `stageGridCols`/
  nova `stageGridRows` calculam cada eixo a partir do seu próprio
  tamanho, em vez de uma função só assumindo os dois iguais.
  `compose.ts`/`exportTilemap.ts`/`reconstructStage.ts` pararam de
  reusar a MESMA variável "HARDWARE_COLS" pra linhas E colunas (bug latente
  que só nunca apareceu por largura e altura serem sempre iguais até
  agora) — cada um ganhou seu par `HARDWARE_COLS`/`HARDWARE_ROWS` próprio,
  usado no eixo certo. `stageTilesetRefs.ts` trocou o `32*32` hardcoded
  por `stageGridCols(HARDWARE_TILE_SIZE) * stageGridRows(...)`.
  `STAGE_LEVEL_PIXELS` continua existindo como alias de transição — SÓ
  `StageSession.tsx` ainda usa (fica correto enquanto largura=altura,
  que é sempre o caso até a Fase B mexer nele), documentado explicitamente
  como temporário, não um shim de compatibilidade externa.
  Verificado: `tsc -b`, `npm test` (166/166, 1 caso novo confirmando os
  novos eixos/derivações), `npm run build`, `npm run lint` — todos
  limpos. Nenhuma mudança visual/de comportamento: a fase continua
  32x32/256x256 igual a sempre, só parou de estar hardcoded em 5+ lugares
  diferentes.
  **Pendente pra próxima etapa (Fase B, não feita agora — escolha do
  usuário):** `StageSession.tsx` migrar de `STAGE_LEVEL_PIXELS` pros eixos
  independentes de verdade (hoje ainda assume quadrado em toda a
  matemática de porcentagem/limite), viewport com scroll/pan + minimapa
  estilo Lunar Magic (a tela de pintura hoje sempre mostra o mapa inteiro
  de uma vez, não escala pra fase grande), e posicionamento de
  jogador/inimigo funcionando fora do range de uma tela só. Tudo isso
  ainda NÃO depende do formato final da Anubis fechar — só depende de
  decisão de design da própria UI do Prometeus.
- 2026-09-23: **Bug real relatado pelo usuário JOGANDO** (não achado por
  nós): reautorou a `stage1` do zero (os arquivos `stage1_*` tinham sumido
  do disco, causa não determinada) com o tileset "grama + goalpost" e a
  fase passou a dar "FASE COMPLETA" sozinha assim que o jogador nascia.
  Evidência concreta que o usuário trouxe: `stage1_collision.h` tinha 632
  de 1024 células como bandeira (2), 392 como sólido (1) e **ZERO como
  vazio (0)**. Hipótese dele: um default incorreto (bandeira em vez de
  vazio) ao adicionar bloco novo a um tileset.
  **Investigação (não presumi a hipótese — conferi o código):** todo
  fallback de colisão no repo é `?? 'empty'` (`tilesetAsset.ts`,
  `exportTilemap.ts`, `reconstructStage.ts`) — não existe nenhum default
  pra bandeira em lugar nenhum. A causa real é mais sutil: a grade da
  Camada 1 (`grid` em `StageSession.tsx`) nasce um `Uint16Array` zerado, e
  a Camada 1 **nunca tem "vazio" de verdade** (já era assim antes desta
  sessão) — toda célula nunca pintada guarda implicitamente o índice de
  tile de hardware `0`, que é sempre o BLOCO 0 do PRIMEIRO tileset
  escolhido pra fase (confirmado matematicamente: `blockToHardwareTopLeft`
  do bloco 0 de qualquer blockSize sempre cai no índice de hardware 0). Se
  esse bloco específico estiver marcado como bandeira (ou sólido, sem
  querer), TODA a área nunca pintada da fase herda essa colisão em
  silêncio. As contas batem exatas: 632 = 1024 − 392 (as células de chão
  que o usuário realmente pintou) — ou seja, toda célula NÃO pintada saiu
  como bandeira, exatamente o que essa mecânica prevê. Reproduzido com
  teste dedicado (`tests/tilemap.test.ts`, "reproduz o achado real").
  **Correções (Prometeus, puramente aba Fases/Tilesets — zero mudança em
  `DATA_FORMAT.md`/Anubis, o contrato 0/1/2 continua igual):**
  1. Nova função pura `summarizeCollision` (`exportTilemap.ts`) conta
     quantas células de cada tipo de colisão a fase exportaria; `StageSession.tsx`
     mostra um aviso (borda vermelha, mesmo peso visual de um erro) sempre
     que mais de 5% da grade (`GOAL_WARNING_RATIO`) sair como bandeira —
     acima disso é bem mais que um goalpost de verdade costuma ocupar. O
     botão "Salvar fase no jogo" fica desabilitado até o usuário marcar
     explicitamente uma caixa "Confirmo que é isso mesmo, salvar assim."
     (nunca bloqueia de vez — só exige confirmação consciente).
  2. O bloco 0 do 1º tileset da fase agora ganha um contorno laranja +
     tooltip ("bloco PADRÃO: cobre toda célula da Camada 1 nunca pintada")
     na paleta de blocos da aba Fases, pra deixar claro visualmente que
     aquele slot específico é especial — não dá pra marcar isso de forma
     confiável na aba Tilesets sozinha, porque a ordem dos tilesets (e
     portanto qual deles vira "o 1º") só é decidida na hora de montar a
     fase, não no cadastro do tileset.
  Verificado: `tsc -b`, `npm test` (165/165, 4 casos novos), `npm run
  build`, `npm run lint` — todos limpos. Sem teste num navegador de
  verdade (sem ferramenta de automação de navegador disponível nesta
  sessão) — o usuário deve confirmar visualmente o aviso/indicador antes
  de considerar isso fechado de vez.
- 2026-09-23: **Anubis implementou câmera + scroll de hardware (fase A de
  um roadmap novo de scroll) e registrou um RASCUNHO de streaming de
  tilemap pra fases longas em `docs/DATA_FORMAT.md` § 4, como proposta 🟡
  "v3" (sincronizado nos dois `DATA_FORMAT.md` — este arquivo já reflete
  a versão nova).** Zero implementação pedida do lado do Prometeus ainda
  — é só uma proposta com números reais (janela de VRAM, gatilho de
  streaming, orçamento de RAM/ROM, formato de export) pra destravar
  discussão em paralelo; nenhum parser/exportador de fase longa deve ser
  implementado antes dela fechar 🟢. Ponto que PODE interessar esta sessão
  cedo: a proposta assume o formato de export atual (`stageN_tilemap.bmp`/
  `_collision.h`, row-major) continua igual, só ESTENDIDO em tamanho — não
  pede mudança de convenção nenhuma por enquanto. Ver `docs/PROGRESS.md`
  da Anubis (jogo-plataforma-snes) pro detalhe completo da implementação
  da câmera (fora do escopo deste projeto).
- 2026-09-23: Complemento de tilesets inteligentes — cantos internos (9 →
  13 variantes), puramente Prometeus (mesma garantia da etapa anterior:
  zero mudança em `DATA_FORMAT.md`/Anubis, a grade exportada continua
  sempre o bloco já resolvido). Achado do usuário: o esquema de 9
  variantes (só vizinhos cardeais) não representa um canto CÔNCAVO/interno
  — chão sólido com um recorte de 1 célula numa quina caía todo em
  "preenchimento", escondendo o recorte.
  **Decisão: 13 variantes, não o blob completo de 47.** As diagonais só
  entram em jogo quando os 4 cardeais JÁ estão preenchidos (célula que
  seria "preenchimento") — aí sim, EXATAMENTE 1 diagonal vazia vira o
  canto interno daquela quina específica (`innerTopLeft`/`innerTopRight`/
  `innerBottomLeft`/`innerBottomRight`, novos papéis em `TERRAIN_INNER_
  CORNER_ROLES`, `types.ts`). O blob de 47 resolveria também o caso de 2+
  diagonais vazias simultâneas na mesma célula (várias combinações de
  canto duplo/canto oposto) — aqui isso **cai em preenchimento por
  decisão explícita de escopo, documentada e testada** (não é bug):
  representar cada combinação possível de diagonais exigiria as ~38
  variantes a mais que o esquema de 13 deliberadamente não cobre. Um
  cardeal vazio nunca olha diagonal (o esquema de 9 original continua
  valendo sozinho nesse caso) — só quando os 4 cardeais fecham é que a
  checagem de diagonal decide preenchimento-de-verdade vs. canto interno.
  **Fronteira entre grupos:** nenhuma mudança de código foi necessária —
  "pertencer ao grupo" já era decidido por um `Set` dos valores de cada
  variante DAQUELE grupo (`groupValues` em `applyTerrainAt`,
  `StageSession.tsx`), então uma célula de outro grupo (ou bloco avulso,
  ou nada pintado) já contava como "vazio" tanto pros cardeais quanto
  pelas novas diagonais — confirmado com teste dedicado, não presumido.
  **Reavaliação de vizinhos agora cobre as 8 células ao redor** (antes só
  as 4 cardeais) — `terrainCellsToReevaluate` (autotile.ts) ganhou os 4
  candidatos diagonais; `StageSession.tsx` não precisou de nenhuma mudança
  (já chamava essa função genericamente, sem assumir quantidade de
  vizinhos).
  **UI:** `TilesetEditor.tsx`/`TerrainGroupEditor` ganhou uma seção
  separada "Cantos internos (opcional)" abaixo do mini-grid 3x3 principal
  (não polui a grade já pronta) — mesmo mecanismo de atribuição (clique
  abre a lista de blocos do tileset), glifos de triângulo cheio (◤◥◣◢)
  pra diferenciar visualmente dos cantos convexos (setas ↖↗↙↘).
  Testes novos em `tests/autotile.test.ts` (17 no total no arquivo, 8
  novos): 1 diagonal vazia por quina (as 4 combinações), 2+ diagonais
  vazias simultâneas (cai em fill, sem lançar/travar), cardeal vazio nunca
  olha diagonal, chão sólido retangular fechado (5x5, nenhuma célula vira
  canto interno), recorte de 1 célula numa quina (gera EXATAMENTE 1 canto
  interno, na célula certa — os vizinhos ao redor continuam sem canto
  interno nenhum), fronteira entre 2 grupos (nunca mistura, tanto pro caso
  cardeal quanto pro caso diagonal), e reavaliação de vizinhos agora
  incluindo diagonal (+ confirmação de que diagonal NÃO-membro continua de
  fora).
  Verificado: `tsc -b`, `npm test` (163/163), `npm run build`, `npm run
  lint` — todos limpos. Mesma ressalva da etapa anterior: sem teste num
  navegador de verdade (sem ferramenta de automação de navegador
  disponível nesta sessão).
- 2026-09-23: Tilesets inteligentes (autotile) — esquema de 9 variantes
  (borda + canto + preenchimento), puramente Prometeus (zero mudança em
  `DATA_FORMAT.md`/Anubis: a grade pintada continua guardando sempre o
  bloco CONCRETO já resolvido, exatamente como antes — autotile é só uma
  conveniência de PINCEL, não um formato novo). Pedido do usuário, com
  investigação prévia obrigatória e proposta de fasear antes de codar (fez
  parte do próprio pedido) — usuário escolheu implementar tudo numa etapa
  só em vez de fasear.
  **Achado da investigação (mudou o desenho):** a grade (`grid`/
  `gridLayer2`) é indexada por tile de HARDWARE (8px), não por bloco — um
  bloco de 16/32px pintado ocupa várias células de hardware, cada uma com
  um valor DIFERENTE (sub-tile sequencial), não um "ID de bloco" único
  repetido. Sem um índice reverso "hardware -> bloco" persistido em
  lugar nenhum, "esta célula pertence ao grupo de terreno X?" é decidido
  comparando o valor gravado no canto superior esquerdo de cada célula do
  grupo contra o conjunto (`Set`) dos valores de topo-esquerda de cada
  variante já atribuída — barato (checagem de conjunto, não busca reversa)
  e não precisa de nenhuma estrutura nova gravada. Consequência: o pincel
  de terreno SEMPRE pinta alinhado ao blockSize do PRÓPRIO tileset do
  grupo, ignorando o "Passo do cursor" livre (`StageSession.tsx`,
  `activeStep`) — um carimbo desalinhado quebraria essa checagem de
  vizinhança.
  **Achado de bitmask confirmado (a tarefa pediu pra verificar antes de
  implementar):** o esquema de 9 variantes NÃO precisa checar diagonal —
  papel de linha (topo/meio/baixo) só depende de norte/sul, papel de
  coluna (esquerda/meio/direita) só depende de leste/oeste, os dois eixos
  são independentes e a combinação já cobre as 9 variantes exatamente.
  Diagonal só entraria no esquema completo de 47 variantes (cantos
  côncavos/internos), fora de escopo. Por isso reavaliar só a célula + os
  4 vizinhos ORTOGONAIS (nunca diagonal) já é suficiente depois de pintar/
  apagar — motor puro em `src/lib/tilemap/autotile.ts`
  (`resolveTerrainRole`, `terrainRoleAt`, `terrainCellsToReevaluate`),
  testado isolado (`tests/autotile.test.ts`, 9 casos: célula isolada cai
  em topLeft por convenção — não existe uma 10ª variante de "ilha" nesse
  esquema —, cercada nos 4 lados vira fill, linha horizontal de 3 vira
  topLeft/top/topRight — o "topo de uma plataforma" —, coluna vertical de
  3 vira topLeft/left/bottomLeft — uma "parede" —, formação em L resolve
  os 3 cantos externos corretamente mas deixa o canto côncavo interno sem
  tratamento especial de propósito, e os testes de `terrainCellsToReevaluate`
  confirmam que um vizinho diagonal nunca entra na lista de reavaliação e
  que apagar uma célula reavalia só quem sobrou).
  **Onde o agrupamento fica persistido:** novo campo `terrainGroups:
  TerrainGroup[]` em `<nome>_tileset.json` (`TilesetMeta`, `types.ts`/
  `tilesetAsset.ts`) — cada grupo tem nome, UMA colisão/camada pro grupo
  inteiro (não por variante — as 9 são a mesma coisa de gameplay, só
  mudam visualmente) e `roles: Partial<Record<TerrainRole, number>>`
  (papel -> índice de bloco já existente do tileset; papel ausente cai no
  de `fill` na hora de resolver). Trocar o tamanho de bloco de um tileset
  agora também reseta `terrainGroups` (`TilesetEditor.tsx`), mesma razão
  de já resetar colisão/camada: os índices de bloco não fazem mais sentido
  com outra fatia.
  **UI:** aba "Tilesets" ganhou uma seção "Terrenos inteligentes" depois
  da lista de blocos — criar grupo nomeado, mini-grid 3x3 clicável
  (`TerrainGroupEditor`) pra atribuir qual bloco já existente cobre cada
  papel (clique no slot abre a lista de blocos do tileset; "Nenhum"
  desmarca). Aba "Fases" ganhou uma seção "Terrenos" na barra lateral (uma
  por tileset que tiver grupo) — escolher um ativa o pincel de terreno,
  mutuamente exclusivo com o pincel de bloco avulso (mas compatível com a
  borracha: apagar com o pincel de terreno ativo também reavalia os
  vizinhos, só funciona pra grupo de Camada 2, mesma regra de sempre da
  borracha não mexer na Camada 1).
  **Bug real encontrado e corrigido no processo** (não fazia parte do
  pedido, mas bloqueava a mesma parte do código): `StageWorkspace.tsx`
  `handleStartSession` nunca gravava `name`/`version` em
  `StageTilesetInput` ao ESCOLHER tilesets salvos e começar uma fase nova
  — só `loadStageProjectFromRefs` (reabrir fase já salva) gravava os dois.
  Consequência: salvar uma fase RECÉM-iniciada nunca escrevia
  `_tileset_refs.json` (só funcionava depois de já ter sido salva e
  reaberta uma vez) — corrigido junto, já que era o mesmo lugar por onde
  `terrainGroups` também precisava passar.
  Verificado: `tsc -b`, `npm test` (155/155, 20 casos novos), `npm run
  build`, `npm run lint` — todos limpos. Não testado num navegador de
  verdade nesta sessão (sem ferramenta de automação de navegador
  disponível) — só validação estática (tipos/testes/lint/build).
- 2026-09-23: Redesign visual/UX do front-end inteiro, puramente Prometeus
  (zero impacto em `DATA_FORMAT.md`/Anubis). Pedido do usuário: deixar mais
  bonito e userfriendly, saindo do HTML padrão, com estética inspirada em
  Lunar Magic/ferramentas de modding de SNES — fundo roxo estrelado
  animado (leve, `prefers-reduced-motion` respeitado) e uma interface de
  criação de fases nos moldes de Lunar Magic/Super Mario Maker. Reescrito
  `src/index.css` inteiro (paleta roxo/dourado, sempre escuro — removido o
  `prefers-color-scheme`; starfield em `App.tsx` via `radial-gradient`
  em camadas; abas de topo como pasta suspensa; botões "apertáveis";
  fontes via Google Fonts — "Press Start 2P" pixelada só no título/abas,
  "Baloo 2" no resto). Todos os 82 seletores de classe pré-existentes
  verificados preservados (diff scriptado, zero faltando).
  Depois de ver a 1ª versão, o usuário pediu 3 ajustes concretos: (1)
  reportou a grade do mapa "quebrada" num screenshot — investigado
  `drawGridLines` (`StageSession.tsx`): só desenha linhas completas,
  igualmente espaçadas, cobrindo o canvas inteiro a cada redraw, sem
  nenhum caminho pra gerar segmento curto/irregular — concluído que os
  dois traços do screenshot são conteúdo de tile pintado (provavelmente um
  tile decorativo fino), não bug de grade; nenhuma mudança de código
  necessária aqui. (2) Texto reduzido a botões/nomes só: removidos quase
  todos os `<p className="hint">` explicativos de `StageSession.tsx`,
  `StageWorkspace.tsx` e `TilesetEditor.tsx` (explicação de passo do
  cursor, camada/borracha, modo pintura vs. entidades, patrulha de
  inimigo, etc.) — detalhe que valia manter foi pra atributo `title`
  (tooltip), não pra texto visível. (3) Editor de fases agora usa bem mais
  largura horizontal: `StageSession.tsx` reestruturado em 2 colunas
  (`.stage-session-layout`) — mapa/entidades/salvar como coluna principal,
  paleta de blocos (passo do cursor + borracha + tilesets) como sidebar
  fixa de 220px ao lado, `position: sticky`. `.app` ganha `max-width:
  1280px` (de 960px) só enquanto essa tela com sessão ativa está aberta,
  via `:has(.stage-workspace-wide)` — não afeta as outras abas/telas.
  Verificado: `tsc -b`, `npm test` (143/143), `npm run build`, `npm run
  lint` — todos limpos.
- 2026-09-21: Editor de Fases v2 — Fase 1 implementada (usuário escolheu
  fasear a v2: entidades primeiro, múltiplos tilesets depois). Ver "Status
  atual" pro desenho completo (nova tela/navegação, `_entities.h`,
  `enemySlots.ts`, UI de posicionar jogador/inimigo). Verificado:
  `tsc -b`/`build`/`lint`/`npm test` (102/102, 5 casos novos) e E2E
  Playwright ponta a ponta + regressão da aba Importar — sem tocar em
  `hero_*`/`enemy1_*` reais. Achado real corrigido no processo: a
  primeira tentativa de manter as duas páginas sempre montadas (pra não
  perder progresso ao trocar de aba) duplicava o `<input type="file">` no
  DOM; voltei pra renderização condicional simples. `docs/DATA_FORMAT.md`
  § 4 atualizado (nova subseção confirmando a implementação, ainda 🟡) e
  sincronizado com `../jogo-plataforma-snes/docs/DATA_FORMAT.md` + log lá.
- 2026-09-21: Editor de Fases v2 — proposta de formato (pedido do usuário:
  "seção própria, múltiplos tilesets, posicionamento de entidades...
  antes de codar, proponha o formato... se ficar grande, proponha
  fasear... decisão dele, não sua"). Antes de desenhar algo do zero, li o
  que a Anubis já tinha rascunhado em `docs/DATA_FORMAT.md` § 4 (duas
  subseções 🟡) e `main.c`/`enemy.h` (scaffolding já pronto, sem mudar
  comportamento) — em vez de propor independente, respondi os pontos que
  ficaram em aberto pra mim (ver "Status atual" pro detalhe: `enemySlots.ts`
  extensível, confirmação do mecanismo de paleta por bloco lendo o
  código-fonte real do `gfx4snes`, nome do arquivo de entidades, nova tela
  de navegação). Não implementei nenhum código desta etapa — só o
  formato, conforme pedido. `docs/DATA_FORMAT.md` § 4 atualizado
  (subseções continuam 🟡) e sincronizado com
  `../jogo-plataforma-snes/docs/DATA_FORMAT.md` + log lá. Perguntei ao
  usuário se quer fasear (recomendei entidades primeiro, multi-tileset
  depois, já que essa parte depende de confirmar uma flag do `gfx4snes`
  contra o binário real) — aguardando resposta.
- 2026-09-21: [DATA] Sessão do `jogo-plataforma-snes` (Anubis) preparou o
  lado dela pro posicionamento de entidades por fase que a v2 do editor
  vai trazer: `main.c` passou a inicializar jogador/inimigo a partir de
  dado (`PlayerSpawn`/`EnemySpawn`, `EnemyType` novo enum em `enemy.h`)
  em vez de chamadas fixas — hardcoded por enquanto, mesmos valores de
  sempre, só reorganizado, pronto pra virar "carregar de um `.h`
  exportado" sem mexer de novo na arquitetura. Também rascunhou (não
  implementou) duas propostas 🟡 aditivas em `docs/DATA_FORMAT.md` § 4:
  múltiplos tilesets com paleta por bloco (orçamento real do lado BG do
  CGRAM: 8 bancos/128 cores, só 1 em uso hoje; acha que o `gfx4snes` já
  suporta isso via `-u`/`-o` maiores, mas não confirmou testando) e lista
  de entidades (arrays paralelos de primitivos num `.h` estático — X/Y do
  jogador, e tipo/X/Y/minX/maxX por inimigo — de propósito sem struct
  compartilhada entre os dois lados, pra não desincronizar campo por
  campo). Deixou explícito que é ponto de partida pro Prometeus decidir o
  formato final, não contrato. Sincronizado (arquivo idêntico nos dois
  `docs/DATA_FORMAT.md`). Achou de passagem que `stage1_tilemap.bmp`/
  `stage1_collision.h` sumiram do disco (a exclusão acidental registrada
  na entrada abaixo) — build da Anubis está quebrado até a `stage1` ser
  recriada e salva de novo por aqui.
- 2026-09-21: Editar fase já salva (usuário excluiu a `stage1` sem querer:
  "preciso que você já crie a função de editar fases já salvas... pra que
  eu possa já editar na próxima"). Ver "Status atual" pro desenho
  (`reconstructStage.ts` deduplica os tiles 8×8 da própria imagem
  composta, sem precisar de nenhum arquivo novo). Aproveitei pra fechar a
  seção 4 do `DATA_FORMAT.md` como 🟢, já que a Anubis confirmou (no
  `PROGRESS.md` dela, lido antes de mexer em qualquer coisa) que já
  consome uma `stage1` real com o build passando. Verificado:
  `tsc -b`/`build`/`lint`/`npm test` (98/98, 6 casos novos, incluindo
  verificação pixel a pixel de que o reload reproduz a fase original) e
  E2E Playwright completo (criar, salvar, limpar, editar, confirmar
  identidade pixel a pixel, excluir). Achei e corrigi de passagem um bug
  real (não do reload): a lista de arquivos que "Excluir" apaga não
  incluía `.inc`/`_data.as` — o build da Anubis passou a gerar esses dois
  depois da v1 do editor de fase, e a lista nunca foi atualizada; limpei
  os órfãos que já existiam em disco. `docs/DATA_FORMAT.md` § 4
  atualizado e sincronizado com `../jogo-plataforma-snes/docs/
  DATA_FORMAT.md` + log lá.
- 2026-09-21: Seção "Fase já salva" (usuário notou que a fase que ele tinha
  salvo não aparecia em lugar nenhum ao reabrir: "tá salvo na pasta? se
  tiver, ele tem que aparecer"). Confirmei que sim, os arquivos existiam
  de verdade (`stat` mostrando o timestamp real). Perguntei o escopo antes
  de implementar (só mostrar+excluir vs. também permitir reabrir pra
  editar) — usuário escolheu a opção simples, já que reabrir exigiria
  mudar o formato exportado pra guardar a grade de blocos original (hoje
  só a imagem já composta é salva). Ver "Status atual" pro desenho
  (`stageDiscovery.ts`, `SavedStage.tsx`, prévia via `<img>` direto do
  `.bmp` exportado). Achado no processo: o endpoint de apagar arquivo não
  aceitava `.map` (lista de extensões pensada só pra personagem) —
  corrigido, já que é exatamente o que a fase vai gerar do lado da engine.
  Verificado: `tsc -b`/`build`/`lint`/`npm test` (94/94) e E2E Playwright
  contra a fase real do usuário (seção aparecendo, prévia carregando o
  `.bmp` de verdade, exclusão funcionando) — com backup/restauração dos
  arquivos reais, sem perder nada. `docs/DATA_FORMAT.md` não mudou (nenhum
  formato de arquivo foi alterado).
- 2026-09-20: Tamanho de bloco configurável no editor de fase (pergunta do
  usuário: "e se meus tiles tiverem 16x16 de tamanho? da pra colocar essa
  opção?"). Ver "Status atual" pro desenho (`StageBlockSize` generalizado
  em `src/lib/tilemap/`, colisão sempre expandida pro array fixo de 32×32
  tiles de hardware não importa o bloco escolhido). Verificado:
  `tsc -b`/`build`/`lint`/`npm test` (91/91, testes parametrizados
  8/16/32 mais 2 casos novos de expansão 2×2) e 2 E2E Playwright (8×8 sem regressão;
  16×16 com seletor, recontagem de blocos e colisão expandida
  corretamente). Achei e corrigi um bug nos meus PRÓPRIOS scripts de
  teste, não na aplicação: `page.mouse.click` não rola a página, e o
  canvas de pintura ficou fora da viewport configurada depois que o
  seletor novo empurrou o layout pra baixo. `docs/DATA_FORMAT.md` § 4
  atualizado e sincronizado com a Anubis + log lá.
- 2026-09-20: Editor de fase v1 (pedido do usuário: "vamos começar
  planejando o item 2, me faz algumas perguntas... e você implementa
  ele"). Perguntei 4 coisas antes de codar (colisão por tabela de tile x
  camada separada; escopo v1 com ou sem entidades; tamanho fixo x
  scroll desde já; origem do tileset) — as 4 respondidas com a opção
  recomendada. Ver "Status atual" pro desenho completo
  (`src/lib/tilemap/`, `StageEditor.tsx`, base fixa `stage1`).
  Verificado: `tsc -b`/`build`/`lint`/`npm test` (84/84, 5 casos novos) e
  E2E Playwright com um tileset sintético gerado na hora (canvas do
  navegador, 8 blocos de cores distintas) — colisão por índice, pintura
  por clique/arrasto, arquivos salvos batendo exatamente com o que foi
  pintado, zero erros de console. `docs/DATA_FORMAT.md` § 4 atualizado
  com todas as decisões, copiado pro
  `../jogo-plataforma-snes/docs/DATA_FORMAT.md` + log lá. Segue 🟡: falta
  o Anubis consumir os arquivos reais (regra de Makefile com `-m` pro
  `*_tilemap.bmp`, diferente da regra sem `-m` da seção 3).
- 2026-09-20: [DATA] Fechada a seção 3 do `DATA_FORMAT.md` (Sprites e
  animação) como 🟢 — pedido do usuário ("faz o item 1" depois de eu
  apontar isso como próximo passo). O texto antigo dizia "falta a engine
  consumir de verdade pra fechar", mas isso já tinha acontecido nas duas
  etapas anteriores (slot `hero` + slot "Inimigo"). Também corrigi, na
  mesma seção, uma nota desatualizada sobre a hitbox do `hero` (dizia
  "ainda hardcoded"; o Anubis já tinha trocado pelo valor real numa etapa
  que não vi documentada aqui até reler o `PROGRESS.md` de lá). Sem
  código novo, só status/histórico atualizados e replicados em
  `../jogo-plataforma-snes/docs/DATA_FORMAT.md` + log lá.
- 2026-09-20: Miniatura na galeria de "Personagens já salvos" (pedido do
  usuário — item pendente de PROGRESS.md, ver "Status atual"). Primeira
  tarefa a usar os codinomes fixos do CLAUDE.md: **Prometeus** (este
  projeto) / **Anubis** (`../jogo-plataforma-snes`). Desenho: função pura
  nova `reconstructThumbnail` (`importProject.ts`, só quadro 0, sem o
  round-trip caro de `loadCharacterProject`) + `loadCharacterThumbnail`
  (glue de DOM/fetch em `loadCharacter.ts`, reaproveitando `composedToRgba`
  como sugerido) + componente `CharacterThumbnail.tsx` (canvas pequeno,
  upscale nearest-neighbor, carregamento paralelo por linha, cai pro
  placeholder sem quebrar a linha em caso de erro). Corrigido de passagem
  um erro de tipos do TS 6.0 (`Uint8ClampedArray` sem o genérico pinado em
  `<ArrayBuffer>` não bate com `ImageData`). Verificado: `tsc -b`/`build`/
  `lint`/`npm test` (79/79, 3 casos novos) e E2E Playwright contra
  **hero** e **enemy1** reais (ambos com miniatura desenhada) e um caso de
  erro simulado (`zztest_thumb_*`, escrito direto no disco com `.h`
  corrompido de propósito, apagado ao final) confirmando o placeholder sem
  quebrar "Editar"/"Excluir". Bônus encontrado no processo: o usuário já
  tinha terminado de salvar o `enemy1` de verdade pela tela desde a última
  etapa (a galeria mostra "enemy1" com "com animação" agora) — confirmei
  rodando `make` direto que o build da Anubis, que estava quebrado, já
  está passando de novo. `docs/DATA_FORMAT.md` não mudou (fora de escopo —
  nenhum formato de arquivo mudou, é só leitura do que já existe).
- 2026-09-20: Usuário relatou o build da engine quebrando (`No rule to make
  target '../assets/gfx/enemy1_tiles.pic'`) depois de excluir e tentar
  recriar o "Inimigo". Ver "Status atual" (bloco "Correção — build da
  engine quebrava...") pro diagnóstico completo: salvar animação sem ter
  salvo o personagem primeiro deixa `enemy1_anim.h` sem `enemy1_tiles.bmp`
  correspondente, e o Makefile da engine já trata `enemy1_tiles.pic` como
  obrigatório. Corrigido com um gate `sheetSaved` em `AnimationSequencer`.
  Ao investigar, achei e corrigi um bug mais sério: reabrir um personagem
  salvo num slot não-padrão resetava o seletor de volta pra "Personagem
  principal" — salvar sem notar sobrescreveria `hero_*` com dados de outro
  personagem. `ProjectSeed` ganhou `baseName` pra corrigir. Também corrigi
  `requiredAnimationNames` do `enemy1` de `[]` pra `['walk']`, depois de
  reler `docs/DATA_FORMAT.md` § 3 "Slots de inimigo" (sincronizado pela
  engine nesse meio-tempo) e ver que ela já consome `enemy1_anim_walk` de
  verdade. Verificado com `tsc -b`/`build`/`lint`/`npm test` (76/76) e 2
  rodadas de E2E Playwright reproduzindo o bug e confirmando as correções,
  com backup/restauração do `enemy1_anim.h` real do usuário em cada
  rodada (só esse arquivo existia de verdade pro slot no momento) e do
  `hero_*` completo (regressão do fluxo do slot principal) — tudo
  restaurado byte a byte ao final. **Build da engine confirmado ainda
  quebrado** (rodei `make` direto, fora do Prometeus) até o usuário terminar
  de salvar o personagem do "Inimigo" pela tela (ver "Ação sugerida" em
  "Status atual") — não fabriquei um sprite placeholder no lugar dele.
  `docs/DATA_FORMAT.md` não foi alterado por mim nesta entrada (já estava
  sincronizado com a mudança que a engine fez).
- 2026-09-20: [DATA] `docs/DATA_FORMAT.md` ganhou "Slots de inimigo": a
  sessão da engine confirmou que já consome o `enemy1_*` exportado por
  aqui (`src/enemy.c`, hitbox já lida direto do `.h`, só a animação
  `walk` é usada — `idle` fica exportada mas sem uso, esperado). Nenhum
  código deste projeto foi alterado.
- 2026-09-20: Slot "Inimigo" (pedido do usuário: "hora de criar o inimigo,
  coloque pra mim a opção de criar inimigos no editor"). Ver "Status
  atual" pro desenho (`enemy1` sem `requiredAnimationNames`, `CharacterSlot`
  virou dono dessa lista em vez de uma constante única usada direto).
  Verificado: `npx tsc -b`, `npm run build`, `npm run lint`, `npm test`
  (76/76) e E2E Playwright (seletor com as 2 opções, aviso citando
  `enemy1_*`, sem gate de animação obrigatória pro Inimigo, arquivos
  `enemy1_tiles.bmp`/`enemy1_metasprites.h` gravados de verdade, galeria
  com os dois slots lado a lado, zero erros de console) — usando um sheet
  descartável, `enemy1_*` de teste apagados ao final, `hero_*` real
  intocado. `docs/DATA_FORMAT.md` não mudou (a seção 3 já previa esse
  próximo passo); a engine ainda não consome `enemy1_*` (fica pro dia que
  ela generalizar `sprites_gfx`/`metasprite` pro inimigo).
- 2026-09-20: Slot fixo do personagem principal + animações obrigatórias
  (pedido pela sessão da engine, relayed pelo usuário — `docs/DATA_FORMAT.md`
  § 3 "Slot do personagem principal"). Ver "Status atual" pro desenho
  (`characterSlots.ts` como lista de opções, não constante; `baseName`
  compartilhado entre editor de sheet e de animações; `REQUIRED_ANIMATION_NAMES`
  bloqueando "Salvar animações no jogo"). Verificado: `npx tsc -b`, `npm run
  build`, `npm run lint`, `npm test` (75/75) e um E2E Playwright completo
  contra o `hero` real: importar um arquivo com nome bem diferente
  (`marioteste-16x32.png`) e salvar grava `hero_tiles.bmp`/
  `hero_metasprites.h` (nunca `marioteste_16x32_*`); com só 1 das 5
  animações o botão de salvar animações fica desabilitado e o aviso lista
  as 4 que faltam (walk/run/jump/fall); completando as 5 (reaproveitando o
  quadro 0 como placeholder) o aviso vira "pode salvar", o botão habilita e
  `hero_anim.h` real passa a ter as 5; a galeria continua com um único
  "hero" (não duplicou por causa do nome do arquivo importado); o fluxo de
  Cenário não foi afetado (sem seletor de slot, continua salvando com o
  nome do arquivo). Como o teste necessariamente escreve nos arquivos reais
  `hero_*` pra provar o comportamento, fiz backup dos 7 arquivos antes,
  restaurei depois e rodei `make` de novo pra ressincronizar os artefatos
  derivados (`.pic/.pal/.inc/.as`) e a ROM — conferido byte a byte que
  voltou ao estado original. Nenhuma mudança em `docs/DATA_FORMAT.md`: a
  seção 3 já descrevia esse contrato (implementação apenas confirma o que a
  engine já havia especificado).
- 2026-09-20: Galeria de personagens salvos (pedido do usuário: "ao abrir já
  carregue os sprites que temos... pra eu editar ou excluir"). Ver "Status
  atual" pro desenho da solução (reconstrução a partir dos próprios
  arquivos, sem sidecar novo). Verificado: build/lint/`npm test` (73 casos,
  incluindo round-trip export→reconstrução) e E2E Playwright contra o
  **`hero` real do usuário** (não um personagem de teste): a galeria mostra
  "hero" ao abrir a página, "Editar" carrega o quadro (16×32), pivô (8,25) e
  as 5 animações reais lidas do `hero_anim.h`; como o `hero_metasprites.h`
  em disco é de antes da hitbox existir (sem `_HITBOX_W/H`), confirmei que
  o carregamento cai numa sugestão calculada em vez de travar. Não
  cliquei em salvar/excluir no `hero` real — o ciclo completo (criar,
  salvar, editar de novo, confirmar que a edição persistiu, excluir com
  confirmação, cancelar confirmação) foi testado com um personagem
  descartável à parte, apagado ao final. Nenhum formato de arquivo mudou
  (só lê os que já existem) — `docs/DATA_FORMAT.md` não precisou de
  atualização.
- 2026-09-20: [DATA] `docs/DATA_FORMAT.md` § 3 ganhou "Slot do personagem
  principal": o Anubis renomeou seus arquivos de teste (`marioteste.png` →
  base fixa `hero`) e agora precisa que o Prometeus exporte o personagem
  principal SEMPRE como `hero_tiles.bmp`/`hero_metasprites.h`/
  `hero_anim.h` — não o nome derivado do arquivo importado. Objetivo do
  usuário: reexportar substitui o personagem no jogo sem pedir código novo
  no Anubis. Contrato: as 5 animações idle/walk/run/jump/fall precisam
  sempre existir no `_anim.h` (repetir frame se não tiver pose própria).
  Nenhum código deste projeto foi alterado.
- 2026-09-19: Item 3 do pedido da engine — `make` automático depois de salvar.
  Antes de implementar, perguntei ao usuário (config: arquivo local; quando:
  uma vez por salvamento). Ver "Status atual". Verificado: build/lint/`npm test`
  (51 casos; os de integração usam Git Bash + make de verdade num Makefile
  falso — sucesso, falha com stderr, "busy", timeout sem processo órfão,
  Git Bash inexistente — com ambiente SEM `PVSNESLIB_HOME`, provando que a
  config basta) e E2E Playwright (build real: ROM regravada, saída
  "COMPILATION SUMMARY"; falha com stderr visível; botão desabilitado
  durante build lento; sem config/JSON quebrado/PVSnesLib errada com
  mensagens claras; restaurar a config volta a funcionar sem reiniciar) +
  regressão dos 3 E2E anteriores. `DATA_FORMAT.md` § 6 atualizado e replicado
  na engine + log lá. Curl: build real via HTTP em ~2 s; `Origin` estranho =
  403; GET = 405.
- 2026-09-19: Hitbox por sheet + nomes de animação sugeridos (pedido da
  sessão da engine). Ver "Status atual". Verificado: build/lint/`npm test` (40
  casos: padrão 12 × H no sheet real do Mario, validação, geometria,
  defines, recusa de hitbox inválida, nomes sugeridos) e E2E Playwright
  (padrão 12 × 29, contorno vermelho nas bordas certas da prévia, alças
  do topo/lados/canto arrastando com limite no quadro, mensagens de erro em
  português + salvar bloqueado, sugestão acompanhando o pivô, reinício ao
  trocar o quadro/imagem, `.h` com MARIOTESTE_16X32_HITBOX_W 12 / _H 24, chips
  e nome livre). `DATA_FORMAT.md` § 3 atualizado, replicado na engine + log
  lá (defines novos: **`<BASE>_HITBOX_W`/`<BASE>_HITBOX_H`**). Item 3 (rodar `make`
  depois de salvar) NÃO implementado: aguardando decisão do usuário sobre
  como configurar PVSNESLIB_HOME/`make` (ver "Próximo passo").
- 2026-09-19: [DATA] `docs/DATA_FORMAT.md` § 3 ganhou a proposta de
  **hitbox por sheet** (`<BASE>_HITBOX_W`/`_H` no `_metasprites.h`,
  retângulo ancorado nos pés) e a lista de nomes de animação que a engine
  procura (`idle/walk/run/jump/fall`). `_anim.h` do `marioteste` já foi
  exportado e recebido (`assets/gfx/marioteste_anim.h`). Nenhum código
  deste projeto foi alterado.
- 2026-09-19: [DATA] A engine passou a consumir `marioteste_tiles.bmp` +
  `marioteste_metasprites.h` (regra `*_tiles` sem `-m` no Makefile deles,
  `metaspriteDraw` + player.c com flip); `docs/DATA_FORMAT.md` § 3
  "Desenho (engine)" ressincronizado. Falta: o usuário exportar o `_anim.h`
  (animações) — não estava em `assets/gfx/` — e testar no emulador. Nenhum
  código deste projeto foi alterado.
- 2026-09-19: Quadros retangulares (pedido do usuário). Ver "Status atual".
  Verificado: build/lint/`npm test` (33 casos, incluindo o sheet real
  16×32: 8 quadros, pivô (8,32), nenhum corte, peças dentro do quadro/sem
  sobreposição/nenhuma vazia, recomposição e espelho pixel a pixel);
  `gfx4snes` real sobre o `_tiles.bmp` do 16×32 (64 tiles em ordem raster,
  0 divergências); `816-tcc -Wall` no header (sem avisos); E2E Playwright
  (aceite: sem avisos, pivô (8,32) em todos os quadros, overlay =
  2 pedaços 16×16 empilhados por pose e 0 nos quadros vazios, arrastar/
  digitar pivô limitado por eixo, miniaturas 16×32, animação tocando,
  16×16 no mesmo sheet volta a avisar corte, personalizado 32×64 e erro em
  24×64, `.h` com FRAME_WIDTH 16/FRAME_HEIGHT 32 e sem FRAME_SIZE) +
  regressão do fluxo 32×32. `DATA_FORMAT.md` § 3 atualizado, replicado em
  `../jogo-plataforma-snes/docs/DATA_FORMAT.md` + log lá (**muda o contrato
  do `_metasprites.h`**).
- 2026-09-19: Interface simplificada + prévia ao vivo (pedido do usuário:
  "termos complicados pro usuário final" e "preview que atualiza em tempo
  real"). Ver "Status atual". Verificado com build/lint/`npm test` (22) e
  E2E Playwright: mensagens sem jargão, prévia muda ao mexer no ponto de
  apoio, espelho da prévia = espelho pixel a pixel do normal, animação toca
  (várias imagens em ~1s) e pausa congela, prévia acompanha o arrasto do
  ponto de apoio, arquivo de peças reflete o pivô arrastado, erro de
  tamanho sugere tamanhos que servem, sheet original avisa "invade o quadro
  vizinho", modo cenário. Sem mudança de formato → `DATA_FORMAT.md` intacto.
- 2026-09-19: Metasprites de ponta a ponta (pedido do usuário): frame lógico
  configurável, fatiador automático 8x8/16x16, pivô, empacotador de tiles no
  layout OBJ (16 colunas) com dedup/flip, overlay + estatísticas + avisos na
  UI, export `_tiles.bmp` + `_metasprites.h`. Decisões: limiar 8x8 = "≤1
  quadrante ocupado" (configurável 0..4); não usar `gfx4snes -T` (o
  `t_metasprite` da PVSnesLib não tem tamanho por peça); export em header C
  (convenção da seção 3) em vez de JSON. Achados: `gfx4snes` só preserva a
  ordem dos tiles **sem `-m`**; `extractPalette` ignorava alpha (corrigido).
  Adicionado `npm test` (node:test, zero deps) — o repo não tinha infra de
  teste; é a única adição fora do pedido literal e é fácil de remover
  (`tests/`, `tsconfig.test.json`, script `test`). `docs/DATA_FORMAT.md`
  § 2/§ 3 atualizados e replicados em
  `../jogo-plataforma-snes/docs/DATA_FORMAT.md` + log lá.
- 2026-09-19: Implementada a seção 3 do `docs/DATA_FORMAT.md` (Sprites e
  animação) em cima do rascunho da engine. Novos
  `src/features/import-preview/animationSequence.ts` (lógica pura: grade
  de frames, sanitização de identificador C, geração do `.h`) e
  `AnimationSequencer.tsx` (seletor de frame size, canvas com grade de
  índices, editor de animações nomeadas, export). Endpoint
  `/api/export-gfx` (`vite-export-gfx-plugin.ts`) ganhou suporte a `.h`
  além de `.bmp` (mesma validação de nome de arquivo). Validado com `npm
  run build`/`lint` e um fluxo Playwright ponta a ponta confirmando o
  conteúdo exato do `.h` gerado (ver "Status atual" acima).
  `docs/DATA_FORMAT.md` § 3 atualizado e replicado em
  `../jogo-plataforma-snes/docs/DATA_FORMAT.md` + log lá no `PROGRESS.md`.
- 2026-09-19: [DATA] `docs/DATA_FORMAT.md` § 3 (Sprites e animação)
  ganhou rascunho da engine, baseado em teste real do `gfx4snes -T` no
  `marioteste.bmp`: fatiamento em frames é resolvido pelo `gfx4snes`
  (grade de tamanho fixo, ordem raster, Prometeus só escolhe o tamanho do
  frame); sequência/timing de animação vira um `.h` de C exportado pelo
  Prometeus (array de índices de frame por animação nomeada + duração — sem
  JSON, sem parser novo). Objetivo do usuário: `marioteste.bmp` virar o
  sprite de teste real do jogador, substituindo o placeholder atual.
  Nenhum código deste projeto foi alterado ainda.
- 2026-09-19: [DATA] **Round-trip completo confirmado** — usuário
  exportou `marioteste.bmp` (64x64px, 13 cores) por esta tela de verdade,
  a sessão da engine rodou `make` em cima dele: `gfx4snes` converteu (35
  tiles únicos após dedup automático) e o build linkou sem erro. Seção 1
  do `docs/DATA_FORMAT.md` fechada como 🟢, sincronizado aqui. Achado da
  engine no processo: dado embutido sem nenhuma referência no C é
  descartado pelo linker deles silenciosamente — não afeta este projeto
  diretamente, mas registrado pra referência. Nenhum código deste projeto
  foi alterado.
- 2026-09-19: Pedido do usuário: fazer o export salvar direto na pasta da
  engine em vez de baixar pelo navegador. Implementado com um middleware no
  próprio Vite dev server (`vite-export-gfx-plugin.ts`, plugin registrado
  em `vite.config.ts`): endpoint `POST /api/export-gfx` recebe o `.bmp`
  (header `X-File-Name`, valida contra `^[\w.-]+\.bmp$` + `path.basename`
  pra barrar path traversal) e escreve direto em
  `../jogo-plataforma-snes/assets/gfx/`. `ImportPreview.tsx` trocou o
  download por um `fetch` pro endpoint, com mensagem de sucesso (caminho
  salvo) ou erro (ex.: dev server não rodando). Rodar `make`
  automaticamente ficou de fora, por decisão do usuário (só escrever o
  arquivo por enquanto). Validado com `npm run build`/`lint`, `curl` direto
  no endpoint (escrita correta + rejeição de nome de arquivo inválido) e um
  fluxo Playwright ponta a ponta confirmando que o arquivo aparece de
  verdade no disco do lado da engine. `docs/DATA_FORMAT.md` § 6 atualizado
  e replicado em `../jogo-plataforma-snes/docs/DATA_FORMAT.md` + log lá no
  `PROGRESS.md`.
- 2026-09-19: [DATA] `docs/DATA_FORMAT.md` ressincronizado a partir da
  sessão do `jogo-plataforma-snes` (projeto irmão): confirmaram o
  `build/Makefile` deles convertendo `.bmp` via `gfx4snes` automaticamente
  e linkando na ROM, testado com paleta esparsa (imitando nosso export
  real). Falta só um `.bmp` de verdade desta tela pra fechar o round-trip.
  Nenhum código deste projeto foi alterado.
- 2026-09-19: Estendida a tela Importar/Preview pra validar (dimensões
  múltiplas de 8, ≤16 cores únicas) e exportar um `.bmp` indexado 8bpp real
  a partir da imagem importada, substituindo o placeholder JSON de
  "Exportar teste" (tela e tipo removidos). Novo `src/lib/indexedBmp.ts`
  (extração de paleta + encoder BMP) e
  `src/features/import-preview/validation.ts`. `docs/DATA_FORMAT.md`
  atualizado (seção 1: Prometeus confirmou que consegue exportar nesse
  formato) e replicado em
  `../jogo-plataforma-snes/docs/DATA_FORMAT.md` + log lá no `PROGRESS.md`,
  conforme o contrato descrito no `CLAUDE.md`. Validado com `npm run
  build`, `npm run lint` e um fluxo Playwright ponta a ponta (ver "Status
  atual" acima) — zero erros.
- 2026-09-19: `docs/DATA_FORMAT.md` ressincronizado com
  `../jogo-plataforma-snes/docs/DATA_FORMAT.md` (estava desatualizado
  desde a criação do projeto em 17/09) — trouxe as seções 1/2/4 como 🟡
  rascunho, decisão de usar `gfx4snes` da PVSnesLib em vez de formato
  próprio. Feito a partir da sessão do projeto irmão; nenhum código deste
  projeto foi alterado.
- 2026-09-17: Projeto criado do zero (Vite + React + TS) como pasta irmã de
  `jogo-plataforma-snes`. `docs/DATA_FORMAT.md` copiado do projeto engine
  (contrato compartilhado). Skeleton com as 2 telas acima implementado e
  validado no navegador via Playwright.

## Bugs/pendências conhecidas
(nenhum ainda)
