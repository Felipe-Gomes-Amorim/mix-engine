import { hitboxLeft, validateHitbox, type Hitbox } from './hitbox.ts'
import type { MetaspriteSheet } from './types.ts'

/** Bits do byte de atributo do OAM que a PVSnesLib expõe (sprite.h). */
export const OBJ_FLIPX = 0x40
export const OBJ_FLIPY = 0x80
export function objPal(palette: number): number {
  return palette << 1
}

export function pieceFlags(flipH: boolean, flipV: boolean, palette: number): number {
  return (flipH ? OBJ_FLIPX : 0) | (flipV ? OBJ_FLIPY : 0) | objPal(palette)
}

function hex2(value: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(2, '0')}`
}

/**
 * Gera o .h de C com a tabela de peças de cada frame (puro dado estático,
 * sem parser — mesmo princípio do `_anim.h`, ver docs/DATA_FORMAT.md § 3).
 * `tilesFile` é o nome do .bmp de tiles empacotados (só citado no comentário).
 * `hitbox` (1 por sheet) vira `<BASE>_HITBOX_W/H`; é validada aqui de novo
 * (>= 1 e <= frame) e uma hitbox inválida lança erro em vez de gerar lixo.
 */
export function generateMetaspriteHeader(
  sheet: MetaspriteSheet,
  baseName: string,
  sourceFileName: string,
  tilesFile: string,
  hitbox: Hitbox,
): string {
  const hitboxErrors = validateHitbox(hitbox, sheet.frameWidth, sheet.frameHeight)
  if (hitboxErrors.length > 0) throw new Error(hitboxErrors.join(' '))
  const upper = baseName.toUpperCase()
  const lines: string[] = [
    `/* gerado pelo snes-asset-editor a partir de ${sourceFileName} — não editar à mão`,
    ' *',
    ' * Metasprites (docs/DATA_FORMAT.md seção 3). Requer OBSEL = OBJ_SIZE8_L16',
    ' * (sprite pequeno 8x8, grande 16x16 — o mesmo par de src/sprites_gfx.c).',
    ' *',
    ` * Tiles: ${tilesFile} (128px de largura = 16 tiles por linha, o layout da`,
    ' * memória OBJ; sem dedup do gfx4snes — ver DATA_FORMAT.md). `tile` é o índice',
    ' * do canto sup. esq. da peça, relativo ao início desses tiles na VRAM: some',
    ' * o offset onde o bloco foi carregado. Peça 16x16 com tile N usa N, N+1, N+16, N+17.',
    ' *',
    ' * Peça: dx/dy em pixels relativos ao PIVÔ do frame (int8); `flags` = byte de',
    ' * atributo do OAM sem prioridade (OBJ_FLIPX 0x40 | OBJ_FLIPY 0x80 | OBJ_PAL(n));',
    ' * `size` = OBJ_SMALL (8x8) ou OBJ_LARGE (16x16). Desenhe cada peça em',
    ' * (x + dx, y + dy), onde (x, y) é a posição do pivô na tela.',
    ' *',
    ' * ESPELHAR o personagem inteiro (flip horizontal): o hardware só espelha',
    ' * dentro do quadrado de cada peça, então, para cada peça:',
    ` *   dx' = -(dx + tamanho_da_peça)   e   flags ^= OBJ_FLIPX`,
    ` * (tamanho_da_peça = 8 ou 16; macro ${upper}_MIRROR_DX abaixo). O pivô fica`,
    ' * fixo na tela. Flip vertical seria análogo com dy e OBJ_FLIPY.',
    ' *',
    ` * HITBOX (${upper}_HITBOX_W/H, px): UMA por sheet (não por frame), menor que o frame.`,
    ' * Ancorada nos pés: a base fica no pivô e ela é centrada no pivô em X —',
    ' * esquerda = pivô_x - W/2 (divisão inteira), direita = esquerda + W,',
    ' * topo = pivô_y - H (a base é o próprio pivô_y). Sem offset em X.',
    ' */',
    '#ifndef SNES_ASSET_METAPIECE_T',
    '#define SNES_ASSET_METAPIECE_T',
    'typedef struct { s8 dx; s8 dy; u16 tile; u8 flags; u8 size; } metapiece_t;',
    '/* pivot_x/pivot_y: pivô em pixels a partir do canto sup. esq. do frame lógico (largura x altura) */',
    'typedef struct { u8 pivot_x; u8 pivot_y; u8 piece_count; const metapiece_t *pieces; } metaframe_t;',
    '#endif',
    '',
    `#define ${upper}_FRAME_WIDTH ${sheet.frameWidth}`,
    `#define ${upper}_FRAME_HEIGHT ${sheet.frameHeight}`,
    `#define ${upper}_FRAME_COUNT ${sheet.frames.length}`,
    `#define ${upper}_TILE_ROWS ${sheet.tileSheet.tileRows} /* linhas de 16 tiles ocupadas */`,
    `#define ${upper}_MIRROR_DX(dx, size) (-((dx) + (size)))`,
    `#define ${upper}_HITBOX_W ${hitbox.width} /* caixa de colisão: largura, centrada no pivô em X (esquerda = ${hitboxLeft(hitbox.width)} do pivô) */`,
    `#define ${upper}_HITBOX_H ${hitbox.height} /* caixa de colisão: altura, da base (pivô) pra cima */`,
    '',
  ]

  for (const frame of sheet.frames) {
    if (frame.pieces.length === 0) continue
    lines.push(`static const metapiece_t ${baseName}_f${frame.index}_pieces[] = {`)
    for (const piece of frame.pieces) {
      const size = piece.size === 16 ? 'OBJ_LARGE' : 'OBJ_SMALL'
      const flags = hex2(pieceFlags(piece.flipH, piece.flipV, piece.palette))
      lines.push(`    { ${piece.dx}, ${piece.dy}, ${piece.tile}, ${flags}, ${size} },`)
    }
    lines.push('};')
  }
  lines.push('')

  lines.push(`static const metaframe_t ${baseName}_frames[${upper}_FRAME_COUNT] = {`)
  for (const frame of sheet.frames) {
    const pieces = frame.pieces.length === 0 ? '0' : `${baseName}_f${frame.index}_pieces`
    lines.push(
      `    { ${frame.pivot.x}, ${frame.pivot.y}, ${frame.pieces.length}, ${pieces} },`,
    )
  }
  lines.push('};', '')

  return lines.join('\n')
}
