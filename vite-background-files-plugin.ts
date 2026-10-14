import { mkdirSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { deleteGfxFile, isReadableGfxFileName, listGfxDir, readGfxFile } from './vite-gfx-files.ts'

// Fundos salvos (docs/PROGRESS.md, "Fundo como recurso salvo", 2026-09-30) — pasta PRÓPRIA do
// Prometeus, dentro DESTE projeto (não em jogo-plataforma-snes/assets/gfx/): a Anubis nunca lê nem
// precisa saber que isso existe. Irmão de vite-tileset-files-plugin.ts, mesmo formato de endpoints
// (prefixo /api/background-* em vez de /api/tileset-*), mesma pasta de arquivos permitidos
// (`vite-gfx-files.ts`, já genérico por diretório).
//
// `PROMETEUS_E2E_BACKGROUND_DIR`: mesmo espírito do override de vite-tileset-files-plugin.ts — os
// testes E2E nunca escrevem nos fundos reais do usuário.
const BACKGROUND_DIR = process.env.PROMETEUS_E2E_BACKGROUND_DIR
  ? resolve(process.env.PROMETEUS_E2E_BACKGROUND_DIR)
  : resolve(import.meta.dirname, 'assets/backgrounds')

const FILE_NAME_PATTERN = /^[\w.-]+\.(bmp|json)$/i

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/** Mesma checagem de vite-tileset-files-plugin.ts — só aceita requisição da própria página do editor. */
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
 * Middlewares só ativos em `npm run dev` — CRUD de Fundo salvo, em `assets/backgrounds/` DESTE
 * projeto (Prometeus), nunca em `jogo-plataforma-snes/`:
 * - `POST /api/background-save`: recebe o `.bmp` (imagem original importada, inteira) ou `.json`
 *   (metadados: só `version`) de um Fundo e escreve.
 * - `GET /api/background-list`: lista os arquivos salvos (pra galeria "Fundos" descobrir o que já
 *   existe — ver backgroundDiscovery.ts).
 * - `GET /api/background-file?name=`: lê um arquivo (bmp ou json) pra reabrir/reutilizar um Fundo
 *   salvo.
 * - `DELETE /api/background-file?name=`: apaga um arquivo.
 */
export function backgroundFilesPlugin(): Plugin {
  return {
    name: 'background-files',
    configureServer(server) {
      server.middlewares.use('/api/background-save', (req, res) => {
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
            mkdirSync(BACKGROUND_DIR, { recursive: true })
            const safeName = basename(fileName)
            writeFileSync(resolve(BACKGROUND_DIR, safeName), Buffer.concat(chunks))
            sendJson(res, 200, { ok: true, path: `assets/backgrounds/${safeName}` })
          } catch (err) {
            sendJson(res, 500, { ok: false, message: err instanceof Error ? err.message : String(err) })
          }
        })
      })

      server.middlewares.use('/api/background-list', (req, res) => {
        if (!isSameOrigin(req)) {
          sendJson(res, 403, { ok: false, message: 'Origem não permitida.' })
          return
        }
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }
        sendJson(res, 200, { ok: true, files: listGfxDir(BACKGROUND_DIR) })
      })

      server.middlewares.use('/api/background-file', (req, res) => {
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
            const data = readGfxFile(BACKGROUND_DIR, name)
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
            const deleted = deleteGfxFile(BACKGROUND_DIR, name)
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
