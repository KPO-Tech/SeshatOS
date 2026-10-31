import { useMemo, useState, type ReactNode } from 'react'
import { Left } from '@icon-park/react'
import { CustomSelect, Field, TextInput } from '@renderer/components/config/knowledge/KnowledgePrimitives'
import { AgentAvatar } from './AgentAvatar'
import type { AgentConfigEntry, AgentCreatePayload } from './agentTypes'

const permissionOptions = [
  { value: 'default', label: 'Default', description: 'Use the workspace approval mode' },
  { value: 'suggest', label: 'Suggest', description: 'Ask before sensitive actions' },
  { value: 'auto', label: 'Auto', description: 'Run trusted actions directly' },
  { value: 'manual', label: 'Manual', description: 'Require explicit confirmation' }
]

const isolationOptions = [
  { value: '', label: 'Workspace default', description: 'Use the runtime default isolation' },
  { value: 'workspace', label: 'Workspace', description: 'Share the current workspace context' },
  { value: 'ephemeral', label: 'Ephemeral', description: 'Prefer short-lived execution context' }
]

const starterPrompts = [
  {
    label: 'Research',
    prompt: 'You are a careful research agent. Break down the request, search or inspect sources when needed, compare evidence, and return a concise synthesis with clear uncertainty.'
  },
  {
    label: 'Builder',
    prompt: 'You are a product builder agent. Clarify the intended outcome, inspect the existing project, propose small implementation steps, and keep changes scoped and verifiable.'
  },
  {
    label: 'Ops',
    prompt: 'You are an operations agent. Monitor recurring tasks, identify blockers, produce reliable checklists, and prefer reversible actions with clear status updates.'
  }
]

const AREA =
  'min-w-0 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--accent-primary)]'
const INPUT = 'bg-[var(--surface-root)]'

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-5">
      <h3 className="m-0 text-[14px] font-semibold text-[var(--text-primary)]">{title}</h3>
      {hint && <p className="m-0 mt-0.5 text-[12px] text-[var(--text-muted)]">{hint}</p>}
      <div className="mt-4 grid gap-3">{children}</div>
    </section>
  )
}

