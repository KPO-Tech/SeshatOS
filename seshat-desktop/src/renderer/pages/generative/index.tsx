import { useMemo, useState, type ComponentType } from 'react'
import { useNavigate } from 'react-router'
import { ChartLine, Components, Computer, Edit, LayoutOne, Lock, Magic, NetworkTree, Pic, Rocket, Shield, Table } from '@icon-park/react'
import { useTranslation } from 'react-i18next'
import { PROMPT_EXAMPLES } from '@renderer/components/chat/richblocks/catalog/examples'
import { ExampleGallery } from '@renderer/components/generative/ExampleGallery'
import { familiesOf, type Family } from '@renderer/components/generative/families'
import { SettingRow, SettingsCard, Toggle } from '@renderer/components/settings/kit'
import { useUserPreferences } from '@renderer/hooks/useUserPreferences'

// Generative UI: what the agent can draw in its answers (tables, figures, forms, quizzes, sketches of a page), the switch that allows it,
// the families it may use, requests to try it with, and every example it is taught from. It is laid out like Settings: the pages on the
// left, one page on the right with its header and its cards. The switch is the same preference as Settings > Answers.

type SectionId = 'overview' | 'families' | 'try' | 'all' | Family
type Mode = 'auto' | 'on' | 'off'
type IconComponent = ComponentType<{ theme?: 'outline' | 'filled'; size?: number | string; fill?: string }>

const ICONS: Record<SectionId, IconComponent> = {
  overview: Magic,
  families: Components,
  try: Rocket,
  all: LayoutOne,
  basics: Table,
  charts: ChartLine,
  forms: Edit,
  design: Pic,
  architecture: NetworkTree
}

const GENERAL: SectionId[] = ['overview', 'families', 'try']
const GALLERY: SectionId[] = ['all', 'basics', 'charts', 'forms', 'design', 'architecture']

