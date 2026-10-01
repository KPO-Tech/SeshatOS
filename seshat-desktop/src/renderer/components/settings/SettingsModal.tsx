import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '@renderer/api/types'
import { applyTheme, getStoredTheme, notifyThemeChange, setStoredTheme, type ThemePreference } from '@renderer/lib/theme'
import { SettingsContent } from './SettingsContent'

export type SettingsSection = 'general' | 'account' | 'shortcuts' | 'memories' | 'usage' | 'data-controls' | 'about'

type Props = {
  user: User
  initialSection: SettingsSection
  onLogout: () => void
  onClose: () => void
}

const sections: Array<{ id: SettingsSection; label: string; icon: IconName; group: string }> = [
  { id: 'general', label: 'General', icon: 'sliders', group: 'Settings' },
  { id: 'account', label: 'Account', icon: 'user', group: 'Settings' },
  { id: 'shortcuts', label: 'Shortcuts', icon: 'keyboard', group: 'Settings' },
  { id: 'memories', label: 'Memories', icon: 'database', group: 'Settings' },
  { id: 'usage', label: 'Usage', icon: 'spark', group: 'Settings' },
  { id: 'data-controls', label: 'Data Controls', icon: 'shield', group: 'Settings' },
  { id: 'about', label: 'About', icon: 'info', group: 'SeshatOS' }
]

export function SettingsModal({ user, initialSection, onLogout, onClose }: Props) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection)
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme())
  const [language, setLanguage] = useState(() => window.localStorage.getItem('seshat.language') || 'English')
  const [notifications, setNotifications] = useState(true)
  const [soundAlert, setSoundAlert] = useState(true)
  const [productUpdates, setProductUpdates] = useState(false)
  const displayName = user.display_name || user.email
  const initials = useMemo(() => initialsFor(displayName), [displayName])

  useEffect(() => {
    applyTheme(theme)
    setStoredTheme(theme)
    notifyThemeChange(theme)
  }, [theme])

  useEffect(() => {
    function onThemeChange(event: Event) {
      const nextTheme = (event as CustomEvent<{ theme?: ThemePreference }>).detail?.theme
      if (nextTheme === 'light' || nextTheme === 'dark' || nextTheme === 'auto') setTheme(nextTheme)
    }

    window.addEventListener('seshat-theme-change', onThemeChange)
    return () => window.removeEventListener('seshat-theme-change', onThemeChange)
  }, [])

  const updateLanguage = (nextLanguage: string) => {
    setLanguage(nextLanguage)
    window.localStorage.setItem('seshat.language', nextLanguage)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-8 py-8 backdrop-blur-sm">
      <div className="relative flex h-full max-h-[720px] w-full max-w-[1240px] overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-root)] shadow-[0_26px_90px_rgba(0,0,0,0.45)]">
        <aside className="no-scrollbar w-[220px] shrink-0 overflow-y-auto border-r border-[var(--border-soft)] bg-[var(--surface-sidebar)] p-2.5">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-primary)] text-[11px] font-bold text-white">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{displayName}</div>
              <div className="text-[11px] text-[var(--text-muted)]">Local workspace</div>
            </div>
          </div>

          <nav className="mt-3 space-y-3">
            {groupedSections().map(([group, items]) => (
              <div key={group}>
                <div className="mb-1 px-3 text-[11px] font-medium text-[var(--text-muted)]">{group}</div>
                <div className="grid gap-1">
                  {items.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setActiveSection(section.id)}
                      className={[
                        'flex h-8 items-center gap-2.5 rounded-md px-3 text-left text-[12px] font-semibold transition-colors',
                        activeSection === section.id
                          ? 'bg-[var(--surface-panel)] text-[var(--text-primary)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
                      ].join(' ')}
                    >
                      <Icon name={section.icon} />
                      <span className="truncate">{section.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <section className="no-scrollbar min-w-0 flex-1 overflow-y-auto px-12 py-9">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-5 top-5 flex size-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
            aria-label="Close settings"
          >
            <CloseIcon />
          </button>

          <div className="mx-auto max-w-[920px]">
            <SettingsContent
              section={activeSection}
              user={user}
              displayName={displayName}
              theme={theme}
              language={language}
              notifications={notifications}
              soundAlert={soundAlert}
              productUpdates={productUpdates}
              onLogout={onLogout}
              onThemeChange={setTheme}
              onLanguageChange={updateLanguage}
              onNotificationsChange={setNotifications}
              onSoundAlertChange={setSoundAlert}
              onProductUpdatesChange={setProductUpdates}
            />
          </div>
        </section>
      </div>
    </div>
  )
}

function groupedSections() {
  const groups = new Map<string, typeof sections>()
  sections.forEach((section) => {
    const items = groups.get(section.group) || []
    items.push(section)
    groups.set(section.group, items)
  })
  return Array.from(groups.entries())
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

type IconName = 'sliders' | 'user' | 'keyboard' | 'grid' | 'connectors' | 'spark' | 'store' | 'database' | 'shield' | 'info' | 'help' | 'search' | 'sun' | 'moon' | 'contrast'

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    sliders: <path d="M4 7h12M4 13h12M7 5.5v3M13 11.5v3" />,
    user: <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 14a5.5 5.5 0 0 1 11 0" />,
    keyboard: <path d="M2.5 4.5h11v7h-11ZM4.5 6.5h.01M6.8 6.5h.01M9.1 6.5h.01M11.4 6.5h.01M4.5 9.4h7" />,
    grid: <path d="M3 3h4v4H3ZM9 3h4v4H9ZM3 9h4v4H3ZM9 9h4v4H9Z" />,
    connectors: <path d="M5 4v8M11 4v8M3.5 6h3M9.5 10h3M5 12h6" />,
    spark: <path d="M8 1.5v4M8 10.5v4M1.5 8h4M10.5 8h4M3 3l2.8 2.8M10.2 10.2 13 13M13 3l-2.8 2.8M5.8 10.2 3 13" />,
    store: <path d="M2.5 7h11M4 7l1-4h6l1 4M4 7v6h8V7M6.5 13v-3h3v3" />,
    database: <path d="M3 4c0-1.1 2.2-2 5-2s5 .9 5 2-2.2 2-5 2-5-.9-5-2ZM3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" />,
    shield: <path d="M8 2.5 13 4.3v3.8c0 3-2 5.1-5 6-3-1-5-3-5-6V4.3L8 2.5ZM6 8l1.4 1.4L10.5 6" />,
    info: <path d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM8 7.5V11M8 5h.01" />,
    help: <path d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM6.5 6a1.7 1.7 0 1 1 2.5 1.5c-.7.4-1 .8-1 1.5M8 11h.01" />,
    search: <><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></>,
    sun: <path d="M8 4.5v-2M8 13.5v-2M4.5 8h-2M13.5 8h-2M5.2 5.2 3.8 3.8M12.2 12.2l-1.4-1.4M10.8 5.2l1.4-1.4M3.8 12.2l1.4-1.4M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />,
    moon: <path d="M12.5 10.2A5 5 0 0 1 5.8 3.5 5.5 5.5 0 1 0 12.5 10.2Z" />,
    contrast: <path d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM8 2v12" />
  }

  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <path d="M5 5 13 13" />
      <path d="M13 5 5 13" />
    </svg>
  )
}
