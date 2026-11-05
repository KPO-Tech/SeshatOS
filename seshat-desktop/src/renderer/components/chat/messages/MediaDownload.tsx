import { Download } from '@icon-park/react'
import { useTranslation } from 'react-i18next'

export function MediaDownload({ href, filename }: { href: string; filename: string }) {
  const { t } = useTranslation('chat')
  return (
    <a
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[rgba(0,0,0,0.55)] text-white no-underline backdrop-blur-sm hover:bg-[rgba(0,0,0,0.75)]"
      href={href}
      download={filename}
      aria-label={t('chat.messages.mediaDownload.download')}
      title={t('chat.messages.mediaDownload.download')}
      onClick={(event) => event.stopPropagation()}
    >
      <Download size={14} />
    </a>
  )
}