export function GenerativeUiPage() {
  const { t } = useTranslation('generative')
  const navigate = useNavigate()
  const { prefs, busy, error, save } = useUserPreferences()
  const [active, setActive] = useState<SectionId>('overview')
  const enabled = prefs?.rich_answers_enabled !== false
  const modes = prefs?.rich_families ?? {}
  const words = prefs?.rich_family_words ?? {}

  const counts = useMemo(() => {
    const found: Record<string, number> = { all: PROMPT_EXAMPLES.length }
    for (const code of PROMPT_EXAMPLES) for (const family of familiesOf(code)) found[family] = (found[family] ?? 0) + 1
    return found
  }, [])

  // What each page is called and says, written out key by key.
  const meta: Record<SectionId, { label: string; description: string }> = {
    overview: { label: t('sections.overview.label'), description: t('sections.overview.description') },
    families: { label: t('sections.families.label'), description: t('sections.families.description') },
    try: { label: t('sections.try.label'), description: t('sections.try.description') },
    all: { label: t('sections.all.label'), description: t('sections.all.description') },
    basics: { label: t('sections.basics.label'), description: t('sections.basics.description') },
    charts: { label: t('sections.charts.label'), description: t('sections.charts.description') },
    forms: { label: t('sections.forms.label'), description: t('sections.forms.description') },
    design: { label: t('sections.design.label'), description: t('sections.design.description') },
    architecture: { label: t('sections.architecture.label'), description: t('sections.architecture.description') }
  }
  const Icon = ICONS[active]

  const families = [
    { id: 'charts', label: t('sections.charts.label'), hint: t('families.charts.hint'), tone: 'bg-blue-500/12 text-blue-500' },
    { id: 'forms', label: t('sections.forms.label'), hint: t('families.forms.hint'), tone: 'bg-emerald-500/12 text-emerald-500' },
    { id: 'design', label: t('sections.design.label'), hint: t('families.design.hint'), tone: 'bg-violet-500/12 text-violet-500' },
    { id: 'architecture', label: t('sections.architecture.label'), hint: t('families.architecture.hint'), tone: 'bg-orange-500/12 text-orange-500' }
  ] as const
  const modeLabels: Record<Mode, string> = { auto: t('families.modes.auto'), on: t('families.modes.on'), off: t('families.modes.off') }
  function chooseMode(family: string, mode: Mode) {
    if (busy) return
    const next: Record<string, 'on' | 'off'> = { ...modes }
    if (mode === 'auto') delete next[family]
    else next[family] = mode
    void save({ rich_families: next })
  }

  // Requests that bring out each family; the prompt is the text sent, in the language of the person.
  const tryIt = [
    { id: 'quiz', label: t('tryIt.items.quiz.label'), prompt: t('tryIt.items.quiz.prompt'), family: 'forms' },
    { id: 'cards', label: t('tryIt.items.cards.label'), prompt: t('tryIt.items.cards.prompt'), family: 'forms' },
    { id: 'essay', label: t('tryIt.items.essay.label'), prompt: t('tryIt.items.essay.prompt'), family: 'forms' },
    { id: 'sine', label: t('tryIt.items.sine.label'), prompt: t('tryIt.items.sine.prompt'), family: 'charts' },
    { id: 'parabola', label: t('tryIt.items.parabola.label'), prompt: t('tryIt.items.parabola.prompt'), family: 'charts' },
    { id: 'site', label: t('tryIt.items.site.label'), prompt: t('tryIt.items.site.prompt'), family: 'design' },
    { id: 'dashboard', label: t('tryIt.items.dashboard.label'), prompt: t('tryIt.items.dashboard.prompt'), family: 'design' },
    { id: 'architecture', label: t('tryIt.items.architecture.label'), prompt: t('tryIt.items.architecture.prompt'), family: 'architecture' }
  ] as const
  const TONE: Record<string, string> = { forms: 'bg-emerald-500/12 text-emerald-500', charts: 'bg-blue-500/12 text-blue-500', design: 'bg-violet-500/12 text-violet-500', architecture: 'bg-orange-500/12 text-orange-500' }
  const TRY_ICON: Record<string, IconComponent> = { forms: Edit, charts: ChartLine, design: Pic, architecture: NetworkTree }

  const navigation: Array<{ heading: string; items: SectionId[] }> = [
    { heading: t('nav.general'), items: GENERAL },
    { heading: t('nav.gallery'), items: GALLERY }
  ]

  return (
    <section className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="no-scrollbar flex w-[236px] shrink-0 flex-col overflow-y-auto border-r border-[var(--border-soft)] bg-[var(--surface-sidebar)] px-2.5 pb-3 pt-3.5">
        <div className="mb-3 flex items-center gap-2.5 px-2.5">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)] text-[var(--accent-primary)]">
            <Magic theme="filled" size={14} fill="currentColor" />
          </span>
          <span className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{t('page.title')}</span>
        </div>
        <nav className="grid gap-3.5" aria-label={t('page.title')}>
          {navigation.map(({ heading, items }) => (
            <div key={heading}>
              <div className="mb-1 px-2.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{heading}</div>
              <div className="grid gap-px">
                {items.map((id) => {
                  const ItemIcon = ICONS[id]
                  const selected = id === active
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-current={selected ? 'page' : undefined}
                      onClick={() => setActive(id)}
                      className={`flex h-8 cursor-pointer items-center gap-2.5 rounded-lg border-0 px-2.5 text-left text-[13px] font-medium ${selected ? 'bg-[color-mix(in_srgb,var(--accent-primary)_14%,transparent)] text-[var(--accent-primary)]' : 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'}`}
                    >
                      <ItemIcon theme="outline" size={16} />
                      <span className="min-w-0 flex-1 truncate">{meta[id].label}</span>
                      {GALLERY.includes(id) && <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{counts[id] ?? 0}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="no-scrollbar @container min-w-0 flex-1 overflow-y-auto px-8 pb-10 pt-6">
        <div className="mx-auto w-full max-w-[1000px] pb-6">
          <header className="flex items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)] text-[var(--accent-primary)]">
              <Icon theme="filled" size={24} fill="currentColor" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="m-0 text-[22px] font-semibold leading-tight text-[var(--text-primary)]">{meta[active].label}</h1>
              <p className="m-0 mt-1 text-[13px] leading-5 text-[var(--text-muted)]">{meta[active].description}</p>
            </div>
          </header>

          <div className="mt-5 grid gap-4">
            {error && <div className="text-[12.5px] text-red-500">{error}</div>}

            {active === 'overview' && (
              <>
                <SettingsCard>
                  <SettingRow title={t('overview.switch.title')} hint={enabled ? t('overview.switch.on') : t('overview.switch.off')}>
                    <Toggle
                      label={t('overview.switch.title')}
                      enabled={enabled}
                      onChange={(next) => {
                        if (!busy) void save({ rich_answers_enabled: next })
                      }}
                    />
                  </SettingRow>
                </SettingsCard>
                <SettingsCard title={t('overview.safety.title')}>
                  <SettingRow icon={<Shield theme="outline" size={18} />} title={t('overview.safety.pieces.title')} hint={t('overview.safety.pieces.hint')} />
                  <SettingRow icon={<Lock theme="outline" size={18} />} title={t('overview.safety.click.title')} hint={t('overview.safety.click.hint')} />
                  <SettingRow icon={<Computer theme="outline" size={18} />} title={t('overview.safety.local.title')} hint={t('overview.safety.local.hint')} />
                </SettingsCard>
              </>
            )}

            {active === 'families' && (
              <>
                <p className="m-0 text-[12.5px] leading-5 text-[var(--text-muted)]">{t('families.hint')}</p>
                <SettingsCard>
                  {families.map(({ id, label, hint, tone }) => {
                    const current: Mode = modes[id] ?? 'auto'
                    const FamilyIcon = ICONS[id]
                    return (
                      <div key={id} className="flex min-h-[64px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                            <FamilyIcon theme="outline" size={18} />
                          </span>
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold text-[var(--text-primary)]">{label}</div>
                            <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                              {hint}
                              {typeof words[id] === 'number' && ` · ${t('families.cost', { words: words[id] })}`}
                            </div>
                          </div>
                        </div>
                        <div role="radiogroup" aria-label={label} className="flex shrink-0 gap-0.5 rounded-lg bg-[var(--surface-hover)] p-0.5">
                          {(['auto', 'on', 'off'] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              role="radio"
                              aria-checked={current === mode}
                              disabled={!enabled || busy}
                              onClick={() => chooseMode(id, mode)}
                              className={`cursor-pointer rounded-md border-0 px-3 py-1 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50 ${current === mode ? 'bg-[var(--accent-primary)] text-white' : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                            >
                              {modeLabels[mode]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </SettingsCard>
              </>
            )}

            {active === 'try' && (
              <>
                <p className="m-0 text-[12.5px] leading-5 text-[var(--text-muted)]">{t('tryIt.hint')}</p>
                <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
                  {tryIt.map(({ id, label, prompt, family }) => {
                    const TryIcon = TRY_ICON[family]
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={!enabled}
                        title={enabled ? undefined : t('tryIt.disabled')}
                        onClick={() => navigate('/', { state: { prompt } })}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-3.5 text-left hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${TONE[family]}`}>
                          <TryIcon theme="outline" size={18} />
                        </span>
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="text-[13px] font-semibold text-[var(--text-primary)]">{label}</span>
                          <span className="line-clamp-3 text-[12px] leading-snug text-[var(--text-muted)]">{prompt}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {GALLERY.includes(active) && (
              <>
                <p className="m-0 text-[12.5px] leading-5 text-[var(--text-muted)]">{t('gallery.intro')}</p>
                <ExampleGallery key={active} family={active === 'all' ? 'all' : (active as Family)} initialFamily="all" />
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
