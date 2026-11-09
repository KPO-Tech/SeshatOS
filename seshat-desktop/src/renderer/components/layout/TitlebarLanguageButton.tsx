import { useEffect, useRef, useState } from 'react'
import { Translate } from '@icon-park/react'
import { IconButton } from '@renderer/components/ui/IconButton'
import { SelectorMenu } from '@renderer/components/ui/SelectorPill'
import { SUPPORTED_LANGUAGES, normalizeLanguage } from '@renderer/i18n/languages'
import { useLanguage } from '@renderer/i18n/useLanguage'
import { useTranslation } from 'react-i18next'

const OPTIONS = SUPPORTED_LANGUAGES.map((language) => ({ id: language.code, label: language.label }))

/**
 * The language of the interface, one click from anywhere: the same choice as
 * Settings > Preferences, for the person who reads another language than the
 * app happens to be in.
 */
export function TitlebarLanguageButton() {
  const { t } = useTranslation('shell')
  const { language, setLanguage } = useLanguage()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  function choose(code: string) {
    setOpen(false)
    const next = normalizeLanguage(code)
    if (next) void setLanguage(next)
  }

  return (
    <div className="relative" ref={rootRef}>
      <IconButton
        icon={<Translate size={14} />}
        variant="ghost"
        size={26}
        title={t('layout.titlebar.language')}
        active={open}
        onClick={() => setOpen((value) => !value)}
      />
      {open && (
        <SelectorMenu options={OPTIONS} selectedId={language} onSelect={choose} align="left" />
      )}
    </div>
  )
}
