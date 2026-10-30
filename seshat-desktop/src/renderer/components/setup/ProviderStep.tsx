import { ProviderIcon } from '@renderer/components/ui/ProviderIcon'
import type { useProviderStep } from './useProviderStep'

type Provider = ReturnType<typeof useProviderStep>

const FIELD =
  'h-11 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-4 text-[14px] text-[var(--text-primary)] outline-none transition-colors duration-150 placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)]'

// The first thing the app needs to answer: a model to talk to. A cloud key, or a local server such as Ollama.
export function ProviderStep({ provider }: { provider: Provider }) {
  const { choices, selected, selectedId, select, apiKey, setApiKey, baseUrl, setBaseUrl, needsKey, canConnect, status, connectedName, error, unverified, connect } = provider

  const busy = status === 'checking' || status === 'saving'

  if (status === 'connected') {
    return (
      <div className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] px-5 py-4">
        <span className="flex size-6 items-center justify-center rounded-full bg-[var(--accent-success)]" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3.5 8.5 3 3 6-7" />
          </svg>
        </span>
        <span className="text-[15px] font-semibold text-[var(--text-primary)]">{connectedName ?? 'A provider'} is connected</span>
      </div>
    )
  }

  return (
    <div className="grid w-full gap-5">
      <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 sm:grid-cols-3">
        {choices.map((choice) => {
          const on = choice.id === selectedId
          return (
            <li key={choice.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => select(choice.id)}
                className={[
                  'flex w-full cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors duration-150',
                  on
                    ? 'border-[color-mix(in_srgb,var(--accent-primary)_55%,transparent)] bg-[color-mix(in_srgb,var(--accent-primary)_7%,var(--surface-panel))]'
                    : 'border-[var(--border-soft)] bg-[var(--surface-panel)] hover:border-[var(--border-strong)]'
                ].join(' ')}
              >
                <ProviderIcon provider={choice.id} size={28} />
                <span className="min-w-0 truncate text-[14px] font-semibold text-[var(--text-primary)]">{choice.name}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {selected && (
        <div className="grid gap-3">
          {needsKey && (
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && void connect()}
              type="password"
              autoComplete="off"
              placeholder={`${selected.name} API key`}
              aria-label={`${selected.name} API key`}
              className={FIELD}
            />
          )}
          {selected.id === 'ollama' && <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="http://localhost:11434" aria-label="Ollama address" className={FIELD} />}
          <p className="m-0 text-[12.5px] leading-[1.5] text-[var(--text-muted)]">
            {needsKey ? 'The key is stored encrypted on this computer and only sent to the provider.' : selected.description || 'Runs on this computer, no key needed.'}
          </p>
          {error && <p className="m-0 text-[13px] font-semibold text-[var(--accent-danger)]">{error}</p>}
          {unverified && <p className="m-0 text-[13px] leading-[1.5] text-[var(--text-secondary)]">{unverified} You can save it anyway and check it with your first message.</p>}
          <div className="flex gap-3">
            <button
              type="button"
              disabled={!canConnect || busy}
              onClick={() => void connect()}
              className="h-11 cursor-pointer rounded-full border-0 bg-[var(--accent-primary)] px-7 text-[14px] font-semibold text-white transition-[filter] duration-150 hover:brightness-110 disabled:cursor-default disabled:opacity-45"
            >
              {status === 'checking' ? 'Checking' : status === 'saving' ? 'Connecting' : 'Connect'}
            </button>
            {unverified && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void connect(true)}
                className="h-11 cursor-pointer rounded-full border border-[var(--border-soft)] bg-transparent px-6 text-[14px] text-[var(--text-secondary)] transition-colors duration-150 hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:cursor-default disabled:opacity-45"
              >
                Save anyway
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
