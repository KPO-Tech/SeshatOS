import { useEffect, useState } from 'react'
import { Info } from '@icon-park/react'
import { timeLeft } from './fileStatus'

/** Shown while the embedding provider refuses for quota: the queue waits by itself, and no document is marked as failed. */
export function QuotaPausedNotice({ message, until }: { message: string; until: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (until <= 0) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [until])
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-xl border border-app-border-subtle bg-[var(--surface-hover)] px-3.5 py-2.5 text-[12.5px] leading-[19px] text-[var(--text-secondary)]">
      <Info size={15} className="mt-px shrink-0 text-[var(--accent-primary)]" />
      <span>
        Indexing is paused: {message}
        {until > now && ` Back in ${timeLeft(until, now)}.`}
      </span>
    </div>
  )
}
