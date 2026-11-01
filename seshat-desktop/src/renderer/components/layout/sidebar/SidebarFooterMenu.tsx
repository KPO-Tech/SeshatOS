import { useEffect, useState, type ReactNode } from 'react'
import { Down, Logout, Magic, SettingTwo, Shield } from '@icon-park/react'
import { SeshatLogo } from '@renderer/components/brand/SeshatLogo'
import { useAuth } from '@renderer/hooks/useAuth'
import { useSettingsMenu } from '@renderer/hooks/useSettingsMenu'
import { useUserPreferences } from '@renderer/hooks/useUserPreferences'
import { edition } from '@renderer/lib/edition'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

// Bottom-of-sidebar menu: Settings, Admin (organization accounts)
// and Sign out.
export function SidebarFooterMenu({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false)
  const { isAdmin, connected, go } = useSettingsMenu()
  const { user, logout } = useAuth()
  const { prefs, busy, save } = useUserPreferences()
  // The switch answers at once; the preference is saved behind it.
  const [generativeUi, setGenerativeUi] = useState<boolean | null>(null)
  const generativeOn = generativeUi ?? prefs?.rich_answers_enabled !== false

  function toggleGenerativeUi() {
    if (busy || !prefs) return
    const next = !generativeOn
    setGenerativeUi(next)
    void save({ rich_answers_enabled: next }).finally(() => setGenerativeUi(null))
  }

  useEffect(() => {
    function closeMenu(event: MouseEvent) {
      if ((event.target as HTMLElement | null)?.closest('.sb-console-wrap')) return
      setOpen(false)
    }
    document.addEventListener('mousedown', closeMenu)
    return () => document.removeEventListener('mousedown', closeMenu)
  }, [])

  function pick(action: () => void) {
    setOpen(false)
    action()
  }

  return (
    <div className="mt-3 border-t border-[var(--border-soft)] px-2.5 pb-4 pt-2.5">
      <div className="sb-console-wrap relative min-w-0">
        <button
          className={cx(
            'flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-2 py-1.5 text-[13px] font-bold text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
            collapsed ? 'mx-auto w-9 justify-center' : 'w-full',
            open && 'bg-[var(--surface-hover)] text-[var(--text-primary)]'
          )}
          onClick={() => setOpen((value) => !value)}
          aria-label={collapsed ? 'Seshat menu' : undefined}
          aria-expanded={open}
          aria-haspopup="menu"
          type="button"
        >
          <SeshatLogo size={collapsed ? 22 : 18} />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">{edition.accounts ? user?.display_name || 'SeshatOS' : 'SeshatOS'}</span>
              <Down size={12} />
            </>
          )}
        </button>

        {open && (
          <div
            className={cx(
              'absolute bottom-[calc(100%+10px)] left-0 z-50 flex min-w-[190px] flex-col gap-0.5 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-menu)] p-1.5 shadow-[0_16px_34px_rgba(0,0,0,0.28)]',
              collapsed && 'bottom-[calc(100%+8px)] min-w-[164px]'
            )}
            role="menu"
          >
            <MenuButton icon={<SettingTwo theme="outline" size={14} />} label="Settings" onClick={() => pick(() => go('settings'))} />
            <MenuSwitch icon={<Magic theme="outline" size={14} />} label="Generative UI" hint="Tables, figures and steps drawn in answers. From the next message." on={generativeOn} disabled={busy || !prefs} onClick={toggleGenerativeUi} />
            {edition.cloud && connected && <MenuButton icon={<Shield theme="outline" size={14} />} label="Admin" disabled={!isAdmin} onClick={() => pick(() => go('admin'))} />}
            {edition.accounts && (
              <>
                <div className="my-0.5 h-px bg-[var(--border-soft)]" aria-hidden="true" />
                <MenuButton icon={<Logout theme="outline" size={14} />} label="Sign out" disabled={!connected} onClick={() => pick(() => void logout())} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MenuButton({ icon, label, disabled, onClick }: { icon: ReactNode; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      className="flex w-full cursor-pointer items-center gap-2 whitespace-nowrap rounded-[7px] border-0 bg-transparent px-[9px] py-2 text-left text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent"
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

/** A menu line that turns something on or off without closing the menu. */
function MenuSwitch({ icon, label, hint, on, disabled, onClick }: { icon: ReactNode; label: string; hint?: string; on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      className="flex w-full cursor-pointer items-center gap-2 whitespace-nowrap rounded-[7px] border-0 bg-transparent px-[9px] py-2 text-left text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent"
      type="button"
      role="menuitemcheckbox"
      aria-checked={on}
      title={hint}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      <span className="flex-1">{label}</span>
      <span className={cx('relative h-[14px] w-[26px] shrink-0 rounded-full transition-colors duration-150', on ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-strong)]')} aria-hidden="true">
        <span className={cx('absolute top-[2px] size-[10px] rounded-full bg-white transition-[left] duration-150', on ? 'left-[14px]' : 'left-[2px]')} />
      </span>
    </button>
  )
}
