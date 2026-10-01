import { useMemo, useState } from 'react'
import { useDialogsStore } from '@renderer/stores/dialogs'
import { SkillCard } from './SkillCard'
import { SkillDetailModal } from './SkillDetailModal'
import { filterSkills, useSkills } from './useSkills'

export function SkillsPage() {
  const { skills, collections, loading, error, reload } = useSkills()
  const openConfig = useDialogsStore((state) => state.openConfig)
  const [query, setQuery] = useState('')
  const [collection, setCollection] = useState('all')
  const [enabledOnly, setEnabledOnly] = useState(false)
  const [selectedName, setSelectedName] = useState<string | null>(null)

  const visible = useMemo(() => filterSkills(skills, { query, collection, enabledOnly }), [skills, query, collection, enabledOnly])

  // Derived from the live list rather than stored, so the open modal's
  // Enable/Disable label follows the refetch after a toggle.
  const selected = skills.find((skill) => skill.name === selectedName) ?? null

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-8 pt-4">
      <div className="flex shrink-0 items-center justify-between">
        <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">Skills</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEnabledOnly((value) => !value)}
            className={['h-7 rounded-lg border px-3 text-[12px] font-semibold transition-colors', enabledOnly ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)] text-[var(--accent-primary)]' : 'border-[var(--border-soft)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]'].join(' ')}
          >
            My skills
          </button>
          <button type="button" onClick={() => openConfig('skills')} className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-3 text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]">
            <PlusIcon />
            Add skills
          </button>
        </div>
      </div>

      <div className="relative mt-3 shrink-0">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"><SearchIcon /></span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search skills"
          className="h-9 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] pl-9 pr-3 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
        />
      </div>

      {collections.length > 0 && (
        <div className="no-scrollbar mt-3 flex shrink-0 gap-1.5 overflow-x-auto">
          {['all', ...collections].map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setCollection(id)}
              className={['h-7 shrink-0 rounded-full px-3 text-[12px] font-semibold capitalize transition-colors', collection === id ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'].join(' ')}
            >
              {id === 'all' ? 'All' : id}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-4 shrink-0 text-[12.5px] font-semibold text-[var(--accent-danger)]">{error}</p>}

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-[13px] font-semibold text-[var(--text-muted)]">Loading...</div>
      ) : visible.length === 0 ? (
        <div className="flex flex-1 items-center justify-center pb-16 text-[13px] font-semibold text-[var(--text-muted)]">
          {skills.length === 0 ? 'No skills yet - add a repository to get started.' : 'No skills match your filters.'}
        </div>
      ) : (
        <div className="no-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto pb-8">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
            {visible.map((skill) => <SkillCard key={skill.name} skill={skill} onOpen={() => setSelectedName(skill.name)} />)}
          </div>
        </div>
      )}

      {selected && <SkillDetailModal skill={selected} onClose={() => setSelectedName(null)} onChanged={() => void reload()} />}
    </section>
  )
}

function PlusIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
}

function SearchIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></svg>
}
