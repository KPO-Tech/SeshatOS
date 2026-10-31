import { useEffect, useState, type ReactNode } from 'react'
import { Down, Logout, SettingTwo, Shield } from '@icon-park/react'
import { SeshatLogo } from '@renderer/components/brand/SeshatLogo'
import { useAuth } from '@renderer/hooks/useAuth'
import { useSettingsMenu } from '@renderer/hooks/useSettingsMenu'
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
