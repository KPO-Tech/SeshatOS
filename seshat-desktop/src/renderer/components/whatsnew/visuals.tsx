import type { ReactNode } from 'react'
import type { VisualId } from '@renderer/lib/whatsNew'
import { useTranslation } from 'react-i18next'

// Small drawings of what changed, made of the same colours as the app, so that they follow the theme and the accent.

const card = 'rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)]'
const accent = 'bg-[var(--accent-primary)]'
const line = 'h-1.5 rounded-full bg-[var(--border-strong)]'

function Check({ className = '' }: { className?: string }) {
  return (
    <span className={`flex size-4 items-center justify-center rounded-full ${accent} text-white ${className}`}>
      <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m3.5 8.5 3 3 6-7" />
      </svg>
    </span>
  )
}

/** The three themes as small windows, and the colours of the accent under them, the first one picked. */
function Look() {
  const themes = [
    { name: 'Dark', bg: '#26262b', bar: '#34343b', picked: true },
    { name: 'Light', bg: '#f4f5f8', bar: '#e2e4ea', picked: false },
    { name: 'Midnight', bg: '#0e1530', bar: '#1b2548', picked: false }
  ]
  const accents = ['#ef7c2f', '#3b82f6', '#8b5cf6', '#ec4899', '#22a55b', '#14b8a6']
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex gap-4">
        {themes.map((theme) => (
          <div key={theme.name} className="flex flex-col items-center gap-1.5">
            <div className={`relative h-[88px] w-[116px] rounded-xl border-2 p-2 ${theme.picked ? 'border-[var(--accent-primary)]' : 'border-transparent'}`} style={{ background: theme.bg }}>
              <div className="h-1.5 w-10 rounded-full" style={{ background: theme.bar }} />
              <div className="mt-2 h-1.5 w-16 rounded-full" style={{ background: theme.bar }} />
              <div className="absolute bottom-2 right-2 h-3 w-7 rounded-md bg-[var(--accent-primary)]" />
              {theme.picked && <Check className="absolute -right-1.5 -top-1.5" />}
            </div>
            <span className="text-[11px] text-[var(--text-secondary)]">{theme.name}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2.5">
        {accents.map((color, index) => (
          <span key={color} className={`size-5 rounded-full ${index === 0 ? 'ring-2 ring-[var(--text-primary)] ring-offset-2 ring-offset-[var(--surface-root)]' : ''}`} style={{ background: color }} />
        ))}
      </div>
    </div>
  )
}

/** The card of the sidebar with two tasks, and a bar going. */
function Tasks() {
  const { t } = useTranslation('shell')
  return (
    <div className={`${card} w-[280px] p-3.5 shadow-lg`}>
      <div className="mb-2.5 flex gap-1.5">
        <span className={`flex size-5 items-center justify-center rounded-md ${accent} text-[11px] font-semibold text-white`}>1</span>
        <span className="flex size-5 items-center justify-center rounded-md border border-[var(--border-soft)] text-[11px] font-semibold text-[var(--accent-primary)]">2</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-[var(--text-primary)]">{t('whatsnew.visuals.downloadingPaperasse')}</span>
        <span className="text-[12px] text-[var(--text-muted)]">×</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border-soft)]">
        <div className={`h-full w-[62%] rounded-full ${accent}`} />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-[var(--text-muted)]">
        <span>{t('whatsnew.visuals.downloadingTheSkills1Of')}</span>
        <span>12 s</span>
      </div>
      <div className="mt-1 font-mono text-[10.5px] text-[var(--text-faint)]">{t('whatsnew.visuals.ro6221Mib')}</div>
    </div>
  )
}

