import { useEffect, useState } from 'react'
import { AdminBanner } from '../shared/AdminBanner'
import { AdminModalButton, adminInputClass } from '../shared/AdminModal'
import { AdminStatusBadge } from '../shared/AdminTable'
import { updateAdminWebSearchPolicy, useAdminWebSearchPolicy } from './useAdminWebSearchPolicy'

function parseDomains(text: string): string[] {
  return text.split(/\n|,/).map((line) => line.trim()).filter(Boolean)
}

// There is no org-wide web-search "provider" concept on seshat-server
// (every provider credential is personal, per user) - the only
// organization-wide thing to configure is this one domain policy resource.
export function WebSearchView() {
  const { policy, loading, error, refetch } = useAdminWebSearchPolicy()
  const [allowedText, setAllowedText] = useState('')
  const [blockedText, setBlockedText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!policy) return
    setAllowedText(policy.allowed_domains.join('\n'))
    setBlockedText(policy.blocked_domains.join('\n'))
  }, [policy])

  async function handleSave() {
    setSubmitting(true)
    setSaveError(null)
    setSaved(false)
    try {
      await updateAdminWebSearchPolicy({ allowed_domains: parseDomains(allowedText), blocked_domains: parseDomains(blockedText) })
      await refetch()
      setSaved(true)
    } catch (e: unknown) {
      setSaveError((e as { message?: string })?.message ?? 'Failed to save the organization web search policy.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1 text-[17px] font-semibold text-[var(--text-primary)]">Web Search</div>
      <p className="mb-4 text-[12px] text-[var(--text-muted)]">
        Domain restrictions applied to every member&apos;s web search, regardless of which provider they use. Blocked domains always apply; allowed domains are additive.
      </p>

      {(error || saveError) && <AdminBanner message={error || saveError || ''} onDismiss={() => setSaveError(null)} />}

      {loading ? (
        <p className="text-[13px] text-[var(--text-muted)]">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[var(--text-secondary)]">Allowed domains</span>
              <textarea className={adminInputClass} rows={8} placeholder="one domain per line, e.g. wikipedia.org" value={allowedText} onChange={(e) => setAllowedText(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[var(--text-secondary)]">Blocked domains</span>
              <textarea className={adminInputClass} rows={8} placeholder="one domain per line, e.g. competitor.com" value={blockedText} onChange={(e) => setBlockedText(e.target.value)} />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <AdminModalButton disabled={submitting} onClick={handleSave}>{submitting ? 'Saving…' : 'Save'}</AdminModalButton>
            {saved && <AdminStatusBadge tone="success">Saved</AdminStatusBadge>}
          </div>
        </>
      )}
    </div>
  )
}
