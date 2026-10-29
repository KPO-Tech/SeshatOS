import { ChevronDownIcon, Panel, Row, SectionDivider, ToggleRow } from './SettingsPrimitives'

type Props = {
  language: string
  notifications: boolean
  soundAlert: boolean
  productUpdates: boolean
  onLanguageChange: (language: string) => void
  onNotificationsChange: (enabled: boolean) => void
  onSoundAlertChange: (enabled: boolean) => void
  onProductUpdatesChange: (enabled: boolean) => void
}

export function GeneralSettings({
  language,
  notifications,
  soundAlert,
  productUpdates,
  onLanguageChange,
  onNotificationsChange,
  onSoundAlertChange,
  onProductUpdatesChange
}: Props) {
  return (
    <Panel title="General">
      <div className="space-y-6">
        <section>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Language</h2>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => onLanguageChange(language === 'English' ? 'Francais' : 'English')}
              className="flex h-9 w-[240px] items-center justify-between rounded-md bg-[var(--surface-panel)] px-3.5 text-[13px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
            >
              {language}
              <ChevronDownIcon />
            </button>
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
