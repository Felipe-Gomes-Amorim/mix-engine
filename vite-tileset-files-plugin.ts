import { mkdirSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { deleteGfxFile, isReadableGfxFileName, listGfxDir, readGfxFile } from './vite-gfx-files.ts'

// Tilesets salvos (docs/PROGRESS.md, "tilesets como recurso salvo e
// reutilizável", 2026-09-23) — pasta PRÓPRIA do Prometeus, dentro DESTE
// projeto (não em jogo-plataforma-snes/assets/gfx/): a Anubis nunca lê nem
// precisa saber que isso existe, é só o "banco" de tilesets reutilizáveis
// entre fases. Plugin irmão de vite-export-gfx-plugin.ts, mesmo formato de
// endpoints, reaproveitando vite-gfx-files.ts (já genérico por diretório).
//
// `PROMETEUS_E2E_TILESET_DIR` (docs/PROGRESS.md, "infra de teste
// Playwright", 2026-09-25): mesmo espírito do override em
// vite-export-gfx-plugin.ts — os testes E2E nunca escrevem nos tilesets
// reais do usuário (`grama_tileset`/`goalpost_tileset`).
const TILESET_DIR = process.env.PROMETEUS_E2E_TILESET_DIR
  ? resolve(process.env.PROMETEUS_E2E_TILESET_DIR)
  : resolve(import.meta.dirname, 'assets/tilesets')

const FILE_NAME_PATTERN = /^[\w.-]+\.(bmp|json)$/i

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/** Mesma checagem de vite-export-gfx-plugin.ts — só aceita requisição da própria página do editor. */
function isSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

function readQueryParam(req: IncomingMessage, key: string): string | null {
  try {
    return new URL(req.url ?? '', 'http://localhost').searchParams.get(key)
  } catch {
    return null
  }
}

/**
 * Middlewares só ativos em `npm run dev` — CRUD de tileset salvo, em
 * `assets/tilesets/` DESTE projeto (Prometeus), nunca em
 * `jogo-plataforma-snes/`:
 * - `POST /api/tileset-save`: recebe o `.bmp` (imagem original importada) ou
 *   `.json` (metadados: tamanho de bloco, colisão, camada por bloco) de um
 *   tileset e escreve.
 * - `GET /api/tileset-list`: lista os arquivos salvos (pra galeria "Tilesets"
 *   descobrir o que já existe — ver tilesetDiscovery.ts).
 * - `GET /api/tileset-file?name=`: lê um arquivo (bmp ou json) pra
 *   reabrir/reutilizar um tileset salvo.
 * - `DELETE /api/tileset-file?name=`: apaga um arquivo.
 */
export function tilesetFilesPlugin(): Plugin {
  return {
    name: 'tileset-files',
    configureServer(server) {
      server.middlewares.use('/api/tileset-save', (req, res) => {
        if (!isSameOrigin(req)) {
          sendJson(res, 403, { ok: false, message: 'Origem não permitida.' })
          return
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        const fileName = req.headers['x-file-name']
        if (typeof fileName !== 'string' || !FILE_NAME_PATTERN.test(fileName)) {
          sendJson(res, 400, { ok: false, message: 'Nome de arquivo inválido (esperado *.bmp ou *.json).' })
          return
        }

        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', () => {
          try {
            mkdirSync(TILESET_DIR, { recursive: true })
            const safeName = basename(fileName)
            writeFileSync(resolve(TILESET_DIR, safeName), Buffer.concat(chunks))
            sendJson(res, 200, { ok: true, path: `assets/tilesets/${safeName}` })
          } catch (err) {
            sendJson(res, 500, { ok: false, message: err instanceof Error ? err.message : String(err) })
          }
        })
      })

      server.middlewares.use('/api/tileset-list', (req, res) => {
        if (!isSameOrigin(req)) {
          sendJson(res, 403, { ok: false, message: 'Origem não permitida.' })
          return
        }
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }
        sendJson(res, 200, { ok: true, files: listGfxDir(TILESET_DIR) })
      })

      server.middlewares.use('/api/tileset-file', (req, res) => {
        if (!isSameOrigin(req)) {
          sendJson(res, 403, { ok: false, message: 'Origem não permitida.' })
          return
        }

        const name = readQueryParam(req, 'name')
        if (!name || !isReadableGfxFileName(name)) {
          sendJson(res, 400, { ok: false, message: 'Nome de arquivo inválido ou ausente.' })
          return
        }

        if (req.method === 'GET') {
          try {
            const data = readGfxFile(TILESET_DIR, name)
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/octet-stream')
            res.end(data)
          } catch (err) {
            const notFound = (err as NodeJS.ErrnoException).code === 'ENOENT'
            sendJson(res, notFound ? 404 : 500, {
              ok: false,
              message: notFound ? `"${name}" não existe.` : err instanceof Error ? err.message : String(err),
            })
          }
          return
        }

        if (req.method === 'DELETE') {
          try {
            const deleted = deleteGfxFile(TILESET_DIR, name)
            sendJson(res, 200, { ok: true, deleted })
          } catch (err) {
            sendJson(res, 500, { ok: false, message: err instanceof Error ? err.message : String(err) })
          }
          return
        }

        res.statusCode = 405
        res.end('Method not allowed')
      })
    },
  }
}
