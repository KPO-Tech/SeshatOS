import { Computer, Message, Navigation } from '@icon-park/react'
import { SettingRow, SettingsCard, SettingsPage } from './kit'

const shortcutGroups = [
  {
    title: 'Navigation',
    icon: Navigation,
    items: [
      ['Toggle sidebar', 'Ctrl B'],
      ['Search', 'Ctrl K'],
      ['Go home', 'Alt Home'],
      ['Go back', 'Alt Left'],
      ['Go forward', 'Alt Right']
    ]
  },
  {
    title: 'Chat',
    icon: Message,
    items: [
      ['Send message', 'Enter'],
      ['New line', 'Shift Enter'],
      ['Attach file', 'Ctrl O'],
      ['Focus composer', 'Ctrl L']
    ]
  },
  {
    title: 'Desktop',
    icon: Computer,
    items: [
      ['Open settings', 'Ctrl ,'],
      ['Open config', 'Ctrl Shift ,'],
      ['Close modal', 'Esc']
    ]
  }
]

export function ShortcutsSettings() {
  return (
    <SettingsPage id="shortcuts">
      {shortcutGroups.map(({ title, icon: Glyph, items }) => (
        <SettingsCard key={title} title={title} icon={<Glyph theme="outline" size={16} />}>
          {items.map(([label, keys]) => (
            <SettingRow key={label} title={label}>
              <kbd className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-2 py-1 font-sans text-[11px] font-semibold text-[var(--text-secondary)]">{keys}</kbd>
            </SettingRow>
          ))}
        </SettingsCard>
      ))}
    </SettingsPage>
  )
}
