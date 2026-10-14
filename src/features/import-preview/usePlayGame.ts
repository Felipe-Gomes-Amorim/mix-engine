import { useEffect, useState } from 'react'
import {
  getEmulatorPath,
  launchEmulator,
  pickEmulatorPath,
  saveEmulatorPath,
  type PickEmulatorPathResult,
  type SaveEmulatorPathResult,
} from '../../lib/playGame'
import { buildEngine } from '../../lib/saveToEngine'

export type PlayState =
  | { status: 'idle' }
  | { status: 'building' }
  | { status: 'picking-emulator' }
  | { status: 'launching' }
  | { status: 'done' }
  | { status: 'error'; message: string; output?: string }

/** `null` = usuário cancelou o seletor (não é erro) ou a escolha falhou e já virou `state: 'error'`
 * sozinha — quem chama só precisa saber se pode continuar. */
async function pickAndSaveEmulatorPath(setState: (s: PlayState) => void): Promise<string | null> {
  setState({ status: 'picking-emulator' })
  const picked: PickEmulatorPathResult = await pickEmulatorPath()
  if (!picked.ok) {
    setState({ status: 'error', message: picked.message })
    return null
  }
  if (picked.path === null) {
    setState({ status: 'idle' })
    return null
  }
  const saved: SaveEmulatorPathResult = await saveEmulatorPath(picked.path)
  if (!saved.ok) {
    setState({ status: 'error', message: saved.message })
    return null
  }
  return picked.path
}

/**
 * Botão "Jogar" (estilo Unity, docs/PROGRESS.md "botão Jogar") — compila a engine (reaproveita o
 * mesmo `buildEngine()` do fluxo de salvar fase/personagem) e abre o ROM resultante no emulador.
 * 1ª vez (sem `emulatorPath` salvo em editor.local.json): abre o seletor de arquivo nativo do
 * Windows, salva a escolha, e só então abre o emulador — das próximas vezes pula direto pro
 * lançamento, sem perguntar de novo.
 */
export function usePlayGame() {
  const [state, setState] = useState<PlayState>({ status: 'idle' })

  // Sucesso é transitório — some sozinho depois de um tempo, não precisa de um "ok, entendi" do
  // usuário pra limpar o botão.
  useEffect(() => {
    if (state.status !== 'done') return
    const id = setTimeout(() => setState({ status: 'idle' }), 2500)
    return () => clearTimeout(id)
  }, [state.status])

  async function play() {
    setState({ status: 'building' })
    const buildResult = await buildEngine()
    if (!buildResult.ok) {
      setState({ status: 'error', message: buildResult.message, output: buildResult.output })
      return
    }
    if (!buildResult.rom) {
      setState({
        status: 'error',
        message: 'O build passou, mas não encontrei nenhum ROM (.sfc) gerado em build/ da engine.',
      })
      return
    }
    const romPath = buildResult.rom.path

    let emulatorPath = await getEmulatorPath()
    if (!emulatorPath) {
      emulatorPath = await pickAndSaveEmulatorPath(setState)
      if (!emulatorPath) return // cancelado ou já virou erro — pickAndSaveEmulatorPath cuidou do estado
    }

    setState({ status: 'launching' })
    const launch = await launchEmulator(romPath)
    if (!launch.ok) {
      setState({ status: 'error', message: launch.message })
      return
    }
    setState({ status: 'done' })
  }

  /** Link "Trocar emulador" — reabre o seletor a qualquer momento, mesmo com um caminho já salvo
   * (ex.: o usuário reinstalou o emulador noutra pasta). Não compila nem abre nada sozinho. */
  async function changeEmulator() {
    const path = await pickAndSaveEmulatorPath(setState)
    // `pickAndSaveEmulatorPath` já deixa o estado em 'error'/'idle' sozinho pro cancelamento e pra
    // falha — só precisa agir aqui no caminho de SUCESSO (senão o botão ficava preso mostrando
    // "Escolhendo o emulador…" pra sempre depois de escolher certo).
    if (path) setState({ status: 'idle' })
  }

  function dismissError() {
    setState({ status: 'idle' })
  }

  return { state, play, changeEmulator, dismissError }
}
