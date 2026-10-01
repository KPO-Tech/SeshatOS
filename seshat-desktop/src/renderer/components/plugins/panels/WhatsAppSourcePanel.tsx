import { useEffect, useRef, useState } from 'react'
import { disconnectInboxAccount } from '../api/inboxApi'
import { consumeWhatsAppPairStream } from '../api/whatsappPairing'
import type { PluginAccount } from '../pluginsTypes'
import { AccountRows, ErrorNote, PrimaryAction } from './AccountRows'

type Pairing = { qr: string | null; error: string | null }

// WhatsApp has no OAuth: the backend streams a QR code, the user scans it from
// WhatsApp > Linked devices, and the stream ends once the device is linked.
export function WhatsAppSourcePanel({ accounts, onChanged }: { accounts: PluginAccount[]; onChanged: () => void }) {
  const [pairing, setPairing] = useState<Pairing | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => abort.current?.abort(), [])

  async function startPairing() {
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setPairing({ qr: null, error: null })
    await consumeWhatsAppPairStream(
      controller.signal,
      (qr) => setPairing({ qr, error: null }),
      () => {
        setPairing(null)
        onChanged()
      },
      (message) => setPairing({ qr: null, error: message })
    )
  }

  function cancelPairing() {
    abort.current?.abort()
    setPairing(null)
  }

  async function disconnect(account: PluginAccount) {
    if (!window.confirm(`Disconnect ${account.label}?`)) return
    setBusyId(account.id)
    setError(null)
    try {
      await disconnectInboxAccount(account.id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect this account.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="grid gap-3">
      <AccountRows accounts={accounts} busyId={busyId} onDisconnect={(account) => void disconnect(account)} />
      <ErrorNote message={error} />

      {pairing ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4 text-center">
          <p className="text-[12px] text-[var(--text-secondary)]">Open WhatsApp on your phone, then Settings, Linked devices, Link a device, and scan this code.</p>
          {pairing.qr ? (
            <img src={pairing.qr} alt="WhatsApp pairing QR code" width={200} height={200} className="rounded-lg bg-white p-2" />
          ) : pairing.error ? (
            <ErrorNote message={pairing.error} />
          ) : (
            <p className="py-10 text-[13px] text-[var(--text-muted)]">Generating the code...</p>
          )}
          <button type="button" onClick={cancelPairing} className="text-[12px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)]">Cancel</button>
        </div>
      ) : (
        <div>
          <PrimaryAction onClick={() => void startPairing()}>{accounts.length > 0 ? 'Pair another account' : 'Pair WhatsApp'}</PrimaryAction>
        </div>
      )}
    </div>
  )
}
