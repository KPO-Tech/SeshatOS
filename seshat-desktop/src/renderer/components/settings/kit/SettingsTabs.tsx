export type SettingsTab<T extends string> = { id: T; label: string }

export function SettingsTabs<T extends string>({ tabs, value, onChange }: { tabs: Array<SettingsTab<T>>; value: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-[var(--border-soft)]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={`-mb-px cursor-pointer border-0 border-b-2 bg-transparent px-4 py-2.5 text-[13px] font-medium ${value === tab.id ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
