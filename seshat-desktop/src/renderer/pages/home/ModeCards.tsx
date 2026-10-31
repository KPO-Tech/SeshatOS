import type { ReactNode } from 'react'
import { CheckCorrect, Compass, Layers, Lightning } from '@icon-park/react'

export type HomeMode = 'chat' | 'task'

type Props = {
  mode: HomeMode
  onChat: () => void
  onProject: () => void
  onTask: () => void
  onSkills: () => void
}

function ModeCard({ icon, title, text, selected, onClick }: { icon: ReactNode; title: string; text: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex min-w-0 cursor-pointer flex-col items-start gap-1.5 rounded-2xl border p-4 text-left transition-colors ${
        selected
          ? 'border-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_10%,var(--surface-panel))]'
          : 'border-[var(--border-soft)] bg-[var(--surface-panel)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]'
      }`}
    >
      <span className="mb-1 flex text-[var(--accent-primary)]">{icon}</span>
      <span className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</span>
      <span className="text-[12.5px] leading-[18px] text-[var(--text-secondary)]">{text}</span>
    </button>
  )
}

/** The four ways to begin: talk, work in a project, hand a task to the background, find skills. */
export function ModeCards({ mode, onChat, onProject, onTask, onSkills }: Props) {
  return (
    <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
      <ModeCard icon={<Lightning theme="outline" size={26} />} title="Chat" text="Ask, analyze, create and solve problems with your agents." selected={mode === 'chat'} onClick={onChat} />
      <ModeCard icon={<Layers theme="outline" size={26} />} title="Work on a project" text="Use your files, code and tools in a dedicated workspace." selected={false} onClick={onProject} />
      <ModeCard icon={<CheckCorrect theme="outline" size={26} />} title="Automate a task" text="Run repetitive work in the background." selected={mode === 'task'} onClick={onTask} />
      <ModeCard icon={<Compass theme="outline" size={26} />} title="Explore skills" text="Find and install skills to extend your agents' capabilities." selected={false} onClick={onSkills} />
    </div>
  )
}
