import { useUserPreferences } from '@renderer/hooks/useUserPreferences'
import { ConfigCard, ToggleSwitch } from '../knowledge/KnowledgePrimitives'

export function AnswersConfig() {
  const { prefs, busy, error, save } = useUserPreferences()

  return (
    <div className="grid gap-5">
      <ConfigCard
        title="Rich answers"
        description="Let the agent show comparisons, figures and step lists as drawn components instead of plain text. Takes effect on the next message."
      >
        <div className="flex items-center justify-between gap-6">
          <div className="text-[13px] text-[var(--text-secondary)]">Draw tables, figures and steps in answers</div>
          <ToggleSwitch
            enabled={prefs?.rich_answers_enabled !== false}
            onChange={(enabled) => {
              if (!busy) void save({ rich_answers_enabled: enabled })
            }}
          />
        </div>
        {error && <div className="mt-3 text-[12px] text-[var(--accent-danger)]">{error}</div>}
      </ConfigCard>
    </div>
  )
}
