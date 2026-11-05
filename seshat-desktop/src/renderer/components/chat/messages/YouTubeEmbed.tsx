import { useTranslation } from 'react-i18next'
// The renderer checks the id again: whatever the answer carried, only an 11 character id ever reaches the address of the frame.
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

export function YouTubeEmbed({ videoId, title }: { videoId?: string; title?: string }) {
  const { t } = useTranslation('chat')
  if (!videoId || !VIDEO_ID.test(videoId)) {
    return <div className="text-[13px] text-app-text-muted">{t('chat.messages.youTubeEmbed.thisVideoLinkIsNot')}</div>
  }
  return (
    <div className="w-full max-w-[560px]">
      <iframe
        className="aspect-video w-full rounded-[14px] border border-app-border-subtle bg-black"
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title={title || t('chat.messages.youTubeEmbed.youtubeVideo')}
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  )
}
