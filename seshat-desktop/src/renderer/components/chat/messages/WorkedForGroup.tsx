import type { ReactNode } from 'react'
import { Down } from '@icon-park/react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@renderer/stores/ui'
import { formatThinkingDuration } from './thinkingTime'
import { useTurnDuration } from './useTurnDuration'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

type Props = {
  /** Identity of the turn in the conversation: keeps its open state and its measured time. */
  turnKey: string
  /** True while the turn still runs: its work stays open, since it is not behind us yet. */
  live?: boolean
  /** The steps of the turn, oldest first. */
  children: ReactNode
}

/**
 * Everything a turn did before its last message, behind one line: "Worked for
 * 2m 14s". A finished turn starts closed, because the answer is what the reader
 * came for; a turn still running stays open, because its work is the answer so
 * far.
 */
export function WorkedForGroup({ turnKey, live = false, children }: Props) {
  const { t } = useTranslation('chat')
  const stored = useUIStore((state) => state.turnExpansion[turnKey])
  const setTurnExpansion = useUIStore((state) => state.setTurnExpansion)
  const seconds = useTurnDuration(turnKey, live)
  const expanded = live ? true : stored ?? false

  function toggle() {
    setTurnExpansion(turnKey, !expanded)
  }

  return (
    <div className="flex flex-col">
      <div
        className="group inline-flex min-h-0 w-full cursor-pointer items-center gap-1.5 rounded px-1 py-1 text-left text-[12px] font-medium leading-snug text-app-text-secondary transition-colors duration-150 hover:text-app-text"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={t(expanded ? 'chat.messages.workedFor.hideSteps' : 'chat.messages.workedFor.showSteps')}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
      >
        <span className="flex-none">
          {seconds !== null
            ? t('chat.messages.workedFor.title', { duration: formatThinkingDuration(seconds) })
            : t('chat.messages.workedFor.titleNoDuration')}
        </span>
        <span className={cx('inline-flex shrink-0 items-center opacity-45 transition-transform duration-150', expanded && 'rotate-180')}>
          <Down size={10} />
        </span>
      </div>
      {expanded && (
        // The indent and the rule are what say "these belong to the turn above";
        // without them the steps read as separate messages of their own.
        <div className="mt-0.5 ml-[5px] flex flex-col gap-1.5 border-l border-[var(--border-subtle)] pl-3">
          {children}
        </div>
      )}
    </div>
  )
}
