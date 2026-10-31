import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { CheckOne, Left, More } from '@icon-park/react'
import { CodeBox } from '@renderer/components/chat/tools/common'
import { languageForPath } from '@renderer/components/chat/tools/helpers'
import { Dropdown, type DropdownItem } from '@renderer/components/ui/Dropdown'
import { MarkdownView } from '@renderer/components/ui/MarkdownView'
import { ToastStack, useToast } from '@renderer/components/ui/Toast'
import { SkillFileTree } from './SkillFileTree'
import { SkillIconPicker } from './SkillIconPicker'
import { SkillMark } from './SkillIconTile'
import { repoLogo } from './skillLogos'
import { tagsFor, type SkillIconId } from './skillIcons'
import { splitFrontmatter } from './skillContent'
import { deleteSkill, setSkillEnabled } from './skillsApi'
import type { Skill, TreeNode } from './skillsTypes'
import { MAIN_FILE, useSkillFiles } from './useSkillFiles'
import { useSkillIcons } from './useSkillIcons'
import { useSkills } from './useSkills'

const SOURCE_LABEL: Record<string, string> = { bundled: 'Built-in', userSettings: 'Yours', managed: 'Managed', plugin: 'Plugin', mcp: 'MCP' }

function countFiles(nodes: TreeNode[]): number {
  return nodes.reduce((total, node) => total + (node.is_dir ? countFiles(node.children ?? []) : 1), 0)
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-3.5">
      <h2 className="m-0 mb-2 text-[13px] font-semibold text-[var(--text-primary)]">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-[12px]">
      <span className="shrink-0 text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 text-right text-[var(--text-primary)]">{children}</span>
    </div>
  )
}

const ACTION = 'flex h-8 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--border-soft)] bg-transparent px-3 text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'

/** A skill opened on its own page: its files as a tree, the file read beside it, and what the skill is in a column. */
export function SkillDetailPage() {
  const { name = '' } = useParams()
  const navigate = useNavigate()
  const { skills, loading, reload } = useSkills()
  const { iconOf, isChosen, choose } = useSkillIcons()
  const { toasts, show } = useToast()
  const [picking, setPicking] = useState(false)
  const skill = skills.find((item) => item.name === name) ?? null

  if (!skill) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <h2 className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">{loading ? 'Loading...' : 'Skill not found'}</h2>
        {!loading && (
          <button type="button" onClick={() => navigate('/skills')} className="mt-2 cursor-pointer rounded-lg border border-[var(--border-soft)] bg-transparent px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]">
            Back to Skills
          </button>
        )}
      </div>
    )
  }

  async function toggle(target: Skill) {
    try {
      await setSkillEnabled(target.name, !target.enabled)
      await reload()
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not update this skill.', 'err')
    }
  }

  async function remove(target: Skill) {
    if (!window.confirm(`Delete "${target.display_name || target.name}"? This cannot be undone.`)) return
    try {
      await deleteSkill(target.name)
      navigate('/skills')
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not delete this skill.', 'err')
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <Body skill={skill} icon={iconOf(skill)} logo={isChosen(skill.name) ? undefined : repoLogo(skill.collection)} onToggle={() => void toggle(skill)} onRemove={() => void remove(skill)} onChangeIcon={() => setPicking(true)} onBack={() => navigate('/skills')} />
      {picking && <SkillIconPicker skillName={skill.name} current={iconOf(skill)} chosen={isChosen(skill.name)} onPick={(icon) => choose(skill.name, icon)} onClose={() => setPicking(false)} />}
      <ToastStack toasts={toasts} />
    </div>
  )
}

type BodyProps = {
  skill: Skill
  icon: SkillIconId
  logo?: string
  onToggle: () => void
  onRemove: () => void
  onChangeIcon: () => void
  onBack: () => void
}

