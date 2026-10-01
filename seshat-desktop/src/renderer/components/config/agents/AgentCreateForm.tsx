import { useMemo, useState } from 'react'
import { CustomSelect, Field, SoftButton, TextInput, ToggleSwitch } from '../knowledge/KnowledgePrimitives'
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
    <section className="overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] shadow-[0_18px_55px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--border-soft)] px-5 py-4">
        <div>
          <h2 className="text-[18px] font-semibold text-[var(--text-primary)]">Create agent</h2>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">Compose a local profile with its identity, prompt, tools, and runtime defaults.</p>
        </div>
        <SoftButton onClick={onCancel}>Back to agents</SoftButton>
      </div>

      <div className="grid grid-cols-[280px_1fr] gap-0">
        <aside className="border-r border-[var(--border-soft)] bg-[var(--surface-sidebar)] p-5">
          <div className="flex flex-col items-center text-center">
            <AgentAvatar agent={previewAgent} size={86} />
            <h3 className="mt-4 max-w-full truncate text-[18px] font-semibold text-[var(--text-primary)]">{previewAgent.name}</h3>
            <div className="mt-1 max-w-full truncate font-mono text-[12px] text-[var(--text-muted)]">/{previewAgent.slug}</div>
          </div>

          <div className="mt-5 grid gap-2">
            <PreviewLine label="Status" value={enabled ? 'Enabled' : 'Disabled'} tone={enabled ? 'ok' : 'muted'} />
            <PreviewLine label="Tools" value={toolsMode === 'all' ? 'All tools' : `${previewAgent.tools?.length ?? 0} selected`} />
            <PreviewLine label="MCP servers" value={previewAgent.mcp_servers?.length ? String(previewAgent.mcp_servers.length) : 'Default'} />
            <PreviewLine label="Turns" value={String(maxTurns)} />
          </div>

          <div className="mt-5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3">
            <div className="text-[12px] font-semibold text-[var(--text-primary)]">Prompt starters</div>
            <div className="mt-2 grid gap-1.5">
              {starterPrompts.map((starter) => (
                <button
                  key={starter.label}
                  type="button"
                  onClick={() => setPrompt(starter.prompt)}
                  className="rounded-md px-2 py-1.5 text-left text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-panel)] hover:text-[var(--text-primary)]"
                >
                  {starter.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="grid gap-5 p-5">
          <section>
            <SectionTitle title="Identity" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Display name">
                <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Research companion" />
              </Field>
              <Field label="Slug">
                <TextInput
                  value={slug}
                  onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder={computedSlug || 'research-companion'}
                  className="font-mono"
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="When to use">
                <textarea
                  value={whenToUse}
                  onChange={(event) => setWhenToUse(event.target.value)}
                  rows={3}
                  className="min-w-0 resize-none rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--accent-primary)]"
                  placeholder="Use this agent for source-backed research, synthesis, and careful comparison."
                />
              </Field>
            </div>
          </section>

          <section>
            <SectionTitle title="Instructions" />
            <div className="mt-3">
              <Field label="System prompt">
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={10}
                  className="min-w-0 resize-y rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 font-mono text-[12px] leading-5 text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--accent-primary)]"
                  placeholder={'You are a careful agent specialized in...\n\nYour role is to...\n\nConstraints:\n- Be precise\n- Ask only when blocked\n- Keep actions reversible'}
                />
              </Field>
            </div>
          </section>

          <section>
            <SectionTitle title="Capabilities" />
            <div className="mt-3 grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Model override">
                  <TextInput value={model} onChange={(event) => setModel(event.target.value)} placeholder="provider:model, optional" className="font-mono" />
                </Field>
                <Field label="Max turns">
                  <TextInput type="number" min={1} max={500} value={maxTurns} onChange={(event) => setMaxTurns(Number.parseInt(event.target.value, 10) || 50)} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Permission mode">
                  <CustomSelect value={permissionMode} options={permissionOptions} onChange={setPermissionMode} />
                </Field>
                <Field label="Isolation">
                  <CustomSelect value={isolation} options={isolationOptions} onChange={setIsolation} />
                </Field>
              </div>

              <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[13px] font-semibold text-[var(--text-primary)]">Tools</div>
                    <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">Choose every tool or restrict the agent to a comma-separated list.</div>
                  </div>
                  <div className="flex rounded-md border border-[var(--border-soft)] bg-[var(--surface-panel)] p-1">
                    <ModeButton active={toolsMode === 'all'} onClick={() => setToolsMode('all')}>All</ModeButton>
                    <ModeButton active={toolsMode === 'custom'} onClick={() => setToolsMode('custom')}>Custom</ModeButton>
                  </div>
                </div>
                {toolsMode === 'custom' && (
                  <TextInput value={toolsCustom} onChange={(event) => setToolsCustom(event.target.value)} placeholder="web_search, read_file, terminal" className="mt-3 font-mono" />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Disallowed tools">
                  <TextInput value={disallowedTools} onChange={(event) => setDisallowedTools(event.target.value)} placeholder="delete_file, shell" className="font-mono" />
                </Field>
                <Field label="MCP servers">
                  <TextInput value={mcpServers} onChange={(event) => setMcpServers(event.target.value)} placeholder="filesystem, github" className="font-mono" />
                </Field>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2.5">
                <div>
                  <div className="text-[13px] font-semibold text-[var(--text-primary)]">Enabled</div>
                  <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">Available immediately in agent pickers after creation.</div>
                </div>
                <ToggleSwitch enabled={enabled} onChange={setEnabled} />
              </div>
            </div>
          </section>
        </main>
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-4 border-t border-[var(--border-soft)] bg-[var(--surface-panel)] px-5 py-3">
        <div className="text-[12px] text-[var(--text-muted)]">
          Slug is permanent after creation. Name and instructions can be edited later.
        </div>
        <div className="flex gap-2">
          <SoftButton onClick={onCancel} disabled={saving}>Cancel</SoftButton>
          <SoftButton tone="primary" disabled={saving || !name.trim() || !computedSlug || !prompt.trim()} onClick={submit}>
            {saving ? 'Creating...' : 'Create agent'}
          </SoftButton>
        </div>
      </div>
    </section>
  )
}

function SectionTitle({ title }: { title: string }) {
  return <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">{title}</h3>
}

function ModeButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'h-7 rounded px-3 text-[12px] font-semibold transition-colors',
        active ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function PreviewLine({ label, value, tone = 'muted' }: { label: string; value: string; tone?: 'ok' | 'muted' }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2">
      <span className="text-[11px] font-semibold text-[var(--text-muted)]">{label}</span>
      <span className={['truncate text-[12px] font-semibold', tone === 'ok' ? 'text-[var(--accent-success)]' : 'text-[var(--text-primary)]'].join(' ')}>{value}</span>
    </div>
  )
}

function splitList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}
