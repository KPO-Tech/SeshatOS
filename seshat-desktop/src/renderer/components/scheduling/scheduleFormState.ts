import type {
  AutomationJob,
  AutomationJobParams,
  WebhookMethod,
  WebhookResponseMode
} from '@renderer/components/config/automation/automationTypes'
import {
  MIN_INTERVAL_MINUTES,
  defaultRecurrence,
  jobToRecurrence,
  recurrenceToJobFields,
  type SimpleRecurrence,
  type SimpleRecurrenceKind
} from './scheduleRecurrence'
import type { ScheduleDraft } from './scheduleTemplates'

// What the form's trigger control is showing: one of the simple recurrences,
// a webhook, or a raw cron expression the simple picker can't express.
export type ScheduleMode = SimpleRecurrenceKind | 'webhook' | 'custom'

export type ScheduleFormState = {
  name: string
  prompt: string
  mode: ScheduleMode
  recurrence: SimpleRecurrence
  customCron: string
  webhookMethod: WebhookMethod
  webhookResponseMode: WebhookResponseMode
}

// A saved webhook job comes back with an empty trigger_type, so the token (or
// a not-yet-saved draft's trigger_type) is what identifies it.
function isWebhook(job: AutomationJob | null, draft?: ScheduleDraft): boolean {
  if (job) return Boolean(job.webhook_token) || job.trigger_type === 'webhook'
  return draft?.trigger_type === 'webhook'
}

export function initialFormState(job: AutomationJob | null, draft?: ScheduleDraft): ScheduleFormState {
  const source = job ?? (draft ? { trigger_type: draft.trigger_type, cron_expr: draft.cron_expr } : null)
  const parsed = source && !isWebhook(job, draft) ? jobToRecurrence(source) : null
  const cronExpr = source?.cron_expr ?? ''

  let mode: ScheduleMode = 'daily'
  if (isWebhook(job, draft)) mode = 'webhook'
  else if (parsed) mode = parsed.kind
  else if (source) mode = 'custom'

  return {
    name: job?.name ?? draft?.name ?? '',
    prompt: job?.prompt ?? draft?.prompt ?? '',
    mode,
    recurrence: parsed ?? defaultRecurrence(),
    customCron: mode === 'custom' ? cronExpr : '',
    webhookMethod: job?.webhook_method ?? draft?.webhook_method ?? 'POST',
    webhookResponseMode: job?.webhook_response_mode ?? 'immediate'
  }
}

// The trigger half of the request the form sends to the server.
export function triggerParams(state: ScheduleFormState): Pick<
  AutomationJobParams,
  'trigger_type' | 'cron_expr' | 'run_at' | 'interval_seconds' | 'webhook_method' | 'webhook_response_mode'
> {
  if (state.mode === 'webhook') {
    return { trigger_type: 'webhook', webhook_method: state.webhookMethod, webhook_response_mode: state.webhookResponseMode }
  }
  if (state.mode === 'custom') return { trigger_type: 'cron', cron_expr: state.customCron.trim() }
  return recurrenceToJobFields({ ...state.recurrence, kind: state.mode })
}

export function isFormValid(state: ScheduleFormState): boolean {
  if (!state.name.trim() || !state.prompt.trim()) return false
  if (state.mode === 'custom') return state.customCron.trim().split(/\s+/).length === 5
  if (state.mode === 'interval') return state.recurrence.intervalMinutes >= MIN_INTERVAL_MINUTES
  return true
}
