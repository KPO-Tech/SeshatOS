import type { ThemePreference } from '@renderer/lib/theme'
import { ChevronDownIcon, Panel, Row, SectionDivider, SettingsIcon, ToggleRow, type SettingsIconName } from './SettingsPrimitives'

type Props = {
  theme: ThemePreference
  language: string
  notifications: boolean
  soundAlert: boolean
  productUpdates: boolean
  onThemeChange: (theme: ThemePreference) => void
  onLanguageChange: (language: string) => void
  onNotificationsChange: (enabled: boolean) => void
  onSoundAlertChange: (enabled: boolean) => void
  onProductUpdatesChange: (enabled: boolean) => void
}

const themeOptions: Array<{ value: ThemePreference; label: string; icon: SettingsIconName }> = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'auto', label: 'Auto', icon: 'contrast' }
]

export function GeneralSettings({
  theme,
  language,
  notifications,
  soundAlert,
  productUpdates,
  onThemeChange,
  onLanguageChange,
  onNotificationsChange,
  onSoundAlertChange,
  onProductUpdatesChange
}: Props) {
  return (
    <Panel title="General">
      <div className="space-y-6">
        <section>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Appearance</h2>
          <div className="mt-4">
            <div className="text-[13px] font-semibold text-[var(--text-secondary)]">Language</div>
            <button
              type="button"
              onClick={() => onLanguageChange(language === 'English' ? 'Francais' : 'English')}
              className="mt-2 flex h-9 w-[240px] items-center justify-between rounded-md bg-[var(--surface-panel)] px-3.5 text-[13px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
            >
              {language}
              <ChevronDownIcon />
            </button>
          </div>

          <div className="mt-6">
            <div className="text-[13px] font-semibold text-[var(--text-secondary)]">Theme</div>
            <div className="mt-2 grid w-[390px] grid-cols-3 gap-2">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onThemeChange(option.value)}
                  className={[
                    'flex h-16 flex-col items-center justify-center gap-1.5 rounded-lg border text-[12px] font-semibold',
                    theme === option.value
                      ? 'border-[var(--text-primary)] bg-transparent text-[var(--text-primary)]'
                      : 'border-[var(--border-soft)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]'
                  ].join(' ')}
                  aria-pressed={theme === option.value}
                >
                  <SettingsIcon name={option.icon} />
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <SectionDivider />

        <section>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Communication preferences</h2>
          <div className="mt-4 grid gap-4">
            <ToggleRow title="Desktop notifications" description="Get notified when a task progresses or finishes." enabled={notifications} onChange={onNotificationsChange} />
            <ToggleRow title="Sound alert" description="Play a short sound when a background task completes." enabled={soundAlert} onChange={onSoundAlertChange} />
            <ToggleRow title="Product updates" description="Receive release notes and workspace improvements." enabled={productUpdates} onChange={onProductUpdatesChange} />
          </div>
        </section>

        <SectionDivider />

        <Row title="Local data" description="Manage cached sessions, logs, and local workspace files." action="Manage" />
      </div>
    </Panel>
  )
}
