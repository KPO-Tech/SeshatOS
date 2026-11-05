// Waiting for a person to approve a sign-in code in their browser (RFC 8628, as served by seshat-server).
// The loop is a pure function of its inputs so that it can be tested without a clock or a server.

export type DevicePollStatus = 'pending' | 'slow_down' | 'approved' | 'denied' | 'expired'

export type DeviceWaitOutcome = 'approved' | 'denied' | 'expired' | 'cancelled'

export interface DeviceWaitOptions {
  /** Asks the backend whether the code was approved. Throws when the backend cannot be reached. */
  poll: () => Promise<DevicePollStatus>
  /** Seconds between two polls, as the server asked. */
  intervalSeconds: number
  /** Seconds the code stays valid. Waiting stops at that point. */
  expiresInSeconds: number
  /** Resolves after the given number of milliseconds. Injected so tests do not wait. */
  sleep: (ms: number) => Promise<void>
  /** Milliseconds since some fixed point. Injected for the same reason. */
  now: () => number
  isCancelled: () => boolean
}

/** What a poll that is told to slow down adds to the interval, as RFC 8628 asks. */
export const SLOW_DOWN_STEP_SECONDS = 5
/** Consecutive polls that may fail (backend busy, network blip) before the error is given up on. */
export const MAX_CONSECUTIVE_POLL_FAILURES = 3

/**
 * Polls until the person approves or refuses, the code expires, or the wait is cancelled. A server that
 * answers "slow down" gets a longer interval from then on. A poll that throws is retried a few times in a
 * row; beyond that the error is passed on, so a dead backend is not waited on for ten minutes.
 */
export async function waitForDeviceApproval(options: DeviceWaitOptions): Promise<DeviceWaitOutcome> {
  const startedAt = options.now()
  const deadline = startedAt + options.expiresInSeconds * 1000
  let intervalSeconds = Math.max(1, options.intervalSeconds)
  let failures = 0

  for (;;) {
    await options.sleep(intervalSeconds * 1000)
    if (options.isCancelled()) return 'cancelled'
    if (options.now() >= deadline) return 'expired'

    let status: DevicePollStatus
    try {
      status = await options.poll()
      failures = 0
    } catch (error) {
      failures += 1
      if (failures >= MAX_CONSECUTIVE_POLL_FAILURES) throw error
      continue
    }
    if (options.isCancelled()) return 'cancelled'

    switch (status) {
      case 'approved':
      case 'denied':
      case 'expired':
        return status
      case 'slow_down':
        intervalSeconds += SLOW_DOWN_STEP_SECONDS
        break
      case 'pending':
        break
    }
  }
}
