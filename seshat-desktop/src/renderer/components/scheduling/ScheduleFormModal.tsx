import { useEffect, useState } from 'react'
import { fetchAgents } from '@renderer/components/config/agents/agentsApi'
import type { AgentConfigEntry } from '@renderer/components/config/agents/agentTypes'
import { createAutomationJob, deleteAutomationJob, updateAutomationJob } from '@renderer/components/config/automation/automationApi'
import type { AutomationJob } from '@renderer/components/config/automation/automationTypes'
import { FieldLabel, ModalShell, inputClass, selectClass } from './scheduleFormParts'
import { initialFormState, isFormValid, triggerParams, type ScheduleFormState } from './scheduleFormState'
import type { ScheduleDraft } from './scheduleTemplates'
import { TriggerPicker } from './TriggerPicker'
import { WebhookFields } from './WebhookFields'

type Props = {
  job: AutomationJob | null // null = creating a new task
  draft?: ScheduleDraft // pre-fills a new task (from a template)
  onClose: () => void
  onSaved: () => void
}

export function ScheduleFormModal({ job, draft, onClose, onSaved }: Props) {
  const [form, setForm] = useState<ScheduleFormState>(() => initialFormState(job, draft))
  const [executionTarget, setExecutionTarget] = useState<'cloud' | 'device'>((job?.execution_target as 'cloud' | 'device') || 'cloud')
  const [agents, setAgents] = useState<AgentConfigEntry[]>([])
  const [agentSlug, setAgentSlug] = useState(job?.configuration?.agent_slug ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patch = (update: Partial<ScheduleFormState>) => setForm((current) => ({ ...current, ...update }))

  useEffect(() => {
    fetchAgents().then((list) => setAgents(list.filter((agent) => agent.enabled))).catch(() => undefined)
  }, [])

  async function handleSave() {
    if (!isFormValid(form) || saving) return
    setSaving(true)
    setError(null)
    try {
      const params = {
        name: form.name.trim(),
        prompt: form.prompt.trim(),
        execution_target: executionTarget,
        configuration: agentSlug ? { agent_slug: agentSlug } : undefined,
        ...triggerParams(form)
      }
      if (job) await updateAutomationJob(job.id, params)
      else await createAutomationJob(params)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the schedule.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!job || deleting) return
    if (!window.confirm(`Delete "${job.name}"? This can't be undone.`)) return
    setDeleting(true)
    setError(null)
    try {
      await deleteAutomationJob(job.id)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete the schedule.')
      setDeleting(false)
    }
  }

  return (
    <ModalShell title={job ? 'Edit scheduled task' : 'New scheduled task'} onClose={onClose}>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <FieldLabel>Title</FieldLabel>
        <input value={form.name} onChange={(event) => patch({ name: event.target.value })} placeholder="Summary of unread mail" className={`${inputClass} text-[14px]`} />

        <FieldLabel className="mt-4">Trigger</FieldLabel>
        <TriggerPicker
          mode={form.mode}
          onModeChange={(mode) => patch({ mode })}
          recurrence={form.recurrence}
          onRecurrenceChange={(update) => setForm((current) => ({ ...current, recurrence: update(current.recurrence) }))}
          customCron={form.customCron}
          onCustomCronChange={(customCron) => patch({ customCron })}
        />
        {form.mode === 'webhook' && (
          <WebhookFields
            method={form.webhookMethod}
            onMethodChange={(webhookMethod) => patch({ webhookMethod })}
            responseMode={form.webhookResponseMode}
            onResponseModeChange={(webhookResponseMode) => patch({ webhookResponseMode })}
            token={job?.webhook_token}
          />
        )}

        <FieldLabel className="mt-4">Prompt</FieldLabel>
        <textarea
          value={form.prompt}
          onChange={(event) => patch({ prompt: event.target.value })}
          placeholder="Summarize unread emails and highlight important messages"
          rows={4}
          className="w-full resize-y rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 py-2.5 text-[13px] leading-6 text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
        />

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div>
            <FieldLabel>Agent</FieldLabel>
            <select value={agentSlug} onChange={(event) => setAgentSlug(event.target.value)} className={selectClass}>
              <option value="">Default agent</option>
              {agents.map((agent) => <option key={agent.slug} value={agent.slug}>{agent.name}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Runs on</FieldLabel>
            <select value={executionTarget} onChange={(event) => setExecutionTarget(event.target.value as 'cloud' | 'device')} className={selectClass}>
              <option value="cloud">Cloud (works while this app is closed)</option>
              <option value="device">This device only</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-[var(--accent-danger)]/40 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12.5px] font-semibold text-[var(--accent-danger)]">{error}</div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--border-soft)] px-5 py-3.5">
        {job ? (
          <button type="button" onClick={() => void handleDelete()} disabled={deleting || saving} className="text-[13px] font-semibold text-[var(--accent-danger)] hover:opacity-80 disabled:opacity-40">
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        ) : <span />}
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-[var(--border-soft)] px-4 text-[13px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || deleting || !isFormValid(form)}
            className="h-9 rounded-lg bg-[var(--accent-primary)] px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
