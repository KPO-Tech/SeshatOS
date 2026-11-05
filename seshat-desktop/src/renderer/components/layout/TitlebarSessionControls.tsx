import { useEffect, useRef, useState } from 'react'
import { Computer, Globe, Shield, Terminal } from '@icon-park/react'
import { api } from '@renderer/api/client'
import { IconButton } from '@renderer/components/ui/IconButton'
import { SelectorMenu, type SelectorOption } from '@renderer/components/ui/SelectorPill'
import { useSessionPanelToggles } from '@renderer/hooks/useSessionPanelToggles'
import { useUIStore, type UIPermissionMode } from '@renderer/stores/ui'
import { useTranslation } from 'react-i18next'

const PERMISSION_OPTIONS: SelectorOption[] = [
  { id: 'auto', label: 'shell:layout.titlebarSessionControls.smart' },
  { id: 'bypass', label: 'shell:layout.titlebarSessionControls.auto' },
]

function permissionModeTitle(mode: UIPermissionMode): string {
  return { onRequest: 'Ask First', auto: 'Smart', bypass: 'Auto' }[mode]
}

function permissionModeColor(mode: UIPermissionMode): 'green' | 'orange' | 'red' {
  if (mode === 'onRequest') return 'green'
  if (mode === 'auto') return 'orange'
  return 'red'
}

// The active conversation's panel toggles (Computer / Browser / Terminal)
// plus the always-visible permission mode selector, both formerly in
// ChatTopBar's per-conversation top bar - relocated into the titlebar itself
// (next to Home/Back/Forward) so that row could go away entirely. Computer/
// Browser/Terminal only render once a conversation is open; permission mode
// is a global setting, so it's available from Home too.
//
// In the Ask view only the browser is offered: the cards of the session are already beside the conversation, its agent has no shell, and its
// permissions are not the person's to set.
export function TitlebarSessionControls({ conversationId, variant = 'chat' }: { conversationId: string | null; variant?: 'chat' | 'knowledge' }) {
  const { t } = useTranslation('shell')
  const permissionMode = useUIStore((s) => s.permissionMode)
  const setPermissionMode = useUIStore((s) => s.setPermissionMode)
  const { computerOpen, browserOpen, terminalOpen, toggleComputer, toggleBrowser, toggleTerminal } =
    useSessionPanelToggles(conversationId ?? undefined)
  const [permissionOpen, setPermissionOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!permissionOpen) return
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setPermissionOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [permissionOpen])

  function selectPermissionMode(mode: UIPermissionMode) {
    setPermissionOpen(false)
    setPermissionMode(mode)
    if (conversationId) void api.patch(`/sessions/${conversationId}`, { permission_mode: mode }).catch(() => {})
  }

  return (
    <div className="flex items-center gap-0.5" ref={rootRef}>
      {conversationId && (
        <>
          {variant === 'chat' && <IconButton icon={<Computer size={14} />} variant="ghost" size={26} title={t('layout.titlebarSessionControls.session')} active={computerOpen} onClick={toggleComputer} />}
          <IconButton icon={<Globe size={14} />} variant="ghost" size={26} title={t('layout.titlebarSessionControls.browser')} active={browserOpen} onClick={toggleBrowser} />
          {variant === 'chat' && <IconButton icon={<Terminal size={14} />} variant="ghost" size={26} title={t('layout.titlebarSessionControls.terminal')} active={terminalOpen} onClick={toggleTerminal} />}
        </>
      )}
      {variant === 'chat' && (
      <div className="relative">
        <IconButton
          icon={<Shield size={14} />}
          variant="ghost"
          size={26}
          title={permissionModeTitle(permissionMode)}
          active
          activeColor={permissionModeColor(permissionMode)}
          onClick={() => setPermissionOpen((v) => !v)}
        />
        {permissionOpen && (
          <SelectorMenu
            options={PERMISSION_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))}
            selectedId={permissionMode}
            onSelect={(id) => selectPermissionMode(id as UIPermissionMode)}
          />
        )}
      </div>
      )}
    </div>
  )
}
