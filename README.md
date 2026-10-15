<img width="2014" height="781" alt="mix" src="https://github.com/user-attachments/assets/3abab174-d963-40db-8fd0-10ecee934d7a" />


# Mix Engine

> Nos documentos internos de desenvolvimento (`docs/PROGRESS.md`/`docs/DATA_FORMAT.md`), este
> projeto é tratado pelo codinome **Prometeus** — mesmo conteúdo, nome diferente só pra
> diferenciar dos dois lados durante o desenvolvimento. O projeto irmão usado no desenvolvimento
> (`../jogo-plataforma-snes`, público como
> [mix-engine-snes-game](https://github.com/Felipe-Gomes-Amorim/mix-engine-snes-game)) é o
> **Anubis**.

**Mix Engine** é uma ferramenta web (React + TypeScript) para importar/converter
assets (sprites, animação, tilesets, fases) de um jogo de plataforma SNES.

**Funciona sozinha:** importar imagem, fatiar metasprite, ajustar pivô/hitbox,
sequenciar animação, montar tileset e pintar fase funcionam sem nenhuma engine
por perto — é só abrir `npm run dev` e usar. A integração com uma engine (gravar
os arquivos exportados direto em disco, compilar com `make`, abrir no emulador
com 1 clique) é **opcional** e seguida de um contrato de dados documentado e
versionado em `docs/DATA_FORMAT.md` — qualquer engine C/PVSnesLib que leia esse
formato serve, não precisa ser o Anubis especificamente. A pasta da engine
(`engineDir`) é configurável (ver "Compilar o jogo depois de salvar" abaixo);
sem configurar nada, o editor assume a pasta irmã `../jogo-plataforma-snes` só
por conveniência do setup de desenvolvimento original.

Ver `CLAUDE.md` para escopo e convenções, e `docs/DATA_FORMAT.md` para o
contrato de dados com a engine.

## Rodando localmente

```bash
npm install
npm run dev      # dev server
npm run build    # type-check + build de produção
npm run lint      # oxlint
npm test          # testes unitários (node:test): fatiador de metasprites, hitbox, build
npm run test:e2e  # testes E2E de navegador (Playwright) — ver seção abaixo
```

## Testes E2E (Playwright)

`npm run test:e2e` sobe o PRÓPRIO dev server (não precisa `npm run dev` já
rodando — nem deve: os dois usam portas diferentes de propósito, 5173 vs
5183) e dirige um Chromium de verdade pelas telas, cobrindo o que só um
navegador real exercita: upload de imagem, canvas de pintura, modais,
avisos de confirmação.

**Isolamento (importante):** os testes NUNCA escrevem nos arquivos reais —
nem na pasta de assets da engine configurada (`<engineDir>/assets/gfx/`,
onde moram a `stage1`/`hero`/`enemy1` de verdade) nem em `assets/tilesets/`
deste projeto (os tilesets reais do usuário). O servidor de teste sobe com
`PROMETEUS_E2E_GFX_DIR`/
`PROMETEUS_E2E_TILESET_DIR` apontando pra pastas temporárias do sistema
operacional (`playwright.config.ts`/`e2e/global-setup.ts`), nunca pra
dentro do repositório — sem essas variáveis (`npm run dev` normal), os
caminhos continuam exatamente os de sempre. Isso existe porque um script
de teste solto já sobrescreveu os arquivos reais sem querer no passado.

Cobertura atual (`e2e/*.spec.ts`): CRUD de tileset, pintar uma fase e
salvar, upload de "cenário", e regressão dos dois bugs reais encontrados
pelo usuário jogando (não achados por teste nenhum na época) — bloco 0 de
um tileset marcado como "bandeira" herdado por toda célula não pintada, e
o orçamento de VRAM (tiles únicos por camada) de uma fase larga. O fluxo
completo de personagem (`SpriteSheetEditor` — pivô, hitbox, 5 animações
obrigatórias) ainda não tem E2E dedicado, ver `docs/PROGRESS.md`.

`POST /api/build-engine` é interceptado (`e2e/helpers.ts`,
`mockEngineBuild`) e nunca roda o `make` de verdade — a toolchain de build
já tem sua própria cobertura em `tests/*.test.ts` com fixtures; os E2E só
precisam validar o FLUXO até chegar lá.

## Exportar pra engine e compilar depois de salvar

Com `npm run dev` rodando, cada "Salvar" grava os arquivos exportados
(`.bmp`/`.h`/`.json`/`.txt`) em `<engineDir>/assets/gfx/`. Build (`make`) e o
botão "Jogar" (compila + abre no emulador) também usam essa MESMA pasta —
configurar `engineDir` uma vez afeta os três. Sem nenhuma configuração,
`engineDir` assume `../jogo-plataforma-snes` (o projeto irmão usado no
desenvolvimento original); pra apontar pra outro lugar (ou pra uma engine
própria que implemente o contrato de `docs/DATA_FORMAT.md`), configure:

1. Copie `editor.local.example.json` para `editor.local.json` (fica fora do git).
2. Ajuste os caminhos:
   - `engineDir` (opcional, padrão `../jogo-plataforma-snes`) — pasta raiz da
     engine; só precisa ter um `Makefile` dentro se você também for compilar
     por aqui (o export de arquivos sozinho não exige isso).
   - `pvsneslibHome`, `gitBashPath`, `makeDir`, `timeoutSeconds` — só
     necessários pra COMPILAR (`make`)/usar o botão "Jogar"; sem eles, o
     export de arquivos continua funcionando normalmente, só o build é
     pulado com uma mensagem explicando o que falta.
3. Salve: se algo estiver faltando ou errado, a própria tela explica o que ajustar
   (o arquivo é relido a cada build; não precisa reiniciar o servidor).

Sem o arquivo `editor.local.json` nenhum, os arquivos continuam sendo
exportados normalmente na pasta padrão; só o build é pulado.

## Licença

MIT — ver `LICENSE`.
