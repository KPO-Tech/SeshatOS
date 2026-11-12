import { useEffect, useRef, useState } from 'react'
import { ArrowRightUp, Caution, Computer, Down, Ipad, Iphone, Refresh } from '@icon-park/react'
import { api } from '@renderer/api/client'
import type { Session } from '@renderer/api/types'
import { CodeBox } from '@renderer/components/chat/tools/common'
import { useChat } from '@renderer/hooks/useChat'
import { dataURLText, fixRequestMessage, lastPageWrite, pageLocation, pageProblemFrom, type PageProblem } from '@renderer/lib/htmlArtifact'
import { useSessionStore } from '@renderer/stores/session'
import { useTranslation } from 'react-i18next'

type Props = {
  sessionId: string
  path: string
  filename: string
}

type Loaded =
  | { state: 'loading' }
  | { state: 'ready'; html: string; previewId: string }
  | { state: 'failed'; message: string }

type Tab = 'preview' | 'code'

// The most problems kept for one load of the page: the page's own reporter stops at 50 too.
const MAX_PROBLEMS = 50

// The device a page is shown as, by the width it is laid out at. A panel is narrower than a screen (and narrower still with a Windows
// scale above 100 %): a page made for a wide window would fall back to its phone layout there. It is laid out at the device's width and,
// when that is wider than the panel, scaled down to fit; a narrower device is centred at its own size.
const DEVICES = [
  { id: 'desktop', width: 1280, Icon: Computer },
  { id: 'tablet', width: 820, Icon: Ipad },
  { id: 'phone', width: 390, Icon: Iphone },
] as const
type Device = (typeof DEVICES)[number]['id']

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

const iconButton =
  'inline-flex size-6 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-app-text-muted hover:bg-[var(--surface-hover)] hover:text-app-text disabled:cursor-default disabled:opacity-40'

