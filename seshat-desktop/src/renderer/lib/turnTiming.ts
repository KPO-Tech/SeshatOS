/** How long a turn took, as the person at the keyboard felt it: to the first thing the model wrote, and to the end. */
export type TurnTiming = {
  /** Milliseconds from sending to the first text, reasoning or tool call. Null when the turn produced none. */
  ttftMs: number | null
  durationMs: number
}

export type TurnTimer = {
  markFirstOutput: () => void
  finish: () => TurnTiming
}

export function createTurnTimer(now: () => number = () => performance.now()): TurnTimer {
  const start = now()
  let firstOutput: number | null = null
  return {
    markFirstOutput() {
      if (firstOutput === null) firstOutput = now()
    },
    finish() {
      return {
        ttftMs: firstOutput === null ? null : Math.round(firstOutput - start),
        durationMs: Math.round(now() - start),
      }
    },
  }
}

/** 850 gives "850 ms", 4200 gives "4.2 s", 75000 gives "1 min 15 s". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${Number(seconds.toFixed(1))} s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes} min ${Math.round(seconds - minutes * 60)} s`
}
