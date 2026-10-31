import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { ToastStack, useToast } from '@renderer/components/ui/Toast'
import { listProjects, selectRecentSessions, updateProject } from '@renderer/lib/projects'
import { useSessionStore } from '@renderer/stores/session'
import { EditProjectDialog } from '../EditProjectDialog'
import { FileText, Folder, Notes, Time } from '../icons'
import { FileTree } from './FileTree'
import { FileViewer } from './FileViewer'
import { InfoColumn } from './InfoColumn'
import { NotesTab } from './NotesTab'
import { ProjectHeader } from './ProjectHeader'
import { SessionsTab } from './SessionsTab'
import { useProjectScan } from './useProjectScan'

type Tab = 'files' | 'sessions' | 'notes'
const TABS: ReadonlyArray<{ id: Tab; label: string; icon: typeof FileText }> = [
  { id: 'files', label: 'Files', icon: FileText },
  { id: 'sessions', label: 'Sessions', icon: Time },
  { id: 'notes', label: 'Notes', icon: Notes }
]

function relativeToRoot(root: string, path: string): string {
  return path.startsWith(root) ? path.slice(root.length).replace(/^[\\/]+/, '') : path
}

// A project is a local folder (see lib/projects.ts). Its page reads the folder (the files, shown to be read and not changed), lists the
// conversations had in it, and keeps the person's notes about it.
export function ProjectDetailPage() {
  const { projectId = '' } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const sessions = useSessionStore((state) => state.sessions)
  const streaming = useSessionStore((state) => state.isStreamingBySession)
  const activeId = useSessionStore((state) => state.activeId)
  const setActive = useSessionStore((state) => state.setActive)
  const { toasts, show } = useToast()

  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [version, setVersion] = useState(0)
  const [editing, setEditing] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const project = useMemo(
    () => listProjects(sessions, streaming).find((item) => item.id === projectId),
    [sessions, streaming, projectId, version] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const projectSessions = useMemo(() => (project ? selectRecentSessions(sessions, project.rootPath, Number.MAX_SAFE_INTEGER) : []), [sessions, project])
  const scan = useProjectScan(project?.rootPath ?? '', refreshKey)

  const rawTab = params.get('tab')
  const tab: Tab = rawTab === 'sessions' || rawTab === 'notes' ? rawTab : 'files'
  const goTo = (next: Tab) => setParams(next === 'files' ? {} : { tab: next }, { replace: true })

  if (!project) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <span className="text-[var(--text-muted)]">
          <Folder size={22} />
        </span>
        <h2 className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">Project not found</h2>
        <p className="m-0 text-[13px] text-[var(--text-muted)]">It may have been removed.</p>
        <button type="button" onClick={() => navigate('/projects')} className="mt-2 cursor-pointer rounded-lg border border-[var(--border-soft)] bg-transparent px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]">
          Back to Projects
        </button>
      </div>
    )
  }

  const root = project.rootPath
  const changed = () => setVersion((n) => n + 1)

  const openFolder = () => void window.seshat?.openLocalPath?.(root).catch(() => show('The folder could not be opened.', 'err'))
  const copyPath = () => {
    void navigator.clipboard.writeText(root)
    show('Path copied', 'ok')
  }
  async function openInEditor() {
    const opened = await window.seshat?.openInEditor?.(root).catch(() => false)
    if (opened) return
    show('VS Code was not found: the folder was opened instead.', 'info')
    openFolder()
  }
  function openFile(path: string) {
    setSelectedFile(path)
    goTo('files')
  }
  function openSession(id: string) {
    setActive(id)
    navigate(`/conversation/${id}`)
  }
  function newChat() {
    setActive(null)
    navigate(`/?project=${encodeURIComponent(root)}`)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ProjectHeader
        project={project}
        onBack={() => navigate('/projects')}
        onTogglePinned={() => {
          updateProject(project.id, root, { pinned: !project.pinned })
          changed()
        }}
        onOpenInEditor={() => void openInEditor()}
        onOpenFolder={openFolder}
        onCopyPath={copyPath}
        onSettings={() => setEditing(true)}
        onNewChat={newChat}
        onToggleArchived={() => {
          updateProject(project.id, root, { archived: !project.archived, pinned: false })
          changed()
        }}
      />

      <nav className="mt-3 flex shrink-0 gap-1 border-b border-[var(--border-soft)] px-6" role="tablist" aria-label="Project">
        {TABS.map((item) => {
          const Icon = item.icon
          const selected = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => goTo(item.id)}
              className={`-mb-px flex cursor-pointer items-center gap-1.5 border-0 border-b-2 bg-transparent px-3 py-2 text-[13px] font-medium ${selected ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
            >
              <Icon size={14} />
              {item.label}
              {item.id === 'sessions' && projectSessions.length > 0 && <span className="rounded-full bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10.5px] leading-none text-[var(--text-muted)]">{projectSessions.length}</span>}
            </button>
          )
        })}
      </nav>

      <div className="flex min-h-0 flex-1 gap-3 px-6 py-3">
        <main className="flex min-w-0 flex-1 gap-3">
          {tab === 'files' && (
            <>
              <div className="flex w-[270px] shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)]">
                <FileTree rootPath={root} selectedPath={selectedFile} onOpenFile={setSelectedFile} refreshKey={refreshKey} onRefresh={() => setRefreshKey((n) => n + 1)} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)]">
                {selectedFile ? (
                  <FileViewer
                    path={selectedFile}
                    relativePath={relativeToRoot(root, selectedFile)}
                    onOpenSystem={(path) => void window.seshat?.openLocalPath?.(path).catch(() => show('This file could not be opened.', 'err'))}
                  />
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-8 text-center">
                    <span className="text-[var(--text-muted)]">
                      <FileText size={26} />
                    </span>
                    <h2 className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">Choose a file to read</h2>
                    <p className="m-0 max-w-[340px] text-[12.5px] leading-[1.6] text-[var(--text-muted)]">Markdown, code, notebooks, tables and pictures are shown here. Nothing in this view changes a file.</p>
                  </div>
                )}
              </div>
            </>
          )}
          {tab === 'sessions' && (
            <SessionsTab
              sessions={projectSessions}
              activeId={activeId}
              now={now}
              onOpen={openSession}
              onNewChat={newChat}
              onDeleted={(id) => {
                if (activeId === id) navigate('/')
              }}
            />
          )}
          {tab === 'notes' && <NotesTab projectId={project.id} now={now} />}
        </main>

        <aside className="no-scrollbar hidden w-[300px] shrink-0 overflow-y-auto lg:block">
          <InfoColumn
            project={project}
            scan={scan}
            sessions={projectSessions}
            now={now}
            onOpenFile={openFile}
            onOpenSession={openSession}
            onViewAllSessions={() => goTo('sessions')}
            onOpenInEditor={() => void openInEditor()}
            onOpenFolder={openFolder}
            onCopyPath={copyPath}
          />
        </aside>
      </div>

      {editing && (
        <EditProjectDialog
          project={project}
          onClose={() => setEditing(false)}
          onSave={(details) => {
            updateProject(project.id, root, details)
            setEditing(false)
            changed()
          }}
        />
      )}
      <ToastStack toasts={toasts} />
    </div>
  )
}
