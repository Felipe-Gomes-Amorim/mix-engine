import { useState } from 'react'
import { buildEngine, type BuildResult } from '../../lib/saveToEngine'

export type BuildState = { status: 'idle' } | { status: 'running' } | { status: 'done'; result: BuildResult }

/**
 * Estado do "compilar o jogo depois de salvar" (docs/DATA_FORMAT.md seção 6):
 * `run()` roda o make uma vez e guarda o resultado; `reset()` limpa (ex.: ao
 * começar um novo salvamento).
 */
export function useEngineBuild() {
  const [state, setState] = useState<BuildState>({ status: 'idle' })

  async function run(): Promise<BuildResult> {
    setState({ status: 'running' })
    const result = await buildEngine()
    setState({ status: 'done', result })
    return result
  }

  function reset() {
    setState({ status: 'idle' })
  }

  return { state, run, reset }
}
