import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  CONFIG_FILE_NAME,
  DEFAULT_ENGINE_DIR,
  buildBashScript,
  buildEnv,
  readBuildConfig,
  readEngineDir,
  runEngineBuild,
  shQuote,
  tailText,
  type BuildConfig,
  type FsLike,
} from '../vite-engine-build.ts'

// ---------- config (disco falso) ----------

/** Disco falso: `files` = caminhos (com barra normal) que existem; `config` = conteúdo do editor.local.json. */
function fakeFs(files: string[], config?: string): FsLike {
  const set = new Set(files.map((f) => f.replace(/\\/g, '/')))
  return {
    exists: (p) => (p.endsWith(CONFIG_FILE_NAME) ? config !== undefined : set.has(p.replace(/\\/g, '/'))),
    readText: () => config ?? '',
  }
}

const ROOT = 'C:/dev/editor'
const GOOD_FILES = [
  'C:/pvs/devkitsnes/snes_rules',
  'C:/Git/bin/bash.exe',
  'C:/make/make.exe',
  'C:/dev/jogo/Makefile',
]
const GOOD = JSON.stringify({
  pvsneslibHome: 'C:\\pvs', // barra invertida é normalizada
  gitBashPath: 'C:/Git/bin/bash.exe',
  makeDir: 'C:/make',
  engineDir: 'C:/dev/jogo',
})

test('config válida: normaliza barras, aplica padrões e devolve caminhos absolutos', () => {
  const result = readBuildConfig(ROOT, fakeFs(GOOD_FILES, GOOD))
  assert.ok(result.ok)
  assert.deepEqual(result.config, {
    pvsneslibHome: 'C:/pvs',
    gitBashPath: 'C:/Git/bin/bash.exe',
    makeDir: 'C:/make',
    engineDir: 'C:/dev/jogo',
    timeoutSeconds: 300,
  })
})

test('engineDir relativo é resolvido a partir da raiz do editor; makeDir e timeout são opcionais', () => {
  const cfg = JSON.stringify({ pvsneslibHome: 'C:/pvs', gitBashPath: 'C:/Git/bin/bash.exe', timeoutSeconds: 60 })
  const files = [...GOOD_FILES.filter((f) => !f.includes('make')), 'C:/dev/jogo-plataforma-snes/Makefile']
  const result = readBuildConfig(ROOT, fakeFs(files, cfg))
  assert.ok(result.ok, JSON.stringify(result))
  assert.equal(result.config.engineDir, 'C:/dev/jogo-plataforma-snes') // ../jogo-plataforma-snes de C:/dev/editor
  assert.equal(result.config.makeDir, undefined)
  assert.equal(result.config.timeoutSeconds, 60)
})

test('config com problema: mensagem em português dizendo o que fazer', () => {
  const messageFor = (files: string[], config?: string) => {
    const r = readBuildConfig(ROOT, fakeFs(files, config))
    assert.ok(!r.ok)
    return r.message
  }
  assert.match(messageFor(GOOD_FILES, undefined), /Não achei o arquivo editor\.local\.json.*editor\.local\.example\.json/)
  assert.match(messageFor(GOOD_FILES, '{ quebrado'), /não é um JSON válido/)
  assert.match(messageFor(GOOD_FILES, '[]'), /precisa ser um objeto JSON/)
  assert.match(messageFor(GOOD_FILES, '{}'), /Falta "pvsneslibHome"/)
  assert.match(messageFor(GOOD_FILES, JSON.stringify({ pvsneslibHome: 'C:/pvs' })), /Falta "gitBashPath"/)
  assert.match(messageFor(GOOD_FILES, JSON.stringify({ pvsneslibHome: 42, gitBashPath: 'x' })), /precisa ser um texto/)
  assert.match(messageFor(GOOD_FILES.slice(1), GOOD), /não parece a pasta da PVSnesLib.*devkitsnes\/snes_rules/)
  assert.match(messageFor(GOOD_FILES.filter((f) => !f.includes('bash')), GOOD), /"gitBashPath".*não existe/)
  assert.match(messageFor(GOOD_FILES.filter((f) => !f.includes('make.exe')), GOOD), /"makeDir".*não tem o make\.exe/)
  assert.match(messageFor(GOOD_FILES.filter((f) => !f.includes('Makefile')), GOOD), /não tem um Makefile/)
  const badTimeout = JSON.stringify({ ...JSON.parse(GOOD), timeoutSeconds: 1 })
  assert.match(messageFor(GOOD_FILES, badTimeout), /timeoutSeconds.*entre 5 e 1800/)
})

// ---------- readEngineDir (bem mais tolerante que readBuildConfig — nunca lança) ----------
// docs/PROGRESS.md, "unificar engineDir do export com o do build", 2026-10-14: `/api/export-gfx`
// (vite-export-gfx-plugin.ts) usa esta função pra achar a mesma pasta configurada pro build, em
// vez de um caminho hardcoded próprio que nunca lia editor.local.json.

