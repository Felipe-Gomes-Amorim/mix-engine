# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é este projeto
Ferramenta web (React + TypeScript) que serve como **editor e gerenciador de
assets** para um jogo de plataforma 2D de SNES. Duas funções principais:
1. Importar e converter gráficos/sprites/sons para os formatos que a
   PVSnesLib consome.
2. Montar visualmente as fases do jogo (editor de tilemap).

O output exportado por esta ferramenta é consumido por um projeto **separado**,
a engine do jogo em C/PVSnesLib: `../jogo-plataforma-snes`. Os dois projetos
são desenvolvidos em sessões/repos distintos e precisam ficar sincronizados
via contrato de dados — ver "Contrato com a engine" abaixo.

**Status atual: bootstrap.** Ainda não há código, dependências ou build
configurados. Nada deve ser implementado antes de o escopo do skeleton inicial
ser confirmado com o usuário (ver `docs/PROGRESS.md` quando existir).

## Contrato com a engine
`docs/DATA_FORMAT.md` é a fonte de verdade sobre os formatos de arquivo
trocados entre este editor e a engine em C. Ele é espelhado em
`../jogo-plataforma-snes/docs/DATA_FORMAT.md` — se um lado mudar, o outro
precisa ser atualizado também. Cada seção do documento tem um status
(🔴 não definido / 🟡 rascunho / 🟢 fechado): **não implemente um
exportador/parser de uma seção enquanto ela não estiver 🟢.**

## Antes de codar
1. Confirme o escopo da tarefa com o usuário se não estiver claro — este
   projeto está em fase de definição de escopo do skeleton inicial.
2. Verifique o status da seção relevante em `docs/DATA_FORMAT.md` antes de
   implementar qualquer import/export de asset.
3. Ao terminar uma tarefa, atualize `docs/PROGRESS.md` (criar o arquivo se
   ainda não existir) com o que mudou e o que falta.

## Stack (planejada)
- React + TypeScript.
- Toolchain de build/lint/test ainda não definida — será registrada aqui
  assim que o skeleton inicial for implementado.
