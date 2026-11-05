import { Computer, Message, Navigation } from '@icon-park/react'
import { useTranslation } from 'react-i18next'
import { SettingRow, SettingsCard, SettingsPage } from './kit'

const shortcutGroups = [
  {
    title: 'settings:shortcuts.groups.navigation',
    icon: Navigation,
    items: [
      ['settings:shortcuts.items.toggleSidebar', 'Ctrl B'],
      ['settings:shortcuts.items.search', 'Ctrl K'],
      ['settings:shortcuts.items.goHome', 'Alt Home'],
      ['settings:shortcuts.items.goBack', 'Alt Left'],
      ['settings:shortcuts.items.goForward', 'Alt Right']
    ]
  },
  {
    title: 'settings:shortcuts.groups.chat',
    icon: Message,
    items: [
      ['settings:shortcuts.items.sendMessage', 'Enter'],
      ['settings:shortcuts.items.newLine', 'Shift Enter'],
      ['settings:shortcuts.items.attachFile', 'Ctrl O'],
      ['settings:shortcuts.items.focusComposer', 'Ctrl L']
    ]
  },
  {
    title: 'settings:shortcuts.groups.desktop',
    icon: Computer,
    items: [
      ['settings:shortcuts.items.openSettings', 'Ctrl ,'],
      ['settings:shortcuts.items.openConfig', 'Ctrl Shift ,'],
      ['settings:shortcuts.items.closeModal', 'Esc']
    ]
  }
]

export function ShortcutsSettings() {
  const { t } = useTranslation('settings')
  return (
    <SettingsPage id="shortcuts">
      {shortcutGroups.map(({ title, icon: Glyph, items }) => (
        <SettingsCard key={title} title={t(title)} icon={<Glyph theme="outline" size={16} />}>
          {items.map(([label, keys]) => (
            <SettingRow key={label} title={t(label)}>
              <kbd className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-2 py-1 font-sans text-[11px] font-semibold text-[var(--text-secondary)]">{keys}</kbd>
            </SettingRow>
          ))}
        </SettingsCard>
      ))}
    </SettingsPage>
  )
}
