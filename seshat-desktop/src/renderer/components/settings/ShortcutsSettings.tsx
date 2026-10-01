import { Panel } from './SettingsPrimitives'

const shortcutGroups = [
  {
    title: 'Navigation',
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
    items: [
      ['Send message', 'Enter'],
      ['New line', 'Shift Enter'],
      ['Attach file', 'Ctrl O'],
      ['Focus composer', 'Ctrl L']
    ]
  },
  {
    title: 'Desktop',
    items: [
      ['Open settings', 'Ctrl ,'],
      ['Open config', 'Ctrl Shift ,'],
      ['Close modal', 'Esc']
    ]
  }
]

export function ShortcutsSettings() {
  return (
    <Panel title="Shortcuts">
      <div className="max-w-[760px] space-y-5">
        {shortcutGroups.map((group) => (
          <section key={group.title}>
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{group.title}</h2>
            <div className="mt-3 overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
              {group.items.map(([label, keys]) => (
                <div key={label} className="flex min-h-[46px] items-center justify-between gap-6 border-b border-[var(--border-soft)] px-4 last:border-b-0">
                  <div className="text-[13px] font-semibold text-[var(--text-primary)]">{label}</div>
                  <kbd className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                    {keys}
                  </kbd>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Panel>
  )
}
