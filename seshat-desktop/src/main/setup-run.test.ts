import { describe, expect, it } from 'vitest'
import { runTogether } from './setup-run'

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe('runTogether', () => {
  it('starts every task before any of them has finished', async () => {
    const started: string[] = []
    const finished: string[] = []
    const task = (id: string, ms: number) => ({
      id,
      run: async () => {
        started.push(id)
        await wait(ms)
        finished.push(id)
      }
    })
    await runTogether([task('slow', 60), task('quick', 5), task('middle', 30)], () => {})
    // All three began at the start, in the order given, and ended in the order of their length.
    expect(started).toEqual(['slow', 'quick', 'middle'])
    expect(finished).toEqual(['quick', 'middle', 'slow'])
  })

  it('takes about as long as the longest task, not as the sum of them', async () => {
    const begin = Date.now()
    await runTogether([40, 40, 40].map((ms, i) => ({ id: `t${i}`, run: () => wait(ms) })), () => {})
    expect(Date.now() - begin).toBeLessThan(100)
  })

  it('lets a task fail without stopping the others, and says which one', async () => {
    const errors: Array<[string, string]> = []
    let finishedOk = false
    await runTogether(
      [
        { id: 'broken', run: async () => { throw new Error('no network') } },
        { id: 'fine', run: async () => { await wait(10); finishedOk = true } }
      ],
      (id, error) => errors.push([id, (error as Error).message])
    )
    expect(errors).toEqual([['broken', 'no network']])
    expect(finishedOk).toBe(true)
  })

  it('resolves at once with nothing to do', async () => {
    await expect(runTogether([], () => {})).resolves.toBeUndefined()
  })
})
