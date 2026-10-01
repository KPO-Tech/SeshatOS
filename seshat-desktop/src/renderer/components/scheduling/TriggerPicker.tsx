import { MIN_INTERVAL_MINUTES, WEEKDAY_LABELS, type SimpleRecurrence } from './scheduleRecurrence'
import { inputClass, selectClass } from './scheduleFormParts'
import type { ScheduleMode } from './scheduleFormState'

const MODE_OPTIONS: { id: ScheduleMode; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'once', label: 'Once' },
  { id: 'interval', label: 'Every…' },
  { id: 'webhook', label: 'Webhook' }
]

type Props = {
  mode: ScheduleMode
  onModeChange: (mode: ScheduleMode) => void
  recurrence: SimpleRecurrence
  onRecurrenceChange: (update: (current: SimpleRecurrence) => SimpleRecurrence) => void
  customCron: string
  onCustomCronChange: (value: string) => void
}

// The "when does this run" control: a mode selector plus the inputs that mode
// needs. Webhook has no inputs here, its fields live in WebhookFields.
export function TriggerPicker({ mode, onModeChange, recurrence, onRecurrenceChange, customCron, onCustomCronChange }: Props) {
  if (mode === 'custom') {
    return (
      <div className="grid gap-1.5">
        <input value={customCron} onChange={(event) => onCustomCronChange(event.target.value)} placeholder="* * * * *" className={`${inputClass} font-mono`} />
        <p className="text-[11px] text-[var(--text-muted)]">Custom cron expression. Edit it as raw cron, or pick one of the options below to replace it.</p>
        <ModeButtons mode={mode} onModeChange={onModeChange} />
      </div>
    )
  }

  return (
    <>
      <ModeButtons mode={mode} onModeChange={onModeChange} />

      {mode !== 'webhook' && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {mode === 'once' && (
            <input
              type="datetime-local"
              value={recurrence.runAt}
              onChange={(event) => onRecurrenceChange((current) => ({ ...current, runAt: event.target.value }))}
              className={`${inputClass} col-span-2`}
            />
          )}
          {mode === 'interval' && (
            <label className="col-span-2 flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
              Run every
              <input
                type="number"
                min={MIN_INTERVAL_MINUTES}
                value={recurrence.intervalMinutes}
                onChange={(event) => onRecurrenceChange((current) => ({ ...current, intervalMinutes: Number(event.target.value) }))}
                className={`${inputClass} w-24`}
              />
              minutes
            </label>
          )}
          {(mode === 'daily' || mode === 'weekly' || mode === 'monthly') && (
            <>
              {mode === 'weekly' && (
                <select value={recurrence.weekday} onChange={(event) => onRecurrenceChange((current) => ({ ...current, weekday: Number(event.target.value) }))} className={selectClass}>
                  {WEEKDAY_LABELS.map((label, index) => <option key={label} value={index}>{label}</option>)}
                </select>
              )}
              {mode === 'monthly' && (
                <select value={recurrence.dayOfMonth} onChange={(event) => onRecurrenceChange((current) => ({ ...current, dayOfMonth: Number(event.target.value) }))} className={selectClass}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => <option key={day} value={day}>Day {day}</option>)}
                </select>
              )}
              <input
                type="time"
                value={recurrence.time}
                onChange={(event) => onRecurrenceChange((current) => ({ ...current, time: event.target.value }))}
                className={[inputClass, mode === 'daily' ? 'col-span-2' : ''].join(' ')}
              />
            </>
          )}
        </div>
      )}
    </>
  )
}

function ModeButtons({ mode, onModeChange }: { mode: ScheduleMode; onModeChange: (mode: ScheduleMode) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {MODE_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onModeChange(option.id)}
          className={[
            'h-9 rounded-lg border text-[12.5px] font-semibold transition-colors',
            mode === option.id
              ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)] text-[var(--accent-primary)]'
              : 'border-[var(--border-soft)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]'
          ].join(' ')}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
