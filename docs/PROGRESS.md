# Progresso do Projeto

> Atualizado a cada sessão de trabalho. É a principal fonte de "memória"
> entre sessões do Claude Code — mantenha objetivo e recente no topo.

## Status atual
Skeleton funcional criado e testado no navegador (Vite + React + TypeScript).
Duas telas implementadas, confirmadas pelo usuário como o escopo mínimo:

1. **Importar / Preview** (`src/features/import-preview/`) — upload de
   imagem local, preview com fundo de transparência (checkerboard) e
   metadados (nome, dimensões, tamanho). Nenhuma conversão para formato
   PVSnesLib acontece ainda.
2. **Exportar teste** (`src/features/export-test/`) — gera e baixa um
   `export-teste.json` mínimo (não é o formato final) para validar o
   pipeline de export ponta a ponta.

Testado com Playwright (build, lint, e fluxo completo no navegador — upload
de PNG 8×8, preview renderizado, export disparando download, JSON coerente,
zero erros de console).

## Próximo passo
1. Fechar (🟢) pelo menos uma seção de `docs/DATA_FORMAT.md` em conjunto
   com o projeto `../jogo-plataforma-snes` antes de implementar qualquer
   conversor real (hoje todas as seções estão 🔴).
2. Decidir se o editor de tilemap e a conversão de paleta (adiados do
   skeleton inicial) entram na próxima etapa.

## Log
- 2026-09-17: Projeto criado do zero (Vite + React + TS) como pasta irmã de
  `jogo-plataforma-snes`. `docs/DATA_FORMAT.md` copiado do projeto engine
  (contrato compartilhado). Skeleton com as 2 telas acima implementado e
  validado no navegador via Playwright.

## Bugs/pendências conhecidas
(nenhum ainda)
