import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchMultimodalSnapshot, type MultimodalSnapshot } from './multimodalApi'
import type { CapabilityName } from './multimodalTypes'

const emptySnapshot: MultimodalSnapshot = { status: null, capabilities: [], localSTT: null }

// The providers linked to image generation and audio, and the local speech settings, read together for a capability page.
export function useCapabilities() {
  const [snapshot, setSnapshot] = useState<MultimodalSnapshot>(emptySnapshot)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setSnapshot(await fetchMultimodalSnapshot())
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to load the configuration.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const byName = useMemo(() => {
    const map = new Map<CapabilityName, MultimodalSnapshot['capabilities'][number]>()
    snapshot.capabilities.forEach((capability) => map.set(capability.capability, capability))
    return map
  }, [snapshot.capabilities])

  return {
    snapshot,
    loading,
    error,
    reload: load,
    image: byName.get('image') ?? null,
    audio: byName.get('audio') ?? null,
    setLocalSTT: (localSTT: MultimodalSnapshot['localSTT']) => setSnapshot((current) => ({ ...current, localSTT }))
  }
}
