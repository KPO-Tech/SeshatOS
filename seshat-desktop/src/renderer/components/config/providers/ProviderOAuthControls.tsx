import { useEffect, useState } from 'react'
import { SoftButton, StatusPill } from '../knowledge/KnowledgePrimitives'
import { disconnectProviderOAuth, pollProviderOAuth, startProviderOAuth } from './providerApi'
import type { ProviderOAuthChallenge, ProviderSetting } from './providerTypes'

export function ProviderOAuthControls({
  setting,
  busy,
  onChanged,
  onError
}: {
  setting: ProviderSetting
  busy: boolean
  onChanged: (setting?: ProviderSetting) => void
  onError: (message: string) => void
}) {
  const [challenge, setChallenge] = useState<ProviderOAuthChallenge | null>(null)
  const [working, setWorking] = useState<'start' | 'poll' | 'disconnect' | null>(null)

  useEffect(() => {
    if (setting.connection_status === 'connected') setChallenge(null)
  }, [setting.connection_status])

  async function openExternal(url: string) {
    if (window.nexus?.openExternal) {
      await window.nexus.openExternal(url)
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function start() {
    setWorking('start')
    try {
      const started = await startProviderOAuth(setting.id)
      setChallenge(started)
      if (started.verification_url) await openExternal(started.verification_url)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to start OAuth connection.')
    } finally {
      setWorking(null)
    }
  }

  async function poll() {
    setWorking('poll')
    try {
      const updated = await pollProviderOAuth(setting.id)
      onChanged(updated)
      if (updated.connection_status === 'connected') setChallenge(null)
      if (updated.last_error) onError(updated.last_error)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to refresh OAuth connection.')
    } finally {
      setWorking(null)
    }
  }

  async function disconnect() {
    setWorking('disconnect')
    try {
      const updated = await disconnectProviderOAuth(setting.id)
      setChallenge(null)
      onChanged(updated)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to disconnect OAuth provider.')
    } finally {
      setWorking(null)
    }
  }

  const connected = setting.connection_status === 'connected'

  return (
    <div className="mt-3 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">ChatGPT account</span>
            <StatusPill tone={connected ? 'ok' : 'muted'}>{connected ? 'Connected' : setting.connection_status || 'Not connected'}</StatusPill>
          </div>
          <p className="mt-1 text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
            {setting.oauth_account_email
              ? `Connected as ${setting.oauth_account_email}.`
              : 'Sign in through the browser with the OpenAI account that has Codex access.'}
          </p>
          {challenge?.user_code && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-secondary)]">
              <span>Code</span>
              <code className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-panel)] px-2 py-1 text-[13px] font-semibold text-[var(--text-primary)]">{challenge.user_code}</code>
              <button type="button" onClick={() => void openExternal(challenge.verification_url)} className="font-semibold text-[var(--accent-primary)] hover:underline">
                Open browser
              </button>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {connected ? (
            <SoftButton tone="danger" onClick={() => void disconnect()} disabled={busy || working === 'disconnect'}>
              {working === 'disconnect' ? 'Disconnecting...' : 'Disconnect'}
            </SoftButton>
          ) : (
            <>
              <SoftButton tone="primary" onClick={() => void start()} disabled={busy || working === 'start'}>
                {working === 'start' ? 'Opening...' : 'Connect'}
              </SoftButton>
              <SoftButton onClick={() => void poll()} disabled={busy || working === 'poll'}>
                {working === 'poll' ? 'Checking...' : 'I finished'}
              </SoftButton>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
