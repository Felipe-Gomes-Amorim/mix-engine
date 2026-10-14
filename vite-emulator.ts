import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CONFIG_FILE_NAME, type FsLike } from './vite-engine-build.ts'

// Botão "Jogar" na barra de topo (estilo Unity): compila (reaproveita /api/build-engine) e abre o
// ROM resultante direto no emulador do usuário. O caminho do emulador mora no MESMO
// editor.local.json do build (ver vite-engine-build.ts) — um campo novo e opcional,
// `emulatorPath`, que `readBuildConfig` já ignora sem reclamar (ela só lê as chaves que conhece),
// então não quebra nada do build existente. Lado Node do dev server; nada aqui roda em `vite build`.

const nodeFs: FsLike = {
  exists: (path) => existsSync(path),
  readText: (path) => readFileSync(path, 'utf8'),
}

/**
 * Lê só `emulatorPath` de editor.local.json — bem mais tolerante que `readBuildConfig` (que exige
 * `pvsneslibHome`/`gitBashPath`): arquivo ausente, JSON quebrado ou campo ausente/vazio tudo vira
 * `null` (ainda não configurado), nunca lança. Quem decide o que fazer com `null` é quem chama
 * (pedir pro usuário escolher o caminho).
 */
export function readEmulatorPath(rootDir: string, fs: FsLike = nodeFs): string | null {
  const file = join(rootDir, CONFIG_FILE_NAME)
  if (!fs.exists(file)) return null
  try {
    const raw = JSON.parse(fs.readText(file)) as unknown
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
    const value = (raw as Record<string, unknown>).emulatorPath
    return typeof value === 'string' && value.trim() !== '' ? value : null
  } catch {
    return null
  }
}

/**
 * Devolve o JSON de editor.local.json com `emulatorPath` definido, preservando qualquer outra
 * chave já presente (build config: pvsneslibHome/gitBashPath/makeDir/engineDir/timeoutSeconds) —
 * nunca sobrescreve o arquivo inteiro. `existingText` ausente/inválido vira `{}` (arquivo novo,
 * só com o campo do emulador — o build ainda vai pedir pro usuário completar o resto, mensagem já
 * existente em `readBuildConfig`). Função pura (sem tocar em disco) pra testar fácil o merge.
 */
export function mergeEmulatorPathIntoConfig(existingText: string | null, emulatorPath: string): string {
  let obj: Record<string, unknown> = {}
  if (existingText) {
    try {
      const parsed = JSON.parse(existingText) as unknown
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        obj = parsed as Record<string, unknown>
      }
    } catch {
      // JSON quebrado: não dá pra preservar nada de confiança — começa um objeto novo, só com o
      // campo do emulador (melhor que propagar lixo ou travar o usuário sem conseguir salvar).
    }
  }
  obj.emulatorPath = emulatorPath
  return JSON.stringify(obj, null, 2) + '\n'
}

export type SaveEmulatorPathResult = { ok: true } | { ok: false; message: string }

/** Valida (arquivo precisa existir) e grava `emulatorPath` em editor.local.json, mesclando com o
 * que já existe (ver `mergeEmulatorPathIntoConfig`). */
