// A web page the agent made, shown live in the Artifact panel: read from the session's folders on disk each time it is opened, so it is
// always the file as it stands, never a copy kept from when it was written.
import type { RightPanelPayload } from '@renderer/stores/ui'
import { parsePayload } from '@renderer/components/chat/messages/mediaPayload'
import { EDIT_TOOLS, WRITE_TOOLS } from './changedFiles'

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

/** Something that went wrong in a previewed page, as its injected reporter told the panel (see artifact_reporter.go in the backend). */
export type PageProblem = { kind: 'error' | 'load' | 'blocked' | 'console'; message: string; where: string }

const PROBLEM_KINDS = new Set(['error', 'load', 'blocked', 'console'])

/**
 * The problem a message from the page carries, or null when it is not one. The page is untrusted: only these fields are kept, as text, and
 * addresses of the backend are shown as what they stand for: a library as the CDN address the page wrote, the preview as the file itself,
 * whose line numbers they share.
 */
export function pageProblemFrom(data: unknown, backendOrigin: string, path: string): PageProblem | null {
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  if (record.type !== 'seshat:page-problem' || typeof record.kind !== 'string' || !PROBLEM_KINDS.has(record.kind)) return null
  const libRoute = `${backendOrigin}/api/v1/artifacts/lib/`
  const previewRoute = `${backendOrigin}/api/v1/artifacts/preview/`
  const clean = (value: unknown, max: number) => String(value ?? '').slice(0, max).split(libRoute).join('https://')
    .split(previewRoute).map((part, index) => (index === 0 ? part : part.replace(/^[0-9a-f]+/, baseName(path)))).join('')
  return { kind: record.kind as PageProblem['kind'], message: clean(record.message, 2000), where: clean(record.where, 500) }
}

/** The message that asks the agent to fix the page, with its problems quoted as data. */
export function fixRequestMessage(path: string, problems: readonly PageProblem[]): string {
  const lines = problems.slice(0, 20).map((problem) => `- ${problem.kind}: ${problem.message}${problem.where ? ` (${problem.where})` : ''}`)
  if (problems.length > 20) lines.push(`- ... and ${problems.length - 20} more`)
  return [
    `The page ${path} shows these problems in the preview:`,
    '',
    '```text',
    ...lines.map((line) => line.replace(/```/g, "'''")),
    '```',
    '',
    'Fix them in the file. The preview has no network: a library loads only from jsDelivr, unpkg, cdnjs, esm.sh or the Tailwind CDN, ideally with an exact version. Answer in the language of this conversation.',
  ].join('\n')
}

function isAbsolutePath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/') || path.startsWith('\\\\')
}

/** Where the page is on disk: as given when absolute, else under the session's project folder, else its workspace. */
export function pageLocation(path: string, folders: { projectPath?: string; workspacePath?: string }): string | null {
  if (isAbsolutePath(path)) return path
  const root = folders.projectPath || folders.workspacePath
  if (!root) return null
  const sep = root.includes('\\') ? '\\' : '/'
  return `${root.replace(/[\\/]+$/, '')}${sep}${path.replace(/^\.?[\\/]+/, '').replace(/[\\/]/g, sep)}`
}

function sameFile(a: string, b: string): boolean {
  const normal = (path: string) => path.replace(/\\/g, '/').toLowerCase()
  return normal(a) === normal(b)
}

type WriteBlock = { type: string; id?: string; name?: string; input?: Record<string, unknown>; _result?: { isError: boolean } }

/** The id of the last finished write or edit of the page at location among these blocks, in order; undefined when there is none. */
export function lastPageWrite(
  blocks: readonly WriteBlock[],
  location: string,
  folders: { projectPath?: string; workspacePath?: string },
): string | undefined {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]
    if (block.type !== 'tool_use' || !block.id || !block.name || !block._result || block._result.isError) continue
    if (!WRITE_TOOLS.has(block.name) && !EDIT_TOOLS.has(block.name)) continue
    const written = typeof block.input?.file_path === 'string' ? pageLocation(block.input.file_path, folders) : null
    if (written && sameFile(written, location)) return block.id
  }
  return undefined
}
