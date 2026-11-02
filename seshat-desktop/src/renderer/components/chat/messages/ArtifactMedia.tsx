import { useEffect, useState } from 'react'
import { AttachmentTypeIcon } from '@renderer/components/AttachmentTypeIcon'
import { api } from '@renderer/api/client'
import { useUIStore } from '@renderer/stores/ui'
import { htmlArtifactPanel, isHtmlPath } from '@renderer/lib/htmlArtifact'
import { MediaDownload } from './MediaDownload'
import { cachedSource, loadSource, rememberSize, sourceKey } from './artifactSourceCache'
import { YouTubeEmbed } from './YouTubeEmbed'
import { formatBytes, type MediaPayload } from './mediaPayload'

// A video is loaded whole into the page (the backend serves the file, the page reads it as a data URL), so a very large one is offered as a
// download card instead of being played.
const MAX_PLAYABLE_BYTES = 200 * 1024 * 1024

const PLAYABLE_KINDS = new Set(['image', 'audio', 'video'])

export function isPlayableArtifact(payload: MediaPayload): boolean {
  return PLAYABLE_KINDS.has(payload.kind ?? '') && (payload.size ?? 0) <= MAX_PLAYABLE_BYTES
}

type Loaded =
  | { state: 'loading' }
  | { state: 'ready'; src: string; width?: number; height?: number; key: string }
  | { state: 'failed'; message: string }

// Loaded once per file and kept (see artifactSourceCache.ts): a message scrolled back into view draws its media at once, at the size it had.
function useArtifactSource(sessionId: string | undefined, path: string | undefined): Loaded {
  const key = sessionId && path ? sourceKey(sessionId, path) : ''
  const initial = (): Loaded => {
    const cached = key ? cachedSource(key) : undefined
    return cached ? { state: 'ready', src: cached.url, width: cached.width, height: cached.height, key } : { state: 'loading' }
  }
  const [loaded, setLoaded] = useState<Loaded>(initial)
  useEffect(() => {
    if (!sessionId || !path) {
      setLoaded({ state: 'failed', message: 'The file is not available.' })
      return
    }
    const cached = cachedSource(key)
    if (cached) {
      setLoaded({ state: 'ready', src: cached.url, width: cached.width, height: cached.height, key })
      return
    }
    let cancelled = false
    setLoaded({ state: 'loading' })
    loadSource(key, () => api.getFileDataURL(`/sessions/${sessionId}/artifact?path=${encodeURIComponent(path)}`))
      .then((entry) => { if (!cancelled) setLoaded({ state: 'ready', src: entry.url, width: entry.width, height: entry.height, key }) })
      .catch((error: unknown) => {
        if (!cancelled) setLoaded({ state: 'failed', message: error instanceof Error ? error.message : 'The file could not be loaded.' })
      })
    return () => { cancelled = true }
  }, [sessionId, path, key])
  return loaded
}

// A web page opens live in the Artifact panel on a click; any other file is only offered for download.
function FileCard({ payload, src, note, onOpen }: { payload: MediaPayload; src?: string; note?: string; onOpen?: () => void }) {
  const name = payload.title || payload.path?.split('/').pop() || 'File'
  const filename = payload.path?.split('/').pop() || name
  const detail = [formatBytes(payload.size), note].filter(Boolean).join(' - ')
  const body = (
    <>
      <AttachmentTypeIcon filename={filename} size={22} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-app-text">{name}</div>
        {(payload.summary || detail) && <div className="line-clamp-2 text-[12px] text-app-text-muted">{payload.summary || detail}</div>}
      </div>
    </>
  )
  const frame = 'flex w-full max-w-[420px] items-center gap-3 rounded-[12px] border border-app-border-subtle bg-app-surface px-3 py-2.5'
  if (onOpen) {
    return (
      <button type="button" onClick={onOpen} title="Open" className={`${frame} cursor-pointer text-left hover:bg-[var(--surface-hover)]`}>
        {body}
      </button>
    )
  }
  return (
    <div className={frame}>
      {body}
      {src && <MediaDownload href={src} filename={filename} />}
    </div>
  )
}

export function ArtifactMedia({ sessionId, payload }: { sessionId?: string; payload: MediaPayload }) {
  if (payload.kind === 'youtube') return <YouTubeEmbed videoId={payload.video_id} title={payload.title} />
  const openLightbox = useUIStore((s) => s.openLightbox)
  const openRightPanel = useUIStore((s) => s.openRightPanel)
  const playable = isPlayableArtifact(payload)
  const loaded = useArtifactSource(playable ? sessionId : undefined, payload.path)
  const filename = payload.path?.split('/').pop() || 'file'

  const path = payload.path
  if (sessionId && path && (payload.kind === 'html' || isHtmlPath(path))) {
    return <FileCard payload={payload} onOpen={() => openRightPanel(htmlArtifactPanel(sessionId, path, payload.title))} />
  }
  if (!playable) return <FileCard payload={payload} note={payload.kind === 'video' ? 'Too large to play here' : undefined} />
  if (loaded.state === 'loading') {
    return <div className="animate-pulse text-[13px] text-app-text-muted">Loading {payload.title || filename}...</div>
  }
  if (loaded.state === 'failed') return <FileCard payload={payload} note={loaded.message} />

  const { src, width, height, key } = loaded
  if (payload.kind === 'image') {
    return (
      <div className="group/media relative w-fit max-w-full">
        <img
          className="block max-h-[560px] cursor-zoom-in rounded-[14px] border border-app-border-subtle object-contain"
          style={{ maxWidth: 'min(100%, 520px)' }}
          src={src}
          // The size it had last time: the row keeps its height while the picture decodes again.
          width={width}
          height={height}
          onLoad={(event) => rememberSize(key, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
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
        <video
          className="max-h-[420px] w-full rounded-[14px] border border-app-border-subtle bg-black"
          style={width && height ? { aspectRatio: `${width} / ${height}` } : undefined}
          controls
          preload="metadata"
          src={src}
          onLoadedMetadata={(event) => rememberSize(key, event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
        />
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
