import { useState } from 'react'
import { AdminModal, AdminModalButton, AdminModalError, AdminModalField, adminInputClass } from '../shared/AdminModal'
import { createAdminAgentPreset, updateAdminAgentPreset, type AgentPresetInput } from './useAdminAgentPresets'
import type { OrgAgentPreset } from '../types'

const PERMISSION_MODE_OPTIONS = ['', 'onRequest', 'never', 'auto', 'acceptEdits', 'bypass', 'granular']
const ISOLATION_OPTIONS = ['', 'worktree', 'chroot']

function toCommaList(values?: string[]): string {
  return (values ?? []).join(', ')
}

function fromCommaList(value: string): string[] | undefined {
  const cleaned = value.split(',').map((v) => v.trim()).filter(Boolean)
  return cleaned.length > 0 ? cleaned : undefined
}

export function AgentPresetModal({ preset, onClose, onSuccess }: { preset?: OrgAgentPreset; onClose: () => void; onSuccess: () => void }) {
  const [slug, setSlug] = useState(preset?.slug ?? '')
  const [name, setName] = useState(preset?.name ?? '')
  const [whenToUse, setWhenToUse] = useState(preset?.when_to_use ?? '')
  const [systemPrompt, setSystemPrompt] = useState(preset?.system_prompt ?? '')
  const [model, setModel] = useState(preset?.model ?? '')
  const [tools, setTools] = useState(toCommaList(preset?.tools))
  const [disallowedTools, setDisallowedTools] = useState(toCommaList(preset?.disallowed_tools))
  const [mcpServers, setMcpServers] = useState(toCommaList(preset?.mcp_servers))
  const [maxTurns, setMaxTurns] = useState(preset?.max_turns ? String(preset.max_turns) : '')
  const [permissionMode, setPermissionMode] = useState(preset?.permission_mode ?? '')
  const [isolation, setIsolation] = useState(preset?.isolation ?? '')
  const [icon, setIcon] = useState(preset?.icon ?? '')
  const [enabled, setEnabled] = useState(preset?.enabled !== false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    const body: AgentPresetInput = {
      name: name.trim() || undefined,
      when_to_use: whenToUse.trim() || undefined,
      system_prompt: systemPrompt.trim() || undefined,
      model: model.trim() || undefined,
      tools: fromCommaList(tools),
      disallowed_tools: fromCommaList(disallowedTools),
      mcp_servers: fromCommaList(mcpServers),
      max_turns: maxTurns ? Number(maxTurns) : undefined,
      permission_mode: permissionMode || undefined,
      isolation: isolation || undefined,
      icon: icon.trim() || undefined,
      enabled,
    }
    try {
      if (preset) await updateAdminAgentPreset(preset.id, body)
      else await createAdminAgentPreset({ ...body, slug: slug.trim() })
      onSuccess()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save this agent preset.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminModal
      title={preset ? `Edit ${preset.name || preset.slug}` : 'New agent preset'}
      onClose={onClose}
      footer={
        <>
          <AdminModalButton variant="cancel" onClick={onClose}>Cancel</AdminModalButton>
          <AdminModalButton disabled={submitting || (!preset && !slug.trim())} onClick={handleSubmit}>{submitting ? 'Saving…' : 'Save'}</AdminModalButton>
        </>
      }
    >
      {!preset && (
        <AdminModalField label="Slug">
          <input type="text" className={adminInputClass} placeholder="data-scientist" value={slug} autoFocus onChange={(e) => setSlug(e.target.value)} />
        </AdminModalField>
      )}
      <AdminModalField label="Name">
        <input type="text" className={adminInputClass} placeholder="Data Scientist" value={name} onChange={(e) => setName(e.target.value)} />
      </AdminModalField>
      <AdminModalField label="When to use">
        <textarea className={adminInputClass} rows={2} placeholder="For data analysis, statistics, and reporting tasks." value={whenToUse} onChange={(e) => setWhenToUse(e.target.value)} />
      </AdminModalField>
      <AdminModalField label="System prompt">
        <textarea className={adminInputClass} rows={6} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
      </AdminModalField>
      <AdminModalField label="Model" hint="(optional)">
        <input type="text" className={adminInputClass} placeholder="anthropic:claude-sonnet-5" value={model} onChange={(e) => setModel(e.target.value)} />
      </AdminModalField>
      <AdminModalField label="Allowed tools" hint="(comma-separated, optional)">
        <input type="text" className={adminInputClass} placeholder="bash, write, web_search" value={tools} onChange={(e) => setTools(e.target.value)} />
      </AdminModalField>
      <AdminModalField label="Disallowed tools" hint="(comma-separated, optional)">
        <input type="text" className={adminInputClass} placeholder="git, edit" value={disallowedTools} onChange={(e) => setDisallowedTools(e.target.value)} />
      </AdminModalField>
      <AdminModalField label="MCP servers" hint="(comma-separated, optional)">
        <input type="text" className={adminInputClass} placeholder="Org-shared MCP server names" value={mcpServers} onChange={(e) => setMcpServers(e.target.value)} />
      </AdminModalField>
      <AdminModalField label="Max turns" hint="(optional)">
        <input type="number" min={1} className={adminInputClass} value={maxTurns} onChange={(e) => setMaxTurns(e.target.value)} />
      </AdminModalField>
      <AdminModalField label="Permission mode">
        <select className={adminInputClass} value={permissionMode} onChange={(e) => setPermissionMode(e.target.value)}>
          {PERMISSION_MODE_OPTIONS.map((v) => <option key={v} value={v}>{v || 'Default'}</option>)}
        </select>
      </AdminModalField>
      <AdminModalField label="Isolation">
        <select className={adminInputClass} value={isolation} onChange={(e) => setIsolation(e.target.value)}>
          {ISOLATION_OPTIONS.map((v) => <option key={v} value={v}>{v || 'Default'}</option>)}
        </select>
      </AdminModalField>
      <AdminModalField label="Icon" hint="(optional)">
        <input type="text" className={adminInputClass} placeholder="🤖" value={icon} onChange={(e) => setIcon(e.target.value)} />
      </AdminModalField>
      <label className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enabled
      </label>

      {error && <AdminModalError message={error} />}
    </AdminModal>
  )
}
