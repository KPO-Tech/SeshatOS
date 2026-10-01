import { useState } from 'react'
import { SESHAT_BASE } from '@renderer/api/client'
import type { WebhookMethod, WebhookResponseMode } from '@renderer/components/config/automation/automationTypes'
import { FieldLabel, selectClass } from './scheduleFormParts'

const METHODS: WebhookMethod[] = ['POST', 'GET', 'PUT', 'PATCH', 'DELETE']

export function webhookUrl(token: string): string {
  return `${SESHAT_BASE}/webhooks/${token}`
}

type Props = {
  method: WebhookMethod
  onMethodChange: (method: WebhookMethod) => void
  responseMode: WebhookResponseMode
  onResponseModeChange: (mode: WebhookResponseMode) => void
  // Only known once the task has been saved: the server mints it.
  token?: string
}

export function WebhookFields({ method, onMethodChange, responseMode, onResponseModeChange, token }: Props) {
  return (
    <div className="mt-2 grid gap-3 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] p-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel>HTTP method</FieldLabel>
          <select value={method} onChange={(event) => onMethodChange(event.target.value as WebhookMethod)} className={selectClass}>
            {METHODS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel>Response</FieldLabel>
          <select value={responseMode} onChange={(event) => onResponseModeChange(event.target.value as WebhookResponseMode)} className={selectClass}>
            <option value="immediate">Reply immediately</option>
            <option value="whenFinished">Reply when the run finishes</option>
          </select>
        </div>
      </div>
      <div>
        <FieldLabel>Webhook URL</FieldLabel>
        {token ? <CopyableUrl url={webhookUrl(token)} /> : <p className="text-[12px] text-[var(--text-muted)]">Save this task to get its webhook URL.</p>}
      </div>
    </div>
  )
}

export function CopyableUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can be unavailable; the URL stays selectable in the field.
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md bg-[var(--surface-muted)] px-2.5 py-2 text-[11.5px] text-[var(--text-secondary)]">{url}</code>
      <button type="button" onClick={() => void copy()} className="h-8 shrink-0 rounded-md border border-[var(--border-soft)] px-3 text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]">
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
