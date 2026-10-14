# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Codinomes

Pra evitar confundir "o editor" (esta ferramenta, num sentido genérico) com
"a engine" (idem), os dois projetos têm codinome fixo — use-o ao se referir
a cada lado em `docs/PROGRESS.md`, `docs/DATA_FORMAT.md` e na conversa com o
usuário:

- **Este projeto** (`snes-asset-editor`) = **Prometeus**.
- **O projeto irmão** (`../jogo-plataforma-snes`) = **Anubis**.

## O que é este projeto
Ferramenta web (React + TypeScript) que serve como **editor e gerenciador de
assets** para um jogo de plataforma 2D de SNES. Duas funções principais:
1. Importar e converter gráficos/sprites/sons para os formatos que a
   PVSnesLib consome.
2. Montar visualmente as fases do jogo (editor de tilemap).

O output exportado por esta ferramenta é consumido por um projeto **separado**,
a Anubis, o jogo em C/PVSnesLib: `../jogo-plataforma-snes`. Os dois projetos
são desenvolvidos em sessões/repos distintos e precisam ficar sincronizados
via contrato de dados — ver "Contrato com a Anubis" abaixo.

**Status atual:** skeleton funcional (Vite + React + TS) com duas telas —
importar/preview de imagem e um export de teste (JSON placeholder). Ver
`docs/PROGRESS.md` pro estado atualizado a cada sessão (esta seção não é
reatualizada com a mesma frequência).

## Contrato com a Anubis
`docs/DATA_FORMAT.md` é a fonte de verdade sobre os formatos de arquivo
trocados entre este projeto (Prometeus) e a Anubis, em C. Ele é espelhado em
`../jogo-plataforma-snes/docs/DATA_FORMAT.md` e **precisa ser idêntico nos
dois projetos**. Cada seção do documento tem um status (🔴 não definido /
🟡 rascunho / 🟢 fechado): **não implemente um exportador/parser de uma
seção enquanto ela não estiver 🟢.**

**Sempre que `docs/DATA_FORMAT.md` for editado nesta sessão** (aqui, no
snes-asset-editor), copie o arquivo atualizado por cima de
`../jogo-plataforma-snes/docs/DATA_FORMAT.md` no mesmo passo, sem precisar
que o usuário peça — os dois arquivos existem no mesmo disco, então isso é
só um `cp`, não uma tarefa do outro projeto. Registre no `docs/PROGRESS.md`
de lá também (uma linha de log basta) pra próxima sessão daquele projeto
saber que mudou.

## Antes de codar
1. Confirme o escopo da tarefa com o usuário se não estiver claro — este
   projeto está em fase de definição de escopo do skeleton inicial.
2. Verifique o status da seção relevante em `docs/DATA_FORMAT.md` antes de
   implementar qualquer import/export de asset.
3. Ao terminar uma tarefa, atualize `docs/PROGRESS.md` (criar o arquivo se
   ainda não existir) com o que mudou e o que falta.

## Stack
- React + TypeScript, build com Vite (`npm run dev`/`npm run build`).
- Lint: oxlint (`npm run lint`, config em `.oxlintrc.json`).
- Teste: Playwright (fluxo completo no navegador, `e2e/`): `npm run test:e2e`
  — ver README.md "Testes E2E" pro isolamento (nunca escreve nos arquivos
  reais da Anubis/tilesets do usuário). Lógica pura (fatiador de
  metasprites em `src/lib/metasprite/`, tilemap, etc.) tem testes
  unitários com `node:test`: `npm test` (`tests/`, sem dependências).