function Switch({ enabled, label, onChange }: { enabled: boolean; label: string; onChange: (enabled: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={() => onChange(!enabled)}
      className={`flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-0 p-0.5 transition-colors ${enabled ? 'justify-end bg-[var(--accent-primary)]' : 'justify-start bg-[var(--surface-muted)]'}`}
    >
      <span className="size-4 rounded-full bg-white" />
    </button>
  )
}

function Pills({ value, options, onChange }: { value: string; options: Array<{ id: string; label: string }>; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1.5" role="group">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`h-8 cursor-pointer rounded-full border px-3.5 text-[12.5px] font-medium ${value === option.id ? 'border-transparent bg-[var(--accent-primary)] text-white' : 'border-[var(--border-soft)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Fact({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[12.5px]">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={`truncate font-medium ${ok ? 'text-[var(--accent-success)]' : 'text-[var(--text-primary)]'}`}>{value}</span>
    </div>
  )
}

/** The form that makes an agent of the person's own: who it is, how it is told to behave, and what it may use. */
export function AgentCreateForm({ saving, onCancel, onSubmit }: {
  saving: boolean
  onCancel: () => void
  onSubmit: (payload: AgentCreatePayload) => void
}) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [whenToUse, setWhenToUse] = useState('')
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('')
  const [toolsMode, setToolsMode] = useState<'all' | 'custom'>('all')
  const [toolsCustom, setToolsCustom] = useState('')
  const [disallowedTools, setDisallowedTools] = useState('')
  const [maxTurns, setMaxTurns] = useState(50)
  const [permissionMode, setPermissionMode] = useState('default')
  const [isolation, setIsolation] = useState('')
  const [mcpServers, setMcpServers] = useState('')
  const [enabled, setEnabled] = useState(true)

  const computedSlug = useMemo(
    () => slug.trim() || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    [name, slug]
  )
  const previewAgent: AgentConfigEntry = {
    slug: computedSlug || 'new-agent',
    name: name.trim() || 'New agent',
    when_to_use: whenToUse,
    system_prompt: prompt,
    tools: toolsMode === 'all' ? ['*'] : splitList(toolsCustom),
    disallowed_tools: splitList(disallowedTools),
    max_turns: maxTurns,
    permission_mode: permissionMode,
    isolation,
    mcp_servers: splitList(mcpServers),
    icon: `lorelei:${computedSlug || 'new-agent'}`,
    enabled,
    source: 'user'
  }
  const canCreate = !saving && Boolean(name.trim()) && Boolean(computedSlug) && Boolean(prompt.trim())

  function submit() {
    onSubmit({
      slug: computedSlug,
      name: name.trim(),
      when_to_use: whenToUse.trim(),
      system_prompt: prompt.trim(),
      model: model.trim(),
      tools: toolsMode === 'all' ? ['*'] : splitList(toolsCustom),
      disallowed_tools: splitList(disallowedTools),
      max_turns: maxTurns,
      permission_mode: permissionMode === 'default' ? '' : permissionMode,
      isolation,
      mcp_servers: splitList(mcpServers),
      enabled,
      icon: `lorelei:${computedSlug}`
    })
  }

  return (
    <div>
      <button type="button" onClick={onCancel} className="mb-3 flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[12.5px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
        <Left theme="outline" size={13} />
        Agents
      </button>
      <h2 className="m-0 text-[18px] font-semibold text-[var(--text-primary)]">New agent</h2>
      <p className="m-0 mt-0.5 text-[12.5px] text-[var(--text-muted)]">Give it an identity, tell it how to behave, and choose what it may use.</p>

      <div className="mt-4 grid grid-cols-[280px_minmax(0,1fr)] items-start gap-4">
        <aside className="sticky top-0 flex flex-col gap-3">
          <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-5">
            <div className="flex flex-col items-center text-center">
              <AgentAvatar agent={previewAgent} size={72} />
              <h3 className="m-0 mt-3 max-w-full truncate text-[16px] font-semibold text-[var(--text-primary)]">{previewAgent.name}</h3>
              <div className="mt-0.5 max-w-full truncate font-mono text-[11.5px] text-[var(--text-muted)]">/{previewAgent.slug}</div>
            </div>
            <div className="mt-4 divide-y divide-[var(--border-soft)] border-t border-[var(--border-soft)] pt-2">
              <Fact label="Status" value={enabled ? 'Enabled' : 'Off'} ok={enabled} />
              <Fact label="Tools" value={toolsMode === 'all' ? 'All tools' : `${previewAgent.tools?.length ?? 0} selected`} />
              <Fact label="MCP servers" value={previewAgent.mcp_servers?.length ? String(previewAgent.mcp_servers.length) : 'Default'} />
              <Fact label="Turns" value={String(maxTurns)} />
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
            <h3 className="m-0 text-[13px] font-semibold text-[var(--text-primary)]">Start from</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {starterPrompts.map((starter) => (
                <button
                  key={starter.label}
                  type="button"
                  onClick={() => setPrompt(starter.prompt)}
                  className="h-8 cursor-pointer rounded-full border border-[var(--border-soft)] bg-transparent px-3.5 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                >
                  {starter.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="grid gap-4">
          <Card title="Identity">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Display name">
                <TextInput className={INPUT} value={name} onChange={(event) => setName(event.target.value)} placeholder="Research companion" />
              </Field>
              <Field label="Slug">
                <TextInput
                  className={`${INPUT} font-mono`}
                  value={slug}
                  onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder={computedSlug || 'research-companion'}
                />
              </Field>
            </div>
            <Field label="When to use">
              <textarea
                value={whenToUse}
                onChange={(event) => setWhenToUse(event.target.value)}
                rows={3}
                className={`${AREA} resize-none`}
                placeholder="Use this agent for source-backed research, synthesis, and careful comparison."
              />
            </Field>
          </Card>

          <Card title="Instructions" hint="What the agent is told every time it starts.">
            <Field label="System prompt">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={10}
                className={`${AREA} resize-y font-mono text-[12px] leading-5`}
                placeholder={'You are a careful agent specialized in...\n\nYour role is to...\n\nConstraints:\n- Be precise\n- Ask only when blocked\n- Keep actions reversible'}
              />
            </Field>
          </Card>

          <Card title="Capabilities">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Model override">
                <TextInput className={`${INPUT} font-mono`} value={model} onChange={(event) => setModel(event.target.value)} placeholder="provider:model, optional" />
              </Field>
              <Field label="Max turns">
                <TextInput className={INPUT} type="number" min={1} max={500} value={maxTurns} onChange={(event) => setMaxTurns(Number.parseInt(event.target.value, 10) || 50)} />
              </Field>
              <Field label="Permission mode">
                <CustomSelect value={permissionMode} options={permissionOptions} onChange={setPermissionMode} />
              </Field>
              <Field label="Isolation">
                <CustomSelect value={isolation} options={isolationOptions} onChange={setIsolation} />
              </Field>
            </div>

            <div className="rounded-xl border border-[var(--border-soft)] p-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[13px] font-semibold text-[var(--text-primary)]">Tools</div>
                  <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">Every tool, or only a list you give.</div>
                </div>
                <Pills value={toolsMode} options={[{ id: 'all', label: 'All' }, { id: 'custom', label: 'Custom' }]} onChange={(id) => setToolsMode(id as 'all' | 'custom')} />
              </div>
              {toolsMode === 'custom' && <TextInput className={`${INPUT} mt-3 w-full font-mono`} value={toolsCustom} onChange={(event) => setToolsCustom(event.target.value)} placeholder="web_search, read_file, terminal" />}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Disallowed tools">
                <TextInput className={`${INPUT} font-mono`} value={disallowedTools} onChange={(event) => setDisallowedTools(event.target.value)} placeholder="delete_file, shell" />
              </Field>
              <Field label="MCP servers">
                <TextInput className={`${INPUT} font-mono`} value={mcpServers} onChange={(event) => setMcpServers(event.target.value)} placeholder="filesystem, github" />
              </Field>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-[var(--border-soft)] px-3 py-2.5">
              <div>
                <div className="text-[13px] font-semibold text-[var(--text-primary)]">Enabled</div>
                <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">Available in the agent pickers as soon as it is created.</div>
              </div>
              <Switch enabled={enabled} label="Enabled" onChange={setEnabled} />
            </div>
          </Card>

          <div className="flex items-center justify-between gap-4 pb-2">
            <span className="text-[12px] text-[var(--text-muted)]">The slug cannot be changed after creation.</span>
            <div className="flex gap-2">
              <button type="button" disabled={saving} onClick={onCancel} className="h-9 cursor-pointer rounded-lg border border-[var(--border-soft)] bg-transparent px-4 text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-50">
                Cancel
              </button>
              <button type="button" disabled={!canCreate} onClick={submit} className="h-9 cursor-pointer rounded-lg border-0 bg-[var(--accent-primary)] px-5 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-default disabled:opacity-50">
                {saving ? 'Creating...' : 'Create agent'}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function splitList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}
