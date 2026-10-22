import { useCallback, useEffect, useState } from 'react'
import type { WhisperModel, WhisperProgress, WhisperState } from './WhisperModels'

export type WhisperSettings = { threads: number | null; automaticThreads: number; cores: number }

// The local whisper server as the desktop's main process manages it: its state, its models, and the actions on them.
export function useWhisper() {
  const bridge = window.seshat?.whisper
  const [state, setState] = useState<WhisperState | null>(null)
  const [models, setModels] = useState<WhisperModel[]>([])
  const [settings, setSettings] = useState<WhisperSettings | null>(null)
  const [progress, setProgress] = useState<WhisperProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!bridge) return
    try {
      const [nextState, nextModels, nextSettings] = await Promise.all([bridge.status(), bridge.models(), bridge.getSettings()])
      setState(nextState)
      setModels(nextModels)
      setSettings(nextSettings)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not read the local speech engine.')
    }
  }, [bridge])

  useEffect(() => {
    void refresh()
    if (!bridge) return
    return bridge.onProgress(setProgress)
  }, [bridge, refresh])

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true)
      setError(null)
      try {
        await action()
        await refresh()
      } catch (err) {
        setError((err as { message?: string })?.message ?? 'The action failed.')
      } finally {
        setProgress(null)
        setBusy(false)
      }
    },
    [refresh]
  )

  return {
    available: Boolean(bridge),
    state,
    models,
    settings,
    progress,
    busy,
    error,
    // First use downloads the engine and the default models; afterwards it only starts the server.
    turnOn: () => run(() => (state && state.downloadedModelIds.length > 0 ? bridge!.enable() : bridge!.downloadDefaults())),
    turnOff: () => run(() => bridge!.disable()),
    download: (id: string) => run(() => bridge!.downloadModel(id)),
    use: (id: string) => run(() => bridge!.activateModel(id)),
    remove: (id: string) => run(() => bridge!.deleteModel(id)),
    setThreads: (threads: number | null) => run(() => bridge!.setSettings({ threads }))
  }
}
