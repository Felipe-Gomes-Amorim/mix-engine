import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildOpenFileDialogScript, mergeEmulatorPathIntoConfig, readEmulatorPath, writeEmulatorPath } from '../vite-emulator.ts'
import type { FsLike } from '../vite-engine-build.ts'

// Botão "Jogar" (estilo Unity, docs/PROGRESS.md "botão Jogar") — testa só a lógica pura/disco
// (leitura/mesclagem de editor.local.json, montagem do script do PowerShell). Abrir o seletor
// nativo de verdade (`pickEmulatorPathNative`) e abrir um emulador de verdade (`launchEmulator`)
// não são testáveis sem um humano clicando numa janela/sem um emulador de verdade instalado — mesmo
// critério já usado pelas "ações pendentes do usuário" deste projeto, não automatizado aqui.

// ---------- readEmulatorPath (disco falso) ----------

function fakeFs(config?: string): FsLike {
  return {
    exists: (p) => p.endsWith('editor.local.json') && config !== undefined,
    readText: () => config ?? '',
  }
}

test('readEmulatorPath: arquivo ausente, JSON quebrado, campo ausente/vazio ou não-texto tudo vira null (nunca lança)', () => {
  assert.equal(readEmulatorPath('C:/root', fakeFs(undefined)), null)
  assert.equal(readEmulatorPath('C:/root', fakeFs('{ quebrado')), null)
  assert.equal(readEmulatorPath('C:/root', fakeFs('[]')), null)
  assert.equal(readEmulatorPath('C:/root', fakeFs('{}')), null)
  assert.equal(readEmulatorPath('C:/root', fakeFs(JSON.stringify({ emulatorPath: '' }))), null)
  assert.equal(readEmulatorPath('C:/root', fakeFs(JSON.stringify({ emulatorPath: '   ' }))), null)
  assert.equal(readEmulatorPath('C:/root', fakeFs(JSON.stringify({ emulatorPath: 42 }))), null)
})

test('readEmulatorPath: campo presente e não-vazio devolve o caminho', () => {
  const path = 'C:/Emuladores/snes9x/snes9x-x64.exe'
  assert.equal(readEmulatorPath('C:/root', fakeFs(JSON.stringify({ emulatorPath: path }))), path)
})

test('readEmulatorPath: convive com as outras chaves do build config, sem precisar delas', () => {
  const config = JSON.stringify({ pvsneslibHome: 'C:/pvs', gitBashPath: 'C:/git/bash.exe', emulatorPath: 'C:/e.exe' })
  assert.equal(readEmulatorPath('C:/root', fakeFs(config)), 'C:/e.exe')
})

// ---------- mergeEmulatorPathIntoConfig (puro, sem disco) ----------

test('mergeEmulatorPathIntoConfig: arquivo inexistente (null) vira um objeto novo só com o campo do emulador', () => {
  const result = JSON.parse(mergeEmulatorPathIntoConfig(null, 'C:/e.exe'))
  assert.deepEqual(result, { emulatorPath: 'C:/e.exe' })
})

test('mergeEmulatorPathIntoConfig: preserva TODAS as outras chaves já presentes (build config nunca é apagado)', () => {
  const existing = JSON.stringify({
    pvsneslibHome: 'C:/pvs',
    gitBashPath: 'C:/git/bash.exe',
    makeDir: 'C:/make',
    engineDir: '../jogo-plataforma-snes',
    timeoutSeconds: 300,
  })
  const result = JSON.parse(mergeEmulatorPathIntoConfig(existing, 'C:/e.exe'))
  assert.deepEqual(result, {
    pvsneslibHome: 'C:/pvs',
    gitBashPath: 'C:/git/bash.exe',
    makeDir: 'C:/make',
    engineDir: '../jogo-plataforma-snes',
    timeoutSeconds: 300,
    emulatorPath: 'C:/e.exe',
  })
})

test('mergeEmulatorPathIntoConfig: troca um emulatorPath antigo pelo novo, sem duplicar nem deixar os dois', () => {
  const existing = JSON.stringify({ pvsneslibHome: 'C:/pvs', emulatorPath: 'C:/velho.exe' })
  const result = JSON.parse(mergeEmulatorPathIntoConfig(existing, 'C:/novo.exe'))
  assert.deepEqual(result, { pvsneslibHome: 'C:/pvs', emulatorPath: 'C:/novo.exe' })
})

test('mergeEmulatorPathIntoConfig: JSON existente quebrado não trava — começa um objeto novo em vez de propagar lixo', () => {
  const result = JSON.parse(mergeEmulatorPathIntoConfig('{ isso não é json', 'C:/e.exe'))
  assert.deepEqual(result, { emulatorPath: 'C:/e.exe' })
})

test('mergeEmulatorPathIntoConfig: devolve JSON válido, formatado (reabrir/editar à mão continua legível)', () => {
  const text = mergeEmulatorPathIntoConfig(null, 'C:/e.exe')
  assert.ok(text.includes('\n'), 'não é tudo numa linha só')
  assert.ok(text.endsWith('\n'), 'termina com quebra de linha')
  assert.doesNotThrow(() => JSON.parse(text))
})

// ---------- writeEmulatorPath (disco de verdade, pasta temporária isolada) ----------

test('writeEmulatorPath: caminho do emulador inexistente é rejeitado (mensagem clara, nada é gravado)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'emu-test-'))
  try {
    const result = writeEmulatorPath(dir, join(dir, 'nao-existe.exe'))
    assert.ok(!result.ok)
    assert.match(result.message, /não existe/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('writeEmulatorPath: grava editor.local.json novo quando não existia, mesclando com o que já existia', () => {
  const dir = mkdtempSync(join(tmpdir(), 'emu-test-'))
  try {
    const fakeExe = join(dir, 'emulador.exe')
    writeFileSync(fakeExe, '')
    writeFileSync(join(dir, 'editor.local.json'), JSON.stringify({ pvsneslibHome: 'C:/pvs' }))

    const result = writeEmulatorPath(dir, fakeExe)
    assert.ok(result.ok, JSON.stringify(result))

    assert.equal(readEmulatorPath(dir), fakeExe)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ---------- buildOpenFileDialogScript (puro, só monta a string do PowerShell) ----------

test('buildOpenFileDialogScript: escapa aspas simples (nunca fecha a string do PowerShell cedo demais)', () => {
  const script = buildOpenFileDialogScript("Escolha o emulador's", 'Executáveis (*.exe)|*.exe')
  assert.match(script, /Escolha o emulador''s/)
  assert.ok(!script.includes("emulador's"), 'aspas simples sempre viram duas (escape do PowerShell)')
})

test('buildOpenFileDialogScript: inclui o título/filtro pedidos e só imprime o caminho em caso de OK', () => {
  const script = buildOpenFileDialogScript('Meu título', 'Filtro|*.exe')
  assert.match(script, /\$dialog\.Title = 'Meu título'/)
  assert.match(script, /\$dialog\.Filter = 'Filtro\|\*\.exe'/)
  assert.match(script, /DialogResult\]::OK.*Write-Output \$dialog\.FileName/)
})
