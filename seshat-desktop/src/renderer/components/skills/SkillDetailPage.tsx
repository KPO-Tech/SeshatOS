import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { CheckOne, FileText, FolderClose as Folder, Left, More } from '@icon-park/react'
import { Dropdown, type DropdownItem } from '@renderer/components/ui/Dropdown'
import { copyItem, openItem } from '@renderer/components/ui/menuItems'
import { SourceLink } from '@renderer/components/ui/SourceLink'
import { TabBar, type TabItem } from '@renderer/components/ui/TabBar'
import { ToastStack, useToast } from '@renderer/components/ui/Toast'
import { FileContentView } from '@renderer/components/files/FileContentView'
import { FileTreeView } from '@renderer/components/files/FileTreeView'
import { frontmatterFields, splitFrontmatter } from '@renderer/components/files/frontmatter'
import { SkillIconPicker } from './SkillIconPicker'
import { SkillMark } from './SkillIconTile'
import { repoLogo } from './skillLogos'
import { tagsFor, type SkillIconId } from './skillIcons'
import { deleteSkill, setSkillEnabled } from './skillsApi'
import type { Skill, TreeNode } from './skillsTypes'
import { useSkillFiles } from './useSkillFiles'
import { useSkillIcons } from './useSkillIcons'
import { useSkillCatalog } from './useSkillCatalog'
import { useSkills } from './useSkills'
import { useTranslation } from 'react-i18next'
import { confirmAction } from '@renderer/components/ui/confirm/confirmAction'

// The values are keys of the catalogue; the page translates them.
const SOURCE_LABEL: Record<string, string> = {
  bundled: 'skills:skills.skillDetailPage.sourceBundled',
  userSettings: 'skills:skills.skillDetailPage.sourceYours',
  managed: 'skills:skills.skillDetailPage.sourceManaged',
  plugin: 'skills:skills.skillDetailPage.sourcePlugin',
  mcp: 'skills:skills.skillDetailPage.sourceMcp'
}

type Tab = 'overview' | 'files'

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

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">{label}</div>
      <div className="text-[13px] leading-[1.6] text-[var(--text-primary)]">{children}</div>
    </div>
  )
}

const ACTION = 'flex h-8 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--border-soft)] bg-transparent px-3 text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'

