// Lógica pura pro editor de sequência de animação (docs/DATA_FORMAT.md
// seção 3): fatiamento em grade de frames e geração do .h de C que descreve
// cada animação. Sem dependência de DOM/canvas — isso fica no componente.

export interface FrameGrid {
  frameWidth: number
  frameHeight: number
  cols: number
  rows: number
  frameCount: number
  /** Se a imagem não for múltiplo exato do frame (largura e altura), o
   * fatiamento fica indefinido/não testado — bloqueia o export nesse caso. */
  divisible: boolean
}

export function computeFrameGrid(
  width: number,
  height: number,
  frameWidth: number,
  frameHeight: number,
): FrameGrid {
  const divisible = width % frameWidth === 0 && height % frameHeight === 0
  const cols = Math.floor(width / frameWidth)
  const rows = Math.floor(height / frameHeight)
  return { frameWidth, frameHeight, cols, rows, frameCount: cols * rows, divisible }
}

export interface AnimationEntry {
  name: string
  frameIndices: number[]
  frameDuration: number
}

/** Animação em montagem (ainda não salva) — a prévia também toca ela. */
export interface AnimationDraft {
  name: string
  frames: number[]
  speed: number
}

export const EMPTY_DRAFT: AnimationDraft = { name: '', frames: [], speed: 8 }

/**
 * Nomes de animação do contrato fixo do slot "personagem principal"
 * (docs/DATA_FORMAT.md seção 3, "Slot do personagem principal"): o
 * `player.c` da engine só sabe procurar exatamente esses 5 — é um
 * `#include` de header gerado em tempo de compilação, não um parser em
 * tempo de execução, então não tem como "descobrir" nomes novos sozinho.
 * **As 5 precisam sempre existir** no `_anim.h` pra o jogo compilar (repetir
 * o quadro de outra animação já é suficiente se ainda não tiver uma pose
 * própria). Outros nomes além desses são só sugestão/extra — o jogo ignora
 * o que não reconhece, mas não trava por causa deles.
 */
export const SUGGESTED_ANIMATION_NAMES: ReadonlyArray<{ name: string; label: string }> = [
  { name: 'idle', label: 'parado' },
  { name: 'walk', label: 'andando' },
  { name: 'run', label: 'correndo' },
  { name: 'jump', label: 'pulando' },
  { name: 'fall', label: 'caindo' },
]

/** As mesmas 5 de cima, só os nomes — obrigatórias, não apenas sugeridas. */
export const REQUIRED_ANIMATION_NAMES: ReadonlyArray<string> = SUGGESTED_ANIMATION_NAMES.map((s) => s.name)

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/

/** Normaliza texto livre (com acento, espaço...) pra um identificador C
 * válido: minúsculo, sem acento, começa com letra, só [a-z0-9_]. */
export function sanitizeIdentifier(raw: string): string {
  return raw
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[_0-9]+/, '')
    .replace(/_+$/, '')
}

/** Duração em "frames do jogo" (60 por segundo) -> texto amigável, ex.: "0,13 s". */
export function formatDuration(gameFrames: number): string {
  return `${(gameFrames / 60).toFixed(2).replace('.', ',')} s`
}

export function isValidAnimationName(name: string): boolean {
  return IDENTIFIER_PATTERN.test(name)
}

export function generateAnimationHeader(
  baseName: string,
  fileName: string,
  frameWidth: number,
  frameHeight: number,
  animations: AnimationEntry[],
): string {
  const upperBase = baseName.toUpperCase()
  const lines: string[] = [
    `/* gerado pelo snes-asset-editor a partir de ${fileName} — não editar à mão */`,
    `#define ${upperBase}_FRAME_W ${frameWidth}`,
    `#define ${upperBase}_FRAME_H ${frameHeight}`,
    '',
  ]

  for (const anim of animations) {
    const upperAnim = anim.name.toUpperCase()
    lines.push(
      `static const u8 ${baseName}_anim_${anim.name}[] = { ${anim.frameIndices.join(', ')} };`,
    )
    lines.push(`#define ${upperBase}_${upperAnim}_FRAME_DURATION ${anim.frameDuration}`)
    lines.push('')
  }

  return lines.join('\n')
}