/** The bell with its count, and what it keeps. */
function Bell() {
  const { t } = useTranslation('shell')
  const items = [
    { title: t('whatsnew.visuals.paperasseIsReady'), text: t('whatsnew.visuals.theInstallationIsDone'), ok: true },
    { title: t('whatsnew.visuals.theAgentHasFinished'), text: t('whatsnew.visuals.gradientDescentIllustration'), ok: true },
    { title: t('whatsnew.visuals.installingStrixFailed'), text: t('whatsnew.visuals.dockerIsNotRunning'), ok: false }
  ]
  return (
    <div className="relative w-[300px]">
      <div className="mb-2 flex justify-end">
        <span className="relative flex size-8 items-center justify-center rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] text-[var(--text-secondary)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
            <path d="M10 21a2 2 0 0 0 4 0" />
          </svg>
          <span className={`absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full ${accent} text-[9px] font-semibold text-white`}>3</span>
        </span>
      </div>
      <div className={`${card} overflow-hidden shadow-lg`}>
        {items.map((item, index) => (
          <div key={item.title} className={`flex items-start gap-2.5 px-3 py-2.5 ${index > 0 ? 'border-t border-[var(--border-soft)]' : ''}`}>
            <span className={`mt-0.5 size-2.5 shrink-0 rounded-full ${item.ok ? 'bg-[var(--accent-success)]' : 'bg-[var(--accent-danger)]'}`} />
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-semibold text-[var(--text-primary)]">{item.title}</span>
              <span className="block truncate text-[11px] text-[var(--text-muted)]">{item.text}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The start page: a greeting, five cards, and the input at the bottom. */
function Home() {
  const { t } = useTranslation('shell')
  const colors = ['var(--accent-primary)', '#8b5cf6', '#22a55b', '#3b82f6', '#ec4899']
  return (
    <div className={`${card} flex h-[190px] w-[360px] flex-col justify-between p-3.5 shadow-lg`}>
      <div>
        <span className="inline-block rounded-full border border-[var(--accent-primary)] px-2 py-px text-[9px] font-semibold text-[var(--accent-primary)]">{t('whatsnew.visuals.yourAiWorkspace')}</span>
        <div className="mt-1.5 text-[16px] font-bold text-[var(--text-primary)]">
          {t('shell:pages.homeStage.whatAreWe')} <span className="text-[var(--accent-primary)]">{t('whatsnew.visuals.workingOn')}</span>{t('shell:pages.homeStage.questionMark')}
        </div>
        <div className="mt-2.5 grid grid-cols-5 gap-1.5">
          {colors.map((color) => (
            <div key={color} className="rounded-lg border border-[var(--border-soft)] p-1.5">
              <span className="block size-2.5 rounded-sm" style={{ background: color }} />
              <span className={`mt-1.5 block w-4/5 ${line}`} />
              <span className={`mt-1 block w-3/5 ${line}`} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-2.5 py-2">
        <span className="text-[10px] text-[var(--text-muted)]">{t('whatsnew.visuals.askAnything')}</span>
        <span className={`flex size-4 items-center justify-center rounded-md ${accent} text-[9px] text-white`}>↑</span>
      </div>
    </div>
  )
}

/** One window of Settings: the list of pages, and cards that all look alike. */
function Settings() {
  const { t } = useTranslation('shell')
  const pages = ['General', 'Appearance', 'Providers', 'Skills']
  return (
    <div className={`${card} flex h-[190px] w-[360px] overflow-hidden shadow-lg`}>
      <div className="w-[96px] border-r border-[var(--border-soft)] p-2">
        {pages.map((page, index) => (
          <div key={page} className={`mb-1 rounded-md px-2 py-1 text-[10px] ${index === 1 ? `${accent} font-semibold text-white` : 'text-[var(--text-secondary)]'}`}>
            {page}
          </div>
        ))}
      </div>
      <div className="flex-1 p-3">
        <div className="text-[12px] font-semibold text-[var(--text-primary)]">{t('whatsnew.visuals.appearance')}</div>
        <div className="mt-2 space-y-2">
          {['Theme', 'Accent colour', 'Density'].map((name) => (
            <div key={name} className="flex items-center justify-between rounded-lg border border-[var(--border-soft)] px-2.5 py-2">
              <span className="text-[10px] text-[var(--text-primary)]">{name}</span>
              <span className={`h-2.5 w-[18px] rounded-full ${accent}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Project cards: a coloured folder, a name, a line, and tags. */
function Projects() {
  const { t } = useTranslation('shell')
  const projects = [
    { name: 'paperasse', color: '#f59e0b', tags: ['docs', 'fr'] },
    { name: 'seshat-os', color: 'var(--accent-primary)', tags: ['app'] }
  ]
  return (
    <div className="flex gap-3">
      {projects.map((project) => (
        <div key={project.name} className={`${card} w-[168px] p-3 shadow-lg`}>
          <span className="flex size-7 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${project.color} 22%, transparent)`, color: project.color }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </span>
          <div className="mt-2 text-[12.5px] font-semibold text-[var(--text-primary)]">{project.name}</div>
          <div className={`mt-2 w-full ${line}`} />
          <div className={`mt-1.5 w-2/3 ${line}`} />
          <div className="mt-2.5 flex gap-1">
            {project.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-[var(--border-soft)] px-1.5 text-[9px] text-[var(--text-muted)]">
                {tag}
              </span>
            ))}
          </div>
          <div className={`mt-3 flex h-6 items-center justify-center rounded-md ${accent} text-[10px] font-semibold text-white`}>{t('whatsnew.visuals.startSession')}</div>
        </div>
      ))}
    </div>
  )
}

/** A hub diagram and a quiz: what the agent draws instead of describing. */
function GenUi() {
  const spokes = [
    { x: 14, y: 14 },
    { x: 98, y: 14 },
    { x: 14, y: 78 },
    { x: 98, y: 78 }
  ]
  return (
    <div className="flex items-center gap-4">
      <div className={`${card} p-2.5 shadow-lg`}>
        <svg width="150" height="116" viewBox="0 0 150 116" fill="none" aria-hidden="true">
          {spokes.map((spoke) => (
            <line key={`l-${spoke.x}-${spoke.y}`} x1="75" y1="58" x2={spoke.x + 19} y2={spoke.y + 12} stroke="var(--border-strong)" strokeWidth="1.5" />
          ))}
          {spokes.map((spoke) => (
            <rect key={`b-${spoke.x}-${spoke.y}`} x={spoke.x} y={spoke.y} width="38" height="24" rx="6" fill="var(--surface-root)" stroke="var(--border-strong)" />
          ))}
          <rect x="50" y="42" width="50" height="32" rx="8" fill="var(--accent-primary)" />
          <rect x="60" y="54" width="30" height="4" rx="2" fill="white" opacity="0.9" />
          <rect x="64" y="62" width="22" height="3" rx="1.5" fill="white" opacity="0.6" />
        </svg>
      </div>
      <div className={`${card} w-[150px] p-3 shadow-lg`}>
        <div className={`w-4/5 ${line}`} />
        <div className="mt-2.5 space-y-1.5">
          {[false, true, false].map((picked, index) => (
            <div key={index} className={`flex items-center gap-1.5 rounded-md border px-1.5 py-1 ${picked ? 'border-[var(--accent-primary)]' : 'border-[var(--border-soft)]'}`}>
              {picked ? <Check /> : <span className="size-4 rounded-full border border-[var(--border-strong)]" />}
              <span className={`h-1.5 rounded-full ${picked ? 'w-12 bg-[var(--accent-primary)]' : 'w-14 bg-[var(--border-strong)]'}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** A browser window with a page the agent built, and the arrow that opens it outside. */
function Pages() {
  const bars = [38, 62, 48, 80, 56]
  return (
    <div className={`${card} w-[330px] overflow-hidden shadow-lg`}>
      <div className="flex items-center gap-1.5 border-b border-[var(--border-soft)] px-2.5 py-1.5">
        <span className="size-2 rounded-full bg-[var(--accent-danger)]" />
        <span className="size-2 rounded-full bg-[var(--accent-warning)]" />
        <span className="size-2 rounded-full bg-[var(--accent-success)]" />
        <span className="ml-2 flex-1 rounded-md bg-[var(--surface-root)] px-2 py-0.5 font-mono text-[9px] text-[var(--text-muted)]">dashboard.html</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 17 17 7M8 7h9v9" />
        </svg>
      </div>
      <div className="p-3">
        <div className={`w-1/3 ${line}`} />
        <div className="mt-3 flex h-[92px] items-end gap-2.5">
          {bars.map((height, index) => (
            <span key={index} className="flex-1 rounded-t-md" style={{ height: `${height}%`, background: index === 3 ? 'var(--accent-primary)' : 'var(--border-strong)' }} />
          ))}
        </div>
      </div>
    </div>
  )
}

/** The two languages, side by side, with the sidebar of the app in each. */
function Language() {
  const languages = [
    { code: 'EN', picked: false, items: ['New chat', 'Search', 'Skills'] },
    { code: 'FR', picked: true, items: ['Nouveau chat', 'Rechercher', 'Skills'] }
  ]
  return (
    <div className="flex gap-4">
      {languages.map((language) => (
        <div key={language.code} className={`${card} w-[150px] p-3 shadow-lg ${language.picked ? 'border-[var(--accent-primary)]' : ''}`}>
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[var(--text-primary)]">{language.code}</span>
            {language.picked && <Check />}
          </div>
          <div className="space-y-1.5">
            {language.items.map((item) => (
              <div key={item} className="rounded-md border border-[var(--border-soft)] px-2 py-1 text-[10.5px] text-[var(--text-secondary)]">
                {item}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Two cards of the catalog: one to install, one installed. */
function Skills() {
  const skills = [
    { name: 'ui-ux-pro-max', tag: 'Design', installed: false },
    { name: 'latex-document-skill', tag: 'Documents', installed: true }
  ]
  return (
    <div className="flex gap-3">
      {skills.map((skill) => (
        <div key={skill.name} className={`${card} w-[168px] p-3 shadow-lg`}>
          <span className={`flex size-7 items-center justify-center rounded-lg ${accent} text-[13px] font-bold text-white`}>{skill.name[0].toUpperCase()}</span>
          <div className="mt-2 truncate text-[11.5px] font-semibold text-[var(--text-primary)]">{skill.name}</div>
          <span className="mt-1.5 inline-block rounded-full border border-[var(--border-soft)] px-1.5 text-[9px] text-[var(--text-muted)]">{skill.tag}</span>
          <div className={`mt-2 w-full ${line}`} />
          <div className={`mt-1.5 w-3/4 ${line}`} />
          <div className={`mt-3 flex h-6 items-center justify-center gap-1 rounded-md text-[10px] font-semibold ${skill.installed ? 'border border-[var(--border-soft)] text-[var(--text-secondary)]' : `${accent} text-white`}`}>
            {skill.installed ? <Check /> : '↓'}
          </div>
        </div>
      ))}
    </div>
  )
}

/** The Changes card: pull requests with their checks, the first one ready to merge. */
function Changes() {
  const rows = [
    { done: true, width: 'w-32' },
    { done: false, width: 'w-24' },
    { done: true, width: 'w-28' }
  ]
  return (
    <div className={`${card} w-[300px] space-y-2 p-3 shadow-lg`}>
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-2.5 rounded-lg border border-[var(--border-soft)] px-2.5 py-2">
          {row.done ? <Check /> : <span className="size-4 rounded-full border-2 border-[var(--accent-warning)]" />}
          <span className={`h-1.5 rounded-full bg-[var(--border-strong)] ${row.width}`} />
          {index === 0 && <span className={`ml-auto flex h-5 items-center rounded-md px-2 text-[9px] font-semibold text-white ${accent}`}>Merge</span>}
        </div>
      ))}
    </div>
  )
}

/** Tokens used day by day, and the shield of the sandbox. */
function Usage() {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const heights = [34, 58, 46, 82, 64, 28, 40]
  return (
    <div className={`${card} w-[300px] p-3.5 shadow-lg`}>
      <div className="flex items-end gap-2" style={{ height: 96 }}>
        {heights.map((height, index) => (
          <div key={index} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="w-full rounded-t-md" style={{ height: `${height}%`, background: index === 3 ? 'var(--accent-primary)' : 'var(--border-strong)' }} />
            <span className="text-[9px] text-[var(--text-muted)]">{days[index]}</span>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-2 py-1.5">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" />
        </svg>
        <span className="text-[10px] text-[var(--text-secondary)]">Sandbox</span>
      </div>
    </div>
  )
}

const VISUALS: Record<VisualId, () => ReactNode> = {
  look: Look, tasks: Tasks, bell: Bell, home: Home, settings: Settings, projects: Projects,
  genui: GenUi, pages: Pages, language: Language, skills: Skills, changes: Changes, usage: Usage
}

/** The picture of a change, on a soft stage. */
export function WhatsNewVisual({ id }: { id: VisualId }) {
  const Visual = VISUALS[id]
  return (
    <div className="relative flex h-[250px] items-center justify-center overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[linear-gradient(160deg,color-mix(in_srgb,var(--accent-primary)_9%,var(--surface-root)),var(--surface-root))]" aria-hidden="true">
      <Visual />
    </div>
  )
}