test('readEngineDir: sem editor.local.json (arquivo ausente) cai no padrão DEFAULT_ENGINE_DIR', () => {
  assert.equal(DEFAULT_ENGINE_DIR, '../jogo-plataforma-snes')
  assert.equal(readEngineDir(ROOT, fakeFs([], undefined)), 'C:/dev/jogo-plataforma-snes')
})

test('readEngineDir: config presente com "engineDir" devolve o caminho resolvido e normalizado', () => {
  const config = JSON.stringify({ engineDir: 'C:\\outro\\lugar' })
  assert.equal(readEngineDir(ROOT, fakeFs([], config)), 'C:/outro/lugar')
})

test('readEngineDir: engineDir relativo é resolvido a partir da raiz do editor, igual readBuildConfig', () => {
  const config = JSON.stringify({ engineDir: '../minha-engine' })
  assert.equal(readEngineDir(ROOT, fakeFs([], config)), 'C:/dev/minha-engine')
})

test('readEngineDir: JSON quebrado, campo ausente, vazio ou de tipo errado tudo cai no padrão (nunca lança)', () => {
  const fallback = readEngineDir(ROOT, fakeFs([], undefined))
  assert.equal(readEngineDir(ROOT, fakeFs([], '{ quebrado')), fallback)
  assert.equal(readEngineDir(ROOT, fakeFs([], '[]')), fallback)
  assert.equal(readEngineDir(ROOT, fakeFs([], '{}')), fallback)
  assert.equal(readEngineDir(ROOT, fakeFs([], JSON.stringify({ engineDir: '' }))), fallback)
  assert.equal(readEngineDir(ROOT, fakeFs([], JSON.stringify({ engineDir: '   ' }))), fallback)
  assert.equal(readEngineDir(ROOT, fakeFs([], JSON.stringify({ engineDir: 42 }))), fallback)
})

test('readEngineDir: convive com as outras chaves do build config (pvsneslibHome etc.), só lê engineDir', () => {
  const config = JSON.stringify({ pvsneslibHome: 'C:/pvs', gitBashPath: 'C:/git/bash.exe', engineDir: 'C:/minha-engine' })
  assert.equal(readEngineDir(ROOT, fakeFs([], config)), 'C:/minha-engine')
})

// ---------- comando e ambiente ----------

const CONFIG: BuildConfig = {
  pvsneslibHome: 'C:/pvs',
  gitBashPath: 'C:/Git/bin/bash.exe',
  makeDir: 'C:/make dir',
  engineDir: "C:/dev/jo'go",
  timeoutSeconds: 300,
}

test('comando do bash: cd na engine entre aspas simples (caminho nunca vira comando) + make', () => {
  assert.equal(shQuote("a b"), "'a b'")
  assert.equal(shQuote("it's"), "'it'\\''s'")
  assert.equal(buildBashScript(CONFIG), "cd 'C:/dev/jo'\\''go' && make 2>&1")
  assert.equal(buildBashScript({ ...CONFIG, engineDir: 'C:/x; rm -rf /' }), "cd 'C:/x; rm -rf /' && make 2>&1")
})

test('ambiente: PVSNESLIB_HOME fixo e make no COMEÇO do PATH (chave Path do Windows respeitada)', () => {
  const win = buildEnv({ Path: 'C:\\Windows', OTHER: '1' }, CONFIG, 'win32')
  assert.equal(win.Path, 'C:\\make dir;C:\\Windows')
  assert.equal(win.PATH, undefined, 'não cria uma segunda chave PATH')
  assert.equal(win.PVSNESLIB_HOME, 'C:/pvs')
  assert.equal(win.OTHER, '1')
  const linux = buildEnv({ PATH: '/usr/bin' }, CONFIG, 'linux')
  assert.equal(linux.PATH, 'C:/make dir:/usr/bin')
  const noMake = buildEnv({ PATH: 'x' }, { ...CONFIG, makeDir: undefined }, 'win32')
  assert.equal(noMake.PATH, 'x')
  const base = { PATH: 'p', PVSNESLIB_HOME: 'errado' }
  buildEnv(base, CONFIG, 'win32')
  assert.equal(base.PVSNESLIB_HOME, 'errado', 'não altera o ambiente original')
})

test('saída do build é cortada nos últimos caracteres com aviso', () => {
  assert.equal(tailText('curto', 100), 'curto')
  const cut = tailText('a'.repeat(50) + 'FIM', 10)
  assert.match(cut, /saída cortada: mostrando os últimos 10/)
  assert.ok(cut.endsWith('aaaaaaaFIM'))
})

// ---------- integração: Git Bash + make de verdade (só roda nesta máquina, com editor.local.json) ----------

const localConfig = readBuildConfig(join(import.meta.dirname, '..'))
const hasRealTools = localConfig.ok
const skipReal = hasRealTools ? false : 'sem editor.local.json válido nesta máquina'

