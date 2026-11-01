import type { ReactNode } from 'react'
import type { VisualId } from '@renderer/lib/whatsNew'

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
  return (
    <div className={`${card} w-[280px] p-3.5 shadow-lg`}>
      <div className="mb-2.5 flex gap-1.5">
        <span className={`flex size-5 items-center justify-center rounded-md ${accent} text-[11px] font-semibold text-white`}>1</span>
        <span className="flex size-5 items-center justify-center rounded-md border border-[var(--border-soft)] text-[11px] font-semibold text-[var(--accent-primary)]">2</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-[var(--text-primary)]">Downloading paperasse</span>
        <span className="text-[12px] text-[var(--text-muted)]">×</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border-soft)]">
        <div className={`h-full w-[62%] rounded-full ${accent}`} />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-[var(--text-muted)]">
        <span>Downloading the skills (1 of 2)</span>
        <span>12 s</span>
      </div>
      <div className="mt-1 font-mono text-[10.5px] text-[var(--text-faint)]">RO 62% · 2.1 MiB/s</div>
    </div>
  )
}

/** The bell with its count, and what it keeps. */
function Bell() {
  const items = [
    { title: 'paperasse is ready', text: 'The installation is done.', ok: true },
    { title: 'The agent has finished', text: 'Gradient descent illustration', ok: true },
    { title: 'Installing strix failed', text: 'Docker is not running.', ok: false }
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
  const colors = ['var(--accent-primary)', '#8b5cf6', '#22a55b', '#3b82f6', '#ec4899']
  return (
    <div className={`${card} flex h-[190px] w-[360px] flex-col justify-between p-3.5 shadow-lg`}>
      <div>
        <span className="inline-block rounded-full border border-[var(--accent-primary)] px-2 py-px text-[9px] font-semibold text-[var(--accent-primary)]">Your AI Workspace</span>
        <div className="mt-1.5 text-[16px] font-bold text-[var(--text-primary)]">
          What are we <span className="text-[var(--accent-primary)]">working on</span>?
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
        <span className="text-[10px] text-[var(--text-muted)]">Ask anything...</span>
        <span className="flex items-center gap-1.5 text-[9px] text-[var(--text-secondary)]">
          Generative UI
          <span className={`relative h-2.5 w-[18px] rounded-full ${accent}`}>
            <span className="absolute left-[9px] top-[1.5px] size-[7px] rounded-full bg-white" />
          </span>
        </span>
      </div>
    </div>
  )
}

/** One window of Settings: the list of pages, and cards that all look alike. */
function Settings() {
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
        <div className="text-[12px] font-semibold text-[var(--text-primary)]">Appearance</div>
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
          <div className={`mt-3 flex h-6 items-center justify-center rounded-md ${accent} text-[10px] font-semibold text-white`}>Start session</div>
        </div>
      ))}
    </div>
  )
}

const VISUALS: Record<VisualId, () => ReactNode> = { look: Look, tasks: Tasks, bell: Bell, home: Home, settings: Settings, projects: Projects }

/** The picture of a change, on a soft stage. */
export function WhatsNewVisual({ id }: { id: VisualId }) {
  const Visual = VISUALS[id]
  return (
    <div className="relative flex h-[250px] items-center justify-center overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[linear-gradient(160deg,color-mix(in_srgb,var(--accent-primary)_9%,var(--surface-root)),var(--surface-root))]" aria-hidden="true">
      <Visual />
    </div>
  )
}
