import type { Page } from '@playwright/test'

/**
 * Gera um PNG sintético desenhando uma grade `cols x rows` de células `cellSize x cellSize`, cada
 * uma com a cor de `colors[row][col]` (qualquer valor CSS válido, ex. "#ff0000") — usado pra montar
 * imagens de teste (tileset/cenário) sem depender de nenhum arquivo binário commitado. Desenha
 * DENTRO do navegador (via `page.evaluate`, canvas real) — round-trip por PNG lossless preserva
 * cada cor exatamente (sem antialiasing, coordenadas inteiras), o mesmo que `readImageFile.ts`
 * decodifica de volta.
 */
export async function makeGridPng(
  page: Page,
  cols: number,
  rows: number,
  cellSize: number,
  colors: string[][],
): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ({ cols, rows, cellSize, colors }) => {
      const canvas = document.createElement('canvas')
      canvas.width = cols * cellSize
      canvas.height = rows * cellSize
      const ctx = canvas.getContext('2d')!
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          ctx.fillStyle = colors[row][col]
          ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize)
        }
      }
      return canvas.toDataURL('image/png')
    },
    { cols, rows, cellSize, colors },
  )
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

/**
 * Tileset sintético de blocos de 8x8 (`DEFAULT_STAGE_BLOCK_SIZE`) TODOS distintos entre si —
 * mesma técnica já usada em `tests/reconstructStage.test.ts` (dedup do gfx4snes): cada bloco
 * codifica o próprio índice em 10 bits (0/1) numa grade de 2 cores só (`colorA`/`colorB`, os 10
 * primeiros pixels do bloco) — cobre até 1024 blocos únicos com só 2 cores reais (bem dentro do
 * limite de 16 cores do SNES). `cols*rows` deve caber em 1024. Devolve o PNG pronto pra upload.
 */
export async function makeUniqueBlocksPng(
  page: Page,
  cols: number,
  rows: number,
  colorA = '#101010',
  colorB = '#e0e0e0',
): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ({ cols, rows, colorA, colorB }) => {
      const blockSize = 8
      const canvas = document.createElement('canvas')
      canvas.width = cols * blockSize
      canvas.height = rows * blockSize
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = colorA
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = colorB
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const blockIndex = row * cols + col
          const ox = col * blockSize
          const oy = row * blockSize
          for (let bit = 0; bit < 10; bit++) {
            if (((blockIndex >> bit) & 1) === 0) continue
            const px = bit % blockSize
            const py = Math.floor(bit / blockSize)
            ctx.fillRect(ox + px, oy + py, 1, 1)
          }
        }
      }
      return canvas.toDataURL('image/png')
    },
    { cols, rows, colorA, colorB },
  )
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}
