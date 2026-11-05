import { useState } from 'react'
import { ActionButton, SettingRow, SettingsCard, TextField } from '../../settings/kit'
import { useTranslation } from 'react-i18next'

/**
 * What the project sandbox keeps from commands. The list is the user's to change, so it is shown in full.
 * Taking a path off gives commands their access back at once.
 */
export function ProtectedFolders({
  paths,
  busy,
  onChange
}: {
  paths: string[]
  busy: boolean
  onChange: (next: string[]) => void
}) {
  const { t } = useTranslation('config')
  const [draft, setDraft] = useState('')

  function add() {
    const path = draft.trim()
    if (!path) return
    onChange([...paths, path])
    setDraft('')
  }

  return (
    <SettingsCard title={t('environment.protectedFolders.keptFromCommands')}>
      <SettingRow title={t('environment.protectedFolders.addAFileOrFolder')} hint={t('environment.protectedFolders.commandsCannotReadWhatIs')}>
        <div className="flex items-center gap-2">
          <TextField label={t('environment.protectedFolders.pathToProtect')} value={draft} onChange={setDraft} placeholder={t('environment.protectedFolders.cUsersYouSecrets')} mono />
          <ActionButton type="button" onClick={add} disabled={busy || !draft.trim()}>
            {t('environment.protectedFolders.add')}
          </ActionButton>
        </div>
      </SettingRow>
      {paths.map((path) => (
        <div key={path} className="flex items-center justify-between gap-3 px-4 py-2">
          <span className="min-w-0 truncate font-mono text-[11px] text-[var(--text-muted)]" title={path}>
            {path}
          </span>
          <ActionButton type="button" onClick={() => onChange(paths.filter((item) => item !== path))} disabled={busy}>
            {t('environment.protectedFolders.remove')}
          </ActionButton>
        </div>
      ))}
    </SettingsCard>
  )
}
