import { mkdirSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, join, relative, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { readBuildConfig, readEngineDir, runEngineBuild } from './vite-engine-build.ts'
import { deleteGfxFile, isReadableGfxFileName, listGfxDir, readGfxFile } from './vite-gfx-files.ts'

// Pasta do projeto irmão (engine em C/PVSnesLib) — ver CLAUDE.md "Contrato
// com a engine". Caminho local desta máquina, não faz parte do contrato de
// formato em si (ver docs/DATA_FORMAT.md seção 6). Segue a MESMA config
// `engineDir` de editor.local.json que `/api/build-engine` já usa (ver
// `readEngineDir` em vite-engine-build.ts) — ANTES este caminho era uma
// constante própria, hardcoded, que nunca lia a config (docs/PROGRESS.md,
// "unificar engineDir do export com o do build", 2026-10-14): configurar
// `engineDir` só afetava o `make`, o export continuava sempre indo pro
// mesmo lugar fixo. Recalculado a cada requisição (não uma constante de
// módulo) pra editar editor.local.json valer sem reiniciar o dev server,
// mesmo espírito de `readBuildConfig`/`readEngineDir`.
//
// `PROMETEUS_E2E_GFX_DIR` (docs/PROGRESS.md, "infra de teste Playwright",
// 2026-09-25): override só usado pelos testes E2E (`playwright.config.ts`),
// pra NUNCA escrever nos arquivos reais da Anubis (`stage1_*`/`hero_*`/
// `enemy1_*`) — incidente real desta semana: um script de teste já sobrescreveu
// esses arquivos sem querer. Tem prioridade sobre QUALQUER `engineDir`
// configurado — sem essa variável (uso normal, `npm run dev`), segue a config.
function resolveEngineGfxDir(): string {
  if (process.env.PROMETEUS_E2E_GFX_DIR) return resolve(process.env.PROMETEUS_E2E_GFX_DIR)
  return join(readEngineDir(import.meta.dirname), 'assets', 'gfx')
}

// `.json` entrou pro sidecar `<base>_tileset_refs.json` (docs/PROGRESS.md, "fase referencia
// tileset por nome", 2026-09-23) — Prometeus-only, a Anubis nunca lê, mas fica junto dos outros
// arquivos de `stage1_*` em `assets/gfx/` (mesma pasta, mesma convenção de nome). `.txt` é o
// `_tilemap_priority.txt` (docs/DATA_FORMAT.md § 4, "Bit de prioridade por tile da Camada 1",
// 2026-10-02) — esse sim lido pela Anubis, texto puro (sem `#define`, por isso não é `.h`).
const FILE_NAME_PATTERN = /^[\w.-]+\.(bmp|h|json|txt)$/i

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * Só aceita requisições da própria página do editor: se o navegador mandar
 * `Origin`, o host precisa ser o do dev server. (curl e afins não mandam
 * Origin e passam; um site qualquer aberto no navegador não.)
 */
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
 * Middlewares só ativos em `npm run dev` (não rodam em build/preview):
 * - `POST /api/export-gfx`: recebe o `.bmp`/`.h` exportado e escreve direto em
 *   `<engineDir>/assets/gfx/` (`<engineDir>` configurável em `editor.local.json`, padrão
 *   `../jogo-plataforma-snes` — ver `readEngineDir` em vite-engine-build.ts).
 * - `POST /api/build-engine`: roda o `make` da engine (config em
 *   editor.local.json) e devolve se passou ou falhou, com a saída.
 * - `GET /api/gfx-list`: lista os arquivos em `assets/gfx/` (pra galeria de
 *   personagens salvos descobrir o que já existe — ver savedCharacters.ts).
 * - `GET /api/gfx-file?name=`: lê um arquivo de `assets/gfx/` (tiles.bmp,
 *   metasprites.h, anim.h) pra reconstruir um personagem já exportado.
 * - `DELETE /api/gfx-file?name=`: apaga um arquivo de `assets/gfx/`.
 */
export function exportGfxPlugin(): Plugin {
  return {
    name: 'export-gfx',
    configureServer(server) {
      server.middlewares.use('/api/export-gfx', (req, res) => {
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
          sendJson(res, 400, { ok: false, message: 'Nome de arquivo inválido (esperado *.bmp, *.h, *.json ou *.txt).' })
          return
        }

        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', () => {
          try {
            const gfxDir = resolveEngineGfxDir()
            mkdirSync(gfxDir, { recursive: true })
            const safeName = basename(fileName)
            const fullPath = resolve(gfxDir, safeName)
            writeFileSync(fullPath, Buffer.concat(chunks))
            // Caminho de EXIBIÇÃO (só pra UI mostrar "Salvo em ...") — relativo à raiz do editor,
            // continua lendo "../jogo-plataforma-snes/assets/gfx/..." no caso comum (engineDir
            // padrão), mas acompanha de verdade um `engineDir` configurado diferente.
            sendJson(res, 200, { ok: true, path: relative(import.meta.dirname, fullPath).replace(/\\/g, '/') })
          } catch (err) {
            sendJson(res, 500, { ok: false, message: err instanceof Error ? err.message : String(err) })
          }
        })
      })

      server.middlewares.use('/api/build-engine', (req, res) => {
        if (!isSameOrigin(req)) {
          sendJson(res, 403, { ok: false, phase: 'config', message: 'Origem não permitida.' })
          return
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        const config = readBuildConfig(import.meta.dirname)
        if (!config.ok) {
          sendJson(res, 200, { ok: false, phase: 'config', message: config.message })
          return
        }
        runEngineBuild(config.config)
          .then((result) => sendJson(res, 200, result))
          .catch((err: unknown) =>
            sendJson(res, 500, {
              ok: false,
              phase: 'spawn',
              message: err instanceof Error ? err.message : String(err),
            }),
          )
      })

      server.middlewares.use('/api/gfx-list', (req, res) => {
        if (!isSameOrigin(req)) {
          sendJson(res, 403, { ok: false, message: 'Origem não permitida.' })
          return
        }
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }
        sendJson(res, 200, { ok: true, files: listGfxDir(resolveEngineGfxDir()) })
      })

      server.middlewares.use('/api/gfx-file', (req, res) => {
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
            const data = readGfxFile(resolveEngineGfxDir(), name)
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
            const deleted = deleteGfxFile(resolveEngineGfxDir(), name)
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
