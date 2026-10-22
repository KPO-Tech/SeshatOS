import { useMemo } from 'react'
import type { ToolUseBlock } from '@renderer/api/types'
import { useUIStore } from '@renderer/stores/ui'
import { ArtifactMedia } from './ArtifactMedia'
import { MediaDownload } from './MediaDownload'
import { extensionFor, parsePayload, type MediaPayload } from './mediaPayload'

// What the person is shown in the conversation itself, the way a chat product shows a picture or a clip: no tool row, no prompt, the
// media. The tools that produce one are listed here; a call that failed, or one whose answer has no media, keeps its ordinary tool block
// so the error can still be read.
const MEDIA_TOOLS = new Set(['generate_image', 'text_to_speech', 'present_artifact'])

function imageSource(payload: MediaPayload | null): string | null {
  if (payload?.image_base64) return `data:${payload.mime_type ?? 'image/png'};base64,${payload.image_base64}`
  return payload?.image_url ?? null
}

function audioSource(payload: MediaPayload | null): { src: string; mime: string } | null {
  if (!payload?.audio_base64) return null
  const mime = payload.content_type ?? payload.mime_type ?? 'audio/mpeg'
  return { src: `data:${mime};base64,${payload.audio_base64}`, mime }
}

function hasMedia(name: string, payload: MediaPayload | null): boolean {
  if (name === 'generate_image') return imageSource(payload) !== null
  if (name === 'present_artifact') return Boolean(payload?.path) || Boolean(payload?.video_id)
  return audioSource(payload) !== null
}

// True when this tool call is drawn by InlineMedia: a media tool whose call has finished with something to show, or is still running.
export function isInlineMedia(tool: ToolUseBlock): boolean {
  if (!MEDIA_TOOLS.has(tool.name)) return false
  if (tool._status === 'failed' || tool._result?.isError) return false
  if (tool._status === 'completed') return hasMedia(tool.name, parsePayload(tool._result?.content))
  return tool._status === 'running' || tool._status === 'pending'
}

export function InlineMedia({ tool, sessionId }: { tool: ToolUseBlock; sessionId?: string }) {
  const openLightbox = useUIStore((s) => s.openLightbox)
  const payload = useMemo(() => parsePayload(tool._result?.content), [tool._result?.content])
  const finished = tool._status === 'completed'

  if (tool.name === 'present_artifact') {
    if (!finished || !payload) return <div className="animate-pulse text-[13px] text-app-text-muted">Preparing the file...</div>
    return <ArtifactMedia sessionId={sessionId} payload={payload} />
  }

  if (tool.name === 'generate_image') {
    const src = finished ? imageSource(payload) : null
    if (!src) {
      return (
        <div className="flex aspect-square w-full max-w-[420px] animate-pulse items-center justify-center rounded-[14px] border border-app-border-subtle bg-app-surface text-[13px] text-app-text-muted">
          Creating image...
        </div>
      )
    }
    const filename = `image-${tool.id.slice(-6)}.${extensionFor(payload?.mime_type ?? 'image/png')}`
    return (
      <div className="group/media relative w-fit max-w-full">
        <img
          className="block max-h-[560px] max-w-full cursor-zoom-in rounded-[14px] border border-app-border-subtle object-contain"
          style={{ maxWidth: 'min(100%, 520px)' }}
          src={src}
          alt={payload?.revised_prompt ?? 'Generated image'}
          onClick={() => openLightbox({ url: src, filename })}
        />
        <div className="absolute right-2 bottom-2 flex gap-1.5 opacity-0 transition-opacity duration-150 group-hover/media:opacity-100">
          <MediaDownload href={src} filename={filename} />
        </div>
      </div>
    )
  }

  const audio = finished ? audioSource(payload) : null
  if (!audio) {
    return <div className="animate-pulse text-[13px] text-app-text-muted">Generating audio...</div>
  }
  return (
    <div className="flex w-full max-w-[420px] items-center gap-2">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio className="h-10 min-w-0 flex-1 [accent-color:var(--accent-primary)]" controls src={audio.src} />
      <MediaDownload href={audio.src} filename={`audio-${tool.id.slice(-6)}.${extensionFor(audio.mime)}`} />
    </div>
  )
}
