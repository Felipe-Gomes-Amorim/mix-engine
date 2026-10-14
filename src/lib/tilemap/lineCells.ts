// Interpolação de linha entre duas células de grade (algoritmo de
// Bresenham) — usado pelo editor de fase pra pintar arrastando: o
// `mousemove` do navegador não garante um evento por célula percorrida
// (mouse rápido pula várias), então sem isso a pintura por arrasto sai
// com buracos.

export interface GridCell {
  col: number
  row: number
}

/** Todas as células numa linha reta entre os dois pontos, incluindo os dois extremos. Um único
 * ponto (start === end) devolve só ele. */
export function cellsOnLine(x0: number, y0: number, x1: number, y1: number): GridCell[] {
  const points: GridCell[] = []
  let x = x0
  let y = y0
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy

  for (;;) {
    points.push({ col: x, row: y })
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }

  return points
}
