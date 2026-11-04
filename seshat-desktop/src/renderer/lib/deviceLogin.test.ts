import { describe, expect, it } from 'vitest'
import {
  MAX_CONSECUTIVE_POLL_FAILURES,
  SLOW_DOWN_STEP_SECONDS,
  waitForDeviceApproval,
  type DevicePollStatus
} from './deviceLogin'

// A fake clock: sleeping advances it, nothing waits for real.
function harness(answers: Array<DevicePollStatus | Error>, options: { interval?: number; expiresIn?: number; cancelAfterPolls?: number } = {}) {
  let clock = 0
  const sleeps: number[] = []
  let polls = 0
  let cancelled = false
  const result = waitForDeviceApproval({
    poll: async () => {
      const answer = answers[Math.min(polls, answers.length - 1)]
      polls += 1
      if (options.cancelAfterPolls !== undefined && polls >= options.cancelAfterPolls) cancelled = true
      if (answer instanceof Error) throw answer
      return answer
    },
    intervalSeconds: options.interval ?? 5,
    expiresInSeconds: options.expiresIn ?? 600,
    sleep: async (ms) => {
      sleeps.push(ms)
      clock += ms
    },
    now: () => clock,
    isCancelled: () => cancelled
  })
  return { result, sleeps, polls: () => polls }
}

describe('waitForDeviceApproval', () => {
  it('keeps polling at the server interval until the person approves', async () => {
    const run = harness(['pending', 'pending', 'approved'])
    await expect(run.result).resolves.toBe('approved')
    expect(run.sleeps).toEqual([5000, 5000, 5000])
    expect(run.polls()).toBe(3)
  })

  it('stops on a refusal and on an expiry reported by the server', async () => {
    await expect(harness(['pending', 'denied']).result).resolves.toBe('denied')
    await expect(harness(['expired']).result).resolves.toBe('expired')
  })

  it('slows down for good when the server says so', async () => {
    const run = harness(['slow_down', 'pending', 'approved'])
    await expect(run.result).resolves.toBe('approved')
    expect(run.sleeps).toEqual([5000, (5 + SLOW_DOWN_STEP_SECONDS) * 1000, (5 + SLOW_DOWN_STEP_SECONDS) * 1000])
  })

  it('gives up when the code runs out without an answer', async () => {
    const run = harness(['pending'], { interval: 5, expiresIn: 20 })
    await expect(run.result).resolves.toBe('expired')
    expect(run.polls()).toBeLessThanOrEqual(4)
  })

  it('stops waiting when cancelled, without a further poll', async () => {
    const run = harness(['pending'], { cancelAfterPolls: 2 })
    await expect(run.result).resolves.toBe('cancelled')
    expect(run.polls()).toBe(2)
  })

  it('retries a failed poll a couple of times, then passes the error on', async () => {
    const recovered = harness([new Error('busy'), new Error('busy'), 'approved'])
    await expect(recovered.result).resolves.toBe('approved')

    const dead = harness([new Error('backend down')])
    await expect(dead.result).rejects.toThrow('backend down')
    expect(dead.polls()).toBe(MAX_CONSECUTIVE_POLL_FAILURES)
  })

  it('counts only consecutive failures', async () => {
    const run = harness([new Error('x'), 'pending', new Error('x'), 'pending', new Error('x'), 'approved'])
    await expect(run.result).resolves.toBe('approved')
  })
})