/** Cria uma "engine" de mentira (só um Makefile) pra testar sucesso/falha/timeout sem tocar na engine real. */
function fakeEngine(makefile: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'fake-engine-')).replace(/\\/g, '/')
  writeFileSync(join(dir, 'Makefile'), makefile)
  mkdirSync(join(dir, 'build'))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

// Ambiente mínimo: sem PVSNESLIB_HOME e com PATH quase vazio — prova que a config sozinha basta.
const SCRUBBED_ENV: NodeJS.ProcessEnv = {
  SystemRoot: process.env.SystemRoot,
  PATH: 'C:\\Windows\\System32;C:\\Windows',
}

test('build de verdade: sucesso, saída capturada e PVSNESLIB_HOME vindo só da config', { skip: skipReal }, async () => {
  assert.ok(localConfig.ok)
  const fake = fakeEngine('all:\n\t@echo "PVS=$(PVSNESLIB_HOME)"\n\t@echo compilou-ok\n\t@echo bin > build/x.sfc\n')
  try {
    const result = await runEngineBuild({ ...localConfig.config, engineDir: fake.dir }, SCRUBBED_ENV)
    assert.ok(result.ok, JSON.stringify(result))
    assert.match(result.output, /compilou-ok/)
    assert.ok(result.output.includes(`PVS=${localConfig.config.pvsneslibHome}`), result.output)
    assert.equal(result.rom?.path, 'build/x.sfc')
    assert.equal(result.rom?.updated, true)
    assert.ok(result.durationMs >= 0)
  } finally {
    fake.cleanup()
  }
})

test('build de verdade: make falhando devolve phase "make", código e a saída do erro', { skip: skipReal }, async () => {
  assert.ok(localConfig.ok)
  const fake = fakeEngine('all:\n\t@echo "erro-de-compilacao: boom" 1>&2\n\t@exit 2\n')
  try {
    const result = await runEngineBuild({ ...localConfig.config, engineDir: fake.dir }, SCRUBBED_ENV)
    assert.ok(!result.ok)
    assert.equal(result.phase, 'make')
    assert.equal(result.exitCode, 2)
    assert.match(result.message, /falhou \(código de saída 2\)/)
    assert.match(result.output ?? '', /erro-de-compilacao: boom/, 'stderr também vai pra saída')
  } finally {
    fake.cleanup()
  }
})

test('build de verdade: só um por vez (o segundo recebe "busy") e timeout interrompe', { skip: skipReal }, async () => {
  assert.ok(localConfig.ok)
  const slow = fakeEngine('all:\n\t@echo comecou\n\t@sleep 30\n')
  try {
    const config = { ...localConfig.config, engineDir: slow.dir, timeoutSeconds: 5 }
    const first = runEngineBuild(config, SCRUBBED_ENV)
    await new Promise((r) => setTimeout(r, 300))
    const second = await runEngineBuild(config, SCRUBBED_ENV)
    assert.ok(!second.ok && second.phase === 'busy')
    assert.match(second.message, /Já existe um build em andamento/)
    const result = await first
    assert.ok(!result.ok)
    assert.equal(result.phase, 'timeout')
    assert.match(result.message, /passou de 5 s e foi interrompido/)
    assert.ok((result.durationMs ?? 0) >= 4500 && (result.durationMs ?? 0) < 15000, `durou ${result.durationMs}`)
    // depois do timeout o lock é liberado
    const again = fakeEngine('all:\n\t@echo ok\n')
    try {
      const ok = await runEngineBuild({ ...localConfig.config, engineDir: again.dir }, SCRUBBED_ENV)
      assert.ok(ok.ok, JSON.stringify(ok))
    } finally {
      again.cleanup()
    }
  } finally {
    slow.cleanup()
  }
})

test('build de verdade: Git Bash inexistente vira erro "spawn" com mensagem clara', { skip: skipReal }, async () => {
  assert.ok(localConfig.ok)
  const fake = fakeEngine('all:\n\t@echo ok\n')
  try {
    const result = await runEngineBuild(
      { ...localConfig.config, gitBashPath: 'C:/nao/existe/bash.exe', engineDir: fake.dir },
      SCRUBBED_ENV,
    )
    assert.ok(!result.ok)
    assert.equal(result.phase, 'spawn')
    assert.match(result.message, /Não consegui iniciar o Git Bash \(C:\/nao\/existe\/bash\.exe\)/)
  } finally {
    fake.cleanup()
  }
})

test('sanidade: o arquivo de exemplo é JSON válido com as chaves esperadas e o real está no .gitignore', () => {
  const root = join(import.meta.dirname, '..')
  const example = JSON.parse(readFileSync(join(root, 'editor.local.example.json'), 'utf8')) as Record<string, unknown>
  for (const key of ['pvsneslibHome', 'gitBashPath', 'makeDir', 'engineDir', 'timeoutSeconds']) {
    assert.ok(key in example, key)
  }
  assert.match(readFileSync(join(root, '.gitignore'), 'utf8'), /^editor.local.json$/m)
})
