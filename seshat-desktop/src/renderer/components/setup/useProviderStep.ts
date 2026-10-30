import { useCallback, useEffect, useMemo, useState } from 'react'
import { checkProviderKey, createProviderSetting, fetchProviderChoices, fetchProviderSettings, setDefaultProvider, syncProviderModels } from '@renderer/components/config/providers/providerApi'
import type { ProviderChoice } from '@renderer/components/config/providers/providerTypes'
import { initialProviderForm, isCodexProvider } from '@renderer/components/config/providers/providerUtils'

export type ProviderStepStatus = 'loading' | 'idle' | 'checking' | 'saving' | 'connected'

// The cloud and local providers the runtime ships with, offered when the person connects a model for the first time. Providers that need
// a browser sign-in stay in Config.
export function useProviderStep() {
  const [choices, setChoices] = useState<ProviderChoice[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [status, setStatus] = useState<ProviderStepStatus>('loading')
  const [connectedName, setConnectedName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // What the check could not settle (provider out of reach, answer not understood): the person may save the key anyway.
  const [unverified, setUnverified] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [catalog, settings] = await Promise.all([fetchProviderChoices(), fetchProviderSettings()])
        if (cancelled) return
        const offered = catalog.filter((entry) => entry.main && !isCodexProvider(entry.id))
        setChoices(offered)
        if (settings.length > 0) {
          setConnectedName(settings.find((setting) => setting.is_default)?.name ?? settings[0].name)
          setStatus('connected')
          return
        }
        setStatus('idle')
      } catch {
        // The step is an offer: with no list to show, the person goes on and connects a provider in Config.
        if (!cancelled) setStatus('idle')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const selected = useMemo(() => choices.find((entry) => entry.id === selectedId), [choices, selectedId])
  const form = useMemo(() => initialProviderForm(selected), [selected])
  const needsKey = Boolean(selected) && form.auth_kind === 'api_key'
  const canConnect = Boolean(selected) && (!needsKey || apiKey.trim().length > 0)

  const select = useCallback(
    (id: string) => {
      setSelectedId(id)
      setApiKey('')
      setError(null)
      setUnverified(null)
      setBaseUrl(initialProviderForm(choices.find((entry) => entry.id === id)).base_url)
    },
    [choices]
  )

  const connect = useCallback(
    async (saveAnyway = false) => {
      if (!selected || !canConnect || status === 'saving' || status === 'checking') return
      setError(null)
      setUnverified(null)
      const address = baseUrl.trim() && baseUrl.trim() !== selected.base_url ? baseUrl.trim() : undefined
      if (!saveAnyway) {
        setStatus('checking')
        try {
          const check = await checkProviderKey({ provider: form.provider, api_key: needsKey ? apiKey.trim() : undefined, base_url: address })
          if (check.status === 'rejected') {
            setError(check.message ?? 'The provider rejected this key.')
            setStatus('idle')
            return
          }
          if (check.status !== 'ok') {
            setUnverified(check.message ?? 'The key could not be checked.')
            setStatus('idle')
            return
          }
        } catch {
          setUnverified('The key could not be checked.')
          setStatus('idle')
          return
        }
      }
      setStatus('saving')
      try {
        const created = await createProviderSetting({
          provider: form.provider,
          name: selected.name,
          auth_kind: form.auth_kind,
          api_key: needsKey ? apiKey.trim() : undefined,
          base_url: address
        })
        await setDefaultProvider(created.id).catch(() => {})
        await syncProviderModels(created.id).catch(() => {})
        setApiKey('')
        setConnectedName(selected.name)
        setStatus('connected')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The provider could not be saved.')
        setStatus('idle')
      }
    },
    [apiKey, baseUrl, canConnect, form, needsKey, selected, status]
  )

  return { choices, selected, selectedId, select, apiKey, setApiKey, baseUrl, setBaseUrl, needsKey, canConnect, status, connectedName, error, unverified, connect }
}
