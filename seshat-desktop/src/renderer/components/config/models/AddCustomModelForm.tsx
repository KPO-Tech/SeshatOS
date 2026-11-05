import { useState } from 'react'
import type { ProviderSetting } from '../providers/providerTypes'
import { useTranslation } from 'react-i18next'

type AddCustomModelFormProps = {
  provider: ProviderSetting
  saving: boolean
  onCancel: () => void
  onSubmit: (values: { model_id: string; display_name?: string; context_window?: number; max_output?: number }) => Promise<void>
}

export function AddCustomModelForm({ provider, saving, onCancel, onSubmit }: AddCustomModelFormProps) {
  const { t } = useTranslation('config')
  const [modelId, setModelId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [contextWindow, setContextWindow] = useState('')
  const [maxOutput, setMaxOutput] = useState('')
  const canSave = modelId.trim().length > 0

  return (
    <section className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{t('models.addCustomModelForm.addCustomModel')}</h2>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">{provider.name || provider.provider}</p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-md border border-[var(--border-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]">
          {t('models.addCustomModelForm.cancel')}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="grid gap-1.5">
          <span className="text-[12px] font-semibold text-[var(--text-muted)]">{t('models.addCustomModelForm.modelId')}</span>
          <input value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="provider-model-id" className="h-9 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-[13px] text-[var(--text-primary)] outline-none" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[12px] font-semibold text-[var(--text-muted)]">{t('models.addCustomModelForm.displayName')}</span>
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={t('models.addCustomModelForm.optionalLabel')} className="h-9 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-[13px] text-[var(--text-primary)] outline-none" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[12px] font-semibold text-[var(--text-muted)]">{t('models.addCustomModelForm.contextWindow')}</span>
          <input value={contextWindow} onChange={(event) => setContextWindow(event.target.value)} inputMode="numeric" placeholder="128000" className="h-9 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-[13px] text-[var(--text-primary)] outline-none" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[12px] font-semibold text-[var(--text-muted)]">{t('models.addCustomModelForm.maxOutput')}</span>
          <input value={maxOutput} onChange={(event) => setMaxOutput(event.target.value)} inputMode="numeric" placeholder="8192" className="h-9 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-[13px] text-[var(--text-primary)] outline-none" />
        </label>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => void onSubmit({
            model_id: modelId.trim(),
            display_name: displayName.trim() || undefined,
            context_window: numberOrUndefined(contextWindow),
            max_output: numberOrUndefined(maxOutput)
          })}
          disabled={!canSave || saving}
          className="h-9 rounded-md bg-[var(--text-primary)] px-4 text-[13px] font-semibold text-[var(--surface-root)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {saving ? t('models.addCustomModelForm.adding') : t('models.addCustomModelForm.addModel')}
        </button>
      </div>
    </section>
  )
}

function numberOrUndefined(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}
