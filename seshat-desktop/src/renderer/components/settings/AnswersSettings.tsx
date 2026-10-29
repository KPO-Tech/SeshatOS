import { useUserPreferences } from '@renderer/hooks/useUserPreferences'
import { ToggleRow } from './SettingsPrimitives'

export function AnswersSettings() {
  const { prefs, busy, error, save } = useUserPreferences()

  return (
    <section>
      <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Answers</h2>
      <div className="mt-4 grid gap-4">
        <ToggleRow
          title="Rich answers"
          description="Let the agent show comparisons, figures and step lists as drawn components instead of plain text. Takes effect on the next message."
          enabled={prefs?.rich_answers_enabled !== false}
          onChange={(enabled) => {
            if (!busy) void save({ rich_answers_enabled: enabled })
          }}
        />
        {error && <div className="text-[12px] text-[var(--accent-danger)]">{error}</div>}
      </div>
    </section>
  )
}
