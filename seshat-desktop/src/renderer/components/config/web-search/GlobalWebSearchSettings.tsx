import type { WebSearchForm } from './webSearchTypes'

type GlobalWebSearchSettingsProps = {
  form: WebSearchForm
  saving: boolean
  saved: boolean
  onChange: <K extends keyof WebSearchForm>(key: K, value: WebSearchForm[K]) => void
  onSave: () => Promise<void>
}

export function GlobalWebSearchSettings({ form, saving, saved, onChange, onSave }: GlobalWebSearchSettingsProps) {
  return (
    <section className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Search behavior</h2>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">Control agent web access and daily query limits.</p>
        </div>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          className={[
            'rounded-md border px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-45',
            saved
              ? 'border-[var(--accent-success)]/35 bg-[var(--accent-success)]/10 text-[var(--accent-success)]'
              : 'border-[var(--border-soft)] bg-[var(--surface-muted)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-panel)]'
          ].join(' ')}
        >
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
        </button>
      </div>

      <div className="mt-4 grid gap-4">
        <ToggleLine
          title="Enable web search"
          description="Allow agent sessions to call configured web search providers."
          enabled={form.enabled}
          onChange={(enabled) => onChange('enabled', enabled)}
        />
        <ToggleLine
          title="Allow environment fallback"
          description="Use environment variables when no saved provider credential is available."
          enabled={form.allow_env_fallback}
          onChange={(enabled) => onChange('allow_env_fallback', enabled)}
        />
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">Max queries per day</span>
          <input
            type="number"
            min={0}
            value={form.max_queries_per_day}
            onChange={(event) => onChange('max_queries_per_day', Math.max(0, Number.parseInt(event.target.value, 10) || 0))}
            className="h-9 w-[180px] appearance-none rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-[13px] text-[var(--text-primary)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="text-[12px] text-[var(--text-muted)]">0 means unlimited.</span>
        </label>
      </div>
    </section>
  )
}

function ToggleLine({ title, description, enabled, onChange }: { title: string; description: string; enabled: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div>
        <div className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</div>
        <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">{description}</div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        className={[
          'flex h-5 w-9 items-center rounded-full p-0.5 transition-colors',
          enabled ? 'justify-end bg-[var(--accent-primary)]' : 'justify-start bg-[var(--surface-muted)]'
        ].join(' ')}
        aria-pressed={enabled}
      >
        <span className="size-4 rounded-full bg-white" />
      </button>
    </div>
  )
}
