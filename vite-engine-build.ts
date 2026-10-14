import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Roda o `make` da engine (../jogo-plataforma-snes) depois de salvar arquivos
// (docs/DATA_FORMAT.md seção 6, parte 2/3). Lado Node do dev server; nada
// aqui roda em `vite build`. A configuração local (caminhos desta máquina)
// fica em editor.local.json, fora do git — ver editor.local.example.json.

export const CONFIG_FILE_NAME = 'editor.local.json'
export const DEFAULT_TIMEOUT_SECONDS = 300
const OUTPUT_LIMIT = 1_000_000
const OUTPUT_TAIL_CHARS = 20_000

export interface BuildConfig {
  /** Pasta da PVSnesLib (a que tem `devkitsnes/` dentro), com barra normal. */
  pvsneslibHome: string
  gitBashPath: string
  /** Pasta que contém o make.exe (ex.: o do winget), colocada no início do PATH. */
  makeDir?: string
  /** Pasta da engine (tem o Makefile), absoluta, com barra normal. */
  engineDir: string
  timeoutSeconds: number
}

export type ConfigResult = { ok: true; config: BuildConfig } | { ok: false; message: string }

export type BuildResult =
  | {
      ok: true
      durationMs: number
      output: string
      /** ROM mais recente em build/ (`updated` = foi regravada por este build). */
      rom?: { path: string; bytes: number; updated: boolean }
    }
  | {
      ok: false
      phase: 'config' | 'busy' | 'spawn' | 'make' | 'timeout'
      message: string
      output?: string
      durationMs?: number
      exitCode?: number | null
    }

/** Acesso ao disco injetável (os testes usam um falso). */
export interface FsLike {
  exists(path: string): boolean
  readText(path: string): string
}

const nodeFs: FsLike = {
  exists: (path) => existsSync(path),
  readText: (path) => readFileSync(path, 'utf8'),
}

const toSlashes = (path: string) => path.replace(/\\/g, '/')

export const DEFAULT_ENGINE_DIR = '../jogo-plataforma-snes'

/**
 * Lê só `engineDir` de editor.local.json — bem mais tolerante que `readBuildConfig` (que também
 * exige `pvsneslibHome`/`gitBashPath`/um Makefile de verdade só pra BUILDAR o jogo): arquivo
 * ausente, JSON quebrado, campo ausente ou de tipo errado tudo cai no padrão de sempre
 * (`DEFAULT_ENGINE_DIR`, resolvido a partir de `rootDir`), nunca lança.
 *
 * Usada por `vite-export-gfx-plugin.ts` pra achar onde escrever os arquivos exportados — ANTES,
 * esse caminho era uma constante própria, hardcoded, nunca lendo `editor.local.json` (docs/
 * PROGRESS.md, "unificar engineDir do export com o do build", 2026-10-14): configurar `engineDir`
 * só afetava o `make`, o export de `.bmp`/`.h` continuava sempre indo pro mesmo lugar fixo. Esta
 * função é o único ponto que decide "onde fica a pasta da engine" — tanto o export quanto
 * `readBuildConfig` (abaixo) concordam com o MESMO valor agora.
 */
export function readEngineDir(rootDir: string, fs: FsLike = nodeFs): string {
  const file = join(rootDir, CONFIG_FILE_NAME)
  const fallback = toSlashes(resolve(rootDir, DEFAULT_ENGINE_DIR))
  if (!fs.exists(file)) return fallback
  try {
    const raw = JSON.parse(fs.readText(file)) as unknown
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fallback
    const value = (raw as Record<string, unknown>).engineDir
    if (typeof value !== 'string' || value.trim() === '') return fallback
    return toSlashes(resolve(rootDir, value))
  } catch {
    return fallback
  }
}

/**
 * Lê e valida editor.local.json (a cada chamada, então editar o arquivo vale
 * sem reiniciar o dev server). Mensagens em português dizendo o que fazer.
 */
