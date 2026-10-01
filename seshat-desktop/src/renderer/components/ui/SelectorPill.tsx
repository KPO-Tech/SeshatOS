import type { ReactNode } from 'react'
import { Down, CheckCorrect } from '@icon-park/react'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

// min-w is a snug default sized for short, label-only options (e.g. the
// permission mode menu's "Smart"/"Auto") - callers with longer labels or
// descriptions (e.g. ChatInput's model menu) widen it via their own
// className, since Tailwind can't shrink-to-fit content in a dropdown that
// also needs a floor width.
export const SELECTOR_MENU_CLASS =
  'absolute left-0 top-[calc(100%+6px)] z-30 flex max-h-[min(252px,calc(100vh-190px))] min-w-[140px] max-w-[min(320px,calc(100vw-32px))] flex-col gap-0 overflow-y-auto rounded-app-md border border-app-border-subtle bg-[color-mix(in_srgb,var(--color-surface)_96%,var(--color-bg))] p-1 shadow-[0_18px_48px_rgba(31,27,23,0.17)] [scrollbar-color:color-mix(in_srgb,var(--color-text-muted)_28%,transparent)_transparent] [scrollbar-width:thin]'

export const SELECTOR_MENU_ITEM_CLASS =
  'flex min-h-[30px] w-full min-w-0 cursor-pointer items-center justify-between gap-[7px] rounded-none border border-transparent bg-transparent px-[7px] py-1.5 text-left text-[var(--font-size-sm)] text-app-text hover:border-app-border-subtle hover:bg-[color-mix(in_srgb,var(--color-surface-elevated)_48%,var(--color-surface))] disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent'

export const SELECTOR_MENU_COPY_CLASS = 'min-w-0 flex-1 [&>span:first-child]:truncate'

type Props = {
  label: string
  icon?: ReactNode
  onClick?: () => void
  disabled?: boolean
  // True while this pill's own dropdown is open - keeps it visually engaged
  // even when the mouse isn't hovering it anymore (e.g. moved down into the
  // menu). Bare (no border/fill) at rest otherwise, so it reads as light as
  // the icon-only buttons next to it (attach, project, knowledge base).
  active?: boolean
  className?: string
}

export function SelectorPill({ label, icon, onClick, disabled = false, active = false, className }: Props) {
  return (
    <button
      className={cx(
        'flex max-w-[220px] cursor-pointer items-center gap-3 whitespace-nowrap rounded-app-md border px-4 py-2 transition-all duration-150 disabled:cursor-default disabled:opacity-70 disabled:hover:border-transparent disabled:hover:bg-transparent',
        active
          ? 'border-app-border bg-[var(--color-hover)]'
          : 'border-transparent bg-transparent hover:border-app-border-subtle hover:bg-app-surface',
        className,
      )}
      onClick={onClick}
      disabled={disabled}
      type="button"
    >
      {icon && <span className="flex items-center text-app-text-secondary">{icon}</span>}
      <span className="truncate text-[var(--font-size-xs)] font-medium text-app-text">{label}</span>
      <Down size={10} />
    </button>
  )
}

export type SelectorOption = {
  id: string
  label: string
  disabled?: boolean
  description?: string
  icon?: ReactNode
  prefix?: string
}

type SelectorMenuProps = {
  options: SelectorOption[]
  selectedId?: string | null
  onSelect: (id: string) => void
  align?: 'left' | 'right'
  // 'up' is for triggers near the bottom of the screen, e.g. ChatInput.
  placement?: 'down' | 'up'
  className?: string
}

export function SelectorMenu({
  options,
  selectedId,
  onSelect,
  align = 'left',
  placement = 'down',
  className,
}: SelectorMenuProps) {
  return (
    <div
      className={cx(
        SELECTOR_MENU_CLASS,
        align === 'right' && 'left-auto right-0',
        placement === 'up' && 'bottom-[calc(100%+6px)] top-auto',
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.id}
          className={cx(
            SELECTOR_MENU_ITEM_CLASS,
            option.id === selectedId &&
              'border-[color-mix(in_srgb,var(--color-primary)_22%,var(--color-border-subtle))] bg-[color-mix(in_srgb,var(--color-primary)_11%,var(--color-surface))] text-app-primary',
          )}
          disabled={option.disabled}
          onClick={() => !option.disabled && onSelect(option.id)}
          type="button"
        >
          <span
            className={cx(
              'flex size-[13px] shrink-0 items-center justify-center rounded-[3px] border',
              option.id === selectedId
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                : 'border-app-border-subtle bg-transparent',
            )}
            aria-hidden="true"
          >
            {option.id === selectedId && <CheckCorrect size={8} />}
          </span>
          {option.icon ? (
            <span className="inline-flex size-[17px] shrink-0 items-center justify-center rounded-none [&_svg]:block [&_svg]:size-[17px]" aria-hidden="true">
              {option.icon}
            </span>
          ) : option.prefix && (
            <span className="inline-flex size-[17px] shrink-0 items-center justify-center rounded-none border border-[color-mix(in_srgb,var(--color-primary)_20%,var(--color-border-subtle))] bg-[color-mix(in_srgb,var(--color-primary)_13%,var(--color-surface))] text-[8px] font-extrabold uppercase text-app-primary" aria-hidden="true">
              {option.prefix}
            </span>
          )}
          <span className={SELECTOR_MENU_COPY_CLASS}>
            <span>{option.label}</span>
          </span>
          {option.description && (
            <span className="max-w-[92px] shrink-0 truncate text-right text-[var(--font-size-2xs)] font-medium leading-none text-app-text-muted">
              {option.description}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