function Body({ skill, icon, logo, onToggle, onRemove, onChangeIcon, onBack }: BodyProps) {
  const { tree, selected, setSelected, content, loading } = useSkillFiles(skill.name)
  const [source, setSource] = useState(false)
  const tags = useMemo(() => tagsFor(skill, 6), [skill])
  const owned = skill.source === 'userSettings'
  const title = skill.display_name || skill.name

  const isMain = selected !== null && MAIN_FILE.test(selected.split('/').pop() ?? '')
  const isMarkdown = isMain || /\.(md|markdown|mdx)$/i.test(selected ?? '')
  const { frontmatter, body } = isMain ? splitFrontmatter(content) : { frontmatter: '', body: content }
  const fileName = selected?.split('/').pop() ?? ''

  const menu: DropdownItem[] = [
    { id: 'icon', label: 'Change icon', onSelect: onChangeIcon },
    ...(owned ? [{ id: 'delete', label: 'Delete', danger: true, onSelect: onRemove }] : [])
  ]

  return (
    <>
      <header className="shrink-0 px-6 pt-4">
        <button type="button" onClick={onBack} className="mb-2 flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[12.5px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <Left theme="outline" size={13} />
          Skills
        </button>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3.5">
            <SkillMark icon={icon} logo={logo} title={title} size={56} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="m-0 truncate text-[20px] font-semibold text-[var(--text-primary)]">{title}</h1>
                {!owned && (
                  <span className="shrink-0 text-[var(--accent-primary)]" title="Official">
                    <CheckOne theme="filled" size={16} fill="currentColor" />
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                {skill.version ? `v${skill.version} · ` : ''}
                {SOURCE_LABEL[skill.source] ?? skill.source}
                {skill.collection && skill.collection !== skill.source ? ` · ${skill.collection}` : ''}
              </div>
              {skill.description && <p className="m-0 mt-1.5 max-w-[760px] text-[13px] leading-5 text-[var(--text-secondary)]">{skill.description}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onToggle}
              className={`h-9 cursor-pointer rounded-lg px-4 text-[13px] font-semibold ${skill.enabled ? 'border border-[var(--border-soft)] bg-[var(--surface-panel)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]' : 'border-0 bg-[var(--accent-primary)] text-white hover:opacity-90'}`}
            >
              {skill.enabled ? 'Turn off' : 'Turn on'}
            </button>
            <Dropdown
              label="More about this skill"
              items={menu}
              trigger={({ toggle }) => (
                <button type="button" aria-label="More about this skill" onClick={toggle} className="flex size-9 cursor-pointer items-center justify-center rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
                  <More theme="outline" size={16} />
                </button>
              )}
            />
          </div>
        </div>
      </header>

      <div className="mt-3 flex min-h-0 flex-1 gap-3 px-6 pb-3">
        <aside className="flex w-[250px] shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)]">
          <h2 className="m-0 shrink-0 px-3.5 pb-1 pt-3 text-[13px] font-semibold text-[var(--text-primary)]">Skill files</h2>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
            {tree.length > 0 ? <SkillFileTree nodes={tree} selected={selected ?? ''} onSelect={setSelected} /> : <p className="m-0 px-2 py-1 text-[12px] text-[var(--text-muted)]">{loading ? 'Loading...' : 'No files.'}</p>}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)]">
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-soft)] px-4 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{fileName || title}</div>
              <div className="truncate font-mono text-[10.5px] text-[var(--text-muted)]">{selected ?? ''}</div>
            </div>
            {isMarkdown && !loading && (
              <div className="flex rounded-lg border border-[var(--border-soft)] p-0.5 text-[11.5px]" role="group" aria-label="View">
                {([false, true] as const).map((value) => (
                  <button
                    key={String(value)}
                    type="button"
                    aria-pressed={source === value}
                    onClick={() => setSource(value)}
                    className={`cursor-pointer rounded-md border-0 px-2 py-0.5 ${source === value ? 'bg-[color-mix(in_srgb,var(--accent-primary)_18%,transparent)] text-[var(--accent-primary)]' : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                  >
                    {value ? 'Source' : 'Preview'}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="no-scrollbar min-h-0 flex-1 overflow-auto">
            {loading ? (
              <p className="m-0 p-6 text-[13px] text-[var(--text-muted)]">Loading...</p>
            ) : isMarkdown && !source ? (
              <div className="mx-auto max-w-[860px] px-6 py-5">
                {frontmatter && <pre className="mb-5 whitespace-pre-wrap break-words rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-4 py-3 font-mono text-[12px] leading-5 text-[var(--text-secondary)]">{frontmatter}</pre>}
                <MarkdownView variant="document">{body}</MarkdownView>
              </div>
            ) : (
              <CodeBox content={content.replace(/\r?\n$/, '') || ' '} language={isMarkdown ? 'markdown' : languageForPath(selected ?? '')} lineNumbers expanded bare />
            )}
          </div>
        </main>

        <aside className="no-scrollbar flex w-[290px] shrink-0 flex-col gap-3 overflow-y-auto">
          <Card title="Overview">
            <Row label="Type">{SOURCE_LABEL[skill.source] ?? skill.source}</Row>
            {skill.version && <Row label="Version">{skill.version}</Row>}
            {skill.collection && <Row label="Collection">{skill.collection}</Row>}
            <Row label="Status">{skill.enabled ? 'On' : 'Off'}</Row>
            <Row label="Files">{countFiles(tree)}</Row>
          </Card>
          <Card title="Quick actions">
            <div className="flex flex-col gap-2">
              <button type="button" onClick={onToggle} className={ACTION}>
                {skill.enabled ? 'Turn off' : 'Turn on'}
              </button>
              <button type="button" onClick={onChangeIcon} className={ACTION}>
                Change icon
              </button>
              {owned && (
                <button type="button" onClick={onRemove} className={`${ACTION} text-[var(--accent-danger)]`}>
                  Delete
                </button>
              )}
            </div>
          </Card>
          {tags.length > 0 && (
            <Card title="Tags">
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span key={tag} className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
                    {tag}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </aside>
      </div>
    </>
  )
}
