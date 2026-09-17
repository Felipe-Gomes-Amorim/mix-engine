# DATA_FORMAT.md — Contrato de Dados entre Editor e Engine

> Este arquivo é a fonte de verdade sobre o formato dos arquivos trocados
> entre o **Editor** (chat 1 — ferramenta web de assets/fases) e a **Engine**
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
**Status:** 🔴 não definido

- Formato de exportação (ex.: `.pic`/`.map`/`.pal` da PVSnesLib, ou binário
  próprio):
- Resolução/tamanho de tile (8x8, 16x16?):
- Profundidade de cor (2bpp/4bpp/8bpp) e modo gráfico do SNES usado:
- Número máximo de tiles únicos por fase:
- Convenção de nomenclatura de arquivo:

## 2. Paletas
**Status:** 🔴 não definido

- Quantas paletas simultâneas (BG vs sprites):
- Formato de exportação:
- Limite de cores por paleta (hardware SNES = 16 cores por paleta em 4bpp):

## 3. Sprites e animação
**Status:** 🔴 não definido

- Formato de definição de frame de animação:
- Como os frames são referenciados (índice, nome, sequência):
- Metadados de hitbox/colisão do sprite (se houver):

## 4. Tilemap / Layout de fase
**Status:** 🔴 não definido

- Formato de exportação (grid de índices de tile, formato próprio, etc.):
- Dimensões máximas de uma fase (em tiles):
- Como camadas são representadas (fundo, cenário, colisão):
- Como entidades são posicionadas na fase (inimigos, coletáveis, checkpoints):
- Metadados de colisão por tile (sólido, plataforma, dano, etc.):

## 5. Áudio
**Status:** 🔴 não definido

- Formato de música (conforme suportado pela PVSnesLib):
- Formato de efeitos sonoros:
- Convenção de nomenclatura:

## 6. Estrutura de pastas/arquivos exportados
**Status:** 🔴 não definido

Como o Editor organiza a pasta de saída que a Engine vai consumir — ex.:
```
export/
├── gfx/
├── palettes/
├── levels/
└── audio/
```

## 7. Versionamento do formato
**Status:** 🔴 não definido

- Como sinalizar que um arquivo exportado é de uma versão incompatível do
  formato (evita a engine tentar ler um arquivo de formato antigo/errado).

---

## Histórico de decisões
(registre aqui, com data, sempre que uma seção acima for fechada — ex.:
"2026-09-17: fechado formato de tilemap, ver seção 4")
