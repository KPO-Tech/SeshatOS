import { useCallback, useEffect, useMemo, useState } from 'react'
import { CapabilitySourceCard } from './CapabilitySourceCard'
import { LocalSpeechCard } from './LocalSpeechCard'
import { MultimodalStatus } from './MultimodalStatus'
import { fetchMultimodalSnapshot, type MultimodalSnapshot } from './multimodalApi'
import type { CapabilityName } from './multimodalTypes'

const emptySnapshot: MultimodalSnapshot = {
  status: null,
  capabilities: [],
  localSTT: null
}

export function MultimodalConfig() {
  const [snapshot, setSnapshot] = useState<MultimodalSnapshot>(emptySnapshot)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const next = await fetchMultimodalSnapshot()
      setSnapshot(next)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to load multimodal configuration.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const capabilityByName = useMemo(() => {
    const map = new Map<CapabilityName, MultimodalSnapshot['capabilities'][number]>()
    snapshot.capabilities.forEach((capability) => map.set(capability.capability, capability))
    return map
  }, [snapshot.capabilities])
  const imageCapability = capabilityByName.get('image') ?? null
  const audioCapability = capabilityByName.get('audio') ?? null
  const imageLinked = Boolean(imageCapability?.linked_provider_id)
  const audioLinked = Boolean(audioCapability?.linked_provider_id)

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="text-[13px] font-semibold text-[var(--text-muted)]">
          {loading ? 'Loading multimodal runtime...' : 'Multimodal runtime'}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-panel)]"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">
          {error}
        </div>
      )}

      <MultimodalStatus status={snapshot.status} localSTT={snapshot.localSTT} imageLinked={imageLinked} audioLinked={audioLinked} />

      <CapabilitySourceCard
        capability="image"
        title="Image generation"
        description="Choose the provider used by image generation tools in conversations."
        configured={imageLinked}
        status={imageCapability}
        onChanged={load}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <LocalSpeechCard
          config={snapshot.localSTT}
          configured={snapshot.status?.local_stt_configured}
          onSaved={(localSTT) => setSnapshot((current) => ({ ...current, localSTT }))}
        />
        <CapabilitySourceCard
          capability="audio"
          title="Cloud audio source"
          description="Choose the provider used for cloud speech-to-text and future text-to-speech tools."
          configured={audioLinked}
          status={audioCapability}
          onChanged={load}
        />
      </div>
    </div>
  )
}
