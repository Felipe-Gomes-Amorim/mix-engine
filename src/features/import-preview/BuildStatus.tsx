import type { BuildResult } from '../../lib/saveToEngine'
import type { BuildState } from './useEngineBuild'

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`
}

/** Resultado do build do jogo depois de salvar (compilando / passou / falhou + saída). */
export function BuildStatus({ state }: { state: BuildState }) {
  if (state.status === 'idle') return null
  if (state.status === 'running') {
    return (
      <p className="hint" role="status">
        Compilando o jogo…
      </p>
    )
  }
  return <BuildResultView result={state.result} />
}

function BuildResultView({ result }: { result: BuildResult }) {
  if (result.ok) {
    const rom = result.rom
    return (
      <div className="build-status" role="status">
        <p className="success">
          Jogo compilado com sucesso ({seconds(result.durationMs)}
          {rom ? ` — ${rom.path}, ${Math.round(rom.bytes / 1024)} KB${rom.updated ? '' : ', sem mudanças'}` : ''}).
        </p>
        <details>
          <summary>Ver saída do build</summary>
          <pre className="build-output">{result.output}</pre>
        </details>
      </div>
    )
  }

  const title =
    result.phase === 'config'
      ? 'O jogo não foi compilado: falta configurar o build neste computador.'
      : result.phase === 'busy'
        ? 'O jogo não foi compilado agora.'
        : 'O jogo NÃO compilou.'
  return (
    <div className="build-status" role="alert">
      <p className="error">
        {title} {result.message}
      </p>
      {result.output && (
        <details open>
          <summary>Saída do build{result.durationMs ? ` (${seconds(result.durationMs)})` : ''}</summary>
          <pre className="build-output">{result.output}</pre>
        </details>
      )}
    </div>
  )
}
