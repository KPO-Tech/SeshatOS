import type { ReactNode } from 'react'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

type Props = {
  icon: ReactNode
  label: string
  shortcut?: string
  collapsed: boolean
  active?: boolean
  onClick: () => void
}

export function SidebarItem({ icon, label, shortcut, collapsed, active, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex w-full cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border-0 bg-transparent px-2.5 py-1.5 text-[13px] font-semibold text-[var(--text-secondary)] transition duration-100 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
        collapsed && 'mx-auto w-9 justify-center px-0 py-2',
        active && 'bg-[var(--accent-subtle)] text-[var(--accent-primary)] hover:bg-[var(--accent-subtle)] hover:text-[var(--accent-primary)]'
      )}
      aria-label={collapsed ? label : undefined}
    >
      <span className={cx('flex shrink-0 items-center text-[var(--text-muted)]', active && 'text-[var(--accent-primary)]')}>{icon}</span>
      {!collapsed && (
        <>
          <span className={cx('min-w-0 flex-1 overflow-hidden text-ellipsis text-left', active && 'text-[var(--accent-primary)]')}>{label}</span>
          {shortcut && (
            <span className="rounded-[4px] bg-[var(--border-soft)] px-[5px] py-px text-[10px] font-bold text-[var(--text-muted)]">{shortcut}</span>
          )}
        </>
      )}
    </button>
  )
}