/** A skill opened on its own page: its files as a tree, the file read beside it, and what the skill is in a column. */
export function SkillDetailPage() {
  const { t } = useTranslation('skills')
  const { name = '' } = useParams()
  const navigate = useNavigate()
  const { skills, loading, reload } = useSkills()
  const { sourceOf } = useSkillCatalog()
  const { iconOf, isChosen, choose } = useSkillIcons()
  const { toasts, show } = useToast()
  const [picking, setPicking] = useState(false)
  const skill = skills.find((item) => item.name === name) ?? null

  if (!skill) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <h2 className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">{loading ? t('skills.skillDetailPage.loading') : t('skills.skillDetailPage.skillNotFound')}</h2>
        {!loading && (
          <button type="button" onClick={() => navigate('/skills')} className="mt-2 cursor-pointer rounded-lg border border-[var(--border-soft)] bg-transparent px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]">
            {t('skills.skillDetailPage.backToSkills')}
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
    if (!(await confirmAction(t('skills.skillDetailPage.confirmDelete', { name: target.display_name || target.name })))) return
    try {
      await deleteSkill(target.name)
      navigate('/skills')
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not delete this skill.', 'err')
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <Body skill={skill} icon={iconOf(skill)} logo={isChosen(skill.name) ? undefined : repoLogo(skill.collection)} repoUrl={sourceOf(skill.collection)} onNotice={(message) => show(message)} onToggle={() => void toggle(skill)} onRemove={() => void remove(skill)} onChangeIcon={() => setPicking(true)} onBack={() => navigate('/skills')} />
      {picking && <SkillIconPicker skillName={skill.name} current={iconOf(skill)} chosen={isChosen(skill.name)} onPick={(icon) => choose(skill.name, icon)} onClose={() => setPicking(false)} />}
      <ToastStack toasts={toasts} />
    </div>
  )
}

type BodyProps = {
  skill: Skill
  icon: SkillIconId
  logo?: string
  repoUrl?: string
  onNotice: (message: string) => void
  onToggle: () => void
  onRemove: () => void
  onChangeIcon: () => void
  onBack: () => void
}

function Body({ skill, icon, logo, repoUrl, onNotice, onToggle, onRemove, onChangeIcon, onBack }: BodyProps) {
  const { t } = useTranslation('skills')
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'files' ? 'files' : 'overview'
  const goTo = (next: Tab) => setParams(next === 'overview' ? {} : { tab: next }, { replace: true })
  const { tree, source, selected, setSelected, loading, readText, mainPath } = useSkillFiles(skill.name)
  const tags = useMemo(() => tagsFor(skill, 6), [skill])
  const owned = skill.source === 'userSettings'
  const title = skill.display_name || skill.name
  // What the skill says of itself in its SKILL.md (its license, what it needs), read once the tree is known.
  const [fields, setFields] = useState<Record<string, string>>({})
  useEffect(() => {
    if (loading) return
    let cancelled = false
    readText(mainPath)
      .then((text) => !cancelled && setFields(frontmatterFields(splitFrontmatter(text).frontmatter)))
      .catch(() => !cancelled && setFields({}))
    return () => {
      cancelled = true
    }
  }, [loading, readText, mainPath])
  const tools = (fields['allowed-tools'] ?? '').split(/[\s,]+/).filter(Boolean)
  const kind = SOURCE_LABEL[skill.source] ? t(SOURCE_LABEL[skill.source]) : skill.source

  const menu: DropdownItem[] = [
    { id: 'icon', label: t('skills.skillDetailPage.changeIcon'), onSelect: onChangeIcon },
    ...(repoUrl ? [openItem('source', t('skills.skillDetailPage.openSource'), repoUrl)] : []),
    copyItem('copy', t('skills.skillDetailPage.copyName'), skill.name, onNotice),
    ...(owned ? [{ id: 'delete', label: t('skills.skillDetailPage.delete'), danger: true, onSelect: onRemove }] : [])
  ]
  const tabs: TabItem<Tab>[] = [
    { id: 'overview', label: t('skills.skillDetailPage.overview'), icon: <Folder size={14} /> },
    { id: 'files', label: t('skills.skillDetailPage.files'), icon: <FileText size={14} />, count: countFiles(tree) }
  ]

  return (
    <>
      <header className="shrink-0 px-6 pt-4">
        <button type="button" onClick={onBack} className="mb-2 flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[12.5px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <Left theme="outline" size={13} />
          {t('skills.skillDetailPage.skills')}
        </button>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3.5">
            <SkillMark icon={icon} logo={logo} title={title} size={56} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="m-0 truncate text-[20px] font-semibold text-[var(--text-primary)]">{title}</h1>
                {!owned && (
                  <span className="shrink-0 text-[var(--accent-primary)]" title={t('skills.skillDetailPage.official')}>
                    <CheckOne theme="filled" size={16} fill="currentColor" />
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                {skill.version ? `v${skill.version} · ` : ''}
                {kind}
                {skill.collection && skill.collection !== skill.source ? ` · ${skill.collection}` : ''}
              </div>
              {repoUrl && <SourceLink url={repoUrl} className="mt-1" />}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onToggle}
              className={`h-9 cursor-pointer rounded-lg px-4 text-[13px] font-semibold ${skill.enabled ? 'border border-[var(--border-soft)] bg-[var(--surface-panel)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]' : 'border-0 bg-[var(--accent-primary)] text-white hover:opacity-90'}`}
            >
              {skill.enabled ? t('skills.skillDetailPage.turnOff') : t('skills.skillDetailPage.turnOn')}
            </button>
            <Dropdown
              label={t('skills.skillDetailPage.moreAboutThisSkill')}
              items={menu}
              trigger={({ toggle }) => (
                <button type="button" aria-label={t('skills.skillDetailPage.moreAboutThisSkill')} onClick={toggle} className="flex size-9 cursor-pointer items-center justify-center rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
                  <More theme="outline" size={16} />
                </button>
              )}
            />
          </div>
        </div>
      </header>
      <TabBar tabs={tabs} value={tab} onChange={goTo} ariaLabel={title} className="mt-3" />

      {tab === 'overview' ? (
        <div className="no-scrollbar flex min-h-0 flex-1 gap-3 overflow-y-auto px-6 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <Card title={t('skills.skillDetailPage.about')}>
              {skill.description ? (
                <p className="m-0 max-w-[760px] text-[14px] leading-[1.75] text-[var(--text-secondary)]">{skill.description}</p>
              ) : (
                <p className="m-0 text-[13px] text-[var(--text-muted)]">{t('skills.skillDetailPage.noDescription')}</p>
              )}
              {tags.length > 0 && (
                <div className="mt-3.5 flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span key={tag} className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </Card>
            {(fields.license || fields.compatibility || tools.length > 0) && (
              <Card title={t('skills.skillDetailPage.requirements')}>
                <div className="flex flex-col gap-3">
                  {fields.license && <Fact label={t('skills.skillDetailPage.license')}>{fields.license}</Fact>}
                  {fields.compatibility && <Fact label={t('skills.skillDetailPage.compatibility')}>{fields.compatibility}</Fact>}
                  {tools.length > 0 && (
                    <Fact label={t('skills.skillDetailPage.allowedTools')}>
                      <span className="flex flex-wrap gap-1.5">
                        {tools.map((tool) => (
                          <span key={tool} className="rounded-md border border-[var(--border-soft)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]">
                            {tool}
                          </span>
                        ))}
                      </span>
                    </Fact>
                  )}
                </div>
              </Card>
            )}
          </div>

          <aside className="flex w-[290px] shrink-0 flex-col gap-3">
            <Card title={t('skills.skillDetailPage.details')}>
              <Row label={t('skills.skillDetailPage.type')}>{kind}</Row>
              {skill.version && <Row label={t('skills.skillDetailPage.version')}>{skill.version}</Row>}
              {skill.collection && <Row label={t('skills.skillDetailPage.collection')}>{skill.collection}</Row>}
              <Row label={t('skills.skillDetailPage.status')}>{skill.enabled ? t('skills.skillDetailPage.on') : t('skills.skillDetailPage.off')}</Row>
              <Row label={t('skills.skillDetailPage.files')}>{countFiles(tree)}</Row>
            </Card>
            <Card title={t('skills.skillDetailPage.quickActions')}>
              <div className="flex flex-col gap-2">
                <button type="button" onClick={onToggle} className={ACTION}>
                  {skill.enabled ? t('skills.skillDetailPage.turnOff') : t('skills.skillDetailPage.turnOn')}
                </button>
                <button type="button" onClick={() => goTo('files')} className={ACTION}>
                  {t('skills.skillDetailPage.browseFiles')}
                </button>
                <button type="button" onClick={onChangeIcon} className={ACTION}>
                  {t('skills.skillDetailPage.changeIcon')}
                </button>
                {owned && (
                  <button type="button" onClick={onRemove} className={`${ACTION} text-[var(--accent-danger)]`}>
                    {t('skills.skillDetailPage.delete')}
                  </button>
                )}
              </div>
            </Card>
          </aside>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 px-6 pb-3 pt-3">
          <aside className="flex w-[270px] shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)]">
            {tree.length > 0 ? (
              <FileTreeView source={source} title={t('skills.skillDetailPage.skillFiles')} selectedPath={selected} onOpenFile={setSelected} />
            ) : (
              <>
                <h2 className="m-0 shrink-0 px-3.5 pb-1 pt-3 text-[13px] font-semibold text-[var(--text-primary)]">{t('skills.skillDetailPage.skillFiles')}</h2>
                <p className="m-0 px-3.5 py-1 text-[12px] text-[var(--text-muted)]">{loading ? t('skills.skillDetailPage.loading') : t('skills.skillDetailPage.noFiles')}</p>
              </>
            )}
          </aside>
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)]">
            {selected ? (
              <FileContentView path={selected} relativePath={selected} readText={readText} frontmatter />
            ) : (
              <p className="m-0 p-6 text-[13px] text-[var(--text-muted)]">{t('skills.skillDetailPage.loading')}</p>
            )}
          </main>
        </div>
      )}
    </>
  )
}
