import { useCallback, useEffect, useState } from 'react'
import { defaultChoices, type Choices, type SetupComponentId } from './setupFormat'

export type ItemProgress = { status: 'waiting' | 'running' | 'done' | 'error'; receivedBytes: number; totalBytes: number; message?: string }
export type Progress = Partial<Record<SetupComponentId, ItemProgress>>

// Whether the first-run setup is still to do, the plan the main process offers, what the person ticked, and the run itself.
export function useSetup() {
  const bridge = window.seshat?.setup
  const [checking, setChecking] = useState(Boolean(bridge))
  const [needed, setNeeded] = useState(false)
  const [plan, setPlan] = useState<SetupPlan | null>(null)
  const [choices, setChoices] = useState<Choices>({})
  const [progress, setProgress] = useState<Progress>({})
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!bridge) return
    let cancelled = false
    void (async () => {
      try {
        const { completed } = await bridge.state()
        if (cancelled || completed) return
        const next = await bridge.plan()
        if (cancelled) return
        setPlan(next)
        setChoices(defaultChoices(next))
        setNeeded(true)
      } catch {
        // The setup is an offer: if it cannot be read, the app opens as it is.
      } finally {
        if (!cancelled) setChecking(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bridge])

  const run = useCallback(
    async (selection: Choices) => {
      if (!bridge) return
      const chosen = (['title', 'speech', 'ocr'] as const).filter((id) => selection[id]?.install)
      setProgress(Object.fromEntries(chosen.map((id) => [id, { status: 'waiting', receivedBytes: 0, totalBytes: 0 }])))
      setRunning(true)
      const stop = bridge.onProgress((event) => {
        setProgress((current) => ({
          ...current,
          [event.component]: {
            status: event.status,
            receivedBytes: event.receivedBytes ?? current[event.component]?.receivedBytes ?? 0,
            totalBytes: event.totalBytes ?? current[event.component]?.totalBytes ?? 0,
            message: event.message
          }
        }))
      })
      try {
        await bridge.run(selection)
      } finally {
        stop()
        setRunning(false)
      }
    },
    [bridge]
  )

  const finish = useCallback(async () => {
    await bridge?.complete().catch(() => {})
    setNeeded(false)
  }, [bridge])

  return { checking, needed, plan, choices, setChoices, progress, running, run, finish }
}
