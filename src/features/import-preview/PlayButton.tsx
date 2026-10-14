import { usePlayGame } from './usePlayGame'

/** Triângulo de "play" — mesmo espírito pixel-art quadriculado dos ícones de `App.tsx`
 * (CharacterNavIcon etc.), não um ícone de fonte/emoji. */
function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
      <path d="M5 2 L17 10 L5 18 Z" fill="currentColor" />
    </svg>
  )
}

const BUSY_LABEL: Record<'building' | 'picking-emulator' | 'launching', string> = {
  building: 'Compilando…',
  'picking-emulator': 'Escolha o emulador…',
  launching: 'Abrindo…',
}

/**
 * Botão "Jogar" na barra de topo (estilo Unity, docs/PROGRESS.md "botão Jogar") — compila a engine
 * e abre o ROM no emulador. 1ª vez: pede pra escolher o executável do emulador (seletor nativo do
 * Windows); das próximas vezes abre direto, sem perguntar de novo (caminho salvo em
 * editor.local.json). "Trocar emulador" fica sempre disponível ao lado, pra reapontar sem precisar
 * editar o arquivo à mão.
 */
export function PlayButton() {
  const { state, play, changeEmulator, dismissError } = usePlayGame()
  const busy = state.status === 'building' || state.status === 'picking-emulator' || state.status === 'launching'

  return (
    <div className="play-button-area">
      <div className="play-button-row">
        <button type="button" className="play-button" onClick={play} disabled={busy} title="Compilar e abrir no emulador">
          <PlayIcon />
          {busy ? BUSY_LABEL[state.status] : state.status === 'done' ? 'Aberto!' : 'Jogar'}
        </button>
        <button
          type="button"
          className="play-emulator-link"
          onClick={changeEmulator}
          disabled={busy}
          title="Escolher outro executável de emulador"
        >
          Trocar emulador
        </button>
      </div>
      {state.status === 'error' && (
        <div className="play-status play-status-error" role="alert">
          <p className="error">{state.message}</p>
          {state.output && (
            <details open>
              <summary>Ver saída do build</summary>
              <pre className="build-output">{state.output}</pre>
            </details>
          )}
          <button type="button" onClick={dismissError}>
            Fechar
          </button>
        </div>
      )}
    </div>
  )
}
