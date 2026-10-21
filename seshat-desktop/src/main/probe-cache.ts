/**
 * Remembers the answer of a probe that is costly or visible to run, and never runs two at once.
 *
 * The confinement probe really starts a sandboxed command. On Windows that opens a console for it, and with Windows Terminal as the
 * default terminal that is a window flashing on the user's screen: the answer is kept for the run, and asking again is an explicit act.
 */
export function createProbeCache<T>(probe: () => Promise<T>) {
  let value: T | null = null
  let inFlight: Promise<T> | null = null

  return {
    /** The answer already known, without running the probe. */
    peek(): T | null {
      return value
    },
    /** The known answer, or the probe's when none is known yet (or when `refresh` asks for a new one). Concurrent calls share one probe. */
    get(refresh = false): Promise<T> {
      if (!refresh && value !== null) return Promise.resolve(value)
      if (inFlight) return inFlight
      inFlight = probe()
        .then((next) => {
          value = next
          return next
        })
        .finally(() => {
          inFlight = null
        })
      return inFlight
    },
    /** Replaces the known answer, for a change that is known to have altered it. */
    set(next: T) {
      value = next
    }
  }
}
