import { useState } from 'react'
import { ActionButton, Notice, SelectField, SettingRow, SettingsCard, TextField } from '../../settings/kit'
import type { MCPServer, MCPServerFormValues } from './mcpTypes'
import { formValuesToPayload, validateMCPForm, valuesFromServer } from './mcpUtils'
import { useTranslation } from 'react-i18next'

const transportOptions = [
  { value: 'stdio', label: 'stdio' },
  { value: 'http', label: 'HTTP' },
  { value: 'sse', label: 'SSE' },
  { value: 'ws', label: 'WebSocket' }
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
  const { t } = useTranslation('config')
  const [values, setValues] = useState<MCPServerFormValues>(() => valuesFromServer(server))
  const [error, setError] = useState<string | null>(null)
  const isStdio = values.server_type === 'stdio'

  function set<K extends keyof MCPServerFormValues>(key: K, value: MCPServerFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  async function submit() {
    const nextError = validateMCPForm(values, t)
    if (nextError) {
      setError(nextError)
      return
    }
    setError(null)
    await onSave(formValuesToPayload(values, server))
  }

  return (
    <>
      {error && <Notice tone="error">{error}</Notice>}
      <SettingsCard
        title={server ? t('mcp.mCPServerForm.editServer') : t('mcp.mCPServerForm.newServer')}
        action={
          <div className="flex items-center gap-2">
            <ActionButton type="button" onClick={onCancel}>
              {t('mcp.mCPServerForm.cancel')}
            </ActionButton>
            <ActionButton type="button" tone="primary" onClick={() => void submit()} disabled={saving}>
              {saving ? t('mcp.mCPServerForm.saving') : t('mcp.mCPServerForm.save')}
            </ActionButton>
          </div>
        }
      >
        <SettingRow title={t('mcp.mCPServerForm.name')}>
          <TextField label={t('mcp.mCPServerForm.name')} value={values.name} onChange={(value) => set('name', value)} placeholder="filesystem" />
        </SettingRow>
        <SettingRow title={t('mcp.mCPServerForm.displayName')}>
          <TextField label={t('mcp.mCPServerForm.displayName')} value={values.display_name} onChange={(value) => set('display_name', value)} placeholder={t('mcp.mCPServerForm.filesystem')} />
        </SettingRow>
        <SettingRow title={t('mcp.mCPServerForm.transport')}>
          <div className="w-[210px]">
            <SelectField value={values.server_type} options={transportOptions} onChange={(value) => set('server_type', value)} />
          </div>
        </SettingRow>
        <SettingRow title={t('mcp.mCPServerForm.timeoutSeconds')}>
          <TextField label={t('mcp.mCPServerForm.timeout')} value={String(values.timeout_secs)} onChange={(value) => set('timeout_secs', Number(value) || 0)} width={100} />
        </SettingRow>
        {isStdio ? (
          <>
            <SettingRow title={t('mcp.mCPServerForm.command')}>
              <TextField label={t('mcp.mCPServerForm.command')} value={values.command} onChange={(value) => set('command', value)} placeholder="npx" mono />
            </SettingRow>
            <MultilineRow title={t('mcp.mCPServerForm.arguments')} value={values.args} onChange={(value) => set('args', value)} placeholder={t('mcp.mCPServerForm.yModelcontextprotocolServerFilesystem')} />
            <MultilineRow title={t('mcp.mCPServerForm.environment')} value={values.env} onChange={(value) => set('env', value)} placeholder={t('mcp.mCPServerForm.token')} />
          </>
        ) : (
          <>
            <SettingRow title="URL">
              <TextField label="URL" value={values.url} onChange={(value) => set('url', value)} placeholder="http://localhost:3000/mcp" mono />
            </SettingRow>
            <MultilineRow title={t('mcp.mCPServerForm.headers')} value={values.headers} onChange={(value) => set('headers', value)} placeholder={t('mcp.mCPServerForm.authorizationBearer')} />
          </>
        )}
      </SettingsCard>
    </>
  )
}

function MultilineRow({ title, value, onChange, placeholder }: { title: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div className="px-4 py-3">
      <div className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">{title}</div>
      <textarea
        value={value}
        aria-label={title}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-3 py-2 font-mono text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent-primary)]"
      />
    </div>
  )
}
