import type { ReactNode } from 'react'
import type { Skill } from './skillsTypes'

export function SkillCard({ skill, onOpen }: { skill: Skill; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-3 text-left transition-colors hover:bg-[var(--surface-muted)]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-[var(--text-secondary)]"><SkillIcon /></span>
        {skill.enabled && <span className="text-[var(--accent-primary)]" title="Enabled"><CheckIcon /></span>}
      </div>
      <div className="mt-2.5 truncate text-[13px] font-semibold text-[var(--text-primary)]">{skill.display_name || skill.name}</div>
      <p className="mt-0.5 line-clamp-2 min-h-[34px] text-[11.5px] leading-[17px] text-[var(--text-muted)]">{skill.description}</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Badge>{skill.source}</Badge>
        {skill.collection && skill.collection !== skill.source && <Badge>{skill.collection}</Badge>}
      </div>
    </button>
  )
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">{children}</span>
}

function CheckIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7" /></svg>
}

function SkillIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2v5M12 17v5M4.2 4.2l3.5 3.5M16.3 16.3l3.5 3.5M2 12h5M17 12h5M4.2 19.8l3.5-3.5M16.3 7.7l3.5-3.5" /></svg>
}
