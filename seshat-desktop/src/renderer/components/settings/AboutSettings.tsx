import { useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import { AboutLine, Panel, Row, SectionDivider } from './SettingsPrimitives'

type SystemStatus = {
  status?: string
  mode?: string
  version?: string
  storage?: string
}

export function AboutSettings() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [reachable, setReachable] = useState<boolean | null>(null)
  const [version, setVersion] = useState('0.1.0')

  useEffect(() => {
    let cancelled = false
    void window.nexus?.getVersion().then((value) => { if (!cancelled) setVersion(value) }).catch(() => undefined)
    api.get<SystemStatus>('/system/status')
      .then((result) => {
        if (cancelled) return
        setStatus(result)
        setReachable(true)
      })
      .catch(() => {
        if (!cancelled) setReachable(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Panel title="About">
      <div className="max-w-[820px] space-y-5">
        <section className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
          <div className="flex items-start justify-between gap-5">
            <div>
              <h2 className="text-[18px] font-semibold text-[var(--text-primary)]">SeshatOS Desktop</h2>
              <p className="mt-1 max-w-[560px] text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
                A local desktop workspace for agents, tools, memories, connectors, and knowledge.
              </p>
            </div>
            <span className="rounded-md bg-[var(--surface-muted)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-secondary)]">
              v{version}
            </span>
          </div>
        </section>

        <section className="grid gap-3">
          <AboutLine title="Desktop shell" value="Electron + React + Tailwind CSS" />
          <AboutLine title="Backend runtime" value={reachable === null ? 'Checking...' : reachable ? 'Connected' : 'Not detected'} tone={reachable === false ? 'muted' : 'success'} />
          <AboutLine title="Runtime mode" value={status?.mode || 'Local workspace'} />
          <AboutLine title="Backend version" value={status?.version || 'Reported by backend when available'} muted={!status?.version} />
          <AboutLine title="Session storage" value={status?.storage || 'Secure local storage when available'} />
          <AboutLine title="Visual identity" value="SeshatOS palette, responsive dark/light themes, logo option 4" />
        </section>

        <SectionDivider />

        <section className="grid gap-3">
          <Row title="Desktop scope" description="The frontend is being rebuilt cleanly in seshat-desktop while reusing the existing local backend APIs." />
          <Row title="Configuration" description="Providers, web search, knowledge, agents, MCP, and connectors live in Config instead of General settings." />
        </section>
      </div>
    </Panel>
  )
}
