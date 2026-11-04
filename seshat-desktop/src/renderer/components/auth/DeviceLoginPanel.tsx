import { useEffect, useRef, useState } from 'react'
import { Alert, LinkButton, PrimaryButton, SecondaryButton } from '@renderer/components/auth/FormPrimitives'
import { useAuth } from '@renderer/hooks/useAuth'
import { waitForDeviceApproval } from '@renderer/lib/deviceLogin'

type Phase =
  | { kind: 'starting' }
  | { kind: 'waiting'; userCode: string; link: string }
  | { kind: 'ended'; message: string }

// Signs in by code. The desktop asks the organization's server for a short code, shows it, and waits while the
// person approves it in their browser, where they are already signed in (with their second factor, if they
// have one). No password is typed here. On success useAuth stores the session and the app moves on by itself.
export function DeviceLoginPanel({ onClose }: { onClose: () => void }) {
  const { deviceStart, devicePoll, deviceCancel } = useAuth()
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' })
  const [attempt, setAttempt] = useState(0)
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    setPhase({ kind: 'starting' })
    void (async () => {
      try {
        const started = await deviceStart()
        if (cancelled.current) return
        setPhase({ kind: 'waiting', userCode: started.user_code, link: started.verification_uri_complete })
        // Open the page at once: the code is already in the link, so the person only has to compare and approve.
        void window.seshat?.openExternal(started.verification_uri_complete).catch(() => undefined)

        const outcome = await waitForDeviceApproval({
          poll: devicePoll,
          intervalSeconds: started.interval,
          expiresInSeconds: started.expires_in,
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
          now: () => Date.now(),
          isCancelled: () => cancelled.current
        })
        if (cancelled.current || outcome === 'cancelled' || outcome === 'approved') return
        setPhase({
          kind: 'ended',
          message:
            outcome === 'denied'
              ? 'The request was refused in the browser.'
              : 'The code expired before it was approved.'
        })
      } catch (error) {
        if (cancelled.current) return
        setPhase({ kind: 'ended', message: (error as Error).message || 'Could not sign in. Please try again.' })
      }
    })()
    return () => {
      cancelled.current = true
      void deviceCancel()
    }
    // deviceStart, devicePoll and deviceCancel are stable bridges; only a retry restarts the sign-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  if (phase.kind === 'starting') {
    return (
      <Panel>
        <p className="m-0 text-[14px] text-[var(--text-secondary)]">Contacting your organization...</p>
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
      </Panel>
    )
  }

  if (phase.kind === 'ended') {
    return (
      <Panel>
        <Alert>{phase.message}</Alert>
        <PrimaryButton type="button" onClick={() => setAttempt((value) => value + 1)}>
          Try again
        </PrimaryButton>
        <SecondaryButton onClick={onClose}>Back</SecondaryButton>
      </Panel>
    )
  }

  return (
    <Panel>
      <p className="m-0 text-[14px] text-[var(--text-secondary)]">
        Your browser opened a page of your organization. Check that this code is the one shown there, then approve.
      </p>
      <div
        aria-label="Sign-in code"
        className="rounded-2xl border border-[var(--border-strong)] py-4 text-center font-mono text-[30px] font-semibold tracking-[0.18em]"
      >
        {phase.userCode}
      </div>
      <p className="m-0 flex items-center justify-center gap-2 text-[13px] text-[var(--text-muted)]">
        <span className="size-3.5 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent-primary)]" />
        Waiting for your approval
      </p>
      <SecondaryButton onClick={() => void window.seshat?.openExternal(phase.link)}>Open the page again</SecondaryButton>
      <div className="text-center">
        <LinkButton onClick={onClose}>Cancel</LinkButton>
      </div>
    </Panel>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3">{children}</div>
}
