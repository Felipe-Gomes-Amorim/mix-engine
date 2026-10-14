// Cor de fundo (backdrop) fixa atrás da Camada 2 — docs/PROGRESS.md, "seletor de cor de fundo",
// 2026-09-30. Pedido explícito do usuário: NÃO é um color picker livre — só deixa escolher entre
// as cores que JÁ existem na paleta dos tilesets usados pela fase, pra garantir consistência visual
// (a cor de fundo sempre bate com alguma cor que já aparece na arte).
//
// Formato de EXPORT fechado do lado da Anubis em 2026-10-01 (docs/DATA_FORMAT.md § 4, "Cor de
// fundo fixa da fase (backdrop)") — 3 defines `<BASE>_BACKDROP_R/G/B` em `stage1_entities.h`,
// inteiros de 0 a 31 (5 bits por canal, unidade nativa do SNES), gerados em exportEntities.ts.

import type { RgbColor } from '../indexedBmp.ts'

/** Cores ÚNICAS (por valor RGB, não por índice de paleta) entre TODOS os tilesets de uma sessão de
 * pintura — Camada 1 e Camada 2 combinadas, sem distinção (pedido explícito: "deduplicadas", sem
 * separar por camada). Ordem: primeira aparição (percorre os tilesets na mesma ordem de sempre,
 * cada paleta na ordem em que o próprio tileset a guarda) — é essa ordem que decide a amostra
 * PADRÃO quando nada foi escolhido ainda (`uniqueBackdropColors(...)[0]`, ver StageSession.tsx). */
export function uniqueBackdropColors(tilesets: readonly { upload: { palette: readonly RgbColor[] } }[]): RgbColor[] {
  const seen = new Set<string>()
  const unique: RgbColor[] = []
  for (const t of tilesets) {
    for (const color of t.upload.palette) {
      const key = color.join(',')
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(color)
    }
  }
  return unique
}

/** Converte um canal 0-255 (RGB web, o que a paleta de um tileset já guarda) pro valor nativo SNES
 * (5 bits, 0-31) — MESMO bit-shift que o `gfx4snes`/`RGB8` da PVSnesLib já fazem com as paletas
 * (docs/DATA_FORMAT.md § 4, "Cor de fundo fixa da fase"): `canal5 = canal8 >> 3`. */
export function channel8To5Bit(channel: number): number {
  return channel >> 3
}

/** Os 3 canais já no formato que `exportEntities.ts` grava nos `#define ..._BACKDROP_R/G/B`. */
export function backdropColorToSnes5Bit(color: RgbColor): [number, number, number] {
  return [channel8To5Bit(color[0]), channel8To5Bit(color[1]), channel8To5Bit(color[2])]
}

/** Arredonda uma cor 0-255 pro que ela VAI aparecer de verdade depois do corte pra 5 bits (ida e
 * volta: `canal5 * 255 / 31`, exatamente como `docs/DATA_FORMAT.md` § 4 recomenda) — só pra
 * MOSTRAR (prévia ao vivo, "evita surpresa" entre o que o editor mostra e o que o jogo exporta),
 * nunca pro valor exportado de verdade (esse usa `backdropColorToSnes5Bit` direto, sem arredondar
 * de volta pra 0-255). */
export function roundTripBackdropColor(color: RgbColor): RgbColor {
  const [r5, g5, b5] = backdropColorToSnes5Bit(color)
  const to8 = (channel5: number) => Math.round((channel5 * 255) / 31)
  return [to8(r5), to8(g5), to8(b5)]
}
