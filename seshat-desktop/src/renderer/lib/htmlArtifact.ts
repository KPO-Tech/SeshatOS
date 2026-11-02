// A web page the agent made, shown live in the Artifact panel: read from the session's folders on disk each time it is opened, so it is
// always the file as it stands, never a copy kept from when it was written.
import type { RightPanelPayload } from '@renderer/stores/ui'
import { parsePayload } from '@renderer/components/chat/messages/mediaPayload'

export function isHtmlPath(path: string): boolean {
  return /\.html?$/i.test(path.trim())
}

function baseName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path
}

/** The panel that shows the page at path (relative to the session's folder, or absolute inside it). */
export function htmlArtifactPanel(sessionId: string, path: string, title?: string): RightPanelPayload {
  return { kind: 'artifact', title: title?.trim() || baseName(path), sessionId, artifactPath: path }
}

/** The text a data: URL carries, decoded as UTF-8. */
export function dataURLText(url: string): string {
  const comma = url.indexOf(',')
  if (!url.startsWith('data:') || comma < 0) throw new Error('Not a data URL')
  const body = url.slice(comma + 1)
  if (!url.slice(0, comma).endsWith(';base64')) return decodeURIComponent(body)
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

type BlockLike = {
  type: string
  id?: string
  name?: string
  _status?: string
  _result?: { content: string; isError: boolean }
}

export type PresentedPage = { toolId: string; path: string; title?: string }

/** The web pages a finished present_artifact call showed, in the order of the calls. */
export function presentedPages(blocks: readonly BlockLike[]): PresentedPage[] {
  const pages: PresentedPage[] = []
  for (const block of blocks) {
    if (block.type !== 'tool_use' || block.name !== 'present_artifact' || !block.id) continue
    if (block._status !== 'completed' || !block._result || block._result.isError) continue
    const payload = parsePayload(block._result.content)
    const path = payload?.path ?? ''
    if (!path || (payload?.kind !== 'html' && !isHtmlPath(path))) continue
    pages.push({ toolId: block.id, path, title: payload?.title })
  }
  return pages
}
