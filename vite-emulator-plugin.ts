import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { readBuildConfig } from './vite-engine-build.ts'
import { launchEmulator, pickEmulatorPathNative, readEmulatorPath, writeEmulatorPath } from './vite-emulator.ts'

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/** Mesma checagem de todo endpoint deste dev server — ver comentário gêmeo em vite-export-gfx-plugin.ts. */
function isSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (text.trim() === '') {
        resolvePromise({})
        return
      }
      try {
        resolvePromise(JSON.parse(text) as Record<string, unknown>)
      } catch {
        rejectPromise(new Error('JSON inválido no corpo da requisição.'))
      }
    })
  })
}

/**
 * Botão "Jogar" (estilo Unity) na barra de topo, docs/PROGRESS.md "botão Jogar" — compila (ver
 * `/api/build-engine` em vite-export-gfx-plugin.ts) e abre o ROM direto no emulador do usuário.
 * Middlewares só ativos em `npm run dev` (não rodam em build/preview):
 * - `GET /api/emulator-path`: caminho do emulador já salvo em editor.local.json (`null` se ainda
 *   não escolhido).
 * - `POST /api/emulator-path/pick`: abre o seletor de arquivo NATIVO do Windows pra escolher o
 *   executável do emulador (não salva sozinho — só devolve o caminho escolhido).
 * - `POST /api/emulator-path`: salva `{ path }` em editor.local.json (mesclando com o resto da
 *   config, nunca sobrescrevendo).
 * - `POST /api/launch-emulator`: abre `{ romPath }` (relativo à pasta da engine, ex. o `rom.path`
 *   que `/api/build-engine` devolveu) no emulador já salvo.
 */
export function emulatorPlugin(): Plugin {
  return {
    name: 'emulator',
    configureServer(server) {
      // Rota própria pro seletor nativo (montada ANTES de '/api/emulator-path' — o connect do Vite
      // casa por prefixo, então '/api/emulator-path/pick' bateria nas duas se a ordem fosse
      // invertida; mantendo os dois caminhos como middlewares SEPARADOS, sem depender de qual vem
      // primeiro nem de inspecionar req.url à mão dentro do handler).
      server.middlewares.use('/api/emulator-path/pick', (req, res) => {
        if (!isSameOrigin(req)) {
          sendJson(res, 403, { ok: false, message: 'Origem não permitida.' })
          return
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }
        pickEmulatorPathNative()
          .then((result) => sendJson(res, 200, result))
          .catch((err: unknown) => sendJson(res, 500, { ok: false, message: err instanceof Error ? err.message : String(err) }))
      })

      server.middlewares.use('/api/emulator-path', (req, res) => {
        if (!isSameOrigin(req)) {
          sendJson(res, 403, { ok: false, message: 'Origem não permitida.' })
          return
        }

        if (req.method === 'GET') {
          sendJson(res, 200, { ok: true, path: readEmulatorPath(import.meta.dirname) })
          return
        }

        if (req.method === 'POST') {
          readJsonBody(req)
            .then((body) => {
              const path = body.path
              if (typeof path !== 'string' || path.trim() === '') {
                sendJson(res, 400, { ok: false, message: 'Falta o caminho do emulador no corpo da requisição.' })
                return
              }
              sendJson(res, 200, writeEmulatorPath(import.meta.dirname, path))
            })
            .catch((err: Error) => sendJson(res, 400, { ok: false, message: err.message }))
          return
        }

        res.statusCode = 405
        res.end('Method not allowed')
      })

      server.middlewares.use('/api/launch-emulator', (req, res) => {
        if (!isSameOrigin(req)) {
          sendJson(res, 403, { ok: false, phase: 'config', message: 'Origem não permitida.' })
          return
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        readJsonBody(req)
          .then((body) => {
            const romPath = body.romPath
            if (typeof romPath !== 'string' || romPath.trim() === '') {
              sendJson(res, 400, { ok: false, phase: 'config', message: 'Falta "romPath" no corpo da requisição.' })
              return
            }

            const buildConfig = readBuildConfig(import.meta.dirname)
            if (!buildConfig.ok) {
              sendJson(res, 200, { ok: false, phase: 'config', message: buildConfig.message })
              return
            }

            const emulatorPath = readEmulatorPath(import.meta.dirname)
            if (!emulatorPath) {
              sendJson(res, 200, {
                ok: false,
                phase: 'no-emulator',
                message: 'Ainda não escolhi o emulador nesta máquina.',
              })
              return
            }

            const romAbsolutePath = resolve(buildConfig.config.engineDir, romPath)
            launchEmulator(emulatorPath, romAbsolutePath)
              .then((result) =>
                sendJson(res, 200, result.ok ? { ok: true } : { ok: false, phase: 'spawn', message: result.message }),
              )
              .catch((err: unknown) =>
                sendJson(res, 500, { ok: false, phase: 'spawn', message: err instanceof Error ? err.message : String(err) }),
              )
          })
          .catch((err: Error) => sendJson(res, 400, { ok: false, phase: 'config', message: err.message }))
      })
    },
  }
}
