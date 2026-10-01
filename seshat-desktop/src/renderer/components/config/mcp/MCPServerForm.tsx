import { useState } from 'react'
import { CustomSelect, Field, SoftButton, TextInput } from '../knowledge/KnowledgePrimitives'
import type { MCPServer, MCPServerFormValues } from './mcpTypes'
import { formValuesToPayload, validateMCPForm, valuesFromServer } from './mcpUtils'

const transportOptions = [
  { value: 'stdio', label: 'stdio', description: 'Local subprocess' },
  { value: 'http', label: 'HTTP', description: 'Remote HTTP server' },
  { value: 'sse', label: 'SSE', description: 'Server-sent events' },
  { value: 'ws', label: 'WebSocket', description: 'Persistent socket' }
]

export function MCPServerForm({
  server,
  saving,
  onCancel,
  onSave
}: {
  server?: MCPServer
  saving: boolean
  onCancel: () => void
  onSave: (payload: Partial<MCPServer>) => Promise<void>
}) {
  const [values, setValues] = useState<MCPServerFormValues>(() => valuesFromServer(server))
  const [error, setError] = useState<string | null>(null)
  const isStdio = values.server_type === 'stdio'

  function set<K extends keyof MCPServerFormValues>(key: K, value: MCPServerFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  async function submit() {
    const nextError = validateMCPForm(values)
    if (nextError) {
      setError(nextError)
      return
    }
    setError(null)
    await onSave(formValuesToPayload(values, server))
  }

  return (
    <section className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--border-soft)] px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{server ? 'Edit MCP server' : 'Add MCP server'}</h2>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">Expose local or remote tools to agent sessions.</p>
        </div>
        <div className="flex items-center gap-2">
          <SoftButton onClick={onCancel}>Cancel</SoftButton>
          <SoftButton tone="primary" onClick={() => void submit()} disabled={saving}>{saving ? 'Saving...' : 'Save'}</SoftButton>
        </div>
      </div>

      <div className="grid gap-4 p-4">
        {error && <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">{error}</div>}
        <div className="grid grid-cols-[92px_1fr_1fr] gap-3">
          <Field label="Icon">
            <TextInput value={values.icon} onChange={(event) => set('icon', event.target.value)} placeholder="Optional" />
          </Field>
          <Field label="Name">
            <TextInput value={values.name} onChange={(event) => set('name', event.target.value)} placeholder="filesystem" disabled={Boolean(server)} />
          </Field>
          <Field label="Display name">
            <TextInput value={values.display_name} onChange={(event) => set('display_name', event.target.value)} placeholder="Filesystem" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Transport">
            <CustomSelect value={values.server_type} options={transportOptions} onChange={(value) => set('server_type', value)} />
          </Field>
          <Field label="Timeout seconds">
            <TextInput type="number" min={5} max={300} value={values.timeout_secs} onChange={(event) => set('timeout_secs', Number(event.target.value))} />
          </Field>
        </div>

        {isStdio ? (
          <>
            <Field label="Command">
              <TextInput value={values.command} onChange={(event) => set('command', event.target.value)} placeholder="npx" />
            </Field>
            <Field label="Arguments">
              <Textarea value={values.args} onChange={(value) => set('args', value)} placeholder={"-y\n@modelcontextprotocol/server-filesystem\nD:\\\\Documents"} />
            </Field>
            <Field label="Environment variables">
              <Textarea value={values.env} onChange={(value) => set('env', value)} placeholder={"TOKEN=...\nPATH=..."} />
            </Field>
          </>
        ) : (
          <>
            <Field label="URL">
              <TextInput value={values.url} onChange={(event) => set('url', event.target.value)} placeholder="http://localhost:3000/mcp" />
            </Field>
            <Field label="Headers">
              <Textarea value={values.headers} onChange={(value) => set('headers', value)} placeholder="Authorization=Bearer ..." />
            </Field>
          </>
        )}
      </div>
    </section>
  )
}

function Textarea({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={3}
      className="min-h-[78px] w-full resize-none rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-[13px] leading-[var(--leading-copy)] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--accent-primary)]"
    />
  )
}
