import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Message, More, Right, Time, Folder } from '@icon-park/react'
import { Dropdown, type DropdownItem } from '@renderer/components/ui/Dropdown'
import { UNTITLED_SESSION_TITLE } from '@renderer/lib/sessionTitle'
import { deleteSession } from '@renderer/lib/deleteSession'
import { homeTime } from '@renderer/lib/homeTime'
import { listProjects, type ProjectSummary } from '@renderer/lib/projects'
import { relativeTime } from '@renderer/lib/projectsView'
import { useSessionStore } from '@renderer/stores/session'
import { ProjectTile } from '../projects/ProjectCard'

const SHOWN = 3

function Panel({ icon, title, action, children }: { icon: ReactNode; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="m-0 flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
          <span className="flex text-[var(--text-muted)]">{icon}</span>
          {title}
        </h2>
        {action}
      </div>
      <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)]">{children}</div>
    </section>
  )
}

function Row({ lead, title, detail, aside, menu, onOpen }: { lead: ReactNode; title: string; detail?: string; aside?: string; menu: DropdownItem[]; onOpen: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--border-soft)] px-4 py-3 first:rounded-t-2xl last:rounded-b-2xl last:border-b-0 hover:bg-[var(--surface-hover)]">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left">
        {lead}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-[var(--text-primary)]">{title}</span>
          {detail && <span className="block truncate text-[11.5px] text-[var(--text-muted)]">{detail}</span>}
        </span>
        {aside && <span className="shrink-0 text-[12px] text-[var(--text-muted)]">{aside}</span>}
      </button>
      <Dropdown
        label="More"
        items={menu}
        trigger={({ toggle }) => (
          <button type="button" aria-label="More" onClick={toggle} className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]">
            <More theme="outline" size={15} />
          </button>
        )}
      />
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="m-0 px-4 py-5 text-[12.5px] text-[var(--text-muted)]">{text}</p>
}

/** Under the input of the start page: the last conversations, and the projects to go back to. */
export function HomeLists() {
  const navigate = useNavigate()
  const sessions = useSessionStore((state) => state.sessions)
  const streaming = useSessionStore((state) => state.isStreamingBySession)
  const [now] = useState(() => Date.now())

  const recent = useMemo(
    () => [...sessions].sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt)).slice(0, SHOWN),
    [sessions]
  )
  const projects = useMemo(
    () =>
      listProjects(sessions, streaming)
        .filter((project) => !project.archived)
        .sort((a, b) => Date.parse(b.lastActiveAt ?? '') - Date.parse(a.lastActiveAt ?? '') || a.name.localeCompare(b.name))
        .slice(0, SHOWN),
    [sessions, streaming]
  )

  const openProject = (project: ProjectSummary) => navigate(`/projects/${encodeURIComponent(project.id)}`)

  return (
    <div className="mt-10 grid w-full grid-cols-[repeat(auto-fit,minmax(380px,1fr))] gap-6">
      <Panel icon={<Time theme="outline" size={17} />} title="Recent chats">
        {recent.length === 0 ? (
          <Empty text="Your conversations will be listed here." />
        ) : (
          recent.map((session) => (
            <Row
              key={session.id}
              lead={<span className="flex text-[var(--text-muted)]"><Message theme="outline" size={18} /></span>}
              title={session.title || UNTITLED_SESSION_TITLE}
              aside={homeTime(session.updatedAt || session.createdAt, now)}
              onOpen={() => navigate(`/conversation/${session.id}`)}
              menu={[
                { id: 'open', label: 'Open', onSelect: () => navigate(`/conversation/${session.id}`) },
                {
                  id: 'delete',
                  label: 'Delete',
                  danger: true,
                  onSelect: () => {
                    if (window.confirm(`Delete "${session.title || UNTITLED_SESSION_TITLE}"? This cannot be undone.`)) void deleteSession(session.id).catch(() => {})
                  }
                }
              ]}
            />
          ))
        )}
      </Panel>

      <Panel
        icon={<Folder theme="outline" size={17} />}
        title="Continue a project"
        action={
          <button type="button" onClick={() => navigate('/projects')} className="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[12.5px] font-medium text-[var(--accent-primary)] hover:underline">
            View all
            <Right theme="outline" size={13} />
          </button>
        }
      >
        {projects.length === 0 ? (
          <Empty text="The projects you open will be listed here." />
        ) : (
          projects.map((project) => (
            <Row
              key={project.id}
              lead={<ProjectTile project={project} size={36} />}
              title={project.name}
              detail={project.lastActiveAt ? `Last opened ${relativeTime(project.lastActiveAt, now)}` : 'Not opened yet'}
              onOpen={() => openProject(project)}
              menu={[
                { id: 'open', label: 'Open the project', onSelect: () => openProject(project) },
                { id: 'session', label: 'Start a session', onSelect: () => navigate(`/projects/${encodeURIComponent(project.id)}?focus=1`) },
                { id: 'folder', label: 'Open the folder', onSelect: () => void window.seshat?.openLocalPath?.(project.rootPath) }
              ]}
            />
          ))
        )}
      </Panel>
    </div>
  )
}