export function writeEmulatorPath(rootDir: string, emulatorPath: string): SaveEmulatorPathResult {
  if (!existsSync(emulatorPath)) {
    return { ok: false, message: `"${emulatorPath}" não existe — confira o caminho do emulador.` }
  }
  const file = join(rootDir, CONFIG_FILE_NAME)
  const existingText = existsSync(file) ? readFileSync(file, 'utf8') : null
  try {
    writeFileSync(file, mergeEmulatorPathIntoConfig(existingText, emulatorPath))
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Script do PowerShell que abre o seletor de arquivo NATIVO do Windows (`OpenFileDialog` do
 * WinForms) e imprime o caminho escolhido no stdout — vazio se o usuário cancelar. Função pura
 * (só monta a string) pra testar sem abrir diálogo nenhum de verdade; `pickEmulatorPathNative`
 * abaixo é quem roda isso de verdade. `$topmost` existe só pra dar um "dono" com `TopMost=$true`
 * ao diálogo — sem isso ele às vezes abre atrás da janela do navegador (achado comum desse truque
 * de WinForms a partir de um processo sem janela própria).
 */
export function buildOpenFileDialogScript(title: string, filter: string): string {
  const esc = (s: string) => s.replace(/'/g, "''")
  return [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$dialog = New-Object System.Windows.Forms.OpenFileDialog',
    `$dialog.Title = '${esc(title)}'`,
    `$dialog.Filter = '${esc(filter)}'`,
    '$dialog.CheckFileExists = $true',
    '$topmost = New-Object System.Windows.Forms.Form -Property @{TopMost=$true; StartPosition="CenterScreen"; Width=0; Height=0; ShowInTaskbar=$false}',
    '$topmost.Show() | Out-Null',
    '$result = $dialog.ShowDialog($topmost)',
    '$topmost.Close()',
    'if ($result -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.FileName }',
  ].join('\n')
}

const PICK_TIMEOUT_MS = 120_000

export type PickResult = { ok: true; path: string | null } | { ok: false; message: string }

/**
 * Abre o seletor de arquivo nativo do Windows pedindo o executável do emulador — `path: null`
 * quando o usuário cancela (não é erro). Só funciona no Windows (mesma suposição de todo o resto
 * do projeto — Git Bash/make.exe do winget já são caminhos Windows). Tempo limite generoso (2 min)
 * pra não travar a requisição HTTP pra sempre se o diálogo ficar esquecido/escondido atrás de
 * outra janela.
 */
export function pickEmulatorPathNative(): Promise<PickResult> {
  if (process.platform !== 'win32') {
    return Promise.resolve({ ok: false, message: 'Escolher o emulador por um seletor nativo só funciona no Windows.' })
  }
  const script = buildOpenFileDialogScript(
    'Escolha o executável do emulador SNES',
    'Executáveis (*.exe)|*.exe|Todos os arquivos (*.*)|*.*',
  )
  return new Promise((resolvePromise) => {
    let settled = false
    const finish = (result: PickResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise(result)
    }
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', script], {
      windowsHide: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const timer = setTimeout(() => {
      child.kill()
      finish({ ok: false, message: 'O seletor de arquivo do emulador demorou demais (2 min) — tente de novo.' })
    }, PICK_TIMEOUT_MS)
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')))
    child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')))
    child.on('error', (err) => finish({ ok: false, message: `Não consegui abrir o seletor de arquivo: ${err.message}` }))
    child.on('close', (code) => {
      if (code !== 0 && stdout.trim() === '') {
        finish({ ok: false, message: `O seletor de arquivo falhou (código ${code}). ${stderr.trim()}`.trim() })
        return
      }
      const path = stdout.trim()
      finish({ ok: true, path: path === '' ? null : path })
    })
  })
}

export type LaunchResult = { ok: true } | { ok: false; message: string }

/**
 * Abre o emulador já escolhido com o ROM como argumento — processo independente (`detached` +
 * `unref`), o dev server NUNCA espera o emulador fechar (ele é uma janela GUI de longa duração,
 * bem diferente do `make`, que roda e termina sozinho).
 */
export function launchEmulator(emulatorPath: string, romAbsolutePath: string): Promise<LaunchResult> {
  if (!existsSync(emulatorPath)) {
    return Promise.resolve({
      ok: false,
      message: `O emulador configurado ("${emulatorPath}") não existe mais — escolha o caminho de novo.`,
    })
  }
  if (!existsSync(romAbsolutePath)) {
    return Promise.resolve({ ok: false, message: `O ROM ("${romAbsolutePath}") não existe — rode o build primeiro.` })
  }
  return new Promise((resolvePromise) => {
    try {
      const child = spawn(emulatorPath, [romAbsolutePath], { detached: true, stdio: 'ignore', windowsHide: false })
      child.on('error', (err) => resolvePromise({ ok: false, message: `Não consegui abrir o emulador: ${err.message}` }))
      // `spawn` com `detached: true` ainda dispara 'error' de forma assíncrona se o executável não
      // existir/não rodar — espera um instante antes de considerar sucesso, senão a resposta HTTP
      // sempre voltaria "ok" mesmo quando o processo nunca chegou a existir de verdade.
      setTimeout(() => {
        child.unref()
        resolvePromise({ ok: true })
      }, 150)
    } catch (err) {
      resolvePromise({ ok: false, message: err instanceof Error ? err.message : String(err) })
    }
  })
}
