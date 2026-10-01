import { useState } from 'react'
import { MarkdownView } from '@renderer/components/ui/MarkdownView'
import { SkillFileTree } from './SkillFileTree'
import { splitFrontmatter } from './skillContent'
import { deleteSkill, setSkillEnabled } from './skillsApi'
import type { Skill } from './skillsTypes'
import { MAIN_FILE, useSkillFiles } from './useSkillFiles'

type Props = {
  skill: Skill
  onClose: () => void
  onChanged: () => void
}

export function SkillDetailModal({ skill, onClose, onChanged }: Props) {
  const { tree, selected, setSelected, content, loading } = useSkillFiles(skill.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggleEnabled() {
    setBusy(true)
    setError(null)
    try {
      await setSkillEnabled(skill.name, !skill.enabled)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this skill.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${skill.display_name || skill.name}"? This cannot be undone.`)) return
    setBusy(true)
    setError(null)
    try {
      await deleteSkill(skill.name)
      onChanged()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this skill.')
      setBusy(false)
    }
  }

  const isMain = selected !== null && MAIN_FILE.test(selected.split('/').pop() ?? '')
  const { frontmatter, body } = isMain ? splitFrontmatter(content) : { frontmatter: '', body: content }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-8 py-8 backdrop-blur-sm">
      <div className="relative flex h-full max-h-[760px] w-full max-w-[980px] flex-col overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-root)] shadow-[0_26px_90px_rgba(0,0,0,0.45)]">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 z-10 flex size-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]">
          <CloseIcon />
        </button>

        <div className="shrink-0 border-b border-[var(--border-soft)] px-6 pb-4 pt-5">
          <span className="rounded bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">{skill.collection || skill.source}</span>
          <h2 className="mt-2 pr-10 text-[18px] font-semibold text-[var(--text-primary)]">{skill.display_name || skill.name}</h2>
          <div className="mt-1 text-[12px] text-[var(--text-muted)]">
            {skill.source}{skill.version ? ` · v${skill.version}` : ''}
          </div>
          {skill.description && <p className="mt-2 max-w-[760px] text-[12.5px] leading-5 text-[var(--text-secondary)]">{skill.description}</p>}
          <div className="mt-4 flex items-center gap-2">
            <button type="button" disabled={busy} onClick={() => void toggleEnabled()} className="h-7 rounded-lg bg-[var(--text-primary)] px-3 text-[12px] font-semibold text-[var(--surface-root)] hover:opacity-90 disabled:opacity-50">
              {skill.enabled ? 'Disable' : 'Enable'}
            </button>
            {skill.source === 'userSettings' && (
              <button type="button" disabled={busy} onClick={() => void remove()} className="h-7 rounded-lg border border-[var(--border-soft)] px-3 text-[12px] font-semibold text-[var(--accent-danger)] hover:bg-[var(--surface-muted)] disabled:opacity-50">
                Delete
              </button>
            )}
          </div>
          {error && <p className="mt-3 text-[12.5px] font-semibold text-[var(--accent-danger)]">{error}</p>}
        </div>

        <div className="flex min-h-0 flex-1">
          {tree.length > 0 && (
            <div className="no-scrollbar w-[200px] shrink-0 overflow-y-auto border-r border-[var(--border-soft)] p-2">
              <SkillFileTree nodes={tree} selected={selected ?? ''} onSelect={setSelected} />
            </div>
          )}
          <div className="no-scrollbar min-w-0 flex-1 overflow-y-auto px-6 py-4">
            {loading ? (
              <p className="text-[13px] text-[var(--text-muted)]">Loading...</p>
            ) : (
              <>
                {frontmatter && (
                  <pre className="mb-5 whitespace-pre-wrap break-words rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 py-3 font-mono text-[12px] leading-5 text-[var(--text-secondary)]">{frontmatter}</pre>
                )}
                {isMain || /\.(md|markdown)$/i.test(selected ?? '') ? (
                  <MarkdownView>{body}</MarkdownView>
                ) : (
                  <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[12px] leading-5 text-[var(--text-secondary)]">{body}</pre>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function CloseIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
}
