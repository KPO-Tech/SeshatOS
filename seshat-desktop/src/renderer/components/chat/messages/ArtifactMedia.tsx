import { useEffect, useState } from 'react'
import { AttachmentTypeIcon } from '@renderer/components/AttachmentTypeIcon'
import { api } from '@renderer/api/client'
import { useUIStore } from '@renderer/stores/ui'
import { MediaDownload } from './MediaDownload'
import { YouTubeEmbed } from './YouTubeEmbed'
import { formatBytes, type MediaPayload } from './mediaPayload'

// A video is loaded whole into the page (the backend serves the file, the page reads it as a data URL), so a very large one is offered as a
// download card instead of being played.
const MAX_PLAYABLE_BYTES = 200 * 1024 * 1024

const PLAYABLE_KINDS = new Set(['image', 'audio', 'video'])

export function isPlayableArtifact(payload: MediaPayload): boolean {
  return PLAYABLE_KINDS.has(payload.kind ?? '') && (payload.size ?? 0) <= MAX_PLAYABLE_BYTES
}

type Loaded = { state: 'loading' } | { state: 'ready'; src: string } | { state: 'failed'; message: string }

function useArtifactSource(sessionId: string | undefined, path: string | undefined): Loaded {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  useEffect(() => {
    if (!sessionId || !path) {
      setLoaded({ state: 'failed', message: 'The file is not available.' })
      return
    }
    let cancelled = false
    setLoaded({ state: 'loading' })
    api.getFileDataURL(`/sessions/${sessionId}/artifact?path=${encodeURIComponent(path)}`)
      .then((src) => { if (!cancelled) setLoaded({ state: 'ready', src }) })
      .catch((error: unknown) => {
        if (!cancelled) setLoaded({ state: 'failed', message: error instanceof Error ? error.message : 'The file could not be loaded.' })
      })
    return () => { cancelled = true }
  }, [sessionId, path])
  return loaded
}

function FileCard({ payload, src, note }: { payload: MediaPayload; src?: string; note?: string }) {
  const name = payload.title || payload.path?.split('/').pop() || 'File'
  const filename = payload.path?.split('/').pop() || name
  const detail = [formatBytes(payload.size), note].filter(Boolean).join(' - ')
  return (
    <div className="flex w-full max-w-[420px] items-center gap-3 rounded-[12px] border border-app-border-subtle bg-app-surface px-3 py-2.5">
      <AttachmentTypeIcon filename={filename} size={22} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-app-text">{name}</div>
        {(payload.summary || detail) && <div className="line-clamp-2 text-[12px] text-app-text-muted">{payload.summary || detail}</div>}
      </div>
      {src && <MediaDownload href={src} filename={filename} />}
    </div>
  )
}

export function ArtifactMedia({ sessionId, payload }: { sessionId?: string; payload: MediaPayload }) {
  if (payload.kind === 'youtube') return <YouTubeEmbed videoId={payload.video_id} title={payload.title} />
  const openLightbox = useUIStore((s) => s.openLightbox)
  const playable = isPlayableArtifact(payload)
  const loaded = useArtifactSource(playable ? sessionId : undefined, payload.path)
  const filename = payload.path?.split('/').pop() || 'file'

  if (!playable) return <FileCard payload={payload} note={payload.kind === 'video' ? 'Too large to play here' : undefined} />
  if (loaded.state === 'loading') {
    return <div className="animate-pulse text-[13px] text-app-text-muted">Loading {payload.title || filename}...</div>
  }
  if (loaded.state === 'failed') return <FileCard payload={payload} note={loaded.message} />

  const { src } = loaded
  if (payload.kind === 'image') {
    return (
      <div className="group/media relative w-fit max-w-full">
        <img
          className="block max-h-[560px] cursor-zoom-in rounded-[14px] border border-app-border-subtle object-contain"
          style={{ maxWidth: 'min(100%, 520px)' }}
          src={src}
          alt={payload.title || filename}
          onClick={() => openLightbox({ url: src, filename })}
        />
        <div className="absolute right-2 bottom-2 flex gap-1.5 opacity-0 transition-opacity duration-150 group-hover/media:opacity-100">
          <MediaDownload href={src} filename={filename} />
        </div>
      </div>
    )
  }
  if (payload.kind === 'video') {
    return (
      <div className="flex w-full max-w-[560px] flex-col gap-1.5">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video className="max-h-[420px] w-full rounded-[14px] border border-app-border-subtle bg-black" controls preload="metadata" src={src} />
        <div className="flex items-center gap-2 text-[12px] text-app-text-muted">
          <span className="min-w-0 flex-1 truncate">{payload.title || filename}</span>
          <MediaDownload href={src} filename={filename} />
        </div>
      </div>
    )
  }
  return (
    <div className="flex w-full max-w-[420px] flex-col gap-1">
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio className="h-10 min-w-0 flex-1 [accent-color:var(--accent-primary)]" controls src={src} />
        <MediaDownload href={src} filename={filename} />
      </div>
      {payload.title && <span className="truncate text-[12px] text-app-text-muted">{payload.title}</span>}
    </div>
  )
}