// Shows a web page the agent made, live. The file is read from the session's folders on disk (GET /sessions/{id}/artifact, which refuses
// anything outside them) each time the panel opens or reloads, then handed to the backend's preview store, whose page carries its own CSP:
// inline script and style run, the CDN libraries come from the backend, nothing reaches the network - see artifactPreviewCSP in
// seshat-backend/internal/api/artifacts.go and the frame-src carve-out in src/main/content-security-policy.ts. sandbox="allow-scripts"
// WITHOUT allow-same-origin gives the frame a unique opaque origin with no access to this app's window, DOM, IPC bridge, cookies or
// localStorage, whatever the page's own script does.
//
// The backend also puts a small reporter first in the page (artifact_reporter.go), which posts what goes wrong to this panel. Only messages
// from this exact frame are read, kept as text, and sent to the agent when the person asks: the page never reaches the agent by itself.
export function ArtifactPreviewPanel({ sessionId, path, filename }: Props) {
  const { t } = useTranslation('chat')
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  const [origin, setOrigin] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('preview')
  const [reloads, setReloads] = useState(0)
  const [problems, setProblems] = useState<PageProblem[]>([])
  const [problemsOpen, setProblemsOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [device, setDevice] = useState<Device>('desktop')
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const { sendMessage } = useChat(sessionId)
  const location = useSessionStore((s) => {
    const session = s.sessions.find((item) => item.id === sessionId)
    return pageLocation(path, { projectPath: session?.projectPath, workspacePath: session?.workspacePath })
  })

  // The session's folders are only in the store for a conversation loaded from the backend, not for one started just now, where a page
  // presented with a relative path would have no location: no browser button, and its edits would go unnoticed. The folder exists by now,
  // since the page is in it.
  const foldersKnown = useSessionStore((s) => {
    const session = s.sessions.find((item) => item.id === sessionId)
    return Boolean(session?.projectPath || session?.workspacePath)
  })
  useEffect(() => {
    if (foldersKnown) return
    let cancelled = false
    api.get<Session>(`/sessions/${sessionId}`)
      .then((detail) => {
        if (cancelled) return
        useSessionStore.getState().updateSession(sessionId, { workspacePath: detail.workspace_path, projectPath: detail.project_path })
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [foldersKnown, sessionId])

  // The agent changed the file (its fix, a request of the person): the page shown is out of date. The tool calls still streaming come first,
  // they are the latest; once the turn ends they are in the messages.
  const lastWrite = useSessionStore((s) => {
    const session = s.sessions.find((item) => item.id === sessionId)
    if (!session || !location) return undefined
    const folders = { projectPath: session.projectPath, workspacePath: session.workspacePath }
    const live = lastPageWrite(s.getStreaming(sessionId), location, folders)
    if (live) return live
    for (let i = session.messages.length - 1; i >= 0; i--) {
      const found = lastPageWrite(session.messages[i].content, location, folders)
      if (found) return found
    }
    return undefined
  })
  // Only a write not seen yet: when a turn ends, its calls move from the stream to the messages, and an older one can show for an instant.
  // Before the folders are known nothing can be matched: the first write found then is the one the panel just loaded.
  const seenWrites = useRef(new Set<string>())
  const baselineTaken = useRef(false)
  useEffect(() => {
    if (!location) return
    if (!baselineTaken.current) {
      baselineTaken.current = true
      if (lastWrite) seenWrites.current.add(lastWrite)
      return
    }
    if (!lastWrite || seenWrites.current.has(lastWrite)) return
    seenWrites.current.add(lastWrite)
    setReloads((value) => value + 1)
  }, [lastWrite, location])

  useEffect(() => {
    let cancelled = false
    window.seshat?.http?.backendOrigin()
      .then((value) => { if (!cancelled) setOrigin(value || null) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoaded({ state: 'loading' })
    setProblems([])
    setNote(null)
    api.getFileDataURL(`/sessions/${sessionId}/artifact?path=${encodeURIComponent(path)}`)
      .then(async (url) => {
        const html = dataURLText(url)
        const { id } = await api.post<{ id: string }>('/artifacts/preview', { html })
        if (!cancelled) setLoaded({ state: 'ready', html, previewId: id })
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoaded({ state: 'failed', message: error instanceof Error ? error.message : 'The page could not be loaded.' })
      })
    return () => { cancelled = true }
  }, [sessionId, path, reloads])

  useEffect(() => {
    if (!origin) return
    function onMessage(event: MessageEvent) {
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return
      const problem = pageProblemFrom(event.data, origin!, path)
      if (!problem) return
      setProblems((current) => {
        if (current.length >= MAX_PROBLEMS) return current
        const same = current.some((item) => item.kind === problem.kind && item.message === problem.message && item.where === problem.where)
        return same ? current : [...current, problem]
      })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [origin, path])

  // Asked of the agent in the conversation, so the fix runs under its permissions and shows in the chat. A running turn would drop the
  // message (sendMessage does nothing then): the person is told to wait instead, as for the Merge button of the Changes card.
  function askToFix() {
    if (useSessionStore.getState().isSessionStreaming(sessionId)) {
      setNote(t('chat.panels.artifactPreviewPanel.agentStillWorking'))
      return
    }
    setNote(null)
    void sendMessage(fixRequestMessage(path, problems))
  }

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const measure = () => setViewport({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const deviceWidth = DEVICES.find((item) => item.id === device)?.width ?? DEVICES[0].width
  const scale = viewport.width > 0 && viewport.width < deviceWidth ? viewport.width / deviceWidth : 1
  const frameStyle = viewport.width === 0
    ? undefined
    : scale < 1
      ? { width: deviceWidth, height: viewport.height / scale, transform: `scale(${scale})`, transformOrigin: '0 0' }
      : { width: device === 'desktop' ? viewport.width : deviceWidth, margin: '0 auto' }

  function deviceLabel(id: Device): string {
    if (id === 'tablet') return t('chat.panels.artifactPreviewPanel.device.tablet')
    if (id === 'phone') return t('chat.panels.artifactPreviewPanel.device.phone')
    return t('chat.panels.artifactPreviewPanel.device.desktop')
  }

  function openInBrowser() {
    if (!location) return
    setNote(null)
    void window.seshat?.openLocalPath?.(location)?.catch(() => setNote(t('chat.panels.artifactPreviewPanel.couldNotOpenInBrowser')))
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-app-border-subtle px-1.5 py-1">
        {(['preview', 'code'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cx(
              'cursor-pointer rounded-md border-0 px-2.5 py-1 text-[12px] font-medium transition-colors duration-150',
              tab === value ? 'bg-[var(--surface-hover)] text-app-text' : 'bg-transparent text-app-text-muted hover:text-app-text-secondary',
            )}
          >
            {value === 'preview' ? t('chat.panels.artifactPreviewPanel.preview') : t('chat.panels.artifactPreviewPanel.code')}
          </button>
        ))}
        <span className="flex-1" />
        {DEVICES.map(({ id, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setDevice(id)}
            disabled={tab !== 'preview'}
            className={cx(iconButton, device === id && 'bg-[var(--surface-hover)] text-app-text')}
            aria-pressed={device === id}
            aria-label={deviceLabel(id)}
            title={deviceLabel(id)}
          >
            <Icon size={13} />
          </button>
        ))}
        <span className="mx-0.5 h-4 w-px bg-app-border-subtle" />
        <button type="button" onClick={openInBrowser} disabled={!location} className={iconButton} aria-label={t('chat.panels.artifactPreviewPanel.openInTheBrowser')} title={t('chat.panels.artifactPreviewPanel.openInTheBrowserWith')}>
          <ArrowRightUp size={13} strokeWidth={4} />
        </button>
        <button type="button" onClick={() => setReloads((value) => value + 1)} className={iconButton} aria-label={t('chat.panels.artifactPreviewPanel.reload')} title={t('chat.panels.artifactPreviewPanel.reload')}>
          <Refresh size={12} />
        </button>
      </div>
      <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-hidden">
        {loaded.state === 'failed' ? (
          <div className="absolute inset-0 flex items-center justify-center bg-app-surface px-5 text-center text-[12px] text-app-error">{t('chat.panels.artifactPreviewPanel.couldntLoadPage', { message: loaded.message })}</div>
        ) : loaded.state === 'loading' || !origin ? (
          <div className="absolute inset-0 flex items-center justify-center bg-app-surface px-5 text-center text-[12px] text-app-text-muted">{t('chat.panels.artifactPreviewPanel.loadingThePage')}</div>
        ) : (
          <>
            {/* The frame stays mounted under the Code tab: switching back does not run the page again. */}
            <iframe
              ref={frameRef}
              key={loaded.previewId}
              src={`${origin}/api/v1/artifacts/preview/${loaded.previewId}`}
              title={filename}
              className={cx('block h-full w-full border-0 bg-white', tab === 'code' && 'hidden')}
              style={frameStyle}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
            />
            {tab === 'code' && (
              <div className="absolute inset-0 overflow-auto">
                <CodeBox content={loaded.html} copyable language="markup" lineNumbers bare expanded />
              </div>
            )}
          </>
        )}
      </div>
      {(problems.length > 0 || note) && (
        <div className="shrink-0 border-t border-app-border-subtle bg-app-surface">
          {problems.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5">
              <button
                type="button"
                onClick={() => setProblemsOpen((value) => !value)}
                className="inline-flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-left text-[12px] text-app-error"
                aria-expanded={problemsOpen}
              >
                <Caution size={12} className="shrink-0" />
                <span className="truncate">
                  {problems.length === 1 ? t('chat.panels.artifactPreviewPanel.t1ProblemOnThePage') : t('chat.panels.artifactPreviewPanel.problemsOnPage', { total: problems.length })}
                </span>
                <span className={cx('inline-flex shrink-0 opacity-60 transition-transform duration-150', problemsOpen && 'rotate-180')}>
                  <Down size={10} />
                </span>
              </button>
              <button
                type="button"
                onClick={askToFix}
                className="shrink-0 cursor-pointer rounded-md border border-[rgba(239,124,47,0.3)] bg-[rgba(239,124,47,0.1)] px-2.5 py-1 text-[12px] font-semibold text-[var(--accent-primary)]"
              >
                {t('chat.panels.artifactPreviewPanel.askTheAgentToFix')}
              </button>
            </div>
          )}
          {problemsOpen && problems.length > 0 && (
            <ul className="m-0 max-h-40 list-none overflow-auto px-3 pb-2 font-mono text-[11px] leading-relaxed text-app-text-secondary">
              {problems.map((problem, index) => (
                <li key={index} className="break-words">
                  <span className="text-app-text-muted">{problem.kind}:</span> {problem.message}
                  {problem.where && <span className="text-app-text-muted"> ({problem.where})</span>}
                </li>
              ))}
            </ul>
          )}
          {note && <div className="px-3 pb-2 pt-1 text-[11px] text-app-text-muted">{note}</div>}
        </div>
      )}
    </div>
  )
}
