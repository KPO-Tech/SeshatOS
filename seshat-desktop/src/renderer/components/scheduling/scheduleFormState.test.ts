import { describe, expect, it } from 'vitest'
import type { AutomationJob } from '@renderer/components/config/automation/automationTypes'
import { initialFormState, isFormValid, triggerParams } from './scheduleFormState'
import { SCHEDULE_TEMPLATES, templateToDraft } from './scheduleTemplates'

function job(overrides: Partial<AutomationJob>): AutomationJob {
  return { id: 'j1', name: 'Job', status: 'active', trigger_type: 'cron', prompt: 'Do it', ...overrides }
}

describe('initialFormState', () => {
  it('starts a new task on the daily picker', () => {
    expect(initialFormState(null)).toMatchObject({ mode: 'daily', name: '', prompt: '' })
  })

  it('maps a simple cron job onto its picker mode', () => {
    expect(initialFormState(job({ cron_expr: '30 17 * * 3' }))).toMatchObject({ mode: 'weekly' })
  })

  it('keeps a hand-written cron as raw cron', () => {
    expect(initialFormState(job({ cron_expr: '*/30 * * * *' }))).toMatchObject({ mode: 'custom', customCron: '*/30 * * * *' })
  })

  it('recognises a saved webhook job by its token, since trigger_type comes back empty', () => {
    expect(initialFormState(job({ trigger_type: '', webhook_token: 'tok', webhook_method: 'PUT' }))).toMatchObject({ mode: 'webhook', webhookMethod: 'PUT' })
  })

  it('recognises an interval job', () => {
    expect(initialFormState(job({ trigger_type: 'interval', interval_seconds: 900 }))).toMatchObject({ mode: 'interval' })
  })

  it('pre-fills from a template', () => {
    const template = SCHEDULE_TEMPLATES.find((item) => item.trigger_type === 'webhook')!
    expect(initialFormState(null, templateToDraft(template))).toMatchObject({ mode: 'webhook', name: template.name, prompt: template.prompt })
  })
})

describe('triggerParams', () => {
  it('sends webhook settings without any schedule fields', () => {
    const state = { ...initialFormState(null), mode: 'webhook' as const, webhookMethod: 'GET' as const }
    expect(triggerParams(state)).toEqual({ trigger_type: 'webhook', webhook_method: 'GET', webhook_response_mode: 'immediate' })
  })

  it('sends custom cron trimmed', () => {
    const state = { ...initialFormState(null), mode: 'custom' as const, customCron: ' 0 9 * * 1 ' }
    expect(triggerParams(state)).toEqual({ trigger_type: 'cron', cron_expr: '0 9 * * 1' })
  })

  it('sends an interval in seconds', () => {
    const state = initialFormState(null)
    expect(triggerParams({ ...state, mode: 'interval', recurrence: { ...state.recurrence, intervalMinutes: 15 } })).toEqual({ trigger_type: 'interval', interval_seconds: 900 })
  })
})

describe('isFormValid', () => {
  const base = { ...initialFormState(null), name: 'A', prompt: 'B' }

  it('needs a title and a prompt', () => {
    expect(isFormValid(base)).toBe(true)
    expect(isFormValid({ ...base, name: ' ' })).toBe(false)
    expect(isFormValid({ ...base, prompt: '' })).toBe(false)
  })

  it('needs a five-field cron in custom mode', () => {
    expect(isFormValid({ ...base, mode: 'custom', customCron: '* * *' })).toBe(false)
    expect(isFormValid({ ...base, mode: 'custom', customCron: '* * * * *' })).toBe(true)
  })

  it('needs a positive interval', () => {
    expect(isFormValid({ ...base, mode: 'interval', recurrence: { ...base.recurrence, intervalMinutes: 0 } })).toBe(false)
  })
})