export function readBuildConfig(rootDir: string, fs: FsLike = nodeFs): ConfigResult {
  const file = join(rootDir, CONFIG_FILE_NAME)
  if (!fs.exists(file)) {
    return {
      ok: false,
      message:
        `Não achei o arquivo ${CONFIG_FILE_NAME} na raiz do editor. Copie ` +
        'editor.local.example.json para editor.local.json e ajuste os caminhos ' +
        '(PVSnesLib, Git Bash e make) para esta máquina.',
    }
  }

  let raw: unknown
  try {
    raw = JSON.parse(fs.readText(file))
  } catch (err) {
    return {
      ok: false,
      message: `${CONFIG_FILE_NAME} não é um JSON válido: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, message: `${CONFIG_FILE_NAME} precisa ser um objeto JSON ({ ... }).` }
  }
  const obj = raw as Record<string, unknown>

  const text = (key: string, required: boolean): string | undefined | Error => {
    const value = obj[key]
    if (value === undefined || value === '') {
      return required ? new Error(`Falta "${key}" no ${CONFIG_FILE_NAME}.`) : undefined
    }
    if (typeof value !== 'string') return new Error(`"${key}" no ${CONFIG_FILE_NAME} precisa ser um texto (caminho).`)
    return value
  }

  const pvsneslib = text('pvsneslibHome', true)
  if (pvsneslib instanceof Error) return { ok: false, message: pvsneslib.message }
  const gitBash = text('gitBashPath', true)
  if (gitBash instanceof Error) return { ok: false, message: gitBash.message }
  const makeDirRaw = text('makeDir', false)
  if (makeDirRaw instanceof Error) return { ok: false, message: makeDirRaw.message }
  const engineRaw = text('engineDir', false)
  if (engineRaw instanceof Error) return { ok: false, message: engineRaw.message }

  const pvsneslibHome = toSlashes(pvsneslib!)
  if (!fs.exists(join(pvsneslibHome, 'devkitsnes', 'snes_rules'))) {
    return {
      ok: false,
      message:
        `"pvsneslibHome" (${pvsneslibHome}) não parece a pasta da PVSnesLib: falta ` +
        'devkitsnes/snes_rules dentro dela. Use a pasta que tem devkitsnes/ e pvsneslib/ dentro.',
    }
  }

  const gitBashPath = toSlashes(gitBash!)
  if (!fs.exists(gitBashPath)) {
    return { ok: false, message: `"gitBashPath" (${gitBashPath}) não existe. Aponte para o bash.exe do Git for Windows.` }
  }

  let makeDir: string | undefined
  if (makeDirRaw !== undefined) {
    makeDir = toSlashes(makeDirRaw)
    if (!fs.exists(join(makeDir, 'make.exe')) && !fs.exists(join(makeDir, 'make'))) {
      return {
        ok: false,
        message: `"makeDir" (${makeDir}) não tem o make.exe. Aponte para a pasta do make (ex.: a do pacote ezwinports.make do winget).`,
      }
    }
  }

  const engineDir = toSlashes(resolve(rootDir, engineRaw ?? DEFAULT_ENGINE_DIR))
  if (!fs.exists(join(engineDir, 'Makefile'))) {
    return { ok: false, message: `A pasta da engine (${engineDir}) não tem um Makefile. Ajuste "engineDir".` }
  }

  const timeoutRaw = obj.timeoutSeconds
  let timeoutSeconds = DEFAULT_TIMEOUT_SECONDS
  if (timeoutRaw !== undefined) {
    if (typeof timeoutRaw !== 'number' || !Number.isFinite(timeoutRaw) || timeoutRaw < 5 || timeoutRaw > 1800) {
      return { ok: false, message: '"timeoutSeconds" precisa ser um número entre 5 e 1800.' }
    }
    timeoutSeconds = timeoutRaw
  }

  return { ok: true, config: { pvsneslibHome, gitBashPath, makeDir, engineDir, timeoutSeconds } }
}

/** Aspas simples do shell (escapa `'`), pra caminho nunca virar comando. */
export function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Comando que o Git Bash executa: entra na engine e roda o make (stderr junto do stdout). */
export function buildBashScript(config: BuildConfig): string {
  return `cd ${shQuote(config.engineDir)} && make 2>&1`
}

/** Ambiente do processo: PVSNESLIB_HOME fixo e a pasta do make no começo do PATH. */
export function buildEnv(
  base: NodeJS.ProcessEnv,
  config: BuildConfig,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base }
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
  if (config.makeDir) {
    const separator = platform === 'win32' ? ';' : ':'
    const makeDir = platform === 'win32' ? config.makeDir.replace(/\//g, '\\') : config.makeDir
    env[pathKey] = `${makeDir}${separator}${env[pathKey] ?? ''}`
  }
  env.PVSNESLIB_HOME = config.pvsneslibHome
  return env
}

/** Últimos `max` caracteres da saída (com aviso quando cortou). */
export function tailText(output: string, max = OUTPUT_TAIL_CHARS): string {
  if (output.length <= max) return output
  return `[... saída cortada: mostrando os últimos ${max} caracteres ...]\n${output.slice(-max)}`
}

function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  } else {
    child.kill('SIGKILL')
  }
}

function findRom(engineDir: string, startedAt: number): { path: string; bytes: number; updated: boolean } | undefined {
  try {
    const dir = join(engineDir, 'build')
    const roms = readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith('.sfc'))
      .map((name) => ({ name, stat: statSync(join(dir, name)) }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
    if (roms.length === 0) return undefined
    const [newest] = roms
    return {
      path: `build/${newest.name}`,
      bytes: newest.stat.size,
      updated: newest.stat.mtimeMs >= startedAt - 1000,
    }
  } catch {
    return undefined
  }
}

let building = false

/**
 * Roda `make` na engine dentro do Git Bash (o Makefile precisa de `cygpath` e
 * `sh`), com timeout. Só um build por vez: uma segunda chamada devolve
 * `phase: 'busy'` em vez de disparar dois `make` na mesma pasta.
 */
export async function runEngineBuild(
  config: BuildConfig,
  baseEnv: NodeJS.ProcessEnv = process.env,
): Promise<BuildResult> {
  if (building) {
    return { ok: false, phase: 'busy', message: 'Já existe um build em andamento — aguarde ele terminar.' }
  }
  building = true
  const startedAt = Date.now()
  try {
    return await new Promise<BuildResult>((resolvePromise) => {
      let output = ''
      let settled = false
      let timedOut = false
      const finish = (result: BuildResult) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolvePromise(result)
      }

      const child = spawn(config.gitBashPath, ['-lc', buildBashScript(config)], {
        env: buildEnv(baseEnv, config),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const timer = setTimeout(() => {
        timedOut = true
        killTree(child)
      }, config.timeoutSeconds * 1000)

      const collect = (chunk: Buffer) => {
        output += chunk.toString('utf8')
        if (output.length > OUTPUT_LIMIT) output = output.slice(-OUTPUT_LIMIT)
      }
      child.stdout?.on('data', collect)
      child.stderr?.on('data', collect)
      child.on('error', (err) =>
        finish({
          ok: false,
          phase: 'spawn',
          message: `Não consegui iniciar o Git Bash (${config.gitBashPath}): ${err.message}`,
        }),
      )
      child.on('close', (code) => {
        const durationMs = Date.now() - startedAt
        const tail = tailText(output)
        if (timedOut) {
          finish({
            ok: false,
            phase: 'timeout',
            message: `O build passou de ${config.timeoutSeconds} s e foi interrompido.`,
            output: tail,
            durationMs,
            exitCode: code,
          })
        } else if (code === 0) {
          finish({ ok: true, durationMs, output: tail, rom: findRom(config.engineDir, startedAt) })
        } else {
          finish({
            ok: false,
            phase: 'make',
            message: `O build do jogo falhou (código de saída ${code ?? 'desconhecido'}). Veja a saída abaixo.`,
            output: tail,
            durationMs,
            exitCode: code,
          })
        }
      })
    })
  } finally {
    building = false
  }
}
