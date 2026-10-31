import type { ReactNode } from 'react'
import { UNTITLED_SESSION_TITLE } from '@renderer/lib/sessionTitle'
import type { ProjectSummary } from '@renderer/lib/projects'
import { relativeTime } from '@renderer/lib/projectsView'
import type { ChatSession } from '@renderer/stores/session'
import { NewChat, type NewChatSuggestion } from '@renderer/pages/Home'
import { BookOpen, FileText, Folder, Play, Search, Time } from '../icons'
import { TagList } from '../ProjectCard'

type Props = {
  project: ProjectSummary
  sessions: ChatSession[]
  streaming: Record<string, boolean>
  now: number
  autoFocus: boolean
  onOpenSession: (id: string) => void
  onViewAll: () => void
  onEdit: () => void
}

const SUGGESTIONS: NewChatSuggestion[] = [
  { icon: <Folder size={14} />, label: 'Explore the project structure', prompt: 'Explore the structure of this project and explain what it contains.' },
  { icon: <FileText size={14} />, label: 'Analyze the data folder', prompt: 'Analyze the data folder of this project and summarize what it holds.' },
  { icon: <BookOpen size={14} />, label: 'Explain this codebase', prompt: 'Explain this codebase: its main parts and how they fit together.' },
  { icon: <Play size={14} />, label: 'Help me improve this project', prompt: 'Help me improve this project: suggest what to do next, in order of value.' },
  { icon: <Search size={14} />, label: 'Find potential issues', prompt: 'Look for potential issues in this project: bugs, risks and missing pieces.' }
]

const LISTED = 8

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="m-0 text-[13px] font-semibold text-[var(--text-primary)]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/**
 * The home of a project: what it is, the input to begin a conversation in it (the folder is the project's), and what was asked before.
 * A conversation begun here is held in the folder of the project, like one begun from the start page with that folder chosen.
 */
export function OverviewTab({ project, sessions, streaming, now, autoFocus, onOpenSession, onViewAll, onEdit }: Props) {
  const listed = sessions.slice(0, LISTED)
  return (
    <div className="no-scrollbar flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
      <Card title="Ask about this project">
        <NewChat variant="project" fixedProjectPath={project.rootPath} placeholder="Ask about this project..." suggestions={SUGGESTIONS} autoFocus={autoFocus} />
      </Card>

      {(project.description || project.tags.length > 0) && (
        <Card
          title="About"
          action={
            <button type="button" onClick={onEdit} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-medium text-[var(--accent-primary)] hover:underline">
              Edit
            </button>
          }
        >
          {project.description && <p className="m-0 mb-2 text-[13px] leading-[1.6] text-[var(--text-secondary)]">{project.description}</p>}
          <TagList tags={project.tags} />
        </Card>
      )}

      <Card
        title="What you asked"
        action={
          sessions.length > 0 ? (
            <button type="button" onClick={onViewAll} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-medium text-[var(--accent-primary)] hover:underline">
              {sessions.length > listed.length ? `View all ${sessions.length}` : 'View all'}
            </button>
          ) : undefined
        }
      >
        {listed.length === 0 ? (
          <p className="m-0 text-[12.5px] leading-[1.6] text-[var(--text-muted)]">Nothing yet. What you ask about this project, and the answers, will be listed here.</p>
        ) : (
          listed.map((session) => (
            <button key={session.id} type="button" onClick={() => onOpenSession(session.id)} className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md border-0 bg-transparent px-1.5 py-1.5 text-left hover:bg-[var(--surface-hover)]">
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-[var(--text-muted)]">
                  <Time size={13} />
                </span>
                <span className="truncate text-[13px] text-[var(--text-primary)]">{session.title || UNTITLED_SESSION_TITLE}</span>
                {streaming[session.id] && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[10.5px] font-medium text-[var(--accent-success)]">
                    <span className="size-1.5 rounded-full bg-current" style={{ animation: 'pulse-opacity 1.1s ease-in-out infinite' }} />
                    Working
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[11.5px] text-[var(--text-muted)]">{relativeTime(session.updatedAt || session.createdAt, now)}</span>
            </button>
          ))
        )}
      </Card>
    </div>
  )
}
