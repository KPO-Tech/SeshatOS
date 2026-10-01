export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

// Shared 28x28 icon-button look for the footer's tool row (attach, project,
// corpus, mic - not the circular "+" or the send/stop buttons, which each
// have their own distinct shape).
export const NOTICE_CSS = 'flex items-center justify-start gap-2 rounded-app-md border border-[rgba(var(--color-error-rgb),0.16)] bg-[rgba(var(--color-error-rgb),0.08)] px-2 py-1.5 text-[11px] leading-[1.4] text-app-error'

export const TOOL_ICON_CSS = 'flex h-7 w-7 items-center justify-center rounded-[7px] border-0 bg-transparent p-0 text-app-text-muted transition-colors duration-150 hover:bg-[var(--color-hover)] hover:text-app-text-secondary disabled:cursor-progress disabled:opacity-55'
