// The renderer checks the id again: whatever the answer carried, only an 11 character id ever reaches the address of the frame.
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

export function YouTubeEmbed({ videoId, title }: { videoId?: string; title?: string }) {
  if (!videoId || !VIDEO_ID.test(videoId)) {
    return <div className="text-[13px] text-app-text-muted">This video link is not valid.</div>
  }
  return (
    <div className="w-full max-w-[560px]">
      <iframe
        className="aspect-video w-full rounded-[14px] border border-app-border-subtle bg-black"
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title={title || 'YouTube video'}
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  )
}
