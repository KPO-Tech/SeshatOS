import { FileText, Folder } from '../icons'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { ToastStack, useToast } from '@renderer/components/ui/Toast'
import { listProjects, selectRecentSessions, updateProject } from '@renderer/lib/projects'
import { useSessionStore } from '@renderer/stores/session'
import { EditProjectDialog } from '../EditProjectDialog'
import { OverviewTab } from './OverviewTab'
import { FileTree } from './FileTree'
import { FileViewer } from './FileViewer'
import { InfoColumn } from './InfoColumn'
import { ProjectHeader } from './ProjectHeader'
import { SessionsTab } from './SessionsTab'
import { useProjectScan } from './useProjectScan'
import { useTranslation } from 'react-i18next'
import { ProjectTabs, type Tab } from './ProjectTabs'

function relativeToRoot(root: string, path: string): string {
  return path.startsWith(root) ? path.slice(root.length).replace(/^[\\/]+/, '') : path
}

// A project is a local folder (see lib/projects.ts). Its page reads the folder (the files, shown to be read and not changed), lists the
// conversations had in it, and keeps the person's notes about it.
export function ProjectDetailPage() {
  const { t } = useTranslation('shell')
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
  // A project opens on its overview: the input to begin a conversation in it, and what was asked before.
  const tab: Tab = rawTab === 'files' || rawTab === 'sessions' ? rawTab : 'overview'
  const goTo = (next: Tab) => setParams(next === 'overview' ? {} : { tab: next }, { replace: true })

  if (!project) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <span className="text-[var(--text-muted)]">
          <Folder size={22} />
        </span>
        <h2 className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">{t('pages.projects.detail.index.projectNotFound')}</h2>
        <p className="m-0 text-[13px] text-[var(--text-muted)]">{t('pages.projects.detail.index.itMayHaveBeenRemoved')}</p>
        <button type="button" onClick={() => navigate('/projects')} className="mt-2 cursor-pointer rounded-lg border border-[var(--border-soft)] bg-transparent px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]">
          {t('pages.projects.detail.index.backToProjects')}
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
  // Begins a conversation in the project: its overview, with the cursor in the input.
  function newChat() {
    setActive(null)
    navigate(`/projects/${encodeURIComponent(projectId)}?focus=1`)
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

      <ProjectTabs tab={tab} sessionCount={projectSessions.length} onSelect={goTo} />

      <div className="flex min-h-0 flex-1 gap-3 px-6 py-3">
        <main className="flex min-w-0 flex-1 gap-3">
          {tab === 'overview' && (
            <OverviewTab
              project={project}
              sessions={projectSessions}
              streaming={streaming}
              now={now}
              autoFocus={params.get('focus') === '1'}
              onOpenSession={openSession}
              onViewAll={() => goTo('sessions')}
              onEdit={() => setEditing(true)}
            />
          )}
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
                    <h2 className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">{t('pages.projects.detail.index.chooseAFileToRead')}</h2>
                    <p className="m-0 max-w-[340px] text-[12.5px] leading-[1.6] text-[var(--text-muted)]">{t('pages.projects.detail.index.markdownCodeNotebooksTablesAnd')}</p>
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
